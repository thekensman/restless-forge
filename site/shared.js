/* shared.js — Restless Forge global nav & footer
   Single source of truth for all global site pages.
   Also exposes rf* utilities (rfDonateHtml, rfNavSep, rfFooterSep) used by tool pages.
   Include in <head>, then call rfNav() / rfFooter() via inline <script> tags. */
(function () {
  'use strict';
  var p = window.location.pathname;

  function active(href) {
    if (href === '/') return p === '/' || p === '/index.html';
    return p.startsWith(href);
  }

  var nav = [
    ['/', 'Home'],
    ['/tools/', 'Tools'],
    ['/essays/', 'Essays'],
    ['/articles/', 'Articles'],
    ['/about', 'About'],
    ['/contact', 'Contact'],
  ];

  var footerNav = [
    ['/', 'Home'],
    ['/tools/', 'Tools'],
    ['/essays/', 'Essays'],
    ['/about', 'About'],
    ['/contact', 'Contact'],
    ['/privacy', 'Privacy'],
    ['/terms', 'Terms'],
    ['/faq', 'FAQ'],
  ];

  // ── RF Shared Utilities ──
  // Available to all tool pages that include /shared.js before their own shared.js.

  window.rfDonateLinks = [
    ['https://ko-fi.com/restless-forge', 'Ko-fi'],
    ['https://buymeacoffee.com/restlessforge', 'Buy Me a Coffee'],
    ['https://substack.com/@restlessforge', 'Substack'],
    ['https://github.com/thekensman/', 'GitHub'],
  ];

  // Renders the "Support Restless Forge" donate block used in tool page footers.
  // Requires .footer__donate / .footer__donate-link CSS from the tool's pages.css.
  window.rfDonateHtml = function () {
    var links = window.rfDonateLinks.map(function (l) {
      return '<a href="' + l[0] + '" target="_blank" rel="noopener" class="footer__donate-link">' + l[1] + '</a>';
    }).join('');
    return '<div class="footer__donate"><span class="footer__donate-label">Support Restless Forge</span>' +
      '<div class="footer__donate-links">' + links + '</div></div>';
  };

  // Separator spans used between tool links and RF links in nav / footer.
  window.rfNavSep    = '<span class="nav-sep" aria-hidden="true">|</span>';
  window.rfFooterSep = '<span class="footer-sep" aria-hidden="true">|</span>';

  var support = [
    ['https://ko-fi.com/restless-forge', 'Ko-fi'],
    ['https://buymeacoffee.com/restlessforge', 'Buy Me a Coffee'],
    ['https://substack.com/@restlessforge', 'Subscribe on Substack'],
    ['https://github.com/thekensman/', 'GitHub'],
  ];

  window.rfNav = function () {
    var items = nav.map(function (l) {
      return '<li><a href="' + l[0] + '"' + (active(l[0]) ? ' class="active"' : '') + '>' + l[1] + '</a></li>';
    }).join('');

    return '<nav class="site-nav">' +
      '<div class="site-nav__inner">' +
      '<a href="/" class="site-nav__brand">restless-forge</a>' +
      '<ul class="site-nav__links">' + items + '</ul>' +
      '</div></nav>';
  };

  window.rfFooter = function () {
    var sup = support.map(function (l) {
      return '<a href="' + l[0] + '" class="support-link" target="_blank" rel="noopener">' + l[1] + '</a>';
    }).join('');

    var links = footerNav.map(function (l) {
      return '<a href="' + l[0] + '">' + l[1] + '</a>';
    }).join('');

    return '<footer class="site-footer"><div class="site-footer__inner">' +
      '<div class="site-footer__support"><h3>Support Restless Forge</h3>' +
      '<div class="support-links">' + sup + '</div></div>' +
      '<nav class="site-footer__nav">' + links + '</nav>' +
      '<p class="site-footer__copy">&copy; 2026 Restless Forge. All rights reserved.</p>' +
      '</div></footer>';
  };
})();
