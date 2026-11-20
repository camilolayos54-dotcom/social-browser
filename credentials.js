const fs = require('node:fs');
const path = require('node:path');

const services = { openai: 'OPENAI_API_KEY', x: 'X_BEARER_TOKEN', compatible: null };
class CredentialStore {
  constructor(directory, safeStorage, platform = process.platform) {
    this.directory = directory;
    this.safeStorage = safeStorage;
    this.platform = platform;
    this.memory = new Map();
  }

  filename(service) {
    if (!Object.hasOwn(services, service)) throw new Error('Servicio desconocido.');
    return path.join(this.directory, `credential-${service}.bin`);
  }

  secureStorageAvailable() {
    try {
      if (!this.safeStorage.isEncryptionAvailable()) return false;
      if (this.platform === 'linux') return !['basic_text', 'unknown'].includes(this.safeStorage.getSelectedStorageBackend());
      return true;
    } catch { return false; }
  }

  status(service) {
    const file = this.filename(service);
    if (this.memory.has(service)) return 'session';
    if (fs.existsSync(file)) return 'stored';
    return services[service] && process.env[services[service]] ? 'environment' : 'missing';
  }

  get(service) {
    const file = this.filename(service);
    if (this.memory.has(service)) return this.memory.get(service);
    if (fs.existsSync(file)) {
      if (!this.secureStorageAvailable()) throw new Error('El almacén seguro del sistema no está disponible para abrir la clave guardada.');
      try { return this.safeStorage.decryptString(fs.readFileSync(file)); }
      catch { throw new Error('No se pudo abrir la clave guardada en el almacén seguro.'); }
    }
    return services[service] ? (process.env[services[service]] || '') : '';
  }

  set(service, value) {
    const file = this.filename(service);
    if (typeof value !== 'string' || !value.trim() || value.length > 4096 || /[\r\n]/.test(value)) throw new Error('Introduce una clave válida.');
    const key = value.trim();
    if (!this.secureStorageAvailable()) {
      const hasStoredKey = fs.existsSync(file);
      this.memory.set(service, key);
      return hasStoredKey ? 'session-previous' : 'session';
    }
    const encrypted = this.safeStorage.encryptString(key);
    const temporary = `${file}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporary, encrypted, { mode: 0o600 });
      fs.renameSync(temporary, file);
      this.memory.delete(service);
    } finally { try { fs.unlinkSync(temporary); } catch {} }
    return 'stored';
  }

  clear(service) {
    const file = this.filename(service);
    if (fs.existsSync(file)) fs.unlinkSync(file);
    this.memory.delete(service);
    return this.status(service);
  }
}
module.exports = { CredentialStore };
