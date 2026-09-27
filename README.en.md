# xangi-avatar

[日本語](README.md)

A browser-based 2D avatar for voice and text conversations with xangi, including continuous conversation with a shared screen and OBS streaming.

The public xangi-pets robot is the default avatar: blue for the assistant, green for the English coach, and orange for the game partner. No image configuration is required. Users can duplicate a built-in preset or their own character and freely configure an existing xangi agent, images, STT, and TTS. Names, roles, instructions, workspace, and AI settings are managed by the agent in xangi. User-specific avatar images live in each xangi workspace.

## Features

- Selectable microphone with faster-whisper `medium` by default
- Use the same xangi agent as Web Chat without overwriting its settings
- Independently controlled continuous conversation, screen sharing, and microphone mute
- Optional image-backed conversation logs in Notion with the user transcript and avatar reply
- Piper, VOICEVOX, or browser TTS with lip sync
- Long speech bubbles split into pages without scrollbars
- Separate character and speech-bubble OBS Browser Sources

## Quick start

Node.js 20.19+ or 22.12+ is required.

```bash
npm install
cp .env.example .env
npm run setup:workspaces
npm run build
npm start
```

The default URL is `http://localhost:4173`; the default xangi endpoint is `http://127.0.0.1:18888`. Microphone and screen capture require HTTPS or localhost.

Conversations and relative avatar images use the selected xangi agent’s workspace. Avatar has no workspace selector and never automatically registers or switches preset workspaces. Optionally run `npm run setup:workspaces` to register the bundled english/game samples, then assign one to the agent in xangi.

See [XANGI_SETUP.en.md](XANGI_SETUP.en.md) to propose an agent using a bundled sample workspace.

## Documentation

- [Usage](docs/en/usage.md)
- [Design](docs/en/design.md)

## License

MIT

### Bundled avatars

Closed/open PNGs live in `workspaces/<english|game>/assets/xangi-avatar/<english|game>/`. Bundled images work before workspace registration. Empty image fields use the blue default. Keep other characters in your own workspace, outside this repository. The bundled robot artwork is the project author’s own work and is distributed under the same [MIT license](LICENSE) as the code. User-added artwork remains subject to the terms set by its respective rights holders.

Blue default images live in `src/assets/avatar-{closed,open}.png`. No assistant workspace is bundled.
