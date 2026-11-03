#!/usr/bin/env python3
"""Real-browser check of the touch controls and of pausing in the background (build 26).

Drives headless Chromium on a phone-sized page with real multi-touch (CDP
Input.dispatchTouchEvent, which Chromium turns into the same pointer events a phone sends),
upright and on its side. Checks the stick's eight directions, its dead zone and how it follows
the thumb, the ship moving under it, FIRE and BOMB alone, both through the gap between them and
with two fingers, a pad button clearing the intro and the briefing, the TOUCH CONTROLS toggle
and its memory, and a game pausing with its sound held when the page is hidden. Also checks a
desktop without a touchscreen gets neither the controls nor the toggle. Fails on any page error.

    python3 serve.py 8122 &
    python3 test/touch_e2e.py http://localhost:8122/ out_dir
"""
import sys, os, time, math
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8122/'
OUT = sys.argv[2] if len(sys.argv) > 2 else '.'
os.makedirs(OUT, exist_ok=True)
fails, errors = [], []

def check(name, cond, info=''):
    print(('  ok   ' if cond else '  FAIL ') + name + ('' if cond or info == '' else '  ' + str(info)))
    if not cond: fails.append(name)

class Touch:
    """Fingers on the screen through CDP. touchStart and touchMove send every finger down;
    touchEnd sends only the finger lifted (Chromium lifts the points a touchEnd lists)."""
    def __init__(self, page):
        self.cdp = page.context.new_cdp_session(page); self.pts = {}
    def _send(self, kind, pts):
        self.cdp.send('Input.dispatchTouchEvent', {'type': kind,
            'touchPoints': [{'x': x, 'y': y, 'id': i} for i, (x, y) in pts.items()]})
    def down(self, i, x, y): self.pts[i] = (x, y); self._send('touchStart', self.pts)
    def move(self, i, x, y): self.pts[i] = (x, y); self._send('touchMove', self.pts)
    def up(self, i): self._send('touchEnd', {i: self.pts.pop(i)})
    def tap(self, x, y): self.down(9, x, y); self.up(9)

def box(page, sel): return page.locator(sel).bounding_box()
def mid(b): return b['x'] + b['width'] / 2, b['y'] + b['height'] / 2
def flags(page):
    t = page.evaluate('({...window.__foobar.input.t})')
    return ''.join(k[0].upper() for k in ('left', 'right', 'up', 'down', 'fire', 'bomb') if t[k]) or '-'
def state(page): return page.evaluate('window.__foobar.state')
def on(page, ov): return page.evaluate(f"document.getElementById('{ov}').classList.contains('on')")
def watch(page):
    page.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))

def start_game(page, T):
    T.tap(*mid(box(page, '#b-start')))
    page.wait_for_selector('#ov-intro.on', timeout=5000); time.sleep(0.3)
    # a pad button skips the intro and clears the briefing, as any key does
    fire = mid(box(page, '#pad-fire'))
    T.down(1, *fire); T.up(1)
    page.wait_for_selector('#ov-brief.on', timeout=5000)
    check('FIRE on the pad skipped the intro', on(page, 'ov-brief'))
    T.down(1, *fire); T.up(1); time.sleep(0.2)
    check('FIRE on the pad cleared the briefing', state(page) == 'play', state(page))
    page.evaluate('() => { const g = window.__foobar; g.god = true; g.sim.god = true; }')

