const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const http = require('node:http');
const { _electron: electron } = require('playwright-core');
test('filters visible posts, saves searches and tracks opportunities with reminders', { timeout:45000 }, async () => {
  const articles = [
    ['Necesito mudanzas en Medellín', '2026-10-10T12:00:00Z', '1'],
    ['Busco trasteos en Cali', '2026-10-10T12:00:00Z', '2'],
    ['Ofrezco empleo en mudanzas Medellin', '2026-10-10T12:00:00Z', '3'],
    ['Necesito trasteos Medellin antiguos', '2020-01-01T12:00:00Z', '4'],
    ['Necesito trasteos Medellin sin fecha', '', '5'],
    ['Necesito mudanzas en Envigado', '2026-10-10T12:00:00Z', '6']
  ].map(([text,date,id])=>`<article><p>${text}</p>${date ? `<time datetime="${date}">Fecha</time>` : ''}<a href="https://facebook.com/example/posts/${id}">Ver publicación</a></article>`).join('');
  const server=http.createServer((_,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8'); res.end(`<title>Filtros</title>${articles}`);}); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'social-filters-')); const args=['--disable-gpu',`--user-data-dir=${dir}`,path.resolve(__dirname,'..')];
  if(process.env.SOCIAL_BROWSER_TEST_NO_SANDBOX==='1')args.unshift('--no-sandbox'); let app;
  try {
    app=await electron.launch({executablePath:require('electron'),args}); let page=await app.firstWindow();
    await page.locator('#url').fill(`http://127.0.0.1:${server.address().port}/`); await page.locator('#address-form').dispatchEvent('submit');
    await page.waitForFunction(()=>document.querySelector('.tab')?.textContent.includes('Filtros'));
    await page.evaluate(()=>{facebookPage=()=>true;}); await page.locator('#scan-button').click();
    await page.locator('#scan-phrase').fill('trasteos, mudanzas'); await page.locator('#scan-location').fill('Medellín, Envigado'); await page.locator('#scan-exclude').fill('empleo');
    await page.locator('#scan-since').fill('2026-01-01'); await page.locator('#scan-minutes').fill('0.1'); await page.locator('#scan-preset-name').fill('Prueba Medellín');
    await page.locator('#scan-save-preset').click(); assert.match(await page.locator('#scan-status').innerText(), /guardada/);
    await page.locator('#scan-start').click(); await page.waitForFunction(()=>document.querySelector('#scan-results').textContent.includes('Necesito mudanzas'), null, {timeout:5000});
    assert.equal(await page.locator('#scan-results article').count(),2); await page.locator('#scan-stop').click(); await page.waitForFunction(()=>document.querySelector('#scan-status').textContent.includes('Detenida'));
    await page.locator('#scan-results article').first().getByRole('button',{name:'Guardar oportunidad'}).click(); await page.locator('#scan-close').click();
    const localUrl = `http://127.0.0.1:${server.address().port}/`;
    await page.evaluate(url => { window.__originalOpenTab = openTab; openTab = () => window.__originalOpenTab(url); }, localUrl);
    await page.locator('#actions-saved-search').selectOption({label:'Prueba Medellín'}); await page.locator('#actions-run-saved').click();
    await page.waitForFunction(() => !document.querySelector('#scan-stop').hidden, null, {timeout:10000});
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('social-state')).profiles[0].facebookScan.matches.length === 2);
    await page.locator('#scan-stop').click(); await page.waitForFunction(() => document.querySelector('#scan-status').textContent.includes('Detenida'));
    await page.locator('#scan-close').click(); await page.evaluate(() => { openTab = window.__originalOpenTab; });
    await page.locator('#opportunities-button').click(); await page.locator('.opportunity-tracking select').selectOption('contactada');
    await page.locator('.opportunity-tracking textarea').fill('Pidió cotización'); await page.locator('.opportunity-tracking input').fill('2000-01-01T12:00');
    await page.locator('.opportunity-tracking button').click(); await page.waitForFunction(()=>JSON.parse(localStorage.getItem('social-state')).profiles[0].opportunities[0].followup.reminded);
    await page.evaluate(() => { const data = JSON.parse(localStorage.getItem('social-state')); data.profiles[0].facebookScan.status = 'En curso'; localStorage.setItem('social-state', JSON.stringify(data)); });
    await app.close(); app=null; app=await electron.launch({executablePath:require('electron'),args}); page=await app.firstWindow();
    await page.locator('#scan-button').click(); assert.match(await page.locator('#scan-status').textContent(), /interrumpida/); await page.locator('#scan-preset').selectOption({label:'Prueba Medellín'});
    assert.equal(await page.locator('#scan-exclude').inputValue(),'empleo'); assert.equal(await page.locator('#scan-location').inputValue(),'Medellín, Envigado');
    await page.locator('#scan-close').click(); await page.locator('#opportunities-button').click();
    assert.equal(await page.locator('.opportunity-tracking select').inputValue(),'contactada'); assert.equal(await page.locator('.opportunity-tracking textarea').inputValue(),'Pidió cotización');
  } finally { if(app)await app.close(); await new Promise(resolve=>server.close(resolve)); fs.rmSync(dir,{recursive:true,force:true}); }
});
