(()=>{
 const form=document.querySelector('#filter-form'),data=document.querySelector('#browse-data');
 if(form&&data){
  const products=JSON.parse(data.textContent),cards=[...document.querySelectorAll('.catalogue-grid .art-card')],chips=document.querySelector('.active-filters');
  const keys=['q','collection','style','rooms','moods','palettes','orientation'];
  const normalize=s=>String(s).toLowerCase().trim();
  const catalogueTitle=document.querySelector('[data-catalogue-title]');let savedOnly=false;
  function readURL(){const params=new URLSearchParams(location.search);savedOnly=params.get('saved')==='1';for(const key of keys){const el=form.elements[key],v=params.get(key)||params.get({rooms:'room',moods:'mood',palettes:'palette'}[key])||'';el.value=v;if(el.tagName==='SELECT'&&v){const value=key==='rooms'&&['study','office'].includes(normalize(v))?'Study & Office':v;let option=[...el.options].find(o=>normalize(o.value)===normalize(value));if(!option){option=new Option(value,value);el.add(option);}el.value=option.value;}}}
  function update(write=true){
   let count=0;const filters=Object.fromEntries(keys.map(k=>[k,form.elements[k].value]));
   cards.forEach((card,i)=>{const p=products[i],saved=card.querySelector('[data-wishlist]')?.getAttribute('aria-pressed')==='true';const show=(!savedOnly||saved)&&keys.every(k=>!filters[k]||(k==='q'?normalize([p.title,p.hook,p.collection,p.style].join(' ')).includes(normalize(filters[k])):[p[k]].flat().some(v=>normalize(v)===normalize(filters[k]))));card.hidden=!show;if(show)count++;});
   document.querySelector('#artwork-count').textContent=`${count} artwork${count===1?'':'s'}`;
   const empty=document.querySelector('.empty-results');empty.hidden=count>0;empty.querySelector('h3').textContent=savedOnly?'No saved artworks match these filters.':'No artworks match these filters.';empty.querySelector('p').textContent=savedOnly?'Save an artwork using its heart, or clear the filters to keep exploring.':'Try a different colour, room or search term.';
   document.querySelector('[data-catalogue-label]').textContent=savedOnly?'Saved artworks':'All Artworks';document.querySelector('[data-saved-note]').hidden=!savedOnly;chips.replaceChildren();
   for(const [k,v] of Object.entries(filters)){if(!v)continue;const b=document.createElement('button');b.type='button';b.textContent=v+' ×';b.setAttribute('aria-label','Remove '+v+' filter');b.onclick=()=>{form.elements[k].value='';update();form.elements[k].focus();};chips.append(b);}
   if(write){const url=new URL(location.href);for(const k of [...keys,'saved','room','mood','palette','restore'])url.searchParams.delete(k);for(const [k,v] of Object.entries(filters))if(v)url.searchParams.set(k,v);if(savedOnly)url.searchParams.set('saved','1');history.replaceState(null,'',url);}
  }
  window.addEventListener('wishlistchange',()=>{const removed=savedOnly&&document.activeElement?.matches('[data-wishlist]');update(false);if(removed&&document.activeElement.closest('[hidden]'))catalogueTitle.focus();});window.addEventListener('storage',()=>update(false));
  form.addEventListener('input',()=>update());form.addEventListener('submit',e=>e.preventDefault());form.addEventListener('reset',()=>{setTimeout(()=>update(),0);});document.querySelector('[data-reset-filters]').onclick=()=>form.reset();window.addEventListener('popstate',()=>{readURL();update(false);});readURL();update(false);if(matchMedia('(max-width:767px)').matches)document.querySelector('.filters').open=false;
 }
 document.querySelectorAll('[data-gallery]').forEach(b=>{b.addEventListener('click',()=>{const i=document.querySelector('#gallery-main');i.removeAttribute('srcset');i.src=b.querySelector('img').src;i.alt=document.querySelector('h1').textContent+' · '+b.getAttribute('aria-label').replace(/^View /,'');document.querySelectorAll('[data-gallery]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});});
})();
