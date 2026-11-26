const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const ExcelJS = require('exceljs');
const { PDFDocument, rgb } = require('pdf-lib');
const { generateChurchLedgerExcel, generateChurchAuditPptx } = require('./church_exporter');
const { ALL_CHURCH_CODES, ALL_INCOME_CODES, inferChurchCode } = require('./church_rules');
const {
  getAllReceipts,
  getReceiptById,
  insertReceipt,
  updateReceipt,
  deleteReceipt,
  clearAllReceipts,
  getBudgetItems,
  saveBudgetItems,
  getBudgetSummary,
  simulateNextYearBudget,
  getAllIncome,
  getIncomeById,
  insertIncome,
  updateIncome,
  deleteIncome,
  getIncomeSummary,
  exportDatabaseBackup,
  restoreDatabaseBackup
} = require('./db');

const app = express();
const PORT = process.env.PORT || 3980;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const safeName = Date.now() + '-' + Buffer.from(file.originalname, 'latin1').toString('utf8').replace(/\s+/g, '_');
    cb(null, safeName);
  }
});
const upload = multer({ storage });

// In-memory application configuration (Ollama host, model, etc.)
let appConfig = {
  ollamaHost: 'https://mac-macbookpro.tailb1c684.ts.net',
  model: 'gemma4:latest',
  systemPrompt: `You are an expert receipt OCR parsing assistant.
Analyze the provided receipt/invoice image and extract information strictly in JSON format without markdown code fences.
Output schema:
{
  "date": "YYYY-MM-DD",
  "merchant": "상호명 또는 공급자명",
  "amount": 0,
  "tax": 0,
  "supplyAmount": 0,
  "paymentMethod": "카드/현금/계좌이체 등",
  "items": "구입 품목 요약",
  "memo": "추가 참고사항"
}
Rules:
- date must be formatted as YYYY-MM-DD. If year is missing, assume current year.
- amount, tax, supplyAmount must be numbers without commas or currency symbols.
- If uncertain about any field, leave empty string or 0, do not invent values.`
};

// 1. Configuration Endpoints
app.get('/api/config', (req, res) => {
  res.json(appConfig);
});

app.post('/api/config', (req, res) => {
  appConfig = { ...appConfig, ...req.body };
  res.json({ success: true, config: appConfig });
});

// Ollama Connection Test & Model List
app.get('/api/ollama/status', async (req, res) => {
  try {
    const https = require('https');
    const agent = new https.Agent({ rejectUnauthorized: false });
    const response = await axios.get(`${appConfig.ollamaHost}/api/tags`, {
      timeout: 5000,
      httpsAgent: agent
    });
    res.json({
      connected: true,
      host: appConfig.ollamaHost,
      activeModel: appConfig.model,
      models: response.data.models || []
    });
  } catch (error) {
    res.json({
      connected: false,
      host: appConfig.ollamaHost,
      activeModel: appConfig.model,
      error: error.message,
      hint: 'Ollama 호스트 연결 상태를 확인하세요'
    });
  }
});

