const assert=require('node:assert/strict');
const {createServer}=require('./serve.cjs');
const {pages,aliases}=require('../site-manifest.json');
(async()=>{
 const server=createServer();
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try {
  for(const route of [...pages.map(p=>'/'+p.file),...Object.keys(aliases)]){
   const response=await fetch(base+route);
   assert.equal(response.status,200,route);
   assert.match(response.headers.get('content-type'),/text\/html/,route);
   await response.arrayBuffer();
  }
  const missing=await fetch(base+'/missing/nested/page');
  assert.equal(missing.status,404);
  const body=await missing.text();
  assert.match(body,/<base href="\/pages\/">/);
  assert.match(body,/<title>404 — Page not found/);
  const head=await fetch(base+'/missing/nested/page',{method:'HEAD'});
  assert.equal(head.status,404);
  assert.equal(await head.text(),'');
  const redirect=await fetch(base+'/shop?collection=Painted%20in%20Gold',{redirect:'manual'});
  assert.equal(redirect.headers.get('location'),'/shop-all/index.html?collection=Painted+in+Gold');
  console.log(`PASS: ${pages.length} pages and ${Object.keys(aliases).length} aliases served; custom nested 404, HEAD and query preservation verified.`);
 } finally {await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
