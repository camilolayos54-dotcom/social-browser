const test = require('node:test');
const assert = require('node:assert/strict');
const { searchRecentPosts } = require('../search');

test('paginates and deduplicates results while retaining source links', async () => {
  const urls = [];
  const pages = [
    { data: [{ id: '123', text: 'Busco mudanza', created_at: '2026-11-19T12:00:00Z' }], meta: { next_token: 'next' } },
    { data: [{ id: '123', text: 'Duplicado' }, { id: '456', text: 'Necesito trasteo' }], meta: {} }
  ];
  const received = [];
  const count = await searchRecentPosts({ query: 'trasteo Medellín', token: 'test-token', onPage: posts => received.push(...posts), fetchImpl: async (url, options) => { urls.push(url); assert.equal(options.headers.Authorization, 'Bearer test-token'); return { ok: true, json: async () => pages.shift() }; } });
  assert.equal(count, 2);
  assert.equal(new URL(urls[1]).searchParams.get('next_token'), 'next');
  assert.deepEqual(received.map(post => post.url), ['https://x.com/i/web/status/123', 'https://x.com/i/web/status/456']);
});

test('surfaces access errors and retains previously emitted pages', async () => {
  const received = [];
  let calls = 0;
  await assert.rejects(searchRecentPosts({ query: 'mudanza', token: 'test-token', onPage: posts => received.push(...posts), fetchImpl: async () => ++calls === 1 ? { ok: true, json: async () => ({ data: [{ id: '123', text: 'Primero' }], meta: { next_token: 'next' } }) } : { ok: false, status: 429, text: async () => JSON.stringify({ detail: 'Límite alcanzado' }) } }), /429.*Límite alcanzado/);
  assert.equal(received.length, 1);
});

test('requires a token and accepts cancellation', async () => {
  await assert.rejects(searchRecentPosts({ query: 'mudanza', onPage() {} }), /X_BEARER_TOKEN/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(searchRecentPosts({ query: 'mudanza', token: 'test', signal: controller.signal, onPage() {}, fetchImpl: async (_, { signal }) => { signal.throwIfAborted(); } }), { name: 'AbortError' });
});
