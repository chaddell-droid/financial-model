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
    capitalItems,
    customLevers,
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

  const builtInLevers = [
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
  ];

  const customLeverEntries = Array.isArray(customLevers)
    ? customLevers.map((lv) => {
        const maxImpact = Math.max(0, Number(lv.maxImpact) || 0);
        const currentValue = Math.max(0, Math.min(maxImpact, Number(lv.currentValue) || 0));
        const active = Boolean(lv.active);
        return {
          id: `custom:${lv.id}`,
          label: lv.name || 'Custom lever',
          description: lv.description || '',
          monthlyImpact: active ? currentValue : 0,
          availableMonthlyImpact: maxImpact,
          active,
          oneTimeImpact: 0,
          kind: 'monthly_savings',
          custom: true,
          sourceId: lv.id,
        };
      })
    : [];

  const recurringLevers = rankRecurringLevers([...builtInLevers, ...customLeverEntries]);

  // Capital consequences: prefer array-based capitalItems when available;
  // fall back to legacy scalar fields for call sites that haven't migrated.
  // Preserve stable IDs (`mold_remediation`, `roof`, `house_projects`) for legacy
  // items so existing consumers and tests keep working.
  const LEGACY_ID_BY_KEY = {
    'legacy-mold': 'mold_remediation',
    'legacy-roof': 'roof',
    'legacy-other': 'house_projects',
  };
  const effectiveCapitalItems = Array.isArray(capitalItems) && capitalItems.length > 0
    ? capitalItems
    : [
        { id: 'legacy-mold', name: 'Mold remediation', cost: moldCost || 0, include: Boolean(moldInclude) },
        { id: 'legacy-roof', name: 'Roof', cost: roofCost || 0, include: Boolean(roofInclude) },
        { id: 'legacy-other', name: 'House projects + toilets', cost: otherProjects || 0, include: Boolean(otherInclude) },
      ];

  const capitalConsequenceItems = effectiveCapitalItems.map((it) => ({
    id: LEGACY_ID_BY_KEY[it.id] || `capital:${it.id}`,
    group: 'other_assumptions',
    label: it.name || 'Capital item',
    amount: it.include ? Math.max(0, Number(it.cost) || 0) : 0,
    active: Boolean(it.include),
    kind: 'one_time',
  }));

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
    ...capitalConsequenceItems,
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
