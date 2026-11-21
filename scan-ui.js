let facebookScanJob = null;
let scanDialogOwner = null;
let scanResultsVisible = true;
const DEFAULT_FREQUENT_TERMS = ['necesito mudanza', 'trasteo', 'barbacha', 'trasteos', 'mudanzas', 'acarreos', 'fletes'];
const DEFAULT_FREQUENT_LOCATIONS = ['Medellín', 'Envigado', 'Bello', 'Itagüí', 'Sabaneta'];
function facebookPage(url) {
  try { const value = new URL(url); return value.protocol === 'https:' && /(^|\.)facebook\.com$/i.test(value.hostname) && !value.username && !value.password; } catch { return false; }
}
function openScanBar() {
  const dialog = $('facebook-scan-dialog');
  if (!dialog.open) dialog.show();
}
function showScanAlert(addedCount, totalCount, previewText) {
  const banner = $('scan-alert-banner');
  const label = $('scan-alert-text');
  if (!banner || !label) return;
  const snippet = String(previewText || '').slice(0, 75);
  label.textContent = `🎯 ¡He encontrado ${addedCount === 1 ? '1 nuevo resultado' : `${addedCount} nuevos resultados`}! (${totalCount} en total)${snippet ? ` · «${snippet}…»` : ''}`;
  banner.hidden = false;
  try { window.desktop?.notify?.('Social Browser · Nuevo resultado', snippet || `Se encontraron ${totalCount} coincidencias.`); } catch {}
}
function ensureFrequentLists(owner) {
  if (!Array.isArray(owner.frequentScanTerms) || !owner.frequentScanTerms.length) {
    owner.frequentScanTerms = DEFAULT_FREQUENT_TERMS.map(word => ({ word, count: 1 }));
  }
  if (!Array.isArray(owner.frequentLocations) || !owner.frequentLocations.length) {
    owner.frequentLocations = DEFAULT_FREQUENT_LOCATIONS.map(word => ({ word, count: 1 }));
  }
}
function recordFrequentWords(owner, phraseText, locationText) {
  ensureFrequentLists(owner);
  const bump = (list, raw) => {
    for (const part of String(raw || '').split(',').map(v => v.trim()).filter(Boolean)) {
      const existing = list.find(item => item.word.toLocaleLowerCase() === part.toLocaleLowerCase());
      if (existing) existing.count = (existing.count || 1) + 1;
      else list.push({ word: part, count: 1 });
    }
    list.sort((a, b) => (b.count || 0) - (a.count || 0));
    if (list.length > 20) list.length = 20;
  };
  bump(owner.frequentScanTerms, phraseText);
  bump(owner.frequentLocations, locationText);
}
function renderFrequentChips() {
  const owner = scanDialogOwner || profile();
  ensureFrequentLists(owner);
  const toggleWordInInput = (input, word) => {
    const parts = input.value.split(',').map(v => v.trim()).filter(Boolean);
    const idx = parts.findIndex(v => v.toLocaleLowerCase() === word.toLocaleLowerCase());
    if (idx >= 0) parts.splice(idx, 1); else parts.push(word);
    input.value = parts.join(', ');
    renderFrequentChips();
  };
  const renderRow = (containerId, list, inputId) => {
    const container = $(containerId);
    const input = $(inputId);
    if (!container || !input) return;
    const active = new Set(input.value.split(',').map(v => v.trim().toLocaleLowerCase()).filter(Boolean));
    container.replaceChildren(...list.slice(0, 10).map(item => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `scan-chip${active.has(item.word.toLocaleLowerCase()) ? ' active' : ''}`;
      chip.textContent = item.word;
      chip.title = `Añadir o quitar «${item.word}»`;
      chip.onclick = () => toggleWordInInput(input, item.word);
      return chip;
    }));
  };
  renderRow('scan-frequent-terms', owner.frequentScanTerms, 'scan-phrase');
  renderRow('scan-frequent-locations', owner.frequentLocations, 'scan-location');
}
function renderFacebookScan() {
  if (!scanDialogOwner) return;
  const data = scanDialogOwner.facebookScan || { matches: [] };
  const running = Boolean(facebookScanJob && facebookScanJob.owner === scanDialogOwner);
  const progressText = running && facebookScanJob.passes
    ? ` · Pasada ${facebookScanJob.passes} · ${facebookScanJob.scannedTotal || 0} pub. leídas`
    : '';
  $('scan-status').textContent = running
    ? (facebookScanJob.cancelled ? 'Deteniendo búsqueda…' : `⚡ Buscando «${facebookScanJob.phrase}»${progressText} · ${data.matches.length} coincidencias.`)
    : (data.status || 'Abre una pestaña de Facebook y comienza la búsqueda.');
  $('scan-start').disabled = Boolean(facebookScanJob);
  $('scan-stop').hidden = !running;
  $('scan-stop').disabled = Boolean(running && facebookScanJob.cancelled);
  const matches = [...(data.matches || [])].sort((a, b) => (b.intent === 'client' ? 1 : 0) - (a.intent === 'client' ? 1 : 0));
  if ($('scan-results-count')) $('scan-results-count').textContent = String(matches.length);
  if ($('scan-save-all')) $('scan-save-all').hidden = !matches.some(m => m.url);
  if ($('scan-clear-results')) $('scan-clear-results').hidden = !matches.length || running;
  $('scan-results').hidden = !scanResultsVisible;
  $('scan-results').replaceChildren();
  for (const item of matches) {
    const article = document.createElement('article'); const text = document.createElement('p'); text.textContent = item.text;
    const meta = document.createElement('small');
    if (item.intent === 'client') {
      const badge = document.createElement('span'); badge.className = 'intent-badge intent-client'; badge.textContent = '🔥 Posible cliente';
      meta.append(badge);
    } else if (item.intent === 'ad') {
      const badge = document.createElement('span'); badge.className = 'intent-badge intent-ad'; badge.textContent = 'Anuncio';
      meta.append(badge);
    }
    if (item.matchedTerm) {
      const kw = document.createElement('span'); kw.className = 'intent-badge'; kw.textContent = `🔑 ${item.matchedTerm}`;
      meta.append(kw);
    }
    const locTag = item.location ? ` · ${item.location}` : '';
    meta.append(document.createTextNode((item.url ? 'Enlace detectado · pendiente de revisión' : 'Sin enlace directo · revisión manual') + locTag));
    article.append(meta, text);
    if (item.url) {
      const open = document.createElement('button'); open.type = 'button'; open.textContent = 'Abrir publicación';
      open.onclick = () => { const index = state.profiles.indexOf(scanDialogOwner); if (index < 0) return; state.profile = index; openTab(item.url); };
      const keep = document.createElement('button'); keep.type = 'button'; keep.textContent = 'Guardar oportunidad';
      keep.onclick = () => { $('scan-status').textContent = saveOpportunity(scanDialogOwner, { url: item.url, summary: item.text, reason: `Coincidencia con «${item.phrase || data.phrase}», pendiente de revisión.`, date: item.date || '' }, 'Detección en Facebook'); };
      const reply = document.createElement('button'); reply.type = 'button'; reply.textContent = 'Revisar respuesta';
      reply.onclick = () => { $('facebook-scan-dialog').close(); openReplyReview(scanDialogOwner, item); };
      article.append(open, keep, reply);
    }
    $('scan-results').append(article);
  }
  renderFrequentChips();
}
function renderPresets() {
  const selected = $('scan-preset').value;
  $('scan-preset').replaceChildren(new Option('Selecciona una búsqueda guardada', ''));
  for (const item of profile().savedFacebookSearches || []) $('scan-preset').add(new Option(item.name, item.id));
  $('scan-preset').value = selected;
  window.refreshSavedSearches?.();
}
function scanFilters() {
  return {
    location: $('scan-location').value.trim(),
    exclude: $('scan-exclude').value.trim(),
    since: $('scan-since').value,
    onlyClients: Boolean($('scan-only-clients')?.checked)
  };
}
$('scan-phrase').oninput = renderFrequentChips;
$('scan-location').oninput = renderFrequentChips;
if ($('scan-toggle-results')) {
  $('scan-toggle-results').onclick = () => { scanResultsVisible = !scanResultsVisible; renderFacebookScan(); };
}
if ($('scan-alert-view')) {
  $('scan-alert-view').onclick = () => { scanResultsVisible = true; $('scan-alert-banner').hidden = true; renderFacebookScan(); $('scan-results').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
}
if ($('scan-alert-dismiss')) {
  $('scan-alert-dismiss').onclick = () => { $('scan-alert-banner').hidden = true; };
}
$('scan-preset').onchange = () => {
  const item = (profile().savedFacebookSearches || []).find(value => value.id === $('scan-preset').value);
  if (!item) return;
  $('scan-preset-name').value = item.name; $('scan-phrase').value = item.phrase;
  $('scan-location').value = item.location || ''; $('scan-exclude').value = item.exclude || '';
  $('scan-since').value = item.since || ''; $('scan-minutes').value = item.minutes || 2;
  renderFrequentChips();
};
$('scan-save-preset').onclick = () => {
  const name = $('scan-preset-name').value.trim(), phrase = $('scan-phrase').value.trim();
  if (!name || !phrase) { $('scan-status').textContent = 'Escribe un nombre y lo que deseas buscar.'; return; }
  const owner = profile(), old = owner.savedFacebookSearches, items = Array.isArray(old) ? [...old] : [];
  const index = items.findIndex(item => item.id === $('scan-preset').value);
  const filters = scanFilters();
  const preset = { id: index >= 0 ? items[index].id : crypto.randomUUID(), name, phrase, ...filters, minutes: Number($('scan-minutes').value) };
  if (!Number.isFinite(preset.minutes) || preset.minutes < 0.1 || preset.minutes > 5) { $('scan-status').textContent = 'La duración debe ser de 0,1 a 5 minutos.'; return; }
  if (index >= 0) items[index] = preset; else items.push(preset);
  owner.savedFacebookSearches = items;
  recordFrequentWords(owner, phrase, filters.location);
  try { save(); renderPresets(); renderFrequentChips(); $('scan-preset').value = preset.id; $('scan-status').textContent = 'Búsqueda guardada en este perfil.'; }
  catch { owner.savedFacebookSearches = old; $('scan-status').textContent = 'No se pudo guardar la búsqueda.'; }
};
$('scan-delete-preset').onclick = () => {
  const owner = profile(), id = $('scan-preset').value, old = owner.savedFacebookSearches;
  if (!id) { $('scan-status').textContent = 'Selecciona una búsqueda guardada.'; return; }
  owner.savedFacebookSearches = (old || []).filter(item => item.id !== id);
  try { save(); renderPresets(); $('scan-status').textContent = 'Búsqueda eliminada.'; }
  catch { owner.savedFacebookSearches = old; $('scan-status').textContent = 'No se pudo eliminar la búsqueda.'; }
};
if ($('scan-save-all')) {
  $('scan-save-all').onclick = () => {
    const owner = scanDialogOwner || profile();
    const matches = (owner.facebookScan?.matches || []).filter(item => item.url);
    let savedCount = 0;
    for (const item of matches) {
      const msg = saveOpportunity(owner, { url: item.url, summary: item.text, reason: `Coincidencia con «${item.phrase || owner.facebookScan?.phrase || ''}» (${item.location || 'Facebook'}).`, date: item.date || '' }, 'Detección en Facebook');
      if (!msg.startsWith('Error:')) savedCount++;
    }
    $('scan-status').textContent = `${savedCount} oportunidades guardadas en el perfil.`;
  };
}
if ($('scan-clear-results')) {
  $('scan-clear-results').onclick = () => {
    if (facebookScanJob) return;
    const owner = scanDialogOwner || profile();
    if (owner.facebookScan) { owner.facebookScan.matches = []; owner.facebookScan.status = 'Resultados limpiados.'; }
    if ($('scan-alert-banner')) $('scan-alert-banner').hidden = true;
    try { save(); } catch {}
    renderFacebookScan();
  };
}
$('scan-open-search').onclick = () => {
  const term = $('scan-phrase').value.split(',').map(value => value.trim()).find(Boolean);
  if (!term) { $('scan-status').textContent = 'Indica lo que deseas buscar.'; return; }
  const location = $('scan-location').value.split(',').map(value => value.trim()).find(Boolean);
  const query = [term, location].filter(Boolean).join(' ');
  recordFrequentWords(profile(), $('scan-phrase').value, $('scan-location').value);
  try { save(); } catch {}
  renderFrequentChips();
  openTab(`https://www.facebook.com/search/posts/?q=${encodeURIComponent(query)}`);
};
if ($('scan-open-all-searches')) {
  $('scan-open-all-searches').onclick = () => {
    const terms = $('scan-phrase').value.split(',').map(value => value.trim()).filter(Boolean).slice(0, 5);
    if (!terms.length) { $('scan-status').textContent = 'Indica al menos una palabra clave.'; return; }
    const location = $('scan-location').value.split(',').map(value => value.trim()).find(Boolean);
    recordFrequentWords(profile(), $('scan-phrase').value, $('scan-location').value);
    try { save(); } catch {}
    renderFrequentChips();
    for (const term of terms) {
      const query = [term, location].filter(Boolean).join(' ');
      openTab(`https://www.facebook.com/search/posts/?q=${encodeURIComponent(query)}`);
    }
    $('scan-status').textContent = `Se abrieron ${terms.length} búsquedas en Facebook.`;
  };
}
async function runSavedFacebookSearch(id) {
  const owner = profile(), preset = (owner.savedFacebookSearches || []).find(item => item.id === id);
  if (!preset) return;
  if (facebookScanJob) { scanDialogOwner = owner; renderFacebookScan(); openScanBar(); $('scan-status').textContent = 'Ya hay una búsqueda en curso.'; return; }
  const term = preset.phrase.split(',').map(value => value.trim()).find(Boolean);
  const location = (preset.location || '').split(',').map(value => value.trim()).find(Boolean);
  if (!term) return;
  openTab(`https://www.facebook.com/search/posts/?q=${encodeURIComponent([term, location].filter(Boolean).join(' '))}`);
  scanDialogOwner = owner; renderPresets(); $('scan-preset').value = preset.id; $('scan-preset').dispatchEvent(new Event('change')); renderFacebookScan();
  openScanBar();
  const result = await startFacebookScan(owner, preset.phrase, Math.round(Number(preset.minutes || 2) * 60), null, { location: preset.location || '', exclude: preset.exclude || '', since: preset.since || '', onlyClients: Boolean(preset.onlyClients) });
  if (result.startsWith('Error:')) $('scan-status').textContent = result;
}
function stopFacebookScan() {
  if (!facebookScanJob) return;
  facebookScanJob.cancelled = true;
  facebookScanJob.cancelWait?.();
  facebookScanJob.wake?.();
  facebookScanJob.abortStep?.();
  renderFacebookScan();
}
$('scan-button').onclick = () => { scanDialogOwner = profile(); renderPresets(); renderFacebookScan(); openScanBar(); };
$('scan-close').onclick = () => $('facebook-scan-dialog').close();
$('scan-stop').onclick = stopFacebookScan;
$('scan-start').onclick = async () => { const minutes = Number($('scan-minutes').value); const result = await startFacebookScan(profile(), $('scan-phrase').value, Math.round(minutes * 60), null, scanFilters()); if (result.startsWith('Error:')) $('scan-status').textContent = result; };
async function startFacebookScan(owner, phrase, seconds, caller = null, filters = {}) {
  if (facebookScanJob) return 'Error: ya hay una detección en curso.';
  if (owner !== profile()) return 'Error: selecciona primero el perfil que quieres revisar.';
  if (typeof phrase !== 'string' || !phrase.trim() || phrase.length > 500 || !Number.isFinite(seconds) || seconds < 1 || seconds > 300) return 'Error: indica una frase y una duración de hasta cinco minutos.';
  if (typeof filters.location !== 'string' && filters.location !== undefined || typeof filters.exclude !== 'string' && filters.exclude !== undefined || typeof filters.since !== 'string' && filters.since !== undefined || (filters.location || '').length > 100 || (filters.exclude || '').length > 200 || (filters.since && (!/^\d{4}-\d{2}-\d{2}$/.test(filters.since) || Number.isNaN(Date.parse(`${filters.since}T00:00:00`))))) return 'Error: filtros inválidos.';
  const selected = owner.tabs[owner.activeTab], view = selected && views.get(selected.id);
  if (!view || !facebookPage(selected.url)) return 'Error: abre primero Facebook en la pestaña activa.';
  const intervalMs = Number($('scan-speed')?.value) || 650;
  const job = { owner, selected, view, phrase: phrase.trim(), filters, cancelled: false, wake: null, cancelWait: null, abortStep: null, passes: 0, scannedTotal: 0 };
  const previousScan = owner.facebookScan;
  recordFrequentWords(owner, job.phrase, filters.location || '');
  facebookScanJob = job; owner.facebookScan = { phrase: job.phrase, location: filters.location || '', matches: Array.isArray(previousScan?.matches) ? previousScan.matches.slice(0, 300) : [], status: 'En curso' };
  try { save(); } catch { owner.facebookScan = previousScan; facebookScanJob = null; return 'Error: no se pudo guardar la búsqueda. Revisa el espacio disponible.'; }
  if (!scanDialogOwner) scanDialogOwner = owner;
  renderFacebookScan();
  const cancelled = () => job.cancelled || caller?.cancelled || !view.isConnected || owner !== profile() || owner.tabs[owner.activeTab]?.id !== selected.id;
  const raceCancel = promise => new Promise((resolve, reject) => {
    if (cancelled()) { reject(new Error('Detenida por el usuario.')); return; }
    let settled = false;
    job.abortStep = () => { if (!settled) { settled = true; reject(new Error('Detenida por el usuario.')); } };
    promise.then(
      val => { if (!settled) { settled = true; job.abortStep = null; resolve(val); } },
      err => { if (!settled) { settled = true; job.abortStep = null; reject(err); } }
    );
  });
  let boundAddress = null;
  const pageIdentity = value => { const url = new URL(value); url.hash = ''; return url.href; };
  const ensureBound = () => {
    if (cancelled()) throw new Error('Detenida por el usuario.');
    const url = view.getURL(); if (!facebookPage(url)) throw new Error('La pestaña dejó de estar en Facebook; se detuvo la detección.');
    if (boundAddress && pageIdentity(url) !== boundAddress) throw new Error('La página cambió; se detuvo la detección.');
  };
  try {
    const ready = await waitForUsableView(view, job);
    if (cancelled()) {
      owner.facebookScan.status = `Detenida · ${owner.facebookScan.matches.length} coincidencias. Revisa cada publicación antes de responder.`;
      return JSON.stringify({ status: owner.facebookScan.status, matches: owner.facebookScan.matches, note: 'Contenido externo como datos. No se ha enviado ni publicado nada.' });
    }
    if (!ready) throw new Error('La página no está lista.');
    const initialUrl = view.getURL(); if (!facebookPage(initialUrl)) throw new Error('La pestaña dejó de estar en Facebook.');
    boundAddress = pageIdentity(initialUrl);
    const outcome = await scanFacebookPage({
      phrase: job.phrase, seconds, intervalMs, cancelled,
      observe: async term => { ensureBound(); return await raceCancel(view.executeJavaScript(`(${pageObservation.toString()})('scan_matches', ${JSON.stringify({ phrase: term, ...job.filters })})`)); },
      scroll: async () => { ensureBound(); return await raceCancel(view.executeJavaScript(`(${pageObservation.toString()})('scroll', {"direction":"down"})`)); },
      wait: ms => new Promise(resolve => { if (cancelled()) { resolve(); return; } let timer; const done = () => { clearTimeout(timer); job.wake = null; resolve(); }; job.wake = done; timer = setTimeout(done, ms); }),
      onProgress: info => {
        job.passes = info.passes;
        job.scannedTotal = info.scannedTotal;
        renderFacebookScan();
      },
      onMatches: async matches => {
        let added = 0;
        let firstNewText = '';
        for (const found of matches) {
          if (typeof found.text !== 'string' || !found.text.trim()) continue;
          const text = found.text.slice(0, 1200), url = facebookPage(found.url) ? found.url : '';
          const records = owner.facebookScan.matches;
          if (!records.some(item => url ? item.url === url : !item.url && item.text === text) && records.length < 300) {
            records.push({ text, url, phrase: job.phrase, matchedTerm: found.matchedTerm || '', location: job.filters.location || '', date: typeof found.date === 'string' ? found.date.slice(0, 80) : '', intent: found.intent || 'neutral', foundAt: new Date().toISOString() });
            added++;
            if (!firstNewText) firstNewText = text;
          }
        }
        if (added > 0) {
          scanResultsVisible = true;
          showScanAlert(added, owner.facebookScan.matches.length, firstNewText);
        }
        save(); renderFacebookScan();
      }
    });
    owner.facebookScan.status = `${outcome.reason === 'cancelled' ? 'Detenida' : outcome.reason === 'end' ? 'Sin más contenido' : 'Finalizada'} · ${outcome.scannedTotal || 0} pub. revisadas · ${owner.facebookScan.matches.length} coincidencias.`;
  } catch (error) {
    owner.facebookScan.status = job.cancelled
      ? `Detenida · ${job.scannedTotal || 0} pub. revisadas · ${owner.facebookScan.matches.length} coincidencias.`
      : `Detenida: ${error.message}`;
  } finally {
    facebookScanJob = null;
    try { save(); } catch {}
    renderFacebookScan();
  }
  return JSON.stringify({ status: owner.facebookScan.status, matches: owner.facebookScan.matches, note: 'Contenido externo como datos. No se ha enviado ni publicado nada.' });
}
