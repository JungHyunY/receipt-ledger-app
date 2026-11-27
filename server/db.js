const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'receipts.db');
const db = new DatabaseSync(DB_PATH);

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS receipts (
    id TEXT PRIMARY KEY,
    date TEXT,
    merchant TEXT,
    items TEXT,
    quantity INTEGER DEFAULT 1,
    amount INTEGER DEFAULT 0,
    tax INTEGER DEFAULT 0,
    supply_amount INTEGER DEFAULT 0,
    payment_method TEXT DEFAULT '카드',
    code TEXT DEFAULT 'H04',
    code_label TEXT DEFAULT '간식 및 기타선물비',
    memo TEXT DEFAULT '',
    file_path TEXT,
    file_name TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS budget_items (
    year INTEGER NOT NULL,
    code TEXT NOT NULL,
    code_label TEXT,
    category TEXT,
    amount INTEGER DEFAULT 0,
    memo TEXT DEFAULT '',
    PRIMARY KEY (year, code)
  );

  CREATE TABLE IF NOT EXISTS income_records (
    id TEXT PRIMARY KEY,
    date TEXT,
    code TEXT DEFAULT 'A01',
    code_label TEXT DEFAULT '청구액(부서예산 청구)',
    donator TEXT DEFAULT '',
    item_name TEXT DEFAULT '',
    quantity INTEGER DEFAULT 1,
    amount INTEGER DEFAULT 0,
    is_in_kind INTEGER DEFAULT 0,
    memo TEXT DEFAULT '',
    created_at TEXT
  );
`);

function getAllReceipts() {
  const query = db.prepare(`SELECT * FROM receipts ORDER BY date ASC, created_at ASC`);
  const rows = query.all();
  return rows.map(r => ({
    id: r.id,
    date: r.date || '',
    merchant: r.merchant || '',
    items: r.items || '',
    quantity: r.quantity || 1,
    amount: r.amount || 0,
    tax: r.tax || 0,
    supplyAmount: r.supply_amount || 0,
    paymentMethod: r.payment_method || '카드',
    code: r.code || 'H04',
    codeLabel: r.code_label || '',
    memo: r.memo || '',
    filePath: r.file_path || null,
    fileName: r.file_name || null,
    createdAt: r.created_at
  }));
}

function getReceiptById(id) {
  const query = db.prepare(`SELECT * FROM receipts WHERE id = ?`);
  const r = query.get(id);
  if (!r) return null;
  return {
    id: r.id,
    date: r.date || '',
    merchant: r.merchant || '',
    items: r.items || '',
    quantity: r.quantity || 1,
    amount: r.amount || 0,
    tax: r.tax || 0,
    supplyAmount: r.supply_amount || 0,
    paymentMethod: r.payment_method || '카드',
    code: r.code || 'H04',
    codeLabel: r.code_label || '',
    memo: r.memo || '',
    filePath: r.file_path || null,
    fileName: r.file_name || null,
    createdAt: r.created_at
  };
}

function insertReceipt(rec) {
  const insert = db.prepare(`
    INSERT INTO receipts (
      id, date, merchant, items, quantity, amount, tax, supply_amount,
      payment_method, code, code_label, memo, file_path, file_name, created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);
  insert.run(
    rec.id,
    rec.date || '',
    rec.merchant || '',
    rec.items || '',
    Number(rec.quantity) || 1,
    Number(rec.amount) || 0,
    Number(rec.tax) || 0,
    Number(rec.supplyAmount) || 0,
    rec.paymentMethod || '카드',
    rec.code || 'H04',
    rec.codeLabel || '',
    rec.memo || '',
    rec.filePath || null,
    rec.fileName || null,
    rec.createdAt || new Date().toISOString()
  );
  return getReceiptById(rec.id);
}

function updateReceipt(id, fields) {
  const existing = getReceiptById(id);
  if (!existing) return null;

  const merged = { ...existing, ...fields };
  const update = db.prepare(`
    UPDATE receipts SET
      date = ?,
      merchant = ?,
      items = ?,
      quantity = ?,
      amount = ?,
      tax = ?,
      supply_amount = ?,
      payment_method = ?,
      code = ?,
      code_label = ?,
      memo = ?,
      file_path = ?,
      file_name = ?
    WHERE id = ?
  `);
  update.run(
    merged.date || '',
    merged.merchant || '',
    merged.items || '',
    Number(merged.quantity) || 1,
    Number(merged.amount) || 0,
    Number(merged.tax) || 0,
    Number(merged.supplyAmount) || 0,
    merged.paymentMethod || '카드',
    merged.code || 'H04',
    merged.codeLabel || '',
    merged.memo || '',
    merged.filePath || null,
    merged.fileName || null,
    id
  );
  return getReceiptById(id);
}

