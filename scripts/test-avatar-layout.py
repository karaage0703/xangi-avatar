"""Browser regression: avatars and controls must not overlap at any supported size.
Run after npm run build with uv run --with playwright python scripts/test-avatar-layout.py.
"""
import functools
import json
import os
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass
server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(root / 'dist')))
Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
results = []
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE'), args=['--no-sandbox'])
        page = browser.new_page()
        page.add_init_script('window.EventSource = class { addEventListener() {} close() {} };')
        page.route('**/api/**', lambda route: route.fulfill(json={'workspaces': [{'id':'default','name':'default'}, {'id':'ws-english','name':'english'}, {'id':'ws-game','name':'game'}], 'backends': [], 'characterSettings': {'customCharacters': []}}))
        for width, height in [(1920, 1080), (638, 929), (390, 844), (320, 568), (844, 390)]:
            page.set_viewport_size({'width': width, 'height': height})
            page.goto(base)
            for character in ['xangi-assistant', 'english-coach', 'game-partner']:
                page.select_option('#modeSelect', character)
                page.locator('#settingsButton').click()
                page.locator('#characterSettingsButton').click()
                assert page.locator('#characterWorkspace').count() == 0
                page.locator('#characterCloseButton').click()
                if page.locator('#settingsDialog').is_visible():
                    page.locator('#settingsDialog button[value="close"]').click()
                page.wait_for_function('[...document.querySelectorAll(".avatar-frame")].every(i => i.complete && i.naturalWidth)')
                # Include a visible reply and wrapped error, which change panel height.
                page.eval_on_selector('#bubble', '(e) => { e.hidden=false; e.querySelector("#bubbleText").textContent="テストの返答です。"; }')
                page.eval_on_selector('#errorMessage', '(e) => { e.hidden=false; e.textContent="確認用の長いエラーメッセージです。".repeat(4); }')
                for shape in ['square', 'portrait']:
                    if shape == 'portrait':
                        page.eval_on_selector_all('.avatar-frame', '''els => els.forEach(e => e.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="520" height="832"><rect width="520" height="832" fill="teal"/></svg>'))''')
                    avatar = page.locator('#avatar').bounding_box()
                    dock = page.locator('.control-dock').bounding_box()
                    bubble = page.locator('#bubble').bounding_box()
                    assert avatar['y'] + avatar['height'] <= dock['y'], (width, height, character, shape, avatar, dock)
                    assert bubble['y'] + bubble['height'] <= avatar['y'], (width, height, 'bubble overlap')
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, 'horizontal overflow')
                    page.locator('#voiceButton').scroll_into_view_if_needed()
                    assert page.locator('#voiceButton').evaluate('(e) => { const r=e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }')
                    results.append([width, height, character, shape, 'pass'])
            page.select_option('#modeSelect', 'xangi-assistant')
            page.eval_on_selector('#bubble', '(e) => e.hidden=true')
            page.eval_on_selector('#errorMessage', '(e) => e.hidden=true')
            page.evaluate('scrollTo(0,0)')
            output = os.environ.get('AVATAR_LAYOUT_SCREENSHOTS')
            if output:
                Path(output).mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(Path(output) / f'{width}x{height}.png'), full_page=True)
            page.locator('#settingsButton').click()
            page.locator('#controlsToggle').uncheck()
            page.locator('#settingsDialog button[value="close"]').click()
            assert not page.locator('.control-dock').is_visible()
            page.locator('#restoreControlsButton').click()
            assert page.locator('.control-dock').is_visible()
        overlay_cases = 0
        for width, height in [(1920, 1080), (900, 320), (500, 180), (320, 180), (390, 844)]:
            page.set_viewport_size({'width': width, 'height': height})
            for view in ['character', 'bubble', 'overlay']:
                page.goto(f'{base}/?view={view}&background=transparent')
                assert not page.locator('.control-dock').is_visible()
                assert page.evaluate('document.documentElement.scrollHeight <= innerHeight')
                if view == 'bubble':
                    continue
                for character in ['xangi-assistant', 'english-coach', 'game-partner']:
                    page.goto(f'{base}/?view={view}&background=transparent&character={character}')
                    page.wait_for_function('[...document.querySelectorAll(".avatar-frame")].every(i => i.complete && i.naturalWidth)')
                    for state in ['idle', 'speaking', 'listening', 'thinking']:
                        page.eval_on_selector('#avatar', '(e, state) => e.dataset.state=state', state)
                        # Freeze each animation at its peak transform for deterministic bounds.
                        page.evaluate('document.getAnimations().forEach(a => { a.pause(); a.currentTime = a.effect.getTiming().duration / 2; })')
                        for frame in page.locator('.avatar-frame').all():
                            box = frame.bounding_box()
                            assert box['x'] >= 0 and box['y'] >= 0, (width, height, view, state, box)
                            assert box['x'] + box['width'] <= width and box['y'] + box['height'] <= height, (width, height, view, state, box)
                        overlay_cases += 1
                if output:
                    page.screenshot(path=str(Path(output) / f'obs-{view}-{width}x{height}.png'), omit_background=True)
        browser.close()
finally:
    server.shutdown()
    server.server_close()
print(json.dumps({'layout_cases': len(results), 'results': results, 'overlay_cases': overlay_cases}))
