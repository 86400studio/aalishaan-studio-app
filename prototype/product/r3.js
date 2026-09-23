/* Product R3: frame choice, gallery views, gallery wall, lightbox, cart and the mobile purchase bar. */
(() => {
 const p = JSON.parse(document.querySelector('#product-data').textContent);
 const $ = s => document.querySelector(s), all = s => [...document.querySelectorAll(s)];
 const names = {black:'Black', white:'White', 'antique-gold':'Antique Gold'};
 const money = value => '₹' + value.toLocaleString('en-IN');
 const url = f => p.prefix + f;
 const frameKeys = Object.keys(p.frames);
 const room = (p.rooms && p.rooms[0]) || 'room';
 const roomLower = room.toLowerCase();
 let frame = p.suggestedFrame, view = 'framed';
 const storeKey = 'aalishaan-frame-' + p.slug;
 try { const stored = sessionStorage.getItem(storeKey); if (Object.hasOwn(p.frames, stored)) frame = stored; } catch {}

 /* ---------- image sets ---------- */
 function views() {
  const list = [
   {key:'framed', label:'Framed', img:p.frames[frame].image, alt:`${p.altText || p.title} — ${names[frame]} frame`, caption:`Framed in ${names[frame]}`, fit:'contain'},
   {key:'closeup', label:'Frame detail', img:p.frames[frame].closeup, alt:`${p.title} — ${names[frame]} frame, close up`, caption:`${names[frame]} frame, close up`, fit:'cover'},
   {key:'paper', label:'Paper detail', img:p.paper, alt:`${p.title} — print detail on Hahnemühle Museum Etching paper`, caption:'Print detail on Hahnemühle Museum Etching paper', fit:'cover'}
  ];
  if (p.master) list.push({key:'artwork', label:'Artwork', img:p.master, alt:`${p.title} — the artwork without its frame`, caption:'The artwork', fit:'contain'});
  if (p.roomImages) list.push({key:'room', label:'In a room', img:p.roomImages[frame], alt:`${p.title} in a ${roomLower} — ${names[frame]} frame`, caption:`In a ${roomLower} · ${names[frame]} frame`, fit:'cover'});
  list.push({key:'scale', label:'Scale guide', img:p.scale, alt:`Illustrative A2 ${p.orientation.toLowerCase()} size guide for a ${roomLower}; not this artwork`, caption:`Illustrative A2 ${p.orientation.toLowerCase()} scale in a ${roomLower}`, fit:'contain'});
  return list;
 }
 function tiles() {
  const pick=p.suggestedFrame;
  return [
   {img:p.artwork||p.master||p.paper,caption:'The artwork',alt:p.title,fit:'contain',large:true},
   {img:p.frames[pick].closeup,caption:`${names[pick]} frame, close up`,alt:`${names[pick]} frame detail`,fit:'cover'},
   {img:p.paper,caption:'Print on Hahnemühle paper',alt:'Paper and print detail',fit:'cover'},
   ...['white','black','antique-gold'].map(f=>({img:p.frames[f].image,caption:`Framed in ${names[f]}`,alt:`${p.title} in a ${names[f]} frame`,fit:'contain'}))
  ];
 }

 /* ---------- rendering ---------- */
 function setImage(img, obj, alt) { img.src = url(obj.src); if (alt !== undefined) img.alt = alt; }
 function render() {
  const list = views();
  if (!list.some(v => v.key === view)) view = 'framed';
  const current = list.find(v => v.key === view);
  const stage = $('#stage-image'); setImage(stage, current.img, current.alt);
  $('#stage-button').dataset.fit = current.fit;
  all('[data-view]').forEach(button => {
   const item = list.find(v => v.key === button.dataset.view); if (!item) return;
   const selected = item.key === view;
   button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
   button.dataset.fit = item.fit;
   setImage(button.querySelector('img'), item.img);
  });
  all('input[name=frame]').forEach(input => { input.checked = input.value === frame; input.closest('label').classList.toggle('is-selected', input.checked); });
  const current_frame = names[frame] + (frame === p.suggestedFrame ? ' · Recommended Frame' : '');
  ['#product-price', '#sticky-price'].forEach(s => { const el = $(s); if (el) el.textContent = money(p.prices[frame]); });
  ['#frame-current', '#sticky-frame'].forEach(s => { const el = $(s); if (el) el.textContent = s === '#sticky-frame' ? names[frame] : current_frame; });
  const craft = $('#craft-image'); if (craft) { setImage(craft, p.craft[frame], names[frame] + ' frame finish, close up'); }
  const craftName = $('#craft-name'); if (craftName) craftName.textContent = names[frame];
  const roomImage = $('#room-image');
  if (roomImage && p.roomImages) { setImage(roomImage, p.roomImages[frame], `${p.title} in a ${roomLower} — ${names[frame]} frame`); $('#room-caption').textContent = `${names[frame]} frame · illustrative ${roomLower} setting.`; }
  renderWall();
 }
 function renderWall() {
  const grid = $('#wall-grid'); if (!grid) return;
  grid.replaceChildren(...tiles().map((tile, index) => {
   const figure = document.createElement('figure'); figure.className = 'pd-tile' + (tile.large ? ' pd-tile--large' : ''); figure.dataset.fit = tile.fit;
   const button = document.createElement('button'); button.type = 'button'; button.setAttribute('aria-label', 'Enlarge: ' + tile.caption);
   const img = document.createElement('img'); img.src = url(tile.img.src); img.alt = tile.alt; img.loading = 'lazy'; img.decoding = 'async';
   button.append(img); button.addEventListener('click', () => openLightbox(tiles().map(t => ({src:url(t.img.zoom || t.img.src), alt:t.alt, caption:t.caption})), index));
   const caption = document.createElement('figcaption'); caption.textContent = tile.caption;
   figure.append(button, caption); return figure;
  }));
 }

 /* ---------- views and frames ---------- */
 all('[data-view]').forEach(button => button.addEventListener('click', () => { view = button.dataset.view; render(); }));
 const tablist = $('.pd-thumbs');
 if (tablist) tablist.addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const tabs = all('[data-view]'), i = tabs.indexOf(document.activeElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next].click(); tabs[next].focus();
 });
 all('input[name=frame]').forEach(input => input.addEventListener('change', () => {
  frame = input.value; try { sessionStorage.setItem(storeKey, frame); } catch {}
  render();
 }));

 /* ---------- lightbox ---------- */
 const dialog = $('#lightbox'), lightboxImage = $('#lightbox-image'), lightboxCaption = $('#lightbox-caption');
 const prev = $('#lightbox-prev'), next = $('#lightbox-next');
 let set = [], cursor = 0, previousOverflow = '', opener = null;
 function show() {
  const item = set[cursor]; lightboxImage.src = item.src; lightboxImage.alt = item.alt; lightboxCaption.textContent = `${item.caption} · ${cursor + 1} of ${set.length}`;
  prev.hidden = next.hidden = set.length < 2;
 }
 function openLightbox(items, index) {
  set = items; cursor = index; opener = document.activeElement; show();
  previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
  if (!dialog.open) dialog.showModal();
  $('#lightbox-close').focus();
 }
 function step(direction) { if (set.length < 2) return; cursor = (cursor + direction + set.length) % set.length; show(); }
 prev.addEventListener('click', () => step(-1)); next.addEventListener('click', () => step(1));
 $('#lightbox-close').addEventListener('click', () => dialog.close());
 dialog.addEventListener('close', () => { document.body.style.overflow = previousOverflow; lightboxImage.removeAttribute('src'); if (opener && opener.focus) opener.focus(); });
 dialog.addEventListener('click', event => { if (event.target === dialog || event.target.classList.contains('pd-lightbox__inner') || event.target.tagName === 'FIGURE') dialog.close(); });
 dialog.addEventListener('keydown', event => { if (event.key === 'ArrowLeft') step(-1); if (event.key === 'ArrowRight') step(1); });
 $('#stage-button').addEventListener('click', () => {
  const list = views(); openLightbox(list.map(v => ({src:url(v.img.zoom || v.img.src), alt:v.alt, caption:v.caption})), Math.max(0, list.findIndex(v => v.key === view)));
 });
 all('[data-zoom-src]').forEach(button => button.addEventListener('click', () => openLightbox([{src:url(button.dataset.zoomSrc), alt:button.dataset.zoomAlt || button.getAttribute('aria-label') || '', caption:button.dataset.zoomCaption || ''}], 0)));

 /* ---------- cart (prototype bag) ---------- */
 const cart = window.AalishaanBag;
 const notice = $('#pd-notice'); let noticeTimer;
 all('[data-add]').forEach(button => button.addEventListener('click', () => {
  if (!cart) return;
  const items = cart.read(), item = items.find(i => i.slug === p.slug && i.frame === frame);
  const limited = item && item.quantity >= 99;
  if (!limited) {
   if (item) item.quantity++; else items.push({slug:p.slug, frame, quantity:1});
   cart.save(items);
  }
  const checkout = $('#continue-checkout'); if (checkout) checkout.hidden = !cart.isPersistent();
  if (notice) {
   notice.textContent = !cart.isPersistent() ? 'Your selection is kept on this page only. Enable browser storage before continuing to checkout.' : limited ? 'Your bag already has 99 of this artwork and frame. Edit the quantity in your bag.' : 'Added to cart · ' + p.title + ' · ' + names[frame] + ' frame';
   notice.dataset.open = 'true'; clearTimeout(noticeTimer);
   if (cart.isPersistent()) noticeTimer = setTimeout(() => notice.removeAttribute('data-open'), 3600);
  }
 }));

 /* ---------- mobile purchase bar ---------- */
 const sticky = $('#pd-sticky'), mainCta = $('#main-cta'), footer = $('.site-footer');
 function stickyState() {
  if (!sticky || !mainCta) return;
  const cta = mainCta.getBoundingClientRect(), foot = footer ? footer.getBoundingClientRect() : {top:Infinity};
  sticky.dataset.visible = String(innerWidth <= 900 && cta.bottom < 0 && foot.top > innerHeight - 40);
 }
 window.addEventListener('scroll', stickyState, {passive:true}); window.addEventListener('resize', stickyState);

 render(); stickyState();
})();
