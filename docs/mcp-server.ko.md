# 원격 MCP 서버 계약

API의 `POST /mcp`는 파생 레포지토리가 주입해서 사용하는 보호된 확장 지점이다.
구체적인 `McpServer`를 주입하기 전에는 의도적으로 `404 MCP Not Configured`를
반환하므로, 인증 정책이 없는 도구가 실수로 공개되지 않는다.

HTTP 어댑터가 JSON-RPC와 Bearer/OIDC 세션을 확인한 뒤 서버로 전달하고, 각
도구가 사용자·역할·tenant 범위를 다시 검사한다. `initialize`, `tools/list`,
`tools/call`을 지원하며, 실패 응답에는 스택 트레이스나 비밀값을 포함하지 않는다.

실시간 업무 데이터는 `createMcpToolsFromLiveCapabilities(...)`로 기존 registry를
연결한다. 파생 레포가 인증 컨텍스트에서 `resolveActor`와 capability별 JSON Schema를
제공하며, 실행은 registry의 tenant·필드·행 수·감사·보존 정책을 그대로 거친다.

도구 이름은 이식 가능한 영문자·숫자·`_`·`-`·`.`만 허용하고 최대 128자이며,
입력 스키마는 JSON 객체여야 한다. capability별 스키마를 생략하면 브리지가 기본으로
알 수 없는 속성을 거부하는 닫힌 객체 스키마를 사용한다. 운영 도구에는 반드시
`properties`·타입·범위를 명시해 하위 검증기에서도 예상 밖 인자를 거부하도록 한다.

도구는 타입이 지정되고 결과가 제한된 기능만 등록해야 한다. 임의 SQL, 셸,
파일시스템, 범용 프록시는 금지한다. 실서비스 OAuth/OIDC issuer·audience·키
교체 설정은 파생 레포에서 구성하고 로컬 OIDC mock은 테스트에만 사용한다.

배치 실패 알림은 `PipelineFailureNotifier` 어댑터로 SNS·Slack·PagerDuty 등에
연결할 수 있다. 기본 경고와 외부 알림 모두 `batchId`, 시각, 재귀적으로 마스킹된
오류 이벤트만 받으며, 알림 전송 실패는 재시도를 위해 전파된다.
