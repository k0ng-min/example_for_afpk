"""합성 데모 데이터 생성기: data/sample_clients.json, data/sample_scenarios.json 을 다시 만든다.

모든 고객·수치는 합성 가정이며 실제 통계나 고객 사례가 아니다.
실행: python scripts/setup/gen_sample_data.py  (프로젝트 루트에서)
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# 달력 1~12월 변동지출 계절성(bp): 명절(2·9월)·가정의 달(5월)·휴가철(7·8월)·연말(12월) 증가 가정
SEASON_SINGLE = [300, 2200, -900, -700, 900, -1000, 800, 1500, 2000, -800, 0, 1600]
SEASON_COUPLE = [500, 2600, -800, -600, 1500, -900, 1000, 1800, 2400, -700, 0, 2000]
SEASON_LEAN = [200, 1500, -600, -500, 600, -700, 500, 900, 1400, -500, 0, 1200]
# 카페 매출 계절성(bp): 여름 성수기, 겨울 비수기 가정
CAFE_REVENUE = [-1600, -1300, -300, 300, 800, 1300, 1900, 2100, 400, 200, 0, 500]
START = 11  # 시뮬레이션 1개월 차 = 11월(평상월: 계절 변동·연간 항목 없음) 가정


def items(*xs):
    return [{"name": n, "calendarMonth": m, "amount": a} for n, m, a in xs]


def goal(i, n, amt, month, prio, cat):
    return {"id": i, "name": n, "targetAmount": amt, "targetMonth": month, "priority": prio, "category": cat}


def loan(i, n, bal, bps, pay, kind="household"):
    return {"id": i, "name": n, "kind": kind, "balance": bal, "annualRateBps": bps, "monthlyPayment": pay}


def ev(i, n, k, s, a, e=None):
    d = {"id": i, "name": n, "kind": k, "startMonth": s, "amount": a}
    if e:
        d["endMonth"] = e
    return d


clients = [
    {
        "id": "client_a", "name": "고객 A (합성)", "age": 27, "occupation": "직장인 (IT 기업 3년차)",
        "familySituation": "부모님께 매월 생활비 지원, 현재 부모님 집 근처 원룸 월세 거주",
        "topicId": "family_commitment", "synthetic": True,
        "monthlyIncome": 3200000, "fixedExpenses": 800000, "variableExpenses": 550000, "familySupport": 500000,
        "cashAssets": 6500000, "investmentAssets": 1200000, "otherAssets": 10000000,
        "liabilities": [loan("loan_a1", "학자금 대출", 6000000, 170, 150000), loan("loan_a2", "신용대출", 3000000, 720, 100000)],
        "goals": [
            goal("goal_a1", "3년 내 주거 독립 자금", 30000000, 36, 1, "housing"),
            goal("goal_a2", "경력 개발(자격증·교육)", 5000000, 24, 2, "career"),
            goal("goal_a3", "부모님 의료비 대비금", 3000000, 18, 3, "care"),
        ],
        "business": None, "emergencyFundTargetMonths": 3,
        "pattern": {
            "startCalendarMonth": START, "variableExpenseSeasonBps": SEASON_SINGLE,
            "annualInflows": items(("성과급", 2, 2400000), ("연말정산 환급", 3, 280000), ("명절 상여", 9, 500000)),
            "annualOutflows": items(("설 명절 부모님 용돈", 2, 400000), ("추석 부모님 용돈", 9, 400000), ("여름 휴가", 8, 900000), ("연간 구독·보험 갱신", 3, 240000), ("부모님 생신", 6, 300000)),
            "annualIncomeGrowthBps": 350, "annualExpenseGrowthBps": 250,
        },
        "extensions": {"family_support_cap": 400000, "family_members_supported": 2},
        "assumptions": [
            "합성 예시: 월 생활비 1,350,000원을 고정 800,000원 / 변동 550,000원으로 분할 가정",
            "부채 9,000,000원을 학자금 6,000,000원(연 1.7%)·신용대출 3,000,000원(연 7.2%)으로 분할 가정, 월 상환 합계 250,000원",
            "원룸 월세 보증금 10,000,000원, 적립식 투자 1,200,000원 가정(원 자료에 없음)",
            "성과급 2월 2,400,000원·명절 상여 9월 500,000원·연말정산 환급 3월 280,000원 가정",
            "연 소득 인상 3.5%, 생활비 상승 2.5% 가정. 변동지출은 명절·휴가철에 늘어나는 계절성 가정",
            "주거 독립 목표액 30,000,000원(보증금·이사비) 가정",
        ],
        "notes": "가족 부양과 개인 목표의 충돌 사례. 실제 고객이 아닌 합성 데이터.",
    },
    {
        "id": "client_b", "name": "고객 B (합성)", "age": 34, "occupation": "소규모 사업자 (카페 운영)",
        "familySituation": "배우자와 2인 가구, 가계 소득은 사업 대표자 인출에 의존",
        "topicId": "household_business", "synthetic": True,
        "monthlyIncome": 4000000, "fixedExpenses": 1700000, "variableExpenses": 1100000, "familySupport": 0,
        "cashAssets": 8000000, "investmentAssets": 3000000, "otherAssets": 50000000,
        "liabilities": [loan("loan_b1", "사업자 운전자금 대출", 20000000, 650, 450000, "business"), loan("loan_b2", "자동차 할부", 6000000, 590, 280000)],
        "goals": [
            goal("goal_b1", "가계 생활 안정 자금", 5000000, 12, 1, "stability"),
            goal("goal_b2", "사업 재투자 자금(설비 교체)", 10000000, 24, 2, "business"),
            goal("goal_b3", "노후 대비 개인연금 시작", 6000000, 36, 3, "retirement"),
        ],
        "business": {"monthlyRevenue": 12000000, "monthlyCost": 7400000, "operatingCash": 15000000, "ownerDraw": 4000000},
        "emergencyFundTargetMonths": 6,
        "pattern": {
            "startCalendarMonth": START, "variableExpenseSeasonBps": SEASON_COUPLE, "businessRevenueSeasonBps": CAFE_REVENUE,
            "annualInflows": items(("부가세 정산 차액", 8, 350000)),
            "annualOutflows": items(("종합소득세", 5, 1200000), ("자동차보험", 3, 900000), ("설 명절 양가", 2, 600000), ("추석 양가", 9, 600000), ("자동차세(상반기)", 6, 250000), ("자동차세(하반기)", 12, 250000)),
            "annualIncomeGrowthBps": 0, "annualExpenseGrowthBps": 250,
        },
        "extensions": {"business_months_of_cover": 3},
        "assumptions": [
            "가계 월 지출 2,800,000원을 고정 1,700,000원 / 변동 1,100,000원으로 분할 가정",
            "가계 현금성 자산 8,000,000원, 투자 3,000,000원, 반전세 보증금 50,000,000원 가정(원 자료에 없음)",
            "사업 월 매출 12,000,000원(평균), 여름 성수기 최대 +21%·겨울 비수기 −16%의 카페 계절성 가정",
            "사업 운영비 7,400,000원, 대표자 인출 4,000,000원 고정 가정",
            "사업부채 20,000,000원 연 6.5%, 월 450,000원 상환 / 자동차 할부 6,000,000원 연 5.9% 가정",
            "종합소득세 5월 1,200,000원 등 연간 정기 지출 가정, 사업자는 비상예비자금 6개월분 목표",
        ],
        "notes": "사업 위험이 가계로 전파되는 사례. 실제 고객이 아닌 합성 데이터.",
    },
    {
        "id": "client_c", "name": "고객 C (합성)", "age": 29, "occupation": "직장인 (제조업 사무직)",
        "familySituation": "부모님 중 한 분의 갑작스러운 돌봄 필요 발생 예정, 형제 없음",
        "topicId": "care_crisis", "synthetic": True,
        "monthlyIncome": 3000000, "fixedExpenses": 1000000, "variableExpenses": 700000, "familySupport": 0,
        "cashAssets": 5000000, "investmentAssets": 800000, "otherAssets": 5000000,
        "liabilities": [loan("loan_c1", "마이너스통장", 1500000, 680, 100000)],
        "goals": [
            goal("goal_c1", "돌봄 초기 긴급자금", 3000000, 6, 1, "emergency"),
            goal("goal_c2", "돌봄 장기화 대비 자금", 10000000, 24, 2, "stability"),
            goal("goal_c3", "본인 경력 유지(재교육)", 2000000, 30, 3, "career"),
        ],
        "business": None, "emergencyFundTargetMonths": 3,
        "pattern": {
            "startCalendarMonth": START, "variableExpenseSeasonBps": SEASON_LEAN,
            "annualInflows": items(("설 명절 상여", 2, 1500000), ("추석 명절 상여", 9, 1500000), ("연말정산 환급", 3, 150000)),
            "annualOutflows": items(("자동차보험", 6, 650000), ("부모님 정기검진", 4, 400000), ("경조사(봄)", 5, 300000), ("경조사(가을)", 10, 300000)),
            "annualIncomeGrowthBps": 300, "annualExpenseGrowthBps": 250,
        },
        "extensions": {"care_hours_per_week": 20, "care_start_month": 3},
        "assumptions": [
            "월 생활비 1,700,000원을 고정 1,000,000원 / 변동 700,000원으로 분할 가정",
            "마이너스통장 1,500,000원 연 6.8%, 투자 800,000원, 원룸 보증금 5,000,000원 가정(원 자료에 없음)",
            "명절 상여 2월·9월 각 1,500,000원, 연 소득 인상 3% 가정",
            "돌봄 발생 시점 3개월 차 가정, 발생 후 소득 2,300,000원(−700,000원), 추가 돌봄비 월 450,000원",
        ],
        "notes": "돌봄 위기 72시간 사례. 기본값은 돌봄 발생 전 상태이며 돌봄은 시나리오 이벤트로 반영. 합성 데이터.",
    },
    {
        "id": "client_d", "name": "고객 D (합성)", "age": 31, "occupation": "직장인 (마케팅 6년차)",
        "familySituation": "미혼, 2년 내 결혼 계획 언급, 해외 MBA 진학 희망",
        "topicId": "goal_discovery", "synthetic": True,
        "monthlyIncome": 3800000, "fixedExpenses": 1200000, "variableExpenses": 900000, "familySupport": 0,
        "cashAssets": 12000000, "investmentAssets": 5000000, "otherAssets": 20000000,
        "liabilities": [loan("loan_d1", "학자금 대출", 6000000, 400, 200000)],
        "goals": [
            goal("goal_d1", "해외 MBA 학비", 40000000, 36, 1, "education"),
            goal("goal_d2", "결혼 자금", 30000000, 48, 2, "life_event"),
            goal("goal_d3", "자동차 구입", 15000000, 12, 3, "consumption"),
        ],
        "business": None, "emergencyFundTargetMonths": 3,
        "pattern": {
            "startCalendarMonth": START, "variableExpenseSeasonBps": SEASON_SINGLE,
            "annualInflows": items(("연간 성과급", 3, 4000000), ("연말정산 환급", 3, 350000)),
            "annualOutflows": items(("해외여행", 7, 2500000), ("결혼식 축의금(봄)", 5, 500000), ("결혼식 축의금(가을)", 10, 500000), ("어학시험·자기계발", 1, 400000)),
            "annualIncomeGrowthBps": 400, "annualExpenseGrowthBps": 250,
        },
        "extensions": {},
        "assumptions": [
            "고객이 처음 제시한 목표 순서(MBA → 결혼 → 자동차)를 우선순위로 입력",
            "학자금 대출 연 4.0%, 전세 보증금 본인 부담분 20,000,000원 가정",
            "연간 성과급 3월 4,000,000원, 연 소득 인상 4% 가정",
            "투자자산 기대수익률은 시나리오 가정값(기본 연 3%) 사용",
        ],
        "notes": "목표 반증 인터뷰 사례: 처음 제시한 목표와 실제 우선순위가 다를 수 있음. 합성 데이터.",
    },
    {
        "id": "client_e", "name": "고객 E (합성)", "age": 26, "occupation": "사회초년생 (공공기관 계약직)",
        "familySituation": "1인 가구, AI 재무설계 앱의 추천안을 받아본 상태",
        "topicId": "ai_verification", "synthetic": True,
        "monthlyIncome": 2700000, "fixedExpenses": 900000, "variableExpenses": 600000, "familySupport": 0,
        "cashAssets": 3000000, "investmentAssets": 2000000, "otherAssets": 3000000,
        "liabilities": [loan("loan_e1", "카드론", 4000000, 1450, 200000)],
        "goals": [
            goal("goal_e1", "비상예비자금 확보", 3000000, 12, 1, "emergency"),
            goal("goal_e2", "정규직 전환 대비 이직 준비금", 4000000, 24, 2, "career"),
        ],
        "business": None, "emergencyFundTargetMonths": 3,
        "pattern": {
            "startCalendarMonth": START, "variableExpenseSeasonBps": SEASON_SINGLE,
            "annualInflows": items(("연말정산 환급", 3, 200000)),
            "annualOutflows": items(("설 명절", 2, 250000), ("추석", 9, 250000), ("여름 휴가", 8, 600000), ("연간 구독 갱신", 1, 150000)),
            "annualIncomeGrowthBps": 0, "annualExpenseGrowthBps": 250,
        },
        "extensions": {},
        "assumptions": [
            "카드론 4,000,000원 연 14.5%, 월 200,000원 상환 가정",
            "원룸 보증금 3,000,000원 가정, 계약직이므로 연 소득 인상 0% 가정",
            "AI 초안 주장은 검증 데모를 위한 합성 예시이며 일부 의도적 오류 포함",
        ],
        "notes": "AI 재무설계 심사법정 사례. 합성 데이터.",
    },
]


def scn(i, c, name, desc, color, horizon, base=False, **kw):
    return {"id": i, "clientId": c, "name": name, "description": desc, "isBaseline": base, "color": color, "horizonMonths": horizon, **kw}


BLUE, VIOLET, ROSE, GREEN, SKY = "#3060a8", "#7e60c6", "#c4547d", "#2f9a7a", "#2f93c9"
scenarios = [
    scn("scn_a_base", "client_a", "현재 유지", "현재 소득·지출·가족지원 유지", BLUE, 60, True),
    scn("scn_a_cap", "client_a", "가족지원 상한 40만원", "가족과 합의해 지원액을 월 400,000원으로 조정", VIOLET, 60, familySupportOverride=400000),
    scn("scn_a_move", "client_a", "24개월 차 독립 실행", "24개월 차 이사비 1,500,000원 지출 후 월세·관리비 월 +550,000원", ROSE, 60, events=[
        ev("ev_a_move", "이사·입주 비용", "one_time_outflow", 24, 1500000),
        ev("ev_a_rent", "독립 후 월세·관리비 증가", "expense_change", 24, 550000)]),
    scn("scn_a_job", "client_a", "18개월 차 이직 + 고금리 상환", "이직 공백 1개월 후 월 +450,000원, 신용대출 월 100,000원 추가상환", GREEN, 60, extraDebtPayment=100000, events=[
        ev("ev_a_gap", "이직 공백(소득 없음)", "income_change", 17, -3200000, 17),
        ev("ev_a_job", "이직 후 소득 증가", "income_change", 18, 450000)]),

    scn("scn_b_base", "client_b", "현재 매출 유지", "평균 매출 유지(계절 변동만 반영)", BLUE, 36, True),
    scn("scn_b_drop", "client_b", "매출 20% 감소", "매출이 20% 감소하고 가계가 사업 부족분을 메우는 경우", ROSE, 36, businessRevenueChangeBps=-2000),
    scn("scn_b_firewall", "client_b", "매출 20% 감소 + 방화벽", "매출 감소 시 가계→사업 이전을 막고 사업 부족분을 따로 관리", VIOLET, 36, businessRevenueChangeBps=-2000, householdBackstop=False),
    scn("scn_b_lean", "client_b", "매출 10% 감소 + 지출 절감", "매출 10% 감소에 대비해 가계 변동지출 월 200,000원 절감", GREEN, 36, businessRevenueChangeBps=-1000, variableExpenseChange=-200000),

    scn("scn_c_base", "client_c", "돌봄 미발생(참고)", "돌봄이 발생하지 않았을 때의 기준선", BLUE, 36, True),
    scn("scn_c_care", "client_c", "돌봄 발생 (3개월 차)", "3개월 차부터 소득 −700,000원, 돌봄비 +450,000원", SKY, 36, events=[
        ev("ev_c_income", "근로시간 단축으로 소득 감소", "income_change", 3, -700000),
        ev("ev_c_cost", "추가 돌봄 비용", "expense_change", 3, 450000)]),
    scn("scn_c_leave", "client_c", "무급 휴직 3개월 후 단축근무", "3~5개월 차 소득 없음(가정), 6개월 차부터 단축근무, 초기 비용 1,000,000원", ROSE, 36, events=[
        ev("ev_c_leave", "무급 돌봄 휴직(가정)", "income_change", 3, -3000000, 5),
        ev("ev_c_short", "복직 후 단축근무", "income_change", 6, -700000),
        ev("ev_c_init", "초기 병원·보조기기 비용", "one_time_outflow", 3, 1000000),
        ev("ev_c_cost2", "추가 돌봄 비용", "expense_change", 3, 450000)]),
    scn("scn_c_service", "client_c", "외부 돌봄서비스 이용", "근무 유지, 외부 돌봄서비스 월 900,000원(가정) 부담", GREEN, 36, events=[
        ev("ev_c_svc", "외부 돌봄서비스 비용(가정)", "expense_change", 3, 900000)]),

    scn("scn_d_base", "client_d", "처음 제시한 목표 순서", "MBA → 결혼 → 자동차", BLUE, 60, True),
    scn("scn_d_marry", "client_d", "결혼 우선으로 재정렬", "인터뷰 후 결혼 → 자동차 → MBA(60개월)로 우선순위 변경", VIOLET, 60, goals=[
        goal("goal_d2", "결혼 자금", 30000000, 30, 1, "life_event"),
        goal("goal_d3", "자동차 구입", 15000000, 40, 2, "consumption"),
        goal("goal_d1", "해외 MBA 학비", 40000000, 60, 3, "education")]),
    scn("scn_d_mba", "client_d", "36개월 차 MBA 진학", "36개월 차 학비 40,000,000원 지출 후 소득 중단, 생활비 −400,000원", ROSE, 60, events=[
        ev("ev_d_tuition", "MBA 학비·이주 비용", "one_time_outflow", 36, 40000000),
        ev("ev_d_noincome", "재학 중 소득 중단", "income_change", 37, -3800000, 60),
        ev("ev_d_living", "재학 중 생활비 조정", "expense_change", 37, -400000, 60)]),
    scn("scn_d_invest", "client_d", "월 50만원 적립 투자", "매월 500,000원을 투자자산으로 이체(연 4% 가정, 보장 아님)", GREEN, 60, monthlyInvestment=500000, investmentReturnBps=400),

    scn("scn_e_base", "client_e", "현재 유지", "AI 초안 검증 기준선", BLUE, 36, True),
    scn("scn_e_ai", "client_e", "AI 초안: 투자 확대", "AI 초안이 제안한 월 500,000원 투자(검증 필요)", VIOLET, 36, monthlyInvestment=500000, investmentReturnBps=700),
    scn("scn_e_fix", "client_e", "검증 수정안: 카드론 우선 상환", "카드론에 월 300,000원 추가상환", GREEN, 36, extraDebtPayment=300000),
    scn("scn_e_perm", "client_e", "13개월 차 정규직 전환", "전환 후 월 +500,000원, 전환 시점 일회성 지출 800,000원, 월 150,000원 추가상환", ROSE, 36, extraDebtPayment=150000, events=[
        ev("ev_e_perm", "정규직 전환 소득 증가", "income_change", 13, 500000),
        ev("ev_e_cost", "전환 시점 일회성 지출", "one_time_outflow", 13, 800000)]),
]

for name, data in [("sample_clients.json", clients), ("sample_scenarios.json", scenarios)]:
    (ROOT / "data" / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"clients={len(clients)} scenarios={len(scenarios)}")
