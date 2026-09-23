/* E10 (23 September 2026): order-intake pause preview, waiting-list form and the payment-policy WhatsApp link.
 * Local sample behaviour: entries stay in this browser. No message is sent and no order is created. */
(()=>{
 const bag=window.AalishaanBag;if(!bag)return;
 const $=s=>document.querySelector(s),safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const KEY='aalishaanIntakeWaitlist',ADMIN_KEY='aalishaan-admin-a1-v1',WHATSAPP='919137624394',frames={white:'White',black:'Black','antique-gold':'Antique Gold'};
 const COPY={title:'We’re running at full capacity',body:'Thank you for the wonderful response. Every Aalishaan piece is printed and framed to order, and the studio is currently working through a large number of orders. To keep our promise on quality and delivery, we’ve paused new orders for a short while. Leave your email or mobile number and we’ll tell you the moment ordering reopens. Your bag will be waiting for you.',button:'Tell me when ordering reopens',success:'Thank you. We’ll be in touch as soon as ordering reopens.'};
 const query=new URLSearchParams(location.search);
 const readList=()=>{try{const rows=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(rows)?rows:[];}catch{return [];}};
 const writeList=rows=>{try{localStorage.setItem(KEY,JSON.stringify(rows));return true;}catch{return false;}};
 const adminPaused=()=>{try{return JSON.parse(localStorage.getItem(ADMIN_KEY)||'null')?.intake?.status==='Paused';}catch{return false;}};
 const paused=query.get('intake')==='paused'||(query.get('intake')!=='open'&&adminPaused());
 // Payment policy: online only. The WhatsApp draft carries the bag summary, never personal details.
 function syncWhatsApp(){const items=bag.read(),summary=items.map(i=>`${i.title} (${frames[i.frame]} frame x ${i.quantity})`).join('; ');const text='Hello Aalishaan Studio, I have a question about paying for my order.'+(summary?' My bag: '+summary+'.':'');document.querySelectorAll('[data-whatsapp-help]').forEach(a=>{a.href='https://wa.me/'+WHATSAPP+'?text='+encodeURIComponent(text);});}
 syncWhatsApp();window.addEventListener('bagchange',()=>queueMicrotask(syncWhatsApp));
 // Resume link preview: restores the bag saved with a waiting-list entry, once, in this browser.
 const resume=query.get('resume'),status=$('#bag-status');
 if(resume&&status){const rows=readList(),entry=rows.find(e=>e.token===resume);if(!entry)status.textContent='This link has expired or does not match a saved bag. Your current bag is unchanged.';else if(entry.used)status.textContent='This link was already used. Your bag is kept in this browser.';else{entry.used=true;writeList(rows);bag.save((Array.isArray(entry.bag)?entry.bag:[]).filter(i=>i&&typeof i==='object'));status.textContent='Welcome back. Your bag has been restored.';}}
 const slot=$('[data-intake-slot]');
 if(!paused||!slot)return;
 document.body.classList.add('intake-paused');
 // The checkout page's own form must not create a sample order while intake is paused.
 document.addEventListener('submit',e=>{if(e.target.id==='checkout-form'){e.preventDefault();e.stopImmediatePropagation();}},true);
 const source=$('#checkout-form')?'Checkout':'Cart';
 slot.hidden=false;
 // On the checkout page the slot lives inside #checkout-form, which is hidden while the bag is empty; show the notice in the empty-bag panel instead.
 const place=()=>{const emptyPanel=$('#checkout-empty'),fields=$('.checkout-fields-panel');if(!emptyPanel||!fields)return;const target=bag.read().length?fields:emptyPanel;if(slot.parentElement!==target)target.prepend(slot);};place();window.addEventListener('bagchange',()=>queueMicrotask(place));
 // A group, not a nested <form>: on the checkout page the slot sits inside #checkout-form.
 slot.innerHTML=`<section class="intake-notice" aria-labelledby="intake-title"><span class="eyebrow">A short pause</span><h2 id="intake-title">${safe(COPY.title)}</h2><p>${safe(COPY.body)}</p><div id="intake-form" role="group" aria-labelledby="intake-title"><div class="intake-fields"><label>Email<input name="waitlist-email" type="email" autocomplete="email" inputmode="email" aria-describedby="intake-error"></label><label>Mobile number<input name="waitlist-phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="10-digit mobile number" aria-describedby="intake-error"></label><label>Name (optional)<input name="waitlist-name" type="text" autocomplete="name"></label></div><p id="intake-error" class="field-error" role="alert"></p><button type="button" class="button button--primary" id="intake-submit">${safe(COPY.button)}</button><p class="flow-fine">One message when ordering reopens, nothing else. Preview only: your details stay in this browser and are not sent.</p></div><p id="intake-done" class="intake-done" role="status" hidden></p></section>`;
 const box=$('#intake-form'),error=$('#intake-error'),done=$('#intake-done'),field=name=>box.querySelector('[name="waitlist-'+name+'"]');
 const invalid=(input,message)=>{error.textContent=message;input.setAttribute('aria-invalid','true');input.focus();};
 box.addEventListener('input',()=>{error.textContent='';box.querySelectorAll('[aria-invalid]').forEach(i=>i.removeAttribute('aria-invalid'));});
 function join(){const email=field('email').value.trim(),phone=field('phone').value.trim(),name=field('name').value.trim();const mobile=phone.replace(/[\s()+-]/g,'').replace(/^91(?=\d{10}$)/,'');
  if(!email&&!phone)return invalid(field('email'),'Leave an email address or a mobile number so we can tell you when ordering reopens.');
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return invalid(field('email'),'Enter a valid email address.');
  if(phone&&!/^[6-9]\d{9}$/.test(mobile))return invalid(field('phone'),'Enter a valid 10-digit Indian mobile number.');
  const rows=readList(),token=Math.random().toString(36).slice(2,10)+Date.now().toString(36);
  rows.push({id:'WL-'+Date.now().toString(36).toUpperCase(),token,name,email,phone:phone?mobile:'',at:new Date().toISOString(),source,bag:bag.read().map(i=>({slug:i.slug,title:i.title,frame:i.frame,quantity:i.quantity})),consent:{kind:'Service notification',wording:'waitlist-v1'},used:false});
  if(!writeList(rows)){error.textContent='Your browser could not save this preview entry. Allow browser storage and try again.';return;}
  box.hidden=true;done.hidden=false;done.innerHTML=`${safe(COPY.success)}<br><small>Preview of the reopening email’s link: <a href="${bag.url('pages/cart/index.html?resume='+encodeURIComponent(token))}">Resume your order</a> (restores this bag once, in this browser).</small>`;done.scrollIntoView({block:"nearest"});
 }
 $('#intake-submit').addEventListener('click',join);
 box.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('input')){e.preventDefault();join();}});
 window.AalishaanIntake={join,COPY,KEY};
})();
