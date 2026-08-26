# モデルレジストリと再現評価

コアパッケージにはプロバイダーに依存しない決定的なモデルルーターがあり、
indexer には Golden Evaluation ゲートがあります。「Qwen」のような別名ではなく、
正確なモデル ID とランタイムを記録してください。

`fast`、`balanced`、`coding`、`deep` の capability とコストを登録し、
`createModelRouter(entries).select({ question })` を呼び出します。コード質問は
coding 対応モデルへ、根拠が衝突する質問は `deep` へ、予算指定時は推定コストで
候補を絞ります。

完了ユースケースには任意で `ModelSelectionPort` を注入できます。`select` は実際の
`ModelProviderPort`、モデル ID、ルートプロファイル、理由を返します。コンポジション
ルートでレジストリをプロバイダーアダプターへ接続し、チャットユースケースから SDK を
直接参照しないでください。セレクターを指定しない場合は設定済みの単一モデルを使います。

モデルの結果を無視対象の JSON に保存し、次を実行します。

```bash
pnpm pilot:evaluate -- --answers .local/evals/ollama-qwen.json
```

必須語、禁止主張、空回答、引用欠落を決定的に検査します。失敗した結果は昇格
させません。派生レポではトークンコスト、p95 レイテンシ、認可、ホールドアウトを
追加で検査してください。
