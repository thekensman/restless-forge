/* shared.js — ForgeInvoice shared header & footer
   Requires /shared.js (site/shared.js) to be loaded first — this calls
   window.rfMountToolChrome(), the shared chrome engine every tool uses. */
(function () {
  'use strict';
  var base = '/tools/forgeinvoice';

  var navLinks = [
    [base + '/', 'ForgeInvoice'],
    [base + '/about/', 'About'],
  ];

  var footerLinks = [
    [base + '/', 'ForgeInvoice'],
    [base + '/about/', 'About'],
  ];

  var chrome = window.rfMountToolChrome({
    base: base,
    idPrefix: 'fi',
    brand: '🧾 ForgeInvoice',
    navLinks: navLinks,
    footerLinks: footerLinks,
    copyrightHtml: 'ForgeInvoice.',
  });
  window.fiHeader = chrome.header;
  window.fiFooter = chrome.footer;
})();
