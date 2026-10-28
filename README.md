# e2e-hello

E2E hello Node.js HTTP server

## 목적

E2E 검증용 최소 Node.js HTTP 서버입니다. Node.js 내장 모듈과 PostgreSQL 드라이버 `pg`(node-postgres)만 사용하며, `/health` 헬스체크와 간단한 Todo API·페이지를 제공합니다.

## 실행

```sh
npm install
npm start
```

기본 포트는 `8080`이며 `PORT` 환경 변수로 변경할 수 있습니다. 호스트는 `0.0.0.0`에 바인딩됩니다.

```sh
PORT=18080 npm start
```

`SIGTERM`/`SIGINT` 수신 시 HTTP 서버와 PostgreSQL 연결 풀을 정상 종료합니다.

## 저장소 모드

| 모드 | 조건 | 설명 |
| --- | --- | --- |
| `postgres` | `DATABASE_URL` 설정됨 | `pg` Pool로 PostgreSQL에 저장합니다. |
| `memory` | `DATABASE_URL` 없음 | 프로세스 메모리에 저장합니다(로컬·테스트용, 재시작 시 초기화). |

PostgreSQL 모드에서는 시작 시 다음 마이그레이션을 실행합니다. 모든 쿼리는 파라미터화 쿼리를 사용합니다.

```sql
CREATE TABLE IF NOT EXISTS todos (
  id bigserial PRIMARY KEY,
  title text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
)
```

마이그레이션이 실패해도 프로세스는 계속 실행되며 `/health`만 `503`을 반환합니다. 이후 `/health` 요청 시 마이그레이션을 다시 시도합니다. 오류 상세나 연결 정보는 응답·로그에 노출하지 않습니다.

### dev PostgreSQL

`application.yaml`의 `environments.dev.resources`에 PostgreSQL 리소스 `main`(`class: postgres`)이 선언되어 있습니다. dev 배포 시 Agent Delivery가 `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`를 주입하며, 앱은 `DATABASE_URL`을 사용해 PostgreSQL 모드로 동작합니다. prod 환경에는 데이터베이스 리소스가 없으므로 메모리 모드로 동작합니다.

## 테스트

```sh
npm test
```

테스트는 `createServer({ store })`에 메모리 저장소를 주입하므로 `DATABASE_URL`이 설정되어 있어도 외부 DB 없이 실행됩니다.

## 엔드포인트

| 메서드 | 경로 | 응답 |
| --- | --- | --- |
| `GET` | `/health` | `200` `{"ok":true,"storage":"postgres"\|"memory"}`, DB 점검 실패 시 `503` `{"ok":false}` |
| 그 외 | `/health` | `405 Method Not Allowed` |
| `GET`, `HEAD` | `/todos` | `200` Todo HTML 페이지 (그 외 메서드 `405`) |
| `GET` | `/api/todos` | `200` Todo 배열 (`createdAt`, `id` 오름차순) |
| `POST` | `/api/todos` | `201` 생성된 Todo |
| `PATCH` | `/api/todos/:id` | `200` 수정된 Todo |
| `DELETE` | `/api/todos/:id` | `204 No Content` |
| 전체 | 그 외 경로 | `404 Not Found` |

## Todo API

JSON 응답은 `content-type: application/json; charset=utf-8`입니다. Todo 형태:

```json
{ "id": 1, "title": "우유 사기", "done": false, "createdAt": "2026-01-01T00:00:00.000Z" }
```

- `POST /api/todos` 본문 `{"title": "..."}`: `title`은 문자열이며 앞뒤 공백 제거 후 1~200자여야 합니다.
- `PATCH /api/todos/:id` 본문 `{"title"?: string, "done"?: boolean}`: 둘 중 하나 이상 필요합니다.
- 오류 응답은 `{"error": "..."}` 형태입니다.
  - `400`: 검증 실패, JSON 파싱 오류, 객체가 아닌 본문
  - `404`: 존재하지 않거나 양의 정수가 아닌 `id`
  - `405`: 허용되지 않은 메서드 (`allow` 헤더 포함)
  - `413`: 본문 16KB 초과

```sh
curl -X POST -H 'content-type: application/json' -d '{"title":"우유 사기"}' http://localhost:8080/api/todos
curl http://localhost:8080/api/todos
curl -X PATCH -H 'content-type: application/json' -d '{"done":true}' http://localhost:8080/api/todos/1
curl -X DELETE http://localhost:8080/api/todos/1
```

## Todo 페이지

`GET /todos`는 인라인 CSS·JS만 사용하는 자체 완결 HTML 페이지로 외부 리소스를 불러오지 않습니다. 목록 표시, 추가 폼, 완료 체크박스, 삭제 버튼과 로딩·빈 목록·오류 상태를 제공하며, 시스템 폰트와 `light-dark()` 기반 라이트/다크 테마, 키보드 조작, 360px 모바일 화면을 지원합니다. 사용자 입력은 `textContent`로만 렌더링합니다.

## Docker

```sh
docker build -t e2e-hello .
docker run --rm -p 8080:8080 e2e-hello
```

Dockerfile은 `npm ci` 후 `npm prune --omit=dev`로 production 의존성(`pg`)을 이미지에 포함합니다.

배포 환경은 `application.yaml`에 dev 환경과 함께 prod 환경(replicas 1)도 선언되어 있습니다.
