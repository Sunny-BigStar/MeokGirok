# MeokGirok (먹기록)

식품 영양성분표나 음식 사진을 찍으면 Claude가 칼로리·영양소를 읽어 기록하고, 하루 권장량 대비 달성률을 자동으로 계산해 주는 식단 기록 서비스. 모바일 우선 웹앱(PWA)이며 프레임워크 없이 Node.js + Express + 바닐라 JS로 만들었습니다.

## 기능
**기록**
- 📷 사진 분석: 영양성분표(라벨)는 인쇄된 값을 읽고, 음식 사진은 1인분 양을 추정
- 저장 전 확인·수정: 여러 음식이면 선택, 섭취량 빠른 선택(×0.5~×2, 라벨에 총 제공 횟수가 있으면 "전체")
- 결과가 틀리면 "밥은 반 공기"처럼 설명을 적어 다시 분석
- AI 결과 자동 검증: 범위를 벗어난 값 보정, 칼로리와 탄·단·지가 안 맞으면 경고
- 끼니 구분(시간대로 자동 선택), 기록 수정/삭제, 직접 입력
- 자주 먹는 음식(최근 30일) 한 번에 재기록, 전날 식단 통째로 복사

**분석**
- 내 정보(성별/나이/키/몸무게/활동량/목표) → Mifflin-St Jeor 공식으로 권장 칼로리와 탄단지·당류·식이섬유·나트륨 기준 계산
- 하루 달성률(링 + 영양소별 막대), 날짜 이동, 최근 7일 칼로리 그래프
- 주간 리포트: 기록한 날 평균, 탄단지 비율, 권장량 ±10% 달성일, 부족/과다 영양소 안내
- 체중 기록과 추이 그래프 — 최신 체중으로 권장량 자동 재계산

**운영**
- 선택형 비밀번호 보호, CSP 등 보안 헤더, 분석 호출 횟수 제한
- 전체 기록 CSV 내보내기, 홈 화면 설치(PWA)와 화면 오프라인 캐시

## 실행
```bash
npm install
cp .env.example .env   # ANTHROPIC_API_KEY 입력 (PowerShell: Copy-Item .env.example .env)
npm start              # http://localhost:3000
```
| 명령 | 설명 |
|---|---|
| `npm start` | 서버 실행 (`.env` 자동 로드) |
| `npm run dev` | 파일 변경 시 자동 재시작 |
| `npm run start:mock` | API 키 없이 가짜 분석 결과로 UI 확인 |
| `npm test` | 단위/API 테스트 |

휴대폰에서 쓰려면 같은 네트워크에서 `http://<PC IP>:3000` 으로 접속하세요(카메라 촬영 가능). 홈 화면에 추가하면 앱처럼 열립니다.

### 환경 변수 (`.env`)
| 변수 | 기본값 | 설명 |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Claude API 키 (`ant auth login` 프로필로 대체 가능) |
| `CLAUDE_MODEL` | `claude-opus-5-5` | 사진 분석 모델 |
| `PORT` | `3000` | 서버 포트 |
| `APP_PASSWORD` | (없음) | 설정하면 비밀번호 로그인 필요 |
| `ANALYZE_LIMIT` | `20` | IP당 10분간 사진 분석 허용 횟수 |
| `DATA_DIR` | `data` | 기록 저장 폴더 |

## 구조
```
src/server.js     실행 진입점 (--mock 지원)
src/app.js        Express API, 보안 헤더, 호출 제한
src/analyze.js    Claude 비전 분석(구조화 출력) + 결과 검증(sanitizeResult)
src/nutrition.js  권장량 계산, 주간 리포트, 날짜 검증 (순수 함수)
src/store.js      JSON 파일 저장 (직렬화된 쓰기, 손상 시 백업)
src/auth.js       선택형 비밀번호 인증 (HMAC 쿠키)
public/           모바일 우선 웹 UI, 서비스 워커, 매니페스트
test/             node:test 기반 테스트
```

### API
`GET/PUT /api/profile` · `POST /api/analyze` · `GET /api/summary?date=` · `GET /api/recent` ·
`POST /api/entries` · `PUT|DELETE /api/entries/:id` · `POST /api/entries/copy` ·
`GET/PUT /api/weights` · `DELETE /api/weights/:date` · `GET /api/export.csv` · `POST /api/login|logout`

## 보안/운영 메모
- 이 저장소는 Public입니다. `.env`와 `data/`는 `.gitignore`로 제외돼 있으니 키를 커밋하지 마세요.
- 기본값은 인증 없음입니다. 집 밖/공용 네트워크에서 쓰려면 `APP_PASSWORD`를 설정하세요(HttpOnly·SameSite 쿠키, 로그인 5회 실패 시 10분 잠금). 인터넷에 직접 노출할 때는 HTTPS 리버스 프록시를 함께 쓰세요(HTTPS면 쿠키에 Secure 자동 부여).
- `/api/analyze`는 유료 API를 호출합니다. IP당 호출 제한과 60초 타임아웃이 있습니다.
- 서비스 워커는 화면 파일만 캐시하고 식단 데이터는 캐시하지 않습니다. 오프라인에서는 기록 조회/입력이 되지 않습니다.
- `data/db.json`이 손상되면 `db.json.corrupt-<시각>`으로 백업하고 빈 상태로 시작합니다. 정기적으로 CSV로 내보내 두세요.
- 단일 사용자용입니다(계정 구분 없음).

## 한계
- 권장량은 일반 공식 기반 추정치이고 AI 분석값은 오차가 있습니다(특히 음식 사진의 양 추정). 의학적 조언이 아닙니다.
- 사진은 서버에 저장하지 않으며 분석 요청 시 Anthropic API로만 전송됩니다.
