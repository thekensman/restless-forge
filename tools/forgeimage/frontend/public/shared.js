/* shared.js — ForgeImage shared header & footer
   Requires /shared.js (site/shared.js) to be loaded first — this calls
   window.rfMountToolChrome(), the shared chrome engine every tool uses. */
(function () {
  'use strict';
  var base = '/tools/forgeimage';

  var navLinks = [
    [base + '/', 'ForgeImage'],
    [base + '/articles/', 'Articles'],
    [base + '/about/', 'About'],
  ];

  var footerLinks = [
    [base + '/', 'ForgeImage'],
    [base + '/articles/', 'Articles'],
    [base + '/about/', 'About'],
  ];

  var chrome = window.rfMountToolChrome({
    base: base,
    idPrefix: 'fimg',
    brand: '🖼️ ForgeImage',
    navLinks: navLinks,
    footerLinks: footerLinks,
    copyrightHtml: 'ForgeImage.',
  });
  window.fimgHeader = chrome.header;
  window.fimgFooter = chrome.footer;
})();
