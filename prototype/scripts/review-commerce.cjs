const fs=require('fs'),assert=require('assert/strict'),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core'),{createServer}=require('./serve.cjs');
(async()=>{const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'chrome'}),base='http://127.0.0.1:'+server.address().port,out='preview/commerce';fs.mkdirSync(out,{recursive:true});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const go=async route=>{await page.goto(base+'/'+route);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>{i.loading='eager';return i.decode().catch(()=>{});}));});};
 try{
 const routes=['index.html','shop-all/index.html','pages/collections/index.html','pages/art-styles/index.html','pages/about/index.html','pages/about/studio/index.html','pages/help/index.html','pages/contact/index.html','pages/policies/shipping/index.html','pages/policies/cancellation/index.html','pages/policies/privacy/index.html','pages/track/index.html','pages/cart/index.html','pages/checkout/index.html','product/index.html'];const results=[];
 for(const width of [390,1440]){await page.setViewportSize({width,height:900});await go('product/index.html');await page.evaluate(()=>{localStorage.clear();sessionStorage.clear();});await page.reload();await page.locator('#delivery-pincode').fill('400001');await page.locator('#delivery-check button').click();assert(await page.locator('#continue-checkout').isHidden());await page.locator('#main-cta').click();assert(await page.locator('#continue-checkout').isVisible());await page.locator('#continue-checkout').click();await page.waitForURL('**/pages/checkout/index.html');assert.equal(await page.locator('[name=pin]').inputValue(),'400001');assert.equal(await page.locator('[name=city]').inputValue(),'Mumbai');assert(await page.locator('[name=payment]').first().isVisible());await page.locator('[data-checkout-next]').click();assert((await page.locator('#error-name').textContent()).length>0);await page.locator('#checkout-sample').click();await page.locator('[name=pin]').fill('111111');await page.locator('[data-checkout-next]').click();assert((await page.locator('#checkout-status').textContent()).includes('could not'));await page.locator('[name=pin]').fill('744101');await page.locator('[data-checkout-next]').click();assert((await page.locator('#checkout-status').textContent()).includes('unavailable'));await page.locator('[name=pin]').fill('560001');assert.equal(await page.locator('[name=city]').inputValue(),'Bengaluru');await page.screenshot({path:out+'/checkout-filled-'+width+'.png',fullPage:true});await page.locator('[data-checkout-next]').click();await page.waitForURL('**/pages/order/demo/index.html');assert((await page.locator('#confirmation').textContent()).includes('The Lantern'));await page.waitForTimeout(2400);await page.screenshot({path:out+'/receipt-'+width+'.png',fullPage:true});const download=page.waitForEvent('download');await page.locator('#download-receipt').click();const file=await download;await file.saveAs(out+'/downloaded-receipt.pdf');assert.equal(fs.readFileSync(out+'/downloaded-receipt.pdf').subarray(0,8).toString(),'%PDF-1.4');await page.emulateMedia({media:'print'});await page.pdf({path:out+'/sample-receipt.pdf',format:'A4'});await page.emulateMedia({media:'screen'});const stored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('aalishaanOrderPreview')));assert(!('name' in stored)&&!('address' in stored));
 await go('pages/track/index.html');for(const mode of ['order','awb','mobile']){await page.locator('[data-track-mode='+mode+']').click();await page.locator('#track-sample').click();assert((await page.locator('#tracking-result').textContent()).includes(mode==='awb'?'On its way':'Being framed'));}await page.screenshot({path:out+'/tracking-'+width+'.png',fullPage:true});console.log('PASS commerce '+width);}
 await checkPublicIntegrity({page,browser,base,out,go,results});
 await go('pages/about/index.html');assert.equal(await page.locator('.help-category').count(),6);assert.equal(await page.locator('#order-policies,#privacy-policies,.help-popular').count(),0);await page.locator('.help-category').nth(3).click();await page.waitForURL('**/policies/cancellation/index.html');assert.equal(await page.locator('.policy-tabs a').count(),3);assert.equal(await page.locator('.policy-tabs a[href*=shipping]').count(),0);await go('pages/help/index.html');assert.equal(await page.locator('#questions details').count(),11);await page.locator('#faq-search').fill('paper');assert.equal(await page.locator('#questions > div:visible').count(),1);await page.locator('#faq-reset').click();
 for(const p of require('../data/products.json')){await go('pages/artworks/'+p.slug+'/index.html');const images=await page.locator('#wall-grid img').evaluateAll(els=>els.map(i=>i.src));assert.equal(images.length,6);assert(images[0].includes('/artwork-originals/'));for(let i=3;i<6;i++)assert(images[i].includes('frame-'));assert.equal(await page.locator('#pd-help details').count(),7);}
 await go('index.html');await page.locator('.newsletter-form input').fill('sample@example.com');await page.locator('.newsletter-form button').click();assert((await page.locator('.newsletter-status').textContent()).includes('No subscription'));assert.deepEqual(errors,[]);fs.writeFileSync(out+'/results.json',JSON.stringify({results,errors,journey:'passed'},null,2));console.log('PASS R11 commerce: checkout validation/carryover, receipt download, tracking modes, navigation, FAQs and 22 galleries');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});

