[English](XANGI_SETUP.en.md) | 日本語

# xangi-avatar セットアップ

## Avatarを準備する

1. Node.js 20.19以上または22.12以上、npm、xangiが利用可能か確認します。system packageや`sudo`は自動実行しません。
2. `.env.example`を`.env`へコピーし、接続先xangiを設定します。Notion会話記録を使う場合だけ、`NOTION_API_KEY`または絶対pathの`NOTION_API_KEY_FILE`と`NOTION_CONVERSATION_PARENT_PAGE_ID`を設定します。秘密値そのものは表示しません。
3. リポジトリルートで`npm ci`、`npm run build`、`npm start`を実行します。ブラウザからlocalhostのAvatar画面を開きます。

## サンプルワークスペースでAgent作成を提案する

利用目的を聞き、同梱の`workspaces/game/`（ゲーム実況）または`workspaces/english/`（英会話）を例に、本体でAgentを作る方法を提案します。各ディレクトリの`AGENTS.md`と`README.md`を先に読み、既存のAgentとワークスペースを確認します。

1. 既存Agentを使う場合は、そのAgentをAvatarで選択します。新規作成を望む場合は、目的に合うサンプルを提示し、名前・役割・指示・AI・ワークスペースを本体のAgent設定で管理することを説明します。
2. サンプルを使うと決まった場合だけ、リポジトリルートで`npm run setup:workspaces`を実行してワークスペースを登録し、本体でAgentを作成して対象ワークスペースを割り当てます。既存Agentの設定を無断で変更しません。
3. Avatarの設定からそのAgentを選び、画像・声・マイクを設定します。Agentの名前・指示・AIはAvatarに複製しません。

セットアップ依頼だけではAgent作成や既存ワークスペースの変更を実行せず、対象と設定内容を提示して選んでもらいます。Notion会話記録はAvatar本体の任意機能です。
