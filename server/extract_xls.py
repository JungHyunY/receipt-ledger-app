import os
import sys
import json
import re
import xlrd

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_DIR = os.path.join(BASE_DIR, '6_교회자료.zip_261124')

XLS_FILES = [
    (2019, '2019 유년부회계장부.xls'),
    (2020, '2020 유년부회계장부 -최종본.xls'),
    (2022, '2022년 유년부 회계장부.xls'),
    (2023, '2023년 유년부 회계장부.xls'),
    (2024, '2024년 유년부 회계장부.xls'),
    (2025, '2025년 유년부 회계장부.xls')
]

IGNORE_DESCS = {'월계', '누계', '소계', '합계', '전월이월', '전장이월', '전년이월', '이월', ''}

SECTION_HEADERS = {
    '교육비', '교육자료비', '전도/행사비', '절기행사비', '절기',
    '성경학교/수련회', '운영/서무비', '시상(선물)비', '합계', '항목'
}

def parse_month_day(sheet_name, row_month, row_day, year):
    # Parse month from sheet_name e.g. '1월', '7월_2'
    m_match = re.search(r'(\d+)월', sheet_name)
    default_m = int(m_match.group(1)) if m_match else 1
    
    m = default_m
    if isinstance(row_month, (int, float)) and 1 <= int(row_month) <= 12:
        m = int(row_month)
        
    d = 1
    if isinstance(row_day, (int, float)) and 1 <= int(row_day) <= 31:
        d = int(row_day)
        
    date_str = f"{year}-{m:02d}-{d:02d}"
    return date_str, m, d

def extract_xls_data():
    results = {}
    
    for year, filename in XLS_FILES:
        filepath = os.path.join(SOURCE_DIR, filename)
        if not os.path.exists(filepath):
            continue
            
        wb = xlrd.open_workbook(filepath)
        
        # 1. Budget extraction from '회계1월'
        budget_map = {}
        if '회계1월' in wb.sheet_names():
            bsh = wb.sheet_by_name('회계1월')
            for r in range(bsh.nrows):
                name = str(bsh.cell_value(r, 0)).strip()
                amt = bsh.cell_value(r, 2) if bsh.ncols > 2 else 0
                if isinstance(amt, (int, float)) and amt > 0:
                    if name not in SECTION_HEADERS:
                        budget_map[name] = int(amt)
                        
        # 2. Monthly entries
        expenses = []
        incomes = []
        
        monthly_sheets = [s for s in wb.sheet_names() if '월' in s and '회계' not in s]
        for sname in monthly_sheets:
            sh = wb.sheet_by_name(sname)
            for r in range(4, sh.nrows):
                desc = str(sh.cell_value(r, 3)).strip()
                if desc in IGNORE_DESCS:
                    continue
                    
                code = str(sh.cell_value(r, 0)).strip()
                row_m = sh.cell_value(r, 1) if sh.ncols > 1 else ''
                row_d = sh.cell_value(r, 2) if sh.ncols > 2 else ''
                receipt_no = sh.cell_value(r, 4) if sh.ncols > 4 else ''
                inc_val = sh.cell_value(r, 5) if sh.ncols > 5 else 0
                exp_val = sh.cell_value(r, 6) if sh.ncols > 6 else 0
                
                date_str, m, d = parse_month_day(sname, row_m, row_d, year)
                
                if isinstance(receipt_no, float) and receipt_no.is_integer():
                    receipt_no = int(receipt_no)
                receipt_no_str = str(receipt_no).strip() if receipt_no != '' else ''
                
                if isinstance(inc_val, (int, float)) and inc_val > 0:
                    incomes.append({
                        'date': date_str,
                        'month': m,
                        'day': d,
                        'code': code,
                        'desc': desc,
                        'receiptNo': receipt_no_str,
                        'amount': int(inc_val)
                    })
                    
                if isinstance(exp_val, (int, float)) and exp_val > 0:
                    expenses.append({
                        'date': date_str,
                        'month': m,
                        'day': d,
                        'code': code,
                        'desc': desc,
                        'receiptNo': receipt_no_str,
                        'amount': int(exp_val)
                    })
                    
        results[year] = {
            'budgets': budget_map,
            'expenses': expenses,
            'incomes': incomes
        }
        
    return results

if __name__ == '__main__':
    data = extract_xls_data()
    print(json.dumps(data, ensure_ascii=False, indent=2))
