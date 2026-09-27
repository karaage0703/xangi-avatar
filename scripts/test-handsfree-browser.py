import io
import os
import wave
from playwright.sync_api import sync_playwright

audio = io.BytesIO()
with wave.open(audio, 'wb') as wav:
    wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(16000)
    wav.writeframes(b'\0\0' * 8000)

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE'),
        args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
    )
    page = browser.new_page(viewport={'width': 390, 'height': 844})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script('''
      window.EventSource = class {
        constructor() { window.__emit = (data) => this.onmessage?.({data:JSON.stringify(data)}); }
        addEventListener() {}
      };
      navigator.mediaDevices.getUserMedia = async () => {
        const ctx = new AudioContext(); await ctx.resume();
        const oscillator = ctx.createOscillator(); const gain = ctx.createGain(); gain.gain.value = 0;
        const output = ctx.createMediaStreamDestination(); oscillator.connect(gain); gain.connect(output); oscillator.start();
        window.__gain = gain; window.__stream = output.stream;
        return output.stream;
      };
    ''')
    counts = {'stt': 0, 'message': 0, 'tts': 0}
    overlay_states = []
    def api(route):
        path = route.request.url
        if '/stt?' in path:
            counts['stt'] += 1
            assert len(route.request.post_data_buffer) > 100
            route.fulfill(json={'text': 'Hello'})
        elif path.endswith('/message'):
            counts['message'] += 1
            route.fulfill(json={'session_id':'test-session','thread_id':'web:test-session','turn_id':'turn-1'})
        elif path.endswith('/session'):
            route.fulfill(json={'sessionId':'test-session'})
        elif path.endswith('/tts'):
            counts['tts'] += 1
            route.fulfill(content_type='audio/wav', body=audio.getvalue())
        elif path.endswith('/overlay/state'):
            overlay_states.append(route.request.post_data_json)
            route.fulfill(json=route.request.post_data_json)
        else:
            route.continue_()
    page.route('**/api/avatar/**', api)
    page.goto(os.environ.get('AVATAR_TEST_URL', 'http://127.0.0.1:4173/') + '?character=xangi-assistant')
    page.locator('#handsFreeButton').click()
    page.wait_for_function("document.querySelector('#stateBadge').textContent.includes('話し終わる')")
    page.wait_for_timeout(1500)
    assert counts['stt'] == 0, counts
    page.evaluate('__gain.gain.value = 0.15')
    page.wait_for_timeout(700)
    page.evaluate('__gain.gain.value = 0')
    page.wait_for_function("document.querySelector('#stateBadge').textContent === '考え中…'")
    assert page.locator('.thinking-dots').is_visible()
    assert page.locator('#bubbleText').is_hidden()
    page.wait_for_timeout(300)
    assert overlay_states, overlay_states
    assert overlay_states[-1]['state'] == 'thinking', overlay_states[-1]
    assert overlay_states[-1]['text'] == '', overlay_states[-1]
    assert all('Hello' not in state['text'] for state in overlay_states), overlay_states
    assert counts['message'] == 1, counts
    assert page.evaluate('__stream.getAudioTracks()[0].enabled') is False
    page.evaluate("__emit({type:'turn.complete',thread_id:'web:test-session',turn_id:'turn-1',text:'Hello there'})")
    page.wait_for_function("document.querySelector('#avatar').dataset.state === 'speaking'")
    page.wait_for_timeout(150)
    assert overlay_states[-1]['text'] == 'Hello there', overlay_states[-1]
    assert page.locator('.thinking-dots').is_hidden()
    assert page.evaluate('__stream.getAudioTracks()[0].enabled') is False
    page.wait_for_function("document.querySelector('#stateBadge').textContent.includes('話し終わる')")
    assert counts == {'stt':1,'message':1,'tts':1}, counts
    page.locator('#handsFreeButton').click()
    assert page.evaluate('__stream.getAudioTracks()[0].readyState') == 'ended'
    page.wait_for_timeout(1500)
    assert counts['message'] == 1
    assert not errors, errors
    print('PASS: silent wait → real MediaRecorder audio + silence → STT/message → WAV playback → listening → stop releases mic', counts)
    print('mobile overflow:', page.evaluate('document.documentElement.scrollWidth > innerWidth'))
    browser.close()
