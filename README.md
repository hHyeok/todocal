# todocal

Todoist 캘린더 뷰 대체 앱. TodoMate 스타일 월/주 캘린더 + Todoist MCP로 움직이는 AI 지시 바 + 데스크탑/브라우저 자체 푸시 알림.

## 실행

### 간편 실행 스크립트 (추천)
- **데스크탑 앱 (Electron + 윈도우 네이티브 푸시 알림)**:
  - `todocal-desktop.bat`: 독립형 데스크탑 창, 트레이 최소화(백그라운드 상주), 윈도우 네이티브 토스트 알림
  - `.\todocal-desktop.ps1`: PowerShell용 데스크탑 앱 실행 스크립트
- **웹 브라우저 버전 (기존 웹 유지)**:
  - `todocal.bat`: 의존성 자동 확인/설치, 빌드, 서버 실행 후 브라우저 자동 오픈 (`http://127.0.0.1:5180`)
  - `todocal-mock.bat`: Todoist API 토큰 없이 목업 모드로 즉시 실행
- **쉘 스크립트 (Git Bash / WSL / bash)**:
  - `./todocal.sh`: 웹 버전 실행
  - `./todocal-mock.sh`: 목업 모드 실행
- **PowerShell**:
  - `.\todocal.ps1`: 웹 버전 실행
  - `.\todocal-mock.ps1`: 목업 모드 실행

### 터미널 명령행 실행
```bash
pnpm desktop             # 데스크탑 앱 (Electron) 실행
pnpm up                 # 웹 버전: 설치 → 빌드 → http://127.0.0.1:5180
pnpm dev                # 개발 (웹 5181, 서버 5180)
pnpm dev:mock           # 실제 Todoist 없이 목업 데이터로
```

첫 화면에서 Todoist API 토큰을 넣는다(설정 → 연동 → 개발자).
AI 지시 바는 **agy(Antigravity CLI)**, **Claude(Anthropic)**, **Gemini API** 중 원하는 엔진을 선택하여 사용할 수 있습니다:
- **agy (추천)**: 시스템에 `agy`가 설치되어 있으면 별도 API 키 발급 없이 기존 Antigravity 인증으로 즉시 동작합니다. (기본 모델: `gemini-3.8-flash-low`)
- **Claude**: Anthropic API 키(`sk-ant-...`)를 입력하여 사용합니다. (기본 모델: `claude-opus-5`)
- **Gemini**: Google Gemini API 키(`AIzaSy...`)를 입력하여 사용합니다. (기본 모델: `gemini-2.5-flash`)
- 키 및 엔진이 없으면 상단 바는 Todoist 기본 빠른 추가(Quick Add)로 동작합니다.
- 설정은 `.data/config.json`(권한 600)에만 저장됩니다.

## 기능

| 영역 | 내용 |
|---|---|
| 캘린더 | 월/주 전환, 날짜별 남은 개수, 다 끝낸 날 도장, 프로젝트 색 점·제목 미리보기, 스와이프로 넘기기 |
| 날짜 목록 | 프로젝트(목표)별 묶음, 프로젝트별 인라인 추가, 진행률, 완료 항목 보기/숨기기 |
| 할 일 | 체크(실행 취소 토스트), 우선순위 색, 시간·소요시간, 반복 ↻, 마감일 ⚑, 라벨, 하위 할 일 |
| 일정/카테고리 이동 | 캘린더 칸으로 끌어놓기(일정 변경), 날짜 패널 내 카테고리로 끌어놓기(프로젝트 이동) |
| 알림 (무료 지원) | 데스크탑 OS 네이티브 알림 & 웹 푸시 알림, 일정 시간 도래 시 알림 발송, 할 일별 개별 알림 설정 (Todoist 유료 플랜 없이도 동작) |
| 편집 시트 | 제목·메모·날짜·시간·소요·마감·반복 문구·우선순위·프로젝트·라벨·알림 설정·하위 할 일 |
| 밀린 할 일 | 오늘 화면 상단 접이식 배너, 한 번에 오늘로 |
| 날짜 없음 | 서랍(`I`), 캘린더로 끌어 놓기, 서랍으로 끌면 날짜 제거 |
| AI 지시 | "내일 3시 치과, 금요일까지 보고서 p1" → agy 또는 Claude가 Todoist MCP 도구로 파싱 및 등록 |
| 기타 | 프로젝트 숨기기, 주 시작 요일, 다크 모드, PWA 설치, 단축키 |

단축키: `⌘K` 지시 · `←/→` 하루 · `↑/↓` 한 주 · `T` 오늘 · `W` 월/주 · `I` 날짜 없음 · `Esc` 닫기

## 구조

```
electron/         데스크탑 앱 메인 프로세스 (main.js, preload.js) - 시스템 트레이, 네이티브 알림
server/index.ts   Hono: /api/td/* → api.todoist.com/api/v1 프록시, /api/config, /api/agent, dist 서빙
server/agent.ts   agy CLI / Claude / Gemini 를 통해 @doist/todoist-mcp 도구를 실행하는 에이전트 루프
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
| `PORT` | 5180 | 서버 포트 |
| `HOST` | 127.0.0.1 | 외부 노출 시 `TODOCAL_PASSCODE` 필요 |
| `TODOCAL_AI_PROVIDER` | 자동 감지 (`agy` → `claude` → `gemini`) | 사용할 AI 공급자 (`agy` \| `claude` \| `gemini`) |
| `TODOCAL_MODEL` | `gemini-3.8-flash-low` (agy) / `claude-opus-5` (Claude) | 지시 바 모델 |
| `TODOIST_API_TOKEN` | | Todoist 개인 API 토큰 |
| `ANTHROPIC_API_KEY` | | Anthropic API 키 (Claude 선택 시) |
| `GEMINI_API_KEY` | | Google Gemini API 키 (Gemini 선택 시) |
