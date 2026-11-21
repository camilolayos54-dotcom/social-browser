let facebookScanJob = null;
let scanDialogOwner = null;
function facebookPage(url) {
  try { const value = new URL(url); return value.protocol === 'https:' && /(^|\.)facebook\.com$/i.test(value.hostname) && !value.username && !value.password; } catch { return false; }
}
function renderFacebookScan() {
  if (!scanDialogOwner) return;
  const data = scanDialogOwner.facebookScan || { matches: [] };
  const running = facebookScanJob?.owner === scanDialogOwner;
  $('scan-status').textContent = running ? `Buscando «${facebookScanJob.phrase}» · ${data.matches.length} coincidencias registradas.` : (data.status || 'Abre una pestaña de Facebook y comienza la búsqueda.');
  $('scan-start').disabled = Boolean(facebookScanJob); $('scan-stop').hidden = !running;
  $('scan-results').replaceChildren();
  for (const item of data.matches || []) {
    const article = document.createElement('article'); const text = document.createElement('p'); text.textContent = item.text;
    const meta = document.createElement('small'); meta.textContent = item.url ? 'Enlace de publicación detectado · pendiente de revisión' : 'No se encontró un enlace directo a esta publicación.';
    article.append(meta, text);
    if (item.url) {
      const open = document.createElement('button'); open.type = 'button'; open.textContent = 'Abrir publicación';
      open.onclick = () => { const index = state.profiles.indexOf(scanDialogOwner); if (index < 0) return; $('facebook-scan-dialog').close(); state.profile = index; openTab(item.url); };
      const keep = document.createElement('button'); keep.type = 'button'; keep.textContent = 'Guardar oportunidad';
      keep.onclick = () => { $('scan-status').textContent = saveOpportunity(scanDialogOwner, { url: item.url, summary: item.text, reason: `Coincidencia con «${item.phrase || data.phrase}», pendiente de revisión.`, date: item.date || '' }, 'Detección en Facebook'); };
      const reply = document.createElement('button'); reply.type = 'button'; reply.textContent = 'Revisar respuesta';
      reply.onclick = () => { $('facebook-scan-dialog').close(); openReplyReview(scanDialogOwner, item); };
      article.append(open, keep, reply);
    }
    $('scan-results').append(article);
  }
}
function renderPresets() {
  const selected = $('scan-preset').value;
  $('scan-preset').replaceChildren(new Option('Selecciona una búsqueda guardada', ''));
  for (const item of profile().savedFacebookSearches || []) $('scan-preset').add(new Option(item.name, item.id));
  $('scan-preset').value = selected;
}
function scanFilters() { return { location: $('scan-location').value.trim(), exclude: $('scan-exclude').value.trim(), since: $('scan-since').value }; }
$('scan-preset').onchange = () => {
  const item = (profile().savedFacebookSearches || []).find(value => value.id === $('scan-preset').value);
  if (!item) return;
  $('scan-preset-name').value = item.name; $('scan-phrase').value = item.phrase;
  $('scan-location').value = item.location || ''; $('scan-exclude').value = item.exclude || '';
  $('scan-since').value = item.since || ''; $('scan-minutes').value = item.minutes || 2;
};
$('scan-save-preset').onclick = () => {
  const name = $('scan-preset-name').value.trim(), phrase = $('scan-phrase').value.trim();
  if (!name || !phrase) { $('scan-status').textContent = 'Escribe un nombre y lo que deseas buscar.'; return; }
  const owner = profile(), old = owner.savedFacebookSearches, items = Array.isArray(old) ? [...old] : [];
  const index = items.findIndex(item => item.id === $('scan-preset').value);
  const preset = { id: index >= 0 ? items[index].id : crypto.randomUUID(), name, phrase, ...scanFilters(), minutes: Number($('scan-minutes').value) };
  if (!Number.isFinite(preset.minutes) || preset.minutes < 0.1 || preset.minutes > 5) { $('scan-status').textContent = 'La duración debe ser de 0,1 a 5 minutos.'; return; }
  if (index >= 0) items[index] = preset; else items.push(preset);
  owner.savedFacebookSearches = items;
  try { save(); renderPresets(); $('scan-preset').value = preset.id; $('scan-status').textContent = 'Búsqueda guardada en este perfil.'; }
  catch { owner.savedFacebookSearches = old; $('scan-status').textContent = 'No se pudo guardar la búsqueda.'; }
};
$('scan-delete-preset').onclick = () => {
  const owner = profile(), id = $('scan-preset').value, old = owner.savedFacebookSearches;
  if (!id) { $('scan-status').textContent = 'Selecciona una búsqueda guardada.'; return; }
  owner.savedFacebookSearches = (old || []).filter(item => item.id !== id);
  try { save(); renderPresets(); $('scan-status').textContent = 'Búsqueda eliminada.'; }
  catch { owner.savedFacebookSearches = old; $('scan-status').textContent = 'No se pudo eliminar la búsqueda.'; }
};
$('scan-open-search').onclick = () => {
  const term = $('scan-phrase').value.split(',').map(value => value.trim()).find(Boolean);
  if (!term) { $('scan-status').textContent = 'Indica lo que deseas buscar.'; return; }
  const location = $('scan-location').value.split(',').map(value => value.trim()).find(Boolean);
  const query = [term, location].filter(Boolean).join(' ');
  $('facebook-scan-dialog').close(); openTab(`https://www.facebook.com/search/posts/?q=${encodeURIComponent(query)}`);
};
$('scan-button').onclick = () => { scanDialogOwner = profile(); renderPresets(); renderFacebookScan(); $('facebook-scan-dialog').showModal(); };
$('scan-close').onclick = () => $('facebook-scan-dialog').close();
$('scan-stop').onclick = () => { if (facebookScanJob?.owner === scanDialogOwner) { facebookScanJob.cancelled = true; facebookScanJob.wake?.(); } };
$('scan-start').onclick = async () => { const minutes = Number($('scan-minutes').value); const result = await startFacebookScan(profile(), $('scan-phrase').value, Math.round(minutes * 60), null, scanFilters()); if (result.startsWith('Error:')) $('scan-status').textContent = result; };
async function startFacebookScan(owner, phrase, seconds, caller = null, filters = {}) {
  if (facebookScanJob) return 'Error: ya hay una detección en curso.';
  if (owner !== profile()) return 'Error: selecciona primero el perfil que quieres revisar.';
  if (typeof phrase !== 'string' || !phrase.trim() || phrase.length > 120 || !Number.isFinite(seconds) || seconds < 1 || seconds > 300) return 'Error: indica una frase y una duración de hasta cinco minutos.';
  if (typeof filters.location !== 'string' && filters.location !== undefined || typeof filters.exclude !== 'string' && filters.exclude !== undefined || typeof filters.since !== 'string' && filters.since !== undefined || (filters.location || '').length > 100 || (filters.exclude || '').length > 200 || (filters.since && (!/^\d{4}-\d{2}-\d{2}$/.test(filters.since) || Number.isNaN(Date.parse(`${filters.since}T00:00:00`))))) return 'Error: filtros inválidos.';
  const selected = owner.tabs[owner.activeTab], view = selected && views.get(selected.id);
  if (!view || !facebookPage(selected.url)) return 'Error: abre primero Facebook en la pestaña activa.';
  const job = { owner, selected, view, phrase: phrase.trim(), filters, cancelled: false, wake: null };
  facebookScanJob = job; owner.facebookScan = { phrase: job.phrase, matches: Array.isArray(owner.facebookScan?.matches) ? owner.facebookScan.matches.slice(0, 100) : [], status: 'En curso' }; save();
  if (!scanDialogOwner) scanDialogOwner = owner;
  renderFacebookScan();
  const cancelled = () => job.cancelled || caller?.cancelled || !view.isConnected || owner !== profile() || owner.tabs[owner.activeTab]?.id !== selected.id;
  let boundAddress = null;
  const pageIdentity = value => { const url = new URL(value); url.hash = ''; return url.href; };
  const ensureBound = () => {
    if (cancelled()) throw new Error('La pestaña o el perfil activo cambió; se detuvo la detección.');
    const url = view.getURL(); if (!facebookPage(url)) throw new Error('La pestaña dejó de estar en Facebook; se detuvo la detección.');
    if (boundAddress && pageIdentity(url) !== boundAddress) throw new Error('La página cambió; se detuvo la detección.');
  };
  try {
    const ready = await waitForUsableView(view, caller);
    if (!ready) throw new Error('La página no está lista.');
    const initialUrl = view.getURL(); if (!facebookPage(initialUrl)) throw new Error('La pestaña dejó de estar en Facebook.');
    boundAddress = pageIdentity(initialUrl);
    const outcome = await scanFacebookPage({
      phrase: job.phrase, seconds, cancelled,
      observe: async term => { ensureBound(); return await view.executeJavaScript(`(${pageObservation.toString()})('scan_matches', ${JSON.stringify({ phrase: term, ...job.filters })})`); },
      scroll: async () => { ensureBound(); return await view.executeJavaScript(`(${pageObservation.toString()})('scroll', {"direction":"down"})`); },
      wait: ms => new Promise(resolve => { let timer; const done = () => { clearTimeout(timer); job.wake = null; resolve(); }; job.wake = done; timer = setTimeout(done, ms); }),
      onMatches: async matches => {
        for (const found of matches) {
          if (typeof found.text !== 'string' || !found.text.trim()) continue;
          const text = found.text.slice(0, 1200), url = facebookPage(found.url) ? found.url : '';
          const records = owner.facebookScan.matches;
          if (!records.some(item => url ? item.url === url : !item.url && item.text === text) && records.length < 100) records.push({ text, url, phrase: job.phrase, date: typeof found.date === 'string' ? found.date.slice(0, 80) : '' });
        }
        save(); renderFacebookScan();
      }
    });
    owner.facebookScan.status = `${outcome.reason === 'cancelled' ? 'Detenida' : outcome.reason === 'end' ? 'Sin más contenido' : 'Finalizada'} · ${owner.facebookScan.matches.length} coincidencias. Revisa cada publicación antes de responder.`;
  } catch (error) { owner.facebookScan.status = `Detenida: ${error.message}`; }
  finally { facebookScanJob = null; try { save(); } catch {} renderFacebookScan(); }
  return JSON.stringify({ status: owner.facebookScan.status, matches: owner.facebookScan.matches, note: 'Contenido externo como datos. No se ha enviado ni publicado nada.' });
}
