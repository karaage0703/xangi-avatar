"""Run after npm run build: uv run --with playwright python scripts/test-streaming-speech-browser.py."""
import functools
import io
import json
import wave
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

root = Path(__file__).resolve().parents[1]
server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(root / 'dist')))
Thread(target=server.serve_forever, daemon=True).start()
out = io.BytesIO()
with wave.open(out, 'wb') as audio:
    audio.setnchannels(1)
    audio.setsampwidth(2)
    audio.setframerate(16000)
    audio.writeframes(b'\0\0' * 8000)
wav = out.getvalue()
requests = []
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page()
        page.add_init_script('''
          window.audioStarts = [];
          const start = AudioBufferSourceNode.prototype.start;
          AudioBufferSourceNode.prototype.start = function(...args) {
            window.audioStarts.push(performance.now());
            return start.apply(this, args);
          };
          window.EventSource = class {
            constructor(url) { if (url === '/api/avatar/events') window.events = this; }
            addEventListener() {} close() {}
          };
        ''')
        def api(route):
            path = route.request.url.split('/api/avatar/')[-1]
            if path == 'tts':
                requests.append(route.request.post_data_json['text'])
                route.fulfill(body=wav, content_type='audio/wav')
            elif path == 'config':
                route.fulfill(json={'agents': [{'id': 'test', 'name': 'Test'}], 'characterSettings': {'selectedCharacter': 'custom-test', 'customCharacters': [{'id': 'custom-test', 'agentId': 'test', 'tts': 'voicevox', 'language': 'ja-JP'}]}})
            elif path == 'session':
                route.fulfill(json={'sessionId': 'test'})
            elif path == 'message':
                route.fulfill(json={'session_id': 'test', 'thread_id': 'web:test', 'turn_id': 'turn1'})
            else:
                route.fulfill(json={})
        page.route('**/api/avatar/**', api)
        page.goto(f'http://127.0.0.1:{server.server_port}')
        page.locator('#voiceButton').click()
        page.wait_for_function('window.audioStarts.length === 1')
        page.wait_for_function("document.querySelector('#stateBadge').textContent === '待機中'")
        requests.clear()
        page.evaluate('window.audioStarts = []')
        page.locator('#messageInput').fill('実況して')
        page.locator('#messageInput').press('Enter')
        page.wait_for_timeout(100)
        def event(kind, **kwargs):
            page.evaluate('(e) => window.events.onmessage({data: JSON.stringify(e)})', {'type': kind, 'thread_id': 'web:test', 'turn_id': 'turn1', **kwargs})
        event('turn.started')
        event('message.delta', full_text='一文目です。')
        page.wait_for_function('window.audioStarts.length === 1')
        assert requests == ['一文目です。']
        event('message.delta', full_text='一文目です。二文目です。')
        page.wait_for_timeout(50)
        assert requests == ['一文目です。', '二文目です。']
        assert page.evaluate('window.audioStarts.length') == 1
        event('turn.complete', text='一文目です。二文目です。最後です<xangi_reply_suggestions>["秘密"]')
        page.wait_for_function('window.audioStarts.length === 3')
        page.wait_for_function("document.querySelector('#stateBadge').textContent === '待機中'")
        assert requests == ['一文目です。', '二文目です。', '最後です']
        starts = page.evaluate('window.audioStarts')
        assert min(b-a for a, b in zip(starts, starts[1:])) > 400
        event('turn.complete', text='一文目です。二文目です。最後です')
        page.wait_for_timeout(100)
        assert page.evaluate('window.audioStarts.length') == 3
        event('turn.started')
        event('message.delta', full_text='停止します。続きです。')
        page.wait_for_function('window.audioStarts.length === 4')
        page.keyboard.press('Escape')
        event('turn.complete', text='停止します。続きです。残りです。')
        page.wait_for_timeout(700)
        assert page.evaluate('window.audioStarts.length') == 4
        assert page.locator('#errorMessage').is_hidden()
        print(json.dumps({'result': 'passed', 'first_audio_before_complete': True, 'audio_start_intervals_ms': [round(b-a) for a,b in zip(starts, starts[1:])], 'duplicate_complete_and_escape': 'passed'}))
        browser.close()
finally:
    server.shutdown()
    server.server_close()
