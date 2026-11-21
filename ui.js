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
    document.getElementById('toggle-ai').setAttribute('aria-expanded', String(!collapsed));
    persist('social-sidebar-right-collapsed', collapsed);
  }
  leftToggle.onclick = () => setLeft(!nav.classList.contains('collapsed'));
  rightToggle.onclick = () => setRight(true);
  expandAssistant.onclick = () => setRight(false);
  window.toggleAssistantSidebar = () => setRight(!assistant.classList.contains('collapsed'));
  document.querySelectorAll('.assistant-rail .rail-action').forEach(button => {
    button.onclick = () => { setRight(false); document.getElementById(button.dataset.focus).focus(); };
  });
  setLeft(read('social-sidebar-left-collapsed'));
  setRight(read('social-sidebar-right-collapsed'));
  document.addEventListener('click', event => {
    const menu = document.querySelector('.utilities');
    if (menu.open && !menu.contains(event.target)) menu.open = false;
    if (event.target.closest('.utilities-menu button')) menu.open = false;
  });
})();
