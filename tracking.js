function createOpportunityTracking(owner, record) {
  const container = document.createElement('div'); container.className = 'opportunity-tracking';
  const fields = record.followup || {};
  const statusLabel = document.createElement('label'); statusLabel.textContent = 'Estado';
  const status = document.createElement('select'); status.setAttribute('aria-label', 'Estado de seguimiento');
  for (const [value, text] of [['pendiente','Pendiente'],['contactada','Contactada'],['respondida','Respondida'],['descartada','Descartada']]) status.add(new Option(text, value));
  status.value = fields.status || 'pendiente'; statusLabel.append(status);
  const notesLabel = document.createElement('label'); notesLabel.textContent = 'Notas de seguimiento';
  const notes = document.createElement('textarea'); notes.rows = 2; notes.maxLength = 3000; notes.value = fields.notes || ''; notes.setAttribute('aria-label', 'Notas de seguimiento'); notesLabel.append(notes);
  const dateLabel = document.createElement('label'); dateLabel.textContent = 'Recordatorio';
  const date = document.createElement('input'); date.type = 'datetime-local'; date.setAttribute('aria-label', 'Fecha del recordatorio');
  if (fields.remindAt) { const d = new Date(fields.remindAt); if (!Number.isNaN(d.getTime())) { const pad = value => String(value).padStart(2, '0'); date.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; } }
  dateLabel.append(date);
  const feedback = document.createElement('small'); feedback.setAttribute('role','status');
  if (fields.reminded) feedback.textContent = 'Recordatorio avisado.';
  const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Guardar seguimiento';
  button.onclick = () => {
    const time = date.value ? new Date(date.value) : null;
    if (time && Number.isNaN(time.getTime())) { feedback.textContent = 'Fecha inválida.'; return; }
    const previous = record.followup, remindAt = time ? time.toISOString() : null;
    record.followup = { status: status.value, notes: notes.value.trim(), remindAt, reminded: Boolean(previous?.remindAt === remindAt && previous?.reminded), updatedAt: new Date().toISOString() };
    try { save(); feedback.textContent = 'Seguimiento guardado.'; void checkOpportunityReminders(); }
    catch { record.followup = previous; feedback.textContent = 'No se pudo guardar el seguimiento.'; }
  };
  container.append(statusLabel, notesLabel, dateLabel, button, feedback); return container;
}
let checkingOpportunityReminders = false;
async function checkOpportunityReminders() {
  if (checkingOpportunityReminders) return; checkingOpportunityReminders = true;
  try {
    for (const owner of state.profiles) for (const record of owner.opportunities || []) {
      const followup = record.followup; const time = Date.parse(followup?.remindAt);
      if (!followup?.remindAt || followup.reminded || !Number.isFinite(time) || time > Date.now()) continue;
      followup.reminded = true; try { save(); } catch { followup.reminded = false; continue; }
      const message = `Seguimiento · ${owner.name}: ${record.summary}`;
      $('reminder-banner').textContent = message; $('reminder-banner').dataset.kind = 'opportunity'; $('reminder-banner').dataset.profileId = owner.id; $('reminder-banner').hidden = false;
      try { await window.desktop.showReminder({ title: `Seguimiento · ${owner.name}`.slice(0,160), body: record.summary.slice(0,500) }); } catch {}
    }
  } finally { checkingOpportunityReminders = false; }
}
void checkOpportunityReminders(); setInterval(checkOpportunityReminders, 10000);
