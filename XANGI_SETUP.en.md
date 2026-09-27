[日本語](XANGI_SETUP.md) | English

# xangi-avatar setup

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
