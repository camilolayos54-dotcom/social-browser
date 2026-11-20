const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MAX_BYTES = 1024 * 1024;
function fileFor(base, profileId, noteId) {
  if (!ID.test(profileId || '') || !ID.test(noteId || '')) throw new Error('Identificador de nota inválido.');
  return path.join(base, 'notes', profileId, `${noteId}.md`);
}
function revision(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
async function read(base, profileId, noteId) {
  const file = fileFor(base, profileId, noteId);
  try {
    const data = await fs.readFile(file, 'utf8');
    if (Buffer.byteLength(data) > MAX_BYTES) throw new Error('La nota supera el límite de 1 MB.');
    return { text: data, revision: revision(data), path: file };
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function write(base, profileId, noteId, text, expected) {
  const file = fileFor(base, profileId, noteId);
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_BYTES) throw new Error('El contenido de la nota es inválido o supera 1 MB.');
  const current = await read(base, profileId, noteId);
  if ((current?.revision || null) !== expected) throw new Error('El archivo cambió fuera de la aplicación. Vuelve a abrir la nota antes de guardar.');
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = path.join(path.dirname(file), `.${noteId}-${crypto.randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, text, { mode: 0o600, flag: 'wx' });
    // A new note must never overwrite an existing file, including during migration.
    if (!current) await fs.link(temporary, file);
    else {
      const latest = await read(base, profileId, noteId);
      if (!latest || latest.revision !== expected) throw new Error('El archivo cambió fuera de la aplicación. Vuelve a abrir la nota antes de guardar.');
      await fs.rename(temporary, file);
    }
  } finally { await fs.unlink(temporary).catch(() => {}); }
  return { text, revision: revision(text), path: file };
}
async function remove(base, profileId, noteId, expected) {
  const file = fileFor(base, profileId, noteId);
  const current = await read(base, profileId, noteId);
  if (current && current.revision !== expected) throw new Error('El archivo cambió fuera de la aplicación. Vuelve a abrir la nota antes de eliminarla.');
  if (current) await fs.unlink(file);
}
module.exports = { read, write, remove, fileFor };
