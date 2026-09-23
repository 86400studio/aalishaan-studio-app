// W1 wireframe review: navigation and illustrative states; never calls business services.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const {createServer}=require('./serve.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const out='preview/wireframe',hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
(async()=>{
 const protectedFiles=['index.html','docs/ADMIN-FINAL-FEATURES.md','shared/prototype-data.js','data/products.json'];
 const beforeFiles=Object.fromEntries(protectedFiles.map(f=>[f,hash(f)]));
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 const result={routes:[],captures:0,widths:[390,768,1440],checks:[],errors:[]};fs.mkdirSync(out,{recursive:true});
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:960}}),origin=`http://127.0.0.1:${server.address().port}`,base=origin+'/admin/wireframe/index.html';
  page.on('pageerror',e=>result.errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)result.errors.push(r.status()+' '+r.url());});
  page.on('request',r=>{if(r.method()!=='GET'||!r.url().startsWith(origin))result.errors.push('Unexpected request: '+r.method()+' '+r.url());});
  await page.goto(base);assert.equal(await page.locator('h1').textContent(),'Today');
  await page.evaluate(()=>{localStorage.setItem('wireframe-sentinel','unchanged');sessionStorage.setItem('wireframe-session','unchanged');});
  const beforeStorage=await page.evaluate(()=>JSON.stringify([{...localStorage},{...sessionStorage}]));
  const go=async route=>{await page.goto(base+'#'+route);await page.waitForFunction(()=>document.activeElement?.tagName==='H1');};
  const menus=['orders','customers','products','support','reports','tools','settings'];
  for(const width of result.widths){
   await page.setViewportSize({width,height:960});
   for(const route of [...menus,'orders/record','orders/quality?state=failed','orders/refund?state=conflict','support/claim','settings/readiness']){
    await go(route);assert.equal(await page.locator('h1').count(),1);
    assert.equal(await page.locator('#navigation a').count(),6);
    assert.equal(await page.locator('#settings-navigation a').count(),1);
    assert.equal(await page.locator('[data-area][aria-current=page]').count(),1,route);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),route+' overflow '+width);
    await page.screenshot({path:`${out}/w1-${route.replace(/[^a-z\d-]/g,'-')}-${width}.png`,fullPage:true});result.captures++;
   }
  }
  await page.setViewportSize({width:1440,height:960});
  const discovered=new Set(menus);
  for(const route of discovered){
   assert(discovered.size<350,'Unbounded wireframe routes');await go(route);
   assert.notEqual(await page.locator('h1').innerText(),'Page not found',route);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),route+' desktop overflow');
   (await page.locator('main a[href^="#"]').evaluateAll(els=>els.map(e=>e.getAttribute('href').slice(1)))).forEach(r=>discovered.add(r));
   const states=await page.locator('[data-scenario]').evaluateAll(els=>els.map(e=>[e.dataset.scenario,[...e.options].map(o=>o.value)]));
   for(const [key,values] of states)for(const value of values){const [name,query='']=route.split('?'),p=new URLSearchParams(query);p.set(key,value);discovered.add(name+'?'+p);}
   result.routes.push(route);
  }
  result.checks.push('Every linked screen and selectable sample state resolves without JavaScript or network errors.');
  const scope=await page.evaluate(()=>window.AdminWireframeScope),stories=await page.evaluate(()=>window.AdminWireframeStories);
  const spec=fs.readFileSync('docs/ADMIN-FINAL-FEATURES.md','utf8');
  const ids=[...spec.matchAll(/\*\*([OCPSRG]\d+) —/g)].map(m=>m[1]);
  assert.equal(ids.length,26);assert.deepEqual(scope.map(x=>x[0]).sort(),ids.sort());assert.equal(stories.length,23);
  for(const [,title,to] of scope){await go(to);assert.notEqual(await page.locator('h1').innerText(),'Page not found',title);}
  await go('orders/record?stage=0');
  for(let i=0;i<11;i++){
   assert.equal(await page.locator('.journey-rail [aria-current=step] span').textContent(),String(i+1));
   assert.equal(await page.locator('h1').textContent(),'Order AS-1001');
   if(i===0)assert(await page.getByText('Payment: Pending',{exact:true}).isVisible());
   if(i===7)assert(await page.getByText('Fulfilment: Pickup booked',{exact:true}).isVisible());
   if(i<10)await page.getByRole('link',{name:'Preview next stage →',exact:true}).click();
  }
  assert(await page.getByText('Settlement: Not bank-matched',{exact:true}).isVisible());
  await go('orders/record?id=AS-1003');assert(await page.getByText('Fulfilment: Part delivered',{exact:true}).isVisible());
  result.checks.push('Normal 11-stage order walkthrough and split-delivery example retain separate financial/fulfilment states.');
  await go('orders/all');await page.getByLabel('Search orders',{exact:true}).fill('Meera');
  assert.equal(await page.locator('#order-count').textContent(),'1 matching orders');
  await page.getByRole('link',{name:'Open order',exact:true}).click();
  await page.getByRole('link',{name:'← Back to retained order view',exact:true}).click();
  assert.equal(await page.getByLabel('Search orders',{exact:true}).inputValue(),'Meera');
  await page.getByLabel('Search orders',{exact:true}).fill('no-such-order');assert(await page.getByRole('heading',{name:'No matching orders',exact:true}).isVisible());
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();assert.equal(await page.locator('#order-count').textContent(),'4 matching orders');
  await go('settings');await page.getByLabel('Find a task in Settings',{exact:true}).fill('access');assert.equal(await page.locator('.card:visible').count(),1);
  await page.getByLabel('Find a task in Settings',{exact:true}).fill('no-match');assert(await page.locator('#no-results').isVisible());
  await page.getByRole('button',{name:'Show all tasks',exact:true}).click();assert.equal(await page.locator('.card:visible').count(),4);
  await page.locator('#record-search').fill('AWB-DEMO-1001');await page.locator('#global-search button').click();
  await page.getByRole('link',{name:'Open original record',exact:true}).click();assert.equal(await page.locator('h1').textContent(),'Parcel PAR-1001');
  await page.goBack();assert.equal(await page.locator('h1').textContent(),'Search records');
  await page.locator('#record-search').fill('<img src=x onerror=alert(1)>');await page.locator('#global-search button').click();assert.equal(await page.locator('main img').count(),0);
  result.checks.push('Record search, retained order filters, task search, no-match recovery, browser back and escaped search text.');
  await go('orders/record');const disclosure=page.getByText('Purchase snapshot and requested changes',{exact:true});await disclosure.focus();await page.keyboard.press('Enter');assert(await disclosure.evaluate(el=>el.parentElement.open));
  await go('products/artwork');assert(await page.getByRole('button',{name:'Publish artwork',exact:true}).isDisabled());
  await go('orders/refund');assert(await page.getByRole('button',{name:'Submit to Razorpay',exact:true}).isDisabled());
  await go('tools');assert.equal(await page.locator('.planned').count(),3);assert.equal(await page.locator('main button').count(),0);
  assert.equal(await page.evaluate(()=>JSON.stringify([{...localStorage},{...sessionStorage}])),beforeStorage);
  for(const [file,before] of Object.entries(beforeFiles))assert.equal(hash(file),before,file+' changed');
  assert.deepEqual(result.errors,[]);
  result.checks.push('Keyboard disclosure, inactive operations, three planned tools, no business requests/storage changes, and protected source hashes.');
  fs.writeFileSync(out+'/w1-review.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({routes:result.routes.length,captures:result.captures,features:scope.length,stories:stories.length,checks:result.checks},null,2));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
