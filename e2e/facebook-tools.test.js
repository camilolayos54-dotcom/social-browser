const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { _electron: electron } = require('playwright-core');

test('icons have captions, visible matches are registered, and reusable messages persist per network', { timeout:45000 }, async () => {
  const server = http.createServer((_, response) => response.end('<title>Publicaciones de prueba</title><article><p>Busco trasteos Medellin para mañana</p><a href="https://www.facebook.com/example/posts/123">Ver publicación</a></article><article><p>Texto sin coincidencia</p></article>'));
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'social-facebook-tools-'));
  const args = ['--disable-gpu',`--user-data-dir=${dir}`,path.resolve(__dirname,'..')];
  if (process.env.SOCIAL_BROWSER_TEST_NO_SANDBOX === '1') args.unshift('--no-sandbox');
  let app;
  try {
    app = await electron.launch({executablePath:require('electron'),args});
    let page = await app.firstWindow();
    await page.locator('#toggle-nav').click();
    const buttons = page.locator('#social-nav .nav-action, #shortcuts button');
    const details = await buttons.evaluateAll(items => items.map(e => ({icon:e.querySelector('.nav-icon')?.textContent, title:e.title, label:e.getAttribute('aria-label')})));
    assert(details.every(item => item.title && item.label && item.icon));
    assert.equal(new Set(details.map(item => item.icon)).size, details.length);
    assert(details.some(item => item.label === 'Messenger'));
    await page.locator('#templates-button').click();
    await page.locator('#template-network').selectOption('Messenger');
    await page.locator('#template-name').fill('Saludo'); await page.locator('#template-text').fill('Hola, ¿cómo puedo ayudarte?');
    await page.locator('#template-form button[type=submit]').click();
    assert.match(await page.locator('#templates-list').innerText(), /Saludo · Messenger/);
    await page.locator('#templates-close').click();
    await page.locator('#url').fill(`http://127.0.0.1:${server.address().port}/`); await page.locator('#address-form').dispatchEvent('submit');
    await page.waitForFunction(() => document.querySelector('.tab')?.textContent.includes('Publicaciones de prueba'));
    // The local fixture replaces the Facebook-host check only in this isolated test.
    await page.evaluate(() => { facebookPage = () => true; });
    await page.locator('#scan-button').click(); await page.locator('#scan-minutes').fill('0.1'); await page.locator('#scan-start').click();
    await page.waitForFunction(() => document.querySelector('#scan-results').textContent.includes('Busco trasteos'), null, {timeout:10000});
    assert.equal(await page.locator('#scan-results article').count(),1);
    await page.locator('#scan-stop').click();
    await page.waitForFunction(() => document.querySelector('#scan-status').textContent.includes('Detenida'));
    await page.locator('#scan-results button', {hasText:'Guardar oportunidad'}).click();
    assert.match(await page.locator('#scan-status').innerText(), /guardada/);
    await app.close(); app = null;
    app = await electron.launch({executablePath:require('electron'),args}); page = await app.firstWindow();
    await page.locator('#templates-button').click(); assert.match(await page.locator('#templates-list').innerText(), /Saludo · Messenger/);
    await page.locator('#templates-close').click(); await page.locator('#opportunities-button').click();
    assert.match(await page.locator('#opportunities-list').innerText(), /Busco trasteos/);
  } finally { if(app) await app.close(); await new Promise(resolve => server.close(resolve)); fs.rmSync(dir,{recursive:true,force:true}); }
});
