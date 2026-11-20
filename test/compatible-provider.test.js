const test = require('node:test');
const assert = require('node:assert/strict');
const { parseEndpoint, bindCredential, credentialForEndpoint } = require('../compatible-provider');
const { ask } = require('../assistant');

test('binds a configured key to its server origin', () => {
  const bound = bindCredential('https://example.com/v1/chat/completions', 'secret-key');
  const store = { status: () => 'stored', get: () => bound };
  assert.equal(credentialForEndpoint(store, 'https://example.com/v1/other'), 'secret-key');
  assert.throws(() => credentialForEndpoint(store, 'https://elsewhere.example/v1/chat/completions'), /otro servidor/);
  assert.throws(() => parseEndpoint('file:///etc/passwd'), /HTTP o HTTPS/);
  assert.throws(() => parseEndpoint('https://user:password@example.com/'), /credenciales/);
  assert.equal(credentialForEndpoint({ status: () => 'missing' }, 'http://127.0.0.1:1234/v1/chat/completions'), '');
});

test('continues compatible chat calls with their tool-call IDs', async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, headers: options.headers, redirect: options.redirect, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ choices: [{ message: requests.length === 1 ? { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'open_network', arguments: '{"network":"Facebook"}' } }] } : { role: 'assistant', content: 'Hecho' } }] }) };
  };
  try {
    const base = { provider: 'compatible', model: 'model', prompt: 'Abre Facebook', endpoint: 'https://example.com/v1/chat/completions', compatibleTools: true, apiKey: 'test-key' };
    const first = await ask({ ...base, results: [] });
    assert.equal(first.calls[0].id, 'call-1');
    const second = await ask({ ...base, continuation: first.continuation, results: [{ id: 'call-1', name: 'open_network', output: 'Pestaña abierta' }] });
    assert.equal(second.text, 'Hecho');
    assert.equal(requests[0].headers.Authorization, 'Bearer test-key');
    assert.equal(requests[0].redirect, 'error');
    assert(requests[1].body.messages.some(message => message.role === 'tool' && message.tool_call_id === 'call-1' && message.content === 'Pestaña abierta'));
  } finally { global.fetch = originalFetch; }
});

test('can use an unauthenticated text-only compatible model', async () => {
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (_url, options) => { request = { headers: options.headers, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Borrador' } }] }) }; };
  try {
    const response = await ask({ provider: 'compatible', model: 'model', prompt: 'Redacta', endpoint: 'http://127.0.0.1:1234/v1/chat/completions', compatibleTools: false, apiKey: '', results: [] });
    assert.equal(response.text, 'Borrador');
    assert.equal(request.body.tools, undefined);
    assert.equal(request.headers.Authorization, undefined);
  } finally { global.fetch = originalFetch; }
});

test('reports an empty answer and rejects malformed tool calls', async () => {
  const originalFetch = global.fetch;
  let message = { role: 'assistant', content: '' };
  global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message }] }) });
  const request = { provider: 'compatible', model: 'model', prompt: 'Consulta', endpoint: 'http://127.0.0.1:1234/v1/chat/completions', apiKey: '', results: [] };
  try {
    await assert.rejects(ask(request), /no devolvió texto ni acciones/);
    message = { role: 'assistant', tool_calls: [{ type: 'function', function: { name: 'open_network', arguments: '{}' } }] };
    await assert.rejects(ask(request), /herramientas inválidas/);
    message = { role: 'assistant', content: null, refusal: 'No puedo completar la solicitud.' };
    assert.equal((await ask(request)).text, 'No puedo completar la solicitud.');
  } finally { global.fetch = originalFetch; }
});
