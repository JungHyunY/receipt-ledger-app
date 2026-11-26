// 교회 회계 과목 자동 추론 엔진 및 코드 마스터
const ALL_CHURCH_CODES = [
  { code: 'B01', category: '교육비', label: '교사/학생 양성비', detail: '온라인예배, 노회대회' },
  { code: 'B02', category: '교육비', label: '교역자사례비', detail: '' },
  { code: 'B03', category: '교육비', label: '워크샵(리더, 교사등)', detail: 'LCT, 교사세미나' },
  { code: 'B04', category: '교육비', label: '새가족 양육비', detail: '새신자양육, 등반' },
  { code: 'C01', category: '교육자료비', label: '공과구입비', detail: '주일공과, 교재' },
  { code: 'C02', category: '교육자료비', label: '성경/찬송가구입비', detail: '성경책, 찬송가' },
  { code: 'C03', category: '교육자료비', label: '책가방구입비', detail: '학생용가방, 에코백' },
  { code: 'C04', category: '교육자료비', label: '교재(양서)구입비', detail: '설교자료, 신앙도서' },
  { code: 'D01', category: '전도/행사비', label: '부흥회/친구초청', detail: '친구초청축제, 전도초청' },
  { code: 'D02', category: '전도/행사비', label: '부모초청예배', detail: '부모초청간식, 편지지' },
  { code: 'D03', category: '전도/행사비', label: '달란트잔치', detail: '달란트시장 물품, 문구' },
  { code: 'D04', category: '전도/행사비', label: '야외예배', detail: '소풍, 전도캠프, 야외간식' },
  { code: 'D05', category: '전도/행사비', label: '생일축하', detail: '생일선물, 필통, 케이크' },
  { code: 'D06', category: '전도/행사비', label: '전도행사/심방비', detail: '입학식전도, 노방전도, 심방' },
  { code: 'D07', category: '전도/행사비', label: '부서별 자체행사', detail: '골든벨시상, 전원출석주일' },
  { code: 'E01', category: '절기', label: '어린이주일', detail: '어린이주일선물, 행사용품' },
  { code: 'E02', category: '절기', label: '부활절', detail: '부활절계란, 성극의상, 소품' },
  { code: 'E03', category: '절기', label: '추수감사절', detail: '추수감사과일, 장식용품' },
  { code: 'E04', category: '절기', label: '성탄절', detail: '크리스마스트리, 성탄선물' },
  { code: 'F01', category: '성경학교/수련회', label: '수련회(신년,하계,동계)', detail: '신년수련회, 동계수련회' },
  { code: 'F02', category: '성경학교/수련회', label: '중국선교', detail: '선교지원' },
  { code: 'F03', category: '성경학교/수련회', label: '국내비전트립', detail: '비전트립, 역사탐방' },
  { code: 'F04', category: '성경학교/수련회', label: '성경학교(여름, 겨울)', detail: '여름성경학교, 물놀이용품, 야식' },
  { code: 'G01', category: '운영/서무비', label: '정수기렌탈', detail: '정수기, 필터교체' },
  { code: 'G02', category: '운영/서무비', label: '복사비(주보등 각종 자료)', detail: '복사, 인쇄, 주보출력' },
  { code: 'G03', category: '운영/서무비', label: '비품구입', detail: '문구, 화일, 사무용품, 가위, 테이프' },
  { code: 'G04', category: '운영/서무비', label: '환경미화', detail: '청소도구, 종량제봉투, 세제, 청소포' },
  { code: 'H01', category: '시상(선물)비', label: '월말시상', detail: '월말출석시상, 암송시상' },
  { code: 'H02', category: '시상(선물)비', label: '연말시상', detail: '연말개근상, 정근상' },
  { code: 'H03', category: '시상(선물)비', label: '전도시상 및 새가족환영', detail: '새친구선물, 등반선물, 과자꾸러미' },
  { code: 'H04', category: '시상(선물)비', label: '간식 및 기타선물비', detail: '주일간식, 빵, 과자, 음료, 떡' },
  { code: 'S01', category: '특별찬조', label: '물품, 회식', detail: '교사회식, 식대' },
  { code: 'Z01', category: '예비비', label: '기타/예비비', detail: '병문안, 축의금, 기타경비' }
];

