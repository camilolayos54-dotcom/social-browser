const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright-core');

test('all profiles remain visible and can be selected and renamed from the bar', { timeout: 45000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-profile-bar-'));
  const args = ['--disable-gpu', `--user-data-dir=${dir}`, path.resolve(__dirname, '..')];
  if (process.env.SOCIAL_BROWSER_TEST_NO_SANDBOX === '1') args.unshift('--no-sandbox');
  let app;
  try {
    app = await electron.launch({ executablePath: require('electron'), args });
    const page = await app.firstWindow();
    await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].setSize(900, 800));
    for (const name of ['Ventas', 'Proyecto creativo', 'Equipo social', 'Clientes', 'Comunidad', 'Perfil de prueba con nombre largo y detallado para la barra']) {
      await page.locator('#add-profile').click();
      await page.locator('#profile-name').fill(name);
      await page.locator('#profile-form button[type=submit]').click();
    }
    assert.equal(await page.locator('#profiles button').count(), 7);
    for (const button of await page.locator('#profiles button').all()) {
      assert.equal(await button.isVisible(), true);
      assert.equal(await button.evaluate(e => { const b = e.getBoundingClientRect(), header = e.closest('header').getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && b.top >= header.top && b.bottom <= header.bottom; }), true);
    }
    await page.getByRole('button', { name: 'Ventas', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Ventas', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.locator('#rename-profile').click(); await page.locator('#profile-name').fill('Ventas Colombia');
    await page.locator('#profile-form button[type=submit]').click();
    assert.equal(await page.getByRole('button', { name: 'Ventas Colombia', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#profiles select').count(), 0);
  } finally { if (app) await app.close(); fs.rmSync(dir, { recursive:true, force:true }); }
});