// 2. Receipt Upload & Parse Endpoint
app.post('/api/receipts/parse', upload.single('receipt'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '영수증 파일이 업로드되지 않았습니다.' });
    }

    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');

    // Call Ollama Generate API with base64 image
    let extracted = {
      date: new Date().toISOString().split('T')[0],
      merchant: path.basename(req.file.originalname, fileExt),
      amount: 0,
      tax: 0,
      supplyAmount: 0,
      paymentMethod: '카드',
      items: '',
      memo: ''
    };

    try {
      const https = require('https');
      const agent = new https.Agent({ rejectUnauthorized: false });
      const ollamaRes = await axios.post(`${appConfig.ollamaHost}/api/generate`, {
        model: appConfig.model,
        prompt: `${appConfig.systemPrompt}\n\nParse this receipt and return only the JSON:`,
        images: [base64Data],
        stream: false,
        format: 'json'
      }, {
        timeout: 90000,
        httpsAgent: agent
      });

      if (ollamaRes.data && ollamaRes.data.response) {
        const text = ollamaRes.data.response.trim();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          extracted = { ...extracted, ...parsed };
        }
      }
    } catch (ollamaErr) {
      console.warn('Ollama 호출 실패 혹은 미구동 상태, 기본값 반환:', ollamaErr.message);
      extracted.memo = `(Ollama 파싱 대기: ${ollamaErr.message})`;
    }

    // 계정 코드 자동 추천 할당
    const inferred = inferChurchCode(extracted.merchant, extracted.items, extracted.memo);
    extracted.code = inferred.code;
    extracted.codeLabel = inferred.label;
    extracted.quantity = extracted.quantity || 1;

    // SQLite DB에 즉시 영구 저장
    const savedRecord = insertReceipt({
      id: req.file.filename,
      filePath: `/uploads/${req.file.filename}`,
      fileName: req.file.originalname,
      ...extracted
    });

    res.json({
      success: true,
      file: {
        id: req.file.filename,
        originalName: req.file.originalname,
        path: `/uploads/${req.file.filename}`,
        size: req.file.size
      },
      data: savedRecord
    });
  } catch (error) {
    console.error('영수증 처리 에러:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2-1. Receipts Database Endpoints (SQLite Persistence)
app.get('/api/receipts', (req, res) => {
  try {
    const list = getAllReceipts();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/receipts/manual', (req, res) => {
  try {
    const newId = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const inferred = inferChurchCode(req.body.merchant, req.body.items, req.body.memo);
    const item = insertReceipt({
      id: newId,
      date: req.body.date || new Date().toISOString().split('T')[0],
      merchant: req.body.merchant || '',
      items: req.body.items || '',
      quantity: Number(req.body.quantity) || 1,
      amount: Number(req.body.amount) || 0,
      tax: Number(req.body.tax) || 0,
      supplyAmount: Number(req.body.supplyAmount) || 0,
      paymentMethod: req.body.paymentMethod || '카드',
      code: req.body.code || inferred.code,
      codeLabel: req.body.codeLabel || inferred.label,
      memo: req.body.memo || '',
      filePath: req.body.filePath || null,
      fileName: req.body.fileName || null
    });
    res.json({ success: true, record: item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/receipts/:id', (req, res) => {
  try {
    const updated = updateReceipt(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: '영수증을 찾을 수 없습니다.' });
    res.json({ success: true, record: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/receipts/:id', (req, res) => {
  try {
    deleteReceipt(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/receipts/clear', (req, res) => {
  try {
    clearAllReceipts();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2-2. Church Code Master & Real-time Recommendation
app.get('/api/church/codes', (req, res) => {
  res.json(ALL_CHURCH_CODES);
});

app.get('/api/church/income-codes', (req, res) => {
  res.json(ALL_INCOME_CODES);
});

app.post('/api/church/recommend-code', (req, res) => {
  const { merchant, items, memo } = req.body;
  const result = inferChurchCode(merchant, items, memo);
  res.json(result);
});

// 2-3. Annual Budget Management Endpoints
app.get('/api/budget/:year', (req, res) => {
  try {
    const summary = getBudgetSummary(req.params.year);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/budget/:year', (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items 배열이 필요합니다.' });
    }
    const saved = saveBudgetItems(req.params.year, items);
    res.json({ success: true, items: saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/budget/simulate/:year', (req, res) => {
  try {
    const growthRate = parseFloat(req.query.growthRate) || 0;
    const simulation = simulateNextYearBudget(req.params.year, growthRate);
    res.json(simulation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/budget/apply-plan', (req, res) => {
  try {
    const { year, items } = req.body;
    if (!year || !Array.isArray(items)) {
      return res.status(400).json({ error: 'year와 items 배열이 필요합니다.' });
    }
    const saved = saveBudgetItems(year, items);
    res.json({ success: true, year, items: saved });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2-3-1. Budget Excel Export & Import Endpoints
app.get('/api/budget/:year/export-excel', async (req, res) => {
  try {
    const year = parseInt(req.params.year, 10) || new Date().getFullYear();
    const summary = getBudgetSummary(year);

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet(`${year}년도_예산`);

    // Title
    ws.mergeCells('A1:H1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `${year}년도 교회 유년부 연간 예산 배정표`;
    titleCell.font = { name: '맑은 고딕', size: 14, bold: true, color: { argb: 'FF004A3D' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 30;

    // Subtitle
    ws.mergeCells('A2:H2');
    const subCell = ws.getCell('A2');
    subCell.value = `총 예산: ${summary.totalBudget.toLocaleString()}원 | 실집행액: ${summary.totalSpent.toLocaleString()}원 | 잔여예산: ${summary.totalRemaining.toLocaleString()}원 (집행률 ${summary.overallBurnRate}%)`;
    subCell.font = { name: '맑은 고딕', size: 10, color: { argb: 'FF45403C' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 20;

    // Headers
    const headers = ['과목코드', '과목명', '분류', '배정예산(원)', '실집행액(원)', '잔여액(원)', '소진율(%)', '비고'];
    const headerRow = ws.getRow(4);
    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = h;
      cell.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF005B4B' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
    headerRow.height = 24;

    let rowIdx = 5;
    summary.items.forEach(item => {
      const row = ws.getRow(rowIdx++);
      row.getCell(1).value = item.code;
      row.getCell(2).value = item.codeLabel;
      row.getCell(3).value = item.category;
      row.getCell(4).value = item.budgetAmount;
      row.getCell(5).value = item.actualSpent;
      row.getCell(6).value = item.remaining;
      row.getCell(7).value = `${item.burnRate}%`;
      row.getCell(8).value = item.memo || '';

      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(3).alignment = { horizontal: 'center' };
      row.getCell(4).alignment = { horizontal: 'right' };
      row.getCell(5).alignment = { horizontal: 'right' };
      row.getCell(6).alignment = { horizontal: 'right' };
      row.getCell(7).alignment = { horizontal: 'center' };

      row.getCell(4).numFmt = '#,##0';
      row.getCell(5).numFmt = '#,##0';
      row.getCell(6).numFmt = '#,##0';

      for (let c = 1; c <= 8; c++) {
        row.getCell(c).border = {
          top: { style: 'thin', color: { argb: 'FFD5CEC5' } },
          left: { style: 'thin', color: { argb: 'FFD5CEC5' } },
          bottom: { style: 'thin', color: { argb: 'FFD5CEC5' } },
          right: { style: 'thin', color: { argb: 'FFD5CEC5' } }
        };
      }
    });

    ws.getColumn(1).width = 12;
    ws.getColumn(2).width = 24;
    ws.getColumn(3).width = 16;
    ws.getColumn(4).width = 18;
    ws.getColumn(5).width = 16;
    ws.getColumn(6).width = 16;
    ws.getColumn(7).width = 14;
    ws.getColumn(8).width = 24;

    const fileName = `${year}년도_유년부_예산배정표_${Date.now()}.xlsx`;
    const exportPath = path.join(__dirname, '..', 'uploads', fileName);
    await workbook.xlsx.writeFile(exportPath);
    res.download(exportPath, fileName);
  } catch (err) {
    console.error('예산 엑셀 내보내기 실패:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/budget/:year/import-excel', upload.single('budgetFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '업로드된 엑셀 파일이 없습니다.' });
    }

    const year = parseInt(req.params.year, 10) || new Date().getFullYear();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(req.file.path);
    const ws = workbook.worksheets[0];
    if (!ws) return res.status(400).json({ error: '유효한 워크시트가 없습니다.' });

    // 헤더 행 탐색
    let headerRowIdx = 1;
    let codeCol = 1;
    let amountCol = 4;
    let memoCol = 8;

    for (let r = 1; r <= 10; r++) {
      const row = ws.getRow(r);
      let foundCode = false;
      row.eachCell((cell, col) => {
        const val = String(cell.value || '').trim();
        if (val.includes('코드')) { codeCol = col; foundCode = true; }
        if (val.includes('예산') || val.includes('금액')) amountCol = col;
        if (val.includes('비고') || val.includes('메모')) memoCol = col;
      });
      if (foundCode) {
        headerRowIdx = r;
        break;
      }
    }

    const itemsToSave = [];
    for (let r = headerRowIdx + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const rawCode = String(row.getCell(codeCol).value || '').trim();
      if (!rawCode) continue;

      // Extract code like B01, H04, etc.
      const match = rawCode.match(/[A-Z]\d{2}/i);
      if (!match) continue;
      const code = match[0].toUpperCase();

      const rawAmount = row.getCell(amountCol).value;
      let amount = 0;
      if (typeof rawAmount === 'number') amount = rawAmount;
      else if (typeof rawAmount === 'string') amount = parseInt(rawAmount.replace(/[^0-9]/g, ''), 10) || 0;
      else if (rawAmount && typeof rawAmount === 'object' && rawAmount.result !== undefined) {
        amount = Number(rawAmount.result) || 0;
      }

      const memo = String(row.getCell(memoCol).value || '').trim();

      const foundMeta = ALL_CHURCH_CODES.find(c => c.code === code);
      itemsToSave.push({
        code,
        codeLabel: foundMeta ? foundMeta.label : '',
        category: foundMeta ? foundMeta.category : '',
        amount,
        memo
      });
    }

    if (itemsToSave.length === 0) {
      return res.status(400).json({ error: '엑셀 파일에서 유효한 회계 과목코드(B01, H04 등)를 찾을 수 없습니다.' });
    }

    const saved = saveBudgetItems(year, itemsToSave);
    res.json({ success: true, count: itemsToSave.length, year, items: saved });
  } catch (err) {
    console.error('예산 엑셀 가져오기 실패:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/budget/simulate/:year/export-excel', async (req, res) => {
  try {
    const curYear = parseInt(req.params.year, 10) || new Date().getFullYear();
    const rate = parseFloat(req.query.growthRate) || 0;
    const sim = simulateNextYearBudget(curYear, rate);

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet(`${sim.nextYear}년도_예산기획안`);

    // Title
    ws.mergeCells('A1:I1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `${sim.nextYear}년도 교회 유년부 예산안 기획 보고서 (${curYear}년 실집행 기반)`;
    titleCell.font = { name: '맑은 고딕', size: 14, bold: true, color: { argb: 'FF9B6E1F' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 30;

    // Subtitle
    ws.mergeCells('A2:I2');
    const subCell = ws.getCell('A2');
    const diffSign = sim.diffTotal >= 0 ? `+${sim.diffTotal.toLocaleString()}` : sim.diffTotal.toLocaleString();
    subCell.value = `올해총예산: ${sim.currentTotalBudget.toLocaleString()}원 | 올해실집행: ${sim.currentTotalSpent.toLocaleString()}원 | 차년도제안: ${sim.simulatedTotal.toLocaleString()}원 (증감: ${diffSign}원, 적용증감률 ${sim.growthRate}%)`;
    subCell.font = { name: '맑은 고딕', size: 10, color: { argb: 'FF45403C' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 20;

    // Headers
    const headers = ['코드', '과목명', '분류', '올해예산(원)', '올해실집행액(원)', '차년도제안예산(원)', '증감액(원)', '증감률(%)', '산출근거/비고'];
    const headerRow = ws.getRow(4);
    headers.forEach((h, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = h;
      cell.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC58F2C' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });
    headerRow.height = 24;

    let rowIdx = 5;
    sim.items.forEach(item => {
      const row = ws.getRow(rowIdx++);
      row.getCell(1).value = item.code;
      row.getCell(2).value = item.codeLabel;
      row.getCell(3).value = item.category;
      row.getCell(4).value = item.currentBudget;
      row.getCell(5).value = item.actualSpent;
      row.getCell(6).value = item.proposedAmount;
      row.getCell(7).value = item.diff;
      row.getCell(8).value = `${item.pctChange > 0 ? '+' : ''}${item.pctChange}%`;
      row.getCell(9).value = item.memo || '';

      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(3).alignment = { horizontal: 'center' };
      row.getCell(4).alignment = { horizontal: 'right' };
      row.getCell(5).alignment = { horizontal: 'right' };
      row.getCell(6).alignment = { horizontal: 'right' };
      row.getCell(7).alignment = { horizontal: 'right' };
      row.getCell(8).alignment = { horizontal: 'center' };

      row.getCell(4).numFmt = '#,##0';
      row.getCell(5).numFmt = '#,##0';
      row.getCell(6).numFmt = '#,##0';
      row.getCell(7).numFmt = '#,##0';

      for (let c = 1; c <= 9; c++) {
        row.getCell(c).border = {
          top: { style: 'thin', color: { argb: 'FFD5CEC5' } },
          left: { style: 'thin', color: { argb: 'FFD5CEC5' } },
          bottom: { style: 'thin', color: { argb: 'FFD5CEC5' } },
          right: { style: 'thin', color: { argb: 'FFD5CEC5' } }
        };
      }
    });

    ws.getColumn(1).width = 10;
    ws.getColumn(2).width = 24;
    ws.getColumn(3).width = 16;
    ws.getColumn(4).width = 16;
    ws.getColumn(5).width = 16;
    ws.getColumn(6).width = 18;
    ws.getColumn(7).width = 16;
    ws.getColumn(8).width = 12;
    ws.getColumn(9).width = 28;

    const fileName = `${sim.nextYear}년도_유년부_예산기획안_${Date.now()}.xlsx`;
    const exportPath = path.join(__dirname, '..', 'uploads', fileName);
    await workbook.xlsx.writeFile(exportPath);
    res.download(exportPath, fileName);
  } catch (err) {
    console.error('예산기획안 엑셀 내보내기 실패:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2-4. Income & Sponsorship/Donation Management Endpoints
app.get('/api/income', (req, res) => {
  try {
    const summary = getIncomeSummary(req.query.year);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/income', (req, res) => {
  try {
    const newId = `inc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const created = insertIncome({
      id: newId,
      date: req.body.date || new Date().toISOString().split('T')[0],
      code: req.body.code || 'A01',
      codeLabel: req.body.codeLabel || '',
      donator: req.body.donator || '',
      itemName: req.body.itemName || '',
      quantity: Number(req.body.quantity) || 1,
      amount: Number(req.body.amount) || 0,
      isInKind: req.body.isInKind === true || req.body.isInKind === 1 || req.body.isInKind === 'true',
      memo: req.body.memo || ''
    });
    res.json({ success: true, record: created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/income/:id', (req, res) => {
  try {
    const updated = updateIncome(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: '수입/찬조 내역을 찾을 수 없습니다.' });
    res.json({ success: true, record: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/income/:id', (req, res) => {
  try {
    deleteIncome(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2-5. Cross-PC Full Database Backup & Restore Endpoints (JSON)
app.get('/api/backup', (req, res) => {
  try {
    const backup = exportDatabaseBackup();
    const filename = `receipt-ledger-backup-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/restore', (req, res) => {
  try {
    const result = restoreDatabaseBackup(req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Excel Template Analysis Endpoint
app.post('/api/template/analyze', upload.single('template'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '엑셀 템플릿 파일이 필요합니다.' });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(req.file.path);
    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      return res.status(400).json({ error: '엑셀 워크시트를 찾을 수 없습니다.' });
    }

    // Detect header row (first row with multiple text columns)
    let headerRowIndex = 1;
    let headers = [];

    worksheet.eachRow((row, rowNumber) => {
      if (headers.length === 0) {
        const rowValues = [];
        row.eachCell((cell, colNumber) => {
          if (cell.value) {
            rowValues.push({
              colIndex: colNumber,
              colLetter: worksheet.getColumn(colNumber).letter,
              title: String(cell.value).trim()
            });
          }
        });
        if (rowValues.length >= 2) {
          headerRowIndex = rowNumber;
          headers = rowValues;
        }
      }
    });

    res.json({
      success: true,
      templateId: req.file.filename,
      sheetName: worksheet.name,
      headerRowIndex,
      headers
    });
  } catch (error) {
    console.error('템플릿 분석 에러:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4. Export Populated Excel
app.post('/api/export/excel', async (req, res) => {
  try {
    const { templateId, mappings, records } = req.body;
    // records: [{ date, merchant, amount, tax, supplyAmount, paymentMethod, items, memo }]
    // mappings: { [excelColIndex]: receiptFieldKey }

    let workbook = new ExcelJS.Workbook();
    let worksheet;
    let startRow = 2;

    if (templateId) {
      const templatePath = path.join(__dirname, '..', 'uploads', templateId);
      if (fs.existsSync(templatePath)) {
        await workbook.xlsx.readFile(templatePath);
        worksheet = workbook.worksheets[0];
        // find header row again to append data after it
        startRow = 2;
      }
    }

    if (!worksheet) {
      // Default standard accounting ledger format
      worksheet = workbook.addWorksheet('회계장부_영수증내역');
      worksheet.columns = [
        { header: '일자', key: 'date', width: 14 },
        { header: '거래처/상호', key: 'merchant', width: 22 },
        { header: '품목/적요', key: 'items', width: 28 },
        { header: '결제수단', key: 'paymentMethod', width: 12 },
        { header: '공급가액', key: 'supplyAmount', width: 15 },
        { header: '부가세', key: 'tax', width: 12 },
        { header: '합계금액', key: 'amount', width: 16 },
        { header: '비고', key: 'memo', width: 20 },
      ];
      // Header styling
      const headRow = worksheet.getRow(1);
      headRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF005B4B' } // YDS/BDS Brand Pine Teal
      };
      headRow.alignment = { vertical: 'middle', horizontal: 'center' };
    }

    // Sort records by date ascending
    const sortedRecords = [...(records || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    if (templateId && mappings) {
      // Custom template insertion
      // Find the last row of template header
      let targetRowIndex = 2;
      worksheet.eachRow((row, rowNumber) => {
        targetRowIndex = Math.max(targetRowIndex, rowNumber + 1);
      });

      sortedRecords.forEach(rec => {
        const row = worksheet.getRow(targetRowIndex++);
        Object.entries(mappings).forEach(([colIdx, fieldKey]) => {
          if (fieldKey && rec[fieldKey] !== undefined) {
            let val = rec[fieldKey];
            if (['amount', 'tax', 'supplyAmount'].includes(fieldKey)) {
              val = Number(val) || 0;
            }
            row.getCell(Number(colIdx)).value = val;
          }
        });
        row.commit();
      });
    } else {
      // Standard sheet insertion
      sortedRecords.forEach(rec => {
        worksheet.addRow({
          date: rec.date,
          merchant: rec.merchant,
          items: rec.items,
          paymentMethod: rec.paymentMethod,
          supplyAmount: Number(rec.supplyAmount) || Math.round((Number(rec.amount) || 0) / 1.1),
          tax: Number(rec.tax) || Math.round((Number(rec.amount) || 0) - Math.round((Number(rec.amount) || 0) / 1.1)),
          amount: Number(rec.amount) || 0,
          memo: rec.memo
        });
      });

      // Number formatting for currency columns
      worksheet.getColumn('supplyAmount').numFmt = '#,##0';
      worksheet.getColumn('tax').numFmt = '#,##0';
      worksheet.getColumn('amount').numFmt = '#,##0';
    }

    const exportFileName = `회계장부_${Date.now()}.xlsx`;
    const exportPath = path.join(__dirname, '..', 'uploads', exportFileName);
    await workbook.xlsx.writeFile(exportPath);

    res.download(exportPath, exportFileName);
  } catch (error) {
    console.error('엑셀 내보내기 에러:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. Export Proof Evidence PDF (날짜별 영수증 증빙철 PDF 생성)
app.post('/api/export/pdf', async (req, res) => {
  try {
    const { records } = req.body;
    const sorted = [...(records || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const pdfDoc = await PDFDocument.create();
    
    // Summary cover page
    let page = pdfDoc.addPage([595.28, 841.89]); // A4 Size
    const { width, height } = page.getSize();

    page.drawText('영수증 증빙 철 (Receipt Ledger)', {
      x: 50,
      y: height - 80,
      size: 22,
      color: rgb(0, 0.35, 0.29)
    });

    page.drawText(`생성일시: ${new Date().toLocaleString('ko-KR')} | 총 ${sorted.length}건`, {
      x: 50,
      y: height - 110,
      size: 11,
      color: rgb(0.3, 0.3, 0.3)
    });

    let currentY = height - 150;
    sorted.forEach((item, idx) => {
      if (currentY < 60) {
        page = pdfDoc.addPage([595.28, 841.89]);
        currentY = height - 80;
      }
      const lineText = `${idx + 1}. [${item.date || '날짜미상'}] ${item.merchant || '상호없음'} - ${(Number(item.amount) || 0).toLocaleString()}원 (${item.items || '품목요약 없음'})`;
      page.drawText(lineText, {
        x: 50,
        y: currentY,
        size: 10,
        color: rgb(0.1, 0.1, 0.1)
      });
      currentY -= 22;
    });

    // Embed individual receipt images into subsequent pages
    for (const item of sorted) {
      if (item.filePath) {
        const diskPath = path.join(__dirname, '..', item.filePath.replace(/^\//, ''));
        if (fs.existsSync(diskPath)) {
          const ext = path.extname(diskPath).toLowerCase();
          if (['.jpg', '.jpeg', '.png'].includes(ext)) {
            const imgBytes = fs.readFileSync(diskPath);
            let img;
            if (ext === '.png') {
              img = await pdfDoc.embedPng(imgBytes);
            } else {
              img = await pdfDoc.embedJpg(imgBytes);
            }

            const imgPage = pdfDoc.addPage([595.28, 841.89]);
            imgPage.drawText(`[증빙] ${item.date} - ${item.merchant} (${(Number(item.amount) || 0).toLocaleString()}원)`, {
              x: 40,
              y: 800,
              size: 13,
              color: rgb(0, 0.35, 0.29)
            });

            const scale = Math.min(500 / img.width, 700 / img.height, 1);
            imgPage.drawImage(img, {
              x: 40,
              y: 800 - (img.height * scale) - 20,
              width: img.width * scale,
              height: img.height * scale
            });
          }
        }
      }
    }

    const pdfBytes = await pdfDoc.save();
    const pdfFileName = `증빙철_${Date.now()}.pdf`;
    const pdfPath = path.join(__dirname, '..', 'uploads', pdfFileName);
    fs.writeFileSync(pdfPath, pdfBytes);

    res.download(pdfPath, pdfFileName);
  } catch (error) {
    console.error('PDF 내보내기 에러:', error);
    res.status(500).json({ error: error.message });
  }
});

// 6. Export Audit Presentation (감사용 나열 PPTX 생성)
const pptxgen = require('pptxgenjs');

app.post('/api/export/ppt', async (req, res) => {
  try {
    const { records } = req.body;
    const sorted = [...(records || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const pptx = new pptxgen();
    pptx.layout = 'LAYOUT_16x9';

    // Title Slide
    const titleSlide = pptx.addSlide();
    titleSlide.background = { color: '0F1113' };
    titleSlide.addText('지출 증빙 및 영수증 감사 보고서', {
      x: 1.0,
      y: 2.2,
      w: 11.3,
      fontSize: 28,
      bold: true,
      color: 'FFFFFF'
    });
    titleSlide.addText(`작성일시: ${new Date().toLocaleDateString('ko-KR')} | 총 ${sorted.length}건 지출 내역 증빙`, {
      x: 1.0,
      y: 3.2,
      w: 11.3,
      fontSize: 14,
      color: '83CABD'
    });

    // Individual Receipt Audit Slides
    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      const slide = pptx.addSlide();
      slide.background = { color: 'F8FAFC' };

      // Header Tag
      slide.addText(`증빙 번호 #${i + 1} | 일자: ${item.date || '미상'}`, {
        x: 0.8,
        y: 0.5,
        w: 11.7,
        fontSize: 14,
        bold: true,
        color: '005B4B'
      });

      // Left Column: Metadata Box
      const metaRows = [
        [{ text: '구분 항목', options: { bold: true, fill: { color: 'EDF7F4' } } }, { text: '상세 내용', options: { bold: true, fill: { color: 'EDF7F4' } } }],
        ['거래일자', item.date || '-'],
        ['거래처/가맹점', item.merchant || '-'],
        ['구입품목/적요', item.items || '-'],
        ['결제수단', item.paymentMethod || '카드'],
        ['공급가액', `${(Number(item.supplyAmount) || Math.round((Number(item.amount) || 0) / 1.1)).toLocaleString()} 원`],
        ['부가가치세', `${(Number(item.tax) || (Number(item.amount) || 0) - Math.round((Number(item.amount) || 0) / 1.1)).toLocaleString()} 원`],
        ['합계금액', `${(Number(item.amount) || 0).toLocaleString()} 원`],
        ['비고/용도', item.memo || '일반 경비 지출']
      ];

      slide.addTable(metaRows, {
        x: 0.8,
        y: 1.1,
        w: 5.2,
        fontSize: 11,
        border: { type: 'solid', pt: 1, color: 'CBD5E1' }
      });

      // Right Column: Receipt Image
      if (item.filePath) {
        const diskPath = path.join(__dirname, '..', item.filePath.replace(/^\//, ''));
        if (fs.existsSync(diskPath)) {
          const ext = path.extname(diskPath).toLowerCase();
          if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
            slide.addImage({
              path: diskPath,
              x: 6.4,
              y: 1.1,
              w: 6.0,
              h: 5.6,
              sizing: { type: 'contain' }
            });
          }
        }
      }
    }

    const pptFileName = `감사증빙보고서_${Date.now()}.pptx`;
    const pptPath = path.join(__dirname, '..', 'uploads', pptFileName);
    await pptx.writeFile({ fileName: pptPath });

    res.download(pptPath, pptFileName);
  } catch (error) {
    console.error('PPT 내보내기 에러:', error);
    res.status(500).json({ error: error.message });
  }
});

// 7. Church Specialized Exporters (유년부 2026 회계장부 및 4분할 A4 감사증빙철)
app.post('/api/export/church-excel', async (req, res) => {
  try {
    let { records, incomeRecords } = req.body || {};
    if (!records || records.length === 0) records = getAllReceipts();
    if (!incomeRecords) incomeRecords = getAllIncome();
    const { exportPath, exportFileName } = await generateChurchLedgerExcel(records, incomeRecords);
    res.download(exportPath, exportFileName);
  } catch (error) {
    console.error('교회 회계장부 엑셀 내보내기 에러:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/export/church-pptx', async (req, res) => {
  try {
    const { records } = req.body;
    const { exportPath, exportFileName } = await generateChurchAuditPptx(records);
    res.download(exportPath, exportFileName);
  } catch (error) {
    console.error('교회 감사증빙 PPTX 내보내기 에러:', error);
    res.status(500).json({ error: error.message });
  }
});

// 8. Graceful Shutdown Endpoint
app.post('/api/shutdown', (req, res) => {
  res.json({ success: true, message: 'Receipt Ledger 서버가 안전하게 종료됩니다.' });
  setTimeout(() => {
    console.log('[Receipt Ledger] Shutdown requested by client. Exiting cleanly...');
    process.exit(0);
  }, 600);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(` [Receipt Ledger Server] Ready on http://localhost:${PORT}`);
    console.log(`====================================================`);
  });
}

module.exports = app;
