const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { _electron: electron } = require('playwright-core');

test('compact scan bar ignores Facebook search noise, matches singular/plural, saves frequent words, and Detener stops immediately', { timeout: 45000 }, async () => {
  const html = `
    <title>trasteos Medellín - Facebook</title>
    <div role="article">
      <p>Se incluyen los resultados para trasteos medellin En su lugar, buscar trasteos Medellín</p>
      <a href="https://www.facebook.com/search/posts/?q=trasteos">Buscar</a>
    </div>
    <div role="article">
      <p>Hola grupo, necesito un trasteo urgente en Medellín para este sábado</p>
      <a href="https://www.facebook.com/groups/medellin/permalink/1001/">Hace 1 h</a>
    </div>
    <div role="article">
      <p>Recomendaciones de trasteos económicos en Envigado por favor</p>
      <a href="https://www.facebook.com/story.php?story_fbid=2002&id=99">Hace 2 h</a>
    </div>
    <div role="article">
      <p>Oferta de empleo para ayudante de trasteos en Medellín</p>
      <a href="https://www.facebook.com/example/posts/3003">Hace 3 h</a>
    </div>
    <div role="article">
      <p>Busco trasteos en Bogotá norte</p>
      <a href="https://www.facebook.com/example/posts/4004">Hace 4 h</a>
    </div>
    <div style="height:2400px"></div>
  `;
  const server = http.createServer((_, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-scanbar-'));
  const args = ['--disable-gpu', `--user-data-dir=${dir}`, path.resolve(__dirname, '..')];
  if (process.env.SOCIAL_BROWSER_TEST_NO_SANDBOX === '1') args.unshift('--no-sandbox');
  let app;
  try {
    app = await electron.launch({ executablePath: require('electron'), args });
    let page = await app.firstWindow();
    const url = `http://127.0.0.1:${server.address().port}/`;
    await page.locator('#url').fill(url);
    await page.locator('#address-form').dispatchEvent('submit');
    await page.waitForFunction(() => document.querySelector('.tab')?.textContent.includes('Facebook'));
    await page.evaluate(() => { facebookPage = () => true; });

    await page.locator('#scan-button').click();
    assert.equal(await page.locator('#facebook-scan-dialog').evaluate(e => e.open), true);

    // Compact non-modal bar check: height < 55% of viewport and non-modal
    const box = await page.locator('#facebook-scan-dialog').boundingBox();
    const vh = await page.evaluate(() => window.innerHeight);
    assert(box && box.height < vh * 0.55, `Expected compact bar height, got ${box?.height} vs ${vh}`);

    // Click frequent chip for Envigado to add it to locations
    await page.locator('#scan-frequent-locations .scan-chip', { hasText: 'Envigado' }).click();
    assert.match(await page.locator('#scan-location').inputValue(), /Medellín, Envigado/);

    // Add a custom frequent word & exclude 'empleo'
    await page.locator('#scan-phrase').fill('trasteos, mudanza express');
    await page.locator('#scan-exclude').fill('empleo');
    await page.locator('#scan-minutes').fill('2');
    await page.locator('#scan-start').click();

    await page.waitForFunction(() => document.querySelectorAll('#scan-results article').length === 2, null, { timeout: 10000 });
    const resultsText = await page.locator('#scan-results').innerText();
    assert(resultsText.includes('trasteo urgente en Medellín'), 'Should match singular trasteo');
    assert(resultsText.includes('Envigado'), 'Should match Envigado');
    assert(!resultsText.includes('Se incluyen los resultados'), 'Should ignore Facebook search noise banner');
    assert(!resultsText.includes('empleo'), 'Should exclude empleo');
    assert(!resultsText.includes('Bogotá'), 'Should exclude Bogotá');

    // Test Detener button stops immediately
    const stopStart = Date.now();
    await page.locator('#scan-stop').click();
    await page.waitForFunction(() => document.querySelector('#scan-status').textContent.includes('Detenida'), null, { timeout: 3000 });
    assert(Date.now() - stopStart < 3000, 'Detener must stop quickly');
    assert.equal(await page.locator('#scan-start').isDisabled(), false);
    assert.equal(await page.locator('#scan-stop').isHidden(), true);

    // Save all matches as opportunities
    await page.locator('#scan-save-all').click();
    assert.match(await page.locator('#scan-status').innerText(), /2 oportunidades guardadas/);

    // Verify frequent words persisted across app restart
    await app.close(); app = null;
    app = await electron.launch({ executablePath: require('electron'), args });
    page = await app.firstWindow();
    await page.locator('#scan-button').click();
    const chipsText = await page.locator('#scan-frequent-terms').innerText();
    assert(chipsText.includes('mudanza express'), `Expected saved frequent term in chips: ${chipsText}`);
    assert.equal(await page.locator('#scan-results article').count(), 2, 'Saved scan matches should persist');
  } finally {
    if (app) await app.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
