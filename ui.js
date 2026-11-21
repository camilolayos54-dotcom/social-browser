(() => {
  const nav = document.getElementById('social-nav');
  const assistant = document.getElementById('assistant');
  const leftToggle = document.getElementById('toggle-nav');
  const rightToggle = document.getElementById('close-ai');
  const expandAssistant = document.getElementById('expand-assistant');
  const read = key => { try { return localStorage.getItem(key) === '1'; } catch { return false; } };
  const persist = (key, value) => { try { localStorage.setItem(key, value ? '1' : '0'); } catch {} };
  function setLeft(collapsed) {
    nav.classList.toggle('collapsed', collapsed);
    leftToggle.setAttribute('aria-expanded', String(!collapsed));
    leftToggle.setAttribute('aria-label', collapsed ? 'Expandir barra izquierda' : 'Minimizar barra izquierda');
    leftToggle.title = leftToggle.getAttribute('aria-label'); leftToggle.textContent = collapsed ? '›' : '‹';
    persist('social-sidebar-left-collapsed', collapsed);
  }
  function setRight(collapsed) {
    assistant.classList.remove('hidden');
    assistant.classList.toggle('collapsed', collapsed);
    rightToggle.setAttribute('aria-expanded', String(!collapsed));
    expandAssistant.setAttribute('aria-expanded', String(!collapsed));
    persist('social-sidebar-right-collapsed', collapsed);
  }
  leftToggle.onclick = () => setLeft(!nav.classList.contains('collapsed'));
  rightToggle.onclick = () => setRight(true);
  expandAssistant.onclick = () => setRight(false);
  window.toggleAssistantSidebar = () => setRight(!assistant.classList.contains('collapsed'));
  document.body.dataset.platform = window.desktop.platform;
  const applicationMenu = document.getElementById('application-menu');
  window.desktop.onToggleApplicationMenu(async () => {
    if (!applicationMenu.hidden) { applicationMenu.hidden = true; return; }
    try {
      const items = await window.desktop.applicationMenuItems(); applicationMenu.replaceChildren();
      for (const item of items) {
        const button = document.createElement('button'); button.textContent = item.label;
        button.onclick = async () => { const box = button.getBoundingClientRect(); try { await window.desktop.openApplicationMenu({ index: item.index, x: box.left, y: box.bottom }); } finally { applicationMenu.hidden = true; } };
        applicationMenu.append(button);
      }
      applicationMenu.hidden = false; applicationMenu.querySelector('button')?.focus();
    } catch { applicationMenu.hidden = true; }
  });
  document.getElementById('rail-agent').onclick = () => document.getElementById('agent-access').click();
  const updateAgentCaption = () => { const caption = document.getElementById('agent-access').textContent; const rail = document.getElementById('rail-agent'); rail.title = caption; rail.setAttribute('aria-label', caption); };
  new MutationObserver(updateAgentCaption).observe(document.getElementById('agent-access'), { childList: true, characterData: true, subtree: true });
  updateAgentCaption();
  const savedSelect = document.getElementById('actions-saved-search');
  const refreshSavedSearches = () => {
    const selected = savedSelect.value; savedSelect.replaceChildren(new Option('Selecciona una búsqueda', ''));
    for (const item of profile().savedFacebookSearches || []) savedSelect.add(new Option(item.name, item.id));
    savedSelect.value = [...savedSelect.options].some(option => option.value === selected) ? selected : '';
    document.getElementById('actions-run-saved').disabled = !savedSelect.value;
  };
  window.refreshSavedSearches = refreshSavedSearches;
  savedSelect.onchange = () => { document.getElementById('actions-run-saved').disabled = !savedSelect.value; };
  document.getElementById('actions-run-saved').onclick = () => { if (savedSelect.value) void runSavedFacebookSearch(savedSelect.value); };
  document.addEventListener('social-profile-rendered', refreshSavedSearches);
  refreshSavedSearches();
  document.querySelectorAll('.assistant-rail .rail-direct').forEach(button => {
    button.onclick = () => document.getElementById(button.dataset.target).click();
  });
  document.querySelectorAll('.assistant-rail .rail-action').forEach(button => {
    button.onclick = () => { setRight(false); document.getElementById('assistant-tools').open = true; document.getElementById(button.dataset.focus).focus(); };
  });
  document.querySelectorAll('button[aria-label]').forEach(button => { if (!button.title) button.title = button.getAttribute('aria-label'); });
  setLeft(read('social-sidebar-left-collapsed'));
  setRight(read('social-sidebar-right-collapsed'));
  document.addEventListener('click', event => {
    const menu = document.querySelector('.utilities');
    if (menu.open && !menu.contains(event.target)) menu.open = false;
    if (event.target.closest('.utilities-menu button')) menu.open = false;
  });
})();
