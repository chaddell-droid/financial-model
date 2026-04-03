import { fmtFull } from './formatters.js';
import { formatModelTimeLabel } from '../charts/chartContract.js';

const BRIDGE_MARKER_LIMITS = {
  overview: 10,
  plan: 9,
};

const BRIDGE_SIGNIFICANT_CHANGE = 500;
const BRIDGE_MAJOR_DROP = 1000;

function getVariantKey(variant) {
  return variant === 'plan' ? 'plan' : 'overview';
}

function toNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function getMonthValue(item) {
  return toNumber(item?.month ?? item?.m, 0);
}

function getImpactValue(item) {
  return toNumber(item?.impact ?? item?.value ?? item?.monthlyImpact, 0);
}

function formatMonthlyCurrency(value) {
  return `${fmtFull(value)}/mo`;
}

function getRowDelta(currentRow, previousRow, key) {
  return toNumber(currentRow?.[key], 0) - toNumber(previousRow?.[key], 0);
}

function pushUniqueTimelineItem(items, nextItem) {
  if (!nextItem) return;
  const month = getMonthValue(nextItem);
  if (items.some((item) => item.id === nextItem.id && getMonthValue(item) === month)) return;
  items.push(nextItem);
}

function deriveBridgeMarkerPriority(event) {
  if (Number.isFinite(event?.priority)) return event.priority;

  const byKind = {
    breakeven: 0,
    status: 1,
    benefit: 2,
    transition: 3,
    cliff: 4,
    milestone: 5,
    info: 6,
  };

  return byKind[event?.kind] ?? 99;
}

function compareMarkerOrder(a, b) {
  return (
    a._priority - b._priority
    || a.month - b.month
    || a._index - b._index
  );
}

export function buildOverviewStatusModel({
  rawMonthlyGap,
  netMonthly,
  breakevenLabel,
  breakevenIdx,
  bestProjectedGap,
  bestProjectedLabel,
  savingsZeroLabel,
  savingsZeroMonth,
  advanceNeeded,
  steadyStateNet,
  steadyLabel,
  mcResults,
}) {
  const currentGap = toNumber(netMonthly, toNumber(rawMonthlyGap, 0));
  const bestGap = toNumber(bestProjectedGap, currentGap);
  const resolvedBestLabel = bestProjectedLabel || steadyLabel || '';
  const runwayDetail = savingsZeroMonth
    ? 'Until savings are depleted'
    : 'Savings stay positive through the horizon';
  const breakevenReached = breakevenIdx >= 0;

  const items = [
    {
      id: 'breakeven',
      label: 'Breakeven',
      rawValue: breakevenIdx,
      valueLabel: breakevenReached ? breakevenLabel : 'Not reached',
      tone: breakevenReached ? 'positive' : 'caution',
      detail: breakevenReached
        ? 'Income covers expenses'
        : (breakevenLabel || 'Best projected point remains below zero'),
    },
    {
      id: 'best_projected_gap',
      label: 'Best projected gap',
      rawValue: bestGap,
      valueLabel: formatMonthlyCurrency(bestGap),
      tone: bestGap >= 0 ? 'positive' : 'text',
      detail: resolvedBestLabel || 'Best projected point',
    },
    {
      id: 'runway',
      label: 'Runway',
      rawValue: savingsZeroMonth ? toNumber(savingsZeroMonth.month, 0) : Number.POSITIVE_INFINITY,
      valueLabel: savingsZeroLabel || '6+ years',
      tone: savingsZeroMonth ? 'destructive' : 'positive',
      detail: runwayDetail,
    },
  ];

  return {
    question: 'How far are we from monthly breakeven?',
    answer: breakevenReached ? `Reached in ${breakevenLabel}` : 'Not reached in current projection',
    items,
    meta: {
      todayGap: toNumber(rawMonthlyGap, currentGap),
      steadyStateNet: toNumber(steadyStateNet, bestGap),
      steadyLabel: steadyLabel || '',
      advanceNeeded: toNumber(advanceNeeded, 0),
      monteCarloSolvency: mcResults?.solvencyRate ?? null,
    },
  };
}

