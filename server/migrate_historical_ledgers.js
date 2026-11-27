const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ExcelJS = require('exceljs');
const { ALL_CHURCH_CODES, ALL_INCOME_CODES, inferChurchCode } = require('./church_rules');
const { db } = require('./db');

const BASE_DIR = path.join(__dirname, '..');
const SOURCE_DIR = path.join(BASE_DIR, '6_교회자료.zip_261124');

// Standard Korean label to church code mapping
const LABEL_TO_CODE = {
  '교사/학생양성비': 'B01',
  '교사/학생 양성비': 'B01',
  '오후활동비': 'B02',
  '교역자사례비': 'B02',
  '워크샵(리더,교사등)': 'B03',
  '워크샵(리더,교사 등)': 'B03',
  '워크샵(리더, 교사등)': 'B03',
  '새가족양육비': 'B04',
  '새가족 양육비': 'B04',
  '공과구입비': 'C01',
  '성경/찬송가구입비': 'C02',
  '성경/찬송가 구입비': 'C02',
  '책가방구입비': 'C03',
  '교재(양서)구입비': 'C04',
  '부흥회/친구초청': 'D01',
  '부모초청예배': 'D02',
  '달란트잔치': 'D03',
  '야외예배(전도캠프)': 'D04',
  '야외 예배(전도캠프)': 'D04',
  '야외예배': 'D04',
  '생일축하': 'D05',
  '전도행사/심방비': 'D06',
  '전도행사': 'D06',
  '부서별자체행사': 'D07',
  '부서별 자체행사': 'D07',
  '어린이주일': 'E01',
  '부활절': 'E02',
  '추수감사절': 'E03',
  '성탄절': 'E04',
  '수련회(신년,하계,동계)': 'F01',
  '수련회(신년, 하계, 동계)': 'F01',
  '중국선교': 'F02',
  '국내비전트립': 'F03',
  '성경학교(여름,겨울)': 'F04',
  '성경학교(여름, 겨울)': 'F04',
  '성경학교/수련회': 'F04',
  '정수기렌탈': 'G01',
  '복사비(주보등각종자료)': 'G02',
  '복사비(주보 등 각 종 자료)': 'G02',
  '복사비(주보 등 각종 자료)': 'G02',
  '비품구입': 'G03',
  '환경미화': 'G04',
  '월말시상': 'H01',
  '연말시상': 'H02',
  '전도시상및새가족환영': 'H03',
  '전도시상 및 새가족환영': 'H03',
  '간식및기타선물비': 'H04',
  '간식 및 기타선물비': 'H04',
  '특별찬조(회식,물품,기타)': 'S01',
  '특별찬조(물품,회식)': 'S01',
  '특별찬조': 'S01',
  '예비비': 'Z01',
  '기타/예비비': 'Z01'
};

function normalizeBudgetCode(rawName) {
  if (!rawName) return null;
  const cleaned = String(rawName).trim().replace(/\s+/g, '');
  for (const [key, code] of Object.entries(LABEL_TO_CODE)) {
    if (key.replace(/\s+/g, '') === cleaned) {
      return code;
    }
  }
  return null;
}

function resolveIncomeCode(rawCode, desc) {
  const codeCandidate = String(rawCode || '').trim().toUpperCase();
  const matched = ALL_INCOME_CODES.find(c => c.code === codeCandidate);
  if (matched) return matched;

  const text = String(desc || '').trim();
  if (/이자/i.test(text)) return ALL_INCOME_CODES.find(c => c.code === 'A06');
  if (/등록비/i.test(text)) return ALL_INCOME_CODES.find(c => c.code === 'A04');
  if (/노회/i.test(text)) return ALL_INCOME_CODES.find(c => c.code === 'A05');
  if (/성경책|공과/i.test(text)) return ALL_INCOME_CODES.find(c => c.code === 'A03');
  if (/회식|스승/i.test(text)) return ALL_INCOME_CODES.find(c => c.code === 'A08');
  if (/찬조|물품후원/i.test(text)) return ALL_INCOME_CODES.find(c => c.code === 'A07');
  if (/이월/i.test(text)) return ALL_INCOME_CODES.find(c => c.code === 'A02');
  return ALL_INCOME_CODES.find(c => c.code === 'A01'); // Default 청구액
}

