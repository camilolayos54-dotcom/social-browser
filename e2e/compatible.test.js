const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { _electron: electron } = require('playwright-core');
const project = path.resolve(__dirname, '..');

function startServer(handler) {
  const server = http.createServer(handler);
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

test('configures an external compatible model, protects its key and supports text-only models', { timeout: 45000 }, async () => {
  const otherRequests = [];
  const other = await startServer((request, response) => {
    let body = '';
    request.on('data', chunk => body += chunk);
    request.on('end', () => { otherRequests.push({ headers: request.headers, body: JSON.parse(body) }); response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Borrador sin herramientas.' } }] })); });
  });
  const otherUrl = `http://127.0.0.1:${other.address().port}/v1/chat/completions`;
  const requests = [];
  const model = await startServer((request, response) => {
    if (request.url === '/redirect') { response.writeHead(302, { Location: otherUrl }); response.end(); return; }
    let body = '';
    request.on('data', chunk => body += chunk);
    request.on('end', () => {
      const input = JSON.parse(body);
      requests.push({ headers: request.headers, body: input });
      const result = input.messages.some(message => message.role === 'tool')
        ? { role: 'assistant', content: 'Oportunidad guardada.' }
        : { role: 'assistant', content: null, tool_calls: [{ id: 'call-42', type: 'function', function: { name: 'save_opportunity', arguments: JSON.stringify({ url: 'https://example.com/post/42', summary: 'Busca mudanza', reason: 'Solicita un servicio', date: '' }) } }] };
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: result }] }));
    });
  });
  const endpoint = `http://127.0.0.1:${model.address().port}/v1/chat/completions`;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'social-compatible-'));
  const args = ['--disable-gpu', `--user-data-dir=${directory}`, project];
  if (process.env.SOCIAL_BROWSER_TEST_NO_SANDBOX === '1') args.unshift('--no-sandbox');
  let app;
  try {
    app = await electron.launch({ executablePath: require('electron'), args });
    let page = await app.firstWindow();
    await page.locator('#provider').selectOption('compatible');
    await page.locator('#model').fill('modelo-prueba');
    await page.locator('#compatible-endpoint').fill(endpoint);
    await page.locator('.utilities summary').click();
    await page.locator('#credentials-button').click();
    await page.locator('#compatible-key').fill('test-compatible-secret');
    await page.locator('#compatible-key-form button[type=submit]').click();
    await page.waitForFunction(() => document.querySelector('#credentials-message').textContent.includes('Clave'));
    assert.equal(await page.locator('#compatible-key').inputValue(), '');
    assert(!(await page.evaluate(() => JSON.stringify(localStorage))).includes('test-compatible-secret'));
    await page.locator('#close-credentials').click();
    await page.locator('#prompt').fill('Guarda una oportunidad');
    await page.locator('#chat-form button[type=submit]').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Solicitud terminada'));
    assert.equal(requests.length, 2);
    assert.equal(requests[0].headers.authorization, 'Bearer test-compatible-secret');
    assert(requests[1].body.messages.some(message => message.role === 'tool' && message.tool_call_id === 'call-42'));
    await page.locator('#opportunities-button').click();
    assert((await page.locator('#opportunities-list').innerText()).includes('Busca mudanza'));
    await page.locator('#close-opportunities').click();

    await page.locator('#compatible-endpoint').fill(`http://127.0.0.1:${model.address().port}/redirect`);
    await page.locator('#prompt').fill('Prueba una redirección');
    await page.locator('#chat-form button[type=submit]').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Error de IA'));
    assert.equal(otherRequests.length, 0);
    await page.locator('#compatible-endpoint').fill(otherUrl);
    await page.locator('#chat-form button[type=submit]').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('otro servidor'));
    assert.equal(otherRequests.length, 0);

    await page.locator('.utilities summary').click();
    await page.locator('#credentials-button').click();
    await page.locator('#compatible-key-clear').click();
    await page.waitForFunction(() => document.querySelector('#credentials-message').textContent.includes('eliminada'));
    await page.locator('#close-credentials').click();
    await page.locator('#compatible-tools').uncheck();
    await page.locator('#prompt').fill('Redacta un borrador');
    await page.locator('#chat-form button[type=submit]').click();
    await page.waitForFunction(() => document.querySelector('#conversation').value.includes('Borrador sin herramientas.'));
    assert.equal(otherRequests.length, 1);
    assert.equal(otherRequests[0].headers.authorization, undefined);
    assert.equal(otherRequests[0].body.tools, undefined);
    await app.close(); app = null;
    app = await electron.launch({ executablePath: require('electron'), args });
    page = await app.firstWindow();
    assert.equal(await page.locator('#provider').inputValue(), 'compatible');
    assert.equal(await page.locator('#compatible-endpoint').inputValue(), otherUrl);
    assert.equal(await page.locator('#model').inputValue(), 'modelo-prueba');
    assert.equal(await page.locator('#compatible-tools').isChecked(), false);
  } finally {
    await app?.close();
    model.closeAllConnections(); other.closeAllConnections();
    await Promise.all([new Promise(resolve => model.close(resolve)), new Promise(resolve => other.close(resolve))]);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
