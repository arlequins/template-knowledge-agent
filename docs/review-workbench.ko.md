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

## 일일 루프

검토가 끝난 뒤 다음 명령을 실행합니다.

```bash
pnpm tuning:patterns:daily
```

인용·중복·반복 문장·민감정보 패턴·의미 그룹 분리, 8개 행동 유형, 3개
언어, 검증/테스트 홀드아웃을 검사합니다. 통과한 리뷰 팩만 원자적으로
`.local/tuning/active-behavior-pack.json`에 기록됩니다. 실패하면 기존 활성
팩은 보존됩니다.
