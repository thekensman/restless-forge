/* shared.js — StitchTrace shared header & footer
   Requires /shared.js (site/shared.js) to be loaded first — this calls
   window.rfMountToolChrome(), the shared chrome engine every tool uses. */
(function () {
  'use strict';
  var base = '/tools/stitchtrace';

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
    idPrefix: 'st',
    brand: '🧵 StitchTrace',
    navLinks: navLinks,
    footerLinks: footerLinks,
    copyrightHtml: 'StitchTrace.',
  });
  window.stHeader = chrome.header;
  window.stFooter = chrome.footer;
})();
