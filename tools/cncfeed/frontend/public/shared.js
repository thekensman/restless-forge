/* shared.js — CNCFeed shared header & footer
   Requires /shared.js (site/shared.js) to be loaded first — this calls
   window.rfMountToolChrome(), the shared chrome engine every tool uses. */
(function () {
  'use strict';
  var base = '/tools/cncfeed';

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
    idPrefix: 'cf',
    brand: '⚙️ CNCFeed',
    navLinks: navLinks,
    footerLinks: footerLinks,
    copyrightHtml: 'CNCFeed.',
  });
  window.cfHeader = chrome.header;
  window.cfFooter = chrome.footer;
})();
