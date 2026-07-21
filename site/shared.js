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

  // ── AdSense ──
  // Single source for the publisher ID used by every page's loader bootstrap
  // and .adsbygoogle <ins> block (see CLAUDE.md). Keep in sync with
  // RF_ADSENSE_PUB in build.sh, which substitutes the bare form into ads.txt.
  window.rfAdsenseClientId = 'ca-pub-5516736042033534';

  // Sets data-ad-client on any .adsbygoogle element missing it, then pushes
  // it into the adsbygoogle queue. Safe to call more than once per page —
  // already-tagged elements are skipped.
  window.rfMountAdsenseSlots = function () {
    var slots = document.querySelectorAll('.adsbygoogle:not([data-ad-client])');
    for (var i = 0; i < slots.length; i++) {
      slots[i].setAttribute('data-ad-client', window.rfAdsenseClientId);
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    }
  };

  // ── Shared tool chrome engine ──
  // Every tool's public/shared.js calls window.rfMountToolChrome(config)
  // instead of hand-rolling its own header/footer functions. See CLAUDE.md
  // for the config shape.

  window.rfSubstackSvg = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M22.539 8.242H1.46V6h21.08v2.242zM1.46 10.812V24L12 18.11 22.54 24V10.812H1.46zM22.54 0H1.46v2.236h21.08V0z"/></svg>';
  window.rfHeartSvg = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';

  // Global footer link tail every tool appends after its own tool-specific links.
  // The '/' entry triggers rfFooterSep in the shared footer renderer.
  window.rfGlobalFooterLinks = [
    ['/privacy', 'Privacy'],
    ['/terms', 'Terms'],
    ['/', 'Restless Forge'],
    ['/tools/', 'All Tools'],
  ];

  // Global header nav tail (no Privacy/Terms — those live in the footer only).
  window.rfGlobalNavLinks = [
    ['/', 'Restless Forge'],
    ['/tools/', 'All Tools'],
  ];

  window.rfMountToolChrome = function (config) {
    var base = config.base;

    function activeHref(href) {
      var p = window.location.pathname;
      if (href.indexOf('#') === 0 || href.indexOf('http') === 0) return false;
      if (href === base + '/') return p === base + '/' || p === base + '/index.html';
      if (href.charAt(href.length - 1) === '/') return p.indexOf(href) === 0;
      return p === href || p === href.replace('.html', '');
    }

    function renderNavLinks(links) {
      var sep = (window.rfNavSep !== undefined) ? window.rfNavSep : '<span class="nav-sep" aria-hidden="true">|</span>';
      return links.map(function (l) {
        var cls = activeHref(l[0]) ? ' class="active"' : '';
        var prefix = (l[0] === '/') ? sep : '';
        var target = l[0].indexOf('http') === 0 ? ' target="_blank" rel="noopener"' : '';
        return prefix + '<a href="' + l[0] + '"' + cls + target + '>' + l[1] + '</a>';
      }).join('');
    }

    function renderFooterLinks(links) {
      var sep = (window.rfFooterSep !== undefined) ? window.rfFooterSep : '<span class="footer-sep" aria-hidden="true">|</span>';
      return links.map(function (l) {
        var prefix = (l[0] === '/') ? sep : '';
        var target = l[0].indexOf('http') === 0 ? ' target="_blank" rel="noopener"' : '';
        return prefix + '<a class="footer__link" href="' + l[0] + '"' + target + '>' + l[1] + '</a>';
      }).join('');
    }

    function renderSupportHtml() {
      var extra = config.extraSupportLinks || [];
      var all = extra.concat([
        ['https://restlessforge.substack.com', 'Substack', window.rfSubstackSvg],
        ['https://ko-fi.com/restless-forge', 'Ko-fi', window.rfHeartSvg],
        ['https://buymeacoffee.com/restlessforge', 'Buy Me a Coffee', '&#x2615;'],
      ]);
      var links = all.map(function (l) {
        return '<a class="site-header__support-link" href="' + l[0] + '" target="_blank" rel="noopener">' + l[2] + ' ' + l[1] + '</a>';
      }).join('');
      return '<div class="site-header__support"><span class="site-header__support-label">Support this free tool</span>' + links + '</div>';
    }

    function header() {
      var navLinks = config.navLinks.concat(window.rfGlobalNavLinks);
      return '<header class="site-header"><div class="site-header__inner">' +
        '<div class="site-header__top">' +
        '<a class="site-header__brand" href="' + base + '/">' + config.brand + '</a>' +
        '<button class="nav-toggle" aria-label="Toggle navigation" aria-expanded="false" onclick="var n=document.getElementById(\'site-nav\');var open=n.classList.toggle(\'open\');this.setAttribute(\'aria-expanded\',open)">&#9776;</button>' +
        '<nav class="site-header__nav" id="site-nav" aria-label="Site navigation">' + renderNavLinks(navLinks) + '</nav>' +
        '</div>' +
        renderSupportHtml() +
        '</div></header>';
    }

    function footer() {
      var footerLinks = config.footerLinks.concat(window.rfGlobalFooterLinks);
      var donateHtml = (typeof window.rfDonateHtml === 'function') ? window.rfDonateHtml() : '';
      return '<footer class="footer">' + donateHtml +
        '<div class="footer__links">' + renderFooterLinks(footerLinks) + '</div>' +
        '<p class="footer__copy">&copy; 2026 <a href="/" style="color:inherit;text-decoration:none;">Restless Forge</a> &mdash; ' + config.copyrightHtml + '</p>' +
        '</footer>';
    }

    document.addEventListener('DOMContentLoaded', function () {
      var h = document.getElementById(config.idPrefix + '-header');
      if (h) h.outerHTML = header();
      var f = document.getElementById(config.idPrefix + '-footer');
      if (f) f.outerHTML = footer();
    });

    return { header: header, footer: footer };
  };

  var support = [
    ['https://ko-fi.com/restless-forge', 'Ko-fi'],
    ['https://buymeacoffee.com/restlessforge', 'Buy Me a Coffee'],
    ['https://substack.com/@restlessforge', 'Subscribe on Substack'],
    ['https://github.com/thekensman/', 'GitHub'],
  ];

  // Personal recommendations — friends & family sites, not RF's own work.
  // Kept separate from rfDonateLinks/support on purpose: this is not
  // monetization or affiliate tracking, just sites worth a visit.
  window.rfFriendLinks = [
    ['https://freerollvegas.com', 'FreeRoll Vegas', 'Poker tournament schedules'],
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

    var friends = window.rfFriendLinks.map(function (l) {
      return '<a href="' + l[0] + '" target="_blank" rel="noopener noreferrer nofollow">' + l[1] + '</a>' +
        '<span class="site-footer__friends-desc">' + l[2] + '</span>';
    }).join('');

    return '<footer class="site-footer"><div class="site-footer__inner">' +
      '<div class="site-footer__support"><h3>Support Restless Forge</h3>' +
      '<div class="support-links">' + sup + '</div></div>' +
      '<nav class="site-footer__nav">' + links + '</nav>' +
      '<div class="site-footer__friends"><h4>Sites I Like</h4>' +
      '<div class="friend-links">' + friends + '</div>' +
      '<p class="site-footer__friends-note">Personal recommendations from friends &amp; family — not affiliated with Restless Forge.</p>' +
      '</div>' +
      '<p class="site-footer__copy">&copy; 2026 Restless Forge. All rights reserved.</p>' +
      '</div></footer>';
  };

  // Auto-inject nav and footer into standard placeholder elements.
  // HTML pages only need <div id="rf-nav"></div> and <div id="rf-footer"></div>;
  // no inline scripts required.
  document.addEventListener('DOMContentLoaded', function () {
    var navEl = document.getElementById('rf-nav');
    if (navEl) navEl.outerHTML = window.rfNav();
    var footerEl = document.getElementById('rf-footer');
    if (footerEl) footerEl.outerHTML = window.rfFooter();
  });
})();
