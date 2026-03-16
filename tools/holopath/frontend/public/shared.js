/* shared.js — HoloPath shared nav, support banner & footer
   Single source of truth for all HoloPath sub-pages.
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
    [base + '/how-it-works.html', 'How It Works'],
    [base + '/faq.html', 'FAQ'],
    [base + '/articles/', 'Articles'],
    [base + '/about.html', 'About'],
    [base + '/contact.html', 'Contact'],
  ];

  var footerLinks = [
    [base + '/how-it-works.html', 'How It Works'],
    [base + '/faq.html', 'FAQ'],
    [base + '/articles/', 'Articles'],
    [base + '/about.html', 'About'],
    [base + '/contact.html', 'Contact'],
    ['/privacy', 'Privacy Policy'],
    ['/terms', 'Terms of Use'],
  ];

  window.hpNav = function () {
    var links = navLinks.map(function (l) {
      var cls = 'site-nav__link' + (active(l[0]) ? ' site-nav__link--active' : '');
      return '<a href="' + l[0] + '" class="' + cls + '">' + l[1] + '</a>';
    }).join('');

    return '<nav class="site-nav" aria-label="Main navigation">' + links + '</nav>' +
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
    var links = footerLinks.map(function (l) {
      return '<a href="' + l[0] + '">' + l[1] + '</a>';
    }).join('');

    return '<footer class="footer">' +
      '<nav class="footer__legal" aria-label="Footer navigation">' + links + '</nav>' +
      '<p class="footer__copy">&copy; 2026 HoloPath &mdash; Free hologram GIF generator. ' +
      '<a class="footer__support" href="https://buymeacoffee.com/restlessforge" target="_blank" rel="noopener">Support this project &#9749;</a></p>' +
      '</footer>';
  };

  /* Support banner dismiss logic */
  document.addEventListener('DOMContentLoaded', function () {
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
