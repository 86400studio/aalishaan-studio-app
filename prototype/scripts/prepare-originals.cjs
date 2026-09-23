// Import the exact originals provided for R9, with a smaller display derivative.
const fs=require('fs'),path=require('path'),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright-core');
const {createServer}=require('./serve.cjs');
(async()=>{const products=require('../data/products.json'),files=fs.readdirSync('assets/originals',{recursive:true}).filter(f=>f.endsWith('.png'));
 const norm=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});
 try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);fs.mkdirSync('assets/artwork-originals',{recursive:true});const record=[];
 for(const p of products){const candidates=files.filter(f=>norm(path.basename(f)).includes(norm(p.title)));if(candidates.length!==1)throw Error('Original match '+p.slug+': '+candidates.length);const file='assets/originals/'+candidates[0].replaceAll('\\','/');
 const encoded=file.split('/').map(encodeURIComponent).join('/');const data=await page.evaluate(async file=>{const img=new Image();img.src='/'+file;await img.decode();const c=document.createElement('canvas'),ratio=Math.min(1,1400/Math.max(img.naturalWidth,img.naturalHeight));c.width=Math.round(img.naturalWidth*ratio);c.height=Math.round(img.naturalHeight*ratio);c.getContext('2d').drawImage(img,0,0,c.width,c.height);return {data:c.toDataURL('image/webp',.92).split(',')[1],width:img.naturalWidth,height:img.naturalHeight};},encoded);
 const dest='assets/artwork-originals/'+p.slug+'.webp';fs.writeFileSync(dest,Buffer.from(data.data,'base64'));p.artwork={src:dest,zoom:encoded};record.push({slug:p.slug,source:file,width:data.width,height:data.height});}
 fs.writeFileSync('data/products.json',JSON.stringify(products,null,2)+'\n');fs.writeFileSync('data/original-artworks.json',JSON.stringify(record,null,2)+'\n');console.log('Imported all 22 original artworks');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1});
