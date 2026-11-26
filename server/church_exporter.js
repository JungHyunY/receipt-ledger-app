const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const pptxgen = require('pptxgenjs');
const { inferChurchCode } = require('./church_rules');

/**
 * 2026년 교회 유년부 회계장부 엑셀 생성
 * 1월 ~ 12월 월별 시트에 영수증 내역을 정렬하여 배치
 */
async function generateChurchLedgerExcel(records) {
  const templatePath = path.join(__dirname, 'church_template.xlsx');
  const workbook = new ExcelJS.Workbook();
  
  if (fs.existsSync(templatePath)) {
    await workbook.xlsx.readFile(templatePath);
  } else {
    // 템플릿 없을 시 기본 시트 생성
    const ws = workbook.addWorksheet('1월');
    ws.addRow(['코드', '月', '日', '내    용', '영수 No.', '수입금액', '지출금액', '남은금액']);
  }

  // records 정렬 (일자 오름차순)
  const sorted = [...(records || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // 월별 그룹화 (1월 ~ 12월)
  const monthlyGroups = {};
  sorted.forEach(rec => {
    let month = 1;
    let day = 1;
    if (rec.date) {
      const parts = rec.date.split('-');
      if (parts.length >= 2) month = parseInt(parts[1], 10) || 1;
      if (parts.length >= 3) day = parseInt(parts[2], 10) || 1;
    }
    const monthKey = `${month}월`;
    if (!monthlyGroups[monthKey]) monthlyGroups[monthKey] = [];
    monthlyGroups[monthKey].push({ ...rec, month, day });
  });

  // 각 월별 시트에 데이터 추가
  Object.entries(monthlyGroups).forEach(([monthKey, list]) => {
    let ws = workbook.getWorksheet(monthKey);
    if (!ws) {
      ws = workbook.addWorksheet(monthKey);
      ws.addRow(['코드', '月', '日', '내    용', '영수 No.', '수입금액', '지출금액', '남은금액']);
    }

    // 신규 영수증 작성을 위해 해당 월의 샘플 데이터 영역(Row 6부터 누계 전까지) 초기화
    for (let r = 6; r <= 35; r++) {
      const cell4 = ws.getCell(r, 4).value;
      if (cell4 === '누계' || cell4 === '월계') break;
      for (let c = 1; c <= 7; c++) {
        ws.getCell(r, c).value = null;
      }
    }

    let startRow = 6;
    let receiptSeq = 1;
    list.forEach(item => {
      const code = item.code || inferChurchCode(item.merchant, item.items, item.memo).code;
      const row = ws.getRow(startRow++);
      
      const qtySuffix = (item.quantity && Number(item.quantity) > 1) ? ` ${item.quantity}개` : '';
      const content = `${item.merchant || ''} - ${item.items || '물품구입'}${qtySuffix}`.trim();

      row.getCell(1).value = code;                           // 코드
      row.getCell(2).value = item.month;                     // 月
      row.getCell(3).value = item.day;                       // 日
      row.getCell(4).value = content;                        // 내용 (가맹점 - 품목 수량개)
      row.getCell(5).value = receiptSeq++;                   // 영수 No.
      row.getCell(6).value = '';                             // 수입금액
      row.getCell(7).value = Number(item.amount) || 0;       // 지출금액
      
      // 통화 서식
      row.getCell(7).numFmt = '#,##0';
      row.commit();
    });
  });

  const exportFileName = `교회회계장부_${Date.now()}.xlsx`;
  const exportPath = path.join(__dirname, '..', 'uploads', exportFileName);
  await workbook.xlsx.writeFile(exportPath);
  return { exportPath, exportFileName };
}

/**
 * 2026 감사준비 출력용 파일 (한 장당 영수증 4개 2x2 배치 PPTX 생성)
 */
async function generateChurchAuditPptx(records) {
  const sorted = [...(records || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const pptx = new pptxgen();

  // A4 세로 규격 설정 (너비 8.27in, 높이 11.69in)
  pptx.defineLayout({ name: 'A4_PORTRAIT', width: 8.27, height: 11.69 });
  pptx.layout = 'A4_PORTRAIT';

  // 4개씩 슬라이드 분할 (2x2 그리드)
  const itemsPerSlide = 4;
  const totalSlides = Math.ceil(sorted.length / itemsPerSlide) || 1;

  for (let s = 0; s < totalSlides; s++) {
    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };

    // 타이틀 영역
    slide.addText('지출 결의 및 영수증 증빙철', {
      x: 0.4,
      y: 0.4,
      w: 7.47,
      h: 0.4,
      fontSize: 16,
      bold: true,
      color: '000000',
      align: 'center'
    });

    const chunk = sorted.slice(s * itemsPerSlide, (s + 1) * itemsPerSlide);

    // 2x2 그리드 좌표 정의 (인치 단위)
    const positions = [
      { x: 0.4, y: 1.0, w: 3.6, h: 4.8 },   // 좌상 (1)
      { x: 4.2, y: 1.0, w: 3.6, h: 4.8 },   // 우상 (2)
      { x: 0.4, y: 6.2, w: 3.6, h: 4.8 },   // 좌하 (3)
      { x: 4.2, y: 6.2, w: 3.6, h: 4.8 },   // 우하 (4)
    ];

    chunk.forEach((item, idx) => {
      const pos = positions[idx];
      const receiptNo = s * itemsPerSlide + (idx + 1);
      
      let month = 7;
      if (item.date) {
        const parts = item.date.split('-');
        if (parts.length >= 2) month = parseInt(parts[1], 10) || 7;
      }
      const labelText = `${month}월 - ${receiptNo}`;

      // 라벨 박스 (상단 헤더)
      slide.addText(labelText, {
        x: pos.x,
        y: pos.y,
        w: pos.w,
        h: 0.35,
        fontSize: 12,
        bold: true,
        color: '000000',
        fill: { color: 'F1F5F9' },
        line: { color: 'CBD5E1', width: 1 },
        align: 'center',
        valign: 'middle'
      });

      // 영수증 상세 요약 라벨 (가맹점 / 금액 / 수량)
      const qtyText = (item.quantity && Number(item.quantity) > 1) ? ` (${item.quantity}개)` : '';
      const detailText = `${item.merchant || '가맹점'} | ${(Number(item.amount) || 0).toLocaleString()}원${qtyText}`;
      slide.addText(detailText, {
        x: pos.x,
        y: pos.y + 0.36,
        w: pos.w,
        h: 0.25,
        fontSize: 9,
        color: '64748B',
        align: 'center'
      });

      // 외곽 프레임 박스 (영수증 붙이는 자리)
      slide.addShape(pptx.ShapeType.rect, {
        x: pos.x,
        y: pos.y + 0.65,
        w: pos.w,
        h: pos.h - 0.7,
        fill: { color: 'FAFAFA' },
        line: { color: 'E2E8F0', width: 1, dashType: 'dash' }
      });

      // 실물 영수증 이미지 첨부
      const imgTarget = item.filePath || item.imagePath;
      if (imgTarget) {
        const fullImgPath = path.isAbsolute(imgTarget) 
          ? imgTarget 
          : path.join(__dirname, '..', imgTarget.replace(/^\//, ''));
          
        if (fs.existsSync(fullImgPath)) {
          slide.addImage({
            path: fullImgPath,
            x: pos.x + 0.1,
            y: pos.y + 0.75,
            w: pos.w - 0.2,
            h: pos.h - 0.9,
            sizing: { type: 'contain', w: pos.w - 0.2, h: pos.h - 0.9 }
          });
        }
      } else {
        // 이미지가 없을 때 플레이스홀더
        slide.addText('(영수증 원본 이미지 부착 공간)', {
          x: pos.x + 0.2,
          y: pos.y + 2.0,
          w: pos.w - 0.4,
          h: 0.5,
          fontSize: 10,
          color: '94A3B8',
          align: 'center'
        });
      }
    });
  }

  const exportFileName = `감사준비_영수증증빙철_${Date.now()}.pptx`;
  const exportPath = path.join(__dirname, '..', 'uploads', exportFileName);
  await pptx.writeFile({ fileName: exportPath });
  return { exportPath, exportFileName };
}

module.exports = {
  generateChurchLedgerExcel,
  generateChurchAuditPptx,
};
