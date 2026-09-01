# 個人情報・機密データの保護境界

言語: [English](privacy-sensitive-data.md) | [한국어](privacy-sensitive-data.ko.md) |
**日本語**

読み取り専用SQLはデータ変更を防ぎますが、情報開示は防ぎません。氏名、メール、
電話番号、顧客メモなどの個人情報を含むクエリ結果は、tool出力、モデル入力、モデル
回答、会話history、ログ、feedback、評価データ、チューニングexportのすべてで
機密データになります。

このため、派生リポジトリが本書の制御を完了するまで、実データの個人情報capabilityは
無効のままにします。本書はエンジニアリング基準であり、組織のプライバシー、法務、
記録管理、セキュリティ審査に代わるものではありません。

## データ区分と標準処理

| 区分 | 例 | モデル方針 | 永続化方針 |
| --- | --- | --- | --- |
| 公開 | 公開文書、公開ソース | 出典検証後に許可 | 通常の会話方針 |
| 社内 | お知らせ、集計販売数、非個人の運用情報 | 認可済みで範囲を限定したcapabilityのみ許可 | 承認時は通常の会話方針 |
| 個人情報 | 氏名、メール、電話、住所、顧客・社員識別子 | モデル送信前にmaskまたはomit | ephemeralのみ。会話、memory、feedback、評価、学習へ保存禁止 |
| 高機密 | パスワード、credential、決済情報、公的ID、健康情報 | モデルcapabilityとして登録禁止 | 別の承認workflowのみ |

氏名でなくても識別子は個人情報になり得ます。正規表現やモデルpromptだけに頼らず、
データ所有者とsource fieldを分類してください。

## 強制されるlive capability契約

登録するすべてのcapabilityは次のoutput policyを宣言します。

- `classification`: `public`、`internal`、`personal`のいずれか;
- `fields`: fieldごとの`allow`、`mask`、`omit`規則;
- `persistence`: `conversation`または`ephemeral`;
- `auditInput`: サニタイズ済み入力概要を監査イベントへ含めるか。

クエリが未宣言fieldまたはネストされた非scalar値を返すとregistryはfail-closedで
失敗します。個人情報capabilityは必ず`ephemeral`で、監査入力概要を省略しなければ
なりません。行がregistryを出る前にmaskし、監査にはactor、capability、区分、時刻、
行数、切り詰め、tenant、workspaceのmetadataだけを残します。

`assertLiveCapabilityResultPersistable`はephemeral結果の保存を拒否します。将来の
tool loopは、結果を会話history、memory、feedback、評価、チューニングデータへ
直列化する前にこのguardを必ず呼び出します。

公開例の`customers.lookupMaskedContact`は、tenantとpermissionを確認してからfakeの
個人レコードを読みます。顧客ID・氏名・メール・電話をtype markerへ置き換え、
内部メモを除外し、結果をephemeralにします。正確な連絡先値は提供しません。

## 正確な個人情報の表示

認可された社員が住所や連絡先の実値を本当に必要とする場合、その値をモデルへ送らない
でください。用途を分離したtRPC procedureで行・field認可を再確認し、構造化UI card
へ直接表示します。この応答はモデルcontextと会話historyの外に置き、短いcache方針を
適用し、値そのものではなくアクセスmetadataだけを監査します。

例えば「今週販売した車両」は車両ID、モデル、販売時刻をモデルに渡せます。「購入者の
連絡先を開く」は別permissionのUI操作であり、モデルtoolの詳細照会にはしません。

### アプリケーション準備ゲート

provider-neutralな`@arlequins/agent-core`パッケージは
`assertExactPersonalDataSourceReady`と`authorizeExactPersonalDataSource`を提供します。
派生アプリケーションは、正確な個人情報sourceを登録する直前に明示的な準備契約を
このゲートへ渡してください。契約は次をすべて要求します。

- `non-model` transportでmodel contextから除外されたversion付き構造化UI routeと、
  `data-owner`、`privacy-owner`、`security-reviewer`のいずれかの承認役割、approval ID・
  subject・source binding・policy version・日時・route/versionの証跡;
- 保持期間の上限と、短く制限されたUI cache期間;
- 識別済みのdeletion workflowを持つprovider-neutral削除port;
- 90日以内にレビューされ、次回期限が365日以内である最新のaccess review;
- 365日以内の承認で、制限された将来の有効期限を持つprivacy-owner acceptanceと、
  acceptance ID・subject・source binding・policy version・roleの証跡。

契約には`ExactPersonalDataApprovalVerifierPort`を注入しなければならず、テンプレートに
デフォルトverifierはありません。verifierは両方の承認記録を確認して完全一致する証跡を
返すか`false`を返します。false、例外、identity・role・source・route/version・policy
version・日時の不一致はfail-closedで拒否します。

validatorは`unknown`設定を受け取り、欠落・不正形式・未来日付・期限切れの証跡を
fail-closedで拒否します。デフォルト有効化や引数なしの経路はありません。承認に成功
すると、凍結されたモジュール発行のopaque permitとimmutable registration descriptorを
返します。派生source登録境界は両方を`assertExactPersonalDataAuthorizationPermit`へ渡し、
返されたdescriptor snapshotだけを使用してください。これにより登録コードは変更可能な
readinessオブジェクトを再読しません。snapshotは削除関数identityを保持し、UI route/version
と期限の証跡にpermitを結合します。コピー・偽造permitや別契約は拒否されますが、テンプレート
が派生開発者によるAPIの迂回まで防ぐことはできません。そのため、code reviewとintegration
testが引き続き必要です。

