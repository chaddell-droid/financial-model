import { computeWealthProjection } from './projection.js';

export function exportModelData(state, projection, vestEvents, totalRemainingVesting, extras) {
  const { rawMonthlyGap, sarahCurrentNet, advanceNeeded, ssdiDenied, lifestyleCutsApplied,
    cutOliver, cutVacation, cutShopping, cutMedical, cutGym, cutAmazon, cutSaaS,
    cutEntertainment, cutGroceries, cutPersonalCare, cutSmallItems,
    lifestyleCuts, cutInHalf, extraCuts } = extras;
  const s = state;
  const data = projection.data;
  const md = projection.monthlyData;
  const totalCuts = lifestyleCuts + cutInHalf + extraCuts;
  const totalDiscretionary = 5832 + 2040 + 2746 + 4666 + 1901 + 1166 + 655 + 563 + 557 + 500 + 2478;
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
      cashFlowBreakevenMonth: md.findIndex(d => d.netMonthly >= 0),
      savingsRunway: md.every(d => d.balance >= 0) ? "6+ years" : `${md.findIndex(d => d.balance < 0)} months`,
      advanceAsk: advanceNeeded,
    },
    income: {
      sarah: { rate: s.sarahRate, maxRate: s.sarahMaxRate, rateGrowth: s.sarahRateGrowth, currentClients: s.sarahCurrentClients, maxClients: s.sarahMaxClients, clientGrowth: s.sarahClientGrowth, currentMonthly: sarahCurrentNet },
      msft: { floorPrice: 410.68, growth: s.msftGrowth, currentMonthly: data[0]?.msftVesting, totalRemaining: totalRemainingVesting },
      farmLLC: { annual: s.llcAnnual, multiplier: s.llcMultiplier, delayMonths: s.llcDelayMonths, improves: s.llcImproves, currentMonthly: Math.round(s.llcAnnual / 12), futureMonthly: s.llcImproves ? Math.round(s.llcAnnual * s.llcMultiplier / 12) : Math.round(s.llcAnnual / 12) },
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
      llcImproves: s.llcImproves,
    },
    spendingCuts: {
      totalDiscretionary, totalCutting: totalCuts,
      totalKeeping: totalDiscretionary - totalCuts,
      cutPercentage: Math.round((totalCuts / totalDiscretionary) * 100),
      items: [
        { category: "Oliver support (sober living + transfers)", current: 5832, cut: cutOliver, keeping: 5832 - cutOliver },
        { category: "Medical out-of-pocket (excl insurance)", current: 4666, cut: cutMedical, keeping: 4666 - cutMedical },
        { category: "Shopping + clothing", current: 2746, cut: cutShopping, keeping: 2746 - cutShopping },
        { category: "Vacation + travel", current: 2040, cut: cutVacation, keeping: 2040 - cutVacation },
        { category: "Groceries (family of 5)", current: 1901, cut: cutGroceries, keeping: 1901 - cutGroceries },
        { category: "Personal care (salon, nails, cleaning)", current: 1166, cut: cutPersonalCare, keeping: 1166 - cutPersonalCare },
        { category: "Gym memberships", current: 655, cut: cutGym, keeping: 655 - cutGym },
        { category: "Amazon + household", current: 563, cut: cutAmazon, keeping: 563 - cutAmazon },
        { category: "AI / SaaS tools", current: 557, cut: cutSaaS, keeping: 557 - cutSaaS },
        { category: "Entertainment + recreation", current: 500, cut: cutEntertainment, keeping: 500 - cutEntertainment },
        { category: "Other small items", current: 2478, cut: cutSmallItems, keeping: 2478 - cutSmallItems },
      ],
    },
    debt: {
      creditCards: s.debtCC,
      personalLoans: s.debtPersonal,
      irs: s.debtIRS,
      firstmark: s.debtFirstmark,
      totalRetired: s.debtCC + s.debtPersonal + s.debtIRS,
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
        sarahIncome: d.sarahIncome, msftIncome: d.msftSmoothed, llcIncome: d.llcMonthly,
        ssdi: d.ssdi, investReturn: d.investReturn, totalCashIncome: d.cashIncome,
        expenses: d.expenses, netMonthly: d.netMonthly, savingsBalance: d.balance,
      };
    }),
    msftVesting: vestEvents.map(v => ({
      label: v.label, shares: v.shares, gross: v.gross, net: v.net, monthlySmoothed: Math.round(v.net / 3),
    })),
    wealth: (() => {
      const { wealthData } = computeWealthProjection(s);
      const savingsEnd = md[md.length - 1]?.balance || 0;
      const endW = wealthData[72] || wealthData[wealthData.length - 1];
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
