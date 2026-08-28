# Feature-Sliced Clean Architecture

このテンプレートは二つの規則を組み合わせます。

- **Clean Architecture** は、ポリシーが配信、永続化、クラウド、モデル
  プロバイダーに依存しないよう依存方向を定めます。
- **Feature-Sliced Design (FSD)** は、一つの業務能力を名前付きスライスに
  集約し、所有範囲を明確にします。

## 標準スライス

新しい機能は `pnpm gen:feature` で作成します。

```text
packages/service/src/features/<feature>/
  domain.ts
  application/ports/<feature>-port.ts
  application/use-cases/<feature>.ts
  <feature>.test.ts

packages/trpc/src/features/<feature>/
  adapters/<feature>.ts
  composition.ts
  router.ts
```

サービススライスはフレームワークから独立させます。tRPC スライスは配信
アダプターでありサービスを利用できますが、ルーターから DB や SDK を直接
呼び出してはいけません。具体的な永続化を知るのはポートを実装する
アダプターだけです。

## 依存方向

```text
domain <- application <- composition <- adapters
                                      <- router
```

ドメインは純粋な規則、アプリケーションはドメイン・ポートとフレームワーク非依存の共通契約、アダプターは
外部 I/O、ルーターは入出力変換を担当します。スライス間で内部ファイルを
直接 import せず、公開ポートまたは共有ドメイン契約を composition root で
接続します。

`pnpm architecture:check` がこの境界を検査します。既存サンプルの
`src/router` と `src/adaptors` は互換性のため残っていますが、新規コードは
`features/<name>/adapters` を使用します。

## 変更の進め方

最初にドメインの入力・結果を定義し、外部効果ごとにポートとユースケースの
テストを追加します。アダプターではエラー、タイムアウト、認可失敗を確認し、
ルーターには明示的な入出力スキーマを置きます。変更には機能契約と文書を
同時に追加し、`pnpm architecture:check`、`pnpm check`、`pnpm typecheck`、
関連テストを実行してください。

既存機能を移行するときは、まず契約テストを固定し、一つの機能ずつ新しい
スライスが旧ハンドラーを委譲するように段階的に切り替えます。全体を一度に
書き直さないことが、派生リポジトリの安定性を守ります。
