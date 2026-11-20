const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { _electron: electron } = require('playwright-core');

const project = path.resolve(__dirname, '..');
test('the integrated assistant reads a page and saves a source-linked opportunity', { timeout: 45000 }, async () => {
  const server = http.createServer((_, response) => { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end('<title>Tablón local</title><article><p>Necesito trasteo en Medellín</p><a href="/publicacion/1">Ver publicación</a></article>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'social-agent-'));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const args = ['--disable-gpu', `--user-data-dir=${directory}`, project];
  if (process.env.SOCIAL_BROWSER_TEST_NO_SANDBOX === '1') args.unshift('--no-sandbox');
  let app;
  try {
    app = await electron.launch({ executablePath: require('electron'), args });
    await app.evaluate(() => {
      const original = global.fetch;
      global.fetch = async (target, options) => {
        if (!String(target).startsWith('http://127.0.0.1:11434/')) return original(target, options);
        const body = JSON.parse(options.body);
        const results = body.messages.filter(message => message.role === 'tool');
        const prompt = body.messages.find(message => message.role === 'user').content;
        global.lastAssistantToolResults = results;
        let message;
        if (prompt.includes('perfil')) {
          if (!results.length) message = { role: 'assistant', tool_calls: [{ function: { name: 'list_profiles', arguments: {} } }] };
          else if (results.length === 1) message = { role: 'assistant', tool_calls: [
            { function: { name: 'select_profile', arguments: { profile: prompt.includes('inexistente') ? 'Empresa inexistente' : 'Empresa B' } } },
            { function: { name: 'open_network', arguments: { network: 'Facebook' } } }
          ] };
          else message = { role: 'assistant', content: results.some(item => item.content.startsWith('Error:')) ? 'No encontré el perfil solicitado.' : 'Red abierta en el perfil solicitado.' };
        } else if (!results.length) message = { role: 'assistant', tool_calls: [{ function: { name: 'read_page', arguments: {} } }] };
        else if (results.length === 1) {
          const observed = JSON.parse(results[0].content);
          const article = observed.articles.find(item => item.text.includes('Necesito trasteo'));
          message = { role: 'assistant', tool_calls: [{ function: { name: 'save_opportunity', arguments: { url: article.links[0].url, summary: article.text, reason: 'La persona solicita un trasteo.', date: article.date } } }] };
        } else message = { role: 'assistant', content: 'Encontré y guardé una posible oportunidad.' };
        return new Response(JSON.stringify({ message }), { status: 200 });
      };
    });
    const page = await app.firstWindow();
    await page.locator('#url').fill(url);
    await page.locator('#address-form').dispatchEvent('submit');
    await page.waitForFunction(() => document.querySelector('.tab')?.textContent.includes('Tablón local'));
    await page.locator('#prompt').fill('Busca personas que necesiten trasteo y guarda las oportunidades');
    await page.locator('#chat-form button[type=submit]').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Solicitud terminada'));
    assert((await page.locator('#conversation').inputValue()).includes('guardé'));
    await page.locator('#opportunities-button').click();
    const result = await page.locator('#opportunities-list').innerText();
    assert(result.includes('Necesito trasteo en Medellín'));
    assert(result.includes('/publicacion/1'));
    assert(result.includes('La persona solicita un trasteo'));
    await page.locator('#close-opportunities').click();
    await page.locator('#add-profile').click();
    await page.locator('#profile-name').fill('Empresa B');
    await page.locator('#profile-form button[type=submit]').click();
    await page.locator('#profiles button').nth(0).click();
    await page.locator('#prompt').fill('Abre Facebook con el perfil Empresa B');
    await page.locator('#chat-form button[type=submit]').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Solicitud terminada en Empresa B'));
    assert.equal(await page.locator('#profiles button[aria-pressed=true]').textContent(), 'Empresa B');
    assert.equal(await page.locator('#url').inputValue(), 'https://www.facebook.com');
    await page.locator('#profiles button').nth(0).click();
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('social-state')).profiles.map(item => item.tabs.length));
    await page.locator('#prompt').fill('Abre Facebook con el perfil inexistente');
    await page.locator('#chat-form button[type=submit]').click();
    await page.waitForFunction(() => document.querySelector('#conversation').value.includes('No encontré el perfil'));
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('social-state')).profiles.map(item => item.tabs.length));
    assert.deepEqual(after, before);
    assert.equal(await page.locator('#profiles button[aria-pressed=true]').textContent(), 'Mi negocio');
    const logged = await app.evaluate(() => global.lastAssistantToolResults.map(item => item.content));
    assert(logged.some(text => text.includes('acción omitida')));

  } finally {
    await app?.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
