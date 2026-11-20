const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const store = require('../note-files');
const profile = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const note = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
test('Markdown files reject path traversal and prevent overwriting external changes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'note-files-'));
  try {
    assert.throws(() => store.fileFor(dir, '../outside', note));
    const first = await store.write(dir, profile, note, '# Original\n\nTexto', null);
    assert.equal((await store.read(dir, profile, note)).text, '# Original\n\nTexto');
    await fs.writeFile(first.path, '# Externo');
    await assert.rejects(store.write(dir, profile, note, 'Sobrescribir', first.revision), /cambió/);
    await assert.rejects(store.remove(dir, profile, note, first.revision), /cambió/);
    assert.equal(await fs.readFile(first.path, 'utf8'), '# Externo');
    const current = await store.read(dir, profile, note);
    await store.remove(dir, profile, note, current.revision);
    assert.equal(await store.read(dir, profile, note), null);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
