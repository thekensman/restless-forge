/* shared.js — HoloPath shared nav, support banner & footer
   Single source of truth for ALL HoloPath pages (main app + sub-pages).
   Requires /shared.js (site/shared.js) to be loaded first for rf* utilities.
   Include in <head>, then call hpNav() / hpFooter() via inline <script> tags. */
(function () {
  'use strict';
  var p = window.location.pathname;
  var base = '/tools/holopath';

  function active(href) {
    if (href === base + '/') return p === base + '/' || p === base + '/index.html';
    if (href.endsWith('/')) return p.startsWith(href);
    return p === href || p === href.replace('.html', '');
  }

  var navLinks = [
    [base + '/', 'Generator'],
    [base + '/how-it-works/', 'How It Works'],
    [base + '/faq/', 'FAQ'],
    [base + '/articles/', 'Articles'],
    [base + '/about/', 'About'],
    [base + '/contact/', 'Contact'],
    ['/', 'Restless Forge'],
    ['/tools/', 'All Tools'],
  ];

  var footerLinks = [
    [base + '/how-it-works/', 'How It Works'],
    [base + '/faq/', 'FAQ'],
    [base + '/articles/', 'Articles'],
    [base + '/about/', 'About'],
    [base + '/contact/', 'Contact'],
    ['/privacy', 'Privacy'],
    ['/terms', 'Terms'],
    ['/', 'Restless Forge'],
    ['/tools/', 'All Tools'],
  ];

  window.hpNav = function () {
    var sep = (window.rfNavSep !== undefined) ? window.rfNavSep : '<span class="nav-sep" aria-hidden="true">|</span>';
    var links = navLinks.map(function (l) {
      var cls = 'nav__link' + (active(l[0]) ? ' nav__link--active' : '');
      var prefix = (l[0] === '/') ? sep : '';
      return prefix + '<a href="' + l[0] + '" class="' + cls + '">' + l[1] + '</a>';
    }).join('');

    return '<nav class="nav" aria-label="Main navigation">' + links + '</nav>' +
      '<div class="support-banner" id="support-banner">' +
      '<span class="support-banner__text">HoloPath is free &amp; open — if it\'s useful, consider supporting development</span>' +
      '<a class="support-banner__btn" href="https://buymeacoffee.com/restlessforge" target="_blank" rel="noopener">' +
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M2 21h18v-2H2v2zm2-4h14v-2H4v2zm-1-6l.5-2h15l.5 2h2l-1-4H2L1 11h2zm5-6h6V3H8v2z"/></svg> Buy me a coffee</a>' +
      '<a class="support-banner__btn support-banner__btn--alt" href="https://ko-fi.com/restless-forge" target="_blank" rel="noopener">Ko-fi</a>' +
      '<a class="support-banner__btn support-banner__btn--alt" href="https://substack.com/@restlessforge" target="_blank" rel="noopener">Substack</a>' +
      '<button class="support-banner__close" id="close-support" aria-label="Dismiss">&times;</button>' +
      '</div>';
  };

  window.hpFooter = function () {
    var sep = (window.rfFooterSep !== undefined) ? window.rfFooterSep : '<span class="footer-sep" aria-hidden="true">|</span>';
    var donateHtml = (typeof window.rfDonateHtml === 'function') ? window.rfDonateHtml() : '';

    var links = footerLinks.map(function (l) {
      var prefix = (l[0] === '/') ? sep : '';
      return prefix + '<a href="' + l[0] + '">' + l[1] + '</a>';
    }).join('');

    return '<footer class="footer">' +
      donateHtml +
      '<nav class="footer__legal" aria-label="Footer navigation">' + links + '</nav>' +
      '<p class="footer__copy">&copy; 2026 <a href="/" style="color:inherit;">Restless Forge</a> &mdash; HoloPath: Free hologram GIF generator.</p>' +
      '</footer>';
  };

  /* Support banner dismiss logic */
  document.addEventListener('DOMContentLoaded', function () {
    // Auto-inject nav and footer into standard placeholder elements.
    // HTML pages only need <div id="hp-nav"></div> and <div id="hp-footer"></div>.
    var navEl = document.getElementById('hp-nav');
    if (navEl) navEl.outerHTML = window.hpNav();
    var footerEl = document.getElementById('hp-footer');
    if (footerEl) footerEl.outerHTML = window.hpFooter();

    var close = document.getElementById('close-support');
    if (close) {
      close.addEventListener('click', function () {
        document.getElementById('support-banner').style.display = 'none';
        try { sessionStorage.setItem('hp-support-dismissed', '1'); } catch (e) {}
      });
    }
    try {
      if (sessionStorage.getItem('hp-support-dismissed')) {
        var banner = document.getElementById('support-banner');
        if (banner) banner.style.display = 'none';
      }
    } catch (e) {}
  });
})();
