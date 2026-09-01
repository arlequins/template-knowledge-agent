# 개인정보 및 민감정보 보호 경계

언어: [English](privacy-sensitive-data.md) | **한국어** |
[日本語](privacy-sensitive-data.ja.md)

읽기 전용 SQL은 데이터 변경을 막지만 정보 공개를 막지는 않는다. 이름, 이메일,
전화번호, 고객 메모 등 개인정보가 포함된 쿼리 결과는 tool 출력, 모델 입력, 모델
응답, 대화 history, 로그, feedback, 평가 데이터, 파인튜닝 export를 거치는 모든
위치에서 민감정보가 된다.

따라서 이 템플릿은 파생 저장소가 이 문서의 통제를 완성할 때까지 실제 개인정보
capability를 비활성화한다. 이 문서는 엔지니어링 기준이며 회사의 개인정보·법무·
기록관리·보안 검토를 대신하지 않는다.

## 데이터 등급과 기본 처리

| 등급 | 예시 | 모델 정책 | 저장 정책 |
| --- | --- | --- | --- |
| 공개 | 공개 문서와 공개 소스 | 출처 검증 후 허용 | 일반 대화 정책 |
| 사내 | 공지, 집계 판매량, 개인정보가 없는 운영 정보 | 권한과 범위가 제한된 capability로 허용 | 승인된 경우 일반 대화 정책 |
| 개인정보 | 이름, 이메일, 전화, 주소, 고객·직원 식별자 | 모델 전송 전에 마스킹하거나 제거 | 일시적 처리만 허용; 대화·memory·feedback·평가·학습 저장 금지 |
| 고도 민감정보 | 비밀번호, credential, 결제정보, 신분증, 건강정보 | 모델 capability로 등록 금지 | 별도 승인 workflow만 허용 |

이름이 아니어도 식별자는 개인정보일 수 있다. 정규식이나 모델 prompt에만 의존하지
말고 데이터 소유자와 함께 원본 field를 분류한다.

## 강제되는 live capability 계약

등록되는 모든 capability는 다음 output policy를 선언한다.

- `classification`: `public`, `internal`, `personal` 중 하나;
- `fields`: field별 `allow`, `mask`, `omit` 규칙;
- `persistence`: `conversation` 또는 `ephemeral`;
- `auditInput`: 정제된 입력 요약의 감사 로그 포함 여부.

쿼리가 선언되지 않은 field나 중첩된 비-scalar 값을 반환하면 registry는 fail-closed로
실패한다. 개인정보 capability는 반드시 `ephemeral`이고 감사 입력 요약을 생략해야
한다. 행이 registry 밖으로 나가기 전에 마스킹하며, 감사 로그에는 actor, capability,
등급, 시간, 행 수, 잘림 여부, tenant, workspace metadata만 남긴다.

`assertLiveCapabilityResultPersistable`은 ephemeral 결과의 저장을 거부한다. 향후 tool
loop는 결과를 대화 history, memory, feedback, 평가, 파인튜닝 데이터로 직렬화하기
전에 이 guard를 반드시 호출해야 한다.

공개 예제의 `customers.lookupMaskedContact`는 fake 개인정보를 tenant와 permission
확인 후 읽는다. 고객 ID·이름·이메일·전화번호를 type marker로 바꾸며 내부 메모는
제거하고 결과를 ephemeral로 표시한다. 실제 연락처 값은 제공하지 않는다.

## 정확한 개인정보 표시

권한이 있는 직원이 실제 주소나 연락처를 꼭 확인해야 한다면 그 값을 모델에 보내지
않는다. 용도가 분리된 tRPC procedure에서 행·field 권한을 다시 확인하고 구조화된 UI
card로 직접 표시한다. 이 응답은 모델 context와 대화 history 밖에 두고, 짧은 cache
정책을 적용하며, 실제 값이 아닌 접근 metadata만 감사한다.

예를 들어 “이번 주 판매 차량”은 차량 ID, 모델, 판매 시각을 모델에 제공할 수 있다.
“구매자 연락처 열기”는 별도 permission이 필요한 UI 동작이며, 모델 tool의 상세 조회
형태로 구현하지 않는다.

### 애플리케이션 준비성 게이트

