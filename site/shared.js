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
  // Amazon author page. Listed in the SITE footer only, not the per-tool
  // support UIs: a book link under "Support this free tool" on HoloPath is
  // off-message, while under "Support Restless Forge" it reads correctly.
  var RF_AMAZON   = 'https://www.amazon.com/stores/Kenneth-Cross/author/B0HC145NDQ';

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
    githubLicense: RF_GITHUB_REPO + '/blob/main/LICENSE.md',
    // Tools that live in their own repos (pre-monorepo); everything else
    // shares the restless-forge repo above.
    wimtwRepo: 'https://github.com/thekensman/what-is-my-time-worth',
    wimtwIssues: 'https://github.com/thekensman/what-is-my-time-worth/issues',
    holopathRepo: 'https://github.com/thekensman/holopath',
    sandpathRepo: 'https://github.com/thekensman/sandpath',
    amazonAuthor: RF_AMAZON,
  };

  // ── Mount chrome as the parser reaches it ──
  // Nav, footer and tool headers render at runtime into empty placeholder divs
  // (<div id="rf-nav">, <div id="hp-header">, ...). Swapping them in on
  // DOMContentLoaded was too late: the browser had usually painted the page
  // by then with the placeholder at zero height, so the header arrived
  // afterwards and pushed everything down. Measured on the live site in
  // November 2026: a layout shift of 0.03 on a desktop essay and 0.16 on a
  // phone (where the nav wraps to 121px), and worse on tool pages, whose
  // module script holds DOMContentLoaded back until the bundle has run.
  //
  // This file is a blocking <script> in <head>, so it is running before the
  // parser has built <body>. A MutationObserver sees each placeholder appear
  // and replaces it in the same turn, before the first paint, so nothing is
  // ever drawn in the wrong place. The placeholder must already be closed (it
  // has a following sibling) before it is replaced: replacing an element the
  // parser is still inside would send the rest of the page into a detached
  // node. DOMContentLoaded stays as the fallback, and is the only path in the
  // build's DOM-less sandboxes, which have no MutationObserver.
  function mountPlaceholder(id, render, after) {
    var done = false;
    var observer = null;
    function swap(force) {
      if (done) return;
      var el = document.getElementById(id);
      if (!el) return;
      if (!force && !el.nextSibling && document.readyState === 'loading') return;
      done = true;
      if (observer) observer.disconnect();
      el.outerHTML = render();
      if (after) after();
    }
    swap(false);
    if (!done && typeof MutationObserver !== 'undefined' && document.documentElement) {
      observer = new MutationObserver(function () { swap(false); });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    document.addEventListener('DOMContentLoaded', function () {
      swap(true);
      if (observer) observer.disconnect();
    });
  }

  function active(href) {
    if (href === '/') return p === '/' || p === '/index.html';
    return p.startsWith(href);
  }

  var nav = [
    ['/', 'Home'],
    ['/tools/', 'Tools'],
    ['/games/', 'Games'],
    ['/essays/', 'Essays'],
    ['/articles/', 'Articles'],
    ['/about', 'About'],
    ['/contact', 'Contact'],
  ];

  var footerNav = [
    ['/', 'Home'],
    ['/tools/', 'Tools'],
    ['/games/', 'Games'],
    ['/essays/', 'Essays'],
    ['/about', 'About'],
    ['/contact', 'Contact'],
    // /sites-i-like is deliberately NOT listed. The page still exists and
    // still works for anyone handed the link, but one recommendation is not a
    // section, and the single entry it currently holds does not represent the
    // site. Re-add this line once the list is worth reading.
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

  // ── Monetisation override (restored games) ──
  // Restored games carry no ads, donation links or sales links (docs/games.md).
  // A page opts out with <meta name="rf-monetisation" content="off">, and every
  // page under /games/ is off unless it says content="on". Off, the site footer
  // drops Ko-fi, Buy Me a Coffee and the Amazon books link and keeps everything
  // else, retitled so the block does not read as an ask. AdSense is opted out by
  // the page not loading it; check-links fails the build if ad or donation
  // markup shows up anywhere under /games/, and checks that switching this back
  // on restores the global footer exactly. One switch for every page, so the
  // next restored game needs no code.
  window.rfMonetisation = function () {
    var meta = document.querySelector && document.querySelector('meta[name="rf-monetisation"]');
    var v = meta && meta.getAttribute('content');
    if (v === 'on') return true;
    if (v === 'off') return false;
    return !/^\/games(\/|$)/.test(p);
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
  //
  // Rail slots (the 160x600 side ads) are written as <ins class="rf-ad-rail-slot">
  // and only become AdSense slots once they are actually laid out. CSS hides
  // .ad-rail below 1540px, and AdSense throws a TagError for every slot it is
  // handed with no width: two per page view on every narrow screen until this
  // existed. A hidden rail cannot simply be skipped while it keeps the
  // adsbygoogle class, because each push() fills the NEXT unfilled
  // ins.adsbygoogle in page order: the push meant for the slot below the
  // content would land on the hidden rail. So a rail joins only when it has a
  // width, at mount time on a wide screen or on a later resize past the
  // breakpoint, and an ad is never requested for a slot nobody can see.
  //
  // Only slots AdSense has not processed are mounted. Its own Auto Ads anchor is
  // an ins.adsbygoogle with no data-ad-client but data-adsbygoogle-status set,
  // so a mount that ran after AdSense had created it (any resize mount, or an
  // inline call when adsbygoogle.js loaded early) stamped our client id on it
  // and pushed for it, and AdSense threw "All 'ins' elements ... already have
  // ads in them". Found in November 2026 by a live resize test.
  var railWatcher = null;
  window.rfMountAdsenseSlots = function () {
    var rails = document.querySelectorAll('ins.rf-ad-rail-slot');
    var waiting = 0;
    for (var r = 0; r < rails.length; r++) {
      if (!rails[r].offsetWidth) { waiting++; continue; }
      rails[r].classList.remove('rf-ad-rail-slot');
      rails[r].classList.add('adsbygoogle');
    }
    var slots = document.querySelectorAll('.adsbygoogle:not([data-ad-client]):not([data-adsbygoogle-status])');
    for (var i = 0; i < slots.length; i++) {
      slots[i].setAttribute('data-ad-client', window.rfAdsenseClientId);
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    }
    if (waiting && !railWatcher) {
      var queued = false;
      railWatcher = function () {
        if (queued) return;
        queued = true;
        requestAnimationFrame(function () { queued = false; window.rfMountAdsenseSlots(); });
      };
      window.addEventListener('resize', railWatcher, { passive: true });
    } else if (!waiting && railWatcher) {
      window.removeEventListener('resize', railWatcher);
      railWatcher = null;
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

    mountPlaceholder(config.idPrefix + '-header', header);
    mountPlaceholder(config.idPrefix + '-footer', footer, function () {
      // The tool id is the last segment of its base ('/tools/holopath'), so
      // this needs nothing added to any tool's config object.
      window.rfMountRelatedTools(String(config.base || '').split('/').pop());
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

  // [url, label, monetised]. A page with monetisation off leaves out the
  // entries marked true (see rfMonetisation above) and keeps the rest.
  var support = [
    [RF_KOFI, 'Ko-fi', true],
    [RF_BMC, 'Buy Me a Coffee', true],
    [RF_SUBSTACK, 'Subscribe on Substack'],
    [RF_GITHUB, 'GitHub'],
    [RF_AMAZON, 'Books on Amazon', true],
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
    var monetised = window.rfMonetisation();
    var sup = support.filter(function (l) { return monetised || !l[2]; }).map(function (l) {
      return '<a href="' + l[0] + '" class="support-link" target="_blank" rel="noopener">' + l[1] + '</a>';
    }).join('');

    var links = footerNav.map(function (l) {
      return '<a href="' + l[0] + '">' + l[1] + '</a>';
    }).join('');

    return '<footer class="site-footer"><div class="site-footer__inner">' +
      '<div class="site-footer__support"><h3>' + (monetised ? 'Support Restless Forge' : 'Follow Restless Forge') + '</h3>' +
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

  mountPlaceholder('rf-nav', function () { return window.rfNav(); });
  mountPlaceholder('rf-footer', function () { return window.rfFooter(); });
  document.addEventListener('DOMContentLoaded', resolveProseLinks);
})();
