/* Aalishaan Admin / 86400 visual refinement.
 * Presentation only: no writes to StudioState, storage, services or business handlers.
 * The original modules remain intact. All copy changes are explicit and allowlisted.
 */
(() => {
  'use strict';
  const A = window.AdminUI;
  if (!A) return;

  const redundantIntros = new Set([
    'Every order. One clear next step.',
    'One catalogue. Images, prices and private originals kept together.',
    'Contact details, orders and support - together.',
    'One place for requests, returns and refunds.',
    'See the result. Open the records behind it.',
    'The numbers behind the work.',
    'You are the owner. Add colleagues only when you need them.',
    'One place to check the services behind your work.',
    'Review one situation at a time.',
    'Upload once for the shared references used by the approved product pages.'
  ]);
  const copy = new Map([
    ['Its details, images and private print files will open here.', ''],
    ['No open request here', 'No request selected'],
    ['Create a request when the customer needs help. The normal order starts without unrelated issues.', 'Choose a request or create a new one.'],
    ['Select a row or search for its order reference. Records outside the current demo are not invented.', 'Select an order or search its reference.'],
    ['Verify the existing payment. Never create another charge to check an uncertain one.', 'Check the existing payment; never create a second charge.'],
    ['Product description / story', 'Description'],
    ['Changing a URL here changes only the local draft.', 'Local draft only.'],
    ['Feature this product in the existing collection layout', 'Feature in collection'],
    ['Approved public asset reference', 'Approved website image'],
    ['Approved shared asset reference', 'Approved shared image'],
        ['Research keywords / planning notes', 'Research notes'],
    ['Staff records are local previews', 'Local staff preview'],
    ['Adding a person does not send an invitation or create a real account. Real login and server-enforced permissions remain outside this prototype.', 'No invitations or real accounts are created. Live login and server permissions are not connected.'],
    ['Set up your private vault', 'Private file vault'],
    ['Encrypted in this browser. Never added to public images or shared-image exports.', 'Encrypted locally. Excluded from public images and shared-image exports.'],
    ['Download a backup after important uploads. Private file contents stay encrypted in it; public images, metadata and fictional admin records do not. Keep backups outside your public website folder.', 'Back up important uploads. Private files stay encrypted; public images, metadata and sample records do not. Store backups outside your public website folder.'],
    ['Download full local backup', 'Download backup'],
    ['Request persistent local storage', 'Request persistent storage'],
    ['No live accounts are contacted here. A demo test result is not a verified test or live connection.', 'Local tests only. Results do not verify live connections.'],
    ['Required fields and prototype approvals are present. This does not verify a live integration.', 'Local checks passed. Live integration is not verified.'],
    ['Publication validates the local draft. No public page, deployment, search index or provider account is changed.', 'Demo publication only. Your website, deployment, search index and provider accounts stay unchanged.'],
    ['Saved in this browser. No live service was contacted.', 'Saved in this browser.'],
    ['Saved to the sample workspace.', 'Saved in this browser.']
  ]);
  const captions = new Map([
    ['SELECTED ORDER', 'Selected order'],
    ['CUSTOMER PROFILE', 'Customer profile'],
    ['SUPPORT WORKSPACE', 'Selected request'],
    ['ORDER WORKSPACE', 'Order details']
  ]);
  const originalAfter = A.afterRender;
  const normalise = text => text.replace(/\s+/g, ' ').trim();

  function simplifyText(root) {
    // Do not touch field contents, options, customer notes, record data or code.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest('script,style,input,textarea,option,pre,code,[contenteditable],.definition,.history-item,.message-item')) return NodeFilter.FILTER_REJECT;
        return copy.has(normalise(node.nodeValue)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const text = normalise(node.nodeValue);
      const replacement = copy.get(text);
      if (replacement === '') {
        const parent = node.parentElement;
        if (parent && parent.tagName === 'P' && normalise(parent.textContent) === text) parent.remove();
        else node.nodeValue = '';
      } else {
        // Preserve surrounding whitespace in links, labels and checkbox rows.
        node.nodeValue = node.nodeValue.replace(text, replacement);
      }
    }
  }

  function imageFallbacks(root) {
    for (const image of root.querySelectorAll('img[data-fallback]')) {
      if (image.dataset.uiWatched) continue;
      image.dataset.uiWatched = '1';
      const markUnavailable = () => {
        // Keep the original source and fallback attempt. Only decorate a failed image.
        if (!image.getAttribute('src') || (image.complete && !image.naturalWidth && image.dataset.tried)) {
          image.classList.add('ui-missing-image');
          image.style.visibility = 'visible';
          image.title = (image.alt || 'Image') + ' - website asset unavailable in this folder';
          image.dataset.uiOriginalSrc = image.dataset.fallback;
          // Transparent image prevents a browser broken-image icon. No invented artwork.
          image.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/%3E';
        }
      };
      image.addEventListener('error', () => queueMicrotask(markUnavailable));
      if (image.complete && !image.naturalWidth) queueMicrotask(markUnavailable);
    }
  }

  function enhance(root) {
    if (!root) return;
    for (const intro of root.querySelectorAll('.page-intro')) {
      if (redundantIntros.has(normalise(intro.textContent))) intro.remove();
    }
    simplifyText(root);
    for (const caption of root.querySelectorAll('.section-caption')) {
      const replacement = captions.get(normalise(caption.textContent).toUpperCase());
      if (replacement && caption.textContent !== replacement) caption.textContent = replacement;
    }
    // The link's existing accessible label retains the complete stage state.
    for (const hint of root.querySelectorAll('.rail-hint')) {
      if (['Upcoming', 'Completed'].includes(normalise(hint.textContent))) hint.hidden = true;
    }
    for (const stamp of root.querySelectorAll('.stage-time')) {
      if (normalise(stamp.textContent) === 'No completed event recorded') stamp.hidden = true;
    }
    for (const empty of root.querySelectorAll('.workspace-placeholder')) empty.classList.add('ui-empty-compact');
    for (const label of root.querySelectorAll('.dialog-head .eyebrow')) {
      if (normalise(label.textContent) === 'Studio workspace') label.classList.add('ui-dialog-label');
    }
    for (const p of root.querySelectorAll('p')) {
      if (p.textContent.startsWith('Payment-date cohort.')) p.classList.add('ui-report-note');
    }
    // Keep all columns and actions; phone layouts read as labelled record cards.
    for (const wrap of root.querySelectorAll('.table-wrap')) {
      if (!['Orders', 'Customers', 'Product catalogue', 'Support requests'].includes(wrap.getAttribute('aria-label'))) continue;
      const table = wrap.querySelector('table');
      if (!table) continue;
      table.classList.add('ui-card-table');
      table.setAttribute('role', 'table');
      const headers = [...table.querySelectorAll('thead th')].map(th => normalise(th.textContent));
      table.querySelectorAll('thead th').forEach(th => th.setAttribute('role', 'columnheader'));
      table.querySelectorAll('tr').forEach(row => row.setAttribute('role', 'row'));
      for (const row of table.querySelectorAll('tbody tr')) {
        [...row.cells].forEach((cell, index) => {
          cell.setAttribute('role', 'cell');
          cell.dataset.label = cell.colSpan > 1 ? '' : headers[index] || '';
        });
      }
    }
    imageFallbacks(root);
  }

  A.afterRender = function (...args) {
    if (originalAfter) originalAfter.apply(this, args);
    enhance(document.getElementById('main'));
    document.title = (document.querySelector('main h1')?.textContent || 'Admin') + ' | Aalishaan Studio';
  };

  // Drawers are created by existing handlers, many of which retain closed-over helpers.
  // Observing only their contents avoids replacing helpers or changing submit listeners.
  const dialog = document.getElementById('action-dialog');
  if (dialog) {
    new MutationObserver(() => enhance(dialog)).observe(dialog, { childList: true, subtree: true });
    // The original action dispatcher temporarily disables its button. Capture the
    // trigger before that happens, so cancelling a drawer restores keyboard focus.
    let drawerOrigin = null;
    document.addEventListener('click', event => {
      const trigger = event.target.closest('button[data-action]');
      if (!dialog.open && trigger) drawerOrigin = trigger;
    }, true);
    dialog.addEventListener('close', () => queueMicrotask(() => {
      if (drawerOrigin?.isConnected && !drawerOrigin.disabled) drawerOrigin.focus({ preventScroll: true });
      drawerOrigin = null;
    }));
  }
  const toast = document.getElementById('toast');
  if (toast) new MutationObserver(() => simplifyText(toast)).observe(toast, { childList: true });
  if (document.getElementById('main')?.children.length) enhance(document.getElementById('main'));
})();
