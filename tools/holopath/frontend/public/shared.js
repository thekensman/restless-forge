/* shared.js — HoloPath shared header & footer
   Requires /shared.js (site/shared.js) to be loaded first — this calls
   window.rfMountToolChrome(), the shared chrome engine every tool uses.

   Every HTML page just needs:
     <div id="hp-header"></div>
     <div id="hp-footer"></div>
   and this script auto-injects on DOMContentLoaded. */
(function () {
  'use strict';
  var base = '/tools/holopath';

  // Legal + contact are site-global (/privacy, /terms, /contact) — client-side
  // tools don't ship their own. rfGlobalFooterLinks appends privacy/terms.
  var navLinks = [
    [base + '/', 'Generator'],
    [base + '/how-it-works/', 'How It Works'],
    [base + '/faq/', 'FAQ'],
    [base + '/articles/', 'Articles'],
    [base + '/about/', 'About'],
  ];

  var footerLinks = [
    [base + '/how-it-works/', 'How It Works'],
    [base + '/faq/', 'FAQ'],
    [base + '/articles/', 'Articles'],
    [base + '/about/', 'About'],
    ['/contact', 'Contact'],
  ];

  var chrome = window.rfMountToolChrome({
    base: base,
    idPrefix: 'hp',
    brand: '&#x25C8; HoloPath',
    navLinks: navLinks,
    footerLinks: footerLinks,
    copyrightHtml: 'HoloPath: Free hologram GIF generator.',
  });
  window.hpHeader = chrome.header;
  window.hpFooter = chrome.footer;
})();
