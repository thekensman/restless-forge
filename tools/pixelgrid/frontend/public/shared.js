/* shared.js — PixelGrid shared header & footer
   Requires /shared.js (site/shared.js) to be loaded first — this calls
   window.rfMountToolChrome(), the shared chrome engine every tool uses. */
(function () {
  'use strict';
  var base = '/tools/pixelgrid';

  var navLinks = [
    [base + '/', 'Generator'],
    [base + '/faq/', 'FAQ'],
    [base + '/about/', 'About'],
    [base + '/contact/', 'Contact'],
  ];

  var footerLinks = [
    [base + '/', 'Generator'],
    [base + '/faq/', 'FAQ'],
    [base + '/about/', 'About'],
    [base + '/contact/', 'Contact'],
  ];

  var chrome = window.rfMountToolChrome({
    base: base,
    idPrefix: 'pg',
    brand: '🧩 PixelGrid',
    navLinks: navLinks,
    footerLinks: footerLinks,
    copyrightHtml: 'PixelGrid.',
  });
  window.pgHeader = chrome.header;
  window.pgFooter = chrome.footer;
})();
