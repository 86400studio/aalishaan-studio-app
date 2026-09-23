// Verify the development reference stays complete and suitable for a Git source push.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {root,sourceFiles}=require('./source-files.cjs');
const files=sourceFiles(),errors=[];let links=0;
for(const file of files){
 if(fs.statSync(path.join(root,file)).size>=100*1024**2)errors.push('File exceeds GitHub regular Git file limit: '+file);
 if(!file.endsWith('.md'))continue;
 const source=fs.readFileSync(path.join(root,file),'utf8');
 for(const match of source.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)){
  let url=match[1].replace(/^<|>$/g,'');
  if(/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(url))continue;
  try{url=decodeURIComponent(url.split(/[?#]/)[0]);}catch{errors.push(file+': invalid link '+url);continue;}
  const target=path.resolve(root,path.dirname(file),url);links++;
  if(!target.startsWith(root+path.sep)||!fs.existsSync(target))errors.push(file+': missing local document link '+url);
 }
}
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'admin/catalogue.js'),'utf8'),sandbox);
const catalogue=sandbox.window.AdminCatalogue;
if(!catalogue)errors.push('Admin catalogue was not loaded');
else{
 const products=require('../data/products.json'),prices=require('../data/pricing.json');
 assert.equal(catalogue.length,products.length,'Public and Admin catalogue counts');
 assert.equal(new Set(catalogue.map(p=>p.id)).size,catalogue.length,'Unique Admin artwork IDs');
 for(const product of products){
  const admin=catalogue.find(p=>p.slug===product.slug);
  assert(admin,'Missing Admin artwork '+product.slug);
  for(const key of ['title','collection','style'])assert.equal(admin[key],product[key],product.slug+' '+key);
  for(const [finish,price] of Object.entries(prices))assert.equal(admin.prices[finish],price*100,product.slug+' '+finish+' paise');
  assert(fs.existsSync(path.resolve(root,'admin',decodeURIComponent(admin.image))),product.slug+' Admin image');
 }
}
const manifest=require('../site-manifest.json');
assert.equal(manifest.aliases['/admin'],'admin/index.html');
assert(manifest.pages.some(p=>p.file==='admin/index.html'));
assert(manifest.pages.some(p=>p.file==='admin/wireframe/index.html'));
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
else console.log(`PASS: ${files.length} portable source files, ${links} document links, source file sizes and current Admin entrypoints.`);