export function selectBridgeMarkers(events, variant = 'overview') {
  const limit = BRIDGE_MARKER_LIMITS[getVariantKey(variant)];
  const normalized = (events || [])
    .filter(Boolean)
    .map((event, index) => ({
      ...event,
      month: getMonthValue(event),
      _priority: deriveBridgeMarkerPriority(event),
      _index: index,
    }));

  const groupedByMonth = new Map();
  for (const marker of normalized) {
    const existing = groupedByMonth.get(marker.month);
    if (!existing) {
      groupedByMonth.set(marker.month, {
        primary: marker,
        hidden: [],
      });
      continue;
    }

    if (compareMarkerOrder(marker, existing.primary) < 0) {
      existing.hidden.push(existing.primary);
      existing.primary = marker;
    } else {
      existing.hidden.push(marker);
    }
  }

  return [...groupedByMonth.values()]
    .map(({ primary, hidden }) => ({
      ...primary,
      hiddenCount: hidden.length,
      hiddenMarkers: hidden.map(({ _priority, _index, ...event }) => event),
    }))
    .sort(compareMarkerOrder)
    .slice(0, limit)
    .sort((a, b) => a.month - b.month || a._priority - b._priority)
    .map(({ _priority, _index, ...event }) => event);
}

export function groupBridgeDrivers(drivers, variant = 'overview') {
  const groups = [
    { id: 'helps_now', label: 'Helps now', items: [] },
    { id: 'changes_later', label: 'Changes later', items: [] },
    { id: 'drops_off', label: 'Drops off', items: [] },
  ];

  for (const driver of drivers || []) {
    if (!driver) continue;
    const impact = getImpactValue(driver);
    if (!impact) continue;

    let groupId = driver.group;
    if (!groupId) {
      if (impact < 0 || driver.kind === 'drop') {
        groupId = 'drops_off';
      } else if (getMonthValue(driver) <= 0) {
        groupId = 'helps_now';
      } else {
        groupId = 'changes_later';
      }
    }

    const group = groups.find((entry) => entry.id === groupId);
    if (!group) continue;
    group.items.push({
      ...driver,
      impact,
      month: getMonthValue(driver),
    });
  }

  return groups
    .map((group) => ({
      ...group,
      items: group.items
        .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact) || a.month - b.month)
        .slice(0, getVariantKey(variant) === 'plan' ? 3 : 4),
      totalImpact: group.items.reduce((sum, item) => sum + item.impact, 0),
    }))
    .filter((group) => group.items.length > 0)
    .slice(0, 3);
}

