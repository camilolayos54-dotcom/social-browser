const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright-core');

test('Markdown notes persist, migrate, preview, respect profiles and preserve reminders', { timeout: 45000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'social-notes-'));
  const args = ['--disable-gpu', `--user-data-dir=${directory}`, path.resolve(__dirname, '..')];
  if (process.env.SOCIAL_BROWSER_TEST_NO_SANDBOX === '1') args.unshift('--no-sandbox');
  let app;
  try {
    app = await electron.launch({ executablePath: require('electron'), args });
    let page = await app.firstWindow();
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMenuBarAutoHide()), true);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.sendInputEvent({type:'keyDown',keyCode:'Alt'}));
    await page.waitForTimeout(100);
    await page.waitForFunction(() => !document.querySelector('#application-menu').hidden);
    assert((await page.locator('#application-menu button').count()) > 0);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.sendInputEvent({type:'keyDown',keyCode:'Alt'}));
    await page.waitForFunction(() => document.querySelector('#application-menu').hidden);
    await page.locator('#notes-button').click();
    assert.equal(await page.locator('#notes-panel').evaluate(e => e.open), true);
    await page.evaluate(() => { for (const [id, value] of [['note-title', 'Idea inicial'], ['note-body', '## Título\n\nTexto **importante**\n- elemento']]) { const field = document.getElementById(id); field.value = value; field.dispatchEvent(new Event('input', { bubbles: true })); } });
    assert.equal(await page.locator('#note-preview h3').textContent(), 'Título');
    assert.equal(await page.locator('#note-preview strong').textContent(), 'importante');
    await page.locator('#save-note').click();
    await page.waitForFunction(() => document.querySelector('#note-save-status').textContent === 'Guardada');
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('social-state')));
    const first = state.profiles[0], note = first.notes[0];
    const file = path.join(directory, 'notes', first.id, `${note.id}.md`);
    assert.equal(fs.readFileSync(file, 'utf8'), '# Idea inicial\n\n## Título\n\nTexto **importante**\n- elemento');
    await page.locator('#close-notes').click();
    await page.locator('#add-profile').click(); await page.locator('#profile-name').fill('Otro perfil');
    await page.locator('#profile-form button[type=submit]').click();
    await page.locator('#notes-button').click();
    assert.equal(await page.locator('.vault-note').count(), 0);
    await page.locator('#close-notes').click(); await page.locator('#profiles button').nth(0).click();
    await page.locator('#notes-button').click();
    assert.equal(await page.locator('#note-title').inputValue(), 'Idea inicial');
    await page.locator('#note-reminder').fill('2000-01-01T12:00'); await page.locator('#save-note').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('social-state')).profiles[0].notes[0].reminded === true);
    await app.close(); app = null;
    fs.writeFileSync(file, '# Cambio externo\n\nTexto desde otro editor');
    app = await electron.launch({ executablePath: require('electron'), args }); page = await app.firstWindow();
    await page.locator('#notes-button').click();
    assert.equal(await page.locator('#note-title').inputValue(), 'Cambio externo');
    assert.equal(await page.locator('#note-body').inputValue(), 'Texto desde otro editor');
    assert.equal(await page.locator('#note-reminder-state').textContent(), 'Avisado');
    await page.locator('#delete-note').click(); await page.locator('#confirm-delete-note').click();
    await page.waitForFunction(() => document.querySelector('#notes-count').textContent === '0');
    assert.equal(fs.existsSync(file), false);
  } finally { if (app) await app.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test('migrates existing profile notes to Markdown without losing reminders', { timeout: 45000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'social-migration-'));
  const args = ['--disable-gpu', `--user-data-dir=${directory}`, path.resolve(__dirname, '..')];
  if (process.env.SOCIAL_BROWSER_TEST_NO_SANDBOX === '1') args.unshift('--no-sandbox');
  let app;
  try {
    app = await electron.launch({ executablePath: require('electron'), args });
    let page = await app.firstWindow();
    const saved = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('social-state'));
      const note = { id: crypto.randomUUID(), title: 'Nota anterior', body: 'Texto guardado', remindAt: '2099-01-01T12:00:00.000Z', reminded: false };
      state.profiles[0].notes = [note]; localStorage.setItem('social-state', JSON.stringify(state));
      return { profileId: state.profiles[0].id, note };
    });
    await app.close(); app = null;
    app = await electron.launch({ executablePath: require('electron'), args }); page = await app.firstWindow();
    await page.locator('#notes-button').click();
    assert.equal(await page.locator('#note-title').inputValue(), 'Nota anterior');
    assert.equal(await page.locator('#note-body').inputValue(), 'Texto guardado');
    const file = path.join(directory, 'notes', saved.profileId, `${saved.note.id}.md`);
    assert.equal(fs.readFileSync(file, 'utf8'), '# Nota anterior\n\nTexto guardado');
    const data = await page.evaluate(() => JSON.parse(localStorage.getItem('social-state')).profiles[0].notes[0]);
    assert.equal(data.remindAt, saved.note.remindAt);
  } finally { if (app) await app.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
