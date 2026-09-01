# Luna支援ドキュメントQAチューニングキット

[English](tuning-kit.md) · [한국어](tuning-kit.ko.md)

このキットは、レビュー済みの根拠を再利用可能なドキュメントQA行動パターンへ
変換する。レビュー済みの **train分割** は少数例プロンプトとしてすぐに利用でき、
後で別途検証したローカルの学生モデル向けJSONLにも出力できる。

`gpt-5.6-luna`は合成質問・回答候補を作る教師兼レビュー補助であり、Luna自体を
ファインチューニングする構成ではない。LunaはResponses APIとStructured Outputsを
サポートするが、ファインチューニングはサポートしない。公式の
[Lunaモデルページ](https://developers.openai.com/api/docs/models/gpt-5.6-luna)と
[評価ガイド](https://developers.openai.com/api/docs/guides/evals)を参照すること。

## 含まれる機能

- `@arlequins/tuning-kit`: 根拠、シード、候補、レビュー済みパターン、意味グループ
  単位の分割、品質ゲート、即時利用プロンプト、学習JSONL出力
- OpenAIアダプター: `gpt-5.6-luna`、`store: false`、ツールなし、厳格なJSON
  Schemaで候補を生成
- `examples/tuning/seeds.json`: 公開可能な合成シード
- `examples/tuning/reviewed-patterns.json`: 英語・日本語・韓国語のレビュー済み公開例
- `pnpm tuning:patterns:verify`: 引用、必須/禁止主張、完全重複、分割をまたぐ
  語彙的な近似重複、反復、個人情報らしい値、グループ漏洩、ホールドアウト漏洩を検査

対象行動は、根拠付き回答、根拠不足、根拠の競合、引用必須、静的文書とライブ
データの区別、コード探索、確認質問、検索文書内のプロンプトインジェクション拒否の
8種類である。

## Lunaで非公開候補を生成

Git管理外の `.env.localhost` にサーバー用キーを入れて実行する。

```bash
OPENAI_API_KEY=replace-me
pnpm tuning:patterns:generate
```

既定の出力先は `.local/tuning/luna-candidates.json` である。コマンドは
`.local/` 外への書き込みを拒否し、`--force` なしでは既存ファイルを上書きしない。
出力がローカルでも、個人情報、運用SQL行、認証情報、社内ソース、会話履歴を
ホスト型モデルへ送ってよいことにはならない。提供者のデータ処理方針と社内承認を
先に確認する。

```bash
pnpm tuning:patterns:generate -- \
  --seed examples/tuning/seeds.json \
  --output .local/tuning/luna-candidates-v2.json \
  --model gpt-5.6-luna
```

## レビューして即時利用

Lunaの出力は必ず `status: "candidate"` である。生成モデルに自己承認させない。
オーナーが各回答を有効な根拠と比較し、未裏付けの事実を削除し、同じ
`groupKey` を一つの分割だけに割り当て、レビュー担当者と時刻を記録した後にのみ
`reviewed` とする。

`compileReviewedBehaviorPrompt` はレビュー済み `train` 例だけを使う。
`validation` と `test` は除外されるため、同じ質問で実際の改善を検証できる。
生成した文字列を `AgentProfile.reviewedBehaviorPrompt` に設定すれば、重み学習なしで
すぐ適用できる。

例は回答の **振る舞い** を教えるもので、例の事実を別の質問へコピーするものではない。
ランタイムは現在の質問で取得した根拠を引き続き要求する。

自動近似重複ゲートは同じ言語内の文字 trigram 重複を比較する。誤って混入した
類似表現を検出するが、レビュー担当者が設定する意味的 `groupKey` やドメイン固有の
embedding 監査を置き換えるものではない。

## ローカル学生モデルへ拡張

`exportReviewedTrainingJsonl(batch)` はレビュー済みtrain行だけを出力するが、学習や
昇格は行わない。Ornith、Qwenなどの派生パイプラインでは、トレーナー、検証、
ホールドアウト評価、反復・未裏付け主張ガード、原子的昇格、再読み込み、ロールバックを
別途実装する。

### プロバイダー中立のweight-training契約

パッケージは、派生学生モデルパイプライン向けのdefault-deny契約も提供する。
`createTrainingDatasetIdentity` は保護された元データverifierを必須とし、localeに
依存しないNFC/code-point順でレビュー済みバッチを正規化する。train JSONL、元データ
bytes、各splitの全内容を結ぶmodule発行のfrozen identityを返す。
`validateWeightTrainingRunSpec` は外部dataset/privacy/license証拠verifier、正確な
base model・trainer hash、制限されたコスト・時間・同時実行数・lease、canonicalな
run identityから生成したidempotency keyを必須にする。

`authorizeWeightTrainingCandidate` は全ゲートに外部証拠verifierを適用し、各証拠を正確な
run・dataset・base・trainer・artifactへ結び付ける。content-addressedなartifact
locator/version、artifact/manifest hash、完全なprovenance、strictな署名検証を必須にする。
保護されたartifact resolverは不変のartifact bytes、manifest bytes、registry identityを
必ず返し、パッケージは両方のSHA-256を再計算してから、凍結したmetadata/bytes snapshotを
署名verifierへ渡す。hash関数はNode標準ライブラリのSHA-256を使い、呼び出し側から注入できない。
`assertWeightTrainingActivationReady` はreload後の提供artifact一致、新鮮で時系列順の証拠、
別のrollback対象、完全なアプリケーションRAG replayを要求する。
`authorizeWeightTraining` は不変のcandidate/activation descriptorに結び付いたpermitを発行する。
permitの期限は、両approvalの期限とartifact provenance、全gate、全activation証拠のfreshness
deadlineに加え、approval承認時刻とrun作成時刻の最大経過期限も含めた中で、最も早い時刻である。

これは契約とvalidatorだけを提供する。モデルの学習、スケジュール、保存、昇格、
reload、rollbackは行わず、元データ・承認・ゲート・署名を直接検証しない。派生レポが
外部verifier、coordinator/leaseストア、artifact registryと署名鍵、プロバイダー固有の
出力ガード、統合テストを実装する必要がある。完了して境界でpermitとdescriptorを検証する
までは、weight-trainingコマンドを公開してはならない。

推奨ループは、固定ホールドアウトの作成、Luna候補生成、人による根拠レビュー、
`pnpm tuning:patterns:verify`、基本モデルとの比較、必要時のみ学生モデル学習、そして
RAG・引用・プライバシー・遅延・反復ゲート通過後の昇格である。これにより、ユーザーの
反応が翌日に自動で重みへ変わると誤認させず、レビュー済み改善を早く利用できる。
