const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright-core');

test('both sidebar icon rails remain usable and persist their state', { timeout: 45000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'social-sidebars-'));
  const args = ['--disable-gpu', `--user-data-dir=${directory}`, path.resolve(__dirname, '..')];
  if (process.env.SOCIAL_BROWSER_TEST_NO_SANDBOX === '1') args.unshift('--no-sandbox');
  let app;
  try {
    app = await electron.launch({ executablePath: require('electron'), args });
    let page = await app.firstWindow();
    const leftWidth = await page.locator('#social-nav').evaluate(el => el.getBoundingClientRect().width);
    const rightWidth = await page.locator('#assistant').evaluate(el => el.getBoundingClientRect().width);
    await page.locator('#toggle-nav').click(); await page.locator('#close-ai').click();
    assert.equal(await page.locator('#toggle-nav').getAttribute('aria-expanded'), 'false');
    assert((await page.locator('#social-nav').evaluate(el => el.getBoundingClientRect().width)) < leftWidth);
    assert((await page.locator('#assistant').evaluate(el => el.getBoundingClientRect().width)) < rightWidth);
    assert.equal(await page.getByRole('button', {name:'Instagram', exact:true}).isVisible(), true);
    await page.getByRole('button', {name:'Abrir chats', exact:true}).click();
    assert.equal(await page.locator('#inbox-dialog').evaluate(el => el.open), true);
    await page.locator('#cancel-inbox').click();
    await page.locator('.rail-action[data-focus=prompt]').click();
    assert.equal(await page.locator('#prompt').evaluate(el => document.activeElement === el), true);
    await page.locator('#close-ai').click();
    await app.close(); app = null;
    app = await electron.launch({ executablePath: require('electron'), args }); page = await app.firstWindow();
    assert.equal(await page.locator('#toggle-nav').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#assistant').evaluate(el => el.classList.contains('collapsed')), true);
    await page.locator('#toggle-nav').click(); await page.locator('#expand-assistant').click();
    assert.equal(await page.locator('#toggle-nav').getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#assistant').evaluate(el => el.classList.contains('collapsed')), false);
  } finally { if (app) await app.close(); fs.rmSync(directory, { recursive:true, force:true }); }
});