すべての契約日時はcanonical RFC3339 UTC形式
`YYYY-MM-DDTHH:mm:ss.sssZ`でなければなりません。timezoneなし、locale形式、offset、
カレンダーによって自動補正された日付は拒否します。access reviewは90日以内に行い、
次回期限は365日以内でなければなりません。privacy-owner acceptanceは365日以内の
承認で、365日を超えない将来の有効期限が必要です。
構造化UI承認は90日以内の承認で、有効期限は365日以内でなければなりません。

削除portは認証済みactorのtenant・workspace contextと明示的なpurposeを受け取ります。
派生リポジトリはintegration testで、削除が冪等で監査可能であり、承認されたすべての
複製へ伝播し、model allowlistからsourceが露出しないことを証明してください。ゲート
通過後も、正確な値をmodel context、会話history、ログ、feedback、評価または
チューニングexportへ入れてはいけません。

## Bedrock Guardrail連携

次の2値を両方設定すると、version指定済みの既存Bedrock Guardrailをすべての
Converse stream要求へ接続します。

```dotenv
BEDROCK_GUARDRAIL_ARN=arn:aws:bedrock:REGION:ACCOUNT:guardrail/GUARDRAIL_ID
BEDROCK_GUARDRAIL_VERSION=1
```

adapterは片方だけの設定を拒否します。Guardrail traceには元の値が含まれ得るため、
trace出力を要求しません。Lambdaには設定したGuardrail ARNへの
`bedrock:ApplyGuardrail`だけを許可します。

入力・出力のsensitive information policyを設定しますが、アプリケーションのfield
policyを主制御として維持します。AWS文書ではPII filterは確率的で、`tool_use`
parameter内の個人情報を対象にせず、model invocation logの元入力もmaskしません。
承認済みのログ保護設計とCloudWatch log data protectionがなければ、機密トラフィック
のinvocation loggingを無効にしてください。

- <https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-sensitive-filters.html>
- <https://docs.aws.amazon.com/bedrock/latest/userguide/usingVPC.html>
- <https://docs.aws.amazon.com/bedrock/latest/userguide/data-encryption.html>

Bedrockは顧客promptと出力をbase model学習に使いませんが、アプリケーションに保存した
会話とその複製は引き続きアプリケーションの責任です。データ配置方針に従ってin-region
endpointまたは承認済みinference profile、最小権限IAM、TLS、KMS、PrivateLinkを
使用します。

- <https://aws.amazon.com/bedrock/faqs/>
- <https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html>

## チャット・memory・チューニングの制限

標準チャット実装はユーザーとassistantのテキストを保存します。個人情報保管庫として
設計されていません。正確な個人値をpromptへ入れ、system instructionが守ると仮定して
はいけません。

個人情報テキストを受け付ける派生アプリは、レビュー済みの入出力検査port、保持期間
metadata、削除workflow、暗号化、アクセス監査、明示的な`noPersist`経路を先に追加
する必要があります。それまでは機密要求を拒否するか、構造化UIへ移します。

生の個人情報をfeedback、評価、distillation、LoRA、QLoRAなどの学習データへexport
しません。ファインチューニングモデルは学習例を再現することがあり、DB行を消しても
adapterが記憶した値は消えません。
AWSもBedrock custom modelの学習データについて同じ注意を示しています。

- <https://docs.aws.amazon.com/bedrock/latest/userguide/encryption-custom-job.html>

## 必須リクエスト経路

1. ログインを検証し、user、tenant、workspace、role、利用目的へ対応付けます。
2. 明示的capabilityを選び、自然言語から任意SQLを作らず、モデルへDB credentialを
   与えません。
3. DB・applicationの行認可を適用し、必要なcolumnだけを選びます。
4. 返却schemaを検証しfield output policyを適用します。
5. サニタイズ済みmodel rowだけを推論へ送ります。
6. 入出力Guardrailとアプリケーション出力検査を適用します。
7. policyが会話保存を明示的に許可した結果だけを保存します。
8. metadataを監査し、結果・ログ・history・feedback・学習exportに元値がないことを
   テストします。

## 本番承認チェックリスト

- [ ] データ所有者が各source fieldと利用目的を承認した。
- [ ] 認証に加えてtenant、role、record、field認可を適用する。
- [ ] 一般チャットcapabilityに個人情報・高機密columnがない。
- [ ] schema driftと未宣言columnはfail-closedで失敗する。
- [ ] 個人情報結果はmask、ephemeralで、監査入力概要に残らない。
- [ ] 正確な個人値はモデルを通らない構造化UIだけで表示する。
- [ ] sourceを有効化する直前にagent-coreの正確な個人情報準備ゲートを通過する。
- [x] テンプレートprimitiveが最新のversion付き構造化UI承認と正確な準備snapshotに
      結合されたopaque authorization permit、登録境界assertionを発行し、派生コードが
      それを使用する。
- [ ] Bedrock Guardrail入出力方針と最小権限IAMを設定・テストした。
- [ ] model invocation loggingを無効化、または別途保護・承認した。
- [ ] tenant越境、prompt injection、history・field漏えい、MCP/tool認可テストが通る。
- [ ] 会話の保持・削除、インシデント対応、アクセスレビューが運用される。
- [ ] 個人情報がmemory、feedback、評価、学習データへ入らない。

派生リポジトリですべての該当項目を通過するまで、実Aurora個人情報へのアクセスは
無効のままにします。
