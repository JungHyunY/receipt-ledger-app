const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'receipts.db');
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
  )
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

module.exports = {
  db,
  getAllReceipts,
  getReceiptById,
  insertReceipt,
  updateReceipt,
  deleteReceipt,
  clearAllReceipts
};
