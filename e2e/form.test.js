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
test('an MCP agent can prepare a form and needs confirmation for an unchanged submission', { timeout: 45000 }, async () => {
  let submissions = 0;
  const server = http.createServer((request, response) => {
    if (request.url.startsWith('/submit')) {
      submissions++;
      response.end('<title>Enviado</title>Listo');
      return;
    }
    response.end('<title>Formulario</title><form action="/submit"><label>Mensaje<textarea name="message"></textarea></label><label>Contraseña<input type="password" name="password"></label><button type="submit">Publicar</button></form>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'social-form-'));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const args = ['--disable-gpu', `--user-data-dir=${directory}`, project];
  if (process.env.SOCIAL_BROWSER_TEST_NO_SANDBOX === '1') args.unshift('--no-sandbox');
  let app, client;
  try {
    app = await electron.launch({ executablePath: require('electron'), args });
    const page = await app.firstWindow();
    await page.locator('#url').fill(url);
    await page.locator('#address-form').dispatchEvent('submit');
    await page.waitForFunction(() => document.querySelector('.tab')?.textContent.includes('Formulario'));
    await page.locator('#agent-access').click();
    await page.locator('#agent-all-profiles').uncheck();
    await page.locator('#confirm-agent').click();
    await page.waitForFunction(() => document.querySelector('#agent-access').textContent.includes('Desconectar'));
    client = new Client({ name: 'social-browser-e2e', version: '1.0.0' });
    const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(project, 'mcp-server.js')], env: { ...process.env, SOCIAL_BROWSER_USER_DATA: directory }, stderr: 'pipe' });
    await client.connect(transport);
    const available = await client.listTools();
    assert(available.tools.some(tool => tool.name === 'select_profile'));
    const call = (name, arguments_) => client.callTool({ name, arguments: arguments_ });
    const allowedProfiles = await call('list_profiles', {});
    assert.equal(JSON.parse(allowedProfiles.content[0].text).profiles.length, 1);
    const forbiddenProfile = await call('select_profile', { profile: 'Otra cuenta' });
    assert.equal(forbiddenProfile.isError, true);
    let response = await call('inspect_controls', {});
    assert.equal(response.isError, false);
    const controls = JSON.parse(response.content[0].text).controls;
    assert(!controls.some(control => control.type === 'password'));
    const field = controls.find(control => control.kind === 'field');
    const button = controls.find(control => control.kind === 'button');
    assert(field && button);
    response = await call('fill_control', { id: field.id, value: 'Servicio de trasteos disponible' });
    assert.equal(response.isError, false);
    await page.waitForFunction(() => document.querySelector('.tab')?.textContent.includes('•'));
    await page.locator('#memory-mode').click();
    await page.locator('#confirm-memory').click();
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '+', exact: true }).click();
    assert.equal(await page.locator('webview').count(), 3);
    await page.locator('.tab-wrap .tab').first().click();
    assert((await page.locator('.tab-wrap .tab').first().innerText()).includes('•'));
    await page.locator('.tab-wrap .close-tab').first().click();
    await page.locator('#close-dirty-dialog').waitFor({ state: 'visible' });
    await page.locator('#cancel-close-dirty').click();
    assert.equal(await page.locator('.tab-wrap').count(), 5);
    const tabList = await call('list_tabs', {});
    const dirtyTab = JSON.parse(tabList.content[0].text).tabs.find(item => item.active);
    assert.equal(dirtyTab.hasChanges, true);
    const pendingClose = call('close_tab', { id: dirtyTab.id });
    await page.locator('#close-dirty-dialog').waitFor({ state: 'visible' });
    assert((await page.locator('#close-dirty-message').innerText()).includes('Mi negocio'));
    await page.locator('#cancel-close-dirty').click();
    assert.equal((await pendingClose).isError, true);
    assert.equal(await page.locator('.tab-wrap').count(), 5);
    const closeAbort = new AbortController();
    const abortedClose = client.callTool({ name: 'close_tab', arguments: { id: dirtyTab.id } }, undefined, { signal: closeAbort.signal });
    await page.locator('#close-dirty-dialog').waitFor({ state: 'visible' });
    closeAbort.abort();
    await assert.rejects(abortedClose);
    await page.locator('#close-dirty-dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.tab-wrap').count(), 5);

    let pending = call('click_control', { id: button.id });
    await page.locator('#action-dialog').waitFor({ state: 'visible' });
    assert((await page.locator('#action-preview').innerText()).includes('Servicio de trasteos disponible'));
    assert.equal(submissions, 0);
    await page.locator('#cancel-action').click();
    response = await pending;
    assert.equal(response.isError, true);
    assert.equal(submissions, 0);

    const abort = new AbortController();
    pending = client.callTool({ name: 'click_control', arguments: { id: button.id } }, undefined, { signal: abort.signal });
    await page.locator('#action-dialog').waitFor({ state: 'visible' });
    abort.abort();
    await assert.rejects(pending);
    await page.locator('#action-dialog').waitFor({ state: 'hidden' });
    assert.equal(submissions, 0);

    pending = call('click_control', { id: button.id });
    await page.locator('#action-dialog').waitFor({ state: 'visible' });
    await app.evaluate(async ({ webContents }, targetUrl) => {
      const guest = webContents.getAllWebContents().find(contents => contents.getURL() === targetUrl);
      await guest.executeJavaScript("document.querySelector('textarea').value = 'Contenido cambiado'");
    }, url);
    await page.locator('#confirm-action').click();
    response = await pending;
    assert.equal(response.isError, true);
    assert.match(response.content[0].text, /contenido cambió/i);
    assert.equal(submissions, 0);

    pending = call('click_control', { id: button.id });
    await page.locator('#action-dialog').waitFor({ state: 'visible' });
    assert((await page.locator('#action-preview').innerText()).includes('Contenido cambiado'));
    await page.locator('#confirm-action').click();
    response = await pending;
    assert.equal(response.isError, false);
    await page.waitForFunction(() => document.querySelector('.tab')?.textContent.includes('Enviado'));
    assert.equal(submissions, 1);
    response = await call('fill_control', { id: field.id, value: 'control obsoleto' });
    assert.equal(response.isError, true);

    await page.locator('#credentials-button').click();
    await page.locator('#x-key').fill('test-session-token');
    await page.locator('#x-key-form button[type=submit]').click();
    await page.waitForFunction(() => document.querySelector('#credentials-message').textContent.includes('Clave'));
    assert.equal(await page.locator('#x-key').inputValue(), '');
    assert(!(await page.evaluate(() => JSON.stringify(localStorage))).includes('test-session-token'));
    await page.locator('#close-credentials').click();
    await app.evaluate(() => {
      const original = global.fetch;
      global.fetch = async (target, options) => {
        if (String(target).startsWith('https://api.x.com/')) {
          global.testTokenWasUsed = options.headers.Authorization === 'Bearer test-session-token';
          return new Response(JSON.stringify({ data: [{ id: '456', text: 'Prueba' }], meta: {} }), { status: 200 });
        }
        return original(target, options);
      };
    });
    await page.locator('#search-x').click();
    await page.locator('#x-query').fill('trasteo');
    await page.locator('#start-x').click();
    await page.waitForFunction(() => document.querySelector('#x-status').textContent.includes('Búsqueda terminada'));
    assert.equal(await app.evaluate(() => global.testTokenWasUsed), true);
    assert.equal(await page.locator('#x-results article').count(), 1);
    await page.locator('#x-results button', { hasText: 'Guardar oportunidad' }).click();
    await page.waitForFunction(() => document.querySelector('#x-status').textContent.includes('guardada'));
    await page.locator('#close-x').click();
    await page.locator('#opportunities-button').click();
    assert.equal(await page.locator('#opportunities-list article').count(), 1);
    assert((await page.locator('#opportunities-list').innerText()).includes('Prueba'));
    await page.locator('#close-opportunities').click();
  } finally {
    await client?.close();
    await app?.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
