// M4 regression: exact wall origin, continuous travel, landing and mobile material cards.
const {chromium}=require('playwright-core'),{createServer}=require('./serve.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const out='preview/mobile-m4';fs.mkdirSync(out,{recursive:true});
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage(),base='http://127.0.0.1:'+server.address().port,errors=[],results=[];
  page.on('pageerror',e=>errors.push(e.message));
  const scroll=async y=>{await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(100);};
  for(const [width,height] of [[320,568],[360,640],[375,667],[390,844],[430,932],[768,1024],[844,390]]){
   await page.setViewportSize({width,height});await page.goto(base,{waitUntil:'networkidle'});
   await page.evaluate(()=>document.fonts.ready);await page.addStyleTag({content:'html{scroll-behavior:auto!important}'});
   const initial=await page.evaluate(()=>({buttons:document.querySelector('.hero-copy__actions').getBoundingClientRect().bottom,overflow:document.documentElement.scrollWidth>innerWidth}));
   assert(!initial.overflow);if(height>width)assert(initial.buttons<=height-12,`Hero buttons below first screen at ${width}: ${initial.buttons}`);
   await page.screenshot({path:`${out}/hero-${width}.png`});
   if(height<520){assert.equal(await page.locator('html').getAttribute('data-handoff'),'off');continue;}
   const initialDelta=await page.evaluate(()=>{const a=document.querySelector('[data-travelling-art]').getBoundingClientRect(),b=document.querySelector('[data-wall-frame]').getBoundingClientRect();return Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y),Math.abs(a.width-b.width));});assert(initialDelta<1,'Lift must start at the original wall frame');
   assert.equal(await page.locator('.anatomy__connectors').evaluate(e=>getComputedStyle(e).display),'none');
   assert.equal(await page.locator('.mobile-materials .hero-truth li').count(),3);
   assert(await page.locator('.mobile-materials .hero-truth').isHidden());
   assert.equal(await page.locator('.mobile-material-details h2').count(),0);
   assert.equal(await page.locator('.mobile-material-details .spec').count(),6);
   const {start,end}=await page.locator('[data-sequence]').evaluate(e=>({start:Number(e.dataset.mobileStart),end:Number(e.dataset.mobileEnd)}));
   assert(end>start);
   for(const progress of [.1,.35,.6,.85,1]){
    await scroll(start+(end-start)*progress+1);
    const rect=await page.evaluate(()=>{const selector=document.documentElement.dataset.flying==='true'?'[data-travelling-art]':'[data-art-slot] .framed-art';const element=document.querySelector(selector),r=element.getBoundingClientRect();return {opacity:getComputedStyle(element).opacity,visibility:getComputedStyle(element).visibility,top:r.top,bottom:r.bottom,header:document.querySelector('.site-header').getBoundingClientRect().bottom};});
    assert.equal(rect.opacity,'1');assert.equal(rect.visibility,'visible');
    assert(rect.top>=rect.header+20,`Artwork enters header at ${width}, ${progress}`);
    assert(rect.bottom<=height+1,`Artwork leaves viewport at ${width}, ${progress}`);
    await page.screenshot({path:`${out}/flight-${width}-${progress}.png`});
   }
   // Reproduce the reported problem: scroll up to inspect the landed artwork.
   const pauseEnd=await page.locator('[data-sequence]').evaluate(e=>e.offsetTop+e.offsetHeight-document.querySelector('[data-stage]').offsetHeight);
   for(const offset of [-60,-140,0,120,-80]){
    await scroll(pauseEnd+offset);
    assert.equal(await page.locator('html').getAttribute('data-flying'),'false',`Reverse scroll restarted flight at ${width}`);
    assert.equal(await page.locator('[data-art-slot] .framed-art').evaluate(e=>getComputedStyle(e).visibility),'visible');
   }
   await scroll(0);assert.equal(await page.locator('html').getAttribute('data-flying'),'false');
   await scroll(end+1);assert.equal(await page.locator('[data-art-slot] .framed-art').evaluate(e=>getComputedStyle(e).visibility),'visible',JSON.stringify(await page.evaluate(()=>({width:innerWidth,y:scrollY,start:document.querySelector('[data-sequence]').dataset.mobileStart,end:document.querySelector('[data-sequence]').dataset.mobileEnd})))+' requested '+end);
   results.push({width,height,firstScreen:height>width?'passed':'natural landscape scroll',landing:'passed',reverse:'passed'});
  }
  await page.setViewportSize({width:390,height:844});
  for(const slug of ['blossoms-in-ink','painted-in-gold','the-age-of-sail']){
   await page.goto(base+'/pages/collections/'+slug+'/index.html');
   const order=await page.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect();return {back:r('.browse-hero--detail .back-link').bottom,imageTop:r('.browse-hero--detail img').top,imageBottom:r('.browse-hero--detail img').bottom,text:r('.browse-detail-text').top};});
   assert(order.back<=order.imageTop&&order.imageBottom<=order.text);
   await page.screenshot({path:`${out}/collection-${slug}.png`});
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(out+'/checks.json',JSON.stringify({results,collections:3,errors},null,2));
  console.log('PASS M4: six portrait first screens, six continuous wall lifts/landings and landscape fallback and three collection back buttons.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
