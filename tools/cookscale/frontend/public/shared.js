/* shared.js — CookScale shared header & footer
   Requires /shared.js (site/shared.js) to be loaded first — this calls
   window.rfMountToolChrome(), the shared chrome engine every tool uses. */
(function () {
  'use strict';
  var base = '/tools/cookscale';

  var navLinks = [
    [base + '/', 'Converter'],
    [base + '/faq/', 'FAQ'],
    [base + '/about/', 'About'],
    [base + '/contact/', 'Contact'],
  ];

  var footerLinks = [
    [base + '/', 'Converter'],
    [base + '/faq/', 'FAQ'],
    [base + '/about/', 'About'],
    [base + '/contact/', 'Contact'],
  ];

  var chrome = window.rfMountToolChrome({
    base: base,
    idPrefix: 'cs',
    brand: '🍳 CookScale',
    navLinks: navLinks,
    footerLinks: footerLinks,
    copyrightHtml: 'CookScale.',
  });
  window.csHeader = chrome.header;
  window.csFooter = chrome.footer;
})();
