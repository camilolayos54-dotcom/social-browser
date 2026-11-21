const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const https = require('node:https'); const { execFileSync } = require('node:child_process');
const { _electron: electron } = require('playwright-core');
test('preselected images attach only to the reviewed form before approval', {timeout:45000}, async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'social-images-')); const key=path.join(dir,'key.pem'), cert=path.join(dir,'cert.pem'), image=path.join(dir,'foto.png');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-keyout',key,'-out',cert,'-sha256','-days','1','-nodes','-subj','/CN=www.facebook.com'],{stdio:'ignore'});
  fs.writeFileSync(image,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAIAAADZSiLoAAAAEElEQVR4nGP8zwAFTAyYLAAdWwEFNX6VDAAAAABJRU5ErkJggg==','base64'));
  const server=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},(_,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<title>Publicación con imagen</title><form><textarea aria-label="Comentario"></textarea><input type="file" accept="image/*" multiple><button type="button" onclick="document.body.dataset.sent=\'yes\'">Publicar</button></form>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const args=['--disable-gpu','--ignore-certificate-errors','--no-proxy-server','--host-resolver-rules=MAP www.facebook.com 127.0.0.1',`--user-data-dir=${path.join(dir,'data')}`,path.resolve(__dirname,'..')];
  if(process.env.SOCIAL_BROWSER_TEST_NO_SANDBOX==='1')args.unshift('--no-sandbox'); let app;
  try {
    app=await electron.launch({executablePath:require('electron'),args}); const page=await app.firstWindow(); const url=`https://www.facebook.com:${server.address().port}/posts/123`;
    await page.locator('#url').fill(url); await page.locator('#address-form').dispatchEvent('submit'); await page.waitForFunction(()=>document.querySelector('.tab')?.textContent.includes('Publicación con imagen'));
    await page.evaluate(({url,image})=>{profile().messageTemplates=[{id:'plantilla',name:'Con foto',text:'Hola',network:'Facebook',images:[image]}]; openReplyReview(profile(),{url,text:'Publicación local'});},{url,image});
    await page.locator('#reply-template').selectOption('plantilla'); await page.waitForFunction(() => document.querySelector('#reply-image-previews figure')); assert.match(await page.locator('#reply-image-previews').innerText(), /foto\.png/); assert.equal(await page.locator('#reply-image-previews img').count(),1); await page.locator('#reply-prepare').click();
    assert.equal(await page.evaluate(async()=>currentView().executeJavaScript("document.querySelector('input[type=file]').files.length")),0);
    await page.locator('#prepare-cancel').click();
    assert.equal(await page.evaluate(async()=>currentView().executeJavaScript("document.querySelector('textarea').value")),'');
    await page.locator('#reply-prepare').click(); await page.locator('#prepare-confirm').click();
    await page.waitForFunction(()=>!document.querySelector('#reply-submit').disabled, null, {timeout:10000}).catch(async e=>{throw new Error(`${await page.locator('#reply-status').textContent()} ${e.message}`)});
    assert.equal(await page.evaluate(async()=>currentView().executeJavaScript("document.querySelector('input[type=file]').files[0].name")),'foto.png');
    assert.equal(await page.evaluate(async()=>currentView().executeJavaScript("document.body.dataset.sent || 'no'")),'no');
    await page.locator('#reply-submit').click(); assert.match(await page.locator('#reply-confirm-images').textContent(),/foto\.png/);
    await page.locator('#reply-confirm-send').click(); await page.waitForFunction(()=>document.querySelector('#reply-status').textContent.includes('Se pulsó'));
    assert.equal(await page.evaluate(async()=>currentView().executeJavaScript('document.body.dataset.sent')),'yes');
  } finally {if(app)await app.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});}
});