function resolveExpenseCode(rawCode, desc) {
  const codeCandidate = String(rawCode || '').trim().toUpperCase();
  const matched = ALL_CHURCH_CODES.find(c => c.code === codeCandidate);
  if (matched) return matched;

  const inferred = inferChurchCode(desc, desc, '');
  const found = ALL_CHURCH_CODES.find(c => c.code === inferred.code);
  return found || { code: 'G03', label: '비품구입', category: '운영/서무비' };
}

async function extract2021Xlsx() {
  const filePath = path.join(SOURCE_DIR, '2021 유년부 장부.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  // 1. Budget
  const budgetMap = {};
  const wsBudget = wb.getWorksheet('회계1월');
  if (wsBudget) {
    const sectionHeaders = new Set(['교육비', '교육자료비', '전도/행사비', '절기행사비', '절기', '성경학교/수련회', '운영/서무비', '시상(선물)비', '합계', '항목']);
    wsBudget.eachRow((row, r) => {
      const name = String(row.getCell(1).value || '').trim();
      const val = row.getCell(3).value;
      const amt = typeof val === 'object' && val ? (Number(val.result) || 0) : (Number(val) || 0);
      if (amt > 0 && !sectionHeaders.has(name)) {
        budgetMap[name] = amt;
      }
    });
  }

  // 2. Expenses & Incomes
  const expenses = [];
  const incomes = [];
  const ignoreDescs = new Set(['월계', '누계', '소계', '합계', '전월이월', '전장이월', '전년이월', '이월', '']);

  const sheets = wb.worksheets.map(w => w.name).filter(s => s.includes('월') && !s.includes('회계'));
  for (const sname of sheets) {
    const mMatch = sname.match(/(\d+)월/);
    const defaultM = mMatch ? parseInt(mMatch[1], 10) : 1;
    const ws = wb.getWorksheet(sname);

    ws.eachRow((row, r) => {
      if (r < 5) return;
      const desc = String(row.getCell(4).value || '').trim();
      if (ignoreDescs.has(desc)) return;

      const rawCode = row.getCell(1).value;
      const code = typeof rawCode === 'object' && rawCode ? (rawCode.result || '') : (rawCode || '');

      let m = defaultM;
      const rowM = Number(row.getCell(2).value);
      if (rowM >= 1 && rowM <= 12) m = rowM;

      let d = 1;
      const rowD = Number(row.getCell(3).value);
      if (rowD >= 1 && rowD <= 31) d = rowD;

      const dateStr = `2021-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const receiptNo = String(row.getCell(5).value || '').trim();

      const getNum = (col) => {
        const v = row.getCell(col).value;
        return typeof v === 'object' && v ? (Number(v.result) || 0) : (Number(v) || 0);
      };

      const inc = getNum(6);
      const exp = getNum(7);

      if (inc > 0) {
        incomes.push({
          date: dateStr,
          month: m,
          day: d,
          code: String(code).trim(),
          desc: desc,
          receiptNo: receiptNo,
          amount: Math.round(inc)
        });
      }

      if (exp > 0) {
        expenses.push({
          date: dateStr,
          month: m,
          day: d,
          code: String(code).trim(),
          desc: desc,
          receiptNo: receiptNo,
          amount: Math.round(exp)
        });
      }
    });
  }

  return {
    budgets: budgetMap,
    expenses,
    incomes
  };
}

async function runMigration() {
  console.log('Extracting .xls data via python...');
  const pythonScript = path.join(__dirname, 'extract_xls.py');
  const xlsOutput = execFileSync('python', [pythonScript], { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
  const xlsData = JSON.parse(xlsOutput);

  console.log('Extracting 2021 .xlsx data via exceljs...');
  const data2021 = await extract2021Xlsx();
  xlsData[2021] = data2021;

  const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];
  console.log(`Starting DB transaction for ${years.length} years (2019-2026)...`);

  const insertBudgetStmt = db.prepare(`
    INSERT OR REPLACE INTO budget_items (year, code, code_label, category, amount, memo)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertReceiptStmt = db.prepare(`
    INSERT OR REPLACE INTO receipts (id, date, merchant, items, quantity, amount, tax, supply_amount, payment_method, code, code_label, memo, file_path, file_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertIncomeStmt = db.prepare(`
    INSERT OR REPLACE INTO income_records (id, date, code, code_label, donator, item_name, quantity, amount, is_in_kind, memo, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Delete previous historical imports if any (id starting with hist_)
  db.exec(`
    DELETE FROM receipts WHERE id LIKE 'hist_%';
    DELETE FROM income_records WHERE id LIKE 'hist_%';
  `);

  const stats = {};

  for (const year of years) {
    const yData = xlsData[year];
    if (!yData) continue;

    // 1. Budget items (33 items per year)
    let bTotal = 0;
    const rawBudgets = yData.budgets || {};

    // Group budgets by code
    const mappedBudgets = {};
    for (const [name, amt] of Object.entries(rawBudgets)) {
      const code = normalizeBudgetCode(name);
      if (code) {
        mappedBudgets[code] = (mappedBudgets[code] || 0) + amt;
      }
    }

    // Save all 33 codes
    for (const master of ALL_CHURCH_CODES) {
      const amt = mappedBudgets[master.code] || 0;
      bTotal += amt;
      insertBudgetStmt.run(year, master.code, master.label, master.category, amt, `${year}년도 유년부 결산 예산`);
    }

    // 2. Receipts (Expenses)
    let eTotal = 0;
    let eCount = 0;
    (yData.expenses || []).forEach((item, idx) => {
      const codeObj = resolveExpenseCode(item.code, item.desc);
      const id = `hist_exp_${year}_${String(idx + 1).padStart(4, '0')}`;
      const memo = item.receiptNo ? `영수 No. ${item.receiptNo}` : '';
      insertReceiptStmt.run(
        id,
        item.date,
        item.desc, // merchant
        item.desc, // items
        1,
        item.amount,
        0, // tax
        item.amount, // supply amount
        '카드',
        codeObj.code,
        codeObj.label,
        memo,
        null,
        null,
        new Date().toISOString()
      );
      eTotal += item.amount;
      eCount++;
    });

    // 3. Incomes
    let iTotal = 0;
    let iCount = 0;
    (yData.incomes || []).forEach((item, idx) => {
      const incCodeObj = resolveIncomeCode(item.code, item.desc);
      const id = `hist_inc_${year}_${String(idx + 1).padStart(4, '0')}`;
      const memo = item.receiptNo ? `영수 No. ${item.receiptNo}` : '';
      insertIncomeStmt.run(
        id,
        item.date,
        incCodeObj.code,
        incCodeObj.label,
        '교회', // donator
        item.desc, // item_name
        1,
        item.amount,
        0, // is_in_kind
        memo,
        new Date().toISOString()
      );
      iTotal += item.amount;
      iCount++;
    });

    stats[year] = {
      budgetTotal: bTotal,
      expenseCount: eCount,
      expenseTotal: eTotal,
      incomeCount: iCount,
      incomeTotal: iTotal
    };
  }

  console.log('\n===== MIGRATION COMPLETE SUMMARY =====');
  console.table(stats);
}

if (require.main === module) {
  runMigration().then(() => {
    console.log('Done!');
    process.exit(0);
  }).catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = { runMigration };
