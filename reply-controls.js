// This function executes inside a single selected webview. It fails closed on ambiguity.
function replyControl(operation, payload) {
  const marker = 'data-social-reply';
  const visible = element => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth && style.display !== 'none' && style.visibility !== 'hidden'; };
  const label = element => (element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.getAttribute('aria-placeholder') || element.innerText || element.value || '').trim().replace(/\s+/g,' ');
  const value = element => String(element.value ?? element.innerText ?? '').replace(/\r\n/g,'\n');
  const allowed = element => (element instanceof HTMLTextAreaElement || element.isContentEditable) && !element.disabled && !element.readOnly;
  const buttonsIn = scope => Array.from(scope.querySelectorAll('button,[role="button"],input[type="submit"]')).filter(el => visible(el) && !el.disabled && /^(publicar|comentar|enviar|post|comment|send)$/i.test(label(el)));
  if (operation === 'inspect') {
    document.querySelectorAll(`[${marker}]`).forEach(element => element.removeAttribute(marker));
    const candidates = Array.from(document.querySelectorAll('textarea,[contenteditable="true"],[role="textbox"][contenteditable]'))
      .filter(element => visible(element) && allowed(element) && /coment|comment/i.test(label(element)));
    if (candidates.length !== 1) return { error:'No se encontró un único campo de comentario visible. Abre el comentario en la publicación y vuelve a intentarlo.' };
    const field = candidates[0], scope = field.closest('form,[role="dialog"],article,[role="article"]');
    if (!scope) return { error:'No se pudo identificar el formulario de esta publicación.' };
    const buttons = buttonsIn(scope);
    if (buttons.length !== 1) return { error:'No se encontró un único botón de envío en el mismo formulario.' };
    const inputs = Array.from(scope.querySelectorAll('input[type="file"]')).filter(el => !el.disabled && (!el.accept || /image|png|jpeg|jpg|webp|gif/i.test(el.accept)));
    if (payload.images && inputs.length !== 1) return { error:'No se encontró un único selector de imágenes en el comentario.' };
    field.setAttribute(marker, `${payload.token}-field`); buttons[0].setAttribute(marker, `${payload.token}-button`);
    if (inputs.length === 1) inputs[0].setAttribute(marker, `${payload.token}-file`);
    return { url: location.href, token: payload.token, button: label(buttons[0]), fileAvailable: inputs.length === 1 };
  }
  if (location.href !== payload.url) return { error:'La página cambió; prepara la respuesta nuevamente.' };
  const find = suffix => document.querySelector(`[${marker}="${payload.token}-${suffix}"]`);
  const field = find('field'), button = find('button'), file = find('file');
  if (!field || !button || !visible(field) || !visible(button) || !allowed(field) || label(button) !== payload.button) return { error:'El formulario cambió; prepara la respuesta nuevamente.' };
  const scope = field.closest('form,[role="dialog"],article,[role="article"]');
  if (!scope || !scope.contains(button) || buttonsIn(scope).length !== 1 || (file && !scope.contains(file))) return { error:'El formulario dejó de ser inequívoco.' };
  if (operation === 'fill') {
    field.focus();
    if (field instanceof HTMLTextAreaElement) Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,payload.text);
    else field.textContent = payload.text;
    field.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:payload.text}));
    field.dispatchEvent(new Event('change',{bubbles:true}));
    return { ok:true };
  }
  const files = file ? Array.from(file.files || []).map(item => item.name) : [];
  if (value(field).trim() !== payload.text.trim() || JSON.stringify(files) !== JSON.stringify(payload.files)) return { error:'El texto o las imágenes cambiaron. Revisa y prepara la respuesta nuevamente.' };
  if (operation === 'submit') { button.click(); return { ok:true }; }
  return { ok:true, files, text:value(field), button:label(button) };
}
if (typeof module !== 'undefined') module.exports = { replyControl };
