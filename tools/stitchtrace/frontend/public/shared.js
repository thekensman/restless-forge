/* shared.js — StitchTrace shared header & footer
   Requires /shared.js (site/shared.js) to be loaded first — this calls
   window.rfMountToolChrome(), the shared chrome engine every tool uses. */
(function () {
  'use strict';
  var base = '/tools/stitchtrace';

  // Legal + contact are site-global (/privacy, /terms, /contact) — client-side
  // tools don't ship their own. rfGlobalFooterLinks appends privacy/terms.
  var navLinks = [
    [base + '/', 'Converter'],
    [base + '/faq/', 'FAQ'],
    [base + '/about/', 'About'],
  ];

  var footerLinks = [
    [base + '/', 'Converter'],
    [base + '/faq/', 'FAQ'],
    [base + '/about/', 'About'],
    ['/contact', 'Contact'],
  ];

  var chrome = window.rfMountToolChrome({
    base: base,
    idPrefix: 'st',
    brand: '🧵 StitchTrace',
    navLinks: navLinks,
    footerLinks: footerLinks,
    copyrightHtml: 'StitchTrace.',
  });
  window.stHeader = chrome.header;
  window.stFooter = chrome.footer;
})();
