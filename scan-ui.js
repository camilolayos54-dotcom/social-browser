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
      article.append(open, keep);
    }
    $('scan-results').append(article);
  }
}
$('scan-button').onclick = () => { scanDialogOwner = profile(); renderFacebookScan(); $('facebook-scan-dialog').showModal(); };
$('scan-close').onclick = () => $('facebook-scan-dialog').close();
$('scan-stop').onclick = () => { if (facebookScanJob?.owner === scanDialogOwner) { facebookScanJob.cancelled = true; facebookScanJob.wake?.(); } };
$('scan-start').onclick = async () => { const minutes = Number($('scan-minutes').value); const result = await startFacebookScan(profile(), $('scan-phrase').value, Math.round(minutes * 60)); if (result.startsWith('Error:')) $('scan-status').textContent = result; };
async function startFacebookScan(owner, phrase, seconds, caller = null) {
  if (facebookScanJob) return 'Error: ya hay una detección en curso.';
  if (owner !== profile()) return 'Error: selecciona primero el perfil que quieres revisar.';
  if (typeof phrase !== 'string' || !phrase.trim() || phrase.length > 120 || !Number.isFinite(seconds) || seconds < 1 || seconds > 300) return 'Error: indica una frase y una duración de hasta cinco minutos.';
  const selected = owner.tabs[owner.activeTab], view = selected && views.get(selected.id);
  if (!view || !facebookPage(selected.url)) return 'Error: abre primero Facebook en la pestaña activa.';
  const job = { owner, selected, view, phrase: phrase.trim(), cancelled: false, wake: null };
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
      observe: async term => { ensureBound(); return await view.executeJavaScript(`(${pageObservation.toString()})('scan_matches', ${JSON.stringify({ phrase: term })})`); },
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
