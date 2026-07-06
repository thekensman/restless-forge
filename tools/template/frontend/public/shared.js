/* shared.js — __TOOL_LABEL__ shared header & footer
   Single source of truth for ALL __TOOL_LABEL__ pages (main app + sub-pages).
   Requires /shared.js (site/shared.js) to be loaded first for rf* utilities.

   Placeholders (replace across the whole template):
     __TOOL_NAME__   — URL directory name,  e.g. "my-tool"
     __TOOL_LABEL__  — Display name,        e.g. "My Tool"
     __TOOL_PREFIX__ — Identifier prefix,   e.g. "mt"  (2–5 lowercase letters)
     __TOOL_EMOJI__  — Header emoji/glyph,  e.g. "\u{1F527}"

   Every HTML page (main + sub-pages) renders the header/footer by including
   these two empty divs; this script auto-injects on DOMContentLoaded:
     <div id="__TOOL_PREFIX__-header"></div>
     <div id="__TOOL_PREFIX__-footer"></div>
*/
(function () {
  'use strict';
  var p = window.location.pathname;
  var base = '/tools/__TOOL_NAME__';

  function active(href) {
    if (href.startsWith('#')) return false;
    if (href === base + '/') return p === base + '/' || p === base + '/index.html';
    if (href.endsWith('/')) return p.startsWith(href);
    return p === href || p === href.replace('.html', '');
  }

  // Tool links on the left, RF global links on the right.
  // The '/' entry (Restless Forge) triggers the rfNavSep separator.
  // Only link pages the tool actually ships — add entries (e.g. FAQ,
  // Articles) as you add the matching src/<page>/index.html.
  var navLinks = [
    [base + '/', '__TOOL_LABEL__'],
    [base + '/about/', 'About'],
    ['/', 'Restless Forge'],
    ['/tools/', 'All Tools'],
  ];

  var footerLinks = [
    [base + '/', '__TOOL_LABEL__'],
    [base + '/about/', 'About'],
    ['/privacy', 'Privacy'],
    ['/terms', 'Terms'],
    ['/', 'Restless Forge'],
    ['/tools/', 'All Tools'],
  ];

  var substackSvg = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M22.539 8.242H1.46V6h21.08v2.242zM1.46 10.812V24L12 18.11 22.54 24V10.812H1.46zM22.54 0H1.46v2.236h21.08V0z"/></svg>';
  var heartSvg = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';

  window.__TOOL_PREFIX__Header = function () {
    var sep = (window.rfNavSep !== undefined) ? window.rfNavSep
      : '<span class="nav-sep" aria-hidden="true">|</span>';
    var links = navLinks.map(function (l) {
      var cls = active(l[0]) ? ' class="active"' : '';
      var prefix = (l[0] === '/') ? sep : '';
      var target = l[0].startsWith('http') ? ' target="_blank" rel="noopener"' : '';
      return prefix + '<a href="' + l[0] + '"' + cls + target + '>' + l[1] + '</a>';
    }).join('');

    return '<header class="site-header"><div class="site-header__inner">' +
      '<div class="site-header__top">' +
      '<a class="site-header__brand" href="' + base + '/">__TOOL_EMOJI__ __TOOL_LABEL__</a>' +
      '<button class="nav-toggle" aria-label="Toggle navigation" aria-expanded="false"' +
      ' onclick="var n=document.getElementById(\'site-nav\');var open=n.classList.toggle(\'open\');this.setAttribute(\'aria-expanded\',open)">&#9776;</button>' +
      '<nav class="site-header__nav" id="site-nav" aria-label="Site navigation">' + links + '</nav>' +
      '</div>' +
      '<div class="site-header__support">' +
      '<span class="site-header__support-label">Support this free tool</span>' +
      '<a class="site-header__support-link" href="https://restlessforge.substack.com" target="_blank" rel="noopener">' + substackSvg + ' Substack</a>' +
      '<a class="site-header__support-link" href="https://ko-fi.com/restless-forge" target="_blank" rel="noopener">' + heartSvg + ' Ko-fi</a>' +
      '<a class="site-header__support-link" href="https://buymeacoffee.com/restlessforge" target="_blank" rel="noopener">&#x2615; Buy Me a Coffee</a>' +
      '</div></div></header>';
  };

  window.__TOOL_PREFIX__Footer = function () {
    var sep = (window.rfFooterSep !== undefined) ? window.rfFooterSep
      : '<span class="footer-sep" aria-hidden="true">|</span>';
    var donateHtml = (typeof window.rfDonateHtml === 'function') ? window.rfDonateHtml() : '';
    var links = footerLinks.map(function (l) {
      var prefix = (l[0] === '/') ? sep : '';
      var target = l[0].startsWith('http') ? ' target="_blank" rel="noopener"' : '';
      return prefix + '<a class="footer__link" href="' + l[0] + '"' + target + '>' + l[1] + '</a>';
    }).join('');

    return '<footer class="footer">' +
      donateHtml +
      '<div class="footer__links">' + links + '</div>' +
      '<p class="footer__copy">&copy; 2026 <a href="/" style="color:inherit;text-decoration:none;">Restless Forge</a> &mdash; __TOOL_LABEL__.</p>' +
      '</footer>';
  };

  document.addEventListener('DOMContentLoaded', function () {
    var headerEl = document.getElementById('__TOOL_PREFIX__-header');
    if (headerEl) headerEl.outerHTML = window.__TOOL_PREFIX__Header();
    var footerEl = document.getElementById('__TOOL_PREFIX__-footer');
    if (footerEl) footerEl.outerHTML = window.__TOOL_PREFIX__Footer();
  });
})();
