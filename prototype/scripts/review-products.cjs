// Product R3 browser review: every artwork page, every frame, gallery views, lightbox, cart, sticky bar and layout at seven widths.
// Requires Playwright (set PLAYWRIGHT_MODULE to an installed copy) and a local Chrome (channel "chrome").
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const {createServer} = require('./serve.cjs');
const fs = require('node:fs'), assert = require('node:assert/strict');
(async () => {
 const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
 const browser = await chromium.launch({headless:true, channel:'chrome'}), base = 'http://127.0.0.1:' + server.address().port;
 fs.mkdirSync('preview/products', {recursive:true});
 const errors = [], failed = [], checks = [];
 const names = {black:'Black', white:'White', 'antique-gold':'Antique Gold'};
 try {
  const page = await browser.newPage({viewport:{width:1440, height:1000}});
  page.on('pageerror', e => errors.push(e.message)); page.on('response', r => { if (r.url().startsWith(base) && r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });
  async function decode() { await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].filter(i => i.getAttribute('src')).map(i => { i.loading = 'eager'; return i.decode().catch(() => { throw Error('Cannot decode ' + i.src); }); })); }); }
  const products = require('../data/products.json');
  for (const width of [320, 390, 650, 768, 1024, 1440, 1920]) {
   await page.setViewportSize({width, height: width < 700 ? 844 : 1000}); await page.goto(base + '/product/index.html'); await decode();
   assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'overflow ' + width);
   assert.equal(await page.locator('h1').count(), 1); assert.equal(await page.locator('#wall-grid .pd-tile').count(), 6);
   assert.equal(await page.locator('[data-mega]').count(), 0, 'dropdown triggers must be gone');
   if ([390, 1440].includes(width)) { await page.screenshot({path:`preview/products/lantern-${width}.png`, fullPage:true}); await page.locator('.pd-wall').screenshot({path:`preview/products/gallery-${width}.png`}); }
   checks.push('Lantern layout ' + width);
  }
  await page.setViewportSize({width:390, height:844});
  for (const p of products) {
   await page.goto(base + `/pages/artworks/${p.slug}/index.html`); await decode();
   assert.equal(await page.locator('h1').textContent(), p.title);
   assert.equal(await page.locator('input[name=frame]:checked').inputValue(), p.suggestedFrame);
   assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'overflow ' + p.slug);
   assert.equal(await page.locator('.pd-story__copy p').count() >= 3, true, 'story paragraphs ' + p.slug);
   assert.equal(await page.locator('.pd-related .art-card').count(), 3, 'related ' + p.slug);
   for (const f of ['black', 'white', 'antique-gold']) {
    await page.locator(`input[name=frame][value="${f}"]`).check({force:true});
    for (const [v, obj] of [['framed', p.frames[f].image], ['closeup', p.frames[f].closeup], ['paper', p.paper]]) {
     await page.locator(`[data-view="${v}"]`).click();
     assert((await page.locator('#stage-image').getAttribute('src')).endsWith(obj.src.split('/').pop()), `${p.slug} ${f} ${v}`);
    }
    assert.equal(await page.locator('#craft-name').textContent(), names[f]);
    assert.equal(await page.locator('#wall-grid figcaption').filter({hasText:`Framed in ${names[f]}`}).count(), 1, `wall follows frame ${p.slug} ${f}`);
   }
   await page.locator('[data-view="framed"]').click();
   checks.push('Artwork ' + p.slug);
  }
  // Interactions on the Lantern page.
  await page.setViewportSize({width:1440, height:1000}); await page.goto(base + '/product/index.html'); await decode();
  await page.locator('#wall-grid button').nth(1).click(); assert(await page.locator('#lightbox').evaluate(d => d.open), 'lightbox opens');
  await page.keyboard.press('ArrowRight'); assert.match(await page.locator('#lightbox-caption').textContent(), /3 of 6/);
  await page.keyboard.press('Escape'); assert(!(await page.locator('#lightbox').evaluate(d => d.open)), 'lightbox closes');
  await page.locator('input[name=frame][value="white"]').check({force:true}); await page.locator('#main-cta').click();
  assert.equal(await page.locator('.cart-count').first().textContent(), '1');
  await page.reload(); await decode(); assert.equal(await page.locator('input[name=frame]:checked').inputValue(), 'white', 'frame persists');
  await page.locator('[data-open="cart-drawer"]').first().click(); assert.equal(await page.locator('.pd-bag-item').count(), 1); await page.keyboard.press('Escape');
  await page.setViewportSize({width:390, height:844}); await page.evaluate(() => scrollTo(0, 1800)); await page.waitForTimeout(300);
  assert.equal(await page.locator('#pd-sticky').getAttribute('data-visible'), 'true', 'sticky bar shows');
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(300);
  assert.equal(await page.locator('#pd-sticky').getAttribute('data-visible'), 'false', 'sticky bar yields to footer');
  await page.evaluate(() => localStorage.clear()); checks.push('Interactions');
  await page.emulateMedia({reducedMotion:'reduce'}); await page.goto(base + '/product/index.html'); await decode(); checks.push('Reduced motion');
  const noJs = await browser.newContext({javaScriptEnabled:false}); const plain = await noJs.newPage(); await plain.goto(base + '/product/index.html');
  assert.equal(await plain.locator('h1').textContent(), 'The Lantern That Outlasted the Gale'); assert.equal(await plain.locator('#wall-grid .pd-tile').count(), 6); await noJs.close(); checks.push('No JavaScript');
  assert.deepEqual(errors, []); assert.deepEqual(failed, []);
  fs.writeFileSync('preview/products/results.json', JSON.stringify({date:new Date().toISOString(), checks}, null, 2));
  console.log(`PASS: ${checks.length} review groups, ${products.length} artworks.`);
 } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
