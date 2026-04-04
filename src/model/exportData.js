// Home equity now tracked in main projection monthlyData
import { INITIAL_STATE } from '../state/initialState.js';
import { findOperationalBreakevenIndex } from './projection.js';

export function exportModelData(state, projection, vestEvents, totalRemainingVesting, extras) {
  const { rawMonthlyGap, sarahCurrentNet, advanceNeeded, ssdiDenied, lifestyleCutsApplied,
    cutOliver, cutVacation, cutShopping, cutMedical, cutGym, cutAmazon, cutSaaS,
    cutEntertainment, cutGroceries, cutPersonalCare, cutSmallItems,
    lifestyleCuts, cutInHalf, extraCuts, goalResults } = extras;
  const s = state;
  const data = projection.data;
  const md = projection.monthlyData;
  const totalCuts = lifestyleCuts + cutInHalf + extraCuts;
  const totalDiscretionary = INITIAL_STATE.cutOliver + INITIAL_STATE.cutVacation + INITIAL_STATE.cutShopping + INITIAL_STATE.cutMedical + INITIAL_STATE.cutGym + INITIAL_STATE.cutAmazon + INITIAL_STATE.cutSaaS + INITIAL_STATE.cutEntertainment + INITIAL_STATE.cutGroceries + INITIAL_STATE.cutPersonalCare + INITIAL_STATE.cutSmallItems;
  const milestoneMonths = [0, 3, 6, 9, 12, 18, 24, 30, 36, 42, 48, 60, 72];
  const bcsFamilyMonthly = s.bcsFamilyMonthly;

  const exportData = {
    _meta: {
      exportedAt: new Date().toISOString(),
      model: "Family Financial Plan — Dellinger",
    },
    keyMetrics: {
      todayRawGap: rawMonthlyGap,
      nowWithPlan: data[0]?.netMonthly,
      steadyStateMonth: 36,
      steadyStateNet: data[data.findIndex(d => d.month >= 36)]?.netMonthly,
      cashFlowBreakevenMonth: findOperationalBreakevenIndex(md),
      sarahWorkYears: s.sarahWorkYears || 6,
      savingsRunway: md.every(d => d.balance >= 0) ? `${s.sarahWorkYears || 6}+ years` : `${md.findIndex(d => d.balance < 0)} months`,
      advanceAsk: advanceNeeded,
    },
    income: {
      sarah: { rate: s.sarahRate, maxRate: s.sarahMaxRate, rateGrowth: s.sarahRateGrowth, currentClients: s.sarahCurrentClients, maxClients: s.sarahMaxClients, clientGrowth: s.sarahClientGrowth, currentMonthly: sarahCurrentNet },
      msft: { startPrice: s.msftPrice, growth: s.msftGrowth, currentMonthly: data[0]?.msftVesting, totalRemaining: totalRemainingVesting },
      trustLLC: { currentMonthly: s.trustIncomeNow, futureMonthly: s.trustIncomeFuture, increaseMonth: s.trustIncreaseMonth },
      ssdi: { approvalMonth: s.ssdiApprovalMonth, denied: ssdiDenied, personal: s.ssdiPersonal, familyTotal: s.ssdiFamilyTotal, kidsAgeOutMonths: s.kidsAgeOutMonths, backPayMonths: s.ssdiBackPayMonths, backPayNet: projection.backPayActual },
      consulting: { monthly: s.chadConsulting, sgaLimit: 1690 },
      totalMonthly: data[0]?.netCashFlow + data[0]?.expenses,
    },
    expenses: {
      baseExpenses: s.baseExpenses,
      debtService: s.debtService,
      vanMonthlySavings: s.vanMonthlySavings,
      bcsFamilyMonthly: bcsFamilyMonthly,
      bcsAnnualTotal: s.bcsAnnualTotal,
      bcsParentsAnnual: s.bcsParentsAnnual,
      bcsYearsLeft: s.bcsYearsLeft,
      totalRaw: s.baseExpenses + s.debtService + s.vanMonthlySavings + bcsFamilyMonthly,
      totalWithPlan: data[0]?.expenses,
    },
    toggles: {
      retireDebt: s.retireDebt,
      lifestyleCutsApplied: lifestyleCutsApplied,
      vanSold: s.vanSold,
    },
    spendingCuts: {
      totalDiscretionary, totalCutting: totalCuts,
      totalKeeping: Math.max(0, totalDiscretionary - totalCuts),
      cutPercentage: totalDiscretionary > 0 ? Math.round((totalCuts / totalDiscretionary) * 100) : 0,
      items: [
        { category: "Oliver support (sober living + transfers)", current: INITIAL_STATE.cutOliver, cut: cutOliver, keeping: INITIAL_STATE.cutOliver - cutOliver },
        { category: "Medical out-of-pocket (excl insurance)", current: INITIAL_STATE.cutMedical, cut: cutMedical, keeping: INITIAL_STATE.cutMedical - cutMedical },
        { category: "Shopping + clothing", current: INITIAL_STATE.cutShopping, cut: cutShopping, keeping: INITIAL_STATE.cutShopping - cutShopping },
        { category: "Vacation + travel", current: INITIAL_STATE.cutVacation, cut: cutVacation, keeping: INITIAL_STATE.cutVacation - cutVacation },
        { category: "Groceries (family of 5)", current: INITIAL_STATE.cutGroceries, cut: cutGroceries, keeping: INITIAL_STATE.cutGroceries - cutGroceries },
        { category: "Personal care (salon, nails, cleaning)", current: INITIAL_STATE.cutPersonalCare, cut: cutPersonalCare, keeping: INITIAL_STATE.cutPersonalCare - cutPersonalCare },
        { category: "Gym memberships", current: INITIAL_STATE.cutGym, cut: cutGym, keeping: INITIAL_STATE.cutGym - cutGym },
        { category: "Amazon + household", current: INITIAL_STATE.cutAmazon, cut: cutAmazon, keeping: INITIAL_STATE.cutAmazon - cutAmazon },
        { category: "AI / SaaS tools", current: INITIAL_STATE.cutSaaS, cut: cutSaaS, keeping: INITIAL_STATE.cutSaaS - cutSaaS },
        { category: "Entertainment + recreation", current: INITIAL_STATE.cutEntertainment, cut: cutEntertainment, keeping: INITIAL_STATE.cutEntertainment - cutEntertainment },
        { category: "Other small items", current: INITIAL_STATE.cutSmallItems, cut: cutSmallItems, keeping: INITIAL_STATE.cutSmallItems - cutSmallItems },
      ],
    },
    debt: {
      creditCards: s.debtCC,
      personalLoans: s.debtPersonal,
      irs: s.debtIRS,
      firstmark: s.debtFirstmark,
      totalRetired: s.debtCC + s.debtPersonal + s.debtIRS + s.debtFirstmark,
      monthlyServiceEliminated: s.debtService,
    },
    oneTimeCosts: {
      mold: { cost: s.moldCost, included: s.moldInclude },
      roof: { cost: s.roofCost, included: s.roofInclude },
      otherProjects: { cost: s.otherProjects, included: s.otherInclude },
      total: (s.moldInclude ? s.moldCost : 0) + (s.roofInclude ? s.roofCost : 0) + (s.otherInclude ? s.otherProjects : 0),
    },
    savings: {
      starting: s.startingSavings,
      investmentReturn: s.investmentReturn,
      milestones: s.milestones,
    },
    trajectory: milestoneMonths.filter(m => m < md.length).map(m => {
      const d = md[m];
      return {
        month: m, label: `Y${Math.floor(m/12)}M${m%12}`,
        sarahIncome: d.sarahIncome,
        msftIncome: d.msftLump,
        msftIncomeSmoothed: d.msftSmoothed,
        trustLLCIncome: d.trustLLC,
        ssdi: d.ssdi,
        investReturn: d.investReturn,
        totalCashIncome: d.cashIncome,
        totalCashIncomeSmoothed: d.cashIncomeSmoothed,
        expenses: d.expenses,
        netCashFlow: d.netCashFlow,
        netCashFlowSmoothed: d.netCashFlowSmoothed,
        netMonthly: d.netMonthly,
        netMonthlySmoothed: d.netMonthlySmoothed,
        savingsBalance: d.balance,
      };
    }),
    msftVesting: vestEvents.map(v => ({
      label: v.label, shares: v.shares, gross: v.gross, net: v.net, monthlySmoothed: Math.round(v.net / 3),
    })),
    goals: (goalResults || []).map(r => ({
      name: r.name, type: r.type, targetAmount: r.targetAmount,
      targetMonth: r.targetMonth, achieved: r.achieved,
      currentValue: r.currentValue, progress: r.progress,
    })),
    wealth: (() => {
      const savingsEnd = md[md.length - 1]?.balance || 0;
      const endMd = md[72] || md[md.length - 1];
      const endW = { balance401k: endMd?.balance401k || 0, homeEquity: endMd?.homeEquity || 0 };
      return {
        starting401k: s.starting401k, return401k: s.return401k,
        homeEquity: s.homeEquity, homeAppreciation: s.homeAppreciation,
        projected401k: endW.balance401k,
        projectedHomeEquity: endW.homeEquity,
        totalNetWorth: savingsEnd + endW.balance401k + endW.homeEquity,
      };
    })(),
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `financial-model-export-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
