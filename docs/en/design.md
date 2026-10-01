[日本語](../design.md) | English

# xangi-avatar Design

xangi owns agents, sessions, backends, models, workspaces, messages, and events. xangi-avatar owns browser capture, microphone selection, STT/TTS, rendering, and OBS synchronization. The public xangi-pets robot is bundled in blue, green, and orange; blue is the unconfigured default.

The Node server is a same-origin proxy. It creates a session using the selected xangi agent, then sends messages through the generic device inbox. It has no dependency on or fallback to the xangi-pets endpoint. A missing selected microphone falls back to the system default, while the actual opened track label is shown in the UI. Hands-free mode calibrates its RMS speech threshold from 0.6 seconds of ambient audio, requires 400 ms of voice, pauses during AI and TTS work, and discards stale results after stopping. Software microphone mute uses the same pause mechanism, keeping screen sharing and the conversation session active while input is disabled.

The selected xangi agent owns its name, role, instructions, workspace, and AI settings. Avatar adds no character instructions to messages. Local LLM mode and reasoning settings also come from the xangi agent; Avatar sends no override commands. While waiting, the bubble renders a CSS-only three-dot indicator that stops under `prefers-reduced-motion` and is replaced by the first response delta.

The Node server atomically stores custom characters and the selected character in `.runtime/character-settings.json`, then returns the same settings to every browser. `AVATAR_CHARACTER_SETTINGS_FILE` can place the file outside the checkout.

faster-whisper applies VAD and returns speech duration, average log probability, and no-speech probability. A client-side quality gate rejects very short audio, probable silence, and low-confidence short transcripts before an AI turn is created.

Screen sharing starts and stops independently from microphone input. It creates one session for the sharing interval but captures nothing until the user sends continuous speech, a one-shot recording, or text. That turn receives one downscaled JPEG captured at send time. The image path uses xangi's bulleted `[添付ファイル]` format so Local LLM receives it as multimodal input while preserving the mode selected on the xangi agent. Optional per-character Notion logging creates one child page per screen-sharing session and appends the timestamp, transcript, reply, and image without blocking the conversation. The API key and parent page ID stay on the Node server, and only files inside the capture directory are accepted. A browser-local switch pauses new Notion writes without deleting the destination or per-character opt-in. Bubbles retain the full response but split visible text at punctuation, automatically page, and clip content instead of displaying scrollbars. Only the avatar response is synchronized to OBS; user speech is never published. OBS shows the three-dot animation while waiting, then the avatar response. Overlay documents disable overflow as well as hiding content overflow. Clicking, tapping, or keyboard-activating a bubble dismisses it; dismissing it in the control UI also clears OBS, while interacting with the OBS bubble clears the shared display.

The same repository bundles sample workspaces for creating agents. Avatar does not create or modify agents.

Conversations and relative avatar images use the selected xangi agent’s workspace. Avatar has no workspace selector and never automatically registers or switches preset workspaces. Optionally run `npm run setup:workspaces` to register the bundled english/game samples, then assign one to the agent in xangi.

Blue default images live in `src/assets/avatar-{closed,open}.png`. No assistant workspace is bundled.

## Agent-only conversations

`/api/avatar/config` and `/api/avatar/agents` read the agent list. `/api/avatar/session` validates the selected agentId and passes only agentId to `/api/sessions`. Avatar never creates or updates agents or projects. Settings store agentId, images and voice rather than names, roles, instructions, backend/model, or workspaceId. Browser session keys use a new namespace and the character/agent ID pair; old conversations and agents remain on the server but are not automatically resumed.

`/api/avatar/workspace-image` takes agentId and a relative path and resolves the agent’s current workspace on the server. Client-supplied workspaceId is ignored. Unknown agents or workspaces return errors; path containment and image validation remain enforced.

Voice language affects speech recognition and speech synthesis only.


Execution model display reads modelExecution from session status. Refresh on response completion and session restore; discard delayed responses from previous sessions. Configuration and Auto selection are never treated as provider-confirmed internal models.

## Managed Extension

`server/extension.mjs` owns the dedicated Avatar HTTP child process and exposes an authenticated loopback management endpoint for health and the launcher page. SSE, audio and screen sharing use the dedicated page, rather than the host extension UI proxy. The dedicated listener defaults to loopback. Parent shutdown terminates Avatar and its voice worker. Settings, Notion destination and captures live in a persistent directory outside the checkout.

## Incremental speech

Each response owns an ordered speech queue. Cumulative `message.delta` text is split at punctuation and newlines; `turn.complete` flushes the remaining text without repeating committed chunks. Server synthesis runs sequentially while playback of the previous chunk continues. Piper, VOICEVOX and browser speech share the queue. Complete-only backends are split when their response arrives; this does not reduce model time to first text.

The microphone stays paused between chunks until both generation and playback finish. Stop, session changes and errors discard queued audio, abort synthesis requests and stop current playback. Reply suggestion tags, including partial streamed tags, are withheld. If a backend rewrites committed text, intermediate revisions are withheld and the final replacement is spoken once, preserving final answers that differ from tool commentary. Some repetition is possible because prior speech cannot be retracted.

Whitespace-only completion changes are matched against committed speech. A final answer already emitted as the suffix of streamed commentary is not repeated.
