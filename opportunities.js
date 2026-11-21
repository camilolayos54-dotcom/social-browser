function prepareOpportunity(records, input, source) {
  if (!input || typeof input !== 'object') throw new Error('Faltan datos de la oportunidad.');
  if (typeof input.url !== 'string' || input.url.length > 2048) throw new Error('Introduce un enlace válido.');
  let url;
  try { url = new URL(input.url.trim()); } catch { throw new Error('Introduce un enlace válido.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('El enlace debe ser HTTP o HTTPS y no incluir credenciales.');
  url.hash = '';
  for (const [name, value, limit] of [['resumen', input.summary, 1200], ['motivo', input.reason, 1200], ['fecha', input.date, 80]]) {
    if (typeof value !== 'string' || value.length > limit || (name !== 'fecha' && !value.trim())) throw new Error(`Revisa el ${name} de la oportunidad.`);
  }
  const current = Array.isArray(records) ? records : [];
  const existing = current.find(record => record.url === url.href);
  if (!existing && current.length >= 500) throw new Error('Este perfil alcanzó el límite de 500 oportunidades.');
  const record = {
    ...(existing || {}),
    id: existing?.id || crypto.randomUUID(),
    url: url.href,
    summary: input.summary.trim(),
    reason: input.reason.trim(),
    date: input.date.trim(),
    source,
    createdAt: existing?.createdAt || new Date().toISOString()
  };
  return { records: [record, ...current.filter(item => item.url !== url.href)], updated: Boolean(existing) };
}
if (typeof module !== 'undefined') module.exports = { prepareOpportunity };
