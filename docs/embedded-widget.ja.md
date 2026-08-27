# 埋め込みチャット契約

派生リポジトリでは、スタンドアロンと同じ workspace チャットを `/embed`
iframe で提供できます。親 origin をサーバー側で完全一致の allowlist にし、
API bearer 認証、workspace 所属、CORS、レート制限、監査ログを維持してください。

テンプレートは cross-origin のトークン受け渡しを実装しません。トップレベルの
ポップアップコールバックを追加する場合は、厳密な `targetOrigin`、state/nonce
検証、短命の一回限りコード、リプレイ防止、監査イベントを必須にします。未検証の
`postMessage` に access token を入れないでください。業務データは[個人情報境界](privacy-sensitive-data.md)
を確認してから有効化します。
