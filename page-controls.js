// This function runs inside the selected web page with data-only arguments.
function pageControlOperation(operation, payload) {
  const marker = 'data-social-browser-control';
  const supportedInputTypes = ['text', 'search', 'email', 'tel', 'url'];
  const excludedAutocomplete = /(?:^|\s)(?:current-password|new-password|one-time-code|cc-[^\s]*)(?:\s|$)/i;
  const isVisible = element => Boolean(element.getClientRects().length) && getComputedStyle(element).visibility !== 'hidden';
  const inViewport = element => {
    const rect = element.getBoundingClientRect();
    let left = Math.max(0, rect.left), right = Math.min(innerWidth, rect.right);
    let top = Math.max(0, rect.top), bottom = Math.min(innerHeight, rect.bottom);
    for (let parent = element.parentElement; parent && right > left && bottom > top; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      const clipX = /^(auto|scroll|hidden|clip)$/.test(style.overflowX);
      const clipY = /^(auto|scroll|hidden|clip)$/.test(style.overflowY);
      if (clipX || clipY) {
        const bounds = parent.getBoundingClientRect();
        if (clipX) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
        if (clipY) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
      }
    }
    return right > left && bottom > top;
  };
  const labelOf = element => (element.getAttribute('aria-label') || element.labels?.[0]?.innerText || element.getAttribute('placeholder') || element.innerText || element.value || element.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 180);
  const fieldAllowed = element => {
    if (element.disabled || element.readOnly || excludedAutocomplete.test(element.getAttribute('autocomplete') || '')) return false;
    if (element instanceof HTMLTextAreaElement) return true;
    if (element instanceof HTMLInputElement) return supportedInputTypes.includes(element.type);
    return element.isContentEditable && !element.closest('[contenteditable="false"]');
  };
  const buttonAllowed = element => !element.disabled && (element instanceof HTMLButtonElement || (element instanceof HTMLInputElement && ['button', 'submit'].includes(element.type)) || element.getAttribute('role') === 'button');
  const selector = 'input, textarea, button, [role="button"], [contenteditable]:not([contenteditable="false"])';
  if (operation === 'inspect') {
    for (const old of document.querySelectorAll(`[${marker}]`)) old.removeAttribute(marker);
    const controls = [];
    for (const element of document.querySelectorAll(selector)) {
      if (controls.length >= 80) break;
      if (!isVisible(element) || !inViewport(element)) continue;
      const kind = fieldAllowed(element) ? 'field' : buttonAllowed(element) ? 'button' : null;
      if (!kind) continue;
      const id = `${payload.snapshot}-${controls.length}`;
      element.setAttribute(marker, id);
      controls.push({ id, kind, label: labelOf(element), tag: element.tagName.toLowerCase(), type: element.getAttribute('type') || '', role: element.getAttribute('role') || '' });
    }
    return { url: location.href, title: document.title, controls };
  }
  if (location.href !== payload.url) return { error: 'La página cambió. Inspecciónala de nuevo.' };
  const matches = Array.from(document.querySelectorAll(`[${marker}]`)).filter(element => element.getAttribute(marker) === payload.id);
  if (matches.length !== 1) return { error: 'El control ya no está disponible. Inspecciona la página de nuevo.' };
  const element = matches[0];
  if (!isVisible(element) || !inViewport(element)) return { error: 'El control ya no está visible. Inspecciona la página de nuevo.' };
  const label = labelOf(element);
  if (label !== payload.label || element.tagName.toLowerCase() !== payload.tag) return { error: 'El control cambió. Inspecciona la página de nuevo.' };
  if (operation === 'fill') {
    if (!fieldAllowed(element)) return { error: 'El campo no admite escritura.' };
    element.focus();
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (!setter) return { error: 'No se pudo editar el campo.' };
      setter.call(element, payload.value);
    } else {
      element.textContent = payload.value;
    }
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: payload.value }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, label };
  }
  if (!buttonAllowed(element)) return { error: 'El control no admite clic.' };
  const form = element.closest('form');
  const scope = form || document;
  const editable = Array.from(scope.querySelectorAll('input, textarea, [contenteditable]:not([contenteditable="false"])')).filter(fieldAllowed).filter(isVisible);
  const fields = editable.slice(0, 20).map(field => ({ label: labelOf(field), value: String(field.value ?? field.innerText ?? '') }));
  if (fields.some(field => field.value.length > 10000) || editable.length > 20) return { error: 'Hay demasiados campos o su contenido es demasiado largo para revisar esta acción.' };
  if (operation === 'preview') return { label, url: location.href, fields };
  if (operation === 'click') {
    if (JSON.stringify(fields) !== JSON.stringify(payload.expectedFields)) return { error: 'El contenido cambió después de la confirmación. Revisa la acción otra vez.' };
    element.click();
    return { ok: true, label };
  }
  return { error: 'Acción desconocida.' };
}
if (typeof module !== 'undefined') module.exports = { pageControlOperation };
