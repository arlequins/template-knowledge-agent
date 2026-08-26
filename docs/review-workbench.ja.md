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

## 日次ループ

オーナーのレビュー後に実行します。

```bash
pnpm tuning:patterns:daily
```

引用、重複、反復文、機密らしい値、意味グループ分離、8種類の振る舞い、
3言語、検証/テストのホールドアウトを検査します。合格したレビュー済み
パックだけを `.local/tuning/active-behavior-pack.json` に原子的に書き込みます。
失敗時は前のアクティブパックを変更しません。
