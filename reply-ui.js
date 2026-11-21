let replyReview = null;
function openReplyReview(owner, record) {
  if (!facebookPage(record.url)) return;
  replyReview = { owner, record, prepared: null, images: [] };
  $('reply-post').textContent = `Publicación: ${record.url}\n${record.summary || record.text || ''}`;
  $('reply-template').replaceChildren(new Option('Selecciona un mensaje', ''));
  for (const item of owner.messageTemplates || []) if (item.network === 'Facebook') $('reply-template').add(new Option(item.name, item.id));
  $('reply-text').value = ''; $('reply-images').textContent = 'Sin imágenes seleccionadas.'; $('reply-image-previews').replaceChildren();
  $('reply-status').textContent = ''; $('reply-submit').disabled = true;
  $('reply-review-dialog').showModal();
}
$('reply-template').onchange = async () => {
  const item = replyReview?.owner.messageTemplates?.find(template => template.id === $('reply-template').value);
  $('reply-text').value = item?.text || ''; replyReview.images = Array.isArray(item?.images) ? [...item.images] : [];
  $('reply-images').textContent = replyReview.images.length ? `Imágenes seleccionadas:\n${replyReview.images.join('\n')}` : 'Sin imágenes seleccionadas.';
  replyReview.prepared = null; $('reply-submit').disabled = true;
  const selectedReview = replyReview, selectedImages = [...replyReview.images]; $('reply-image-previews').replaceChildren();
  if (selectedImages.length) {
    try {
      const previews = await window.desktop.previewReplyImages(selectedImages);
      if (replyReview !== selectedReview || JSON.stringify(replyReview.images) !== JSON.stringify(selectedImages)) return;
      for (const image of previews) {
        const figure = document.createElement('figure'), caption = document.createElement('figcaption'); caption.textContent = image.path.split(/[\\/]/).pop();
        if (image.preview) { const img = document.createElement('img'); img.src = image.preview; img.alt = caption.textContent; figure.append(img); }
        figure.append(caption); $('reply-image-previews').append(figure);
      }
    } catch (error) { $('reply-status').textContent = `No se pudieron abrir las imágenes: ${error.message}`; }
  }
};
$('reply-text').oninput = () => { if (replyReview) replyReview.prepared = null; $('reply-submit').disabled = true; };
$('reply-close').onclick = () => $('reply-review-dialog').close();
$('reply-open').onclick = () => {
  const review = replyReview, index = state.profiles.indexOf(review.owner); if (index < 0) return;
  $('reply-review-dialog').close(); state.profile = index; openTab(review.record.url);
  $('reply-resume').hidden = false; $('page-status').textContent = 'Abre el cuadro para comentar y pulsa «Continuar respuesta».';
};
$('reply-resume').onclick = () => { if (replyReview) $('reply-review-dialog').showModal(); };
function replyCurrent() {
  const review = replyReview;
  if (!review || profile() !== review.owner) throw new Error('Selecciona el perfil de la publicación.');
  const selected = review.owner.tabs[review.owner.activeTab], view = selected && views.get(selected.id);
  if (!view || !view.isConnected) throw new Error('Abre primero la publicación.');
  const current = view.getURL();
  const target = new URL(review.record.url), actual = new URL(current); target.hash = ''; actual.hash = '';
  if (!facebookPage(current) || actual.href !== target.href) throw new Error('Abre la publicación exacta antes de continuar.');
  return { view, url: current };
}
async function replyExecute(view, operation, payload) { return await view.executeJavaScript(`(${replyControl.toString()})(${JSON.stringify(operation)}, ${JSON.stringify(payload)})`); }
let pendingReplyApproval = null;
$('reply-prepare').onclick = () => {
  const review = replyReview, text = $('reply-text').value.trim();
  if (!review || !text) { $('reply-status').textContent = 'Escribe una respuesta antes de preparar.'; return; }
  try { replyCurrent(); } catch (error) { $('reply-status').textContent = error.message; return; }
  pendingReplyApproval = { review, text, images: [...review.images] };
  $('prepare-confirm-target').textContent = `Perfil: ${review.owner.name}\nPublicación: ${review.record.url}`;
  $('prepare-confirm-text').textContent = text;
  $('prepare-confirm-images').textContent = review.images.length ? `Imágenes:\n${review.images.join('\n')}` : 'Sin imágenes.';
  $('reply-prepare-confirm-dialog').showModal();
};
$('prepare-cancel').onclick = () => { pendingReplyApproval = null; $('reply-prepare-confirm-dialog').close(); };
$('reply-prepare-confirm-dialog').addEventListener('cancel', () => { pendingReplyApproval = null; });
$('prepare-confirm').onclick = () => { const approval = pendingReplyApproval; pendingReplyApproval = null; $('reply-prepare-confirm-dialog').close(); if (approval) void prepareApprovedReply(approval); };
async function prepareApprovedReply(approval) {
  const review = replyReview, text = $('reply-text').value.trim();
  if (review !== approval.review || text !== approval.text || JSON.stringify(review.images) !== JSON.stringify(approval.images)) { $('reply-status').textContent = 'El contenido cambió; revisa la preparación de nuevo.'; return; }
  if (!text) { $('reply-status').textContent = 'Escribe una respuesta antes de preparar.'; return; }
  $('reply-prepare').disabled = true; $('reply-submit').disabled = true; review.prepared = null;
  try {
    const { view, url } = replyCurrent(); const token = crypto.randomUUID();
    const snapshot = await replyExecute(view, 'inspect', { token, images: review.images.length > 0 });
    if (snapshot.error) throw new Error(snapshot.error);
    if (snapshot.url !== url) throw new Error('La página cambió.');
    const payload = { ...snapshot, text, files: review.images.map(file => file.split(/[\\/]/).pop()) }
    const fill = await replyExecute(view, 'fill', payload); if (fill.error) throw new Error(fill.error);
    if (review.images.length) await window.desktop.attachReplyImages({ guestId: view.getWebContentsId(), url, token, files: review.images });
    const preview = await replyExecute(view, 'preview', payload); if (preview.error) throw new Error(preview.error);
    review.prepared = { view, payload }; $('reply-submit').disabled = false;
    $('reply-status').textContent = 'Comentario preparado. Revisa el contenido antes de aprobar el envío.';
  } catch (error) { $('reply-status').textContent = `No se preparó la respuesta: ${error.message}`; }
  finally { $('reply-prepare').disabled = false; }
}
$('reply-submit').onclick = async () => {
  try {
    const review = replyReview, current = replyCurrent(), prepared = review.prepared;
    if (!prepared || current.view !== prepared.view || $('reply-text').value.trim() !== prepared.payload.text) throw new Error('Prepara nuevamente el comentario.');
    const preview = await replyExecute(current.view, 'preview', prepared.payload); if (preview.error) throw new Error(preview.error);
    $('reply-confirm-target').textContent = `Perfil: ${review.owner.name}\nPublicación: ${review.record.url}\nBotón: ${preview.button}`;
    $('reply-confirm-text').textContent = prepared.payload.text;
    $('reply-confirm-images').textContent = review.images.length ? `Imágenes:\n${review.images.join('\n')}` : 'Sin imágenes.';
    $('reply-confirm-dialog').showModal();
  } catch (error) { $('reply-status').textContent = `No se puede aprobar: ${error.message}`; }
};
$('reply-cancel-send').onclick = () => $('reply-confirm-dialog').close();
$('reply-confirm-send').onclick = async () => {
  $('reply-confirm-send').disabled = true;
  try {
    const current = replyCurrent(), prepared = replyReview.prepared;
    if (!prepared || current.view !== prepared.view || $('reply-text').value.trim() !== prepared.payload.text) throw new Error('El formulario cambió.');
    const result = await replyExecute(current.view, 'submit', prepared.payload); if (result.error) throw new Error(result.error);
    replyReview.prepared = null; $('reply-submit').disabled = true; $('reply-resume').hidden = true;
    $('reply-status').textContent = 'Se pulsó el botón de envío. Comprueba en Facebook si el comentario se publicó.';
  } catch (error) { $('reply-status').textContent = `No se envió: ${error.message}`; }
  finally { $('reply-confirm-send').disabled = false; $('reply-confirm-dialog').close(); }
};
