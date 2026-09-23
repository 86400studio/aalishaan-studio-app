// Browse R3: Shop, Collections and Art Styles built from the approved Home shell and the workbook export.
const fs=require('node:fs'),path=require('node:path');
const {cardPrice}=require('./product-pricing.cjs');
const {suggestedFrames,paperNames}=require('./artwork-images.cjs');
const home=fs.readFileSync('index.html','utf8');
const source=JSON.parse(fs.readFileSync('data/workbook-source.json','utf8').replace(/^\uFEFF/,''))[0];
const files=fs.readdirSync('assets',{recursive:true}).map(x=>'assets/'+x.replaceAll('\\','/'));
const web=fs.existsSync('data/web-artwork-map.json')?JSON.parse(fs.readFileSync('data/web-artwork-map.json','utf8')):{};
const enc=p=>p.split('/').map(encodeURIComponent).join('/');
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const split=s=>(s||'').split(/\s*[·;]\s*/).filter(Boolean);
// Locked site copy from the workbook's Website & SEO Spec (02), Site Constants.
const copy={
 truth:'Every piece is an archival giclée print of an artwork in its tradition — printed on Hahnemühle Museum Etching 350 gsm at A2, framed in antique gold, black or white.',
 // Approved index-hero intros (2026-09-06): the page name stays the heading, with one short line
 // that blends the sheet's Site Constants idea with the earlier, plainer descriptor. The full sheet
 // wording is kept alongside for reference.
 collections:{headline:'Collections',line:'Stories you can hang. Open the one that stops you.',cta:'Open the collection',
  sheetHeadline:'Stories you can hang.',sheetLine:'Each collection is a moment you already know — a veranda in the monsoon, a pass opening at dawn, a carrom board after tea. Nobody is in the picture; someone always just left. Open the one that stops you.'},
 styles:{headline:'Art Styles',line:'How it was made changes how it feels. Find the marks that speak to you.',cta:'See the artworks',
  sheetHeadline:'How it was made changes how it feels.',sheetLine:'Ink floated on water. Gold leaf under mineral blues. Flowers drawn by sunlight alone. Every artwork follows one tradition and one medium all the way through — open a style to see what that does to a wall.'}
};
const products=[];
for(const {row,cells} of source.rows.slice(1)){
 const c=k=>cells[k+row]||'',slug=c('Q');
 const suggestedFrame=suggestedFrames[c('AC')];
 const image=files.find(f=>f.endsWith('/'+slug+'-frame-'+suggestedFrame+'.png'));
 if(!image)continue;
 const folder=path.posix.dirname(image);
 const exact=name=>{const f=folder+'/'+name;if(!files.includes(f))throw Error('Missing artwork image: '+f);return enc(f)};
 const frames=Object.fromEntries([suggestedFrame,...['white','black','antique-gold'].filter(f=>f!==suggestedFrame)].map(frame=>[frame,{image:exact(slug+'-frame-'+frame+'.png'),closeup:exact(slug+'-close-'+frame+'.png')}]));
 const paperImage=exact(paperNames[slug]||slug+'-paper.png');
 const gallery=[...Object.values(frames).flatMap(f=>[f.image,f.closeup]),paperImage];
 const styleFiles=files.filter(f=>path.posix.dirname(f)===path.posix.dirname(folder)&&f.endsWith('.png'));
 if(styleFiles.length!==1)throw Error('Expected one supplied style cover for '+slug);
 const styleImage=enc(styleFiles[0]);
 products.push({slug,title:c('U').split(' · ')[0],fullTitle:c('U'),hook:(c('F').match(/Scroll-stop: ([^\n]+)/)||[])[1]||c('S'),description:c('V'),collection:c('X'),collectionSlug:c('Y'),collectionIntro:c('Z'),style:c('AC'),styleFull:c('AA'),styleSlug:c('AD'),styleIntro:c('AE'),orientation:c('AF'),rooms:split(c('AG')),moods:split(c('AK')),palettes:split(c('AI')),image:enc(image),alt:c('U').split(' · ')[0]+' in a '+suggestedFrame.replaceAll('-',' ')+' frame',suggestedFrame,frames,paperImage,styleImage,gallery,availability:'Complete per supplied list (2026-09-06)',sourceRow:row,sourceStatus:c('H')});
}
if(products.length!==22)throw Error('Expected 22 exact matches, got '+products.length);
fs.writeFileSync('data/catalogue.json',JSON.stringify(products,null,2));
let css=[...home.replace(/<noscript>[\s\S]*?<\/noscript>/g,'').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(x=>x[1]).join('\n').replaceAll('url("assets/','url("../assets/').replaceAll("url('assets/","url('../assets/");
fs.writeFileSync('shared/browse-home.css',css);
let common=home.slice(home.indexOf('<script>\n(function'),home.lastIndexOf('</script>')+9);
common=common.slice(0,common.indexOf('  /* ---------- wall-to-materials'))+'  window.addEventListener("scroll",stuck,{passive:true});\n})();\n</script>';
const header=home.slice(home.indexOf('<header class="site-header"'),home.indexOf('<main id="main">'));
const footer=home.slice(home.indexOf('<footer'),home.indexOf('<!-- ===================== OVERLAYS'));
const overlays=home.slice(home.indexOf('<div class="backdrop"'),home.indexOf('<script>\n(function'));
if(/data-mega|mega-menu/.test(header))throw Error('Home header still contains dropdown menus; Collections and Art Styles must be direct links.');
const webSrc=src=>web[src]?web[src][1200]:src;
function shell(file,title,main,extra=''){
 const prefix=path.posix.relative(path.posix.dirname(file),'.')+'/';
 // Relative URLs in custom properties are resolved at the stylesheet that uses
 // them. Emit these page-specific image declarations in the document instead.
 const heroImages=main.match(/data-browse-image="([^"]+)" data-browse-mobile-image="([^"]+)"/);
 const heroStyle=heroImages?`<style>body .browse-hero--r9{background-image:url('${heroImages[1]}')}@media(max-width:700px){body .browse-hero--r9{background-image:url('${heroImages[2]}')}}</style>`:'';
 const remap=s=>s.replace(/(href|src)="(?!https?:|mailto:|tel:|#)([^"]+)"/g,(_,a,v)=>`${a}="${prefix}${v}"`).replace(/srcset="([^"]+)"/g,(_,v)=>`srcset="${v.split(',').map(c=>c.trim().replace(/^(?!https?:|\/)(\S+)/,`${prefix}$1`)).join(', ')}"`).replace(/href="#top"/g,`href="${prefix}index.html"`);
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#ffffff"><title>${esc(title)} | Aalishaan Studio</title><link rel="stylesheet" href="${prefix}shared/browse-home.css"><link rel="stylesheet" href="${prefix}shared/home-r2.css"><link rel="stylesheet" href="${prefix}shared/browse.css"><link rel="stylesheet" href="${prefix}shared/gallery-r8.css"><link rel="stylesheet" href="${prefix}shared/revision-r9.css"><link rel="stylesheet" href="${prefix}shared/revision-r11.css"><script>document.documentElement.classList.add('js')</script>${heroStyle}</head><body class="browse-page"><a class="skip-link" href="#main">Skip to main content</a>${remap(header)}<main id="main">${remap(main)}</main>${remap(footer+overlays)}${extra}${common}<script src="${prefix}shared/browse.js"></script></body></html>`);
}
const heart='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/></svg>';
function card(p){let href=`pages/artworks/${p.slug}/index.html`;return `<article class="art-card" data-product="${p.slug}"><div class="art-card__media"><a class="art-card__main" href="${href}" aria-label="View ${esc(p.title)}"><img src="${p.image}" alt="${esc(p.alt)}" width="1000" height="1000" loading="lazy" decoding="async"></a><button class="wishlist" type="button" data-wishlist aria-pressed="false" aria-label="Save ${esc(p.title)} to wishlist">${heart}</button></div><div class="art-card__body"><p class="art-card__label">Museum Grade Giclée Artwork</p><h3><a href="${href}">${esc(p.title)}</a></h3><p class="art-card__hook">${esc(p.hook)}</p><p class="art-card__price">${cardPrice(p.suggestedFrame)}</p><div class="art-card__actions"><a class="art-card__view" href="${href}">View Artwork <span aria-hidden="true">→</span></a></div></div></article>`;}
const backLink=(href,label)=>`<a class="back-link" href="${href}"><span aria-hidden="true">←</span> ${esc(label)}</a>`;
// Hero variants: 'image' blends the picture into a dark full-bleed band (Shop, Art Styles, style pages);
// 'detail' keeps the white hero with the collage cover beside the copy (collection pages).
function hero({eyebrow,title,intro,image,variant='image',back='',modifier=''}){
 if(variant==='detail')return `<section class="browse-hero browse-hero--detail"><div class="container browse-hero__inner"><div class="browse-detail-copy">${back}<div class="browse-detail-text">${eyebrow?`<span class="eyebrow">${esc(eyebrow)}</span>`:""}<h1>${esc(title)}</h1><p>${esc(intro)}</p></div></div><img src="${image}" alt="${esc(title)} collection cover" width="700" height="700" fetchpriority="high"></div></section>`;
 return `<section class="browse-hero ${modifier}" data-browse-image="${image}" data-browse-mobile-image="${image.replace('-1600.webp','-600.webp')}"><div class="container browse-hero__inner"><div>${back}${eyebrow?`<span class="eyebrow">${esc(eyebrow)}</span>`:""}<h1>${esc(title)}</h1><p>${esc(intro)}</p></div></div></section>`;
}
const truthLine="";
function listing(list){return `<section class="container catalogue" id="artworks"><div class="catalogue-heading"><h2 tabindex="-1" data-catalogue-title><span data-catalogue-label>All Artworks</span> <span id="artwork-count" role="status" aria-live="polite">${list.length} artworks</span></h2></div><p class="saved-view-note" data-saved-note hidden><a href="shop-all/index.html#artworks">Explore all artworks</a> Saved on this browser.</p><details class="filters" open><summary>Filter artworks <span aria-hidden="true">＋</span></summary><form id="filter-form"><label class="search-field">Search artworks<input type="search" name="q" placeholder="Search by name or story" autocomplete="off"></label>${[['collection','Collection'],['style','Art style'],['rooms','Room'],['moods','Mood'],['palettes','Colour palette'],['orientation','Orientation']].map(([key,label])=>`<label>${label}<select name="${key}"><option value="">All ${label.toLowerCase()}s</option>${[...new Set(list.flatMap(p=>p[key]))].sort().map(v=>`<option>${esc(v)}</option>`).join('')}</select></label>`).join('')}<button type="reset" class="filter-clear">Clear all</button></form></details><div class="active-filters" aria-label="Active filters"></div><div class="catalogue-grid">${list.map(card).join('')}</div><div class="empty-results" hidden><h3>No artworks match these filters.</h3><p>Try a different colour, room or search term.</p><button class="button button--secondary" data-reset-filters>Clear all filters</button></div></section>`;}
const data=list=>`<script id="browse-data" type="application/json">${JSON.stringify(list).replaceAll('<','\\u003c')}</script>`;
const collectionCover=p=>enc(files.find(f=>f.endsWith('/'+p.collectionSlug+'-cover.png')));
// Shop keeps its approved hero and catalogue; only the shared navigation changed.
shell('shop-all/index.html','Shop All',hero({eyebrow:'Aalishaan Studio',title:'Shop All',intro:'Find a story you want to live with. Explore our collection of archival artworks.',image:'../assets/site/responsive/shop-all-page-hero-1600.webp',modifier:'browse-hero--r9'})+listing(products),data(products));
for(const kind of ['collection','style']){
 const folder=kind==='collection'?'collections':'art-styles',title=kind==='collection'?'Collections':'Art Styles',site=kind==='collection'?copy.collections:copy.styles;
 const groups=[...new Set(products.map(p=>p[kind]))].map(name=>{const list=products.filter(p=>p[kind]===name),p=list[0];return {name,list,slug:p[kind+'Slug'],intro:p[kind+'Intro'],image:kind==='collection'?collectionCover(p):p.styleImage};});
 const href=g=>`pages/${folder}/${g.slug}/index.html`;
 const cards=kind==='collection'
  ?`<section class="container collection-grid" aria-label="${title}">${groups.map(g=>`<article class="collection-card"><a class="collection-card__image" href="${href(g)}" aria-label="Open the ${esc(g.name)} collection"><img src="${g.image}" alt="${esc(g.name)} collection cover" width="600" height="600" loading="lazy"></a><div class="collection-card__body"><h2>${esc(g.name)}</h2><p>${esc(g.intro)}</p><a class="button button--primary" href="${href(g)}">${site.cta} <span aria-hidden="true">→</span></a></div></article>`).join('')}</section>`
  :`<section class="container browse-stories" aria-label="${title}">${groups.map(g=>`<article class="browse-story"><a class="browse-story__image" href="${href(g)}" aria-label="See the ${esc(g.name)} artworks"><img src="${g.image}" alt="${esc(g.name)}" width="600" height="600" loading="lazy"></a><div class="browse-story__copy"><h2>${esc(g.name)}</h2><p>${esc(g.intro)}</p><a class="button button--primary" href="${href(g)}">${site.cta} <span aria-hidden="true">→</span></a></div></article>`).join('')}</section>`;
 shell(`pages/${folder}/index.html`,title,hero({eyebrow:'Aalishaan Studio',title:site.headline,intro:site.line,image:`../../assets/site/responsive/${kind==='collection'?'collections':'art-styles'}-page-hero-1600.webp`,modifier:'browse-hero--r9'})+truthLine+cards);
 for(const g of groups){
  const back=backLink(`pages/${folder}/index.html`,kind==='collection'?'All collections':'All art styles');
  const groupHero=kind==='collection'
   ?hero({eyebrow:'',title:g.name,intro:g.intro,image:g.image,variant:'detail',back})
   :hero({eyebrow:'',title:g.name,intro:g.intro,image:'../../../assets/site/responsive/art-styles-page-hero-1600.webp',modifier:'browse-hero--r9 browse-hero--style',back});
  shell(`pages/${folder}/${g.slug}/index.html`,g.name,groupHero+truthLine+listing(g.list),data(g.list));
 }
}
for(const p of products){
 if(fs.existsSync('data/products.json'))continue; // Product pages are owned by the product build after integration.
 const gallery=p.gallery;
 shell(`pages/artworks/${p.slug}/index.html`,p.title,`<nav class="container breadcrumbs" aria-label="Breadcrumb"><a href="shop-all/index.html">All artworks</a><span>/</span><a href="pages/collections/${p.collectionSlug}/index.html">${esc(p.collection)}</a></nav><section class="container artwork-detail"><div><img class="artwork-detail__main" id="gallery-main" src="${p.image}" alt="${esc(p.alt)}" width="1000" height="1000"><div class="artwork-thumbnails">${gallery.map(f=>`<button type="button" data-gallery="${f}" aria-pressed="${f===p.image}" aria-label="View ${f===p.paperImage?'paper print closeup':esc(decodeURIComponent(f).split('/').pop().replace(p.slug+'-','').replace('.png','').replaceAll('-',' '))}"><img src="${f}" alt="" width="160" height="160" loading="lazy"></button>`).join('')}</div></div><div class="artwork-detail__copy"><span class="eyebrow">${esc(p.style)}</span><h1>${esc(p.title)}</h1><p class="detail-hook">${esc(p.hook)}</p><p>${esc(p.description)}</p><p class="price-pending">Price to be confirmed</p><a class="button button--secondary" href="pages/collections/${p.collectionSlug}/index.html">Explore ${esc(p.collection)}</a></div></section>`);
}
console.log(`Built Shop, collection/style indexes and 14 group pages for ${products.length} artworks.`);
if(Object.keys(web).length){
 const entries=['shop-all/index.html',...fs.readdirSync('pages',{recursive:true}).filter(f=>/^(collections|art-styles)[\\/]/.test(f)&&f.endsWith('index.html')).map(f=>'pages/'+f.replaceAll('\\','/'))];
 for(const file of entries){const prefix=path.posix.relative(path.posix.dirname(file),'.')+'/';let html=fs.readFileSync(file,'utf8');html=html.replace(/<img\b[^>]*>/g,tag=>tag.replace(/src="([^"]+)"/,(_,src)=>{const item=web[src.slice(prefix.length)];return item?`src="${prefix}${item[1200]}" srcset="${prefix}${item[480]} 480w, ${prefix}${item[1200]} 1200w" sizes="(max-width:767px) 50vw, 420px"`:`src="${src}"`;}));fs.writeFileSync(file,html);}
}
