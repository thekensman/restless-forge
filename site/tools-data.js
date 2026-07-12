/* tools-data.js — SINGLE SOURCE OF TRUTH for the tool directory.
   Every tool's label, category, description, and status lives here and
   nowhere else. The landing page and /tools/ directory render their cards
   from this file, so a tool can never show different categories in
   different places.

   status:
     "live" — rendered with a launch link on the landing page and directory
     "soon" — counted in the "in the forge" teaser; never linked

   To launch a tool:
     1. flip its status to "live"
     2. remove the `<meta name="robots" content="noindex">` line from every
        HTML page under tools/<id>/frontend/src/
     3. add its URLs to site/sitemap.xml
   Nothing else. */
(function () {
  'use strict';

  window.rfTools = [
    // ── Live ──
    { id: 'what-is-my-time-worth', label: 'What Is My Time Worth?', category: 'Financial', status: 'live',
      cta: 'Launch Calculator',
      desc: 'Calculate your real hourly wage after commute, taxes, work clothes, and decompression time. Then use the decision engine to know when to DIY and when to hire.' },
    { id: 'holopath', label: 'HoloPath', category: 'Creative', status: 'live',
      cta: 'Launch Generator',
      desc: 'Transform any image, GIF, or video into animated hologram art with scan lines, glow, and glitch effects. Supports pyramid projectors, LED fans, and Pepper’s Ghost displays.' },
    { id: 'sandpath', label: 'SandPath', category: 'Maker', status: 'live',
      cta: 'Launch Converter',
      desc: 'Convert images and SVG files into sand table patterns (.thr and .gcode) for kinetic sand tables like Oasis, Sisyphus, and ZenXY. Automatic image tracing with live preview.' },
    { id: 'tattoosafe', label: 'TattooSafe', category: 'Lifestyle', status: 'live',
      cta: 'Launch Preview',
      desc: 'Preview a tattoo design on your body with your camera, check the size against 16 body placements, and estimate pricing by size, style, and artist tier.' },

    // ── In the forge (never rendered as links) ──
    { id: 'is-my-raise-real', label: 'Is My Raise Real?', category: 'Financial', status: 'soon',
      desc: 'Your raise vs inflation: real purchasing power, what to ask for, and salary erosion over time.' },
    { id: 'subscription-audit', label: 'Subscription Audit', category: 'Financial', status: 'soon',
      desc: 'What your subscriptions really cost per year, per use, and in hours of your life.' },
    { id: 'repair-or-replace', label: 'Repair or Replace?', category: 'Financial', status: 'soon',
      desc: 'The neutral decision calculator: 50% rule, remaining lifespan, and the sunk-cost detector.' },
    { id: 'am-i-actually-saving', label: 'Am I Actually Saving?', category: 'Financial', status: 'soon',
      desc: 'The false-economy detector: driving across town for cheap gas, bulk-store math, DIY vs buy.' },
    { id: 'pet-cost', label: 'Pet Cost', category: 'Lifestyle', status: 'soon',
      desc: 'Lifetime cost of a dog or cat — food, vet, insurance, and the categories nobody budgets for.' },
    { id: 'side-hustle-reality', label: 'Side Hustle Reality', category: 'Financial', status: 'soon',
      desc: 'Your true hourly rate after gas, depreciation, self-employment tax, and dead time.' },
    { id: 'cookscale', label: 'CookScale', category: 'Lifestyle', status: 'soon',
      desc: 'Recipe unit conversion with real ingredient densities, pan-size scaling, and bake-time adjustment.' },
    { id: 'lensmatch', label: 'LensMatch', category: 'Creative', status: 'soon',
      desc: 'Camera lens equivalence across sensor sizes: crop factor, field of view, and depth of field.' },
    { id: 'cncfeed', label: 'CNCFeed', category: 'Maker', status: 'soon',
      desc: 'Feeds and speeds calculator for CNC milling by material, tool, and machine rigidity.' },
    { id: 'knotguide', label: 'KnotGuide', category: 'Utility', status: 'soon',
      desc: 'The right knot for the job, with step-by-step guidance.' },
    { id: 'printplate', label: 'PrintPlate', category: 'Maker', status: 'soon',
      desc: '3D print troubleshooting: symptom to root cause to fix.' },
    { id: 'plotpath', label: 'PlotPath', category: 'Maker', status: 'soon',
      desc: 'SVG to optimized pen-plotter paths.' },
    { id: 'pixelgrid', label: 'PixelGrid', category: 'Creative', status: 'soon',
      desc: 'Photos to cross-stitch and perler bead patterns with DMC color matching.' },
    { id: 'wavecarve', label: 'WaveCarve', category: 'Maker', status: 'soon',
      desc: 'Turn audio waveforms into carvable SVG, DXF, and STL art.' },
    { id: 'gerberpeek', label: 'GerberPeek', category: 'Maker', status: 'soon',
      desc: 'Preview PCB Gerber files in the browser before you order.' },
    { id: 'stitchtrace', label: 'StitchTrace', category: 'Creative', status: 'soon',
      desc: 'Images to embroidery machine files.' },
    { id: 'petdose', label: 'PetDose', category: 'Lifestyle', status: 'soon',
      desc: 'Pet medication reference ranges with safety warnings. (Pending veterinary review.)' },
    { id: 'promptdrop', label: 'PromptDrop', category: 'Conservation', status: 'soon',
      desc: 'The water footprint of your AI usage, honestly: cooling vs electricity-generation water, per prompt, image, and video, with sources for every number.' },
  ];

  /**
   * Render tool cards into a container.
   * opts.mode: "landing" (flat grid of live tools) or
   *            "directory" (live tools grouped by category + search when large)
   */
  window.rfRenderTools = function (containerId, opts) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var mode = (opts && opts.mode) || 'directory';
    var live = window.rfTools.filter(function (t) { return t.status === 'live'; });
    var soonCount = window.rfTools.length - live.length;

    function card(t) {
      return '<div class="tool-card">' +
        '<div class="tool-card__category">' + t.category + '</div>' +
        '<h3 class="tool-card__title">' + t.label + '</h3>' +
        '<p class="tool-card__desc">' + t.desc + '</p>' +
        '<a href="/tools/' + t.id + '/" class="tool-card__link">' + (t.cta || 'Launch') + '</a>' +
        '</div>';
    }

    var html = '';
    if (mode === 'landing') {
      html = live.map(card).join('');
    } else {
      // Directory: search box (only useful once the catalogue grows) +
      // category sections. Scales to 100 tools without a redesign.
      if (live.length > 6) {
        html += '<input type="search" id="rf-tool-search" class="tool-search" ' +
          'placeholder="Search ' + live.length + ' tools…" aria-label="Search tools">';
      }
      var cats = [];
      live.forEach(function (t) { if (cats.indexOf(t.category) === -1) cats.push(t.category); });
      cats.sort();
      cats.forEach(function (cat) {
        html += '<h2 class="tool-directory__category" data-category="' + cat + '">' + cat + '</h2>' +
          '<div class="tools-grid" data-category="' + cat + '">' +
          live.filter(function (t) { return t.category === cat; }).map(card).join('') +
          '</div>';
      });
    }
    if (soonCount > 0) {
      html += '<p class="tool-directory__teaser">' + soonCount +
        ' more tool' + (soonCount !== 1 ? 's' : '') + ' are in the forge.</p>';
    }
    el.innerHTML = html;

    // Live search filter (directory mode only)
    var search = document.getElementById('rf-tool-search');
    if (search) {
      search.addEventListener('input', function () {
        var q = search.value.toLowerCase();
        document.querySelectorAll('.tool-card').forEach(function (c) {
          var hit = c.textContent.toLowerCase().indexOf(q) !== -1;
          c.style.display = hit ? '' : 'none';
        });
        document.querySelectorAll('.tools-grid[data-category]').forEach(function (grid) {
          var any = Array.prototype.some.call(grid.children, function (c) { return c.style.display !== 'none'; });
          grid.style.display = any ? '' : 'none';
          var heading = document.querySelector('.tool-directory__category[data-category="' + grid.dataset.category + '"]');
          if (heading) heading.style.display = any ? '' : 'none';
        });
      });
    }
  };
})();
