/* shared.js — PetDose shared header & footer
   Requires /shared.js (site/shared.js) to be loaded first — this calls
   window.rfMountToolChrome(), the shared chrome engine every tool uses. */
(function () {
  'use strict';
  var base = '/tools/petdose';

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
    idPrefix: 'pd',
    brand: '🐾 PetDose',
    navLinks: navLinks,
    footerLinks: footerLinks,
    copyrightHtml: 'PetDose.',
  });
  window.pdHeader = chrome.header;
  window.pdFooter = chrome.footer;
})();
