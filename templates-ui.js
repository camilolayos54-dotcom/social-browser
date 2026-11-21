(() => {
  let owner = null, editing = null, images = [];
  function showImages() { $('template-image-list').textContent = images.length ? images.join('\n') : 'Sin imágenes seleccionadas.'; }
  const records = () => Array.isArray(owner.messageTemplates) ? owner.messageTemplates : (owner.messageTemplates = []);
  function reset() { editing = null; images = []; $('template-form').reset(); $('template-cancel').hidden = true; showImages(); }
  function renderTemplates() {
    $('templates-list').replaceChildren();
    for (const item of records()) {
      const article = document.createElement('article'); const title = document.createElement('strong'); title.textContent = `${item.name} · ${item.network}`;
      const text = document.createElement('p'); text.textContent = item.text;
      const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Copiar';
      copy.onclick = async () => { try { await window.desktop.copyTemplate(item.text); $('templates-status').textContent = 'Mensaje copiado. Revísalo antes de enviarlo.'; } catch { $('templates-status').textContent = 'No se pudo copiar el mensaje.'; } };
      const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = 'Editar';
      edit.onclick = () => { editing = item.id; $('template-name').value = item.name; $('template-network').value = item.network; $('template-text').value = item.text; images = Array.isArray(item.images) ? [...item.images] : []; showImages(); $('template-cancel').hidden = false; $('template-name').focus(); };
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Eliminar';
      remove.onclick = () => { const previous = owner.messageTemplates; owner.messageTemplates = records().filter(record => record.id !== item.id); try { save(); if (editing === item.id) reset(); renderTemplates(); } catch { owner.messageTemplates = previous; $('templates-status').textContent = 'No se pudo eliminar el mensaje.'; } };
      if (item.images?.length) { const attachments = document.createElement('p'); attachments.textContent = `Imágenes locales (adjuntar manualmente):\n${item.images.join('\n')}`; article.append(attachments); }
      article.append(title, text, copy, edit, remove); $('templates-list').append(article);
    }
  }
  $('templates-button').onclick = () => { owner = profile(); reset(); $('templates-status').textContent = `Perfil: ${owner.name}`; renderTemplates(); $('templates-dialog').showModal(); };
  $('template-images').onclick = async () => { try { const selected = await window.desktop.chooseTemplateImages(); if (selected) { images = selected; showImages(); } } catch (error) { $('templates-status').textContent = `No se pudieron seleccionar imágenes: ${error.message}`; } };
  $('template-clear-images').onclick = () => { images = []; showImages(); };
  $('templates-close').onclick = () => $('templates-dialog').close(); $('template-cancel').onclick = reset;
  $('template-form').onsubmit = event => {
    event.preventDefault(); const name = $('template-name').value.trim(), text = $('template-text').value.trim(), network = $('template-network').value;
    if (!name || !text) return;
    const previous = records().map(record => ({ ...record })); const item = records().find(record => record.id === editing) || { id: crypto.randomUUID() };
    Object.assign(item, { name, text, network, images: [...images] }); if (!editing) records().push(item);
    try { save(); reset(); renderTemplates(); $('templates-status').textContent = 'Mensaje guardado.'; }
    catch { owner.messageTemplates = previous; $('templates-status').textContent = 'No se pudo guardar el mensaje.'; }
  };
})();
