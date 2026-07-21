/* shared.js — PlotPath shared header & footer
   Requires /shared.js (site/shared.js) to be loaded first — this calls
   window.rfMountToolChrome(), the shared chrome engine every tool uses. */
(function () {
  'use strict';
  var base = '/tools/plotpath';

  var navLinks = [
    [base + '/', 'Optimizer'],
    [base + '/faq/', 'FAQ'],
    [base + '/about/', 'About'],
    [base + '/contact/', 'Contact'],
  ];

  var footerLinks = [
    [base + '/', 'Optimizer'],
    [base + '/faq/', 'FAQ'],
    [base + '/about/', 'About'],
    [base + '/contact/', 'Contact'],
  ];

  var chrome = window.rfMountToolChrome({
    base: base,
    idPrefix: 'pp',
    brand: '🖊️ PlotPath',
    navLinks: navLinks,
    footerLinks: footerLinks,
    copyrightHtml: 'PlotPath.',
  });
  window.ppHeader = chrome.header;
  window.ppFooter = chrome.footer;
})();
