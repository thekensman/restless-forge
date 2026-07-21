/* shared.js — ForgeResume shared header & footer
   Requires /shared.js (site/shared.js) to be loaded first — this calls
   window.rfMountToolChrome(), the shared chrome engine every tool uses. */
(function () {
  'use strict';
  var base = '/tools/forgeresume';

  var navLinks = [
    [base + '/', 'ForgeResume'],
    [base + '/about/', 'About'],
  ];

  var footerLinks = [
    [base + '/', 'ForgeResume'],
    [base + '/about/', 'About'],
  ];

  var chrome = window.rfMountToolChrome({
    base: base,
    idPrefix: 'fr',
    brand: '📝 ForgeResume',
    navLinks: navLinks,
    footerLinks: footerLinks,
    copyrightHtml: 'ForgeResume.',
  });
  window.frHeader = chrome.header;
  window.frFooter = chrome.footer;
})();
