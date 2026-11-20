const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { _electron: electron } = require('playwright-core');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

const project = path.resolve(__dirname, '..');
test('profile renames preserve sessions, login popups and background links stay in their source profile', { timeout: 45000 }, async () => {
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (request.url === '/oauth') {
      response.end(`<title>Autenticación</title><script>document.cookie='oauth=connected; path=/; max-age=3600'; if(window.opener)window.opener.postMessage('connected',location.origin); window.close();</script>`);
    } else {
      response.end(`<title>Cuenta de prueba</title><a id="new-tab" href="/destination" target="_blank">Abrir</a><script>addEventListener('message',event=>{if(event.data==='connected')document.title='Cuenta autorizada'});</script>`);
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'social-profiles-'));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const args = ['--disable-gpu', `--user-data-dir=${directory}`, project];
  if (process.env.SOCIAL_BROWSER_TEST_NO_SANDBOX === '1') args.unshift('--no-sandbox');
  let app;
  try {
    app = await electron.launch({ executablePath: require('electron'), args });
    const page = await app.firstWindow();
    await page.locator('#url').fill(url);
    await page.locator('#address-form').dispatchEvent('submit');
    await page.waitForFunction(() => document.querySelector('.tab')?.textContent.includes('Cuenta de prueba'));
    const original = await page.evaluate(() => JSON.parse(localStorage.getItem('social-state')).profiles[0].id);
    await page.locator('#rename-profile').click();
    await page.locator('#profile-name').fill('Empresa A');
    await page.locator('#profile-form button[type=submit]').click();
    assert.equal(await page.locator('#profiles option:checked').textContent(), 'Empresa A');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('social-state')).profiles[0].id), original);
    const opened = await app.evaluate(async ({ webContents }, target) => {
      const guest = webContents.getAllWebContents().find(contents => contents.getURL() === target);
      return guest.executeJavaScript("Boolean(window.open('/oauth','login','width=500,height=500'))", true);
    }, url);
    assert.equal(opened, true);
    await page.waitForFunction(() => document.querySelector('.tab')?.textContent.includes('Cuenta autorizada'));
    const blankOpened = await app.evaluate(async ({ webContents }, target) => {
      const guest = webContents.getAllWebContents().find(contents => contents.getURL() === target);
      return guest.executeJavaScript("document.title='Cuenta de prueba'; (() => { const popup=window.open('', 'login2', 'width=500,height=500'); if (popup) popup.location.href='/oauth'; return Boolean(popup); })()", true);
    }, url);
    assert.equal(blankOpened, true);
    await page.waitForFunction(() => document.querySelector('.tab')?.textContent.includes('Cuenta autorizada'));
    const firstCookies = await app.evaluate(async ({ session }, id) => session.fromPartition(`persist:social-${id}`).cookies.get({ name: 'oauth' }), original);
    assert.equal(firstCookies[0].value, 'connected');
    await page.locator('#add-profile').click();
    await page.locator('#profile-name').fill('Empresa B');
    await page.locator('#profile-form button[type=submit]').click();
    const second = await page.evaluate(() => JSON.parse(localStorage.getItem('social-state')).profiles[1].id);
    const secondCookies = await app.evaluate(async ({ session }, id) => session.fromPartition(`persist:social-${id}`).cookies.get({ name: 'oauth' }), second);
    assert.equal(secondCookies.length, 0);
    await app.evaluate(async ({ webContents }, target) => {
      const guest = webContents.getAllWebContents().find(contents => contents.getURL() === target);
      await guest.executeJavaScript("document.querySelector('#new-tab').click()", true);
    }, url);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('social-state')).profiles[0].tabs.length === 2);
    assert.equal(await page.locator('#profiles option:checked').textContent(), 'Empresa B');
    assert.equal(await page.locator('.tab-wrap').count(), 1);
    await page.locator('#profiles').selectOption('0');
    assert.equal(await page.locator('.tab-wrap').count(), 2);
    await page.locator('#url').fill('http://127.0.0.1:1/');
    await page.locator('#address-form').dispatchEvent('submit');
    await page.waitForFunction(() => document.querySelector('#page-status').textContent.includes('No se pudo cargar'));
    await page.waitForTimeout(150);
    assert((await page.locator('#page-status').innerText()).includes('No se pudo cargar'));
    await page.locator('#profiles').selectOption('1');
    await page.locator('#profiles').selectOption('0');
    assert((await page.locator('#page-status').innerText()).includes('No se pudo cargar'));
    assert.equal(await page.locator('#url').inputValue(), 'http://127.0.0.1:1/');
    await page.locator('#url').fill(url);
    await page.locator('#address-form').dispatchEvent('submit');
    await page.waitForFunction(() => document.querySelector('.tab')?.textContent.includes('Cuenta de prueba'));
    await page.waitForFunction(() => document.querySelector('#page-status').textContent === '');
    await app.close(); app = null;
    app = await electron.launch({ executablePath: require('electron'), args });
    const reopened = await app.firstWindow();
    assert.equal(await reopened.locator('#profiles option').count(), 2);
    assert.equal(await reopened.locator('#profiles option').first().textContent(), 'Empresa A');
    const restored = await app.evaluate(async ({ session }, id) => session.fromPartition(`persist:social-${id}`).cookies.get({ name: 'oauth' }), original);
    const isolated = await app.evaluate(async ({ session }, id) => session.fromPartition(`persist:social-${id}`).cookies.get({ name: 'oauth' }), second);
    assert.equal(restored[0].value, 'connected');
    assert.equal(isolated.length, 0);
    await reopened.locator('#agent-access').click();
    await reopened.locator('#confirm-agent').click();
    await reopened.waitForFunction(() => document.querySelector('#agent-access').textContent.includes('Desconectar'));
    const client = new Client({ name: 'profile-test', version: '1.0.0' });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(project, 'mcp-server.js')], env: { ...process.env, SOCIAL_BROWSER_USER_DATA: directory }, stderr: 'pipe' }));
    try {
      const list = await client.callTool({ name: 'list_profiles', arguments: {} });
      assert.equal(JSON.parse(list.content[0].text).profiles.length, 2);
      const select = await client.callTool({ name: 'select_profile', arguments: { profile: 'Empresa B' } });
      assert.equal(select.isError, undefined);
      const draft = await client.callTool({ name: 'save_draft', arguments: { text: 'Mensaje de prueba para B' } });
      assert(!draft.isError);
      const stored = await reopened.evaluate(() => JSON.parse(localStorage.getItem('social-state')));
      assert.equal(stored.profiles[1].draft, 'Mensaje de prueba para B');
      assert.notEqual(stored.profiles[0].draft, 'Mensaje de prueba para B');
    } finally { await client.close(); }
    await app.close(); app = null;
    app = await electron.launch({ executablePath: require('electron'), args });
    const connected = await app.firstWindow();
    await connected.waitForFunction(() => document.querySelector('#agent-access').textContent.includes('Desconectar'));
    assert((await connected.locator('#agent-access').innerText()).includes('Empresa A'));
    await connected.locator('#agent-access').click();
    await connected.waitForFunction(() => document.querySelector('#agent-access').textContent === 'Conectar agente');
    await app.close(); app = null;
    app = await electron.launch({ executablePath: require('electron'), args });
    const disconnected = await app.firstWindow();
    assert.equal(await disconnected.locator('#agent-access').innerText(), 'Conectar agente');
  } finally {
    await app?.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
