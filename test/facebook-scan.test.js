const test = require('node:test');
const assert = require('node:assert/strict');
const { scanFacebookPage } = require('../facebook-scan');
test('a bounded scan records visible matches and ends at its deadline', async () => {
  let clock = 0, observations = 0, scrolls = 0; const collected = [];
  const result = await scanFacebookPage({ phrase: 'trasteos medellín', seconds: 5, now: () => clock, cancelled: () => false,
    observe: async phrase => { observations++; return { matches: [{ text: phrase }] }; },
    scroll: async () => { scrolls++; return { moved: true }; },
    wait: async ms => { clock += ms; }, onMatches: async records => collected.push(...records) });
  assert.equal(result.reason, 'completed'); assert.equal(clock, 5000); assert.equal(observations, 3); assert.equal(scrolls, 3); assert.equal(collected.length, 3);
});
test('scan supports stopping and does not keep scrolling after cancellation', async () => {
  let cancelled = false, scrolls = 0;
  const result = await scanFacebookPage({ phrase:'hola', seconds:120, cancelled:() => cancelled,
    observe: async () => ({ matches:[] }), onMatches: async () => { cancelled = true; },
    scroll:async () => { scrolls++; return { moved:true }; }, wait: async () => {} });
  assert.equal(result.reason, 'cancelled'); assert.equal(scrolls, 0);
});
