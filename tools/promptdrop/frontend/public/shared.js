/* shared.js — PromptDrop shared header & footer
   Requires /shared.js (site/shared.js) to be loaded first — this calls
   window.rfMountToolChrome(), the shared chrome engine every tool uses. */
(function () {
  'use strict';
  var base = '/tools/promptdrop';

  var navLinks = [
    [base + '/', 'PromptDrop'],
    [base + '/about/', 'About'],
  ];

  var footerLinks = [
    [base + '/', 'PromptDrop'],
    [base + '/about/', 'About'],
  ];

  var chrome = window.rfMountToolChrome({
    base: base,
    idPrefix: 'pdr',
    brand: '💧 PromptDrop',
    navLinks: navLinks,
    footerLinks: footerLinks,
    copyrightHtml: 'PromptDrop.',
  });
  window.pdrHeader = chrome.header;
  window.pdrFooter = chrome.footer;
})();
