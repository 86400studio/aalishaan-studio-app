// Checks exact filename casing too: GitHub Pages uses a case-sensitive filesystem.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),site=path.join(root,'dist/site');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const files=new Set(walk(site).map(f=>path.relative(site,f).split(path.sep).join('/'))),errors=[];
const base='/'+(process.env.PAGES_BASE_PATH||'').replace(/^\/+|\/+$/g,'');
let checked=0;
function check(value,file){
 if(!value||/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value))return;
 let target;try{target=decodeURIComponent(value.replaceAll('&amp;','&').split(/[?#]/)[0]);}catch{errors.push(`${file}: malformed URL ${value}`);return;}
 if(!target)return;
 if(target.startsWith('/')){
  const prefix=base==='/'?'':base;
  if(prefix&&!target.startsWith(prefix+'/')){errors.push(`${file}: URL escapes project base: ${target}`);return;}
  target=target.slice(prefix.length+1);
 }else target=path.posix.normalize(path.posix.join(file==='404.html'?'pages':path.posix.dirname(file),target));
 if(target==='.')target='index.html';
 if(target.endsWith('/'))target+='index.html';
 checked++;
 if(!files.has(target)&&!files.has(target+'/index.html'))errors.push(`${file}: missing file or incorrect case: ${value}`);
}
for(const file of files){
 if(!/\.(html|css)$/.test(file))continue;
const text=fs.readFileSync(path.join(site,file),'utf8');
  if(file.endsWith('.html')){
  if(!text.includes('<meta name="robots" content="noindex, nofollow">'))errors.push(`${file}: missing prototype noindex directive`);
  for(const m of text.replace(/<base\b[^>]*>/gi,'').matchAll(/\s(?:href|src|action)=["']([^"']+)["']/g))check(m[1],file);
  for(const m of text.matchAll(/\bsrcset="([^"]+)"/g))for(const entry of m[1].split(','))check(entry.trim().split(/\s+\d/)[0],file);
 }
 for(const m of text.matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/g))check(m[1],file);
}
// Build metadata also points at originals and zoom images loaded only on interaction.
function values(value){if(typeof value==='string')return [value];if(value&&typeof value==='object')return Object.entries(value).flatMap(([k,v])=>[k,...values(v)]);return [];}
for(const name of fs.readdirSync(path.join(root,'data')).filter(f=>f.endsWith('.json'))){
 const data=JSON.parse(fs.readFileSync(path.join(root,'data',name),'utf8').replace(/^\uFEFF/,''));
 for(const value of values(data))if(value.startsWith('assets/'))check(value,'index.html');
}
for(const destination of Object.values(require('../site-manifest.json').aliases))assert(files.has(destination.split('?')[0]),destination);
assert(files.has('.nojekyll'));assert(files.has('404.html'));
assert(![...files].some(f=>/^(?:scripts|node_modules|preview|data)\//.test(f)));
assert(!files.has('admin/README.md'),'Source handoff notes are not a hosted runtime dependency');
const bytes=[...files].reduce((sum,f)=>sum+fs.statSync(path.join(site,f)).size,0);
if(bytes>=1024**3)errors.push('Static site exceeds the GitHub Pages 1 GB size limit');
if(errors.length){console.error([...new Set(errors)].join('\n'));process.exitCode=1;}
else console.log(`PASS: ${files.size} exported files (${(bytes/1024**2).toFixed(1)} MiB); ${checked} static and metadata references, exact casing, route targets, noindex and export boundaries.`);
