/* shared.js — ForgeDoc shared header & footer
   Requires /shared.js (site/shared.js) to be loaded first — this calls
   window.rfMountToolChrome(), the shared chrome engine every tool uses. */
(function () {
  'use strict';
  var base = '/tools/forgedoc';

  var navLinks = [
    [base + '/', 'ForgeDoc'],
    [base + '/about/', 'About'],
  ];

  var footerLinks = [
    [base + '/', 'ForgeDoc'],
    [base + '/about/', 'About'],
  ];

  var chrome = window.rfMountToolChrome({
    base: base,
    idPrefix: 'fd',
    brand: '📄 ForgeDoc',
    navLinks: navLinks,
    footerLinks: footerLinks,
    copyrightHtml: 'ForgeDoc.',
  });
  window.fdHeader = chrome.header;
  window.fdFooter = chrome.footer;
})();