function buildDynamicBridgeSignals({
  monthlyDetail,
  ssLabel,
  vanSold,
  vanSaleMonth,
  bcsYearsLeft,
  milestones,
}) {
  const events = [];
  const drivers = [];
  const resolvedVanSaleMonth = vanSold ? Math.max(0, toNumber(vanSaleMonth, 0)) : -1;
  const bcsEndMonth = Math.max(0, toNumber(bcsYearsLeft, 0)) * 12;
  const milestoneByMonth = new Map((milestones || []).map((milestone) => [toNumber(milestone?.month, 0), milestone]));

  for (let index = 1; index < (monthlyDetail?.length || 0); index += 1) {
    const previousRow = monthlyDetail[index - 1];
    const currentRow = monthlyDetail[index];
    const month = toNumber(currentRow?.month, index);

    const ssDelta = getRowDelta(currentRow, previousRow, 'ssdi');
    if (ssDelta >= BRIDGE_SIGNIFICANT_CHANGE) {
      pushUniqueTimelineItem(events, {
        id: 'ss_income',
        label: `${ssLabel || 'Income'} starts`,
        month,
        kind: 'transition',
        priority: 2,
      });
    } else if (ssDelta <= -BRIDGE_SIGNIFICANT_CHANGE) {
      const stepdownLabel = toNumber(currentRow?.ssdi, 0) > 0 ? 'Kids age out' : `${ssLabel || 'Income'} ends`;
      pushUniqueTimelineItem(events, {
        id: 'ss_stepdown',
        label: stepdownLabel,
        month,
        kind: 'cliff',
        priority: 3,
      });
      pushUniqueTimelineItem(drivers, {
        id: 'ss_stepdown',
        label: stepdownLabel,
        impact: ssDelta,
        month,
        group: 'drops_off',
        kind: 'drop',
      });
    }

    const trustDelta = getRowDelta(currentRow, previousRow, 'trustLLC');
    if (trustDelta >= BRIDGE_SIGNIFICANT_CHANGE) {
      pushUniqueTimelineItem(events, {
        id: 'trust_increase',
        label: 'Trust rises',
        month,
        kind: 'transition',
      });
    }

    const jobDelta = getRowDelta(currentRow, previousRow, 'chadJobIncome');
    if (jobDelta >= BRIDGE_SIGNIFICANT_CHANGE) {
      pushUniqueTimelineItem(events, {
        id: 'chad_job',
        label: 'Chad job starts',
        month,
        kind: 'transition',
      });
    }

    const msftDelta = getRowDelta(currentRow, previousRow, 'msftSmoothed');
    if (msftDelta <= -BRIDGE_MAJOR_DROP) {
      let markerId = `msft_stepdown_${month}`;
      let markerLabel = 'MSFT step-down';
      if (toNumber(currentRow?.msftSmoothed, 0) <= 0) {
        markerId = 'msft_end';
        markerLabel = 'MSFT ends';
      } else if (month >= 18 && Math.abs(msftDelta) >= 5000) {
        markerId = 'msft_cliff';
        markerLabel = 'MSFT cliff';
      }

      pushUniqueTimelineItem(events, {
        id: markerId,
        label: markerLabel,
        month,
        kind: 'cliff',
        priority: markerId === 'msft_end' ? 4 : 3,
      });

      if (markerId.startsWith('msft_stepdown_')) {
        pushUniqueTimelineItem(drivers, {
          id: markerId,
          label: markerLabel,
          impact: msftDelta,
          month,
          group: 'drops_off',
          kind: 'drop',
        });
      }
    }

    const expenseDelta = getRowDelta(currentRow, previousRow, 'expenses');
    if (expenseDelta <= -BRIDGE_SIGNIFICANT_CHANGE) {
      if (resolvedVanSaleMonth > 0 && month === resolvedVanSaleMonth) {
        pushUniqueTimelineItem(events, {
          id: 'van_sold',
          label: 'Van sold',
          month,
          kind: 'benefit',
        });
      }

      if (bcsEndMonth > 0 && month === bcsEndMonth) {
        pushUniqueTimelineItem(events, {
          id: 'bcs_end',
          label: 'BCS ends',
          month,
          kind: 'transition',
        });
      }

      const milestone = milestoneByMonth.get(month);
      if (milestone) {
        pushUniqueTimelineItem(events, {
          id: `milestone-${milestone.name || milestone.month}`,
          label: milestone.name || formatModelTimeLabel(month),
          month,
          kind: 'transition',
        });
      }
    }
  }

  return { events, drivers };
}

