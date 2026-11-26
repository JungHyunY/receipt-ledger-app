const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const pptxgen = require('pptxgenjs');
const { inferChurchCode } = require('./church_rules');

/**
 * 2026년 교회 유년부 회계장부 엑셀 생성
 * 1월 ~ 12월 월별 시트에 영수증(지출) 및 수입/찬조 내역을 일자순으로 정렬하여 배치
 * 비금전 찬조 물품은 별도 '찬조물품대장' 시트에 감사 증빙용으로 출력
 */
async function generateChurchLedgerExcel(records = [], incomeRecords = []) {
  const templatePath = path.join(__dirname, 'church_template.xlsx');
  const workbook = new ExcelJS.Workbook();
  
  if (fs.existsSync(templatePath)) {
    await workbook.xlsx.readFile(templatePath);
  } else {
    // 템플릿 없을 시 기본 시트 생성
    const ws = workbook.addWorksheet('1월');
    ws.addRow(['코드', '月', '日', '내    용', '영수 No.', '수입금액', '지출금액', '남은금액']);
  }

  // 지출 레코드 정규화
  const expenseEntries = (records || []).map(r => ({
    type: 'expense',
    date: r.date || '',
    code: r.code || inferChurchCode(r.merchant, r.items, r.memo).code,
    merchant: r.merchant || '',
    items: r.items || '',
    quantity: Number(r.quantity) || 1,
    amount: Number(r.amount) || 0,
    memo: r.memo || ''
  }));

  // 수입 레코드 정규화 (금전 수입)
  const monetaryIncomes = (incomeRecords || []).filter(i => !i.isInKind).map(i => ({
    type: 'income',
    date: i.date || '',
    code: i.code || 'A01',
    donator: i.donator || '',
    itemName: i.itemName || i.codeLabel || '청구액',
    quantity: Number(i.quantity) || 1,
    amount: Number(i.amount) || 0,
    memo: i.memo || ''
  }));

  // 비금전 찬조 물품 레코드
  const inKindItems = (incomeRecords || []).filter(i => i.isInKind);

  // 지출 + 금전 수입을 일자순으로 통합
  const allMonthlyEntries = [...expenseEntries, ...monetaryIncomes].sort((a, b) =>
    (a.date || '').localeCompare(b.date || '')
  );

  // 월별 그룹화 (1월 ~ 12월)
  const monthlyGroups = {};
  allMonthlyEntries.forEach(rec => {
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

    // 신규 작성을 위해 해당 월의 샘플 데이터 영역(Row 6부터 누계 전까지) 초기화
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
      const row = ws.getRow(startRow++);
      row.getCell(1).value = item.code;
      row.getCell(2).value = item.month;
      row.getCell(3).value = item.day;

      if (item.type === 'income') {
        // 수입 행
        const donatorPrefix = item.donator ? `[${item.donator}] ` : '';
        row.getCell(4).value = `(수입) ${donatorPrefix}${item.itemName}`.trim();
        row.getCell(5).value = ''; // 영수 No 없음
        row.getCell(6).value = item.amount;
        row.getCell(7).value = '';
        row.getCell(6).numFmt = '#,##0';
      } else {
        // 지출 행
        const qtySuffix = (item.quantity && Number(item.quantity) > 1) ? ` ${item.quantity}개` : '';
        const content = `${item.merchant || ''} - ${item.items || '물품구입'}${qtySuffix}`.trim();
        row.getCell(4).value = content;
        row.getCell(5).value = receiptSeq++;
        row.getCell(6).value = '';
        row.getCell(7).value = item.amount;
        row.getCell(7).numFmt = '#,##0';
      }
      row.commit();
    });
  });

  // 찬조 물품(비금전 기증)이 있는 경우 별도 시트 '찬조물품대장' 생성/작성
  if (inKindItems.length > 0) {
    let inKindWs = workbook.getWorksheet('찬조물품대장');
    if (inKindWs) workbook.removeWorksheet(inKindWs.id);
    inKindWs = workbook.addWorksheet('찬조물품대장');

    // Title & Headers
    inKindWs.mergeCells('A1:G1');
    const titleCell = inKindWs.getCell('A1');
    titleCell.value = '교회 유년부 찬조 및 후원 물품 관리대장';
    titleCell.font = { name: '맑은 고딕', size: 14, bold: true, color: { argb: 'FF004A3D' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    inKindWs.getRow(1).height = 32;

    const headers = ['연번', '일자', '과목코드', '기증자(성도/교사)', '품목명(기증물품)', '수량', '환산추정가(원)', '용도 및 비고'];
    const headerRow = inKindWs.getRow(3);
    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = h;
      cell.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF005B4B' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' }, left: { style: 'thin' },
        bottom: { style: 'thin' }, right: { style: 'thin' }
      };
    });
    headerRow.height = 24;

    inKindItems.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    let rowIdx = 4;
    inKindItems.forEach((item, idx) => {
      const row = inKindWs.getRow(rowIdx++);
      row.getCell(1).value = idx + 1;
      row.getCell(2).value = item.date;
      row.getCell(3).value = item.code || 'A07';
      row.getCell(4).value = item.donator || '익명';
      row.getCell(5).value = item.itemName;
      row.getCell(6).value = `${item.quantity || 1}개`;
      row.getCell(7).value = item.amount || 0;
      row.getCell(8).value = item.memo || '';

      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(2).alignment = { horizontal: 'center' };
      row.getCell(3).alignment = { horizontal: 'center' };
      row.getCell(4).alignment = { horizontal: 'center' };
      row.getCell(6).alignment = { horizontal: 'center' };
      row.getCell(7).alignment = { horizontal: 'right' };
      row.getCell(7).numFmt = '#,##0';

      for (let c = 1; c <= 8; c++) {
        row.getCell(c).border = {
          top: { style: 'thin', color: { argb: 'FFD5CEC5' } },
          left: { style: 'thin', color: { argb: 'FFD5CEC5' } },
          bottom: { style: 'thin', color: { argb: 'FFD5CEC5' } },
          right: { style: 'thin', color: { argb: 'FFD5CEC5' } }
        };
      }
    });

    inKindWs.getColumn(1).width = 8;
    inKindWs.getColumn(2).width = 14;
    inKindWs.getColumn(3).width = 12;
    inKindWs.getColumn(4).width = 16;
    inKindWs.getColumn(5).width = 24;
    inKindWs.getColumn(6).width = 10;
    inKindWs.getColumn(7).width = 16;
    inKindWs.getColumn(8).width = 28;
  }

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
