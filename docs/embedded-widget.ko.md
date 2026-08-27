# 임베디드 채팅 계약

파생 레포는 독립 사이트와 같은 워크스페이스 채팅을 `/embed` iframe으로 제공할
수 있습니다. 부모 origin은 서버에서 정확히 allowlist하고 API bearer 인증,
워크스페이스 멤버십, CORS, rate limit, 감사 로그를 유지해야 합니다.

템플릿은 cross-origin 토큰 전달을 구현하지 않습니다. 상위 창 팝업 콜백을
추가할 때는 정확한 `targetOrigin`, state/nonce 검증, 짧은 일회성 코드,
재사용 방지, 감사 이벤트를 적용하세요. 검증되지 않은 `postMessage`에 access
token을 넣지 마세요. 업무 데이터는 [개인정보 경계](privacy-sensitive-data.md)를
검토한 뒤 활성화합니다.
