/* shared.js — Restless Forge global nav & footer
   Single source of truth for all global site pages.
   Also exposes rf* utilities (rfDonateHtml, rfNavSep, rfFooterSep) used by tool pages.
   Include in <head>, then call rfNav() / rfFooter() via inline <script> tags. */
(function () {
  'use strict';
  var p = window.location.pathname;

  // ── Support/donate destination URLs ──
  // Single source of truth so the three support UIs (tool-footer donate block,
  // tool-header support strip, site-footer support block) can't drift apart.
  var RF_KOFI     = 'https://ko-fi.com/restless-forge';
  var RF_BMC      = 'https://buymeacoffee.com/restlessforge';
  var RF_SUBSTACK = 'https://restlessforge.substack.com';
  var RF_GITHUB   = 'https://github.com/thekensman/';

  // ── Contact info ──
  // The email address and repo URLs live here and ONLY here: pages reference
  // them via <a data-rf-link="..."> so a change is a one-line edit.
  var RF_EMAIL       = 'ken@restless-forge.dev';
  var RF_GITHUB_REPO = 'https://github.com/thekensman/restless-forge';

  // Exposed so prose links can resolve programmatically: any
  // <a data-rf-link="kofi|bmc|substack|github|email|githubRepo|..."> gets its
  // href set from here on DOMContentLoaded (see resolver at the bottom of this
  // file), so a URL change is a one-line edit even in hand-written page copy.
  // Email anchors with no text also get the bare address as their textContent.
  window.rfLinks = {
    kofi: RF_KOFI,
    bmc: RF_BMC,
    substack: RF_SUBSTACK,
    github: RF_GITHUB,
    email: 'mailto:' + RF_EMAIL,
    githubRepo: RF_GITHUB_REPO,
    githubIssues: RF_GITHUB_REPO + '/issues',
    // Tools that live in their own repos (pre-monorepo); everything else
    // shares the restless-forge repo above.
    wimtwRepo: 'https://github.com/thekensman/what-is-my-time-worth',
    wimtwIssues: 'https://github.com/thekensman/what-is-my-time-worth/issues',
    holopathRepo: 'https://github.com/thekensman/holopath',
    sandpathRepo: 'https://github.com/thekensman/sandpath',
  };

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
    ['/sites-i-like', 'Sites I Like'],
    ['/privacy', 'Privacy'],
    ['/terms', 'Terms'],
    ['/faq', 'FAQ'],
  ];

  // ── RF Shared Utilities ──
  // Available to all tool pages that include /shared.js before their own shared.js.

  window.rfDonateLinks = [
    [RF_KOFI, 'Ko-fi'],
    [RF_BMC, 'Buy Me a Coffee'],
    [RF_SUBSTACK, 'Substack'],
    [RF_GITHUB, 'GitHub'],
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
        [RF_SUBSTACK, 'Substack', window.rfSubstackSvg],
        [RF_KOFI, 'Ko-fi', window.rfHeartSvg],
        [RF_BMC, 'Buy Me a Coffee', '&#x2615;'],
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
      if (f) {
        f.outerHTML = footer();
        // The tool id is the last segment of its base ('/tools/holopath'), so
        // this needs nothing added to any tool's config object.
        window.rfMountRelatedTools(String(config.base || '').split('/').pop());
      }
    });

    return { header: header, footer: footer };
  };

  /* ── Related tools — "if you enjoyed this, you might like…" ──
   *
   * SCAFFOLDING. DELIBERATELY OFF: rfRelatedToolsEnabled is false, so nothing
   * is rendered, no markup is emitted, and /tools-data.js is not even fetched
   * on tool pages (they do not load it otherwise). Flipping the flag to true
   * turns the section on for every tool at once — there is no per-tool markup
   * to add, because rfMountToolChrome injects it above the footer.
   *
   * It is off because it would currently recommend badly. All four live tools
   * sit in four different categories (Financial, Creative, Maker, Lifestyle),
   * so "related" would mean "the three unrelated tools that happen to exist" —
   * worse than showing nothing. Turn it on once a category has more than one
   * live tool in it; rfRelatedTools already prefers same-category matches and
   * only falls back to filling from elsewhere.
   */
  window.rfRelatedToolsEnabled = false;

  // Same category first, then anything else live, capped at `limit`.
  window.rfRelatedTools = function (currentId, limit) {
    var all = window.rfTools || [];
    var current = null;
    all.forEach(function (t) { if (t.id === currentId) current = t; });
    var pool = all.filter(function (t) { return t.status === 'live' && t.id !== currentId; });
    var sameCat = pool.filter(function (t) { return current && t.category === current.category; });
    var others = pool.filter(function (t) { return !current || t.category !== current.category; });
    return sameCat.concat(others).slice(0, limit || 3);
  };

  // tools-data.js is the single source for the directory; tool pages don't
  // load it, so fetch it once and only when the section is actually enabled.
  function withToolsData(cb) {
    if (window.rfTools) return cb();
    var s = document.createElement('script');
    s.src = '/tools-data.js';
    s.onload = cb;
    s.onerror = function () { /* no data, no section — fail silent, not broken */ };
    document.head.appendChild(s);
  }

  window.rfRelatedToolsHtml = function (items) {
    return '<h2 class="related-tools__title">If you enjoyed this, you might like</h2>' +
      '<ul class="related-tools__list">' + items.map(function (t) {
        return '<li class="related-tools__item">' +
          '<a class="related-tools__link" href="/tools/' + t.id + '/">' + t.label + '</a>' +
          '<span class="related-tools__cat">' + t.category + '</span>' +
          '<span class="related-tools__desc">' + t.desc + '</span>' +
          '</li>';
      }).join('') + '</ul>';
  };

  // Inserts the section directly above the tool's footer. No-op while the
  // flag is off, and no-op when there is nothing worth recommending.
  window.rfMountRelatedTools = function (currentId) {
    if (!window.rfRelatedToolsEnabled) return;
    withToolsData(function () {
      var items = window.rfRelatedTools(currentId, 3);
      if (!items.length) return;
      var footerEl = document.querySelector('.footer');
      if (!footerEl || !footerEl.parentNode) return;
      var section = document.createElement('section');
      section.className = 'related-tools';
      section.setAttribute('aria-label', 'Related tools');
      section.innerHTML = window.rfRelatedToolsHtml(items);
      footerEl.parentNode.insertBefore(section, footerEl);
    });
  };

  var support = [
    [RF_KOFI, 'Ko-fi'],
    [RF_BMC, 'Buy Me a Coffee'],
    [RF_SUBSTACK, 'Subscribe on Substack'],
    [RF_GITHUB, 'GitHub'],
  ];

  // Personal recommendations — friends & family sites, not RF's own work.
  // Kept separate from rfDonateLinks/support on purpose: this is not
  // monetization or affiliate tracking, just sites worth a visit.
  // Rendered onto the /sites-i-like page by rfRenderFriends() below.
  window.rfFriendLinks = [
    ['https://freerollvegas.com', 'FreeRoll Vegas', 'Las Vegas deals, savings, and free things to do'],
  ];

  // Renders the friends/recommendations list onto the /sites-i-like page.
  // Pre-rendered statically by scripts/sync-static-html.mjs and re-run at
  // runtime — same pattern as rfRenderTools (site/tools-data.js). Links stay
  // followable (no nofollow): these are genuine editorial recommendations.
  window.rfRenderFriends = function (containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '<ul class="friends-list">' + window.rfFriendLinks.map(function (l) {
      return '<li class="friends-list__item">' +
        '<a class="friends-list__link" href="' + l[0] + '" target="_blank" rel="noopener noreferrer">' + l[1] + '</a>' +
        '<span class="friends-list__desc">' + l[2] + '</span>' +
        '</li>';
    }).join('') + '</ul>';
  };

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

  // Auto-inject nav and footer into standard placeholder elements.
  // HTML pages only need <div id="rf-nav"></div> and <div id="rf-footer"></div>;
  // no inline scripts required.
  // Resolve prose support links from the single-source window.rfLinks map.
  // Prose copy uses <a data-rf-link="substack"> (no hard-coded href); this
  // fills the href in so donate/Substack URLs live in exactly one place.
  function resolveProseLinks() {
    var links = document.querySelectorAll('a[data-rf-link]');
    for (var i = 0; i < links.length; i++) {
      var key = links[i].getAttribute('data-rf-link');
      var url = window.rfLinks[key];
      if (!url) continue;
      links[i].setAttribute('href', url);
      // Email anchors left empty display the bare address, so the address
      // itself never appears in static HTML (single-source guarantee).
      if (key === 'email' && links[i].textContent.trim() === '') {
        links[i].textContent = url.replace('mailto:', '');
      }
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var navEl = document.getElementById('rf-nav');
    if (navEl) navEl.outerHTML = window.rfNav();
    var footerEl = document.getElementById('rf-footer');
    if (footerEl) footerEl.outerHTML = window.rfFooter();
    resolveProseLinks();
  });
})();
