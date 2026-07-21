/* shared.js — WaveCarve shared header & footer
   Requires /shared.js (site/shared.js) to be loaded first — this calls
   window.rfMountToolChrome(), the shared chrome engine every tool uses. */
(function () {
  'use strict';
  var base = '/tools/wavecarve';

  var navLinks = [
    [base + '/', 'Generator'],
    [base + '/faq/', 'FAQ'],
    [base + '/about/', 'About'],
    [base + '/contact/', 'Contact'],
  ];

  var footerLinks = [
    [base + '/', 'Generator'],
    [base + '/faq/', 'FAQ'],
    [base + '/about/', 'About'],
    [base + '/contact/', 'Contact'],
  ];

  var chrome = window.rfMountToolChrome({
    base: base,
    idPrefix: 'wc',
    brand: '🎵 WaveCarve',
    navLinks: navLinks,
    footerLinks: footerLinks,
    copyrightHtml: 'WaveCarve.',
  });
  window.wcHeader = chrome.header;
  window.wcFooter = chrome.footer;
})();
