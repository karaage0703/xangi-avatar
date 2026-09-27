[日本語](XANGI_SETUP.md) | English

# xangi-avatar setup

## Add as a xangi extension

Enter `https://github.com/karaage0703/xangi-avatar` in xangi's extension installer. Run `./scripts/prepare-update` in the downloaded directory, then register and start the manifest. The managed runtime inherits the host xangi URL. Open the extension UI and select “Avatarを開く” to open the dedicated Avatar page. Updates run the same dependency installation and build step.

If a temporary launcher with the same ID already exists, inspect its registration, running port and settings before proposing migration. Do not automatically remove the registration, stop an existing process or move settings.

Persistent data uses `AVATAR_DATA_DIR`, otherwise `DATA_DIR/extensions/data/xangi-avatar`, or `<workspace>/.xangi/extensions/data/xangi-avatar` when DATA_DIR is unset. Character settings, Notion destination, captures and voice files survive source updates. Put configuration in `config.env` inside this data directory (mode 0600 when it contains secrets). Existing settings are not automatically migrated.

The default listener is `127.0.0.1:4173`; the launcher opens `http://localhost:4173/` on the same computer. Port conflicts fail startup. Use `AVATAR_PORT` for side-by-side testing.

For another device, configure an authenticated HTTPS reverse proxy and set a verified `AVATAR_PUBLIC_URL`. Microphone and screen sharing require HTTPS. Only set `AVATAR_HOST=0.0.0.0` when wider listening is needed. The dedicated Avatar server has no user authentication of its own; do not expose it directly to the Internet.

Speech recognition and local Piper need separate setup. Set `AVATAR_VOICE_ROOT` for existing voice assets or `AVATAR_VOICE_URL` for an external voice server. When running `npm run setup:voice -- /path/to/xangi-stackchan`, set `AVATAR_VOICE_ROOT` to the persistent voice directory. Browser speech does not need a voice server.

## Prepare Avatar

1. Check that Node.js 20.19+ or 22.12+, npm, and xangi are available. Do not install system packages or use `sudo` automatically.
2. Copy `.env.example` to `.env` and configure the target xangi instance. Only if you want Notion conversation logs, set `NOTION_API_KEY` or an absolute `NOTION_API_KEY_FILE`, plus `NOTION_CONVERSATION_PARENT_PAGE_ID`. Never print secret values.
3. Run `npm ci`, `npm run build`, and `npm start` from the repository root. Open the Avatar UI from localhost.

## Propose an agent using a sample workspace

Ask what the user wants to do and propose creating an xangi agent using the bundled `workspaces/game/` (game commentary) or `workspaces/english/` (English conversation) sample. Read each sample's `AGENTS.md` and `README.md` first, then inspect existing agents and workspaces.

1. If an existing agent fits, select it in Avatar. If the user wants a new one, suggest a sample and explain that its name, role, instructions, AI, and workspace belong in xangi's agent settings.
2. Only after the user chooses a sample, run `npm run setup:workspaces` from the repository root to register the workspaces. Create the agent in xangi and assign the selected workspace. Do not change an existing agent's settings without permission.
3. Select that agent in Avatar, then configure its image, voice, and microphone. Do not duplicate its name, instructions, or AI settings in Avatar.

The setup request alone does not authorize creating an agent or changing an existing workspace. Show the target and proposed settings before making those changes. Notion conversation logging is an optional feature of Avatar itself.
