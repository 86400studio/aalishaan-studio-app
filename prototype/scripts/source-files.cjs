// The complete, portable source handoff; generated releases and local tools stay out.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const include=['.github','.gitattributes','.gitignore','.nojekyll','AGENTS.md','README.md','PAGE-TRACKER.md','package.json','package-lock.json','site-manifest.json','site-map.html','index.html','admin','assets','data','docs','pages','product','scripts','shared','shop-all'];
function sourceFiles(){
 const files=[];
 function walk(relative){
  const absolute=path.resolve(root,relative);
  if(!absolute.startsWith(root+path.sep))throw Error('Source escapes workspace: '+relative);
  const stat=fs.lstatSync(absolute);
  if(stat.isSymbolicLink())throw Error('Source handoff cannot contain symlinks: '+relative);
  if(stat.isDirectory())for(const name of fs.readdirSync(absolute).sort())walk(relative+'/'+name);
  else if(stat.isFile())files.push(relative);
 }
 include.forEach(walk);return files.sort();
}
module.exports={root,include,sourceFiles};