provider-neutral `@arlequins/agent-core` 패키지는
`assertExactPersonalDataSourceReady`와 `authorizeExactPersonalDataSource`를
제공한다. 파생 애플리케이션은 정확한 개인정보 source를 등록하기 직전에 명시적인
준비성 계약을 이 게이트에 전달해야 한다. 계약은 다음을 모두 요구한다.

- `non-model` transport를 사용하고 모델 context에서 제외된 versioned 구조화 UI route와
  `data-owner`, `privacy-owner`, `security-reviewer` 중 하나의 승인 역할, approval ID·
  subject·source binding·policy version·날짜·route/version 증거;
- 보존기간 상한과 짧고 제한된 UI cache 기간;
- 식별된 deletion workflow를 가진 provider-neutral 삭제 port;
- 90일보다 오래되지 않고 재검토 기한이 365일 이내인 최신 access review;
- 365일보다 오래되지 않으며 제한된 미래 만료일이 있는 긍정 상태·날짜 기록의
  privacy-owner acceptance와 acceptance ID·subject·source binding·policy version·role
  증거.

계약은 `ExactPersonalDataApprovalVerifierPort`를 주입해야 하며 템플릿에는 기본 verifier가
없다. verifier는 두 승인 기록을 확인한 뒤 정확히 일치하는 증거를 반환하거나 `false`를
반환해야 한다. false, 예외, identity·role·source·route/version·policy version·날짜가
일치하지 않는 결과는 fail-closed로 거부한다.

검증기는 `unknown` 설정을 받아 누락, 잘못된 형식, 미래 날짜, 만료된 증거를
fail-closed로 거부한다. 기본 활성화나 인자가 없는 경로는 없다. 승인에 성공하면
동결된 모듈 발급 opaque permit과 immutable registration descriptor를 반환한다. 파생 source
등록 경계는 두 값을 `assertExactPersonalDataAuthorizationPermit`에 전달하고, 반환된
descriptor snapshot만 사용해야 한다. 따라서 등록 코드가 변경 가능한 readiness 객체를
다시 읽지 않는다. snapshot은 삭제 함수 identity를 보존하고 UI route/version과 만료 증거에
permit을 결합한다. 복사·위조 permit이나 다른 계약은 거부되지만, 템플릿이 파생 개발자가
API를 우회하는 것까지 막을 수는 없다. 따라서 code review와 integration test가 여전히
필요하다.

모든 계약 날짜는 canonical RFC3339 UTC 형식인
`YYYY-MM-DDTHH:mm:ss.sssZ`를 사용해야 한다. timezone이 없거나 locale 형식이거나
offset을 사용하거나 달력 날짜가 자동 보정된 값은 거부한다. access review는 최대
90일 이내에 수행되어야 하고 재검토 기한은 365일 이내여야 한다. privacy-owner
acceptance는 최대 365일 이내의 것이어야 하며 365일을 넘지 않는 미래 만료일이 있어야
한다. 구조화 UI 승인은 최대 90일 이내의 것이어야 하며 만료일은 365일을 넘을 수 없다.

삭제 port는 인증된 actor의 tenant·workspace context와 명시적 purpose를 함께 받는다.
파생 저장소는 integration test로 삭제가 멱등적이고 감사 가능하며 승인된 모든 복사본에
전파되고 모델 allowlist를 통해 source가 노출되지 않음을 증명해야 한다. 게이트를 통과해도
정확한 값이 모델 context, 대화 history, 로그, feedback, 평가 또는 튜닝 export로
들어가서는 안 된다.

## Bedrock Guardrail 연결

아래 두 값을 모두 설정하면 버전이 지정된 기존 Bedrock Guardrail을 모든 Converse
stream 요청에 연결한다.

```dotenv
BEDROCK_GUARDRAIL_ARN=arn:aws:bedrock:REGION:ACCOUNT:guardrail/GUARDRAIL_ID
BEDROCK_GUARDRAIL_VERSION=1
```

adapter는 한쪽 값만 설정된 구성을 거부한다. Guardrail trace 결과에는 원래 값이
포함될 수 있으므로 trace 출력을 요청하지 않는다. Lambda에는 지정된 Guardrail ARN에
대한 `bedrock:ApplyGuardrail`만 허용한다.

입력·출력 sensitive information policy를 설정하되 애플리케이션 field policy를
주 통제로 유지한다. AWS 문서상 PII 필터는 확률적이고 `tool_use` parameter의
개인정보를 다루지 않으며 model invocation log의 원본 입력을 마스킹하지 않는다.
승인된 로그 보호 설계와 CloudWatch log data protection이 없다면 민감 트래픽에 대한
invocation logging을 비활성화한다.

