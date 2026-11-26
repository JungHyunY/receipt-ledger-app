const assert = require('assert');
const {
  getBudgetItems,
  saveBudgetItems,
  getBudgetSummary,
  simulateNextYearBudget,
  insertIncome,
  getAllIncome,
  getIncomeSummary,
  deleteIncome,
  exportDatabaseBackup,
  restoreDatabaseBackup,
  insertReceipt,
  deleteReceipt
} = require('./server/db');

console.log('--- TEST 1: BUDGET MANAGEMENT ---');
const budget2026 = getBudgetItems(2026);
assert(budget2026.length > 0, '2026 budget items should be initialized');
const b01 = budget2026.find(b => b.code === 'B01');
assert(b01 !== undefined, 'B01 should exist');
console.log(`B01 initial amount: ${b01.amount}`);

// Update budget item
saveBudgetItems(2026, [{ code: 'B01', amount: 250000, memo: '교사교육 증액' }]);
const updatedSummary = getBudgetSummary(2026);
const updatedB01 = updatedSummary.items.find(b => b.code === 'B01');
assert.strictEqual(updatedB01.budgetAmount, 250000, 'B01 amount should be updated to 250,000');
console.log(`Updated B01: ${updatedB01.budgetAmount} KRW, Total Budget: ${updatedSummary.totalBudget.toLocaleString()} KRW`);

console.log('\n--- TEST 2: NEXT YEAR SIMULATION ---');
const sim = simulateNextYearBudget(2026, 5);
assert.strictEqual(sim.nextYear, 2027, 'Next year should be 2027');
assert(sim.simulatedTotal > 0, 'Simulated total should be > 0');
console.log(`2026 Budget: ${sim.currentTotalBudget.toLocaleString()} KRW -> 2027 Simulated (+5%): ${sim.simulatedTotal.toLocaleString()} KRW (Diff: ${sim.diffTotal.toLocaleString()} KRW)`);

console.log('\n--- TEST 3: INCOME & IN-KIND SPONSORSHIP ---');
// Insert Cash Income
const cashInc = insertIncome({
  id: `inc_test_${Date.now()}_cash`,
  date: '2026-03-01',
  code: 'A01',
  codeLabel: '청구액(부서예산 청구)',
  donator: '교회 본당',
  itemName: '1분기 예산 청구액',
  quantity: 1,
  amount: 2250000,
  isInKind: false,
  memo: '1분기 집행분'
});
assert.strictEqual(cashInc.amount, 2250000);
assert.strictEqual(cashInc.isInKind, false);

// Insert In-Kind Goods Donation
const inKindInc = insertIncome({
  id: `inc_test_${Date.now()}_goods`,
  date: '2026-03-08',
  code: 'A07',
  codeLabel: '찬조(물품후원)',
  donator: '박선생님',
  itemName: '주일 간식용 단팥빵',
  quantity: 50,
  amount: 75000,
  isInKind: true,
  memo: '주일 분반공부 후 간식'
});
assert.strictEqual(inKindInc.isInKind, true);
assert.strictEqual(inKindInc.quantity, 50);

const incSummary = getIncomeSummary(2026);
assert(incSummary.cashTotal >= 2250000, 'Cash income should include 2,250,000');
assert(incSummary.inKindCount >= 50, 'In-kind item count should be at least 50');
console.log(`2026 Cash Income: ${incSummary.cashTotal.toLocaleString()} KRW, In-kind Goods Count: ${incSummary.inKindCount} items (Est. Value: ${incSummary.inKindEstimatedTotal.toLocaleString()} KRW)`);

console.log('\n--- TEST 4: BACKUP & RESTORE ---');
const backup = exportDatabaseBackup();
assert(backup.budgetItems.length > 0, 'Backup should contain budget items');
assert(backup.incomeRecords.length > 0, 'Backup should contain income records');
console.log(`Backup generated successfully: ${backup.receipts.length} receipts, ${backup.budgetItems.length} budget items, ${backup.incomeRecords.length} income records.`);

// Cleanup test items
deleteIncome(cashInc.id);
deleteIncome(inKindInc.id);
console.log('\n--- ALL UNIT TESTS PASSED SUCCESSFULLY! ---');
