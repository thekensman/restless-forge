#!/usr/bin/env python3
"""Real-browser end-to-end check for build 25.

Boots index.html in headless Chromium through serve.py, starts a game, plays with real key
events, jumps to the boss, skips to level 2, then loses on purpose to walk through the high
score dialog and table. Fails on any console error, page error or red error bar, and on any
high score step that does not match the original. Saves screenshots.

    python3 serve.py 8122 &
    python3 test/browser_e2e.py http://localhost:8122/ out_dir
"""
import sys, os, json, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8122/'
OUT = sys.argv[2] if len(sys.argv) > 2 else '.'
os.makedirs(OUT, exist_ok=True)

errors = []

def shot(page, name):
    page.locator('#c').screenshot(path=os.path.join(OUT, name + '.png'))

with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    page = b.new_page(viewport={'width': 1100, 'height': 860})
    failed = []; requested = []
    page.on('requestfailed', lambda r: failed.append(r.url))
    page.on('request', lambda r: requested.append(r.url) if r.url.startswith('http') else None)
    page.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    page.goto(URL + '?e2e=1')
    page.wait_for_selector('#ov-title.on', timeout=20000)
    page.click('#b-start')
    page.wait_for_selector('#ov-intro.on', timeout=5000)
    time.sleep(0.5)
    page.click('#b-skip')
    page.wait_for_selector('#ov-brief.on', timeout=5000)
    page.click('#b-brief-go')
    time.sleep(0.3)
    state = page.evaluate('window.__foobar.diagnostics()')
    assert state['state'] == 'play', state
    # fly around, fire and bomb for a while
    t0 = time.time()
    keys = ['a', 'd', 'w', 's']
    i = 0
    page.keyboard.down('z')
    while time.time() - t0 < 12:
        k = keys[i % 4]; i += 1
        page.keyboard.down(k); time.sleep(0.35); page.keyboard.up(k)
        if i % 3 == 0:
            page.keyboard.down('x'); time.sleep(0.05); page.keyboard.up('x')
        if i == 10: shot(page, 'play_early')
    page.keyboard.up('z')
    shot(page, 'play_12s')
    d1 = page.evaluate('window.__foobar.diagnostics()')
    # jump the scroll near the arena with the debug hook and look at it
    page.evaluate('''() => { const g = window.__foobar; g.sim.god = true; g.god = true; }''')
    page.evaluate('''() => { const s = window.__foobar.sim; s.scroll = 6150; s.prevScroll = 6150;
                     s.waveIdx = s.badg[s.L().id].findIndex(e => e.y >= 6150); }''')
    time.sleep(3.0)
    shot(page, 'arena_scrolling')
    time.sleep(6.0)
    shot(page, 'boss')
    d2 = page.evaluate('window.__foobar.diagnostics()')
    # skip to level 2 with the cheat and check its briefing and first frames
    page.keyboard.type('eee')
    time.sleep(6)
    brief = page.evaluate("document.getElementById('ov-brief').classList.contains('on')")
    # the side panel already shows the level being briefed, as the original redraws it first
    brief_hud = page.evaluate("[document.getElementById('v-level').textContent, document.getElementById('boss-name').textContent]")
    if brief_hud != ['2', 'Telehead']:
        errors.append('briefing panel shows ' + json.dumps(brief_hud) + ', want level 2 and Telehead')
    if brief:
        page.click('#b-brief-go'); time.sleep(4)
        shot(page, 'level2_start')
    d3 = page.evaluate('window.__foobar.diagnostics()')

    # house rules: two Foo++ clones and timed rapid fire, on screen and in the HUD
    page.evaluate('''() => { const s = window.__foobar.sim, p = s.ship1;
        for (const k of ['clone', 'clone', 'rapidfire']) s.spawn('yummy', p.x, p.v, u => { u.ykind = k; }); }''')
    time.sleep(1.2)
    # HUD churn during a busy fight: count changes to the side panels over three seconds
    page.evaluate('''() => { window.__mut = 0; const o = new MutationObserver(m => { window.__mut += m.length; });
        document.querySelectorAll('.side').forEach(el => o.observe(el, {subtree: true, childList: true, characterData: true, attributes: true})); }''')
    page.keyboard.down('z'); time.sleep(3.0); page.keyboard.up('z')
    mut = page.evaluate('window.__mut') / 3.0
    if mut > 20:
        errors.append(f'side panels changed {mut:.1f} times a second during rapid fire')
    fx = page.evaluate("document.getElementById('v-fx').textContent")
    ships = page.evaluate("window.__foobar.sim.sprites.filter(x => x.code === 666 && x.task).length")
    shot(page, 'three_ships')
    house = {'hud': fx, 'ships': ships, 'panelChangesPerSecond': round(mut, 1)}
    if 'FOO++ x2' not in fx or 'RAPID ' not in fx or ships != 3:
        errors.append('house rules: ' + json.dumps(house))

    # high scores: lose the last life with a score that makes the table
    def stage(name):
        page.locator('#stage').screenshot(path=os.path.join(OUT, name + '.png'))
    def lose(score):
        # missiles still in the air can score during the 50 dying frames, so read the final score
        page.evaluate('''(sc) => { const g = window.__foobar, s = g.sim;
            s.god = false; g.god = false; s.lives = 1; s.score = sc; s.dead = true; }''', score)
        page.wait_for_selector('#ov-over.on', timeout=10000)
        return str(page.evaluate('window.__foobar.sim.score'))
    page.evaluate("try{localStorage.removeItem('foobar_highscores')}catch(e){}")
    page.evaluate("window.__foobarScores.erase()")
    final = lose(1234)
    page.wait_for_selector('#hs-dialog', state='visible', timeout=3000)
    hs_default = page.evaluate('''() => { const n = document.getElementById('hs-name');
        return [n.value, n.selectionStart, n.selectionEnd, document.activeElement === n]; }''')
    stage('hiscore_dialog')
    page.keyboard.type('Ken w s')          # game keys and space have to reach the field
    page.keyboard.press('Enter')
    page.wait_for_selector('#hs-table', state='visible', timeout=3000)
    row1 = page.evaluate('''() => [...document.querySelectorAll('#hs-rows .at')].slice(0, 3)
        .map(e => [e.textContent, e.classList.contains('new')])''')
    stage('hiscore_table')
    page.keyboard.press('q')
    time.sleep(0.2)
    hs_closed = not page.evaluate("document.getElementById('ov-hs').classList.contains('on')")
    page.click('#b-home')
    page.wait_for_selector('#ov-title.on', timeout=3000)
    page.reload()
    page.wait_for_selector('#ov-title.on', timeout=20000)
    page.click('#b-scores')
    page.wait_for_selector('#hs-table', state='visible', timeout=3000)
    kept = page.evaluate('''() => [...document.querySelectorAll('#hs-rows .at')].slice(0, 3).map(e => e.textContent)''')
    page.mouse.click(400, 300)
    time.sleep(0.2)
    # a score that does not beat 10th place opens nothing
    page.click('#b-start'); page.wait_for_selector('#ov-intro.on', timeout=5000)
    page.click('#b-skip'); page.wait_for_selector('#ov-brief.on', timeout=5000)
    page.click('#b-brief-go'); time.sleep(0.5)
    lose(0)
    time.sleep(0.5)
    no_dialog = not page.evaluate("document.getElementById('ov-hs').classList.contains('on')")
    hiscore = {'default': hs_default, 'row1': row1, 'closedByKey': hs_closed, 'afterReload': kept,
               'zeroOpensNothing': no_dialog}
    want = {'default': ['Your name here', 0, 14, True],
            'row1': [['1', True], ['Ken w s', True], [final, True]],
            'closedByKey': True, 'afterReload': ['1', 'Ken w s', final], 'zeroOpensNothing': True}
    if hiscore != want:
        errors.append('high scores: got ' + json.dumps(hiscore) + ' want ' + json.dumps(want))
    # The page serves everything itself, fonts included, so any failed request is a bug.
    if failed:
        errors.append('failed requests: ' + ', '.join(failed))
    outside = [u for u in requested if not u.startswith(URL.split('/', 3)[0] + '//' + URL.split('/', 3)[2])]
    if outside:
        errors.append('requests outside the site: ' + ', '.join(outside))
    bar = page.evaluate("(document.getElementById('errbar')||{}).textContent||''")
    if bar: errors.append('errbar: ' + bar)
    b.close()

print(json.dumps({'after12s': d1['sim'], 'boss': d2['sim'], 'level2': d3['sim'], 'briefShown': brief,
                  'briefPanel': brief_hud, 'house': house, 'hiscore': hiscore}, indent=1))
if errors:
    print('BROWSER E2E FAILED')
    for e in errors: print('  ' + e)
    sys.exit(1)
print('BROWSER E2E PASSED')
