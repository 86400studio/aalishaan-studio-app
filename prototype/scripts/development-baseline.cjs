// Explicit freeze/check; builds never silently approve or replace the baseline.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {root,sourceFiles}=require('./source-files.cjs');
const target='data/development-baseline.json',freeze=process.argv.includes('--freeze');
const hash=file=>{
 let data=fs.readFileSync(path.join(root,file));
 // Git may change text line endings on checkout. Text content remains identical.
 if(/\.(?:html|css|js|cjs|json|md|yml|yaml|ps1|txt)$/.test(file)||/^\.[^/]+$/.test(file))data=Buffer.from(data.toString('utf8').replace(/\r\n/g,'\n'));
 return crypto.createHash('sha256').update(data).digest('hex');
};
const files=sourceFiles().filter(f=>f!==target),hashes=Object.fromEntries(files.map(f=>[f,hash(f)]));
if(freeze){
 const arg=process.argv.indexOf('--revision'),revision=arg>=0?process.argv[arg+1]:null;
 if(!revision||!/^E[1-9]\d*$/.test(revision))throw Error('Freeze requires an explicit --revision E1 (or the next reviewed revision).');
 fs.writeFileSync(path.join(root,target),JSON.stringify({revision,date:new Date().toISOString().slice(0,10),scope:'Reviewed development reference; owner commercial inputs remain required before live sales. This checksum is not owner visual sign-off or production acceptance.',algorithm:'SHA-256; CRLF normalised to LF for text files',files:hashes},null,2)+'\n');
 console.log(`Frozen ${revision} development reference: ${files.length} source files.`);
}else{
 if(!fs.existsSync(path.join(root,target)))throw Error('No development baseline. Freeze only after completing the review.');
 const baseline=JSON.parse(fs.readFileSync(path.join(root,target),'utf8'));
 const changes=files.filter(f=>baseline.files[f]!==hashes[f]).map(f=>(baseline.files[f]?'Changed: ':'Added: ')+f);
 for(const file of Object.keys(baseline.files))if(!Object.hasOwn(hashes,file))changes.push('Missing: '+file);
 if(changes.length){console.error(changes.join('\n'));console.error('The reviewed reference has changed. Review and record an intentional new revision before freezing again.');process.exitCode=1;}
 else console.log(`PASS: ${baseline.revision} development reference matches all ${files.length} source files.`);
}
