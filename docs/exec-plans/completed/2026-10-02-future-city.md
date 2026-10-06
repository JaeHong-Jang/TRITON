# 미래도시 콘솔 개편

## 목표
참조 이미지의 흰 로봇과 구조적인 미래도시를 바탕으로 콘솔·작업실·법정을 개편한다. 실제 실행 상태와 사람 판결 흐름을 보존한다.

## 완료 기준
- 통일된 셸·공통 패널·등록·대시보드
- 넓은 여섯 센터 작업실과 미래 법정, 재사용 로봇
- 공개 조건 및 등록 흐름 회귀 없음
- 전체 검증 및 독립 리뷰, 데스크톱·모바일 화면 확인

## 소유
- root: 문서, 진행 현황, 공통 셸·스타일, 대시보드, 사건 접수, 생성 자산, 통합 검증
- city_court: scene2d/, CourtPage.tsx, features/court/court.css, ui/RobotAvatar.tsx
- city_office: console/office/, AgentsPage.tsx
- 독립 reviewer: 읽기 전용 코드·화면 리뷰

새 의존성 없음. 기존 작업 및 API 상태 전이 보존.

## 검증 기록

- 전체 verify.sh: 하네스 125개 파일·위반 0건, 백엔드 173개 통과·원천 표본 1개 건너뜀, 프론트 107개 통과, TypeScript·Vite 통과.
- 모의 390px: 새 기사 등록 → 법정 이동, 첫인상 전 AI 의견·천칭 비공개 확인.
- 도시 배경은 내장 image_gen 생성 자산이며 프롬프트는 public/art/future-city-prompt.md에 보존.
- 브라우저 첫 검토에서 작업실 SVG 기본 fill, 로봇/명패 겹침, 법정의 배경 높이 대응을 발견해 보완.
- 실제 Ollama 미연결. 실제 모델을 요구하는 verify.sh --ui는 실행하지 않았고 CUA 브라우저로 UI를 확인. 재판 모델 품질·속도는 이번 변경의 검증 범위 밖.

## 완료

- 셸/공통 스타일: ConsoleShell.tsx, console.css, parts.tsx, index.css, ui/styles.ts, index.html.
- 대시보드/등록: DashboardPage.tsx, DocketPage.tsx. 등록 요청·멱등 처리·API 전이는 보존.
- 작업실: OfficeMap.tsx, office.css, AgentsPage.tsx. 여섯 센터·상세 선택·모바일 전체/확대, 실제 working 기반 애니메이션.
- 법정: scene2d/ 시각 컴포넌트·팔레트·스타일, CourtPage.tsx, court.css, 공용 ui/RobotAvatar.tsx.
- 공용 로봇으로 작업실/법정의 중복 표현을 줄임. 새 패키지 없음.
- 독립 리뷰: 긴 작업 상태의 배지 넘침 1건 수정 후 APPROVE, 남은 지적 0건.
- 최종 변경 후 npm run build·하네스·git diff --check 통과. 회귀 테스트는 위 기록과 같고, 최종 보완은 시각 표현과 지도 확대 조작에 한정.
- CUA: 1440×1000·390×844, 모바일 지도 전체/확대(980px 지도/390px 페이지), 센터 선택, 근거 #6 Enter 선택(data-on=1), 첫인상 가림, 기사 직접 등록을 확인.
- 실제 :8010 정적 빌드 반영 및 대시보드 표시 확인. 모의 :5292는 시연 배지와 저장 기록 상태를 표시.
- 화면 증거: .omx/artifacts/future-city/ 아래 dashboard.jpg, office-desktop.jpg, office-mobile.jpg, court-desktop.jpg, court-mobile.jpg. dashboard-final.jpg는 실제 서버의 기본 좁은 패널 화면.
- 한계: 좁은 법정/전체 지도는 공간 개요이며 세부 문구는 HTML 패널 또는 확대 화면에서 읽는다. 실제 A.X 실행은 Ollama 연결 후 별도 검증 필요.
