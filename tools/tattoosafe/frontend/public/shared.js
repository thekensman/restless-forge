/* shared.js — TattooSafe shared header & footer
   Requires /shared.js (site/shared.js) to be loaded first — this calls
   window.rfMountToolChrome(), the shared chrome engine every tool uses. */
(function () {
  'use strict';
  var base = '/tools/tattoosafe';

  // Legal + contact are site-global (/privacy, /terms, /contact) — client-side
  // tools don't ship their own. rfGlobalFooterLinks appends privacy/terms.
  var navLinks = [
    [base + '/', 'Preview'], [base + '/pricing/', 'Pricing'],
    [base + '/faq/', 'FAQ'], [base + '/articles/', 'Articles'], [base + '/about/', 'About'],
  ];

  var footerLinks = [
    [base + '/', 'Preview'], [base + '/pricing/', 'Pricing'],
    [base + '/faq/', 'FAQ'], [base + '/articles/', 'Articles'], [base + '/about/', 'About'],
    ['/contact', 'Contact'],
  ];

  var chrome = window.rfMountToolChrome({
    base: base,
    idPrefix: 'ts',
    brand: '&#x1F58B; TattooSafe',
    navLinks: navLinks,
    footerLinks: footerLinks,
    copyrightHtml: 'TattooSafe. Your design, your body, your browser.',
  });
  window.tsHeader = chrome.header;
  window.tsFooter = chrome.footer;
})();
