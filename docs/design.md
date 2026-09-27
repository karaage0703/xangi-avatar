[English](en/design.md) | 日本語

# xangi-avatar 設計

## 方針

xangiをAgent、Session、backend、model、workspace、message、eventの基盤とし、マイク、STT/TTS、アバター、OBS同期をxangi-avatarへ閉じ込めます。公開xangi-petsロボットを青・緑・オレンジのプリセットとして同梱し、未設定時は青を表示します。

```text
Chrome ── 音声/JPEG/テキスト ──▶ xangi-avatar server ──▶ xangi Session
   │                                      │
   ├── 操作用UI                           ├── faster-whisper medium
   └── OBS Browser Source ◀── SSE状態 ────└── Piper / VOICEVOX
```

Nodeサーバーはsame-origin proxyとして任意トークンをサーバー内に保持します。選択した本体のAgentでSessionを作成し、汎用のdevice inboxへメッセージを送ります。xangi-pets専用endpointへの依存やfallbackは持ちません。

名前・役割・指示・AI・ワークスペースは本体のAgentから取得し、Avatar独自のキャラクター指示は各turnへ追加しません。Local LLMモードと推論設定も本体Agentから引き継ぎ、Avatarから変更コマンドを送りません。

カスタムキャラクターと選択中キャラクターはNodeサーバーが`.runtime/character-settings.json`へatomicに保存し、全ブラウザへ同じ設定を返します。checkout外へ保存する場合は`AVATAR_CHARACTER_SETTINGS_FILE`で絶対pathを指定します。

## 音声・画面・吹き出し

選択した `audioinput` のdevice IDをexact制約へ渡し、機器が消えた場合だけデフォルト入力で再試行します。実際に開いたtrackのlabelをUIへ表示します。`HandsFree`は開始後0.6秒のRMS中央値から雑音床と発話閾値を決め、有音400ms、無音1秒、最長20秒で発話を区切ります。AI待機・TTS中はtrackを止め、世代番号で停止後の古い結果を破棄します。ソフト側のマイクミュートも同じ停止機構を使い、画面共有と会話Sessionを終了せず入力だけを休止します。

faster-whisperはVADで250ms未満の音を除き、`avg_logprob`、`no_speech_prob`、VAD後の発話時間を返します。ブラウザ側の品質ゲートは短すぎる音、無音確率の高い結果、低log probability、低信頼な短文をAI turnへ渡さず、そのまま聞き取りを再開します。

画面共有は音声入力から独立して開始・停止します。共有開始から停止までを1 Sessionにし、連続会話、1回録音、テキストのいずれかを送信した時だけ最大幅1280pxのJPEGを同じturnへ渡します。画像pathはxangiの `[添付ファイル]` 箇条書き形式へ変換し、Local LLMのマルチモーダル入力として送ります。本体Agentで選択したモードを維持します。

Notion会話記録はキャラクター単位のopt-inです。NodeサーバーだけがAPIキーと親ページIDを保持し、キャプチャdirectory内のJPEG/PNGだけをNotion File Upload APIへ送ります。画面付き会話Sessionごとに子ページを1枚作り、発話・返答・画像を同じentryとして直列追記します。記録処理はAI応答と読み上げを待たせず、失敗時も会話Sessionを停止しません。

設定画面にはブラウザ単位のNotion保存スイッチを置きます。OFFではキャラクターごとのopt-inを保持したまま新規保存だけを止め、ONへ戻すと同じ保存先・キャラクター設定で再開します。

会話と相対パス画像は、選択した本体Agentのワークスペースを使います。Avatarにワークスペース選択はなく、プリセットでも自動登録・自動切替しません。同梱のenglish/gameを使う場合だけ`npm run setup:workspaces`で任意登録し、本体のAgentへ設定してください。

同じrepositoryにAgent作成用のサンプルワークスペースを同梱します。Avatar本体はAgentを作成・変更しません。

応答全文を保持したまま、表示は句読点を優先して100〜260文字程度へ分割します。OBSへはborotの応答だけを同期し、プレイヤーの発話は送りません。応答待ちは三点アニメーション、応答中と応答後はborotの文章を表示します。内容領域とOBS用documentの両方を `overflow: hidden` にし、ページ番号と6.5秒の自動切替を使ってスクロールバーを映しません。吹き出しはクリック、タップ、キーボード操作で閉じられ、操作UIで閉じるとOBS表示も同時に消えます。OBSの吹き出しを直接操作した場合も共有表示を消します。

## 安全性とUI

ワークスペース画像は解決後も選択ルート内か確認します。Notionへ送れる画像はキャプチャdirectory内だけに制限します。キャプチャは0600で保存します。マイク・画面共有は利用者操作から始め、HTTPSまたはlocalhostを前提とします。

主操作、選択マイク、画面共有・連続会話・マイクミュートの各状態、listening/thinking/speakingを文字でも示します。各切替は `aria-pressed` を持ち、キーボードfocus、44px以上の操作領域、reduced motion、狭い画面の横あふれ防止を維持します。

thinking中は吹き出し内の三点をCSSだけで動かし、最初の応答deltaで本文表示へ切り替えます。これは推論requestやtimer pollingを増やさず、`prefers-reduced-motion`では既存の全体規則により動きを止めます。

青い標準画像は `src/assets/avatar-{closed,open}.png` に配置します。assistant専用workspaceは同梱しません。

## エージェント単独の会話

`/api/avatar/config`と`/api/avatar/agents`は本体のAgent一覧を読み取ります。`/api/avatar/session`は選択したagentIdの存在を確認し、`/api/sessions`へagentIdだけを渡し、本体でAgentのワークスペースを解決します。AgentのPOST/PATCHやプロジェクト生成は行いません。Avatar設定にはagentId、画像、音声を保存し、名前・役割・指示・backend/model・workspaceIdは保存しません。会話のブラウザー保存キーはキャラクターIDとAgent IDの組み合わせで分離します。

`/api/avatar/workspace-image`はagentIdと相対pathを受け取り、本体Agentの現在のworkspaceIdから画像を解決します。ブラウザーのworkspaceIdは採用せず、不明なAgentや削除済みworkspaceはエラーにします。ルート外参照・画像形式の検査は維持します。

音声設定の言語は音声認識・読み上げ用です。


実行モデル表示はsession statusのmodelExecutionを参照する。応答完了・会話復帰時に更新し、会話切替前の遅延レスポンスは破棄する。設定モデルをprovider確認済みモデルとして扱わず、Autoの非公開内部モデルも推定しない。
