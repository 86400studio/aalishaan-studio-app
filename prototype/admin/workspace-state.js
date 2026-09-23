/* A2 presentation state on top of the original transactional model. */
(() => {
  'use strict';
  const S = window.AdminStore;
  function enrichProducts() {
    for (const p of S.state.products) {
      const source = window.AdminPublicCatalogue.find(x => x.slug === p.slug);
      if (!p.cms) p.cms = { orientation: source?.orientation || 'Portrait', palettes: source?.palettes || [], hook: source?.hook || '', seoTitle: source?.fullTitle || p.title, seoDescription: (p.copy || '').slice(0, 155), alt: source?.alt || p.title, searchKeywords: '', media: {}, suggestedFrame: source?.suggestedFrame || 'black' };
      p.history = p.history || [];
    }
    S.state.staff = S.state.staff || [];
    S.state.contacts = S.state.contacts || [];
    S.state.ui2 = S.state.ui2 || {version: 2, scenario: 2};
    for (const c of S.state.customers) { c.tags = c.tags || []; c.address = c.address || ''; }
  }
  function startScenario(n = 2) {
    if (!Number.isInteger(n) || n < 1 || n > 23) throw Error('Choose a valid demonstration.');
    const products = S.clone(S.state.products).filter(p => !p.scenarioOnly), staff = S.clone(S.state.staff || []), oldUI = S.clone(S.state.ui2 || {});
    S.reset(n);
    const map = {3: ['AS-1002'],4: ['AS-1001','AS-1005'],5: ['AS-1005'],6: ['AS-1001'],7: ['AS-1006'],9: ['AS-1003'],11: ['AS-1004'],12: ['AS-1004'],13: ['AS-1003','AS-1005'],19: ['AS-1004']};
    const ids = map[n] || ['AS-1001'];
    S.mutate('DEMO', 'Start isolated scenario '+n, () => {
      const s = S.state; s.products = products; s.staff = staff; s.contacts = [];
      s.ui2 = {...oldUI, version: 2, scenario: n}; s.scenario = n;
      s.orders = s.orders.filter(o => ids.includes(o.id));
      const cids = new Set(s.orders.map(o => o.customer));
      s.customers = s.customers.filter(c => cids.has(c.id));
      s.cases = s.cases.filter(c => ids.includes(c.order));
      s.messages = s.messages.filter(m => ids.includes(m.order));
      s.tasks = s.tasks.filter(t => ids.includes(t.record) || s.cases.some(c => c.id === t.record));
      s.orders.forEach(o => {o.owner = S.names.owner; o.items.forEach(i=>i.stageEvents=i.stageEvents||[]);});
      s.cases.forEach(c => {c.owner = S.names.owner;}); s.tasks.forEach(t => t.owner=S.names.owner);
      s.filters = {q:'',status:'All',owner:'All'}; s.views=[]; s.bulkResults=[];
      s.incident = {owner:S.names.owner,status:'Resolved',note:'No active incident in this scenario.'};
      if(n===11) {const o=s.orders[0];o.refunds=[];o.dispute='None';}
      if(n===16) {const p=S.clone(s.products[0]);p.id='ART-DEMO';p.title='My sample artwork';p.slug='my-sample-artwork';p.status='Draft';p.rights=false;p.sample=false;p.fileApproved=false;p.imageNote='Add your product images';p.history=[];p.version=1;p.scenarioOnly=true;p.newDraft=true;p.printFileId=null;p.approvalFileIds=[];p.fileVersion='v1';p.approvalNote='';p.approvedBy='';p.approvedAt=null;p.publishedAt=null;p.everPublished=false;p.image='';p.cms={...p.cms,media:{}};s.products.push(p);}
      enrichProducts();
    });
    if(n===20) S.setRole('operations');
    return S.state;
  }
  // Existing A1 records are migrated, never silently cleared on installation.
  const oldSaved = (()=>{try{return !!localStorage.getItem(S.KEY);}catch{return false;}})();
  if(!S.state.ui2) {
    if(!oldSaved) startScenario(2);
    else {enrichProducts();S.state.ui2.migrated=true;S.save();}
  } else enrichProducts();
  window.StudioState = {startScenario,enrichProducts, demoDate:'2026-09-13'};
})();
