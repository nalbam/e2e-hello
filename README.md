# e2e-hello

E2E hello Node.js HTTP server

## 목적

E2E 검증용 최소 Node.js HTTP 서버입니다. Node.js 내장 모듈과 PostgreSQL 클라이언트 `pg`만 사용하며, `/health` 헬스체크와 간단한 Todo API·페이지를 제공합니다.

## 저장소: PostgreSQL

Todo는 PostgreSQL의 `todos` 테이블에 저장되므로 프로세스 재시작·재배포 후에도 유지됩니다. 메모리 저장소 대체 모드는 없습니다.

| 환경 변수 | 필수 | 설명 |
| --- | --- | --- |
| `E2E_HELLO_DB_DATABASE_URL` | 예 | PostgreSQL 연결 URL (`postgres://user:password@host:5432/db`) |
| `PORT` | 아니오 | 수신 포트, 기본값 `8080` |

`application.yaml`은 dev와 prod에 PostgreSQL 리소스 `e2e-hello-db`(`class: postgres`)를 선언하며, 배포 시 Agent Runway가 리소스 이름 접두어가 붙은 `E2E_HELLO_DB_DATABASE_URL`을 주입합니다. 연결 URL에는 자격 증명이 포함되므로 로그·응답에 출력하지 않으며, 오류는 오류 코드만 기록합니다.

### 시작 순서와 마이그레이션

1. `E2E_HELLO_DB_DATABASE_URL`이 없으면 오류 메시지를 출력하고 종료 코드 `1`로 종료합니다.
2. 트랜잭션 안에서 advisory lock(`pg_advisory_xact_lock`)을 잡고 아래 스키마를 `CREATE TABLE IF NOT EXISTS`로 생성합니다. 여러 replica가 동시에 시작해도 안전하며, 이미 테이블이 있으면 기존 데이터를 그대로 둡니다.
3. 연결·마이그레이션이 실패하면 HTTP 포트를 열지 않고 종료 코드 `1`로 종료합니다.
4. 마이그레이션이 끝난 뒤에만 HTTP 서버가 수신을 시작합니다.