export function buildBridgeStoryModel({
  monthlyDetail,
  data,
  milestones,
  variant,
  todayGap,
  finalNet,
  crossMonth,
  trustIncomeNow,
  trustIncomeFuture,
  trustIncreaseMonth,
  retireDebt,
  debtService,
  vanSold,
  vanSaleMonth,
  vanMonthlySavings,
  lifestyleCutsApplied,
  totalCuts,
  bcsYearsLeft,
  bcsFamilyMonthly,
  currentMsft,
  postCliffMsft,
  ssLabel,
  ssMonth,
  ssAmount,
  sarahGrowth,
  monthlyReturn,
  chadJobLabel,
  chadJobMonth,
  chadJobMonthlyNet,
  chadJobHealthVal,
}) {
  const variantKey = getVariantKey(variant);
  const rows = data || [];
  const currentRow = rows[0] || {};
  const bestRow = rows.reduce((best, row) => (
    !best || toNumber(row?.netMonthly, Number.NEGATIVE_INFINITY) > toNumber(best?.netMonthly, Number.NEGATIVE_INFINITY)
      ? row
      : best
  ), null);
  const resolvedCrossMonth = crossMonth || rows.find((row) => toNumber(row?.netCashFlow, row?.netMonthly) >= 0) || null;
  const currentGap = toNumber(currentRow?.netMonthly, toNumber(todayGap, 0));
  const bestGap = toNumber(bestRow?.netMonthly, currentGap);
  const steadyGap = toNumber(finalNet, toNumber(rows[rows.length - 1]?.netMonthly, currentGap));
  const cliffLoss = Math.max(0, toNumber(currentMsft, 0) - toNumber(postCliffMsft, 0));
  const endLoss = Math.max(0, toNumber(postCliffMsft, 0));
  const trustIncrease = Math.max(0, toNumber(trustIncomeFuture, 0) - toNumber(trustIncomeNow, 0));
  const bcsEndMonth = toNumber(bcsYearsLeft, 0) * 12;
  const jobLift = toNumber(chadJobMonthlyNet, 0) + toNumber(chadJobHealthVal, 0);
  const resolvedVanSaleMonth = vanSold ? Math.max(0, toNumber(vanSaleMonth, 0)) : 0;
  const dynamicSignals = buildDynamicBridgeSignals({
    monthlyDetail,
    ssLabel,
    vanSold,
    vanSaleMonth: resolvedVanSaleMonth,
    bcsYearsLeft,
    milestones,
  });

  const events = [];
  if (retireDebt) events.push({ id: 'debt_retired', label: 'Debt retired', month: 0, kind: 'benefit' });
  if (vanSold) events.push({ id: 'van_sold', label: 'Van sold', month: resolvedVanSaleMonth, kind: 'benefit' });
  if (lifestyleCutsApplied) events.push({ id: 'cuts_applied', label: 'Cuts applied', month: 0, kind: 'benefit' });
  if (resolvedCrossMonth) {
    events.push({
      id: 'breakeven',
      label: `Breakeven ${resolvedCrossMonth.label || formatModelTimeLabel(resolvedCrossMonth.month)}`,
      month: getMonthValue(resolvedCrossMonth),
      kind: 'breakeven',
    });
  }
  if (ssAmount > 0) {
    events.push({
      id: 'ss_income',
      label: `${ssLabel || 'Income'} starts`,
      month: toNumber(ssMonth, 0),
      kind: 'transition',
    });
  }
  if (jobLift > 0) {
    events.push({
      id: 'chad_job',
      label: chadJobLabel || 'Chad job starts',
      month: toNumber(chadJobMonth, 0),
      kind: 'transition',
    });
  }
  if (trustIncrease > 0) {
    events.push({
      id: 'trust_increase',
      label: 'Trust rises',
      month: toNumber(trustIncreaseMonth, 0),
      kind: 'transition',
    });
  }
  if (cliffLoss > 0) events.push({ id: 'msft_cliff', label: 'MSFT cliff', month: 18, kind: 'cliff' });
  if (endLoss > 0) events.push({ id: 'msft_end', label: 'MSFT ends', month: 30, kind: 'cliff' });
  if (bcsEndMonth > 0 && bcsFamilyMonthly > 0) {
    events.push({ id: 'bcs_end', label: 'BCS ends', month: bcsEndMonth, kind: 'transition' });
  }
  for (const milestone of milestones || []) {
    if ((milestone?.savings || 0) > 0) {
      events.push({
        id: `milestone-${milestone.name || milestone.month}`,
        label: milestone.name || formatModelTimeLabel(milestone.month),
        month: toNumber(milestone.month, 0),
        kind: 'milestone',
      });
    }
  }
  for (const event of dynamicSignals.events) pushUniqueTimelineItem(events, event);

  const drivers = [
    { id: 'returns', label: 'Investment returns', impact: toNumber(monthlyReturn, 0), month: 0, group: 'helps_now' },
    { id: 'debt_retired', label: 'Debt retired', impact: retireDebt ? toNumber(debtService, 0) : 0, month: 0, group: 'helps_now' },
    {
      id: 'van_sold',
      label: 'Van sold',
      impact: vanSold ? toNumber(vanMonthlySavings, 0) : 0,
      month: resolvedVanSaleMonth,
      group: resolvedVanSaleMonth > 0 ? 'changes_later' : 'helps_now',
    },
    { id: 'cuts_applied', label: 'Spending cuts', impact: lifestyleCutsApplied ? toNumber(totalCuts, 0) : 0, month: 0, group: 'helps_now' },
    { id: 'ss_income', label: ssLabel || 'Outside income', impact: toNumber(ssAmount, 0), month: toNumber(ssMonth, 0), group: 'changes_later' },
    { id: 'chad_job', label: chadJobLabel || 'Chad job', impact: jobLift, month: toNumber(chadJobMonth, 0), group: 'changes_later' },
    { id: 'trust_increase', label: 'Trust increase', impact: trustIncrease, month: toNumber(trustIncreaseMonth, 0), group: 'changes_later' },
    { id: 'sarah_growth', label: 'Sarah growth', impact: toNumber(sarahGrowth, 0), month: 36, group: 'changes_later' },
    { id: 'bcs_end', label: 'BCS ends', impact: toNumber(bcsFamilyMonthly, 0), month: bcsEndMonth, group: 'changes_later' },
    { id: 'msft_cliff', label: 'MSFT cliff', impact: -cliffLoss, month: 18, group: 'drops_off', kind: 'drop' },
    { id: 'msft_end', label: 'MSFT ends', impact: -endLoss, month: 30, group: 'drops_off', kind: 'drop' },
  ];
  for (const driver of dynamicSignals.drivers) pushUniqueTimelineItem(drivers, driver);

  for (const milestone of milestones || []) {
    if ((milestone?.savings || 0) > 0) {
      drivers.push({
        id: `milestone-${milestone.name || milestone.month}`,
        label: milestone.name || formatModelTimeLabel(milestone.month),
        impact: toNumber(milestone.savings, 0),
        month: toNumber(milestone.month, 0),
        group: 'changes_later',
      });
    }
  }

  return {
    variant: variantKey,
    title: 'Monthly gap path',
    subtitle: variantKey === 'overview'
      ? 'How the monthly gap changes under the current plan.'
      : 'How the gap changes as the plan takes effect.',
    chips: [
      {
        id: 'current_gap',
        label: 'Current gap',
        value: formatMonthlyCurrency(currentGap),
        tone: currentGap >= 0 ? 'positive' : 'destructive',
      },
      {
        id: 'best_projected_gap',
        label: 'Best projected point',
        value: `${formatMonthlyCurrency(bestGap)}${bestRow?.label ? ` at ${bestRow.label}` : ''}`,
        tone: bestGap >= 0 ? 'positive' : 'caution',
      },
      resolvedCrossMonth
        ? {
            id: 'breakeven',
            label: 'Breakeven',
            value: resolvedCrossMonth.label || formatModelTimeLabel(resolvedCrossMonth.month),
            tone: 'positive',
          }
        : {
            id: 'steady_state',
            label: 'Steady state',
            value: `${formatMonthlyCurrency(steadyGap)}${rows[rows.length - 1]?.label ? ` at ${rows[rows.length - 1].label}` : ''}`,
            tone: steadyGap >= 0 ? 'positive' : 'destructive',
          },
    ],
    markers: selectBridgeMarkers(events, variantKey),
    driverGroups: groupBridgeDrivers(drivers, variantKey),
    meta: {
      currentGap,
      bestGap,
      bestLabel: bestRow?.label || '',
      steadyGap,
      monthlyRows: monthlyDetail?.length || 0,
    },
  };
}
