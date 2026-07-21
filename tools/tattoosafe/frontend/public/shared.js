/* shared.js — TattooSafe shared header & footer
   Requires /shared.js (site/shared.js) to be loaded first — this calls
   window.rfMountToolChrome(), the shared chrome engine every tool uses. */
(function () {
  'use strict';
  var base = '/tools/tattoosafe';

  var navLinks = [
    [base + '/', 'Preview'], [base + '/pricing/', 'Pricing'],
    [base + '/faq/', 'FAQ'], [base + '/about/', 'About'],
    [base + '/contact/', 'Contact'],
  ];

  var footerLinks = [
    [base + '/', 'Preview'], [base + '/pricing/', 'Pricing'],
    [base + '/faq/', 'FAQ'], [base + '/about/', 'About'],
    [base + '/contact/', 'Contact'],
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
