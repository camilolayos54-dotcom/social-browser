const test = require('node:test');
const assert = require('node:assert/strict');
const { ask } = require('../assistant');

test('continues an Ollama conversation with the actual tool result', async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => requests.length === 1 ? { message: { role: 'assistant', tool_calls: [{ function: { name: 'open_network', arguments: { network: 'Facebook' } } }] } } : { message: { role: 'assistant', content: 'Borrador listo' } } };
  };
  try {
    const first = await ask({ provider: 'ollama', model: 'local', prompt: 'Abre Facebook y redacta', results: [] });
    assert.equal(first.calls[0].name, 'open_network');
    const second = await ask({ provider: 'ollama', model: 'local', prompt: 'Abre Facebook y redacta', continuation: first.continuation, results: [{ id: '0', name: 'open_network', output: 'Se abrió Facebook' }] });
    assert.equal(second.text, 'Borrador listo');
    assert(requests[1].messages.some(message => message.role === 'tool' && message.content === 'Se abrió Facebook'));
  } finally { global.fetch = originalFetch; }
});

test('preserves all OpenAI tool turns when continuing more than once', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  const requests = [];
  process.env.OPENAI_API_KEY = 'test';
  global.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ output: [{ type: 'function_call', call_id: `call-${requests.length}`, name: 'open_network', arguments: '{"network":"Facebook"}' }] }) };
  };
  try {
    const base = { provider: 'openai', model: 'test', prompt: 'Abre redes' };
    const first = await ask({ ...base, results: [] });
    const second = await ask({ ...base, continuation: first.continuation, results: [{ id: 'call-1', output: 'Primera abierta' }] });
    await ask({ ...base, continuation: second.continuation, results: [{ id: 'call-2', output: 'Segunda abierta' }] });
    assert.equal(requests[0].parallel_tool_calls, false);
    assert.deepEqual(requests[2].input.filter(item => item.type === 'function_call_output').map(item => item.call_id), ['call-1', 'call-2']);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
  }
});
