const fs=require('fs'),assert=require('assert/strict');
const products=require('../data/catalogue.json');
const web=require('../data/web-artwork-map.json');
assert.equal(products.length,22);
assert.deepEqual(products.reduce((counts,p)=>(counts[p.suggestedFrame]++,counts),{'antique-gold':0,white:0,black:0}),{'antique-gold':8,white:8,black:6});
const paperPaths=new Set();
for(const p of products){
  assert.equal(p.gallery.length,7,p.slug);
  assert.equal(new Set(p.gallery).size,7,p.slug);
  assert.equal(p.image,p.frames[p.suggestedFrame].image,p.slug);
  assert.equal(p.gallery[0],p.image,p.slug);
  assert(p.image.endsWith(p.slug+'-frame-'+p.suggestedFrame+'.png'));
  paperPaths.add(p.paperImage);
  for(const file of [...p.gallery,p.styleImage]){
    assert(fs.existsSync(decodeURIComponent(file)),file);
    for(const size of [480,1200])assert(fs.existsSync(web[file]?.[size]||''),file+' '+size);
  }
  for(const route of ['shop-all/index.html',`pages/collections/${p.collectionSlug}/index.html`,`pages/art-styles/${p.styleSlug}/index.html`]){
    const html=fs.readFileSync(route,'utf8');
    const card=html.match(new RegExp('<article class="art-card" data-product="'+p.slug+'"[\\s\\S]*?</article>'))?.[0];
    assert(card?.includes(web[p.image][1200]),route+' '+p.slug);
  }
  const page=fs.readFileSync(`pages/artworks/${p.slug}/index.html`,'utf8');
  const productData=page.match(/<script type="application\/json" id="product-data">([\s\S]*?)<\/script>/)?.[1];
  if(productData){
    const model=JSON.parse(productData);assert.equal(model.slug,p.slug);assert.equal(model.suggestedFrame,p.suggestedFrame);
    for(const [frame,images] of Object.entries(p.frames)){assert.equal(model.frames[frame].image.zoom,images.image);assert.equal(model.frames[frame].closeup.zoom,images.closeup);}
    assert.equal(model.paper.zoom,p.paperImage);
  }else{
    assert.equal((page.match(/data-gallery=/g)||[]).length,7,p.slug);
    assert(page.includes('aria-label="View paper print closeup"'),p.slug);
  }
  assert(page.includes(web[p.image][1200]),p.slug);
}
assert.equal(paperPaths.size,22);
assert.equal(new Set(products.map(p=>p.styleImage)).size,11);
assert.notEqual(web[products.find(p=>p.slug==='the-teahouse-shutters-at-spring-dawn').paperImage][1200],web[products.find(p=>p.slug==='the-bridge-under-falling-blossom').paperImage][1200]);
console.log('PASS 22 suggested frames, 154 gallery mappings, 11 style covers, responsive files and all listing placements.');
