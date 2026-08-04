/* shared.js — KnotGuide shared header & footer
   Requires /shared.js (site/shared.js) to be loaded first — this calls
   window.rfMountToolChrome(), the shared chrome engine every tool uses. */
(function () {
  'use strict';
  var base = '/tools/knotguide';

  // Legal + contact are site-global (/privacy, /terms, /contact) — client-side
  // tools don't ship their own. rfGlobalFooterLinks appends privacy/terms.
  var navLinks = [
    [base + '/', 'Guide'],
    [base + '/faq/', 'FAQ'],
    [base + '/about/', 'About'],
  ];

  var footerLinks = [
    [base + '/', 'Guide'],
    [base + '/faq/', 'FAQ'],
    [base + '/about/', 'About'],
    ['/contact', 'Contact'],
  ];

  var chrome = window.rfMountToolChrome({
    base: base,
    idPrefix: 'kg',
    brand: '🪢 KnotGuide',
    navLinks: navLinks,
    footerLinks: footerLinks,
    copyrightHtml: 'KnotGuide.',
  });
  window.kgHeader = chrome.header;
  window.kgFooter = chrome.footer;
})();