async function checkPublicIntegrity({page,browser,base,out,go,results}){
 // The same product and finish must remain one cart line, including after editing another finish.
 await go('product/index.html');
 await page.evaluate(()=>{const p=window.AalishaanData.products.find(p=>p.slug==='the-lantern-that-outlasted-the-gale');window.AalishaanBag.save([{slug:p.slug,frame:'white',quantity:98},{slug:p.slug,frame:'white',quantity:1},{slug:p.slug,frame:'black',quantity:2}]);});
 await page.locator('input[name=frame][value=white]').check({force:true});await page.locator('#main-cta').click();
 assert.match(await page.locator('#pd-notice').textContent(),/already has 99/);
 await go('pages/cart/index.html');assert.equal(await page.locator('#cart-page-items .bag-row').count(),2);
 await page.locator('[data-frame="1"]').selectOption('white');
 await page.waitForFunction(()=>document.querySelectorAll('#cart-page-items .bag-row').length===1);
 assert.equal(await page.locator('[data-quantity="0"]').inputValue(),'99');
 await page.locator('[data-quantity="0"]').fill('3');await page.locator('[data-quantity="0"]').press('Tab');
 await page.reload();assert.equal(await page.locator('[data-quantity="0"]').inputValue(),'3');
 results.push('Cart persistence, merged variants and quantity boundaries');

 // Modal navigation isolates the background from keyboard and assistive technology, then restores focus.
 const opener=page.locator('[data-open="cart-drawer"]').first();await opener.click();
 assert(await page.locator('main').evaluate(el=>el.inert));assert(await page.locator('#site-header').evaluate(el=>el.inert));
 await page.keyboard.press('Shift+Tab');assert(await page.locator('#cart-drawer').evaluate(el=>el.contains(document.activeElement)));
 await page.keyboard.press('Escape');assert(!(await page.locator('main').evaluate(el=>el.inert)));assert(await opener.evaluate(el=>el===document.activeElement));
 results.push('Drawer background isolation and keyboard focus return');

 // Returning to checkout after confirmation must not retain a disabled submit button from its previous submission.
 await go('pages/checkout/index.html');await page.locator('#checkout-sample').click();await page.locator('[data-checkout-next]').click();await page.waitForURL('**/pages/order/demo/index.html');
 await page.goBack();await page.waitForURL('**/pages/checkout/index.html');assert(await page.locator('[data-checkout-next]').isEnabled());
 results.push('Checkout remains usable after browser Back');

 // Saved hearts can be retrieved from Shop and removed without stranding keyboard focus in a hidden card.
 await go('index.html');await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('aalishaan-wishlist-'))localStorage.removeItem(key);});await page.reload();
 const slug=await page.locator('.art-card').first().getAttribute('data-product');await page.locator('[data-wishlist]').first().click();
 await go('shop-all/index.html?saved=1');assert.equal(await page.locator('.catalogue-grid .art-card:visible').count(),1);assert.equal(await page.locator('.catalogue-grid .art-card:visible').getAttribute('data-product'),slug);
 await page.setViewportSize({width:390,height:900});await page.screenshot({path:out+'/saved-artworks-390.png',fullPage:true});
 await page.locator('.catalogue-grid .art-card:visible [data-wishlist]').click();assert(await page.locator('.empty-results').isVisible());assert(await page.locator('[data-catalogue-title]').evaluate(el=>el===document.activeElement));
 await page.locator('[data-reset-filters]').click();assert(await page.locator('.empty-results').isVisible());await page.locator('[data-saved-note] a').click();await page.waitForFunction(()=>document.querySelectorAll('.catalogue-grid .art-card:not([hidden])').length===22);
 results.push('Wishlist retrieval, removal, empty recovery and mobile layout');

 // Clearing public selections must leave independent Admin records and unrelated browser keys intact.
 await go('pages/policies/cookies/index.html');
 await page.evaluate(()=>{localStorage.setItem('aalishaan-admin-integrity-test','private-record');localStorage.setItem('unrelated-key','keep');localStorage.setItem('aalishaan-wishlist-test','true');localStorage.setItem('aalishaanDeliveryCheck',JSON.stringify({pincode:'400001'}));sessionStorage.setItem('aalishaan-frame-test','black');sessionStorage.setItem('aalishaanOrderPreview','{}');});
 await page.locator('#clear-preview').click();const cleared=await page.evaluate(()=>({admin:localStorage.getItem('aalishaan-admin-integrity-test'),other:localStorage.getItem('unrelated-key'),wishlist:localStorage.getItem('aalishaan-wishlist-test'),delivery:localStorage.getItem('aalishaanDeliveryCheck'),frame:sessionStorage.getItem('aalishaan-frame-test'),order:sessionStorage.getItem('aalishaanOrderPreview'),bag:window.AalishaanBag.read()}));
 assert.deepEqual(cleared,{admin:'private-record',other:'keep',wishlist:null,delivery:null,frame:null,order:null,bag:[]});
 await page.locator('[data-open="cart-drawer"]').first().click();assert.equal(await page.locator('#cart-drawer .button--primary').textContent(),'Explore artworks');await page.keyboard.press('Escape');
 results.push('Storefront reset preserves Admin state; empty cart recovery');

 // Stale or malformed stored delivery estimates are recomputed from the validated PIN.
 await go('product/index.html');await page.evaluate(()=>localStorage.setItem('aalishaanDeliveryCheck',JSON.stringify({pincode:'400001',status:'serviceable',estimate:{from:'bad',to:'bad'}})));await page.reload();
 assert.match(await page.locator('#delivery-result').textContent(),/Delivery available/);
 results.push('Stale delivery estimate recovery');

 const noJs=await browser.newContext({javaScriptEnabled:false});const plain=await noJs.newPage();
 try{for(const route of ['index.html','pages/contact/index.html']){await plain.goto(base+'/'+route);assert(await plain.locator('.newsletter-form button').isDisabled());if(route.includes('contact'))assert(await plain.locator('#contact-form button').isDisabled());const address=plain.url();await plain.locator('.newsletter-form input').fill('sample@example.com');await plain.locator('.newsletter-form input').press('Enter');await plain.waitForTimeout(150);assert.equal(plain.url(),address);}}finally{await noJs.close();}
 results.push('No-JavaScript forms cannot submit personal data through a URL');

 const blocked=await browser.newContext();await blocked.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Unavailable','QuotaExceededError');};});const blockedPage=await blocked.newPage();
 try{await blockedPage.goto(base+'/product/index.html');await blockedPage.locator('#main-cta').click();assert.match(await blockedPage.locator('#pd-notice').textContent(),/kept on this page only/);assert(await blockedPage.locator('#continue-checkout').isHidden());assert.equal(await blockedPage.locator('.cart-count').first().textContent(),'1');}finally{await blocked.close();}
 results.push('Blocked browser storage has an honest cart recovery message');
 console.log('PASS public integrity: '+results.length+' regression groups');
}
