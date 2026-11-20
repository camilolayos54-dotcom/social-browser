// Notes live in each profile alongside its other local data.
(() => {
  let editingId = null;
  let deletingId = null;
  let currentOwnerId = profile().id;
  let checkingReminders = false;
  const listFor = owner => Array.isArray(owner.notes) ? owner.notes : (owner.notes = []);
  const field = id => document.getElementById(id);
  const resetForm = () => {
    editingId = null;
    field('note-form').reset();
    field('note-error').textContent = '';
    field('save-note').textContent = 'Guardar nota';
    field('cancel-note-edit').hidden = true;
  };
  function openNotes() {
    field('assistant').classList.add('hidden');
    field('notes-panel').classList.remove('hidden');
    renderNotes();
  }
  field('notes-button').onclick = openNotes;
  field('reminder-banner').onclick = () => { field('reminder-banner').hidden = true; openNotes(); };
  field('toggle-notes').onclick = () => {
    if (!field('notes-panel').classList.contains('hidden')) field('notes-panel').classList.add('hidden');
    else openNotes();
  };
  field('close-notes').onclick = () => field('notes-panel').classList.add('hidden');
  field('cancel-note-edit').onclick = resetForm;
  function toLocalInput(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function renderNotes() {
    const notes = listFor(profile());
    const list = field('notes-list');
    list.replaceChildren();
    field('notes-count').textContent = `${notes.length}`;
    field('notes-empty').hidden = notes.length > 0;
    for (const note of [...notes].reverse()) {
      const card = document.createElement('article'); card.className = 'note-card';
      if (note.title) { const title = document.createElement('strong'); title.textContent = note.title; card.append(title); }
      if (note.body) { const body = document.createElement('p'); body.textContent = note.body; card.append(body); }
      if (note.remindAt) {
        const time = document.createElement('div'); time.className = 'note-time';
        time.textContent = `◷ ${new Date(note.remindAt).toLocaleString()}${note.reminded ? ' · Avisado' : ''}`;
        card.append(time);
      }
      const actions = document.createElement('div'); actions.className = 'note-card-actions';
      const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Editar'; edit.setAttribute('aria-label', `Editar ${note.title || 'nota'}`);
      edit.onclick = () => {
        editingId = note.id; field('note-title').value = note.title; field('note-body').value = note.body;
        field('note-reminder').value = note.remindAt ? toLocalInput(note.remindAt) : '';
        field('save-note').textContent = 'Guardar cambios'; field('cancel-note-edit').hidden = false; field('note-error').textContent = '';
        field('note-title').focus();
      };
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Eliminar'; remove.setAttribute('aria-label', `Eliminar ${note.title || 'nota'}`);
      remove.onclick = () => { deletingId = note.id; field('delete-note-dialog').showModal(); };
      actions.append(edit, remove); card.append(actions); list.append(card);
    }
  }
  field('note-form').onsubmit = event => {
    event.preventDefault();
    const title = field('note-title').value.trim(); const body = field('note-body').value.trim(); const input = field('note-reminder').value;
    if (!title && !body) { field('note-error').textContent = 'Escribe un título o el contenido de la nota.'; return; }
    let remindAt = null;
    if (input) { const date = new Date(input); if (Number.isNaN(date.getTime())) { field('note-error').textContent = 'Introduce una fecha válida.'; return; } remindAt = date.toISOString(); }
    const notes = listFor(profile()); const existing = notes.find(n => n.id === editingId);
    const note = existing || { id: crypto.randomUUID() };
    const previous = existing ? { ...existing } : null;
    const sameReminder = existing && existing.remindAt === remindAt;
    Object.assign(note, { title, body, remindAt, reminded: sameReminder ? Boolean(existing.reminded) : false });
    if (!existing) notes.push(note);
    try { save(); } catch { if (!existing) notes.pop(); else Object.assign(existing, previous); field('note-error').textContent = 'No se pudo guardar la nota. Revisa el espacio disponible.'; return; }
    resetForm(); renderNotes(); void checkReminders();
  };
  field('cancel-delete-note').onclick = () => { deletingId = null; field('delete-note-dialog').close(); };
  field('confirm-delete-note').onclick = () => {
    const owner = profile(); const notes = listFor(owner); const index = notes.findIndex(n => n.id === deletingId);
    if (index !== -1) { const [removed] = notes.splice(index, 1); try { save(); } catch { notes.splice(index, 0, removed); field('notes-notice').textContent = 'No se pudo eliminar la nota.'; } }
    if (editingId === deletingId) resetForm(); deletingId = null; field('delete-note-dialog').close(); renderNotes();
  };
  field('delete-note-dialog').addEventListener('cancel', () => { deletingId = null; });
  document.addEventListener('social-profile-rendered', () => {
    if (currentOwnerId !== profile().id) { currentOwnerId = profile().id; resetForm(); if (field('delete-note-dialog').open) field('delete-note-dialog').close(); deletingId = null; }
    renderNotes();
  });
  async function checkReminders() {
    if (checkingReminders) return;
    checkingReminders = true;
    try {
      for (const owner of state.profiles) for (const note of listFor(owner)) {
        if (!note.remindAt || note.reminded || Date.parse(note.remindAt) > Date.now() || Number.isNaN(Date.parse(note.remindAt))) continue;
        // Record delivery before the asynchronous notification to avoid duplicate timers.
        note.reminded = true;
        try { save(); } catch { note.reminded = false; continue; }
        field('notes-notice').textContent = `Recordatorio · ${owner.name}: ${note.title || note.body}`;
        field('reminder-banner').textContent = `Recordatorio · ${owner.name}: ${note.title || note.body}`;
        field('reminder-banner').hidden = false;
        try { await window.desktop.showReminder({ title: `Recordatorio · ${owner.name}`.slice(0, 160), body: (note.title || note.body).slice(0, 500) }); } catch { /* The in-app reminder remains visible. */ }
      }
      renderNotes();
    } finally { checkingReminders = false; }
  }
  renderNotes(); void checkReminders(); setInterval(checkReminders, 10000);
})();
