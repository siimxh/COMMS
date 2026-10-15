-- ============================================================================
-- Tabella "lead" (parte Venditore a lead, ottobre 2026) — da lanciare UNA volta
-- su un database che ha già schema.sql: Supabase → SQL Editor → New query →
-- incolla tutto → Run. Si può rilanciare senza danni.
-- (Lo stesso codice è anche dentro schema.sql.)
--
-- Finché questa tabella non c'è, il tool salva i lead nella riga "stato". Al
-- primo caricamento dopo averla creata li sposta qui da solo.
-- ============================================================================

create table if not exists public.lead (
  user_id     uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  id          text        not null,
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);

drop trigger if exists lead_updated_at on public.lead;
create trigger lead_updated_at
  before update on public.lead
  for each row execute function public.tocca_updated_at();

drop trigger if exists lead_storico on public.lead;
create trigger lead_storico
  after update or delete on public.lead
  for each row execute function public.registra_modifica();

alter table public.lead enable row level security;
revoke all on public.lead from anon;
grant select, insert, update, delete on public.lead to authenticated;

drop policy if exists "solo le mie righe" on public.lead;
create policy "solo le mie righe" on public.lead for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Foto notturna: ora salva anche i lead.
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
           'sessioni',     coalesce((select jsonb_agg(to_jsonb(x)) from public.sessioni x where x.user_id = u.user_id), '[]'::jsonb),
           'lead',         coalesce((select jsonb_agg(to_jsonb(l)) from public.lead l where l.user_id = u.user_id), '[]'::jsonb)
         )
  from (
    select user_id from public.stato
    union select user_id from public.appuntamenti
    union select user_id from public.sessioni
    union select user_id from public.lead
  ) u
  on conflict (user_id, giorno) do update set data = excluded.data, created_at = now();

  delete from public.foto_giornaliere where giorno < v_giorno - 14;
  delete from public.storico_modifiche where fatto_il < now() - interval '60 days';
end;
$$;

revoke execute on function public.fai_foto_giornaliera() from public, anon, authenticated;

-- Il tool vede subito la tabella nuova.
notify pgrst, 'reload schema';
