const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const {pages,aliases}=require('../site-manifest.json');
const errors=[];let checked=0;
const scanFiles=new Set(['index.html','site-map.html',...pages.map(p=>p.file)]);
function check(value,file){
 if(!value||/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value))return;
 let url;try{url=decodeURIComponent(value.replace(/&amp;/g,'&').split(/[?#]/)[0]);}catch{errors.push(file+': invalid URL '+value);return;}
 if(!url)return;
 if(url.startsWith('/')&&aliases[url.replace(/\/$/,'')])return;
 const resolved=url.startsWith('/')?path.resolve(root,'.'+url):path.resolve(path.dirname(path.join(root,file)),url);
 checked++;
 if(!resolved.startsWith(root+path.sep)||!fs.existsSync(resolved)){errors.push(file+': missing '+value);return;}
 if(/\.(css|js)$/.test(resolved))scanFiles.add(path.relative(root,resolved));
}
for(const file of scanFiles){
 if(!fs.existsSync(path.join(root,file))){errors.push('Missing page '+file);continue;}
 const s=fs.readFileSync(path.join(root,file),'utf8');
 if(file.endsWith('.html')){
  for(const m of s.matchAll(/\s(?:href|src|action)\s*=\s*["']([^"']+)["']/g))check(m[1],file);
  for(const m of s.matchAll(/\bsrcset\s*=\s*"([^"]+)"/g))for(const item of m[1].split(','))check(item.trim().split(/\s+\d/)[0],file);
 }
 if(file.endsWith('.css'))for(const m of s.matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/g))check(m[1],file);
}
for(const dest of Object.values(aliases)){if(!fs.existsSync(path.join(root,dest.split('?')[0])))errors.push('Missing alias destination '+dest);}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`PASS: ${pages.length} pages, ${checked} local references and ${Object.keys(aliases).length} route aliases.`);
