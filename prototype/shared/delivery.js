/* Aalishaan Studio — delivery checking (prototype).
   Checks a six-digit Indian PIN code against a small SAMPLE coverage table and shows an illustrative
   delivery range (production window + courier transit). The checked PIN code is remembered in this browser
   so Cart and Checkout can carry it forward. No service is called; live estimates must come from confirmed
   production times and courier coverage. Shared by the storefront and the Admin prototype. */
(() => {
 const KEY = 'aalishaanDeliveryCheck';
 const PRODUCTION_DAYS = [7, 10]; // illustrative production window, calendar days
 const METRO = ['110', '120', '121', '122', '201', '302', '380', '400', '401', '411', '500', '560', '600', '700'];
 const REMOTE = /^(78|79)/; // sample: north-east routes take longer
 const UNSERVICEABLE = [/^744/, /^6825/, /^19[0-4]/, /^9/]; // sample: island, Lakshadweep, remote hill and army postal ranges
 const LOOKUP_FAILURE = '111111'; // sample PIN code that demonstrates a lookup failure
 const REGIONS = {1: 'Delhi & the north', 2: 'Uttar Pradesh & Uttarakhand', 3: 'Rajasthan & Gujarat', 4: 'Maharashtra, Goa & central India', 5: 'Telangana, Andhra & Karnataka', 6: 'Tamil Nadu & Kerala', 7: 'Bengal, Odisha & the north-east', 8: 'Bihar & Jharkhand', 9: 'Army postal service'};
 const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
 const iso = d => new Date(d).toISOString();
 const short = new Intl.DateTimeFormat('en-IN', {day: 'numeric', month: 'short'});
 function range(result) { if (!result || !result.estimate) return ''; const a = new Date(result.estimate.from), b = new Date(result.estimate.to); const sameMonth = a.getMonth() === b.getMonth(); return sameMonth ? a.getDate() + '–' + short.format(b) : short.format(a) + ' – ' + short.format(b); }
 function check(pincode, options = {}) {
  const p = String(pincode || '').trim();
  const checkedAt = iso(options.today || new Date());
  if (!/^[1-9][0-9]{5}$/.test(p)) return {status: 'invalid', pincode: p, checkedAt, message: 'Enter a six-digit Indian PIN code. It cannot start with 0.'};
  if (p === LOOKUP_FAILURE) return {status: 'error', pincode: p, checkedAt, message: 'Availability could not be checked. Please try again or contact support before continuing.'};
  const zone = REGIONS[p[0]];
  if (UNSERVICEABLE.some(r => r.test(p))) return {status: 'unserviceable', pincode: p, zone, checkedAt, message: 'Sorry, we can’t deliver framed artwork to ' + p + ' yet. Courier coverage for this area is still being confirmed.'};
  const region = METRO.some(m => p.startsWith(m)) ? 'metro' : REMOTE.test(p) ? 'remote' : 'standard';
  const transit = region === 'metro' ? [2, 4] : region === 'remote' ? [6, 9] : [4, 7];
  const base = options.today ? new Date(options.today) : new Date();
  const result = {status: 'serviceable', pincode: p, zone, region, transitDays: transit, productionDays: PRODUCTION_DAYS, estimate: {from: iso(addDays(base, PRODUCTION_DAYS[0] + transit[0])), to: iso(addDays(base, PRODUCTION_DAYS[1] + transit[1]))}, checkedAt};
  result.message = 'Delivers to ' + p + ' · estimated ' + range(result);
  return result;
 }
 function read() { try { const r = JSON.parse(localStorage.getItem(KEY) || 'null'); return r && /^[1-9][0-9]{5}$/.test(r.pincode) ? check(r.pincode) : null; } catch { return null; } }
 function save(result) { try { if (result) localStorage.setItem(KEY, JSON.stringify(result)); else localStorage.removeItem(KEY); } catch {} window.dispatchEvent(new CustomEvent('deliverycheck', {detail: result})); }
 const clear = () => save(null);
 function describe(result, {compact = false} = {}) {
  if (!result) return '';
  if (result.status === 'serviceable') return `<strong>Delivery available to ${result.pincode}</strong><br><span>Estimated arrival: ${range(result)}</span><small>${compact ? 'Sample coverage and estimate.' : `${result.productionDays[0]}–${result.productionDays[1]} days to print and frame, then ${result.transitDays[0]}–${result.transitDays[1]} days in transit. Sample coverage and estimate; final details will be confirmed before orders open.`}</small>`;
  if (result.status === 'unserviceable') return `<strong>Delivery not available to ${result.pincode}</strong><small>Try another delivery address or contact support. Sample coverage; live availability is not yet connected.</small>`;
  if (result.status === 'error') return result.message;
  return result.message;
 }
 /* Bind a checker form: form contains input[name=pincode] and a submit button; results render into resultEl. */
 function bind(form, resultEl, {compact = false, onResult = null, prefill = true} = {}) {
  const input = form.querySelector('[name=pincode]'); if (!input) return;
  const show = result => { resultEl.innerHTML = describe(result, {compact}); resultEl.dataset.status = result ? result.status : ''; input.setAttribute('aria-invalid', String(result ? result.status === 'invalid' : false)); form.dataset.status = result ? result.status : ''; };
  const saved = read(); if (prefill && saved) { input.value = saved.pincode; show(check(saved.pincode)); }
  form.addEventListener('submit', e => { e.preventDefault(); const result = check(input.value); if (result.status !== 'invalid') save(result); show(result); if (result.status === 'invalid') input.focus(); onResult && onResult(result); });
  input.addEventListener('input', () => { const value=input.value.replace(/\D/g, '').slice(0, 6); if(read())clear(); input.value=value; resultEl.textContent=value?'Check this PIN code to confirm delivery availability.':''; resultEl.dataset.status=''; input.setAttribute('aria-invalid','false'); form.dataset.status=''; });
  window.addEventListener('deliverycheck', e => { if (e.detail && e.detail.pincode !== input.value) { input.value = e.detail.pincode; show(e.detail); } if (!e.detail) { input.value = ''; show(null); } });
 }
 const api = {KEY, PRODUCTION_DAYS, check, read, save, clear, range, describe, bind};
 window.AalishaanDelivery = api;
 /* Auto-bind storefront pages */
 document.addEventListener('DOMContentLoaded', () => {
  for (const form of document.querySelectorAll('form[data-delivery-check]')) { const result = form.querySelector('[data-delivery-result]') || document.getElementById(form.getAttribute('aria-describedby')); if (result) bind(form, result, {compact: form.dataset.deliveryCheck === 'compact'}); }
  /* Cart / checkout totals: one-line delivery summary that follows the remembered check. */
  const summaries = document.querySelectorAll('[data-delivery-summary]');
  if (summaries.length) {
   const paint = r => { const text = !r ? summaries[0].dataset.empty || 'Check your PIN code' : r.status === 'serviceable' ? 'Available to ' + r.pincode + ' · estimated ' + range(r) + ' (sample)' : r.status === 'unserviceable' ? 'Not available to ' + r.pincode : r.status === 'error' ? 'Availability not confirmed for ' + r.pincode : 'Check your PIN code'; summaries.forEach(el => { el.textContent = text; el.dataset.status = r ? r.status : ''; }); };
   paint(read()); window.addEventListener('deliverycheck', e => paint(e.detail));
  }
  /* Checkout: PIN field carries the checked code and re-validates as the customer types. */
  const checkout = document.getElementById('checkout-form');
  if (checkout && checkout.elements.pin && !checkout.hasAttribute('data-guided-checkout')) {
   const pin = checkout.elements.pin, line = document.getElementById('checkout-delivery'), submit = checkout.querySelector('button[type=submit],button:not([type])');
   const saved = read(); if (saved) pin.value = saved.pincode;
   /* The bag owns the empty-bag disable; the checker may only add a reason to keep the button disabled. */
   const bagEmpty = () => { try { return !window.AalishaanBag || window.AalishaanBag.read().length === 0; } catch { return false; } };
   const update = () => { const v = pin.value.trim(); const empty = bagEmpty();
    if (!v) { if (line) { line.innerHTML = 'Enter your PIN code to see a sample delivery estimate.'; line.dataset.status = ''; } pin.setAttribute('aria-invalid', 'false'); if (submit) submit.disabled = empty; return; }
    const r = v.length === 6 ? check(v) : {status: 'invalid', message: 'Enter all six digits of your PIN code.'};
    if (r.status !== 'invalid') save(r);
    if (line) { line.innerHTML = describe(r); line.dataset.status = r.status; }
    pin.setAttribute('aria-invalid', String(r.status === 'invalid' || r.status === 'unserviceable'));
    if (submit) submit.disabled = empty || r.status === 'unserviceable' || r.status === 'invalid'; };
   pin.addEventListener('input', () => { pin.value = pin.value.replace(/\D/g, '').slice(0, 6); update(); });
   update();
   window.addEventListener('bagchange', () => setTimeout(update, 0));
  }
 });
})();
