/* shared.js — PrintPlate shared header & footer
   Requires /shared.js (site/shared.js) to be loaded first — this calls
   window.rfMountToolChrome(), the shared chrome engine every tool uses. */
(function () {
  'use strict';
  var base = '/tools/printplate';

  // Legal + contact are site-global (/privacy, /terms, /contact) — client-side
  // tools don't ship their own. rfGlobalFooterLinks appends privacy/terms.
  var navLinks = [
    [base + '/', 'Troubleshooter'],
    [base + '/faq/', 'FAQ'],
    [base + '/about/', 'About'],
  ];

  var footerLinks = [
    [base + '/', 'Troubleshooter'],
    [base + '/faq/', 'FAQ'],
    [base + '/about/', 'About'],
    ['/contact', 'Contact'],
  ];

  var chrome = window.rfMountToolChrome({
    base: base,
    idPrefix: 'ppl',
    brand: '🖨️ PrintPlate',
    navLinks: navLinks,
    footerLinks: footerLinks,
    copyrightHtml: 'PrintPlate.',
  });
  window.pplHeader = chrome.header;
  window.pplFooter = chrome.footer;
})();
