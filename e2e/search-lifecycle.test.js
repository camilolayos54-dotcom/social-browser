const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron: electron } = require('playwright-core');

const project = path.resolve(__dirname, '..');
test('X search continues after closing its panel and stays bound to its profile', { timeout: 45000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'social-search-'));
  const args = ['--disable-gpu', `--user-data-dir=${directory}`, project];
  if (process.env.SOCIAL_BROWSER_TEST_NO_SANDBOX === '1') args.unshift('--no-sandbox');
  let app;
  try {
    app = await electron.launch({ executablePath: require('electron'), args, env: { ...process.env, X_BEARER_TOKEN: 'test-token' } });
    await app.evaluate(() => {
      const original = global.fetch;
      global.fetch = async (target, options) => {
        if (!String(target).startsWith('https://api.x.com/')) return original(target, options);
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 900);
          options.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('cancelado')); }, { once: true });
        });
        return new Response(JSON.stringify({ data: [{ id: '123', text: 'Necesito trasteo' }], meta: {} }), { status: 200 });
      };
    });
    let page = await app.firstWindow();
    await page.locator('#search-x').click();
    await page.locator('#x-query').fill('trasteo');
    await page.locator('#start-x').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('social-state')).profiles[0].xSearch?.status === 'running');
    await page.locator('#close-x').click();
    await page.locator('#add-profile').click();
    await page.locator('#profile-name').fill('Empresa B');
    await page.locator('#profile-form button[type=submit]').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('social-state')).profiles[0].xSearch?.status === 'completed');
    assert.equal(await page.locator('#profiles button[aria-pressed=true]').textContent(), 'Empresa B');
    await page.locator('#search-x').click();
    assert.equal(await page.locator('#x-results article').count(), 0);
    await page.locator('#close-x').click();
    await page.locator('#profiles button').nth(0).click();
    await page.locator('#search-x').click();
    assert.equal(await page.locator('#x-results article').count(), 1);
    assert((await page.locator('#x-status').innerText()).includes('terminada'));
    await page.locator('#close-x').click();

    await app.evaluate(() => {
      global.fetch = async () => new Promise(() => {});
    });
    await page.locator('#search-x').click();
    await page.locator('#x-query').fill('mudanza');
    await page.locator('#start-x').click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('social-state')).profiles[0].xSearch?.status === 'running');
    await app.close(); app = null;
    app = await electron.launch({ executablePath: require('electron'), args });
    page = await app.firstWindow();
    await page.locator('#search-x').click();
    assert((await page.locator('#x-status').innerText()).includes('se interrumpió'));
  } finally {
    await app?.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
