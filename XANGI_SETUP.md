[English](XANGI_SETUP.en.md) | 日本語

# xangi-avatar セットアップ

## xangi拡張として追加する

xangiの拡張追加に `https://github.com/karaage0703/xangi-avatar` を指定します。取得されたディレクトリで `./scripts/prepare-update` を実行し、manifestを登録・起動します。起動時に本体から渡された接続先を使い、拡張画面の「Avatarを開く」から専用画面を開けます。更新時も同じprepare処理で依存と画面をビルドします。

既存の同じIDの暫定ランチャーがある場合は、登録と常設Avatarの設定・稼働ポートを確認してから移行を提案します。既存登録の削除やプロセス停止、設定の移動を自動実行しません。

専用データは `AVATAR_DATA_DIR`、未指定なら本体の `DATA_DIR/extensions/data/xangi-avatar`、DATA_DIRもなければ `<workspace>/.xangi/extensions/data/xangi-avatar` に置きます。キャラクター・Notion保存先・一時画像・音声環境はソース更新後も保持されます。設定はこのディレクトリの `config.env` に書き、秘密を含む場合は権限0600にします。既存の設定は自動移行しません。

既定は `127.0.0.1:4173`、リンクは同じ端末の `http://localhost:4173/` です。ポート競合時は正常起動と報告せず停止します。既存Avatarと並行する検証では `AVATAR_PORT` を変えてください。

別端末から利用する場合は、認証付きHTTPSリバースプロキシ等の接続経路を別途用意し、到達確認済みのURLを `AVATAR_PUBLIC_URL` に設定します。マイク・画面共有にはHTTPSが必要です。必要な場合だけ `AVATAR_HOST=0.0.0.0` で直接待受を広げます。Avatarの専用HTTP画面には独自の利用者認証がないため、インターネットへ直接公開しません。

音声認識・Piperのローカル環境は別途準備が必要です。既存音声環境を使う場合は `AVATAR_VOICE_ROOT`、外部音声サーバーは `AVATAR_VOICE_URL` を設定します。`npm run setup:voice -- /path/to/xangi-stackchan` も専用データ内のvoiceディレクトリを `AVATAR_VOICE_ROOT` に指定して実行できます。ブラウザ読み上げは音声サーバー不要です。

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
