/* Copia ANONIMA di un backup del tool, per le prove sul database.
 *
 * Uso:   node tools/anonimizza-backup.js backup.json copia-anonima.json
 *
 * Sostituisce nomi, telefoni e testi scritti a mano (note) con valori finti,
 * lascia identici numeri, date, esiti e collegamenti: le statistiche della
 * copia sono le stesse del backup vero. Il file prodotto NON va comunque nel
 * repo (salvalo fuori, es. nello scratchpad).
 */
const fs = require('fs');

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Uso: node tools/anonimizza-backup.js backup.json copia-anonima.json');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(input, 'utf8'));

// Stesso nome vero -> stesso nome finto (così gli spostamenti restano collegati).
const names = new Map();
const fakeName = real => {
  const key = String(real || '').trim().toLowerCase();
  if (!key) return real;
  if (!names.has(key)) names.set(key, 'Lead ' + String(names.size + 1).padStart(3, '0'));
  return names.get(key);
};
let phoneN = 0;
const fakePhone = p => (p ? '+39 300 000 ' + String(++phoneN).padStart(4, '0') : p);
const fakeNotes = notes => (Array.isArray(notes) ? notes.map((n, i) => Object.assign({}, n, { text: 'Nota di prova ' + (i + 1) })) : notes);

(data.appointments || []).forEach(a => {
  a.clientName = fakeName(a.clientName);
  a.phone = fakePhone(a.phone);
  a.notes = fakeNotes(a.notes);
});
(data.recoveryRound || []).forEach(r => {
  r.clientName = fakeName(r.clientName);
  r.phone = fakePhone(r.phone);
  r.notes = fakeNotes(r.notes);
});
(data.callbacks || []).forEach(c => {
  c.leadName = fakeName(c.leadName);
  c.phone = fakePhone(c.phone);
});
(data.callRecordings || []).forEach((r, i) => {
  r.label = 'Registrazione ' + (i + 1);
  r.url = 'https://example.com/registrazione-' + (i + 1);
});

fs.writeFileSync(output, JSON.stringify(data, null, 2));
console.log(`Copia anonima scritta in ${output}: ${names.size} nomi e ${phoneN} telefoni sostituiti.`);
