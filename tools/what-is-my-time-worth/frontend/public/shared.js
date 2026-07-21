/* shared.js — What Is My Time Worth? shared header & footer
   Requires /shared.js (site/shared.js) to be loaded first — this calls
   window.rfMountToolChrome(), the shared chrome engine every tool uses. */
(function () {
  'use strict';
  var base = '/tools/what-is-my-time-worth';

  var navLinks = [
    [base + '/', 'Calculator'],
    [base + '/articles/', 'Articles'],
    [base + '/faq/', 'FAQ'],
    [base + '/contact/', 'Contact'],
    [base + '/about/', 'About'],
  ];

  var footerLinks = [
    [base + '/', 'Calculator'],
    [base + '/articles/', 'Articles'],
    [base + '/faq/', 'FAQ'],
    [base + '/contact/', 'Contact'],
    [base + '/about/', 'About'],
  ];

  var chrome = window.rfMountToolChrome({
    base: base,
    idPrefix: 'wimtw',
    brand: '&#x23F1; What Is My Time Worth?',
    navLinks: navLinks,
    footerLinks: footerLinks,
    copyrightHtml: 'What Is My Time Worth? Your numbers, your browser, your life.',
  });
  window.wimtwHeader = chrome.header;
  window.wimtwFooter = chrome.footer;
})();
