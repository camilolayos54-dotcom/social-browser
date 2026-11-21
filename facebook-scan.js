// Scan the bound page until the deadline, user cancellation, or repeated end-of-content.
async function scanFacebookPage({ phrase, seconds, observe, scroll, wait, cancelled, onMatches, now = Date.now }) {
  if (typeof phrase !== 'string' || !phrase.trim() || phrase.length > 120 || !Number.isFinite(seconds) || seconds < 1 || seconds > 300) throw new Error('Frase o duración inválida.');
  const deadline = now() + seconds * 1000;
  let stalled = 0, passes = 0;
  while (!cancelled() && now() < deadline) {
    const result = await observe(phrase.trim());
    if (result.error) throw new Error(result.error);
    await onMatches(result.matches || []); passes++;
    if (cancelled() || now() >= deadline) break;
    const movement = await scroll();
    stalled = movement.moved ? 0 : stalled + 1;
    if (stalled >= 5) return { reason: 'end', passes };
    await wait(Math.min(2000, Math.max(0, deadline - now())));
  }
  return { reason: cancelled() ? 'cancelled' : 'completed', passes };
}
if (typeof module !== 'undefined') module.exports = { scanFacebookPage };
