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

test('cancelling an agent navigation stops a page that has not finished loading', { timeout: 45000 }, async () => {
  let requested = false;
  const server = http.createServer((request, response) => {
    if (request.url === '/slow') { requested = true; return; }
    response.end('<title>Inicio local</title><p>Página inicial</p>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'social-cancel-'));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const args = ['--disable-gpu', `--user-data-dir=${directory}`, project];
  if (process.env.SOCIAL_BROWSER_TEST_NO_SANDBOX === '1') args.unshift('--no-sandbox');
  let app, client;
  try {
    app = await electron.launch({ executablePath: require('electron'), args });
    const page = await app.firstWindow();
    await page.locator('#url').fill(url);
    await page.locator('#address-form').dispatchEvent('submit');
    await page.waitForFunction(() => document.querySelector('.tab')?.textContent.includes('Inicio local'));
    await page.locator('#agent-access').click();
    await page.locator('#agent-all-profiles').uncheck();
    await page.locator('#confirm-agent').click();
    await page.waitForFunction(() => document.querySelector('#agent-access').textContent.includes('Desconectar'));
    client = new Client({ name: 'social-browser-e2e', version: '1.0.0' });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(project, 'mcp-server.js')], env: { ...process.env, SOCIAL_BROWSER_USER_DATA: directory }, stderr: 'pipe' }));
    const controller = new AbortController();
    const call = client.callTool({ name: 'navigate_page', arguments: { url: `${url}slow` } }, undefined, { signal: controller.signal });
    while (!requested) await new Promise(resolve => setTimeout(resolve, 30));
    controller.abort();
    await assert.rejects(call);
    await page.waitForFunction(() => { const view = document.querySelector('webview.active'); try { return !view.isLoading(); } catch { return false; } });
    assert.equal(requested, true);
    requested = false;
    await page.locator('#url').fill(`${url}slow`);
    await page.locator('#address-form').dispatchEvent('submit');
    while (!requested) await new Promise(resolve => setTimeout(resolve, 30));
    const waitingController = new AbortController();
    const waitingRead = client.callTool({ name: 'read_page', arguments: {} }, undefined, { signal: waitingController.signal });
    await new Promise(resolve => setTimeout(resolve, 100));
    waitingController.abort();
    await assert.rejects(waitingRead);
    const later = await client.callTool({ name: 'wait_page', arguments: { seconds: 1 } });
    assert.equal(later.isError, false);
    assert.equal(await page.evaluate(() => document.querySelector('webview.active').isLoading()), true);
    await page.evaluate(() => document.querySelector('webview.active').stop());
  } finally {
    await client?.close();
    await app?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
