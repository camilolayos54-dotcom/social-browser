const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright-core');

test('notes persist by profile, support editing, deletion, and deliver overdue reminders', { timeout: 45000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'social-notes-'));
  const args = ['--disable-gpu', `--user-data-dir=${directory}`, path.resolve(__dirname, '..')];
  if (process.env.SOCIAL_BROWSER_TEST_NO_SANDBOX === '1') args.unshift('--no-sandbox');
  let app;
  try {
    app = await electron.launch({ executablePath: require('electron'), args });
    let page = await app.firstWindow();
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMenuBarAutoHide()), true);
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMenuBarVisible()), false);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.sendInputEvent({type:'keyDown',keyCode:'Alt'}));
    await page.waitForTimeout(100);
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMenuBarVisible()), true);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setMenuBarVisibility(false));
    await page.locator('#notes-button').click();
    await page.locator('#note-title').fill('Idea inicial');
    await page.locator('#note-body').fill('Contenido privado');
    await page.locator('#save-note').click();
    assert.equal(await page.locator('.note-card').count(), 1);
    await page.getByRole('button', {name:'Editar Idea inicial'}).click();
    await page.locator('#note-title').fill('Idea editada');
    await page.locator('#save-note').click();
    assert.equal(await page.locator('.note-card strong').textContent(), 'Idea editada');
    await page.locator('#add-profile').click();
    await page.locator('#profile-name').fill('Otro perfil');
    await page.locator('#profile-form button[type=submit]').click();
    assert.equal(await page.locator('.note-card').count(), 0);
    await page.locator('#profiles').selectOption('0');
    assert.equal(await page.locator('.note-card strong').textContent(), 'Idea editada');
    await page.getByRole('button', {name:'Editar Idea editada'}).click();
    await page.locator('#note-reminder').fill('2000-01-01T12:00');
    await page.locator('#save-note').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('social-state')).profiles[0].notes[0].reminded === true);
    assert.match(await page.locator('#reminder-banner').textContent(), /Idea editada/);
    // Simulate a reminder becoming due while the application is closed.
    await page.evaluate(() => { const data = JSON.parse(localStorage.getItem('social-state')); data.profiles[0].notes[0].reminded = false; localStorage.setItem('social-state', JSON.stringify(data)); });
    await app.close(); app = null;
    app = await electron.launch({ executablePath: require('electron'), args });
    page = await app.firstWindow();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('social-state')).profiles[0].notes[0].reminded === true);
    assert.match(await page.locator('#reminder-banner').textContent(), /Idea editada/);
    await page.locator('#notes-button').click();
    assert.equal(await page.locator('.note-card strong').textContent(), 'Idea editada');
    assert.match(await page.locator('.note-time').textContent(), /Avisado/);
    await page.getByRole('button', {name:'Eliminar Idea editada'}).click();
    await page.locator('#confirm-delete-note').click();
    assert.equal(await page.locator('.note-card').count(), 0);
  } finally { if (app) await app.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
