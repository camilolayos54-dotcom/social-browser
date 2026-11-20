function parseEndpoint(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) throw new Error('Introduce la URL completa del servidor compatible.');
  let endpoint;
  try { endpoint = new URL(value.trim()); }
  catch { throw new Error('La URL del servidor compatible no es válida.'); }
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error('La URL debe usar HTTP o HTTPS y no contener credenciales.');
  endpoint.hash = '';
  return endpoint;
}

function bindCredential(endpointValue, key) {
  const endpoint = parseEndpoint(endpointValue);
  if (typeof key !== 'string' || !key.trim() || key.length > 3500 || /[\r\n]/.test(key)) throw new Error('Introduce una clave válida.');
  return JSON.stringify({ origin: endpoint.origin, key: key.trim() });
}

function credentialForEndpoint(store, endpointValue) {
  const endpoint = parseEndpoint(endpointValue);
  if (store.status('compatible') === 'missing') return '';
  let saved;
  try { saved = JSON.parse(store.get('compatible')); }
  catch { throw new Error('No se pudo leer la clave del servidor compatible.'); }
  if (!saved || typeof saved.key !== 'string' || typeof saved.origin !== 'string') throw new Error('La clave del servidor compatible está dañada.');
  if (saved.origin !== endpoint.origin) throw new Error('La clave guardada pertenece a otro servidor. Actualízala o elimínala antes de continuar.');
  return saved.key;
}
module.exports = { parseEndpoint, bindCredential, credentialForEndpoint };
