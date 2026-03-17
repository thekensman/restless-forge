/* shared.js — SandPath shared nav & footer
   Single source of truth for ALL SandPath pages.
   Include in <head>, then call spNav() / spFooter() via inline <script> tags. */
(function () {
  'use strict';
  var p = window.location.pathname;
  var base = '/tools/sandpath';

  function active(href) {
    if (href === base + '/') return p === base + '/' || p === base + '/index.html';
    if (href.startsWith('#')) return false;
    return p.startsWith(href);
  }

  var navLinks = [
    ['#converter', 'Converter'],
    ['#how-to-use', 'How to Use'],
    ['#supported-tables', 'Supported Tables'],
    ['#faq', 'FAQ'],
    ['#about', 'About'],
    ['/privacy', 'Privacy'],
    ['/contact', 'Contact'],
    ['/', 'Restless Forge'],
  ];

  var footerLinks = [
    ['/', 'Restless Forge'],
    ['/tools/', 'All Tools'],
    ['#about', 'About'],
    ['/contact', 'Contact'],
    ['/privacy', 'Privacy'],
    ['/terms', 'Terms'],
  ];

  var donateLinks = [
    ['https://ko-fi.com/restless-forge', 'Ko-fi'],
    ['https://buymeacoffee.com/restlessforge', 'Buy Me a Coffee'],
    ['https://substack.com/@restlessforge', 'Substack'],
    ['https://github.com/thekensman/', 'GitHub'],
  ];

  window.spNav = function () {
    var links = navLinks.map(function (l) {
      var cls = 'site-nav__link' + (active(l[0]) ? ' site-nav__link--active' : '');
      return '<a href="' + l[0] + '" class="' + cls + '">' + l[1] + '</a>';
    }).join('');

    return '<nav class="site-nav" aria-label="Main navigation">' + links + '</nav>';
  };

  window.spFooter = function () {
    var donate = donateLinks.map(function (l) {
      return '<a href="' + l[0] + '" target="_blank" rel="noopener" class="footer__donate-link">' + l[1] + '</a>';
    }).join('');

    var links = footerLinks.map(function (l) {
      return '<a href="' + l[0] + '">' + l[1] + '</a>';
    }).join('');

    return '<footer class="footer">' +
      '<div class="footer__donate"><span class="footer__donate-label">Support Restless Forge</span>' +
      '<div class="footer__donate-links">' + donate + '</div></div>' +
      '<nav class="footer__legal" aria-label="Legal pages">' + links + '</nav>' +
      '<p class="footer__copy">&copy; 2026 <a href="/" style="color:inherit;text-decoration:none;">Restless Forge</a> &mdash; SandPath: Free SVG &amp; image to sand table converter.</p>' +
      '</footer>';
  };
})();