def stick_and_buttons(page, T, tag):
    s = box(page, '#pad-stick'); cx, cy = mid(s)
    # eight sectors of 45 degrees, measured in screen coordinates (y grows downwards)
    want = {0: 'R', 45: 'RD', 90: 'D', 135: 'LD', 180: 'L', 225: 'LU', 270: 'U', 315: 'RU', 20: 'R', 25: 'RD', 340: 'R', 335: 'RU'}
    got = {}
    for a, w in want.items():
        T.down(1, cx, cy)
        for r in (10, 20, 28):
            T.move(1, cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)))
        got[a] = flags(page); T.up(1)
    check(f'{tag}: stick reads eight directions, 22.5 degree borders',
          all(got[a] == w for a, w in want.items()), got)
    T.down(1, cx, cy); T.move(1, cx + 5, cy + 3); f = flags(page); T.up(1)
    check(f'{tag}: a 6 px nudge is inside the dead zone', f == '-', f)
    T.down(1, cx, cy); T.move(1, cx + 50, cy); T.move(1, cx + 100, cy); T.move(1, cx + 60, cy); f = flags(page); T.up(1)
    check(f'{tag}: the stick follows past its rim, so a short slide back turns round', f == 'L', f)
    check(f'{tag}: letting go centres everything', flags(page) == '-' and
          page.evaluate("document.getElementById('stick-knob').style.transform") == '')
    # the ship moves under the stick, at the original's speed
    x0 = page.evaluate('window.__foobar.sim.ship1.x')
    T.down(1, cx, cy); T.move(1, cx - 30, cy); time.sleep(0.45)
    x1 = page.evaluate('window.__foobar.sim.ship1.x')
    T.move(1, cx + 30, cy); time.sleep(0.45)
    x2 = page.evaluate('window.__foobar.sim.ship1.x'); T.up(1)
    check(f'{tag}: the ship flies left then right under the stick', x1 < x0 and x2 > x1, (x0, x1, x2))
    f, b = box(page, '#pad-fire'), box(page, '#pad-bomb')
    fx, fy = mid(f); bx, by = mid(b); gap = ((f['x'] + f['width']) + b['x']) / 2
    T.down(2, fx, fy); a1 = flags(page)
    lit = page.evaluate("document.getElementById('pad-fire').classList.contains('on')")
    T.move(2, gap, fy); a2 = flags(page)
    T.move(2, bx, by); a3 = flags(page)
    T.up(2); a4 = flags(page)
    check(f'{tag}: one thumb: FIRE, then the gap holds both, then BOMB, then nothing',
          (a1, a2, a3, a4) == ('F', 'FB', 'B', '-') and lit, (a1, a2, a3, a4, lit))
    T.down(2, fx, fy); T.down(3, bx, by); c1 = flags(page); T.up(2); c2 = flags(page); T.up(3)
    check(f'{tag}: two fingers hold FIRE and BOMB together', (c1, c2) == ('FB', 'B'), (c1, c2))
    T.down(1, cx, cy); T.move(1, cx, cy - 30); T.down(2, fx, fy); d1 = flags(page)
    page.screenshot(path=os.path.join(OUT, f'{tag}_play_held.png'))
    T.up(1); T.up(2)
    check(f'{tag}: steering and firing at once', d1 == 'UF', d1)

