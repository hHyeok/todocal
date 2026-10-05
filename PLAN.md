# todocal — Todoist 캘린더 (TodoMate 스타일)

Todoist 캘린더 뷰(유료) 대체. Todoist API v1 + Todoist MCP + Claude API.

## 구조

| 영역 | 내용 |
|---|---|
| `server/` | Hono. Todoist 프록시(`/api/td/*`), 설정(`/api/config`), AI 지시(`/api/agent`), 빌드 산출물 서빙 |
| `server/agent.ts` | `@doist/todoist-mcp` stdio 자식 프로세스 ↔ MCP 클라이언트 → Claude 도구 루프 |
| `server/mock.ts` | `TODOCAL_MOCK=1` 일 때 Todoist 대신 메모리 목업 (검증용) |
| `src/` | React PWA. 월/주 캘린더, 날짜별 목록, 편집 시트, 지시 바 |

## 합격 기준

1. 월 캘린더에 날짜별 남은 개수, 다 끝낸 날은 도장(✓) 표시. 주 보기 전환.
2. 날짜를 누르면 프로젝트(=TodoMate 목표)별로 묶인 목록. 프로젝트별 인라인 추가.
3. 체크/해제 즉시 반영(낙관적 업데이트) + 실행 취소 토스트.
4. 편집 시트: 제목·설명·날짜·시간·소요시간·우선순위·프로젝트·라벨·반복·마감일·하위 할 일, 오늘/내일/다음 주/날짜 없음, 삭제.
5. 할 일을 캘린더 날짜로 끌어다 놓으면 일정 변경. 반복 일정은 반복 유지(Sync `item_update`).
6. 밀린 할 일 배너 + 일괄 오늘로. 날짜 없는 할 일 서랍.
7. 지시 바: "내일 3시 치과, 금요일까지 보고서 p1" 같은 문장 → Claude가 Todoist MCP 도구로 처리. Anthropic 키 없으면 Todoist Quick Add로 대체.
8. 프로젝트 필터, 주 시작 요일, 다크 모드, PWA 설치, 키보드 단축키.
9. `pnpm up` 한 번으로 설치→빌드→실행.
10. 목업 모드에서 Playwright로 1~7 확인.
