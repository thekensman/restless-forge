/* shared.js — Rise &amp; Rhyme shared header & footer
   Requires /shared.js (site/shared.js) to be loaded first — this calls
   window.rfMountToolChrome(), the shared chrome engine every tool uses.

   Placeholders (replace across the whole template):
     rise-and-rhyme   — URL directory name,  e.g. "my-tool"
     Rise &amp; Rhyme  — Display name,        e.g. "My Tool"
     rar — Identifier prefix,   e.g. "mt"  (2–5 lowercase letters)
     🎵  — Header emoji/glyph,  e.g. "\u{1F527}"

   Every HTML page (main + sub-pages) renders the header/footer by including
   these two empty divs; this script auto-injects on DOMContentLoaded:
     <div id="rar-header"></div>
     <div id="rar-footer"></div>
*/
(function () {
  'use strict';
  var base = '/tools/rise-and-rhyme';

  // Tool-specific links only — rfMountToolChrome appends the global
  // Restless Forge / All Tools (nav) and Privacy / Terms / Restless Forge /
  // All Tools (footer) tails automatically. Add entries (e.g. FAQ, Articles)
  // as you add the matching src/<page>/index.html.
  var navLinks = [
    [base + '/', 'Rise &amp; Rhyme'],
    [base + '/about/', 'About'],
  ];

  var footerLinks = [
    [base + '/', 'Rise &amp; Rhyme'],
    [base + '/about/', 'About'],
  ];

  var chrome = window.rfMountToolChrome({
    base: base,
    idPrefix: 'rar',
    brand: '🎵 Rise &amp; Rhyme',
    navLinks: navLinks,
    footerLinks: footerLinks,
    copyrightHtml: 'Rise &amp; Rhyme.',
  });
  window.rarHeader = chrome.header;
  window.rarFooter = chrome.footer;
})();
