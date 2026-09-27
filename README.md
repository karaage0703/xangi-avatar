# xangi-avatar

[English](README.en.md)

xangiと音声・テキストで会話できるブラウザ2Dアバターです。通常会話、共有画面を見ながらの会話、OBS配信に対応します。

xangi-petsの公開ロボットを標準アバターとして同梱しています。設定なしでは青、英会話コーチは緑、ゲーム実況パートナーはオレンジです。利用者はプリセットまたは自分で作成したキャラクターを複製し、本体のAgentを選択し、画像、音声認識・音声合成を設定できます。名前・役割・指示・AI・ワークスペースは本体のAgentで管理します。ユーザー固有の画像は各xangiワークスペースへ配置します。

## 主な機能

- 選択したマイクからfaster-whisper（既定 `medium`）で音声認識
- 本体のAgentをWebチャットと共用し、Avatarから設定を上書きせずに会話
- 独立して切り替えられる連続会話・画面共有・マイクミュート
- 任意で、画面・発話・AI返答をNotionの画像付き会話記録へ自動保存
- Piper / VOICEVOX / ブラウザ音声による読み上げと口パク
- スクロールを使わない、長文の自動ページ送り吹き出し
- OBS用のキャラクター・吹き出し個別Browser Source

## クイックスタート

Node.js 20.19以上または22.12以上が必要です。

```bash
npm install
cp .env.example .env
npm run setup:workspaces
npm run build
npm start
```

既定のURLは `http://localhost:4173`、接続先xangiは `http://127.0.0.1:18888` です。マイクと画面共有にはHTTPSまたはlocalhostが必要です。
会話と相対パス画像は、選択した本体Agentのワークスペースを使います。Avatarにワークスペース選択はなく、プリセットでも自動登録・自動切替しません。同梱のenglish/gameを使う場合だけ`npm run setup:workspaces`で任意登録し、本体のAgentへ設定してください。

同梱サンプルワークスペースを使ったAgent作成の提案は[XANGI_SETUP.md](XANGI_SETUP.md)を参照してください。

## ドキュメント

- [使い方・OBS設定](docs/usage.md)
- [設計](docs/design.md)

## 開発

```bash
npm test
npm run build
npm audit
```

## License

MIT

### 同梱アバター

各プリセットの口閉じ・口開きPNGは `workspaces/<english|game>/assets/xangi-avatar/<english|game>/` にあります。登録前でも同梱画像を表示できます。画像欄が空なら青の標準画像を使います。別キャラクターの画像はリポジトリへ追加せず、利用者のワークスペースへ配置してください。同梱ロボット画像は作者自身の作品で、コードと同じ [MITライセンス](LICENSE) で配布します。利用者が追加する画像には、それぞれの権利者が定めた利用条件が適用されます。

青い標準画像は `src/assets/avatar-{closed,open}.png` に配置します。assistant専用workspaceは同梱しません。

拡張追加にはこのリポジトリのURLを指定してください。[拡張セットアップ](XANGI_SETUP.md)に、専用画面の起動・別端末からのHTTPS接続・既存ランチャーからの移行手順があります。
