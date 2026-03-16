/* shared.js — What Is My Time Worth? shared header & footer
   Single source of truth for all WIMTW sub-pages (about, faq, articles, etc.).
   Include in <head>, then call wimtwHeader() / wimtwFooter() via inline <script> tags. */
(function () {
  'use strict';
  var p = window.location.pathname;
  var base = '/tools/what-is-my-time-worth';

  function active(href) {
    if (href === base + '/') return p === base + '/' || p === base + '/index.html';
    return p.startsWith(href);
  }

  var navLinks = [
    [base + '/', 'Calculator'],
    [base + '/articles/', 'Articles'],
    [base + '/faq/', 'FAQ'],
    ['/about', 'About'],
    [base + '/contact/', 'Contact'],
    ['/contact', 'Restless Forge'],
    ['/privacy', 'Privacy'],
    ['/terms', 'Terms'],
  ];

  var footerLinks = [
    [base + '/', 'Calculator'],
    [base + '/articles/', 'Articles'],
    [base + '/faq/', 'FAQ'],
    ['/about', 'About'],
    [base + '/contact/', 'Contact'],
    ['/privacy', 'Privacy'],
    ['/terms', 'Terms'],
  ];

  var substackSvg = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M22.539 8.242H1.46V6h21.08v2.242zM1.46 10.812V24L12 18.11 22.54 24V10.812H1.46zM22.54 0H1.46v2.236h21.08V0z"/></svg>';
  var heartSvg = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';

  window.wimtwHeader = function () {
    var links = navLinks.map(function (l) {
      return '<a href="' + l[0] + '"' + (active(l[0]) ? ' class="active"' : '') + '>' + l[1] + '</a>';
    }).join('');

    return '<header class="site-header"><div class="site-header__inner">' +
      '<div class="site-header__top">' +
      '<a class="site-header__brand" href="' + base + '/">⏱ What Is My Time Worth?</a>' +
      '<button class="nav-toggle" aria-label="Toggle navigation" aria-expanded="false" onclick="var n=document.getElementById(\'site-nav\');var open=n.classList.toggle(\'open\');this.setAttribute(\'aria-expanded\',open)">☰</button>' +
      '<nav class="site-header__nav" id="site-nav" aria-label="Site navigation">' + links + '</nav>' +
      '</div>' +
      '<div class="site-header__support">' +
      '<span class="site-header__support-label">Support this free tool</span>' +
      '<a class="site-header__support-link" href="https://restlessforge.substack.com" target="_blank" rel="noopener">' + substackSvg + ' Substack</a>' +
      '<a class="site-header__support-link" href="https://ko-fi.com/restless-forge" target="_blank" rel="noopener">' + heartSvg + ' Ko-fi</a>' +
      '<a class="site-header__support-link" href="https://buymeacoffee.com/restlessforge" target="_blank" rel="noopener">☕ Buy Me a Coffee</a>' +
      '</div></div></header>';
  };

  window.wimtwFooter = function () {
    var links = footerLinks.map(function (l) {
      return '<a href="' + l[0] + '">' + l[1] + '</a>';
    }).join(' &nbsp;·&nbsp; ');

    return '<footer>' +
      '<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:4px 0">' + links + '</div>' +
      '<p style="margin-top:8px">&copy; 2026 What Is My Time Worth? — ' +
      '<a href="https://restless-forge.dev/tools/what-is-my-time-worth">whatismytimeworth.app</a></p>' +
      '</footer>';
  };
})();
