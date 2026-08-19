/* shared.js — SandPath shared header & footer
   Requires /shared.js (site/shared.js) to be loaded first — this calls
   window.rfMountToolChrome(), the shared chrome engine every tool uses.

   Every HTML page just needs:
     <div id="sp-header"></div>
     <div id="sp-footer"></div>
   and this script auto-injects on DOMContentLoaded. */
(function () {
  'use strict';
  var base = '/tools/sandpath';

  // Legal + contact are site-global (/privacy, /terms, /contact) — client-side
  // tools don't ship their own. rfGlobalFooterLinks appends privacy/terms.
  var navLinks = [
    [base + '/', 'Converter'],
    [base + '/getting-started/', 'Getting Started'],
    [base + '/how-it-works/', 'How It Works'],
    [base + '/supported-tables/', 'Supported Tables'],
    [base + '/faq/', 'FAQ'],
    [base + '/articles/', 'Articles'],
    // TODO: update href when shop URL is finalized
    ['https://restlessforge.gumroad.com', 'Shop'],
    [base + '/about/', 'About'],
  ];

  var footerLinks = [
    [base + '/', 'Converter'],
    [base + '/getting-started/', 'Getting Started'],
    [base + '/how-it-works/', 'How It Works'],
    [base + '/supported-tables/', 'Tables'],
    [base + '/faq/', 'FAQ'],
    [base + '/articles/', 'Articles'],
    ['https://restlessforge.gumroad.com', 'Shop'],
    [base + '/about/', 'About'],
    ['/contact', 'Contact'],
  ];

  // Tool-specific support link — not shared by any other tool.
  var cartSvg = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12L8.1 13h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>';

  var chrome = window.rfMountToolChrome({
    base: base,
    idPrefix: 'sp',
    brand: '&#9618; SandPath',
    navLinks: navLinks,
    footerLinks: footerLinks,
    extraSupportLinks: [
      ['https://ko-fi.com/restlessforge/shop', 'Sand Art Shop', cartSvg],
    ],
    copyrightHtml: 'SandPath: Free SVG &amp; image to sand table converter.',
  });
  window.spHeader = chrome.header;
  window.spFooter = chrome.footer;
})();
