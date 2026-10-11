# MeokGirok (먹기록)

식품 영양성분표나 음식 사진을 찍으면 Claude가 칼로리·영양소를 읽어 기록하고, 하루 권장량 대비 달성률을 자동으로 계산해 주는 식단 기록 서비스.

## 기능
- 📷 사진 분석: 영양성분표(라벨)는 인쇄된 값을 읽고, 음식 사진은 1인분 양을 추정
- 분석 결과를 저장 전에 확인·수정 (여러 음식이면 선택, 섭취량 배수 조절)
- 내 정보(성별/나이/키/몸무게/활동량/목표) → Mifflin-St Jeor 공식으로 권장 칼로리와 탄단지·당류·식이섬유·나트륨 기준 계산
- 하루 달성률(링 + 영양소별 막대), 날짜 이동, 최근 7일 칼로리 그래프
- 직접 입력 지원

## 실행
```bash
npm install
cp .env.example .env   # ANTHROPIC_API_KEY 입력
npm start              # http://localhost:3000
npm test
```
휴대폰에서 쓰려면 같은 네트워크에서 `http://<PC IP>:3000` 으로 접속하세요(카메라 촬영 가능).

## 구조
- `src/server.js` Express API · `src/analyze.js` Claude 비전 분석(구조화 출력) · `src/nutrition.js` 권장량 계산 · `src/store.js` JSON 파일 저장(`data/`, git 제외)
- `public/` 모바일 우선 웹 UI (프레임워크 없음)

## 주의
- 이 저장소는 Public입니다. `.env`와 `data/`는 커밋되지 않도록 설정되어 있습니다.
- 권장량·AI 추정값은 참고용이며 의학적 조언이 아닙니다.
