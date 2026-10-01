[日本語](../usage.md) | English

# xangi-avatar Usage

Copy `.env.example` to `.env`, run `npm run setup:voice -- /path/to/xangi-stackchan` once, then `npm run build && npm start`. `XANGI_TOKEN` is optional and needed only when xangi requires bearer authentication. faster-whisper uses `medium` by default.

Conversations and relative avatar images use the selected xangi agent’s workspace. Avatar has no workspace selector and never automatically registers or switches preset workspaces. Optionally run `npm run setup:workspaces` to register the bundled english/game samples, then assign one to the agent in xangi.

Open Settings to select an input microphone. The UI shows the track that was actually opened; a disconnected device falls back to the system default. Continuous conversation pauses during the AI reply and TTS, then resumes. Screen sharing starts without opening the microphone and can be combined independently with continuous conversation, one-shot recording, or text input. While sharing, each sent message includes a frame captured at send time. The microphone mute control pauses input without ending screen sharing or the conversation session.

Hands-free mode measures ambient volume for about 0.6 seconds whenever listening starts, then adapts its speech threshold. Very short audio and transcripts that Whisper marks as silence or low confidence are not sent to the AI. The UI shows the accepted transcript and active microphone. Avoid speaking during calibration and select a microphone that does not directly capture game audio when possible.

On a phone, press **Test voice** once to enable audio playback. Later Piper and VOICEVOX replies reuse the same unlocked audio path. If the browser or operating system suspends audio again, press **Test voice** once more.

Set Local LLM `agent` or `chat` mode on the xangi agent. Avatar does not override it. Attached frames are used silently as model input, and only the short answer is spoken. The three-dot waiting animation is browser-only and adds no AI work.

To enable optional Notion conversation logs, set `NOTION_API_KEY` (or `NOTION_API_KEY_FILE` with an absolute path to a mode-0600 token file). `NOTION_CONVERSATION_PARENT_PAGE_ID` can provide the initial destination; after startup, paste a Notion page URL or ID into the settings dialog to change it. The Web UI stores the validated destination in `.runtime/notion-settings.json` and applies it to the next log without a restart. The API key is never returned to the browser. Then enable the per-character checkbox. Each screen-conversation session creates a child page and asynchronously appends the timestamp, user transcript, avatar reply, and current image. It is off by default and never records image-free normal conversation.

The settings dialog also has a global Notion-saving switch. It pauses or resumes logging for the current browser without deleting the destination or existing logs.

Create an agent in xangi and configure its name, role, instructions, and AI there. In Avatar settings, duplicate a preset and select that agent. Refresh the agent list after creating or editing agents in xangi. Avatar manages images and voice. Local LLM mode and reasoning settings belong to the xangi agent. Missing or deleted agents block conversation creation with a selection prompt.

Custom characters and the current selection are stored on the DGX server in `.runtime/character-settings.json` and shared by browsers connected to the same xangi-avatar instance. Set `AVATAR_CHARACTER_SETTINGS_FILE` to an absolute shared path when multiple checkouts must use the same settings.

For OBS, keep the control Chrome window open and add:

```text
http://localhost:4173/?view=character&background=transparent
http://localhost:4173/?view=bubble&background=transparent
```

Capture Google Chrome audio with OBS macOS Audio Capture. Long replies paginate without scrollbars. See the [Japanese guide](../usage.md) for screen-capture details.
The bubble source shows only avatar replies, never player speech. It shows a three-dot animation while waiting for the reply. Backend and model come from the selected xangi agent. Local LLM mode and reasoning settings also come from the agent.

## Play-memory integration

The game commentary and English conversation sample workspaces can help you create an xangi agent. Follow [XANGI_SETUP.en.md](../../XANGI_SETUP.en.md) for setup.

### Bundled avatars

Closed/open PNGs live in `workspaces/<english|game>/assets/xangi-avatar/<english|game>/`. Bundled images work before workspace registration. Empty image fields use the blue default. Keep other characters in your own workspace, outside this repository. The bundled robot artwork is the project author’s own work and is distributed under the same [MIT license](../../LICENSE) as the code. User-added artwork remains subject to the terms set by its respective rights holders.

With controls visible, the panel sits below the complete character. Short screens can scroll the page. Hidden-control and OBS views keep their existing layout.

Blue default images live in `src/assets/avatar-{closed,open}.png`. No assistant workspace is bundled.

If an image is missing, corrupt, or unavailable, the idle and open-mouth images independently fall back to their bundled defaults. Each image field in character settings shows its load status, updates when the path or Agent changes, and can be retried with the image recheck button. The configured path is preserved so it can be retried after adding the file. Image failures do not stop conversation or audio.

OBS character views fit the complete image within both source dimensions, with space for animated movement.

The xangi agent controls language, length, and style. Avatar does not add its own character instructions to messages.


## Characters and agents

Avatar references an existing xangi agent by ID; it never creates or updates agents or projects.

Voice language affects speech recognition and speech synthesis only.


The header shows the backend and model recorded for the latest response by the host, not the assistant’s self-report. Configuration-only values are marked unverified; missing records remain unknown. Starting a new conversation or switching characters resets the display.

## Incremental speech

Replies start speaking at punctuation or newlines before the full response is complete. The next part is synthesized while the previous audio plays. This works with Piper, VOICEVOX and browser speech without extra settings. Backends that only return complete text start the pipeline after that text arrives. Continuous conversation resumes microphone input after the last audio ends. Press Escape to stop playing and queued speech.
