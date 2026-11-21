const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const http = require('node:http');
const { _electron: electron } = require('playwright-core');
test('a prepared reply cannot be sent until explicitly approved and rejects changed content', {timeout:45000}, async () => {
  const server = http.createServer((_,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8'); res.end('<title>Publicación de prueba</title><form><textarea aria-label="Escribe un comentario"></textarea><button type="button" onclick="document.body.dataset.sends=String(Number(document.body.dataset.sends||0)+1)">Publicar</button></form>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); const dir=fs.mkdtempSync(path.join(os.tmpdir(),'social-reply-'));
  const args=['--disable-gpu',`--user-data-dir=${dir}`,path.resolve(__dirname,'..')]; if(process.env.SOCIAL_BROWSER_TEST_NO_SANDBOX==='1')args.unshift('--no-sandbox'); let app;
  try {
    app=await electron.launch({executablePath:require('electron'),args}); const page=await app.firstWindow(); const url=`http://127.0.0.1:${server.address().port}/`;
    await page.locator('#url').fill(url); await page.locator('#address-form').dispatchEvent('submit'); await page.waitForFunction(()=>document.querySelector('.tab')?.textContent.includes('Publicación de prueba'));
    // Only the isolated UI test replaces the Facebook-host predicate; no network post is made.
    await page.evaluate(target=>{facebookPage=()=>true;openReplyReview(profile(),{url:target,text:'Necesito un servicio'});},url);
    await page.locator('#reply-text').fill('Hola, puedo ayudarte.'); await page.locator('#reply-prepare').click(); await page.locator('#prepare-confirm').click();
    await page.waitForFunction(()=>!document.querySelector('#reply-submit').disabled);
    const sends = () => page.evaluate(async()=>currentView().executeJavaScript('document.body.dataset.sends || "0"'));
    assert.equal(await sends(),'0'); await page.locator('#reply-submit').click(); assert.equal(await sends(),'0');
    assert.match(await page.locator('#reply-confirm-text').textContent(),/Hola/); await page.locator('#reply-cancel-send').click(); assert.equal(await sends(),'0');
    await page.evaluate(async()=>currentView().executeJavaScript("document.querySelector('textarea').value='cambiado'"));
    await page.locator('#reply-submit').click(); assert.match(await page.locator('#reply-status').textContent(),/cambiaron/); assert.equal(await sends(),'0');
    await page.locator('#reply-prepare').click(); await page.locator('#prepare-confirm').click(); await page.waitForFunction(()=>!document.querySelector('#reply-submit').disabled);
    await page.locator('#reply-submit').click(); await page.locator('#reply-confirm-send').click();
    await page.waitForFunction(()=>document.querySelector('#reply-status').textContent.includes('Se pulsó')); assert.equal(await sends(),'1');
  } finally {if(app)await app.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
});
