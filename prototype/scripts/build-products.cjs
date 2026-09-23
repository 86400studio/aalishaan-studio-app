// Product R3: a single calm buying page per artwork, built from data/products.json, the workbook export and the shared Home shell.
const fs = require('node:fs'), path = require('node:path');
const products = require('../data/products.json');
const {prices, frameImages, money, cardPrice} = require('./product-pricing.cjs');
const source = JSON.parse(fs.readFileSync('data/workbook-source.json', 'utf8').replace(/^﻿/, ''))[0];
const shell = fs.readFileSync('shop-all/index.html', 'utf8');
const header = shell.slice(shell.indexOf('<header class="site-header"'), shell.indexOf('<main id="main">'));
const footer = shell.slice(shell.indexOf('<footer'), shell.indexOf('<script id="browse-data"'));
const common = shell.slice(shell.indexOf('<script>\n(function'), shell.indexOf('</script><script src=', shell.indexOf('<script>\n(function')) + 9); // ends at the first external script after the inline block, so the build order no longer matters
if (!header || !footer || !common.includes('openDrawer')) throw Error('Shared Home shell missing');
if (/data-mega|mega-menu/.test(header)) throw Error('Shell header still contains dropdown menus');
const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names = {black:'Black', white:'White', 'antique-gold':'Antique Gold'};
const hueColours = {
 'Azurite blue':'#326582','Malachite green':'#54735d','Ink black':'#292c29','Radiant gold':'#b8954c',
 'Gold':'#b4934b','Moon white':'#e9e5d9','Soft pine green':'#6b7658','Soft gray':'#92958e','Warm paper white':'#ded9cb','One pale red accent':'#bd8c84',
 'Blossom reds':'#9c3d37','Warm paper':'#e6d8be','The faintest leaf green':'#afb69c','Bone white':'#dedbca','Slate indigo':'#39465c','Storm gray':'#7b858a','Umber':'#796044',
 'Blush-pink':'#c99c9a','Indigo-gray':'#697885','Rice-paper cream':'#e5dac1','Ocean blue':'#385b77','Shadow green':'#435851','Pearl white':'#e7e5db','Antique gold':'#a47b42',
 'Inky black':'#24292c','Rusty orange':'#8b5b3c','Deep sea blue':'#344b5b','One gold accent':'#b79a5d','Pale ultramarine':'#8498b7','Pewter gray':'#969d9c','Faint viridian':'#a3b9aa',
 'Natural wood tones from pale maple to dark walnut':'linear-gradient(90deg,#e0ceb0,#94704a,#553e2c)',
 'Deep black':'#292a27','Rich copper':'#a36d48','Warm gold':'#b69758','Sea-teal verdigris':'#628e86'
};
const faq = require('../data/before-you-buy.json');
// Delivery checking (user-requested, 2026-09-07): sample PIN-code serviceability and an illustrative delivery range; shared/delivery.js binds it and carries the code into Cart and Checkout.
const deliveryChecker = '<form class="pd-delivery-check" id="delivery-check" data-delivery-check novalidate><label for="delivery-pincode">Check delivery availability</label><div class="pd-delivery-check__row"><input id="delivery-pincode" name="pincode" type="text" inputmode="numeric" autocomplete="postal-code" maxlength="6" placeholder="6-digit PIN code" aria-describedby="delivery-result delivery-hint"><button type="submit">Check</button></div><p class="pd-delivery-check__result" id="delivery-result" data-delivery-result role="status" aria-live="polite"></p><p class="pd-delivery-check__hint" id="delivery-hint">Enter your PIN code to check availability, then see an estimated arrival. Sample coverage.</p></form>';
const heart = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/></svg>';
const warnings = [];
let built = 0;
for (const p of products) {
 const row = source.rows.find(r => r.row === p.sourceRow);
 if (!row) throw Error('Missing source row: ' + p.slug);
 const cell = k => row.cells[k + row.row] || '';
 const hues = cell('AJ').split(/\s*·\s*/).filter(Boolean).slice(0, 4).map(name => { if (!hueColours[name]) warnings.push(`No swatch colour for "${name}" (${p.slug})`); return {name, colour: hueColours[name] || '#d8d2c8'}; });
 const altText = cell('T') || p.alt;
 // The approved five-move description, split into readable paragraphs without changing a word.
 const d = p.description.trim();
 const iClose = d.indexOf('Stand close and it keeps giving:'), iObject = d.indexOf('You receive an archival');
 if (iClose < 0 || iObject < 0) throw Error('Description markers missing: ' + p.slug);
 let scene = d.slice(0, iClose).trim();
 const hook = p.hook.trim();
 const storyLead = (scene.match(/^[^.!?]+[.!?]/) || [scene])[0].trim();
 scene = scene.slice(storyLead.length).trim();
 if (storyLead !== hook) warnings.push(`Story lead differs from the scroll-stop hook for ${p.slug}`);
 const closeLook = d.slice(iClose, iObject).trim();
 const rest = d.slice(iObject).trim();
 const objectMatch = rest.match(/^([\s\S]*?black or white\.)\s*([\s\S]*)$/);
 const objectLine = objectMatch ? objectMatch[1] : rest, useLine = objectMatch ? objectMatch[2].trim() : '';
 const paragraphs = [scene, closeLook, objectLine, useLine].filter(Boolean);
 const descriptor = (p.fullTitle.split(' · ')[1] || '').trim();
 const dims = p.orientation === 'Portrait' ? '42 × 59.4 cm' : '59.4 × 42 cm';
 const inches = p.orientation === 'Portrait' ? '16.5 × 23.4 in' : '23.4 × 16.5 in';
 const room = p.rooms[0] || 'Living Room', roomLower = room.toLowerCase();
 const siblings = products.filter(q => q.slug !== p.slug && q.collection === p.collection).sort((a, b) => Number(b.style === p.style) - Number(a.style === p.style)).slice(0, 3);
 const frameOrder = [p.suggestedFrame, ...['black', 'antique-gold', 'white'].filter(f => f !== p.suggestedFrame)];
 const files = [`pages/artworks/${p.slug}/index.html`, ...(p.master ? ['product/index.html', `product/artworks/${p.slug}/index.html`] : [])];
 for (const file of files) {
  const prefix = path.posix.relative(path.posix.dirname(file), '.') + '/';
  const url = f => prefix + f;
  const remap = html => html.replace(/(href|src)="\.\.\//g, `$1="${prefix}`).replace(/srcset="([^"]+)"/g, (_, value) => `srcset="${value.replace(/\.\.\//g, prefix)}"`);
  const small = src => src.replace(/-1200\.webp$/, '-480.webp');
  const image = (obj, alt, extra = '', eager = false) => `<img src="${url(obj.src)}" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"${extra}>`;
  const framed = p.frames[p.suggestedFrame];
  const views = [
   ['framed', 'Framed', framed.image, 'contain'], ['closeup', 'Frame detail', framed.closeup, 'cover'], ['paper', 'Paper detail', p.paper, 'cover'],
   ...(p.master ? [['artwork', 'Artwork', p.master, 'contain']] : []), ...(p.roomImages ? [['room', 'In a room', p.roomImages[p.suggestedFrame], 'cover']] : []),
   ['scale', 'Scale guide', p.scale, 'contain']
  ];
  const card = q => { const href = url(`pages/artworks/${q.slug}/index.html`), src = q.frames[q.suggestedFrame].image.src; return `<article class="art-card" data-product="${q.slug}"><div class="art-card__media"><a class="art-card__main" href="${href}" aria-label="View ${esc(q.title)}"><img src="${url(src)}" srcset="${url(small(src))} 480w, ${url(src)} 1200w" sizes="(max-width:767px) 50vw, 420px" alt="${esc(q.title)} in a ${names[q.suggestedFrame].toLowerCase()} frame" width="1200" height="1200" loading="lazy" decoding="async"></a><button class="wishlist" type="button" data-wishlist aria-pressed="false" aria-label="Save ${esc(q.title)} to wishlist">${heart}</button></div><div class="art-card__body"><p class="art-card__label">Museum Grade Giclée Artwork</p><h3><a href="${href}">${esc(q.title)}</a></h3><p class="art-card__hook">${esc(q.hook)}</p><p class="art-card__price">${cardPrice(q.suggestedFrame)}</p><div class="art-card__actions"><a class="art-card__view" href="${href}">View Artwork <span aria-hidden="true">→</span></a></div></div></article>`; };
  let main = `
  <div class="container pd-top">${'<a class="back-link back-link--ink" href="' + url(`pages/collections/${p.collectionSlug}/index.html`) + '"><span aria-hidden="true">←</span> ' + esc(p.collection) + '</a>'}</div>
  <section class="container pd-hero" aria-label="Artwork and purchase options">
   <div class="pd-gallery" style="--stage-ratio:${p.orientation === 'Portrait' ? '1' : '4/3'}">
    <figure class="pd-stage"><button type="button" class="pd-stage__button" id="stage-button" data-fit="contain" aria-label="Enlarge this view">${image(framed.image, `${altText} — ${names[p.suggestedFrame]} frame`, ` id="stage-image" width="1200" height="${p.orientation === 'Portrait' ? 1200 : 900}"`, true)}<span class="pd-zoom-hint" aria-hidden="true">Enlarge</span></button></figure>
    <div class="pd-thumbs" role="tablist" aria-label="Artwork views">${views.map(([key, label, obj, fit], i) => `<button role="tab" type="button" data-view="${key}" data-fit="${fit}" aria-selected="${!i}" tabindex="${i ? -1 : 0}" aria-controls="stage-button">${image(obj, '')}<span>${label}</span></button>`).join('')}</div>
   </div>
   <div class="pd-buy">
    <p class="eyebrow pd-eyebrow"><a href="${url(`pages/collections/${p.collectionSlug}/index.html`)}">${esc(p.collection)}</a>${descriptor ? `<span aria-hidden="true">·</span><span>${esc(descriptor)}</span>` : ''}</p>
    <h1>${esc(p.title)}</h1>
    <p class="pd-hook">${esc(hook)}</p>
    <p class="pd-price"><strong>Price to be confirmed</strong><span>Framed and ready to hang · Delivered across India</span></p>
    <fieldset class="pd-frames"><legend>Frame finish <span id="frame-current">${names[p.suggestedFrame]} · Studio pick</span></legend><div class="pd-frames__options">${frameOrder.map(f => `<label class="pd-frame${f === p.suggestedFrame ? ' is-selected' : ''}"><input type="radio" name="frame" value="${f}"${f === p.suggestedFrame ? ' checked' : ''}><img src="${url(frameImages[f])}" alt="" loading="lazy" decoding="async"><span>${names[f]}</span><small>${f === p.suggestedFrame ? 'Studio pick' : '&nbsp;'}</small></label>`).join('')}</div></fieldset>
    <button type="button" class="button button--primary pd-add" id="main-cta" data-add>Add to cart</button><a class="button button--secondary pd-checkout" id="continue-checkout" href="${url('pages/checkout/index.html')}" hidden>Continue to Checkout</a>
    <p class="pd-launch">Pricing and delivery dates are being finalised. Checkout opens soon.</p>
    <ul class="pd-facts">
     <li><div><strong>Archival giclée print</strong><span>12-colour pigment inks on Hahnemühle Museum Etching 350 gsm cotton paper</span></div></li>
     <li><div><strong>A2 · ${dims} · ${esc(p.orientation)}</strong><span>Print size; the frame adds a border around it</span></div></li>
     <li><div><strong>Handcrafted wooden frame</strong><span>Antique gold, black or white, with clear acrylic glazing</span></div></li>
     <li><div><strong>Made to order</strong><span>Printed, framed and checked after you order, then delivered across India</span></div></li>
    </ul>
    <a class="pd-jump" href="#pd-help">Delivery, returns and care <span aria-hidden="true">↓</span></a>
   </div>
  </section>
  <section class="pd-section pd-section--ivory pd-story" aria-labelledby="story-title"><div class="container pd-story__grid">
   <div class="pd-story__copy"><span class="eyebrow">The story</span><h2 id="story-title">${esc(storyLead)}</h2>${paragraphs.map(t => `<p>${esc(t)}</p>`).join('')}</div>
   <aside class="pd-style" aria-labelledby="style-title"><span class="eyebrow">Art style</span><h3 id="style-title">${esc(p.style)}</h3><p>${esc(p.styleIntro)}</p><p class="pd-print-note">You receive an archival giclée print in this tradition. The marks, textures and metallic effects are reproduced in print.</p>
    ${hues.length ? `<div class="pd-palette" aria-label="Colours in this artwork">${hues.map(h => `<span><i style="background:${h.colour}" aria-hidden="true"></i><span>${esc(h.name)}</span></span>`).join('')}</div>` : ''}
    <dl class="pd-meta"><div><dt>Mood</dt><dd>${esc(p.moods.join(' · '))}</dd></div><div><dt>Suggested room</dt><dd>${esc(p.rooms.join(' · '))}</dd></div><div><dt>Colour palette</dt><dd>${esc(p.palettes.join(' · '))}</dd></div><div><dt>Orientation</dt><dd>${esc(p.orientation)}</dd></div></dl>
    <a class="text-link" href="${url(`pages/art-styles/${p.styleSlug}/index.html`)}">See all ${esc(p.style)} artworks</a></aside>
  </div></section>
  <section class="pd-section pd-wall" aria-labelledby="wall-title"><div class="container">
   <div class="pd-section__head"><div><span class="eyebrow">A closer look</span><h2 id="wall-title">The artwork, the frame and the paper.</h2></div><p>Select any image to enlarge it. Compare all three frames, with the studio’s recommended finish shown in detail.</p></div>
   <div class="pd-wall__grid" id="wall-grid">${[[p.artwork || p.master || p.paper, 'contain', p.artwork || p.master ? 'The artwork' : 'Artwork · paper detail', true], [framed.closeup, 'cover', `${names[p.suggestedFrame]} frame, close up`], [p.paper, 'cover', 'Print on Hahnemühle paper'], ...['white','black','antique-gold'].map(f => [p.frames[f].image, 'contain', `Framed in ${names[f]}`])].map(([obj, fit, caption, large]) => `<figure class="pd-tile${large ? ' pd-tile--large' : ''}" data-fit="${fit}"><button type="button" aria-label="Enlarge: ${esc(caption)}">${image(obj, `${p.title} — ${caption}`)}</button><figcaption>${esc(caption)}</figcaption></figure>`).join('')}</div>
  </div></section>
  <section class="pd-section pd-section--ivory pd-space" id="in-your-space" aria-labelledby="space-title"><div class="container pd-space__grid">
   <figure class="pd-space__visual${p.roomImages ? ' pd-space__visual--room' : ''}">${image(p.roomImages ? p.roomImages[p.suggestedFrame] : p.scale, p.roomImages ? `${p.title} in a ${roomLower} — ${names[p.suggestedFrame]} frame` : `Illustrative A2 ${p.orientation.toLowerCase()} size guide for a ${roomLower}; not this artwork`, ' id="room-image"')}<figcaption id="room-caption">${p.roomImages ? `${names[p.suggestedFrame]} frame · illustrative ${roomLower} setting.` : `Illustrative A2 ${p.orientation.toLowerCase()} scale in a ${roomLower}. The reference shows a plain A2 sheet, not this artwork.`}</figcaption></figure>
   <div class="pd-space__copy"><span class="eyebrow">Size and fit</span><h2 id="space-title">Will it fit your space?</h2><p>Every Aalishaan artwork is printed at A2 and framed to order. A2 holds a wall on its own and still sits comfortably above a console, desk or bedside.</p>
    <div class="pd-size"><strong>A2</strong><div><span>${dims}</span><small>${esc(p.orientation)} print size · ${inches}</small></div></div>
    <p class="pd-small">The finished frame extends beyond the print. Outer frame measurements will be confirmed before ordering.</p>
    <button type="button" class="text-link" data-zoom-src="${url(p.comparison.zoom)}" data-zoom-alt="A2 portrait and landscape orientations at true relative scale, 42 by 59.4 centimetres" data-zoom-caption="A2 size comparison">Compare A2 portrait and landscape</button>
   </div>
  </div></section>
  <section class="pd-section pd-arrives" aria-labelledby="arrives-title"><div class="container">
   <div class="pd-section__head"><div><span class="eyebrow">What arrives</span><h2 id="arrives-title">Made to order. Ready to hang.</h2></div><p>An archival giclée print on Hahnemühle Museum Etching 350 gsm paper, in the wooden frame you choose.</p></div>
   <div class="pd-spec-grid">
    <figure class="pd-spec"><button type="button" data-zoom-src="${url(p.paper.zoom)}" data-zoom-alt="${esc(p.title)} — print detail on Hahnemühle Museum Etching paper" data-zoom-caption="Print on Hahnemühle Museum Etching 350 gsm" aria-label="Enlarge the paper detail">${image(p.paper, `${p.title} — print detail on Hahnemühle Museum Etching paper`)}</button><figcaption><h3>Fine-art paper and print</h3><p>350 gsm cotton paper with a fine matt texture. This is the printed surface of your artwork.</p></figcaption></figure>
    <figure class="pd-spec">${image(p.craft[p.suggestedFrame], `${names[p.suggestedFrame]} frame finish, close up`, ' id="craft-image"')}<figcaption><h3>Handcrafted wooden frame</h3><p><span id="craft-name">${names[p.suggestedFrame]}</span> is selected. Carved solid wood in antique gold, black or white.</p></figcaption></figure>
    <figure class="pd-spec">${image(p.materials.glazing, 'Representative acrylic glazing in front of a print')}<figcaption><h3>Acrylic glazing</h3><p>A clear, light protective layer in front of the print.</p></figcaption></figure>
    <figure class="pd-spec">${image(p.materials.back, 'Representative back of frame with hanging hardware fitted')}<figcaption><h3>Hanging hardware fitted</h3><p>Sealed back with the hanging system attached, so it arrives ready for the wall.</p></figcaption></figure>
   </div>
   <p class="pd-small">Frame, glazing and hanging images show representative materials and finishes.</p>
  </div></section>
  <section class="pd-section pd-section--ivory pd-help" id="pd-help" aria-labelledby="help-title"><div class="container pd-help__grid">
   <div><div class="faq-illustration" aria-hidden="true"></div><span class="eyebrow">Before you buy</span><h2 id="help-title">Questions we’d ask too.</h2><p>Simple answers about the artwork, framing and delivery.</p><a class="button button--primary" href="${url('pages/contact/index.html')}">Ask us something else →</a></div>
   <div class="pd-faq">${faq.map(([q, a],i) => `<details class="r11-faq"${i===0?' open':''}><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>
  </div></section>
  <section class="pd-section pd-related" aria-labelledby="related-title"><div class="container">
   <div class="pd-section__head"><div><span class="eyebrow">${esc(p.collection)}</span><h2 id="related-title">More from this collection.</h2></div><a class="text-link" href="${url(`pages/collections/${p.collectionSlug}/index.html`)}">Open the collection</a></div>
   <div class="catalogue-grid pd-related__grid">${siblings.map(card).join('')}</div>
  </div></section>`;
  // R5 applies the approved purchase layout to every artwork; preserve lower sections.
  {
   const storyStart = main.indexOf('  <section class="pd-section pd-section--ivory pd-story"');
   let hero = main.slice(0, storyStart)
    .replace(/  <div class="container pd-top">.*?<\/div>\n/, '')
    .replace('container pd-hero', 'container pd-hero pd-hero--purchase')
    .replace(/    <p class="eyebrow pd-eyebrow">.*?<\/p>\n/, '')
    .replace(/<p class="pd-hook">.*?<\/p>/, `<p class="pd-hook">${esc(p.slug === 'the-blossom-over-the-closed-window' ? 'A quiet study of scarlet blossom against an aged architectural surface.' : hook)}</p>`)
    .replace(/<p class="pd-price">.*?<\/p>/, `<p class="pd-price"><strong id="product-price" aria-live="polite">${money(p.suggestedFrame)}</strong></p>`)
    .replace(/<legend>.*?<\/legend>/, '<legend>Frame</legend>')
    .replace(/<small>.*?<\/small>/g, '')
    .replace(/(<span>)(White|Black|Antique Gold)(<\/span>)/g, (all, open, name, close) => all + `<span class="pd-frame-price">${money(Object.keys(names).find(f => names[f] === name))}</span>`)
    .replace('</fieldset>', `</fieldset><p class="pd-recommendation">Recommended Frame: ${names[p.suggestedFrame]}</p>`)
    .replace(/<p class="pd-launch">.*?<\/p>/, '<p class="pd-reassurance">Framed and ready to hang · Delivered across India</p>' + deliveryChecker)
    .replace(/<ul class="pd-facts">[\s\S]*?<\/ul>/, '')
    .replace('Printed, framed and checked after you order, then delivered across India', 'Printed, framed and individually checked after you order.')
    .replace(/<a class="pd-jump".*?<\/a>/, `<nav class="pd-section-nav" aria-label="Explore this artwork"><a class="button button--secondary" href="#in-your-space">Size guide</a><a class="button button--secondary" href="#what-you-receive">What you’ll receive</a><a class="button button--secondary" href="#artwork-story">The artwork’s story</a><a class="button button--secondary" href="#pd-help">FAQs</a></nav>`);
   const icons = [
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="16" cy="8" r="1.5"/><path d="m3 17 6-6 5 5 3-3 4 4"/>',
    '<path d="M8 3H3v5M16 21h5v-5M3 3l7 7m11 11-7-7M16 3h5v5M3 16v5h5M21 3l-7 7M3 21l7-7"/>',
    '<path d="M3 21V3h18v4H7v14H3Zm8 0V11h10v4h-6v6h-4Z"/>',
    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
   ];
   let fact = 0;
   hero = hero.replace(/<li><div>/g, () => `<li><svg viewBox="0 0 24 24" aria-hidden="true">${icons[fact++]}</svg><div>`);
   const sections = main.slice(storyStart).match(/<section\b[\s\S]*?<\/section>/g);
   const [story, moodboard, size, arrives, help, related] = sections;
   // Keep the complete moodboard unchanged in the second lower-page position.
   main = hero + [
    size.replace('<span class="eyebrow">Size and fit</span>', '').replace('Will it fit your space?', 'Size guide'),
    moodboard,
    arrives.replace('pd-arrives"', 'pd-arrives" id="what-you-receive"').replace('<span class="eyebrow">What arrives</span>', '').replace('Made to order. Ready to hang.</h2>', 'What you’ll receive</h2>'),
    story.replace('pd-story"', 'pd-story" id="artwork-story"').replace('<span class="eyebrow">The story</span>', '').replace(`<h2 id="story-title">${esc(storyLead)}</h2>`, `<h2 id="story-title">The artwork’s story</h2><p class="pd-story-lead">${esc(storyLead)}</p>`),
    help.replace('<div class="faq-illustration" aria-hidden="true"></div>', `<img class="pd-faq-image" src="${url('assets/site/Product Page FAQ.png')}" width="1672" height="941" alt="" loading="lazy">`).replace('Questions we’d ask too.', 'FAQs').replace('</div>\n  </div></section>', `<details class="r11-faq"><summary>Where can I find delivery and return information?</summary><p>Each piece is printed and framed after you order. Read our <a href="${url('pages/policies/shipping/index.html')}">Shipping &amp; Delivery</a> and <a href="${url('pages/policies/returns/index.html')}">Returns &amp; Replacements</a> information.</p></details><details class="r11-faq"><summary>How do I care for my artwork?</summary><p>Hang away from direct sunlight and moisture. Dust with a soft, dry cloth.</p></details></div>\n  </div></section>`),
    related
   ].join('\n');
  }
  const overlays = `<dialog id="lightbox" class="pd-lightbox" aria-label="Enlarged image"><div class="pd-lightbox__inner"><div class="pd-lightbox__bar"><p id="lightbox-caption"></p><button type="button" class="pd-lightbox__close" id="lightbox-close">Close ✕</button></div><figure><img id="lightbox-image" alt=""></figure><button type="button" class="pd-lightbox__nav pd-lightbox__nav--prev" id="lightbox-prev" aria-label="Previous image">‹</button><button type="button" class="pd-lightbox__nav pd-lightbox__nav--next" id="lightbox-next" aria-label="Next image">›</button></div></dialog><div id="pd-notice" class="pd-notice" role="status" aria-live="polite"></div><div id="pd-sticky" class="pd-sticky" data-visible="false"><div><strong>${esc(p.title)}</strong><small>A2 · <span id="sticky-frame">${names[p.suggestedFrame]}</span> · <span id="sticky-price">${money(p.suggestedFrame)}</span></small></div><button type="button" class="button button--primary" data-add>Add to cart</button></div>`;
  const sharedFooter = remap(footer).replace(/<div class="cart-empty">[\s\S]*?<\/div>/, '<div data-bag-items></div><p class="pd-bag-note">Checkout is not yet available.</p>');
  const dataJson = JSON.stringify({...p, prices, altText, prefix}).replaceAll('<', '\\u003c');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#ffffff"><title>${esc(cell('R') || p.title + ' | Aalishaan Studio')}</title><meta name="description" content="${esc(cell('S') || hook)}"><link rel="canonical" href="${url(`pages/artworks/${p.slug}/index.html`)}"><link rel="stylesheet" href="${url('shared/browse-home.css')}"><link rel="stylesheet" href="${url('shared/home-r2.css')}"><link rel="stylesheet" href="${url('shared/browse.css')}"><link rel="stylesheet" href="${url('product/r3.css')}"><link rel="stylesheet" href="${url('shared/gallery-r8.css')}"><link rel="stylesheet" href="${url('shared/revision-r9.css')}"><link rel="stylesheet" href="${url('shared/revision-r11.css')}"><script>document.documentElement.classList.add('js')</script></head><body class="browse-page product-page"><a class="skip-link" href="#main">Skip to main content</a>${remap(header)}<main id="main" class="pd">${main}</main>${sharedFooter}${overlays}<script type="application/json" id="product-data">${dataJson}</script>${common}<script src="${url('shared/prototype-data.js')}"></script><script src="${url('shared/bag.js')}"></script><script src="${url('product/r3.js')}" defer></script><script src="${url('shared/delivery.js')}" defer></script><noscript><p class="pd-noscript">Frame switching, image enlargement and the cart need JavaScript. All artwork details are shown above.</p></noscript></body></html>`;
  fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, html); built++;
 }
}
for (const w of [...new Set(warnings)]) console.warn('Warning: ' + w);
console.log(`Built Product R3: ${products.length} artworks, ${built} files.`);
