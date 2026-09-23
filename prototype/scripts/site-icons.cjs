const paths={
 studio:'<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-7h6v7M9 9h6"/>',
 faq:'<path d="M8 9a4 4 0 0 1 8 0c0 3-4 3-4 6M12 18h.01"/><rect x="3" y="2" width="18" height="20" rx="4"/>',
 shipping:'<path d="M3 5h11v12H3zM14 9h4l3 4v4h-7M4 17h2m4 0h6"/><circle cx="8" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
 returns:'<path d="M8 4 3 9l5 5M3 9h11a7 7 0 0 1 0 14" transform="translate(0 -2)"/>',
 privacy:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>',
 support:'<path d="M4 14v-3a8 8 0 0 1 16 0v3M4 12H2v6h4v-6zM20 12h2v6h-4v-6zM20 18c0 3-4 3-8 3"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 bag:'<path d="M5 7h14l2 14H3zM8 8V6a4 4 0 0 1 8 0v2"/>',
 search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
 error:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 7v6M12 17h.01"/>'
};
module.exports=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.studio}</svg>`;
