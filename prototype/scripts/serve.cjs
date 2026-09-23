const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const {aliases} = require('../site-manifest.json');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff','.otf':'font/otf'};
function createServer() {
  return http.createServer((req,res) => {
    if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405,{'Allow':'GET, HEAD'}).end();return;}
    let url, pathname;
    try {url=new URL(req.url,'http://localhost');pathname=decodeURIComponent(url.pathname);} catch {res.writeHead(400).end('Invalid path');return;}
    if (pathname.includes('\\') || pathname.split('/').some(p=>p.startsWith('.'))) {res.writeHead(403).end('Forbidden');return;}
    const alias=aliases[pathname.replace(/\/$/,'') || '/'];
    if(alias && pathname !== '/') {
      const target=new URL('/'+alias,'http://localhost');
      url.searchParams.forEach((value,key)=>{if(!target.searchParams.has(key))target.searchParams.append(key,value);});
      res.writeHead(302,{Location:target.pathname+target.search}).end();return;
    }
    let file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end('Forbidden');return;}
    try {
      if(fs.statSync(file).isDirectory()) {
        if(!pathname.endsWith('/')){res.writeHead(302,{Location:url.pathname+'/'+url.search}).end();return;}
        file=path.join(file,'index.html');
      }
      const data=fs.readFileSync(file);
      res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
      res.end(req.method==='HEAD'?undefined:data);
    } catch (error) {
      const status=['ENOENT','ENOTDIR'].includes(error.code)?404:500;
      let body;
      try {body=fs.readFileSync(path.join(root,`pages/${status}.html`),'utf8').replace('<head>','<head><base href="/pages/">');}
      catch {body='<!doctype html><title>Page unavailable</title><h1>Page unavailable</h1><a href="/site-map.html">All prototype pages</a>';}
      res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'}).end(req.method==='HEAD'?undefined:body);
    }
  });
}
if(require.main===module){
 const port=Number(process.env.PORT||process.argv[2]||8000);
 const server=createServer();
 server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`Port ${port} is busy. Run npm start -- 8001 to choose another port.`:e.message);process.exitCode=1;});
 server.listen(port,'127.0.0.1',()=>console.log(`Aalishaan Studio\nHome: http://127.0.0.1:${port}/\nAll pages: http://127.0.0.1:${port}/site-map.html\nCtrl+C to stop.`));
}
module.exports={createServer};
