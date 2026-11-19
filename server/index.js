const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const ExcelJS = require('exceljs');
const { PDFDocument, rgb } = require('pdf-lib');

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
    res.json({ connected: true, models: response.data.models || [] });
  } catch (error) {
    res.json({ connected: false, error: error.message, hint: 'Ollama 호스트 연결 상태를 확인하세요' });
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

    res.json({
      success: true,
      file: {
        id: req.file.filename,
        originalName: req.file.originalname,
        path: `/uploads/${req.file.filename}`,
        size: req.file.size
      },
      data: extracted
    });
  } catch (error) {
    console.error('영수증 처리 에러:', error);
    res.status(500).json({ error: error.message });
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

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` [Receipt Ledger Server] Ready on http://localhost:${PORT}`);
  console.log(`====================================================`);
});
