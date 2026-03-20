/* shared.js — TOOL_LABEL shared header & footer
   Single source of truth for ALL TOOL_LABEL pages (main app + sub-pages).
   Requires /shared.js (site/shared.js) to be loaded first for rf* utilities.

   Placeholders to replace:
     TOOL_NAME   — URL directory name,  e.g. "my-tool"
     TOOL_LABEL  — Display name,        e.g. "My Tool"
     TOOL_PREFIX — JS/HTML identifier,  e.g. "mt"
     TOOL_EMOJI  — Header emoji,        e.g. "🔧"

   Nav/footer are auto-injected by the DOMContentLoaded listener below.
   Every HTML page just needs:
     <div id="TOOL_PREFIX-header"></div>
     <div id="TOOL_PREFIX-footer"></div>
*/
(function () {
  'use strict';
  var p = window.location.pathname;
  var base = '/tools/TOOL_NAME';

  function active(href) {
    if (href === base + '/') return p === base + '/' || p === base + '/index.html';
    return p.startsWith(href);
  }

  // Tool navigation links — tool-specific links first, then RF global links.
  // The '/' entry (Restless Forge) gets a separator prepended automatically.
  var navLinks = [
    [base + '/', 'TOOL_LABEL'],
    [base + '/faq/', 'FAQ'],
    [base + '/articles/', 'Articles'],
    [base + '/about/', 'About'],
    [base + '/contact/', 'Contact'],
    ['/', 'Restless Forge'],
    ['/tools/', 'All Tools'],
  ];

  var footerLinks = [
    [base + '/', 'TOOL_LABEL'],
    [base + '/faq/', 'FAQ'],
    [base + '/articles/', 'Articles'],
    [base + '/about/', 'About'],
    [base + '/contact/', 'Contact'],
    ['/privacy', 'Privacy'],
    ['/terms', 'Terms'],
    ['/', 'Restless Forge'],
    ['/tools/', 'All Tools'],
  ];

  window.TOOL_PREFIXHeader = function () {
    var sep = (window.rfNavSep !== undefined) ? window.rfNavSep
      : '<span class="nav-sep" aria-hidden="true">|</span>';
    var links = navLinks.map(function (l) {
      var cls = active(l[0]) ? ' class="active"' : '';
      var prefix = (l[0] === '/') ? sep : '';
      return prefix + '<a href="' + l[0] + '"' + cls + '>' + l[1] + '</a>';
    }).join('');

    return '<header class="site-header"><div class="site-header__inner">' +
      '<div class="site-header__top">' +
      '<a class="site-header__brand" href="' + base + '/">TOOL_EMOJI TOOL_LABEL</a>' +
      '<button class="nav-toggle" aria-label="Toggle navigation" aria-expanded="false"' +
      ' onclick="var n=document.getElementById(\'site-nav\');var open=n.classList.toggle(\'open\');this.setAttribute(\'aria-expanded\',open)">&#9776;</button>' +
      '<nav class="site-header__nav" id="site-nav" aria-label="Site navigation">' + links + '</nav>' +
      '</div></div></header>';
  };

  window.TOOL_PREFIXFooter = function () {
    var sep = (window.rfFooterSep !== undefined) ? window.rfFooterSep
      : '<span class="footer-sep" aria-hidden="true">|</span>';
    var donateHtml = (typeof window.rfDonateHtml === 'function') ? window.rfDonateHtml() : '';
    var links = footerLinks.map(function (l) {
      var prefix = (l[0] === '/') ? sep : '';
      return prefix + '<a class="footer__link" href="' + l[0] + '">' + l[1] + '</a>';
    }).join('');

    return '<footer class="footer">' +
      donateHtml +
      '<div class="footer__links">' + links + '</div>' +
      '<p class="footer__copy">&copy; 2026 <a href="/" style="color:inherit;text-decoration:none;">Restless Forge</a> &mdash; TOOL_LABEL.</p>' +
      '</footer>';
  };

  // Auto-inject header and footer into placeholder elements.
  // Every HTML page (main app + sub-pages) only needs the two divs below.
  document.addEventListener('DOMContentLoaded', function () {
    var headerEl = document.getElementById('TOOL_PREFIX-header');
    if (headerEl) headerEl.outerHTML = window.TOOL_PREFIXHeader();
    var footerEl = document.getElementById('TOOL_PREFIX-footer');
    if (footerEl) footerEl.outerHTML = window.TOOL_PREFIXFooter();
  });
})();
