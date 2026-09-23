// Exercise an actual static export below a project prefix, without development-server aliases.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const root=path.resolve(__dirname,'..'),site=path.join(root,'dist/site'),prefix='/prototype-check';
const env={...process.env,PAGES_BASE_PATH:prefix};
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.svg':'image/svg+xml','.otf':'font/otf'};
(async()=>{
 execFileSync(process.execPath,['scripts/export-site.cjs'],{cwd:root,env});
 execFileSync(process.execPath,['scripts/check-static.cjs'],{cwd:root,env,stdio:'inherit'});
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(!url.pathname.startsWith(prefix+'/')){res.writeHead(404).end('Outside project');return;}
  let file=path.resolve(site,'.'+decodeURIComponent(url.pathname.slice(prefix.length)));
  if(file!==site&&!file.startsWith(site+path.sep)){res.writeHead(403).end();return;}
  try{
   if(fs.statSync(file).isDirectory()){
    if(!url.pathname.endsWith('/')){res.writeHead(301,{Location:url.pathname+'/'+url.search}).end();return;}
    file=path.join(file,'index.html');
   }
   res.writeHead(200,{'Content-Type':types[path.extname(file)]||'text/plain'}).end(fs.readFileSync(file));
  }catch{res.writeHead(404,{'Content-Type':'text/html'}).end(fs.readFileSync(path.join(site,'404.html')));}
 });
 let browser;
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port,base=origin+prefix+'/';
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  const {pages,aliases}=require('../site-manifest.json');
  for(const file of new Set(['index.html','site-map.html',...pages.map(p=>p.file)])){
   await page.goto(base+file);
   await page.evaluate(()=>Promise.all([...document.images].filter(i=>i.getAttribute('src')).map(i=>{i.loading='eager';return i.decode();})));
  }
  console.log('PASS: exported pages, scripts and images under the project prefix.');
  fs.mkdirSync(path.join(root,'preview/static'),{recursive:true});
  for(const width of [390,1440]){
   await page.setViewportSize({width,height:900});
   for(const file of ['shop-all/index.html','pages/collections/index.html','pages/art-styles/index.html','pages/art-styles/gilded-peaks/index.html']){
    await page.goto(base+file);
    const background=await page.locator('.browse-hero--r9').evaluate(async el=>{
     const value=getComputedStyle(el).backgroundImage,urls=[...value.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(m=>m[1]);
     await Promise.all(urls.map(src=>{const img=new Image();img.src=src;return img.decode();}));return {value,urls};
    });
    assert.equal(background.urls.length,1,file+' hero image');
    assert(background.urls.every(url=>url.startsWith(base+'assets/')),file+' hero stays within project');
    assert(background.value.includes(width===390?'-600.webp':'-1600.webp'),file+' responsive hero');
    if(file==='pages/collections/index.html')await page.screenshot({path:path.join(root,`preview/static/collections-${width}.png`)});
   }
  }
  for(const [route,target] of Object.entries(aliases)){
   await page.goto(base+route.replace(/^\//,'')+(route==='/'?'':'/')+'?hosting_check=1#main');
   const canonical=prefix+'/'+target.split('?')[0];
   await page.waitForURL(url=>url.pathname===canonical||url.pathname===canonical.replace(/index\.html$/,''));
   assert.equal(new URL(page.url()).searchParams.get('hosting_check'),'1',route+' query');
   assert.equal(new URL(page.url()).hash,'#main',route+' hash');
  }
  await page.goto(base+'product/index.html');
  await page.locator('#main-cta').click();
  await page.locator('#continue-checkout').click();
  await page.waitForURL(base+'pages/checkout/index.html');
  assert(await page.locator('#checkout-form').isVisible());
  await page.goto(base+'admin/index.html#orders/record?id=AS-1001');
  assert((await page.locator('main').innerText()).includes('AS-1001'),'Admin deep-linked order under project prefix');
  await page.goto(base+'admin/index.html#settings/journeys');
  assert((await page.locator('main').innerText()).includes('US23'),'Admin story references under project prefix');
  assert.deepEqual(errors,[]);
  const missing=await page.goto(base+'missing/nested/page');assert.equal(missing.status(),404);
  assert.equal(await page.locator('base').getAttribute('href'),prefix+'/pages/');
  const home=await page.locator('a').evaluateAll(links=>links.find(a=>a.href.endsWith('/prototype-check/index.html'))?.href);
  assert(home,'Nested 404 links back into project');
  await page.goto(home);assert.equal(new URL(page.url()).pathname,prefix+'/index.html');
  assert.deepEqual(errors,['404 '+base+'missing/nested/page']);
  fs.mkdirSync(path.join(root,'preview/static'),{recursive:true});
  fs.writeFileSync(path.join(root,'preview/static/review.json'),JSON.stringify({pages:pages.length,aliases:Object.keys(aliases).length,prefix,checks:['All exported canonical pages and images','Responsive CSS heroes decode and stay inside project at 390/1440','Aliases preserve query/hash','Cart to checkout','Admin order/story deep links','Nested 404 recovery','No unexpected browser/network errors'],errors:[]},null,2)+'\n');
  console.log(`PASS: static project subfolder, ${pages.length} registered pages and directory, ${Object.keys(aliases).length} aliases with query/hash, image decoding, cart-to-checkout and nested 404 recovery.`);
 }finally{
  if(browser)await browser.close();
  await new Promise(r=>server.close(r));
  execFileSync(process.execPath,['scripts/export-site.cjs'],{cwd:root,stdio:'inherit'});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
