(() => {
  const el = id => document.getElementById(id);
  const listFor = owner => Array.isArray(owner.notes) ? owner.notes : (owner.notes = []);
  let owner = profile(), selectedId = null, revision = null, dirty = false, busy = false, checking = false;
  let deleting = null;
  const displayTitle = note => note.title || 'Sin título';
  const encode = (title, body) => `# ${title || 'Sin título'}\n\n${body}`;
  function decode(text, fallback) {
    const match = text.match(/^# ([^\r\n]*)\r?\n(?:\r?\n)?/);
    return match ? { title: match[1] === 'Sin título' && !fallback ? '' : match[1], body: text.slice(match[0].length) } : { title: fallback || '', body: text };
  }
  function localDate(iso) {
    const d = new Date(iso); if (Number.isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function status(message, error = false) { el('note-error').textContent = error ? message : ''; el('note-save-status').textContent = error ? '' : message; }
  function renderList() {
    const notes = listFor(owner), query = el('notes-search').value.toLocaleLowerCase();
    el('notes-profile').textContent = owner.name;
    el('notes-count').textContent = notes.length;
    el('notes-list').replaceChildren();
    el('notes-empty').hidden = notes.length > 0;
    for (const note of [...notes].reverse()) {
      if (!`${note.title} ${note.body}`.toLocaleLowerCase().includes(query)) continue;
      const button = document.createElement('button'); button.type = 'button'; button.className = `vault-note${selectedId === note.id ? ' selected' : ''}`;
      const title = document.createElement('strong'); title.textContent = displayTitle(note);
      const preview = document.createElement('small'); preview.textContent = note.body?.replace(/\s+/g, ' ').slice(0, 55) || 'Nota vacía';
      button.append(title, preview); button.onclick = () => void selectNote(note.id); el('notes-list').append(button);
    }
  }
  // Text is always inserted as text nodes, never interpreted as HTML.
  function inline(parent, text) {
    const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g; let at = 0;
    for (const match of text.matchAll(pattern)) {
      parent.append(document.createTextNode(text.slice(at, match.index)));
      const token = match[0]; const tag = token.startsWith('**') ? 'strong' : token.startsWith('`') ? 'code' : 'em';
      const node = document.createElement(tag); node.textContent = token.slice(tag === 'strong' ? 2 : 1, tag === 'strong' ? -2 : -1); parent.append(node); at = match.index + token.length;
    }
    parent.append(document.createTextNode(text.slice(at)));
  }
  function preview() {
    const target = el('note-preview'); target.replaceChildren();
    const title = el('note-title').value.trim();
    if (title) { const h = document.createElement('h1'); h.textContent = title; target.append(h); }
    let list = null, code = null;
    for (const line of el('note-body').value.split('\n')) {
      if (/^```/.test(line)) { if (code) code = null; else { code = document.createElement('pre'); const child = document.createElement('code'); code.append(child); target.append(code); } list = null; continue; }
      if (code) { code.firstChild.textContent += `${line}\n`; continue; }
      const heading = line.match(/^(#{1,6})\s+(.+)$/), item = line.match(/^\s*[-*]\s+(.*)$/);
      if (heading) { list = null; const node = document.createElement(`h${Math.min(heading[1].length + 1, 6)}`); inline(node, heading[2]); target.append(node); }
      else if (item) { if (!list) { list = document.createElement('ul'); target.append(list); } const node = document.createElement('li'); inline(node, item[1]); list.append(node); }
      else { list = null; if (line.trim()) { const node = document.createElement('p'); inline(node, line); target.append(node); } }
    }
  }
  function clearEditor() {
    selectedId = null; revision = null; dirty = false; el('note-form').reset(); el('delete-note').disabled = true;
    el('note-filename').textContent = 'Nueva nota'; el('note-path').textContent = 'Las notas se guardan como archivos Markdown en este equipo.';
    el('note-reminder-state').textContent = ''; el('discard-note').hidden = true; status(''); preview(); renderList();
  }
  async function selectNote(id) {
    if (busy || (dirty && !(await saveNote()))) return;
    const note = listFor(owner).find(n => n.id === id); if (!note) return;
    busy = true;
    try {
      const file = await window.desktop.readNote(owner.id, id);
      if (!file) throw new Error('No se encontró el archivo Markdown de esta nota.');
      const decoded = decode(file.text, note.title); Object.assign(note, decoded); save();
      selectedId = id; revision = file.revision; dirty = false; el('discard-note').hidden = true;
      el('note-title').value = note.title; el('note-body').value = note.body; el('note-reminder').value = note.remindAt ? localDate(note.remindAt) : '';
      el('note-reminder-state').textContent = note.reminded ? 'Avisado' : ''; el('delete-note').disabled = false;
      el('note-filename').textContent = `${displayTitle(note)}.md`; el('note-path').textContent = file.path;
      status('Guardada'); preview(); renderList();
    } catch (error) { status(error.message, true); } finally { busy = false; }
  }
  async function saveNote() {
    if (busy) return false;
    const title = el('note-title').value.trim(), body = el('note-body').value, input = el('note-reminder').value;
    if (!title && !body.trim()) { if (!dirty) return true; status('Escribe un título o el contenido de la nota.', true); return false; }
    const parsed = input ? new Date(input) : null;
    if (parsed && Number.isNaN(parsed.getTime())) { status('Introduce una fecha válida.', true); return false; }
    const notes = listFor(owner), existing = notes.find(n => n.id === selectedId), id = selectedId || crypto.randomUUID();
    const remindAt = parsed ? parsed.toISOString() : null;
    busy = true; status('Guardando…');
    try {
      const file = await window.desktop.writeNote(owner.id, id, encode(title, body), revision);
      const note = existing || { id };
      const sameReminder = existing && existing.remindAt === remindAt;
      Object.assign(note, { title, body, remindAt, reminded: sameReminder ? Boolean(existing.reminded) : false });
      if (!existing) notes.push(note);
      save(); selectedId = id; revision = file.revision; dirty = false; el('discard-note').hidden = true;
      el('note-filename').textContent = `${displayTitle(note)}.md`; el('note-path').textContent = file.path;
      el('note-reminder-state').textContent = note.reminded ? 'Avisado' : ''; el('delete-note').disabled = false;
      status('Guardada'); renderList(); void checkReminders(); return true;
    } catch (error) { status(`No se pudo guardar: ${error.message}`, true); return false; } finally { busy = false; }
  }
  async function migrate() {
    for (const p of state.profiles) for (const note of listFor(p)) {
      try {
        let file = await window.desktop.readNote(p.id, note.id);
        if (!file) file = await window.desktop.writeNote(p.id, note.id, encode(note.title || '', note.body || ''), null);
        // Existing files are authoritative, including edits made outside the app.
        Object.assign(note, decode(file.text, note.title));
      } catch (error) { status(`No se pudo preparar una nota: ${error.message}`, true); }
    }
    try { save(); } catch (error) { status(`No se pudo guardar el índice: ${error.message}`, true); }
    renderList();
  }
  const ready = migrate().then(checkReminders);
  async function openNotes() {
    await ready; if (!el('notes-panel').open) el('notes-panel').showModal();
    renderList(); if (!selectedId && listFor(owner).length) await selectNote(listFor(owner).at(-1).id);
  }
  async function closeNotes() { if (dirty && !(await saveNote())) return; if (el('notes-panel').open) el('notes-panel').close(); }
  el('notes-button').onclick = openNotes; el('toggle-notes').onclick = openNotes;
  el('reminder-banner').onclick = () => {
    const banner = el('reminder-banner'); banner.hidden = true;
    const index = state.profiles.findIndex(item => item.id === banner.dataset.profileId);
    if (index >= 0 && state.profile !== index) { state.profile = index; render(); }
    if (banner.dataset.kind === 'opportunity') el('opportunities-button').click(); else void openNotes();
  };
  el('close-notes').onclick = closeNotes;
  el('notes-panel').addEventListener('cancel', event => { event.preventDefault(); void closeNotes(); });
  el('new-note').onclick = async () => { if (dirty && !(await saveNote())) return; clearEditor(); el('note-title').focus(); };
  el('notes-search').oninput = renderList;
  el('discard-note').onclick = () => { dirty = false; if (selectedId) void selectNote(selectedId); else clearEditor(); };
  for (const id of ['note-title', 'note-body', 'note-reminder']) el(id).addEventListener('input', () => { dirty = true; el('discard-note').hidden = false; status('Cambios sin guardar'); preview(); });
  el('note-form').onsubmit = event => { event.preventDefault(); void saveNote(); };
  el('delete-note').onclick = () => { if (!selectedId) return; deleting = selectedId; el('delete-note-dialog').showModal(); };
  el('cancel-delete-note').onclick = () => { deleting = null; el('delete-note-dialog').close(); };
  el('delete-note-dialog').addEventListener('cancel', () => { deleting = null; });
  el('confirm-delete-note').onclick = async () => {
    const id = deleting, notes = listFor(owner), index = notes.findIndex(n => n.id === id);
    if (index < 0 || busy) return;
    busy = true;
    try { await window.desktop.removeNote(owner.id, id, revision); notes.splice(index, 1); save(); deleting = null; el('delete-note-dialog').close(); clearEditor(); }
    catch (error) { el('delete-note-dialog').close(); status(`No se pudo eliminar: ${error.message}`, true); }
    finally { busy = false; }
  };
  document.addEventListener('social-profile-rendered', async () => {
    if (owner.id !== profile().id) {
      // An agent can switch profiles while the workspace is open: save the old draft first.
      if (dirty && !(await saveNote())) return;
      owner = profile(); clearEditor();
    } else renderList();
  });
  async function checkReminders() {
    if (checking) return; checking = true;
    try {
      for (const p of state.profiles) for (const note of listFor(p)) {
        const when = Date.parse(note.remindAt);
        if (!note.remindAt || note.reminded || Number.isNaN(when) || when > Date.now()) continue;
        note.reminded = true; try { save(); } catch { note.reminded = false; continue; }
        el('notes-notice').textContent = `Recordatorio · ${p.name}: ${note.title || note.body}`;
        el('reminder-banner').textContent = `Recordatorio · ${p.name}: ${note.title || note.body}`; el('reminder-banner').dataset.kind = 'note'; el('reminder-banner').dataset.profileId = p.id; el('reminder-banner').hidden = false;
        try { await window.desktop.showReminder({ title: `Recordatorio · ${p.name}`.slice(0,160), body: (note.title || note.body).slice(0,500) }); } catch {}
      }
      if (selectedId) { const note = listFor(owner).find(n => n.id === selectedId); if (note?.reminded) el('note-reminder-state').textContent = 'Avisado'; }
    } finally { checking = false; }
  }
  setInterval(checkReminders, 10000);
  preview(); renderList();
})();
