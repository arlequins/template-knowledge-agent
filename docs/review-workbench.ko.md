# 소유자 검토 워크벤치와 일일 승격

`needs-investigation` 피드백은 워크스페이스별 조사 항목으로 저장됩니다.
소유자는 원래 답변을 확인하고, 근거를 검증한 수정 답변과 검토 메모를
기록한 뒤 승인 또는 거절할 수 있습니다. 숨은 추론 과정은 저장하거나
노출하지 않으며, 최종 답변·근거 식별자·감사 가능한 검토 기록만 남깁니다.

## API

- `agent.investigations`: 소유자 전용 조사 대기열(기본 `queued`, 최대 100개)
- `agent.reviewInvestigation`: 소유자 전용 승인/거절. `correctedAnswer`,
  `evidenceIds`, `requiredTerms`, `forbiddenClaims`, `resolution`을 받습니다.

두 저장소 어댑터(DB와 S3)는 같은 계약을 구현합니다. 모든 변경은
워크스페이스 소유권을 다시 확인하고 변경 불가 감사 이벤트를 기록합니다.
감사 메타데이터에는 원문, 비밀값, 개인정보를 넣지 마세요.

## 승인 조사 결과 내보내기

승인된 조사는 소유자가 수정 답변과 같은 워크스페이스의 문서 청크 ID를
하나 이상 입력하기 전에는 학습 데이터가 되지 않습니다. 내보내기 도구는
`approved` 항목만 읽고 대화에서 원 질문을 다시 찾은 뒤 권한이 있는 청크와
조인합니다. 근거가 없거나 중복된 항목은 건너뛰며 결과는 `.local/` 아래에
새 리뷰 팩으로 원자적으로 기록합니다.

```bash
AGENT_WORKSPACE_ID=<workspace-uuid> \
AGENT_OWNER_USER_ID=<owner-user-uuid> \
pnpm tuning:patterns:export-approved
```

출력의 `added`/`skipped` 수로 반영 결과를 확인하세요. 공개 예제 팩은
변경하지 않습니다. 생성된 팩을 기존 승격 게이트에 전달합니다.

```bash
pnpm tuning:patterns:daily -- \
  --input .local/tuning/reviewed-with-feedback.json
```

스케줄 작업에서는 두 단계를 순서대로 실행하고 DB 연결도 닫는 통합 명령을
사용할 수 있습니다.

```bash
AGENT_WORKSPACE_ID=<workspace-uuid> \
AGENT_OWNER_USER_ID=<owner-user-uuid> \
pnpm tuning:patterns:daily:with-feedback -- \
  --provider ollama \
  --model qwen2.5:3b \
  --runtime ollama \
  --quantization q4_K_M
```

모델 인자는 선택 사항이지만 지정하면 활성 매니페스트에 정확한 제공자,
모델 ID, 런타임, 양자화가 기록됩니다. 따라서 별칭이 같은 Bedrock·호스팅·
로컬 모델을 혼동하지 않고 일일 평가를 재현할 수 있습니다.

성공한 최종 매니페스트를 실행 중인 API가 사용하려면 별도의 명시적
reload/deploy가 필요합니다.

검토 화면의 근거 청크 ID에는 문서/청크 API가 반환한 UUID를 입력합니다.
근거 목록이 비어 있으면 의도적으로 제외되어 비공개 원문이 일일 팩에
그대로 유입되지 않습니다.

## 일일 루프

검토가 끝난 뒤 다음 명령을 실행합니다.

```bash
pnpm tuning:patterns:daily
```

인용·중복·반복 문장·민감정보 패턴·의미 그룹 분리, 8개 행동 유형, 3개
언어, 검증/테스트 홀드아웃을 검사합니다. 통과한 리뷰 팩만 원자적으로
`.local/tuning/active-behavior-pack.json`에 기록됩니다. 실패하면 기존 활성
팩은 보존됩니다. 매니페스트에는 소스 해시·버전·메트릭·학습 행 수·학습 전용
행동 프롬프트와 (지정한 경우) 정확한 모델 런타임 정보가 포함됩니다.
