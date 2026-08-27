# リモート MCP サーバー契約

API の `POST /mcp` は派生リポジトリが注入して使う保護された拡張ポイントです。
具体的な `McpServer` が注入されるまで `404 MCP Not Configured` を返し、認可
ポリシーのないツールが誤って公開されることを防ぎます。

HTTP アダプターが JSON-RPC と Bearer/OIDC セッションを検証した後、各ツールが
ユーザー・ロール・テナント範囲を再確認します。`initialize`、`tools/list`、
`tools/call` をサポートし、失敗応答にスタックトレースや秘密情報を含めません。

ライブ業務データは `createMcpToolsFromLiveCapabilities(...)` で既存 registry に
接続します。派生リポジトリが認証コンテキストから `resolveActor` と capability
ごとの JSON Schema を渡し、tenant・フィールド・行数・監査・保存ポリシーは registry
を通じて適用されます。

ツール名は移植性のある英数字・`_`・`-`・`.` のみを許可し、最大 128 文字です。
入力スキーマは JSON オブジェクトでなければなりません。capability 固有のスキーマを
省略した場合、ブリッジは未知のプロパティを拒否する閉じたオブジェクトスキーマを
既定で使用します。本番ツールでは `properties`・型・範囲を明示し、下流の検証器でも
想定外の引数を拒否してください。

ツールは型付きで結果を制限した機能だけを登録し、任意 SQL・シェル・ファイル
システム・汎用プロキシは公開しません。実運用の OAuth/OIDC issuer・audience・
鍵ローテーションは派生リポジトリで設定し、ローカル OIDC mock はテスト専用です。

バッチ失敗通知は `PipelineFailureNotifier` アダプターで SNS・Slack・PagerDuty
などへ接続できます。通知には `batchId`、時刻、再帰的にマスキングしたエラー
イベントだけを渡し、送信失敗は再試行のために伝播させます。
