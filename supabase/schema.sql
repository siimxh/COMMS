-- ============================================================================
-- Chiamate Tracker — database Supabase
--
-- Come si usa: Supabase → SQL Editor → New query → incolla tutto → Run.
-- Si può rilanciare senza danni (crea solo quello che manca, aggiorna funzioni
-- e regole).
--
-- Tre tabelle di lavoro (ognuno vede e modifica SOLO le sue righe, regole RLS):
--   appuntamenti  una riga per appuntamento (Setter e Venditore)
--   sessioni      una riga per sessione di chiamate, con le chiamate dentro
--   stato         un blocco unico per utente: pipeline, sessione in corso,
--                 da richiamare, Round Recupero, obiettivi, tema, ...
--
-- Due tabelle di sicurezza (solo lettura per l'utente, le scrive il database):
--   foto_giornaliere   copia completa dei dati di ogni utente, ogni notte,
--                      ultimi 14 giorni
--   storico_modifiche  valore precedente di ogni appuntamento modificato o
--                      cancellato (dal tool o via chat), ultimi 60 giorni,
--                      per poter annullare
--
-- Date: i timestamp sono timestamptz (istante preciso). Il tool li converte al
-- confine: gli orari "locali" (scheduledAt, presentedAt) sono letti e scritti
-- come ora italiana (Europe/Rome); le date semplici (follow-up, rate) restano
-- date senza ora.
-- ============================================================================

-- Ora italiana per tutto quello che il database mostra o calcola.
alter database postgres set timezone to 'Europe/Rome';

-- ---------------------------------------------------------------------------
-- Funzioni di servizio
-- ---------------------------------------------------------------------------

-- Aggiorna updated_at a ogni modifica.
create or replace function public.tocca_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- appuntamenti
-- ---------------------------------------------------------------------------
create table if not exists public.appuntamenti (
  user_id                 uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id                      text        not null,           -- id del tool (appt_...)
  role                    text        not null check (role in ('setter', 'venditore')),
  client_name             text        not null default '',
  phone                   text,
  created_at              timestamptz not null default now(), -- inserimento (conta i "fissati")
  scheduled_at            timestamptz,                     -- data e ora dell'appuntamento
  presented_status        text,                            -- Setter: no, confirmed24h, presented, no_show, annullato, spostato
  presented_at            timestamptz,
  closed                  boolean     not null default false,
  closed_at               timestamptz,
  deal_stage              text,                            -- Venditore: vedi DEAL_STAGES in app.js
  cash_collected          numeric(12,2) not null default 0,
  total_sold              numeric(12,2) not null default 0,
  installments            jsonb       not null default '[]'::jsonb, -- rate: [{ id, label, amount, dueDate, paid, paidDate }]
  notes                   jsonb       not null default '[]'::jsonb, -- note: [{ id, text, author, createdAt }]
  next_follow_up_date     date,
  linked_appointment_id   text,
  rescheduled_from_id     text,
  rescheduled_to_id       text,
  recovered_from_no_show  boolean     not null default false,
  recovered_from_role     text,
  extra                   jsonb       not null default '{}'::jsonb, -- campi del Round Conferme e futuri
  updated_at              timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists appuntamenti_scheduled_idx on public.appuntamenti (user_id, scheduled_at);
create index if not exists appuntamenti_follow_up_idx on public.appuntamenti (user_id, next_follow_up_date);

drop trigger if exists appuntamenti_updated_at on public.appuntamenti;
create trigger appuntamenti_updated_at
  before update on public.appuntamenti
  for each row execute function public.tocca_updated_at();

-- ---------------------------------------------------------------------------
-- sessioni
-- ---------------------------------------------------------------------------
create table if not exists public.sessioni (
  user_id          uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id               text        not null,           -- id del tool (sess_...)
  number           integer,
  pipeline_id      text,
  pipeline_name    text,
  started_at       timestamptz,
  ended_at         timestamptz,
  paused_total_ms  bigint      not null default 0,
  calls            jsonb       not null default '[]'::jsonb, -- le chiamate, come nel tool
  extra            jsonb       not null default '{}'::jsonb, -- skips, secondCallPending, ...
  updated_at       timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists sessioni_started_idx on public.sessioni (user_id, started_at);

drop trigger if exists sessioni_updated_at on public.sessioni;
create trigger sessioni_updated_at
  before update on public.sessioni
  for each row execute function public.tocca_updated_at();

-- ---------------------------------------------------------------------------
-- stato (una riga per utente)
-- ---------------------------------------------------------------------------
create table if not exists public.stato (
  user_id     uuid        primary key default auth.uid() references auth.users(id) on delete cascade,
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

drop trigger if exists stato_updated_at on public.stato;
create trigger stato_updated_at
  before update on public.stato
  for each row execute function public.tocca_updated_at();

-- ---------------------------------------------------------------------------
-- foto_giornaliere (copia di sicurezza notturna, 14 giorni)
-- ---------------------------------------------------------------------------
create table if not exists public.foto_giornaliere (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  giorno      date        not null,
  data        jsonb       not null,   -- { stato, appuntamenti: [...], sessioni: [...] }
  created_at  timestamptz not null default now(),
  primary key (user_id, giorno)
);

-- ---------------------------------------------------------------------------
-- storico_modifiche (valore precedente degli appuntamenti, 60 giorni)
-- ---------------------------------------------------------------------------
create table if not exists public.storico_modifiche (
  id           bigint      generated always as identity primary key,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  tabella      text        not null,
  riga_id      text        not null,
  operazione   text        not null,      -- UPDATE o DELETE
  prima        jsonb       not null,      -- la riga com'era prima
  dopo         jsonb,                     -- la riga dopo (null se cancellata)
  origine      text        not null,      -- tool, chat, admin
  fatto_il     timestamptz not null default now()
);

create index if not exists storico_riga_idx on public.storico_modifiche (user_id, riga_id, fatto_il desc);

create or replace function public.registra_modifica()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origine text := coalesce(
    nullif(current_setting('app.origine', true), ''),
    case when auth.uid() is null then 'admin' else 'tool' end
  );
begin
  if tg_op = 'UPDATE' then
    -- Niente riga di storico se è cambiato solo updated_at.
    if (to_jsonb(old) - 'updated_at') = (to_jsonb(new) - 'updated_at') then
      return new;
    end if;
    insert into public.storico_modifiche (user_id, tabella, riga_id, operazione, prima, dopo, origine)
    values (old.user_id, tg_table_name, old.id, 'UPDATE', to_jsonb(old), to_jsonb(new), v_origine);
    return new;
  else
    insert into public.storico_modifiche (user_id, tabella, riga_id, operazione, prima, dopo, origine)
    values (old.user_id, tg_table_name, old.id, 'DELETE', to_jsonb(old), null, v_origine);
    return old;
  end if;
end;
$$;

drop trigger if exists appuntamenti_storico on public.appuntamenti;
create trigger appuntamenti_storico
  after update or delete on public.appuntamenti
  for each row execute function public.registra_modifica();

-- ---------------------------------------------------------------------------
-- Regole di accesso (RLS): ognuno solo le sue righe. Chi non ha fatto login
-- (ruolo anon) non vede niente.
-- ---------------------------------------------------------------------------
alter table public.appuntamenti      enable row level security;
alter table public.sessioni          enable row level security;
alter table public.stato             enable row level security;
alter table public.foto_giornaliere  enable row level security;
alter table public.storico_modifiche enable row level security;

revoke all on public.appuntamenti, public.sessioni, public.stato,
              public.foto_giornaliere, public.storico_modifiche from anon;

-- Tabelle di lavoro: lettura e scrittura delle proprie righe.
do $$
declare t text;
begin
  foreach t in array array['appuntamenti', 'sessioni', 'stato'] loop
    execute format('drop policy if exists "solo le mie righe" on public.%I', t);
    execute format(
      'create policy "solo le mie righe" on public.%I for all to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;

-- Tabelle di sicurezza: solo lettura delle proprie righe.
revoke insert, update, delete on public.foto_giornaliere, public.storico_modifiche from authenticated;

drop policy if exists "leggo le mie foto" on public.foto_giornaliere;
create policy "leggo le mie foto" on public.foto_giornaliere
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "leggo il mio storico" on public.storico_modifiche;
create policy "leggo il mio storico" on public.storico_modifiche
  for select to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Foto notturna + pulizia (pg_cron)
-- ---------------------------------------------------------------------------
create or replace function public.fai_foto_giornaliera()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_giorno date := (now() at time zone 'Europe/Rome')::date;
begin
  insert into public.foto_giornaliere (user_id, giorno, data)
  select u.user_id,
         v_giorno,
         jsonb_build_object(
           'stato',        (select s.data from public.stato s where s.user_id = u.user_id),
           'appuntamenti', coalesce((select jsonb_agg(to_jsonb(a)) from public.appuntamenti a where a.user_id = u.user_id), '[]'::jsonb),
           'sessioni',     coalesce((select jsonb_agg(to_jsonb(x)) from public.sessioni x where x.user_id = u.user_id), '[]'::jsonb)
         )
  from (
    select user_id from public.stato
    union select user_id from public.appuntamenti
    union select user_id from public.sessioni
  ) u
  on conflict (user_id, giorno) do update set data = excluded.data, created_at = now();

  delete from public.foto_giornaliere where giorno < v_giorno - 14;
  delete from public.storico_modifiche where fatto_il < now() - interval '60 days';
end;
$$;

revoke execute on function public.fai_foto_giornaliera() from public, anon, authenticated;

create extension if not exists pg_cron;

-- Ogni notte alle 01:00 UTC (le 2 o le 3 in Italia).
select cron.schedule('foto-giornaliera', '0 1 * * *', 'select public.fai_foto_giornaliera()');
