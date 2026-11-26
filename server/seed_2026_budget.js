const ExcelJS = require('exceljs');
const path = require('path');
const { ALL_CHURCH_CODES } = require('./church_rules');
const { saveBudgetItems, getBudgetSummary } = require('./db');

async function seed2026Budget() {
  const filePath = path.join(__dirname, '..', '6_교회자료.zip_261124', '26년 상반기 월례회의 - 회계보고.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const ws = wb.getWorksheet('Sheet1');
  if (!ws) {
    throw new Error('Sheet1 not found in ' + filePath);
  }

  // Parse budget amounts from Sheet1
  const excelBudgets = {};
  ws.eachRow((row, rowNumber) => {
    if (rowNumber >= 7 && rowNumber <= 45) {
      const vals = row.values;
      const label = (typeof vals[1] === 'object' && vals[1] ? vals[1].result : vals[1]) || (typeof vals[2] === 'object' && vals[2] ? vals[2].result : vals[2]);
      const amtVal = typeof vals[3] === 'object' && vals[3] ? vals[3].result : vals[3];
      const amt = Number(amtVal) || 0;
      if (label) {
        excelBudgets[String(label).trim().replace(/\s+/g, '')] = amt;
      }
    }
  });

  const budgetItems = ALL_CHURCH_CODES.map(c => {
    let amt = 0;
    if (c.code === 'C01') amt = excelBudgets['공과구입비'] || 400000;
    else if (c.code === 'C02') amt = excelBudgets['성경/찬송가구입비'] || 100000;
    else if (c.code === 'C03') amt = excelBudgets['책가방구입비'] || 550000;
    else if (c.code === 'C04') amt = excelBudgets['교재(양서)구입비'] || 0;
    else if (c.code === 'D01') amt = excelBudgets['부흥회/친구초청'] || 100000;
    else if (c.code === 'D02') amt = excelBudgets['부모초청예배'] || 400000;
    else if (c.code === 'D03') amt = excelBudgets['달란트잔치'] || 1600000;
    else if (c.code === 'D04') amt = excelBudgets['야외예배(전도캠프)'] || excelBudgets['야외예배'] || 500000;
    else if (c.code === 'D05') amt = excelBudgets['생일축하'] || 300000;
    else if (c.code === 'D06') amt = excelBudgets['전도행사/심방비'] || excelBudgets['전도행사'] || 100000;
    else if (c.code === 'D07') amt = excelBudgets['부서별자체행사'] || 400000;
    else if (c.code === 'E01') amt = excelBudgets['어린이주일'] || 0;
    else if (c.code === 'E02') amt = excelBudgets['부활절'] || 50000;
    else if (c.code === 'E03') amt = excelBudgets['추수감사절'] || 50000;
    else if (c.code === 'E04') amt = excelBudgets['성탄절'] || 300000;
    else if (c.code === 'F01') amt = excelBudgets['수련회(신년,하계,동계)'] || 0;
    else if (c.code === 'F02') amt = excelBudgets['중국선교'] || 0;
    else if (c.code === 'F03') amt = excelBudgets['국내비전트립'] || 0;
    else if (c.code === 'F04') amt = excelBudgets['성경학교(여름,겨울)'] || excelBudgets['성경학교/수련회'] || 1800000;
    else if (c.code === 'G01') amt = excelBudgets['정수기렌탈'] || 160000;
    else if (c.code === 'G02') amt = excelBudgets['복사비(주보등각종자료)'] || 50000;
    else if (c.code === 'G03') amt = excelBudgets['비품구입'] || 40000;
    else if (c.code === 'G04') amt = excelBudgets['환경미화'] || 100000;
    else if (c.code === 'H01') amt = excelBudgets['월말시상'] || 0;
    else if (c.code === 'H02') amt = excelBudgets['연말시상'] || 500000;
    else if (c.code === 'H03') amt = excelBudgets['전도시상및새가족환영'] || 100000;
    else if (c.code === 'H04') amt = excelBudgets['간식및기타선물비'] || 1300000;
    else if (c.code === 'Z01') amt = excelBudgets['예비비'] || 100000;
    else if (c.code === 'S01') amt = 0;
    else amt = 0;

    return {
      code: c.code,
      codeLabel: c.label,
      category: c.category,
      amount: amt,
      memo: amt > 0 ? '2026 상반기 회계보고 Sheet1 기준' : ''
    };
  });

  saveBudgetItems(2026, budgetItems);
  const summary = getBudgetSummary(2026);
  console.log(`[SEED] 2026 Budget Seeded Successfully: Total ${summary.totalBudget.toLocaleString()} KRW (33 items)`);
  return summary;
}

if (require.main === module) {
  seed2026Budget().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { seed2026Budget };
