# オーナーレビューワークベンチと日次プロモーション

`needs-investigation` のフィードバックはワークスペース単位の調査項目と
して保存されます。オーナーは元の回答を確認し、根拠を検証した修正文と
メモを記録して承認または却下します。隠れた推論は保存・表示せず、最終
回答、根拠 ID、監査可能なレビュー記録だけを保持します。

## API

- `agent.investigations`: オーナー専用のキュー（既定 `queued`、最大100件）
- `agent.reviewInvestigation`: オーナー専用の承認/却下。`correctedAnswer`、
  `evidenceIds`、`requiredTerms`、`forbiddenClaims`、`resolution` を受け取ります。

DB と S3 の両アダプターは同じ契約を実装します。すべての変更でワーク
スペース所有権を確認し、改変不能な監査イベントを追加します。監査
メタデータに本文、秘密、個人情報を入れないでください。

## 承認済み調査のエクスポート

承認済みの調査は、オーナーが修正文と同じワークスペースのドキュメント
チャンク ID を1つ以上指定するまで学習データになりません。エクスポータ
は `approved` の項目だけを読み、会話から元の質問を再取得し、認可済みの
チャンクを結合します。根拠がない項目や重複項目はスキップし、結果を
`.local/` 配下へ原子的に書き込みます。

```bash
AGENT_WORKSPACE_ID=<workspace-uuid> \
AGENT_OWNER_USER_ID=<owner-user-uuid> \
pnpm tuning:patterns:export-approved
```

`added` と `skipped` の件数で結果を確認してください。公開サンプルは
変更しません。生成したパックを通常の昇格ゲートへ渡します。

```bash
pnpm tuning:patterns:daily -- \
  --input .local/tuning/reviewed-with-feedback.json
```

スケジュール実行では、2つの処理を順番に行い DB 接続も閉じる統合コマンド
を利用できます。

```bash
AGENT_WORKSPACE_ID=<workspace-uuid> \
AGENT_OWNER_USER_ID=<owner-user-uuid> \
pnpm tuning:patterns:daily:with-feedback -- \
  --provider ollama \
  --model qwen2.5:3b \
  --runtime ollama \
  --quantization q4_K_M
```

モデル引数は任意ですが、指定すると提供元、モデル ID、ランタイム、量子化が
アクティブマニフェストに記録されます。これにより、同じ別名を持つ
Bedrock・ホステッド・ローカルモデルを混同せず、日次評価を再現できます。

成功したマニフェストを実行中の API が使うには、別途明示的な reload/deploy
が必要です。

レビュー画面にはドキュメント/チャンク API が返す UUID を入力します。
根拠が空の項目は意図的に除外され、非公開本文がそのまま日次パックへ
流入することを防ぎます。

## 日次ループ

オーナーのレビュー後に実行します。

```bash
pnpm tuning:patterns:daily
```

引用、重複、反復文、機密らしい値、意味グループ分離、8種類の振る舞い、
3言語、検証/テストのホールドアウトを検査します。合格したレビュー済み
パックだけを `.local/tuning/active-behavior-pack.json` に原子的に書き込みます。
失敗時は前のアクティブパックを変更しません。マニフェストにはソースハッシュ、
バージョン、メトリクス、学習行数、学習専用プロンプト、および指定時の正確な
モデルランタイム情報が含まれます。
