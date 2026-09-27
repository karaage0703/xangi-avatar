import io
import json
import os
import wave

from playwright.sync_api import sync_playwright


audio = io.BytesIO()
with wave.open(audio, "wb") as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(16000)
    wav.writeframes(b"\0\0" * 8000)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        executable_path=os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE"),
        args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
    )
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.add_init_script(
        """
        window.EventSource = class {
          constructor() { window.__emit = (data) => this.onmessage?.({data:JSON.stringify(data)}); }
          addEventListener() {}
        };
        const audioContext = new AudioContext();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        gain.gain.value = 0;
        const audioOutput = audioContext.createMediaStreamDestination();
        oscillator.connect(gain); gain.connect(audioOutput); oscillator.start();
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 360;
        canvas.getContext('2d').fillRect(0, 0, 640, 360);
        const screenStream = canvas.captureStream(1);
        window.__gain = gain;
        window.__micStream = audioOutput.stream;
        window.__screenStream = screenStream;
        navigator.mediaDevices.getUserMedia = async () => audioOutput.stream;
        navigator.mediaDevices.getDisplayMedia = async () => screenStream;
        """
    )
    counts = {"stt": 0, "frame": 0, "message": 0, "tts": 0}
    sent = {"prompts": []}

    def api(route):
        path = route.request.url
        if "/stt?" in path:
            counts["stt"] += 1
            route.fulfill(json={"text": "次はどこへ行けばいい？"})
        elif path.endswith("/frame"):
            counts["frame"] += 1
            assert route.request.header_value("content-type") == "image/jpeg"
            assert len(route.request.post_data_buffer) > 100
            route.fulfill(json={"imagePath": "/workspace/frame.jpg"})
        elif path.endswith("/message"):
            counts["message"] += 1
            sent["prompts"].append(json.loads(route.request.post_data)["text"])
            route.fulfill(
                json={
                    "session_id": "screen-session",
                    "thread_id": "web:screen-session",
                    "turn_id": f"turn-{counts['message']}",
                }
            )
        elif path.endswith("/session/close"):
            route.fulfill(json={"ok": True})
        elif path.endswith("/session"):
            route.fulfill(json={"sessionId": "screen-session"})
        elif path.endswith("/tts"):
            counts["tts"] += 1
            route.fulfill(content_type="audio/wav", body=audio.getvalue())
        else:
            route.continue_()

    page.route("**/api/avatar/**", api)
    base_url = os.environ.get("AVATAR_TEST_URL", "http://127.0.0.1:4173/")
    page.goto(base_url + "?character=game-partner")
    page.locator("#screenConversationButton").click()
    page.wait_for_function(
        "document.querySelector('#screenConversationButton').getAttribute('aria-pressed') === 'true'"
    )
    assert counts == {"stt": 0, "frame": 0, "message": 0, "tts": 0}
    assert page.locator("#handsFreeButton").get_attribute("aria-pressed") == "false"
    assert page.evaluate("__micStream.getAudioTracks()[0].enabled") is True

    page.locator("#messageInput").fill("この画面は何？")
    page.locator("#messageForm button[type=submit]").click()
    page.wait_for_function("document.querySelector('#bubbleText').textContent === 'あなた: この画面は何？'")
    for _ in range(50):
        if counts["message"] == 1:
            break
        page.wait_for_timeout(100)
    assert counts["frame"] == 1
    assert counts["message"] == 1
    assert "利用者の発話: この画面は何？" in sent["prompts"][0]
    page.evaluate(
        "__emit({type:'turn.aborted',thread_id:'web:screen-session',turn_id:'turn-1'})"
    )
    page.wait_for_function("document.querySelector('#avatar').dataset.state === 'idle'")

    page.locator("#handsFreeButton").click()
    page.wait_for_function(
        "document.querySelector('#stateBadge').textContent.includes('話し終わる')"
    )

    page.evaluate("__gain.gain.value = 0.15")
    page.wait_for_timeout(700)
    page.evaluate("__gain.gain.value = 0")
    page.wait_for_function(
        "document.querySelector('#bubbleText').textContent === 'あなた: 次はどこへ行けばいい？'",
        timeout=10_000,
    )
    for _ in range(50):
        if counts["message"] == 2:
            break
        page.wait_for_timeout(100)

    assert counts["stt"] == 1
    assert counts["frame"] == 2
    assert counts["message"] == 2
    assert page.locator('.thinking-dots').is_visible()
    assert page.locator('#bubbleText').is_hidden()
    assert "利用者の発話: 次はどこへ行けばいい？" in sent["prompts"][1]
    assert "[添付ファイル]\n  - /workspace/frame.jpg" in sent["prompts"][1]
    assert page.evaluate("__micStream.getAudioTracks()[0].enabled") is False

    page.evaluate(
        "__emit({type:'turn.complete',thread_id:'web:screen-session',turn_id:'turn-2',text:'右の道へ進みましょう。'})"
    )
    page.wait_for_function("document.querySelector('#avatar').dataset.state === 'speaking'")
    assert page.locator('.thinking-dots').is_hidden()
    page.wait_for_function(
        "document.querySelector('#stateBadge').textContent.includes('話し終わる')"
    )
    assert counts["tts"] == 1

    page.locator("#microphoneMuteButton").click()
    assert page.locator("#microphoneMuteButton").get_attribute("aria-pressed") == "true"
    assert page.evaluate("__micStream.getAudioTracks()[0].enabled") is False
    assert "ミュート中" in page.locator("#handsFreeStatus").text_content()
    page.locator("#microphoneMuteButton").click()
    page.wait_for_function(
        "document.querySelector('#stateBadge').textContent.includes('話し終わる')"
    )

    page.locator("#screenConversationButton").click()
    assert page.evaluate("__screenStream.getVideoTracks()[0].readyState") == "ended"
    assert page.evaluate("__micStream.getAudioTracks()[0].readyState") == "live"
    page.locator("#handsFreeButton").click()
    assert page.evaluate("__micStream.getAudioTracks()[0].readyState") == "ended"
    assert not errors, errors
    print(
        "PASS: screen share stays independent; text and continuous speech attach frames; mute pauses input",
        counts,
    )
    browser.close()
