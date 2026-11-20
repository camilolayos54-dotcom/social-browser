const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareOpportunity } = require('../opportunities');

test('deduplicates a source link and updates its description without changing its identity', () => {
  const first = prepareOpportunity([], { url: 'https://example.com/post/1#fragment', summary: 'Solicita mudanza', reason: 'Pide el servicio', date: '' }, 'Asistente');
  const original = first.records[0];
  const second = prepareOpportunity(first.records, { url: 'https://example.com/post/1', summary: 'Solicita trasteo', reason: 'Busca proveedor', date: '2026-11-19' }, 'Manual');
  assert.equal(second.updated, true);
  assert.equal(second.records.length, 1);
  assert.equal(second.records[0].id, original.id);
  assert.equal(second.records[0].createdAt, original.createdAt);
  assert.equal(second.records[0].reason, 'Busca proveedor');
});

test('rejects invalid source links, missing descriptions and excess results', () => {
  const entry = { url: 'https://example.com/', summary: 'Texto', reason: 'Motivo', date: '' };
  assert.throws(() => prepareOpportunity([], { ...entry, url: 'file:///etc/passwd' }, 'Asistente'), /HTTP o HTTPS/);
  assert.throws(() => prepareOpportunity([], { ...entry, url: 'https://user:pass@example.com/' }, 'Asistente'), /credenciales/);
  assert.throws(() => prepareOpportunity([], { ...entry, reason: ' ' }, 'Asistente'), /motivo/);
  const full = Array.from({ length: 500 }, (_, index) => ({ url: `https://example.com/${index}` }));
  assert.throws(() => prepareOpportunity(full, entry, 'Asistente'), /500/);
});