- <https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-sensitive-filters.html>
- <https://docs.aws.amazon.com/bedrock/latest/userguide/usingVPC.html>
- <https://docs.aws.amazon.com/bedrock/latest/userguide/data-encryption.html>

Bedrock은 고객 prompt와 출력을 base model 학습에 사용하지 않지만 애플리케이션에
저장된 대화와 그 하위 복사본은 여전히 애플리케이션의 책임이다. 배포 데이터 위치
정책에 따라 in-region endpoint 또는 승인된 inference profile, 최소 권한 IAM, TLS,
KMS, PrivateLink를 사용한다.

- <https://aws.amazon.com/bedrock/faqs/>
- <https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html>

## 채팅·memory·파인튜닝 제한

기본 채팅 구현은 사용자와 assistant 텍스트를 저장한다. 개인정보 저장소로 설계된
것이 아니다. 정확한 개인정보를 prompt에 넣고 system instruction이 보호해 줄 것으로
가정하면 안 된다.

개인정보 텍스트를 허용하려는 파생 앱은 먼저 검토된 입력·출력 검사 port, 보존기간
metadata, 삭제 workflow, 암호화, 접근 감사, 명시적인 `noPersist` 경로를 추가해야
한다. 그 전에는 민감 요청을 거절하거나 구조화된 UI 경로로 이동한다.

원본 개인정보를 feedback, 평가, distillation, LoRA, QLoRA 등 어떤 학습 데이터에도
export하지 않는다. 파인튜닝 모델은 학습 예제를 재생할 수 있으며 DB 행을 삭제해도
adapter가 암기한 값은 삭제되지 않는다.
AWS도 Bedrock custom model 학습 데이터에 같은 주의를 명시한다.

- <https://docs.aws.amazon.com/bedrock/latest/userguide/encryption-custom-job.html>

## 필수 요청 경로

1. 로그인을 검증하고 user, tenant, workspace, role, 처리 목적에 매핑한다.
2. 명시적 capability를 선택한다. 자연어로 임의 SQL을 만들거나 모델에 DB credential을
   주지 않는다.
3. DB·application 행 권한을 적용하고 필요한 컬럼만 선택한다.
4. 반환 schema를 검증하고 field output policy를 적용한다.
5. 정제된 model row만 추론에 전달한다.
6. 입력·출력 Guardrail과 애플리케이션 출력 검사를 적용한다.
7. policy가 대화 저장을 명시적으로 허용한 결과만 저장한다.
8. metadata를 감사하고 결과·로그·history·feedback·학습 export에 원본 값이 없는지
   테스트한다.

## 운영 승인 체크리스트

- [ ] 데이터 소유자가 각 source field와 처리 목적을 승인했다.
- [ ] 로그인 외에 tenant, role, record, field 권한을 적용한다.
- [ ] 일반 채팅 capability에 개인정보와 고도 민감정보 column이 없다.
- [ ] schema drift와 선언되지 않은 column은 fail-closed로 실패한다.
- [ ] 개인정보 결과는 마스킹되고 ephemeral이며 감사 입력 요약에 남지 않는다.
- [ ] 정확한 개인정보는 모델을 거치지 않는 구조화된 UI에서만 표시한다.
- [ ] source를 활성화하기 직전에 agent-core 정확한 개인정보 준비성 게이트를 통과한다.
- [x] 템플릿 primitive가 최신 versioned 구조화 UI 승인과 정확한 준비성 snapshot에
      결합된 opaque authorization permit, 등록 경계 assertion을 제공하며 파생 코드가
      이를 사용한다.
- [ ] Bedrock Guardrail 입력·출력 정책과 최소 권한 IAM을 설정하고 테스트했다.
- [ ] model invocation logging을 끄거나 별도 보호·승인했다.
- [ ] 교차 tenant, prompt injection, history·field 누출, MCP/tool 권한 테스트가 통과한다.
- [ ] 대화 보존·삭제, 사고 대응, 접근 검토가 실제로 운영된다.
- [ ] 개인정보가 memory, feedback, 평가, 학습 데이터에 들어가지 않는다.

파생 저장소에서 해당 항목을 모두 통과하기 전까지 실제 Aurora 개인정보 접근은
비활성 상태로 유지한다.
