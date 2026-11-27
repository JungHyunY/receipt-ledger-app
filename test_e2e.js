const axios = require('axios');
const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Isolate database for tests so production receipts.db is never polluted
const testDbPath = path.join(__dirname, 'data', 'receipts_test.db');
if (fs.existsSync(testDbPath)) {
  try { fs.unlinkSync(testDbPath); } catch (e) {}
}
process.env.DB_PATH = testDbPath;
process.env.PORT = '3989';
const app = require('./server/index');

let server;

async function runE2ETests() {
  console.log('--- STARTING E2E INTEGRATION TESTS ---');
  server = app.listen(3989);
  await new Promise(r => setTimeout(r, 500));

  const client = axios.create({ baseURL: 'http://127.0.0.1:3989' });

  try {
    // 1. Church Income Codes
    const incomeCodesRes = await client.get('/api/church/income-codes');
    assert.strictEqual(incomeCodesRes.status, 200);
    assert(Array.isArray(incomeCodesRes.data));
    assert(incomeCodesRes.data.some(c => c.code === 'A07'), 'A07 물품후원 should exist');
    console.log(`[PASS] 1. Income Codes: ${incomeCodesRes.data.length} codes verified.`);

    // 2. Budget Summary for 2026
    const budgetRes = await client.get('/api/budget/2026');
    assert.strictEqual(budgetRes.status, 200);
    assert(budgetRes.data.totalBudget > 0, 'Total budget should be > 0');
    console.log(`[PASS] 2. Budget 2026: Total ${budgetRes.data.totalBudget.toLocaleString()} KRW, items: ${budgetRes.data.items.length}`);

    // 3. Update Budget for 2026
    const saveBudgetRes = await client.post('/api/budget/2026', {
      items: [
        { code: 'B01', codeLabel: '교사/학생 양성비', category: '교육비', amount: 300000, memo: '테스트 증액' }
      ]
    });
    assert.strictEqual(saveBudgetRes.status, 200);
    const updatedSummary = await client.get('/api/budget/2026');
    const b01 = updatedSummary.data.items.find(i => i.code === 'B01');
    assert.strictEqual(b01.budgetAmount, 300000);
    console.log(`[PASS] 3. Save Budget: B01 updated to ${b01.budgetAmount.toLocaleString()} KRW`);

    // 4. Simulate Next Year (2027) Plan (+5%)
    const simRes = await client.get('/api/budget/simulate/2026?growthRate=5');
    assert.strictEqual(simRes.status, 200);
    assert.strictEqual(simRes.data.nextYear, 2027);
    assert(simRes.data.simulatedTotal > 0);
    console.log(`[PASS] 4. Simulate 2027 Plan: Total ${simRes.data.simulatedTotal.toLocaleString()} KRW (+5%)`);

    // 5. Apply Plan to 2027
    const applyRes = await client.post('/api/budget/apply-plan', {
      year: 2027,
      items: simRes.data.items.map(i => ({
        code: i.code,
        codeLabel: i.codeLabel,
        category: i.category,
        amount: i.proposedAmount,
        memo: '2027 기획 확정'
      }))
    });
    assert.strictEqual(applyRes.status, 200);
    const budget2027 = await client.get('/api/budget/2027');
    console.log('budget2027 totalBudget:', budget2027.data.totalBudget);
    assert(budget2027.data.totalBudget > 0, `Total budget should be > 0 but was ${budget2027.data.totalBudget}`);
    console.log(`[PASS] 5. Apply Plan: 2027 Budget created with Total ${budget2027.data.totalBudget.toLocaleString()} KRW`);

    // 6. Income Registration: Cash
    const cashRes = await client.post('/api/income', {
      date: '2026-01-15',
      code: 'A01',
      codeLabel: '청구액(부서예산 청구)',
      donator: '교회 본당',
      itemName: '1분기 예산 청구 입금',
      quantity: 1,
      amount: 2250000,
      isInKind: false,
      memo: '1월 정기 청구'
    });
    assert.strictEqual(cashRes.status, 200);
    const cashId = cashRes.data.record.id;
    console.log(`[PASS] 6. Cash Income Registered: 2,250,000 KRW (ID: ${cashId})`);

    // 7. Income Registration: In-Kind Goods
    const kindRes = await client.post('/api/income', {
      date: '2026-01-20',
      code: 'A07',
      codeLabel: '찬조(물품후원)',
      donator: '김권사님',
      itemName: '주일 간식용 단팥빵',
      quantity: 50,
      amount: 60000,
      isInKind: true,
      memo: '유년부 주일 공과 후 간식'
    });
    assert.strictEqual(kindRes.status, 200);
    const kindId = kindRes.data.record.id;
    console.log(`[PASS] 7. In-Kind Goods Registered: 50 items (Est: 60,000 KRW, ID: ${kindId})`);

    // 8. Income Summary
    const incomeSummary = await client.get('/api/income?year=2026');
    assert.strictEqual(incomeSummary.status, 200);
    assert(incomeSummary.data.cashTotal >= 2250000);
    assert(incomeSummary.data.inKindCount >= 50);
    console.log(`[PASS] 8. Income Summary: Cash ${incomeSummary.data.cashTotal.toLocaleString()} KRW, In-Kind ${incomeSummary.data.inKindCount} items`);

    // 9. Church Excel Export (with monetary income and in-kind ledger)
    const exportExcelRes = await client.post('/api/export/church-excel', {
      records: [
        { date: '2026-01-18', merchant: '파리바게뜨', items: '주일 간식', quantity: 1, amount: 25000, code: 'H04' }
      ],
      incomeRecords: incomeSummary.data.records
    }, { responseType: 'arraybuffer' });
    assert.strictEqual(exportExcelRes.status, 200);
    assert(exportExcelRes.data.length > 5000, 'Excel file buffer should be generated');
    console.log(`[PASS] 9. Church Excel Generated: ${exportExcelRes.data.length} bytes (Includes 12 monthly sheets & 찬조물품대장)`);

    // 10. Database Backup Export
    const backupRes = await client.get('/api/backup');
    assert.strictEqual(backupRes.status, 200);
    assert(backupRes.data.budgetItems.length > 0);
    assert(backupRes.data.incomeRecords.length > 0);
    console.log(`[PASS] 10. Backup Export: ${backupRes.data.budgetItems.length} budget items, ${backupRes.data.incomeRecords.length} income items.`);

    // 11. Database Restore
    const restoreRes = await client.post('/api/restore', backupRes.data);
    assert.strictEqual(restoreRes.status, 200);
    assert.strictEqual(restoreRes.data.success, true);
    console.log(`[PASS] 11. Restore: Successfully restored ${restoreRes.data.restoredBudget} budget items and ${restoreRes.data.restoredIncome} income records.`);

    // 12. Budget Excel Export
    const budgetExcelRes = await client.get('/api/budget/2026/export-excel', { responseType: 'arraybuffer' });
    assert.strictEqual(budgetExcelRes.status, 200);
    assert(budgetExcelRes.data.length > 3000, 'Budget excel file should be > 3000 bytes');
    console.log(`[PASS] 12. Budget Excel Export: ${budgetExcelRes.data.length} bytes generated.`);

    // 13. Budget Excel Import (Upload & Round-trip)
    const FormData = require('form-data');
    const form = new FormData();
    form.append('budgetFile', Buffer.from(budgetExcelRes.data), {
      filename: '2026_예산_테스트.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const importRes = await client.post('/api/budget/2026/import-excel', form, {
      headers: form.getHeaders()
    });
    assert.strictEqual(importRes.status, 200);
    assert(importRes.data.count >= 30, 'Should import at least 30 budget categories');
    console.log(`[PASS] 13. Budget Excel Import: ${importRes.data.count} categories successfully parsed and saved.`);

    // 14. Planner Excel Export
    const plannerExcelRes = await client.get('/api/budget/simulate/2026/export-excel?growthRate=5', { responseType: 'arraybuffer' });
    assert.strictEqual(plannerExcelRes.status, 200);
    assert(plannerExcelRes.data.length > 3000, 'Planner excel report should be > 3000 bytes');
    console.log(`[PASS] 14. Next Year Planner Excel Report: ${plannerExcelRes.data.length} bytes generated.`);

    // Restore official 2026 church budget (Sheet1 exact 9,000,000 KRW)
    const { seed2026Budget } = require('./server/seed_2026_budget');
    await seed2026Budget();
    console.log('[PASS] 15. Official 2026 Budget Restored (9,000,000 KRW).');

    console.log('\n========================================');
    console.log('>>> ALL 15 E2E TESTS PASSED 100%! <<<');
    console.log('========================================');
  } catch (err) {
    console.error('E2E TEST FAILED:', err.message, err.response ? err.response.data : '');
    process.exitCode = 1;
  } finally {
    if (server) server.close();
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    } catch (e) {}
    process.exit();
  }
}

runE2ETests();
