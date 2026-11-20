document.getElementById('close-ai').addEventListener('click', () => document.getElementById('assistant').classList.add('hidden'));
document.addEventListener('click', event => {
  const menu = document.querySelector('.utilities');
  if (menu.open && !menu.contains(event.target)) menu.open = false;
  if (event.target.closest('.utilities-menu button')) menu.open = false;
});
