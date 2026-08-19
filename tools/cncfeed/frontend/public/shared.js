/* shared.js — CNCFeed shared header & footer
   Requires /shared.js (site/shared.js) to be loaded first — this calls
   window.rfMountToolChrome(), the shared chrome engine every tool uses. */
(function () {
  'use strict';
  var base = '/tools/cncfeed';

  // Legal + contact are site-global (/privacy, /terms, /contact) — client-side
  // tools don't ship their own. rfGlobalFooterLinks appends privacy/terms.
  var navLinks = [
    [base + '/', 'Calculator'],
    [base + '/faq/', 'FAQ'],
    [base + '/about/', 'About'],
  ];

  var footerLinks = [
    [base + '/', 'Calculator'],
    [base + '/faq/', 'FAQ'],
    [base + '/about/', 'About'],
    ['/contact', 'Contact'],
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