// 정규식 기반 우선순위 매칭 룰
const INFERENCE_RULES = [
  { code: 'H04', match: /간식|과자|빵|음료|우유|주스|커피|베이커리|떡|피자|치킨|아이스크림|파리바게|뚜레쥬르|메가커피|컴포즈|이디야|스타벅스|맥도날드|롯데리아|버거킹|쿠키|사탕|젤리|포카칩|고래밥|죠리퐁|초코송이|뭉쉘/i },
  { code: 'C01', match: /공과|성경학교교재|공과교재|주일공과|두란노|총회교육|아가페|생명의말씀사/i },
  { code: 'C02', match: /성경책|성경|찬송가|찬송|개역개정|어린이성경/i },
  { code: 'C03', match: /가방|책가방|에코백|배낭|파우치/i },
  { code: 'C04', match: /설교자료|신앙서적|기독교도서|교재구입비/i },
  { code: 'D01', match: /부흥회|친구초청|사영리|키링|전도축제/i },
  { code: 'D02', match: /부모초청|편지지|폴라로이드|사진기/i },
  { code: 'D03', match: /달란트|달란트잔치|달란트시장|선물꾸러미/i },
  { code: 'D04', match: /야외예배|소풍|입장료|대관료|피크닉/i },
  { code: 'D05', match: /생일|생일선물|케익|케이크|문화상품권|필통/i },
  { code: 'D06', match: /입학식전도|노방전도|전도행사|심방/i },
  { code: 'D07', match: /골든벨|출석주일|성경퀴즈|자체행사/i },
  { code: 'E01', match: /어린이주일|어린이날/i },
  { code: 'E02', match: /부활절|계란|부활|성극|의상|소품/i },
  { code: 'E03', match: /추수감사|감사절|과일바구니/i },
  { code: 'E04', match: /성탄절|크리스마스|트리|성탄선물/i },
  { code: 'F04', match: /성경학교|수련회|캠프|물놀이|부흥회사례|코스학습|나노블럭|깃발만들기/i },
  { code: 'G01', match: /정수기|코웨이|SK매직|청호나이스|생수/i },
  { code: 'G02', match: /복사|인쇄|주보|출력|제본|복사지/i },
  { code: 'G04', match: /청소|쓰레기봉투|세제|방향제|환경미화|밀대|청소포|종량제/i },
  { code: 'G03', match: /다이소|문구|알파|오피스|화일|바인더|건전지|테이프|가위|칼|종이|A4|포스트잇|형광펜|보드마카|물티슈|휴지|비품|라벨지/i },
  { code: 'H03', match: /새친구|등반선물|새가족환영/i },
  { code: 'H01', match: /월말시상|암송시상/i },
  { code: 'H02', match: /연말시상|개근상|정근상/i },
  { code: 'S01', match: /회식|교사회식|식대|특별찬조/i },
  { code: 'B01', match: /노회대회|교사대회|교사교육/i },
  { code: 'B03', match: /워크샵|LCT|교사수련회/i }
];

function inferChurchCode(merchant, items, memo) {
  const combined = `${merchant || ''} ${items || ''} ${memo || ''}`;
  for (const rule of INFERENCE_RULES) {
    if (rule.match.test(combined)) {
      const found = ALL_CHURCH_CODES.find(c => c.code === rule.code);
      return {
        code: rule.code,
        label: found ? found.label : '',
        category: found ? found.category : '',
        confidence: 'high'
      };
    }
  }

  // 기본 매핑: 소모 비품비 (G03)
  const defaultCode = ALL_CHURCH_CODES.find(c => c.code === 'G03');
  return {
    code: 'G03',
    label: defaultCode ? defaultCode.label : '비품구입',
    category: defaultCode ? defaultCode.category : '운영/서무비',
    confidence: 'low'
  };
}

module.exports = {
  ALL_CHURCH_CODES,
  inferChurchCode
};
