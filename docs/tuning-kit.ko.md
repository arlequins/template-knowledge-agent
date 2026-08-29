# Luna 기반 문서 QA 튜닝 키트

[English](tuning-kit.md) · [日本語](tuning-kit.ja.md)

이 키트는 검수된 근거를 재사용 가능한 문서 QA 행동 패턴으로 바꾼다.
검수된 **학습 분할** 예시는 즉시 소수 예제 프롬프트로 쓸 수 있고, 나중에는
별도로 검증한 로컬 학생 모델의 학습 JSONL로 내보낼 수 있다.

`gpt-5.6-luna`는 합성 질문·답변 후보를 만드는 교사/검수 보조 모델이다.
루나 자체를 파인튜닝하는 구조가 아니다. 루나는 Responses API와 Structured
Outputs를 지원하지만 파인튜닝은 지원하지 않는다. 공식
[Luna 모델 문서](https://developers.openai.com/api/docs/models/gpt-5.6-luna)와
[평가 가이드](https://developers.openai.com/api/docs/guides/evals)를 기준으로
구현했다.

## 포함된 기능

- `@arlequins/tuning-kit`: 근거, 시드, 후보, 검수 패턴, 의미 그룹 단위 분할,
  품질 게이트, 즉시 사용 프롬프트와 학습 JSONL 출력
- OpenAI 어댑터: `gpt-5.6-luna`, `store: false`, 도구 없음, 엄격한 JSON
  Schema로 후보 생성
- `examples/tuning/seeds.json`: 공개 가능한 합성 생성 시드
- `examples/tuning/reviewed-patterns.json`: 영어·일본어·한국어의 검수 완료
  공개 예제 12개
- `pnpm tuning:patterns:verify`: 인용, 필수/금지 주장, 정확한 중복, 분할 사이의
  어휘상 근접 중복, 문장 반복, 개인정보 모양, 의미 그룹 유출과 보류 평가 유출 검사

행동 유형은 근거 답변, 근거 부족, 근거 충돌, 인용 필수, 정적 문서와 실시간
데이터 구분, 코드 탐색, 범위 확인, 검색 문서의 프롬프트 주입 거부까지 여덟
가지다.

## 루나로 비공개 후보 생성

무시되는 `.env.localhost`에 서버용 키를 넣고 실행한다.

```bash
OPENAI_API_KEY=replace-me
pnpm tuning:patterns:generate
```

기본 결과는 `.local/tuning/luna-candidates.json`이다. 생성 명령은 `.local/`
밖으로 쓰지 않으며 기존 파일도 `--force` 없이 덮어쓰지 않는다. 출력이
로컬이어도 원본 개인정보, 운영 SQL 행, 비밀키, 사내 소스와 대화 기록을
호스팅 모델에 보내도 된다는 뜻은 아니다. 먼저 제공자 데이터 처리 정책과
사내 승인을 확인해야 한다.

다른 시드와 파일을 사용할 수 있다.

```bash
pnpm tuning:patterns:generate -- \
  --seed examples/tuning/seeds.json \
  --output .local/tuning/luna-candidates-v2.json \
  --model gpt-5.6-luna
```

## 검수하고 즉시 사용

루나 결과는 항상 `status: "candidate"`다. 생성 모델이 자기 주장을 승인하게
두지 않는다. 소유자가 각 답변을 활성 근거와 비교하고, 지원되지 않는 사실을
제거하고, 동일 `groupKey`를 한 분할에만 배정하고, 검수자와 시각을 기록한
뒤에만 `reviewed`로 바꾼다.

`compileReviewedBehaviorPrompt`는 검수된 `train` 예시만 사용한다. `validation`
과 `test`는 제외되므로 내일 같은 질문을 했을 때 실제로 좋아졌는지 비교할
수 있다. 생성한 문자열을 `AgentProfile.reviewedBehaviorPrompt`에 넣으면
가중치 학습 없이 바로 적용된다.

예제는 **답변 습관**을 가르칠 뿐, 예제 속 사실을 새 질문에 복사하지 않는다.
런타임은 현재 질문에서 검색한 근거를 계속 요구한다.

자동 근접 중복 게이트는 같은 언어 안에서 문자 trigram 겹침을 비교한다.
실수로 섞인 유사 표현을 잡지만, 검수자가 지정하는 의미 `groupKey`나 도메인별
임베딩 감사를 대체하지는 않는다.

## 로컬 모델 학습으로 확장

`exportReviewedTrainingJsonl(batch)`는 검수된 학습 행만 출력하지만 모델을
학습하거나 승격하지 않는다. Ornith, Qwen 등의 파생 로컬 파이프라인은 학습기,
검증, 보류 평가, 반복/허위 주장 차단, 원자적 승격, 서버 재로딩과 롤백을
별도로 구현해야 한다.

빠른 개선 순서는 다음과 같다.

1. 바뀌지 않는 보류 질문과 기대 근거를 정한다.
2. 루나로 다양한 표현과 실패 상황 후보를 만든다.
3. 사람이 근거를 검수해 맞는 행만 승인한다.
4. `pnpm tuning:patterns:verify`를 통과시킨다.
5. 기본 모델과 행동 패턴 적용 모델을 보류 질문으로 비교한다.
6. 안정적인 행동 문제가 남을 때만 로컬 학생 모델용 JSONL을 내보낸다.
7. 전체 RAG, 인용, 개인정보, 지연 시간과 반복 게이트가 통과할 때만 승격한다.

따라서 사용자 반응 하나가 다음 날 자동으로 가중치가 된다고 과장하지 않으면서도,
검수한 개선 패턴은 곧바로 사용할 수 있다.
