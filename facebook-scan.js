// Scan the bound page until the deadline, user cancellation, or repeated end-of-content.
async function scanFacebookPage({ phrase, seconds, observe, scroll, wait, cancelled, onMatches, onProgress, intervalMs = 2000, maxStalled = 8, now = Date.now }) {
  if (typeof phrase !== 'string' || !phrase.trim() || phrase.length > 120 || !Number.isFinite(seconds) || seconds < 1 || seconds > 300) throw new Error('Frase o duración inválida.');
  const stepMs = Number.isFinite(intervalMs) && intervalMs >= 150 && intervalMs <= 5000 ? intervalMs : 2000;
  const deadline = now() + seconds * 1000;
  let stalled = 0, passes = 0, scannedTotal = 0;
  while (!cancelled() && now() < deadline) {
    const result = await observe(phrase.trim());
    if (result.error) throw new Error(result.error);
    scannedTotal += Number(result.scanned) || 0;
    passes++;
    await onMatches(result.matches || []);
    if (typeof onProgress === 'function') onProgress({ passes, scanned: Number(result.scanned) || 0, scannedTotal, stalled });
    if (cancelled() || now() >= deadline) break;
    const movement = await scroll();
    stalled = movement.moved ? 0 : stalled + 1;
    if (stalled >= maxStalled) return { reason: 'end', passes, scannedTotal };
    await wait(Math.min(stepMs, Math.max(0, deadline - now())));
  }
  return { reason: cancelled() ? 'cancelled' : 'completed', passes, scannedTotal };
}
if (typeof module !== 'undefined') module.exports = { scanFacebookPage };
