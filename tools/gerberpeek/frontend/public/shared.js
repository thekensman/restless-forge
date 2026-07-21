/* shared.js — GerberPeek shared header & footer
   Requires /shared.js (site/shared.js) to be loaded first — this calls
   window.rfMountToolChrome(), the shared chrome engine every tool uses. */
(function () {
  'use strict';
  var base = '/tools/gerberpeek';

  var navLinks = [
    [base + '/', 'Viewer'],
    [base + '/faq/', 'FAQ'],
    [base + '/about/', 'About'],
    [base + '/contact/', 'Contact'],
  ];

  var footerLinks = [
    [base + '/', 'Viewer'],
    [base + '/faq/', 'FAQ'],
    [base + '/about/', 'About'],
    [base + '/contact/', 'Contact'],
  ];

  var chrome = window.rfMountToolChrome({
    base: base,
    idPrefix: 'gp',
    brand: '📐 GerberPeek',
    navLinks: navLinks,
    footerLinks: footerLinks,
    copyrightHtml: 'GerberPeek.',
  });
  window.gpHeader = chrome.header;
  window.gpFooter = chrome.footer;
})();
