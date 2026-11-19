# Receipt Ledger (영수증 회계장부 정리 프로그램)

> **경량 로컬 웹 기반 스마트 영수증 정리 & 엑셀 템플릿 자동 매핑 및 감사 보고서 생성기**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-v18+-green.svg)](https://nodejs.org/)
[![Design System](https://img.shields.io/badge/Design_System-YDS_Tactical_Light-005B4B.svg)](https://github.com/JungHyunY/yoonikon-design-system)

---

## 🧭 개요 (Overview)

**Receipt Ledger**는 종이 영수증 사진(JPG, PNG, WebP)이나 전자 영수증 PDF를 업로드하면 **멀티모달 비전 LLM(Ollama)**을 활용하여 거래일자, 가맹점 상호명, 품목, 결제수단, 공급가액, 부가세, 합계금액을 자동으로 정밀 추출하고, 사용자의 기존 **엑셀 회계 장부 서식(.xlsx)**에 맞춰 1:1 매핑 후 날짜순으로 정렬하여 채워 넣는 경량 회계 자동화 도구입니다.

---

## ✨ 핵심 기능 (Key Features)

1. **Ollama 비전 LLM 자동 파싱**:
   - 로컬 또는 Tailscale Mesh 원격 Ollama 서버 연동
   - 한국어 비정형 영수증/세금계산서의 핵심 메타데이터를 정형 JSON으로 추출
2. **동적 엑셀 템플릿 매핑 (Dynamic Excel Mapper)**:
   - 사용자가 임의의 회계 장부 `.xlsx` 파일을 업로드하면 열(Column) 헤더를 자동 분석
   - 엑셀의 원본 디자인(폰트, 테두리, 수식, 서식)을 100% 보존하며 데이터 행 추가
   - 별도 템플릿이 없는 경우 기본 표준 장부 양식으로 자동 생성
3. **감사 제출용 다중 출력 (Audit Export Suite)**:
   - **엑셀(.xlsx)**: 일자별로 오름차순 정렬된 장부 내보내기
   - **감사용 PDF**: 1페이지 요약 목록표 + 2페이지부터 날짜순 원본 영수증 증빙철 A4 바인딩
   - **감사보고서 PPTX**: 16:9 와이드 슬라이드에 좌측 메타데이터 표 + 우측 원본 영수증 1:1 대조 배치
4. **YDS Tactical Light 테마**:
   - 장시간 장부 검토 시 시각적 피로도를 최소화하는 YDS 웜 아이보리/캔버스 라이트 테마 적용
   - 인라인 테이블 직접 수정 및 원본 영수증 팝업 뷰어 제공

---

## 🚀 빠른 시작 (Quick Start)

### 1. 설치 (Installation)

```bash
git clone https://github.com/JungHyunY/receipt-ledger-app.git
cd receipt-ledger-app
npm install
```

### 2. 실행 (Run)

- **Windows 원클릭 실행**: `start.bat` 더블클릭
- **콘솔 실행**:
  ```bash
  npm start
  ```
- 서버가 실행되면 브라우저에서 **[http://localhost:3980](http://localhost:3980)**으로 자동 접속됩니다.

---

## ⚙️ AI 환경 설정

- 기본적으로 상단 `AI 설정` 버튼을 통해 Ollama 호스트 주소와 비전 모델을 언제든 변경할 수 있습니다.
  - **호스트 주소**: `http://localhost:11434` 또는 원격 IP / Tailscale URL
  - **권장 모델**: `gemma4:latest`, `llama3.2-vision`, `qwen2.5-vl` 등

---

## 📄 라이선스 (License)

MIT License.