```sql
CREATE TABLE IF NOT EXISTS todos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

`PATCH`는 `COALESCE`를 사용하는 단일 `UPDATE ... RETURNING`으로 처리되어, 같은 Todo를 동시에 수정해도 서로 다른 필드 변경이 유실되지 않고 갱신된 행을 그대로 응답합니다. 커넥션은 `pg.Pool`로 관리하며 종료 시 풀을 닫습니다.

### 데이터 이전·보존

- 이전 버전이 사용하던 저장소의 Todo는 자동으로 PostgreSQL로 이전되지 않습니다. 새 `e2e-hello-db` 데이터베이스는 빈 `todos` 테이블로 시작합니다. 기존 데이터가 필요하면 배포 전에 직접 내보낸 뒤 `INSERT INTO todos (title, done, created_at) ...`로 넣어야 합니다.
- 애플리케이션은 테이블을 삭제하거나 비우지 않으며, 데이터는 `e2e-hello-db` 리소스(데이터베이스)가 유지되는 동안 보존됩니다. 리소스 자체의 백업·보존 정책은 Agent Runway 리소스 설정을 따릅니다.
- 스키마 변경은 시작 시 `CREATE TABLE IF NOT EXISTS`뿐이며, 기존 테이블의 컬럼을 변경하지 않습니다.

## 실행

```sh
npm install
export E2E_HELLO_DB_DATABASE_URL='postgres://user:password@localhost:5432/e2e_hello'
npm start
```

로컬 PostgreSQL이 없다면 예를 들어 다음과 같이 띄울 수 있습니다.

```sh
docker run --rm -d --name e2e-hello-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=e2e_hello -p 5432:5432 postgres:17-alpine
export E2E_HELLO_DB_DATABASE_URL='postgres://postgres:dev@localhost:5432/e2e_hello'
```

기본 포트는 `8080`이며 `PORT` 환경 변수로 변경할 수 있습니다. 호스트는 `0.0.0.0`에 바인딩됩니다.

```sh
PORT=18080 npm start
```

`SIGTERM`/`SIGINT` 수신 시 HTTP 서버를 닫은 뒤 PostgreSQL 커넥션 풀을 종료합니다.

## 테스트

```sh
npm test
```

기본 테스트는 외부 서비스 없이 실행됩니다.

- `test/fake-pg.js`: `store.js`가 사용하는 SQL만 이해하는 인메모리 `pg.Pool` 대체 구현입니다. HTTP 테스트는 이 fake pool 위의 PostgreSQL 저장소를 `createServer({ store })`로 주입합니다.
- `test/store.test.js`: 스키마·마이그레이션(트랜잭션, advisory lock, 실패 시 롤백), 파라미터화된 CRUD SQL, 행 매핑(`id` 숫자, `createdAt` ISO), 동시 수정, 풀 종료, 필수 환경 변수를 검증합니다.
- `test/server.test.js`: URL 누락·마이그레이션 실패 시 서버가 포트를 열지 않고 종료 코드 `1`로 끝나는지, URL을 출력하지 않는지 검증합니다.
- `test/health.test.js`, `test/todos.test.js`: `/health`와 Todo API·페이지 계약을 검증합니다.

GitHub Actions(`.github/workflows/ci.yml`)는 PR과 `main` push에서 PostgreSQL을 띄워 통합 테스트까지 실행하고 Docker 이미지를 빌드합니다.

실제 PostgreSQL 통합 테스트(`test/postgres.integration.test.js`)는 `DATABASE_URL`이 설정된 경우에만 실행되고, 없으면 skip됩니다. 이 테스트는 해당 데이터베이스에 `todos` 테이블을 만들고 자신이 만든 행만 삭제하므로 일회용 테스트 데이터베이스를 사용하세요.

```sh
DATABASE_URL='postgres://postgres:dev@localhost:5432/e2e_hello_test' npm test
```

## 엔드포인트

| 메서드 | 경로 | 응답 |
| --- | --- | --- |
| `GET` | `/health` | 매 요청마다 `SELECT 1` 실행. 성공 시 `200` `{"ok":true,"storage":"postgres"}`, DB 오류 시 `503` `{"ok":false}` |
| 그 외 | `/health` | `405 Method Not Allowed` |
| `GET`, `HEAD` | `/` | `200` Todo HTML 페이지 (redirect 없음, `/todos`와 동일, 그 외 메서드 `405` `allow: GET, HEAD`) |
| `GET`, `HEAD` | `/todos` | `200` Todo HTML 페이지 (그 외 메서드 `405`) |
| `GET` | `/api/todos` | `200` Todo 배열 (`id` 오름차순) |
| `POST` | `/api/todos` | `201` 생성된 Todo |
| `PATCH` | `/api/todos/:id` | `200` 수정된 Todo |
| `DELETE` | `/api/todos/:id` | `204 No Content` |
| 전체 | 그 외 경로 | `404 Not Found` |

## Todo API

JSON 응답은 `content-type: application/json; charset=utf-8`입니다. Todo 형태(`id`는 숫자, `createdAt`은 ISO 8601 UTC 문자열):

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
  - `500`: 처리 중 DB 오류 등 (`{"error":"internal error"}`, 상세 미노출)

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
docker run --rm -p 8080:8080 -e E2E_HELLO_DB_DATABASE_URL='postgres://...' e2e-hello
```

Dockerfile은 `npm ci` 후 `npm prune --omit=dev`로 production 의존성(`pg`)을 이미지에 포함합니다.

배포 환경은 `application.yaml`에 dev 환경과 함께 prod 환경(replicas 1)도 선언되어 있으며, 두 환경 모두 `e2e-hello-db` PostgreSQL 리소스를 사용합니다.
e2e-chat-20261112a
