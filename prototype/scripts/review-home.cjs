const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const {createServer}=require('./serve.cjs');
const fs=require('node:fs'),assert=require('node:assert/strict');
const out='preview/home';
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch({headless:true,channel:'chrome'});
  const page=await browser.newPage();const errors=[],results=[];
  page.on('pageerror',e=>errors.push(e.message));
  const base='http://127.0.0.1:'+server.address().port;
  async function load(){
   await page.goto(base,{waitUntil:'networkidle'});
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>{i.loading='eager';return i.decode();}));});
   await page.addStyleTag({content:'html{scroll-behavior:auto!important}'});
  }
  for(const [width,height] of [[320,740],[375,667],[390,844],[430,932],[768,1024],[1024,768],[1440,900],[1920,1080],[844,390]]){
   await page.setViewportSize({width,height});await load();
   const mode=await page.locator('html').getAttribute('data-handoff');
   assert.equal(mode,width<=900?(height>=520?'mobile':'off'):'on');
   assert(await page.evaluate(()=>document.fonts.check('16px Charsen')));
   const overflow=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width && r.right>innerWidth+1 && getComputedStyle(e).position!=='fixed';}).slice(0,20).map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right})));
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)){console.log(overflow);await page.screenshot({path:out+'/overflow.png',fullPage:true});}
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow '+width);
   await page.screenshot({path:`${out}/hero-${width}.png`});
   const positions=await page.evaluate(()=>{
    const s=document.querySelector('[data-sequence]'),t=document.querySelector('[data-stage]'),w=document.querySelector('[data-wall-frame]').getBoundingClientRect(),d=document.querySelector('[data-art-slot]').getBoundingClientRect();
    return document.documentElement.dataset.handoff==='mobile'?{start:Number(s.dataset.mobileStart),end:Number(s.dataset.mobileEnd)}:{start:0,end:s.offsetHeight-t.offsetHeight};
   });
   for(const progress of mode==='off'?[]:[.12,.5,.999,1.002]){
    await page.evaluate(y=>scrollTo(0,y),positions.start+(positions.end-positions.start)*progress);await page.waitForTimeout(100);
    if(progress===.5)await page.screenshot({path:`${out}/flight-${width}.png`});
    if(progress===.999){
     const delta=await page.evaluate(()=>{const a=document.querySelector('[data-travelling-art]').getBoundingClientRect(),b=document.querySelector('[data-art-slot] .framed-art').getBoundingClientRect();return Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y),Math.abs(a.width-b.width));});
     assert(delta<3,`Landing mismatch ${width}: ${delta}`);
    }
    if(progress===1.002)await page.screenshot({path:`${out}/materials-${width}.png`});
   }
   await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(100);
   if(mode==='mobile')assert.equal(await page.locator('html').getAttribute('data-flying'),'false');
   for(const section of ['routes','featured','journey','faq','practical']){
    await page.locator('#'+section).scrollIntoViewIfNeeded();await page.waitForTimeout(80);
    if(width===390||width===1440)await page.locator('#'+section).screenshot({path:`${out}/${section}-${width}.png`,style:'.site-header{visibility:hidden}'});
   }
   if(width===390||width===1440){
    await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(100);
    await page.screenshot({path:`${out}/full-page-live-${width}.png`,fullPage:true});
    // Also capture a readable, unpinned overview of every section.
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);
    await page.screenshot({path:`${out}/full-page-overview-${width}.png`,fullPage:true});
    await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(100);
   }
   results.push({width,height,mode,passed:true});
  }
  // User-facing interactions on a phone.
  await page.setViewportSize({width:390,height:844});await load();
  await page.locator('[data-open="mobile-nav"]').click();
  assert.equal(await page.locator('#mobile-nav').getAttribute('inert'),null);
  await page.locator('#mobile-nav [data-close]').focus();await page.keyboard.press('Shift+Tab');
  assert(await page.evaluate(()=>document.querySelector('#mobile-nav').contains(document.activeElement)),'Drawer focus trap');
  await page.locator('#mobile-nav [data-close]').click();
  await page.locator('#faq details').nth(1).locator('summary').click();
  assert.equal(await page.locator('#faq details').nth(1).evaluate(el=>el.open),true);
  const heart=page.locator('[data-wishlist]').first();await heart.click();
  assert.equal(await heart.getAttribute('aria-pressed'),'true');await load();
  assert.equal(await page.locator('[data-wishlist]').first().getAttribute('aria-pressed'),'true');
  await page.locator('[data-open="cart-drawer"]').click();
  assert.equal(await page.locator('#cart-drawer').getAttribute('inert'),null);
  await page.locator('#cart-drawer [data-close]').click();
  // Responsive remeasurement in the middle of the handoff.
  await page.evaluate(()=>scrollTo(0,450));await page.waitForTimeout(100);
  await page.setViewportSize({width:430,height:800});await page.waitForTimeout(100);
  await page.evaluate(()=>{scrollTo(0,Number(document.querySelector('[data-sequence]').dataset.mobileEnd)+1);});await page.waitForTimeout(100);
  assert.equal(await page.locator('html').getAttribute('data-flying'),'false');
  await page.emulateMedia({reducedMotion:'reduce'});await load();
  assert.equal(await page.locator('html').getAttribute('data-handoff'),'off');
  const noJS=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});await noJS.goto(base);
  assert(await noJS.locator('.hero-scene__frame .framed-art__cutout').isVisible());
  assert(await noJS.locator('.footer-rooms').isVisible());await noJS.close();
  assert.deepEqual(errors,[]);
  fs.writeFileSync(out+'/checks.json',JSON.stringify({results,errors,interactions:'Menu, cart drawer, FAQs, wishlist persistence, mid-flight resize, reverse scroll, reduced motion and no-JS passed.'},null,2));
  console.log('PASS: nine viewports, mobile/desktop landings, local image/font loading, interactions and fallbacks. Full-page captures: '+out);
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
