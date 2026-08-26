# 모델 레지스트리와 재현 평가

코어 패키지는 제공자와 무관한 결정적 모델 라우터를 제공하고, 인덱서는
Golden Evaluation 게이트를 제공합니다. “Qwen” 같은 별칭 대신 정확한 모델
ID와 런타임 정보를 기록해야 합니다.

`fast`, `balanced`, `coding`, `deep` capability와 비용 정보를 등록한 뒤
`createModelRouter(entries).select({ question })`를 호출합니다. 코딩 질문은
코딩 모델로, 충돌하는 근거는 `deep`으로, 예산이 있으면 예상 입력·출력 비용을
기준으로 선택합니다.

완료 유스케이스에는 선택적으로 `ModelSelectionPort`를 주입할 수 있습니다.
`select`는 실제 `ModelProviderPort`, 모델 ID, 라우팅 프로필과 사유를 반환합니다.
컴포지션 루트에서 레지스트리를 제공자 어댑터에 연결하고, 채팅 유스케이스가 SDK를
직접 가져오지 않도록 합니다. 선택기를 주입하지 않으면 설정된 단일 모델을 그대로
사용합니다.

모델 결과를 무시된 JSON으로 저장하고 다음을 실행합니다.

```bash
pnpm pilot:evaluate -- --answers .local/evals/ollama-qwen.json
```

필수 용어, 금지 주장, 빈 답변, 인용 누락을 결정적으로 검사합니다. 실패한
결과는 승격하지 않습니다. 파생 레포에서는 토큰 비용, p95 지연, 권한, 보류
테스트셋을 추가로 검사해야 합니다.
