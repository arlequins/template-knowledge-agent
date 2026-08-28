# 기능 슬라이스 기반 클린 아키텍처

이 템플릿은 두 규칙을 함께 사용합니다.

- **클린 아키텍처**는 정책이 전송 방식, 저장소, 클라우드, 모델 공급자에
  의존하지 않도록 의존성 방향을 정합니다.
- **Feature-Sliced Design(FSD)**은 하나의 업무 기능을 이름 있는 슬라이스에
  모아 소유권을 분명하게 합니다.

## 표준 슬라이스

새 기능은 `pnpm gen:feature`로 만들며 다음 구조에서 시작합니다.

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

서비스 슬라이스는 프레임워크와 무관해야 합니다. tRPC 슬라이스는 전송
어댑터이며 서비스 패키지를 사용할 수 있지만, 라우터에서 데이터베이스나
공급자 SDK를 직접 호출하면 안 됩니다. 구체적인 저장소를 아는 곳은 포트를
구현하는 어댑터뿐입니다.

## 의존성 규칙

```text
domain <- application <- composition <- adapters
                                      <- router
```

도메인은 순수 규칙만, 애플리케이션은 도메인·포트와 프레임워크에 독립적인 공통 계약만, 어댑터는 외부 I/O만,
라우터는 입력·출력 변환만 담당합니다. 기능 간에는 내부 파일을 직접
가져오지 말고 공개 포트나 공통 도메인 계약을 통해 조합 루트에서 연결합니다.

`pnpm architecture:check`가 이 규칙을 검사합니다. 기존 예제의
`src/router`, `src/adaptors`는 호환성을 위해 남아 있지만 새 코드는
`features/<name>/adapters`를 사용해야 합니다.

## 요청 흐름

전송 핸들러가 입력과 인증을 확인하고, 라우터가 도메인 입력으로 변환한 뒤
유스케이스를 호출합니다. 유스케이스는 포트를 통해 어댑터에 I/O를 요청하고,
라우터는 안정적인 애플리케이션 오류를 tRPC 오류로 변환합니다. 따라서 같은
유스케이스를 tRPC, Hono, MCP, 배치에서 재사용할 수 있습니다.

## 병합 전 체크리스트

도메인 입력·결과에서 시작하고, 외부 효과마다 포트를 만들며, 정책 분기를
포트 더블로 테스트합니다. 어댑터에는 오류·타임아웃·권한 실패 테스트를
추가하고, 라우터에는 명시적인 입출력 스키마를 둡니다. 마지막으로
`pnpm architecture:check`, `pnpm check`, `pnpm typecheck`와 관련 테스트를
실행하고 기능 계약과 문서를 같은 변경에 포함합니다.

기존 구조를 옮길 때는 계약 테스트를 먼저 고정하고, 새 슬라이스가 기존
핸들러를 대체하도록 한 기능씩 점진적으로 전환합니다. 전체를 한 번에
재작성하지 않아야 파생 레포지토리의 안정성을 유지할 수 있습니다.