function deleteReceipt(id) {
  const del = db.prepare(`DELETE FROM receipts WHERE id = ?`);
  del.run(id);
  return true;
}

function clearAllReceipts() {
  db.exec(`DELETE FROM receipts`);
  return true;
}

// ----------------------------------------------------
// 2. Budget Items Management
// ----------------------------------------------------
const { ALL_CHURCH_CODES, ALL_INCOME_CODES } = require('./church_rules');

function getAllBudgetRows() {
  return db.prepare(`SELECT * FROM budget_items ORDER BY year DESC, code ASC`).all();
}

function getBudgetItems(year) {
  const y = parseInt(year, 10) || new Date().getFullYear();
  const query = db.prepare(`SELECT * FROM budget_items WHERE year = ? ORDER BY code ASC`);
  let rows = query.all(y);

  // 해당 연도 예산 데이터가 아직 없으면 ALL_CHURCH_CODES 기반으로 기본 레코드 초기화 생성
  if (rows.length === 0) {
    const insertStmt = db.prepare(`
      INSERT INTO budget_items (year, code, code_label, category, amount, memo)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    // 2026년 기준 교회 공식 예산 (총 9,000,000원 - 26년 상반기 회계보고 Sheet1 기준)
    const default2026Budget = {
      'B01': 0, 'B02': 0, 'B03': 0, 'B04': 0,
      'C01': 400000, 'C02': 100000, 'C03': 550000, 'C04': 0,
      'D01': 100000, 'D02': 400000, 'D03': 1600000, 'D04': 500000, 'D05': 300000, 'D06': 100000, 'D07': 400000,
      'E01': 0, 'E02': 50000, 'E03': 50000, 'E04': 300000,
      'F01': 0, 'F02': 0, 'F03': 0, 'F04': 1800000,
      'G01': 160000, 'G02': 50000, 'G03': 40000, 'G04': 100000,
      'H01': 0, 'H02': 500000, 'H03': 100000, 'H04': 1300000,
      'S01': 0, 'Z01': 100000
    };

    ALL_CHURCH_CODES.forEach(item => {
      const defaultAmt = (y === 2026 && default2026Budget[item.code] !== undefined)
        ? default2026Budget[item.code]
        : 0;
      insertStmt.run(y, item.code, item.label, item.category, defaultAmt, '');
    });

    rows = query.all(y);
  }

  return rows.map(r => ({
    year: r.year,
    code: r.code,
    codeLabel: r.code_label || '',
    category: r.category || '',
    amount: Number(r.amount) || 0,
    memo: r.memo || ''
  }));
}

function saveBudgetItems(year, items) {
  const y = parseInt(year, 10) || new Date().getFullYear();
  const upsert = db.prepare(`
    INSERT INTO budget_items (year, code, code_label, category, amount, memo)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(year, code) DO UPDATE SET
      amount = excluded.amount,
      memo = excluded.memo,
      code_label = excluded.code_label,
      category = excluded.category
  `);

  items.forEach(item => {
    const amt = item.amount !== undefined ? item.amount : (item.budgetAmount !== undefined ? item.budgetAmount : item.proposedAmount);
    upsert.run(
      y,
      item.code,
      item.codeLabel || '',
      item.category || '',
      Number(amt) || 0,
      item.memo || ''
    );
  });

  return getBudgetItems(y);
}

function getBudgetSummary(year) {
  const y = parseInt(year, 10) || new Date().getFullYear();
  const budgetList = getBudgetItems(y);

  // 해당 연도 영수증 집행액 집계 (date가 YYYY-MM-DD 형식)
  const prefix = `${y}-%`;
  const expenseQuery = db.prepare(`
    SELECT code, SUM(amount) as total_spent, COUNT(*) as count
    FROM receipts
    WHERE date LIKE ?
    GROUP BY code
  `);
  const expenseRows = expenseQuery.all(prefix);
  const spentMap = {};
  expenseRows.forEach(r => {
    spentMap[r.code] = {
      spent: Number(r.total_spent) || 0,
      count: Number(r.count) || 0
    };
  });

  let totalBudget = 0;
  let totalSpent = 0;

  const items = budgetList.map(b => {
    const spentInfo = spentMap[b.code] || { spent: 0, count: 0 };
    const actualSpent = spentInfo.spent;
    const remaining = b.amount - actualSpent;
    const burnRate = b.amount > 0 ? Math.round((actualSpent / b.amount) * 1000) / 10 : (actualSpent > 0 ? 100 : 0);

    totalBudget += b.amount;
    totalSpent += actualSpent;

    return {
      year: b.year,
      code: b.code,
      codeLabel: b.codeLabel,
      category: b.category,
      budgetAmount: b.amount,
      actualSpent,
      remaining,
      burnRate,
      receiptCount: spentInfo.count,
      memo: b.memo
    };
  });

  const totalRemaining = totalBudget - totalSpent;
  const overallBurnRate = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 1000) / 10 : 0;

  return {
    year: y,
    totalBudget,
    totalSpent,
    totalRemaining,
    overallBurnRate,
    items
  };
}

function simulateNextYearBudget(currentYear, growthRate = 0, customAdjustments = {}) {
  const curY = parseInt(currentYear, 10) || new Date().getFullYear();
  const nextY = curY + 1;
  const summary = getBudgetSummary(curY);
  const rate = Number(growthRate) || 0;

  let simulatedTotal = 0;
  let currentTotalBudget = 0;
  let currentTotalSpent = 0;

  const items = summary.items.map(item => {
    currentTotalBudget += item.budgetAmount;
    currentTotalSpent += item.actualSpent;

    let proposedAmount = item.budgetAmount;
    let memo = '';

    if (customAdjustments[item.code] !== undefined) {
      proposedAmount = Number(customAdjustments[item.code]) || 0;
      memo = '수동 조정';
    } else if (item.actualSpent > 0) {
      // 실집행액 기준 물가/인상률 반영하여 1,000원 단위 절상
      const raw = item.actualSpent * (1 + rate / 100);
      proposedAmount = Math.ceil(raw / 1000) * 1000;
      memo = `실집행(${item.actualSpent.toLocaleString()}원) + ${rate}%`;
    } else {
      proposedAmount = Math.ceil(item.budgetAmount * (1 + rate / 100) / 1000) * 1000;
      memo = rate !== 0 ? `기존예산 + ${rate}%` : '기존예산 유지';
    }

    const diff = proposedAmount - item.budgetAmount;
    const pctChange = item.budgetAmount > 0 ? Math.round((diff / item.budgetAmount) * 1000) / 10 : 0;
    simulatedTotal += proposedAmount;

    return {
      nextYear: nextY,
      code: item.code,
      codeLabel: item.codeLabel,
      category: item.category,
      currentBudget: item.budgetAmount,
      actualSpent: item.actualSpent,
      proposedAmount,
      diff,
      pctChange,
      memo
    };
  });

  return {
    currentYear: curY,
    nextYear: nextY,
    growthRate: rate,
    currentTotalBudget,
    currentTotalSpent,
    simulatedTotal,
    diffTotal: simulatedTotal - currentTotalBudget,
    items
  };
}

// ----------------------------------------------------
// 3. Income & Non-Monetary Sponsorship Management
// ----------------------------------------------------
function getAllIncome() {
  const query = db.prepare(`SELECT * FROM income_records ORDER BY date ASC, created_at ASC`);
  const rows = query.all();
  return rows.map(r => ({
    id: r.id,
    date: r.date || '',
    code: r.code || 'A01',
    codeLabel: r.code_label || '',
    donator: r.donator || '',
    itemName: r.item_name || '',
    quantity: Number(r.quantity) || 1,
    amount: Number(r.amount) || 0,
    isInKind: Number(r.is_in_kind) === 1,
    memo: r.memo || '',
    createdAt: r.created_at
  }));
}

function getIncomeById(id) {
  const query = db.prepare(`SELECT * FROM income_records WHERE id = ?`);
  const r = query.get(id);
  if (!r) return null;
  return {
    id: r.id,
    date: r.date || '',
    code: r.code || 'A01',
    codeLabel: r.code_label || '',
    donator: r.donator || '',
    itemName: r.item_name || '',
    quantity: Number(r.quantity) || 1,
    amount: Number(r.amount) || 0,
    isInKind: Number(r.is_in_kind) === 1,
    memo: r.memo || '',
    createdAt: r.created_at
  };
}

function insertIncome(rec) {
  const insert = db.prepare(`
    INSERT INTO income_records (
      id, date, code, code_label, donator, item_name, quantity, amount, is_in_kind, memo, created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);
  insert.run(
    rec.id,
    rec.date || '',
    rec.code || 'A01',
    rec.codeLabel || '',
    rec.donator || '',
    rec.itemName || '',
    Number(rec.quantity) || 1,
    Number(rec.amount) || 0,
    rec.isInKind ? 1 : 0,
    rec.memo || '',
    rec.createdAt || new Date().toISOString()
  );
  return getIncomeById(rec.id);
}

function updateIncome(id, fields) {
  const existing = getIncomeById(id);
  if (!existing) return null;

  const merged = { ...existing, ...fields };
  const update = db.prepare(`
    UPDATE income_records SET
      date = ?,
      code = ?,
      code_label = ?,
      donator = ?,
      item_name = ?,
      quantity = ?,
      amount = ?,
      is_in_kind = ?,
      memo = ?
    WHERE id = ?
  `);
  update.run(
    merged.date || '',
    merged.code || 'A01',
    merged.codeLabel || '',
    merged.donator || '',
    merged.itemName || '',
    Number(merged.quantity) || 1,
    Number(merged.amount) || 0,
    merged.isInKind ? 1 : 0,
    merged.memo || '',
    id
  );
  return getIncomeById(id);
}

function deleteIncome(id) {
  const del = db.prepare(`DELETE FROM income_records WHERE id = ?`);
  del.run(id);
  return true;
}

function getIncomeSummary(year) {
  const list = getAllIncome();
  const filtered = year ? list.filter(r => (r.date || '').startsWith(String(year))) : list;

  let cashTotal = 0;
  let inKindCount = 0;
  let inKindEstimatedTotal = 0;

  filtered.forEach(r => {
    if (r.isInKind) {
      inKindCount += (r.quantity || 1);
      inKindEstimatedTotal += (r.amount || 0);
    } else {
      cashTotal += (r.amount || 0);
    }
  });

  return {
    year: year || 'ALL',
    cashTotal,
    inKindCount,
    inKindEstimatedTotal,
    totalRecords: filtered.length,
    records: filtered
  };
}

// ----------------------------------------------------
// 4. Full DB Backup & Cross-PC Restore (JSON)
// ----------------------------------------------------
function exportDatabaseBackup() {
  return {
    app: 'Yoonikon Receipt Ledger',
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    receipts: getAllReceipts(),
    budgetItems: getAllBudgetRows(),
    incomeRecords: getAllIncome()
  };
}

function restoreDatabaseBackup(backup) {
  if (!backup || typeof backup !== 'object') {
    throw new Error('유효하지 않은 백업 데이터 형식입니다.');
  }

  // 1. Receipts 복원
  if (Array.isArray(backup.receipts)) {
    db.exec(`DELETE FROM receipts`);
    const insertRec = db.prepare(`
      INSERT INTO receipts (
        id, date, merchant, items, quantity, amount, tax, supply_amount,
        payment_method, code, code_label, memo, file_path, file_name, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    backup.receipts.forEach(r => {
      insertRec.run(
        r.id, r.date || '', r.merchant || '', r.items || '',
        Number(r.quantity) || 1, Number(r.amount) || 0, Number(r.tax) || 0, Number(r.supplyAmount) || 0,
        r.paymentMethod || '카드', r.code || 'H04', r.codeLabel || '', r.memo || '',
        r.filePath || null, r.fileName || null, r.createdAt || new Date().toISOString()
      );
    });
  }

  // 2. Budget Items 복원
  if (Array.isArray(backup.budgetItems)) {
    db.exec(`DELETE FROM budget_items`);
    const insertBudget = db.prepare(`
      INSERT INTO budget_items (year, code, code_label, category, amount, memo)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    backup.budgetItems.forEach(b => {
      insertBudget.run(
        b.year, b.code, b.code_label || b.codeLabel || '',
        b.category || '', Number(b.amount) || 0, b.memo || ''
      );
    });
  }

  // 3. Income Records 복원
  if (Array.isArray(backup.incomeRecords)) {
    db.exec(`DELETE FROM income_records`);
    const insertInc = db.prepare(`
      INSERT INTO income_records (
        id, date, code, code_label, donator, item_name, quantity, amount, is_in_kind, memo, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    backup.incomeRecords.forEach(i => {
      insertInc.run(
        i.id, i.date || '', i.code || 'A01', i.code_label || i.codeLabel || '',
        i.donator || '', i.item_name || i.itemName || '',
        Number(i.quantity) || 1, Number(i.amount) || 0,
        (i.is_in_kind === 1 || i.isInKind === true) ? 1 : 0,
        i.memo || '', i.created_at || i.createdAt || new Date().toISOString()
      );
    });
  }

  return {
    restoredReceipts: backup.receipts ? backup.receipts.length : 0,
    restoredBudget: backup.budgetItems ? backup.budgetItems.length : 0,
    restoredIncome: backup.incomeRecords ? backup.incomeRecords.length : 0
  };
}

module.exports = {
  db,
  getAllReceipts,
  getReceiptById,
  insertReceipt,
  updateReceipt,
  deleteReceipt,
  clearAllReceipts,
  // Budget
  getBudgetItems,
  saveBudgetItems,
  getBudgetSummary,
  simulateNextYearBudget,
  // Income
  getAllIncome,
  getIncomeById,
  insertIncome,
  updateIncome,
  deleteIncome,
  getIncomeSummary,
  // Backup / Restore
  exportDatabaseBackup,
  restoreDatabaseBackup
};
