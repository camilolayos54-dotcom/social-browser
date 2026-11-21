const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { _electron: electron } = require('playwright-core');
test('title bar contains profiles and native controls; actions and agent stay on the right', {timeout:45000}, async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'social-actions-')); const args=['--disable-gpu',`--user-data-dir=${dir}`,path.resolve(__dirname,'..')];
  if(process.env.SOCIAL_BROWSER_TEST_NO_SANDBOX==='1')args.unshift('--no-sandbox'); let app;
  try {
    app=await electron.launch({executablePath:require('electron'),args});const page=await app.firstWindow();
    const layout = await page.evaluate(()=>({ overlay:navigator.windowControlsOverlay?.visible, rect:navigator.windowControlsOverlay?.getTitlebarAreaRect().toJSON(), bar:document.querySelector('.topbar').getBoundingClientRect().toJSON(), agentInRight:!!document.querySelector('#assistant #agent-access'), agentInTop:!!document.querySelector('.topbar #agent-access'), modelRail:!!document.querySelector('.assistant-rail [data-focus=model]'), headerAssistant:!!document.querySelector('.topbar #toggle-ai') }));
    if(process.platform!=='darwin') { assert.equal(layout.overlay,true); assert.equal(layout.bar.y,0); assert(layout.rect.width<layout.bar.width); }
    assert.equal(layout.agentInRight,true); assert.equal(layout.agentInTop,false); assert.equal(layout.modelRail,false); assert.equal(layout.headerAssistant,false);
    assert.equal(await page.locator('#agent-actions-dialog').count(),0);
    assert.equal(await page.locator('#assistant .right-action').count(),8);
    for (const action of await page.locator('#assistant .right-action').all()) assert.equal(await action.isVisible(),true);
    await page.locator('#scan-button').click(); assert.equal(await page.locator('#facebook-scan-dialog').evaluate(e=>e.open),true); await page.locator('#scan-close').click();
    await page.evaluate(() => { profile().savedFacebookSearches = [{id:'preset-1',name:'Mudanzas',phrase:'trasteos, mudanzas',location:'Medellín, Bello',exclude:'empleo',since:'',minutes:2}]; window.refreshSavedSearches(); window.__openTab = openTab; window.__startScan = startFacebookScan; openTab = url => { window.__savedUrl = url; }; startFacebookScan = (...args) => { window.__savedArgs = {phrase:args[1],seconds:args[2],filters:args[4]}; return Promise.resolve('ok'); }; });
    await page.locator('#actions-saved-search').selectOption('preset-1'); await page.locator('#actions-run-saved').click();
    const savedRun = await page.evaluate(() => ({url:window.__savedUrl, ...window.__savedArgs}));
    assert.match(savedRun.url,/facebook\.com\/search\/posts/); assert.equal(savedRun.seconds,120); assert.equal(savedRun.filters.location,'Medellín, Bello');
    await page.locator('#scan-close').click(); await page.evaluate(() => { openTab = window.__openTab; startFacebookScan = window.__startScan; });
    await page.locator('#close-ai').click(); await page.locator('.rail-direct[data-target="templates-button"]').click();
    assert.equal(await page.locator('#templates-dialog').evaluate(e=>e.open),true); await page.locator('#templates-close').click();
    await page.locator('#rail-agent').click(); assert.equal(await page.locator('#agent-dialog').evaluate(e=>e.open),true); await page.locator('#cancel-agent').click();
  } finally {if(app)await app.close();fs.rmSync(dir,{recursive:true,force:true});}
});
