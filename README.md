# todocal

Todoist 캘린더 뷰 대체 앱. TodoMate 스타일 월/주 캘린더 + Todoist MCP로 움직이는 AI 지시 바.

## 실행

```bash
pnpm up                 # 설치 → 빌드 → http://127.0.0.1:5180
pnpm dev                # 개발 (웹 5181, 서버 5180)
pnpm dev:mock           # 실제 Todoist 없이 목업 데이터로
```

첫 화면에서 Todoist API 토큰을 넣는다(설정 → 연동 → 개발자). AI 지시를 쓰려면 Anthropic API 키도 넣는다. 키가 없으면 지시 바는 Todoist 빠른 추가로 동작한다. 키는 `.data/config.json`(권한 600)에만 저장된다.

## 기능

| 영역 | 내용 |
|---|---|
| 캘린더 | 월/주 전환, 날짜별 남은 개수, 다 끝낸 날 도장, 프로젝트 색 점·제목 미리보기, 스와이프로 넘기기 |
| 날짜 목록 | 프로젝트(목표)별 묶음, 프로젝트별 인라인 추가, 진행률, 완료 항목 보기/숨기기 |
| 할 일 | 체크(실행 취소 토스트), 우선순위 색, 시간·소요시간, 반복 ↻, 마감일 ⚑, 라벨, 하위 할 일 |
| 일정 변경 | 캘린더 칸으로 끌어다 놓기(모바일은 길게 눌러서), 반복 규칙 유지 |
| 편집 시트 | 제목·메모·날짜·시간·소요·마감·반복 문구·우선순위·프로젝트·라벨·하위 할 일, 오늘/내일/다음 주/하루 미루기/날짜 없음, 삭제 |
| 밀린 할 일 | 오늘 화면 상단 배너, 한 번에 오늘로 |
| 날짜 없음 | 서랍(`I`), 캘린더로 끌어 놓기, 서랍으로 끌면 날짜 제거 |
| AI 지시 | "내일 3시 치과, 금요일까지 보고서 p1" → Claude가 Todoist MCP 도구로 실행 |
| 기타 | 프로젝트 숨기기, 주 시작 요일, 다크 모드, PWA 설치, 단축키 |

단축키: `⌘K` 지시 · `←/→` 하루 · `↑/↓` 한 주 · `T` 오늘 · `W` 월/주 · `I` 날짜 없음 · `Esc` 닫기

## 구조

```
server/index.ts   Hono: /api/td/* → api.todoist.com/api/v1 프록시, /api/config, /api/agent, dist 서빙
server/agent.ts   @doist/todoist-mcp 를 stdio 자식으로 띄우고 도구를 Claude 에 넘기는 루프
server/mock.ts    TODOCAL_MOCK=1 일 때 쓰는 메모리 목업
src/              React + TanStack Query + dnd-kit
```

## 폰에서 쓰기

서버는 기본으로 127.0.0.1 에만 열린다. 외부에 열려면 패스코드가 필수다.

```bash
HOST=0.0.0.0 TODOCAL_PASSCODE=비밀 pnpm start
cloudflared tunnel --url http://127.0.0.1:5180   # 또는 같은 Wi-Fi 에서 IP 로 접속
```

폰 설정 화면에서 같은 패스코드를 넣고, 공유 → 홈 화면에 추가.

## 환경 변수

| 이름 | 기본값 | 설명 |
|---|---|---|
| `PORT` | 5180 | |
| `HOST` | 127.0.0.1 | 외부 노출 시 `TODOCAL_PASSCODE` 필요 |
| `TODOCAL_MODEL` | claude-opus-5 | 지시 바 모델 |
| `TODOIST_API_TOKEN`, `ANTHROPIC_API_KEY` | | 설정 화면 대신 환경 변수로 |
