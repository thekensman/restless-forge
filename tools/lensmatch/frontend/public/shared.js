/* shared.js — LensMatch shared header & footer
   Requires /shared.js (site/shared.js) to be loaded first — this calls
   window.rfMountToolChrome(), the shared chrome engine every tool uses. */
(function () {
  'use strict';
  var base = '/tools/lensmatch';

  var navLinks = [
    [base + '/', 'Calculator'],
    [base + '/faq/', 'FAQ'],
    [base + '/about/', 'About'],
    [base + '/contact/', 'Contact'],
  ];

  var footerLinks = [
    [base + '/', 'Calculator'],
    [base + '/faq/', 'FAQ'],
    [base + '/about/', 'About'],
    [base + '/contact/', 'Contact'],
  ];

  var chrome = window.rfMountToolChrome({
    base: base,
    idPrefix: 'lm',
    brand: '📷 LensMatch',
    navLinks: navLinks,
    footerLinks: footerLinks,
    copyrightHtml: 'LensMatch.',
  });
  window.lmHeader = chrome.header;
  window.lmFooter = chrome.footer;
})();
