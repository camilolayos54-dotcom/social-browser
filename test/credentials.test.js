const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CredentialStore } = require('../credentials');

const secure = {
  isEncryptionAvailable: () => true,
  getSelectedStorageBackend: () => 'gnome_libsecret',
  encryptString: value => Buffer.from(value.split('').reverse().join('')),
  decryptString: value => value.toString().split('').reverse().join('')
};

test('persists encrypted credentials and clears them without exposing them in status', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'social-secret-'));
  try {
    const store = new CredentialStore(directory, secure, 'linux');
    assert.equal(store.set('openai', 'example-secret-value'), 'stored');
    assert.equal(store.status('openai'), 'stored');
    const stored = fs.readFileSync(path.join(directory, 'credential-openai.bin'));
    assert(!stored.toString().includes('example-secret-value'));
    assert.equal(fs.statSync(path.join(directory, 'credential-openai.bin')).mode & 0o777, 0o600);
    assert.equal(new CredentialStore(directory, secure, 'linux').get('openai'), 'example-secret-value');
    store.clear('openai');
    assert.equal(fs.existsSync(path.join(directory, 'credential-openai.bin')), false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('falls back to session-only storage without replacing a previously saved credential', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'social-secret-'));
  try {
    new CredentialStore(directory, secure, 'linux').set('x', 'previous-key');
    const noKeyring = { ...secure, getSelectedStorageBackend: () => 'basic_text' };
    const store = new CredentialStore(directory, noKeyring, 'linux');
    assert.equal(store.set('x', 'new-session-key'), 'session-previous');
    assert.equal(store.get('x'), 'new-session-key');
    assert.equal(new CredentialStore(directory, secure, 'linux').get('x'), 'previous-key');
    store.clear('x');
    assert.equal(fs.existsSync(path.join(directory, 'credential-x.bin')), false);
    assert.throws(() => store.set('other', 'value'), /Servicio desconocido/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
