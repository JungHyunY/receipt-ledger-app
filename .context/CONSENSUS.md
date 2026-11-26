# Project Consensus & Soul Snapshot (RECEIPT-LEDGER)
- Updated: 2026-11-26 16:04:02

## 1. Current Vibe & Next Step
- **Mode:** DEEP_ARCHITECT (집중/전력 질주)
- **Vibe Note:** BlueVenom 단일 베이스로의 전환 완료. 실시간 Dynpro 추출 파이프라인 검증 후 솔루션 퍼블리시 착수 대기 중.
- **Next First Step:** 다른 PC에 저장소 복사 또는 git pull 후 ReceiptLedger.vbs 더블클릭 구동
- **Completed:** 교회 서식 2종(장부/감사PPTX) 연동, 33개 계정코드 추천, QTY 수량 컬럼, 월별 탭(1~12월), SQLite DB 영구저장, 무음 포터블 런처(ReceiptLedger.vbs) 및 앱 종료 버튼 구축
- **Pending:** 다른 PC에서 git pull 후 ReceiptLedger.vbs 실행으로 동일 환경 사용 가능

## 2. Active Architecture & Product Decisions
- **[무음 1클릭 포터블 데스크톱 앱 모드 및 안전 종료]** ReceiptLedger.vbs + Edge App Mode(--app)로 검은 창 없이 독립 윈도우 앱으로 실행하고 웹 내 [앱 종료] 버튼 제공 _(이유: 터미널 콘솔 없이 더블클릭만으로 구동되는 초경량 포터블 환경)_
- **[SQLite(node:sqlite) 영구 데이터베이스 연동]** 단일 파일 data/receipts.db에 영수증 메타데이터, 코드, 수량, 파일경로 영구 저장 _(이유: 브라우저 새로고침이나 서버 재기동 시 데이터 보존)_
- **[월별 탭(1~12월) 네비게이션 및 실시간 합계 집계]** 상단에 전체 및 1~12월 탭 배치, 탭별 영수증 건수 뱃지 및 해당 월 지출 합계 실시간 산출 _(이유: 엑셀 시트별 관리 감각을 웹 화면에서 직관적으로 재현)_
- **[QTY(수량) 정규화 컬럼 분리 및 엑셀 출력 자동 합성]** DB/웹 그리드에는 quantity 독립 필드로 관리하고, 엑셀 출력 시 [가맹점 - 품목 N개]로 자동 결합 _(이유: 데이터 구조적 정규화와 기존 엑셀 서식 관례 동시 충족)_
- **[33개 계정코드 지능형 실시간 추천 및 카테고리별 드롭다운]** 영수증 상호/품목 텍스트 분석 기반 H04(간식비), G03(비품), C01(공과비) 등 실시간 추천 및 웹 그리드 선택기 제공 _(이유: 비전문가도 영수증 업로드 시 올바른 회계과목 자동 분류 및 1클릭 변경 지원)_
- **[교회 유년부 회계장부(2026) 및 4분할 A4 감사증빙철 서식 연동]** 2026년 유년부 회계장부.xls 1~12월 월별 시트에 영수 No./코드/지출금액 자동 기입 및 2026 감사준비 출력용파일-하반기.pptx A4 2x2 4분할 자동 배치 생성 _(이유: 교회 현행 장부 및 감사 서식 100% 호환)_
- **[GitHub 공개 저장소 퍼블리싱]** https://github.com/JungHyunY/receipt-ledger-app 공개 저장소 생성 및 main 브랜치 퍼블리싱 완료 _(이유: 어디서나 간편하게 클론 및 실행할 수 있도록 오픈소스 공개 저장소로 배포)_
- **[Receipt Ledger YDS Tactical Light 테마 적용 및 불필요한 배지/부제목 제거]** 배경 #FAF8F5, 카드 #FFFFFF, 브랜드 #005B4B 기반의 라이트 HUD 테마 적용. 헤더 부제목과 YDS LIGHT 배지, 사내/조직 종속적 문구를 전면 제거하고 심플 십자가(plus) 아이콘 적용. _(이유: 개인 및 범용 장부 정리 목적에 맞춘 극도의 시각적 피로도 감소와 가독성 극대화)_
- **[웹 기반 경량 영수증 회계장부 정리 프로그램 아키텍처 확정]** Node.js/Express 경량 로컬 서버(포트 3980), Tailscale 원격 Ollama(gemma4:latest) 비전 파싱, ExcelJS 기반 동적 컬럼 템플릿 매핑, pdf-lib 및 pptxgenjs 기반 감사용 증빙철 2종(A4 PDF / 16:9 PPTX) 출력 파이프라인 구축. _(이유: 별도 무거운 설치 없이 브라우저로 어디서나 접근 가능하며 임의의 엑셀 서식에 맞춘 동적 매핑 제공)_