with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])

    # ---------------------------------------------------------------- upright phone
    print('phone, upright (390 x 664)')
    ctx = b.new_context(viewport={'width': 390, 'height': 664}, has_touch=True, is_mobile=True, device_scale_factor=2)
    page = ctx.new_page(); watch(page); T = Touch(page)
    page.goto(URL); page.wait_for_selector('#ov-title.on', timeout=20000)
    check('touch controls on by default on a phone', page.evaluate("document.getElementById('cab').classList.contains('touch-on')"))
    check('the toggle is offered', page.locator('#b-touch').is_visible() and 'ON' in page.locator('#b-touch').inner_text())
    css = page.evaluate("(() => { const s = getComputedStyle(document.getElementById('pad-btns')); return [s.touchAction, s.userSelect || s.webkitUserSelect]; })()")
    check('the pad takes no scroll, zoom or selection', css == ['none', 'none'], css)
    st, pk = box(page, '#stage'), box(page, '#pad-stick')
    check('the pad sits under the playfield, not on it', pk['y'] >= st['y'] + st['height'], (st, pk))
    check('playfield and pad both fit on the screen', pk['y'] + pk['height'] <= 664 and st['y'] >= 0)
    start_game(page, T)
    time.sleep(1.2)                                   # the ship's fly-in
    stick_and_buttons(page, T, 'upright')

    # background: hiding the page pauses the game and holds the sound
    ctxs =lambda: page.evaluate('window.__foobar.audio.ctx && window.__foobar.audio.ctx.state')
    check('sound is running in play', ctxs() == 'running', ctxs())
    other = ctx.new_page(); other.bring_to_front(); time.sleep(0.4)
    real = page.evaluate('document.visibilityState') == 'hidden'
    if not real:   # this headless build keeps every tab visible: stand in for the browser
        page.evaluate("""() => { Object.defineProperty(document, 'hidden', {configurable: true, get: () => true});
                         Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'hidden'});
                         document.dispatchEvent(new Event('visibilitychange')); }""")
    time.sleep(0.3)
    print('    (visibility: ' + ('real tab switch' if real else 'simulated visibilitychange') + ')')
    check('hidden: the game paused', state(page) == 'pause' and on(page, 'ov-pause'), state(page))
    check('hidden: the sound is held', ctxs() == 'suspended', ctxs())
    check('hidden: the music loop is stopped', page.evaluate('window.__foobar.audio.musicTimer') is None)
    if real: page.bring_to_front()
    else:
        page.evaluate("""() => { Object.defineProperty(document, 'hidden', {configurable: true, get: () => false});
                         Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'visible'});
                         document.dispatchEvent(new Event('visibilitychange')); }""")
    other.close(); time.sleep(0.3)
    check('back: the sound returns, the game waits on RESUME', ctxs() == 'running' and state(page) == 'pause', (ctxs(), state(page)))
    check('the pause screen offers the toggle', page.locator('#b-touch-p').is_visible())
    T.tap(*mid(box(page, '#b-resume'))); time.sleep(0.2)
    check('RESUME plays on with music', state(page) == 'play' and page.evaluate('window.__foobar.audio.musicTimer') is not None)
    page.evaluate("dispatchEvent(new PageTransitionEvent('pagehide', {persisted: true}))"); time.sleep(0.2)
    check('pagehide pauses too', state(page) == 'pause', state(page))
    page.evaluate("dispatchEvent(new PageTransitionEvent('pageshow', {persisted: true}))"); time.sleep(0.2)
    check('pageshow brings the sound back', ctxs() == 'running', ctxs())

    # the toggle, and that it is remembered
    w0 = box(page, '#stage')['width']
    T.tap(*mid(box(page, '#b-touch-p'))); time.sleep(0.2)
    off = not page.evaluate("document.getElementById('cab').classList.contains('touch-on')")
    check('TOUCH CONTROLS: OFF hides the pad and gives the playfield the full width',
          off and not page.locator('#pad-stick').is_visible() and box(page, '#stage')['width'] >= w0 and
          'OFF' in page.locator('#b-touch-p').inner_text())
    page.reload(); page.wait_for_selector('#ov-title.on', timeout=20000)
    check('off is remembered', not page.evaluate("document.getElementById('cab').classList.contains('touch-on')")
          and page.evaluate("localStorage.getItem('foobar_touch')") == '0')
    T.tap(*mid(box(page, '#b-touch'))); time.sleep(0.2)
    check('and on again', page.evaluate("document.getElementById('cab').classList.contains('touch-on')")
          and page.evaluate("localStorage.getItem('foobar_touch')") == '1')

    # hiding the page during the intro holds its music, and does not skip anything
    T.tap(*mid(box(page, '#b-start'))); page.wait_for_selector('#ov-intro.on', timeout=5000); time.sleep(0.4)
    page.evaluate("""() => { Object.defineProperty(document, 'hidden', {configurable: true, get: () => true});
                     document.dispatchEvent(new Event('visibilitychange')); }"""); time.sleep(0.3)
    check('intro, hidden: music held, intro still showing', ctxs() == 'suspended' and on(page, 'ov-intro'), ctxs())
    page.evaluate("""() => { Object.defineProperty(document, 'hidden', {configurable: true, get: () => false});
                     document.dispatchEvent(new Event('visibilitychange')); }"""); time.sleep(0.3)
    check('intro, back: music on again', ctxs() == 'running', ctxs())
    ctx.close()

    # ---------------------------------------------------------------- phone on its side
    print('phone, on its side (844 x 390)')
    ctx = b.new_context(viewport={'width': 844, 'height': 390}, has_touch=True, is_mobile=True, device_scale_factor=2)
    page = ctx.new_page(); watch(page); T = Touch(page)
    page.goto(URL); page.wait_for_selector('#ov-title.on', timeout=20000)
    st, pk, pb = box(page, '#stage'), box(page, '#pad-stick'), box(page, '#pad-btns')
    check('stick left of the playfield, buttons right of it',
          pk['x'] + pk['width'] <= st['x'] and pb['x'] >= st['x'] + st['width'], (st, pk, pb))
    start_game(page, T)
    time.sleep(1.2)
    stick_and_buttons(page, T, 'sideways')
    ctx.close()

    # ---------------------------------------------------------------- desktop, no touchscreen
    print('desktop, no touchscreen (1366 x 657)')
    ctx = b.new_context(viewport={'width': 1366, 'height': 657})
    page = ctx.new_page(); watch(page)
    page.goto(URL); page.wait_for_selector('#ov-title.on', timeout=20000)
    check('no touch controls and no toggle without a touchscreen',
          not page.evaluate("document.getElementById('cab').classList.contains('touch-on')")
          and not page.locator('#b-touch').is_visible() and not page.locator('#pad-stick').is_visible())
    ctx.close()
    b.close()

for e in errors: print('  ' + e)
if fails or errors:
    print(f'TOUCH E2E FAILED: {len(fails)} check(s), {len(errors)} page error(s)'); sys.exit(1)
print('TOUCH E2E PASSED')
