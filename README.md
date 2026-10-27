# e2e-hello

E2E hello Node.js HTTP server

## 목적

E2E 검증용 최소 Node.js HTTP 서버입니다. 외부 npm 의존성 없이 Node.js 내장 모듈만 사용하며, `/health` 헬스체크 엔드포인트를 제공합니다.

## 실행

```sh
npm start
```

기본 포트는 `8080`이며 `PORT` 환경 변수로 변경할 수 있습니다. 호스트는 `0.0.0.0`에 바인딩됩니다.

```sh
PORT=18080 npm start
```

`SIGTERM`/`SIGINT` 수신 시 서버를 정상 종료합니다.

## 테스트

```sh
npm test
```

## 엔드포인트

| 메서드 | 경로 | 응답 |
| --- | --- | --- |
| `GET` | `/health` | `200`, `application/json`, `{"ok":true}` |
| 그 외 | `/health` | `405 Method Not Allowed` |
| 전체 | 그 외 경로 | `404 Not Found` |

## Docker

```sh
docker build -t e2e-hello .
docker run --rm -p 8080:8080 e2e-hello
```
