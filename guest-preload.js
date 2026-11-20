const { ipcRenderer } = require('electron');

let reported = false;
function reportEdit(event) {
  if (reported || !event.target || event.target.nodeType !== 1) return;
  const element = event.target;
  if (!element.matches('input, textarea, select, [contenteditable], [role="textbox"]') && !element.closest('[contenteditable], [role="textbox"]')) return;
  reported = true;
  try { ipcRenderer.sendToHost('social-dirty'); } catch {}
}
window.addEventListener('input', reportEdit, true);
window.addEventListener('change', reportEdit, true);
