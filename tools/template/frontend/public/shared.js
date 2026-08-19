/* shared.js — __TOOL_LABEL__ shared header & footer
   Requires /shared.js (site/shared.js) to be loaded first — this calls
   window.rfMountToolChrome(), the shared chrome engine every tool uses.

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
  var base = '/tools/__TOOL_NAME__';

  // Tool-specific links only — rfMountToolChrome appends the global
  // Restless Forge / All Tools (nav) and Privacy / Terms / Restless Forge /
  // All Tools (footer) tails automatically. Add entries (e.g. FAQ, Articles)
  // as you add the matching src/<page>/index.html.
  var navLinks = [
    [base + '/', '__TOOL_LABEL__'],
    [base + '/about/', 'About'],
  ];

  var footerLinks = [
    [base + '/', '__TOOL_LABEL__'],
    [base + '/about/', 'About'],
  ];

  var chrome = window.rfMountToolChrome({
    base: base,
    idPrefix: '__TOOL_PREFIX__',
    brand: '__TOOL_EMOJI__ __TOOL_LABEL__',
    navLinks: navLinks,
    footerLinks: footerLinks,
    copyrightHtml: '__TOOL_LABEL__.',
  });
  window.__TOOL_PREFIX__Header = chrome.header;
  window.__TOOL_PREFIX__Footer = chrome.footer;
})();
