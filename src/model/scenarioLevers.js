import { fmtFull } from './formatters.js';

export const PRIMARY_LEVERS_BCS_STATUS_QUO = 25000;

function toMonthlyBcsShare(bcsAnnualTotal, bcsParentsAnnual) {
  return Math.round(Math.max(0, bcsAnnualTotal - bcsParentsAnnual) / 12);
}

export function getEffectiveCuts({
  lifestyleCutsApplied,
  cutsOverride,
  lifestyleCuts,
  cutInHalf,
  extraCuts,
}) {
  const detailTotal = lifestyleCuts + cutInHalf + extraCuts;
  const effectiveTotal = cutsOverride != null ? cutsOverride : detailTotal;
  const activeSavings = lifestyleCutsApplied ? effectiveTotal : 0;
  return {
    detailTotal,
    effectiveTotal,
    activeSavings,
  };
}

export function rankRecurringLevers(levers) {
  return levers.map((lever, index) => ({
    ...lever,
    rank: index + 1,
  }));
}

export function buildPrimaryLeversModel(input) {
  const {
    retireDebt,
    lifestyleCutsApplied,
    cutsOverride,
    lifestyleCuts,
    cutInHalf,
    extraCuts,
    debtTotal,
    debtService,
    baseExpenses,
    currentExpenses,
    vanSold,
    vanMonthlySavings,
    bcsAnnualTotal,
    bcsParentsAnnual,
    bcsYearsLeft,
    bcsFamilyMonthly,
    moldCost,
    moldInclude,
    roofCost,
    roofInclude,
    otherProjects,
    otherInclude,
    advanceNeeded,
  } = input;

  const cuts = getEffectiveCuts({
    lifestyleCutsApplied,
    cutsOverride,
    lifestyleCuts,
    cutInHalf,
    extraCuts,
  });

  const statusQuoAnnualContribution = Math.min(PRIMARY_LEVERS_BCS_STATUS_QUO, bcsAnnualTotal);
  const statusQuoFamilyShare = toMonthlyBcsShare(bcsAnnualTotal, statusQuoAnnualContribution);
  const monthlyFamilyShare = Number.isFinite(bcsFamilyMonthly)
    ? bcsFamilyMonthly
    : toMonthlyBcsShare(bcsAnnualTotal, bcsParentsAnnual);
  const monthlyDeltaFromStatusQuo = statusQuoFamilyShare - monthlyFamilyShare;
  const totalDeltaOverRemainingYears = (bcsParentsAnnual - statusQuoAnnualContribution) * bcsYearsLeft;

  const computedCurrentExpenses =
    baseExpenses
    - cuts.activeSavings
    + (retireDebt ? 0 : debtService)
    + (vanSold ? 0 : vanMonthlySavings)
    + monthlyFamilyShare;

  const recurringLevers = rankRecurringLevers([
    {
      id: 'retire_debt',
      label: 'Retire all debt',
      monthlyImpact: retireDebt ? debtService : 0,
      availableMonthlyImpact: debtService,
      active: retireDebt,
      oneTimeImpact: retireDebt ? debtTotal : 0,
      kind: 'monthly_savings',
    },
    {
      id: 'spending_cuts',
      label: 'Lifestyle + spending cuts',
      monthlyImpact: cuts.activeSavings,
      availableMonthlyImpact: cuts.effectiveTotal,
      active: lifestyleCutsApplied,
      oneTimeImpact: 0,
      kind: 'monthly_savings',
    },
    {
      id: 'sell_van',
      label: 'Sell the van',
      monthlyImpact: vanSold ? vanMonthlySavings : 0,
      availableMonthlyImpact: vanMonthlySavings,
      active: vanSold,
      oneTimeImpact: 0,
      kind: 'monthly_savings',
    },
    {
      id: 'bcs_support',
      label: 'BCS support',
      monthlyImpact: monthlyDeltaFromStatusQuo,
      availableMonthlyImpact: statusQuoFamilyShare,
      active: bcsParentsAnnual !== statusQuoAnnualContribution,
      oneTimeImpact: 0,
      multiYearImpact: totalDeltaOverRemainingYears,
      kind: 'monthly_savings',
    },
  ]);

  const consequenceItems = [
    {
      id: 'debt_retirement',
      group: 'changed_here',
      label: 'Debt retirement',
      amount: retireDebt ? debtTotal : 0,
      active: retireDebt,
      kind: 'one_time',
    },
    {
      id: 'bcs_support_delta',
      group: 'changed_here',
      label: 'BCS support change',
      amount: Math.abs(totalDeltaOverRemainingYears),
      signedAmount: totalDeltaOverRemainingYears,
      active: totalDeltaOverRemainingYears !== 0,
      kind: 'multi_year',
    },
    {
      id: 'mold_remediation',
      group: 'other_assumptions',
      label: 'Mold remediation',
      amount: moldInclude ? moldCost : 0,
      active: moldInclude,
      kind: 'one_time',
    },
    {
      id: 'roof',
      group: 'other_assumptions',
      label: 'Roof',
      amount: roofInclude ? roofCost : 0,
      active: roofInclude,
      kind: 'one_time',
    },
    {
      id: 'house_projects',
      group: 'other_assumptions',
      label: 'House projects + toilets',
      amount: otherInclude ? otherProjects : 0,
      active: otherInclude,
      kind: 'one_time',
    },
  ];

  const breakdown = [
    { id: 'base_living', label: 'Base living', amount: baseExpenses, kind: 'base' },
    {
      id: 'spending_cuts',
      label: 'Spending cuts',
      amount: cuts.activeSavings,
      active: lifestyleCutsApplied,
      kind: 'savings',
    },
    { id: 'net_living', label: 'Net living', amount: baseExpenses - cuts.activeSavings, kind: 'subtotal' },
    {
      id: 'debt_service',
      label: 'Debt service',
      amount: retireDebt ? 0 : debtService,
      originalAmount: debtService,
      active: !retireDebt,
      kind: 'expense',
    },
    {
      id: 'van',
      label: 'Van',
      amount: vanSold ? 0 : vanMonthlySavings,
      originalAmount: vanMonthlySavings,
      active: !vanSold,
      kind: 'expense',
    },
    {
      id: 'bcs_tuition',
      label: 'BCS tuition',
      amount: monthlyFamilyShare,
      originalAmount: statusQuoFamilyShare,
      active: monthlyFamilyShare > 0,
      kind: 'expense',
    },
    {
      id: 'total',
      label: 'Total',
      amount: Number.isFinite(currentExpenses) ? currentExpenses : computedCurrentExpenses,
      kind: 'total',
    },
  ];

  const topLever = recurringLevers.find((lever) => lever.monthlyImpact > 0) || null;
  const topAvailableLever = recurringLevers.reduce((best, lever) => {
    if (lever.availableMonthlyImpact <= 0) return best;
    if (!best || lever.availableMonthlyImpact > best.availableMonthlyImpact) return lever;
    return best;
  }, null);

  return {
    summary: {
      monthlyOutflow: Number.isFinite(currentExpenses) ? currentExpenses : computedCurrentExpenses,
      monthlySavings: recurringLevers.reduce((sum, lever) => sum + Math.max(0, lever.monthlyImpact), 0),
      oneTimeAsk: advanceNeeded,
      topLeverId: topLever ? topLever.id : '',
      topLeverLabel: topLever ? topLever.label : '',
      topLeverSavings: topLever ? topLever.monthlyImpact : 0,
      availableLeverId: topAvailableLever ? topAvailableLever.id : '',
      availableLeverLabel: topAvailableLever ? topAvailableLever.label : '',
      availableLeverSavings: topAvailableLever ? topAvailableLever.availableMonthlyImpact : 0,
    },
    recurringLevers,
    consequenceItems,
    breakdown,
    bcs: {
      monthlyFamilyShare,
      monthlyDeltaFromStatusQuo,
      totalDeltaOverRemainingYears,
      statusQuoAnnualContribution,
      statusQuoFamilyShare,
      tickMarks: [
        { value: 0, label: '$0', sub: 'We pay all' },
        { value: statusQuoAnnualContribution, label: fmtFull(statusQuoAnnualContribution), sub: 'Status quo' },
        { value: bcsAnnualTotal, label: fmtFull(bcsAnnualTotal), sub: 'Fully covered' },
      ],
    },
  };
}
