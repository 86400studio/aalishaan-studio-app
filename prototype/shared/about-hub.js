(()=>{
 const form=document.querySelector('.help-search');if(!form)return;
 const input=form.querySelector('input'),results=document.querySelector('#help-results');
 if(!results)return;
 const home=document.querySelector('#help-home'),entries=[...document.querySelectorAll('[data-help-entry]')];
 function filter(){const q=input.value.trim().toLowerCase();results.hidden=!q;home.hidden=!!q;let count=0;for(const e of entries){e.hidden=!q.split(/\s+/).every(word=>e.dataset.search.toLowerCase().includes(word));if(!e.hidden)count++;}document.querySelector('#help-result-status').textContent=`${count} ${count===1?'article':'articles'} found`;document.querySelector('#help-no-results').hidden=!!count;}
 input.value=new URLSearchParams(location.search).get('q')||'';filter();input.addEventListener('input',filter);
 form.addEventListener('submit',e=>{e.preventDefault();filter();const url=new URL(location);if(input.value.trim())url.searchParams.set('q',input.value.trim());else url.searchParams.delete('q');history.replaceState(null,'',url);});
})();
