import React, { memo, useMemo } from 'react';
import SurfaceCard from '../components/ui/SurfaceCard.jsx';
import { DAYS_PER_MONTH, SGA_LIMIT } from '../model/constants.js';
import { getVestingMonthly } from '../model/vesting.js';
import { fmtFull } from '../model/formatters.js';
import { buildBridgeStoryModel } from '../model/overviewStory.js';
import { formatModelTimeLabel } from './chartContract.js';
import { UI_COLORS, UI_SPACE, UI_TEXT } from '../ui/tokens.js';

const MARKER_COLORS = {
  breakeven: UI_COLORS.positive,
  benefit: UI_COLORS.positive,
  transition: UI_COLORS.info,
  cliff: UI_COLORS.caution,
  milestone: UI_COLORS.textMuted,
};

function getChipToneColor(tone) {
  if (tone === 'positive') return UI_COLORS.positive;
  if (tone === 'caution') return UI_COLORS.caution;
  if (tone === 'destructive') return UI_COLORS.destructive;
  return UI_COLORS.textStrong;
}

function getTickStep(minValue, maxValue) {
  const span = Math.max(1, maxValue - minValue);
  if (span > 40000) return 10000;
  if (span > 20000) return 5000;
  if (span > 10000) return 2500;
  return 1000;
}

function estimateMarkerWidth(label) {
  return Math.max(64, Math.round((label?.length || 0) * 6.5));
}

function rectsIntersect(a, b) {
  return !(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top);
}

function getMarkerClusterItems(marker) {
  return [marker, ...(marker.hiddenMarkers || [])];
}

function evaluatePlacement(rect, placedRects) {
  const padding = 10;
  const padded = {
    left: rect.left - padding,
    right: rect.right + padding,
    top: rect.top - 6,
    bottom: rect.bottom + 6,
  };
  const collisions = placedRects.filter((placed) => rectsIntersect(padded, placed));
  return {
    collides: collisions.length > 0,
    overlapArea: collisions.reduce((sum, placed) => {
      const width = Math.max(0, Math.min(padded.right, placed.right) - Math.max(padded.left, placed.left));
      const height = Math.max(0, Math.min(padded.bottom, placed.bottom) - Math.max(padded.top, placed.top));
      return sum + width * height;
    }, 0),
  };
}

function layoutMarkerLabels(markers, xOf, padT, plotH, variant) {
  const candidateOffsets = variant === 'plan'
    ? [
        { anchor: 'top', offset: 8 },
        { anchor: 'bottom', offset: 8 },
        { anchor: 'top', offset: 52 },
        { anchor: 'bottom', offset: 52 },
        { anchor: 'top', offset: 96 },
        { anchor: 'bottom', offset: 96 },
        { anchor: 'top', offset: 140 },
      ]
    : [
        { anchor: 'top', offset: 8 },
        { anchor: 'bottom', offset: 8 },
        { anchor: 'top', offset: 64 },
        { anchor: 'bottom', offset: 64 },
        { anchor: 'top', offset: 120 },
        { anchor: 'bottom', offset: 120 },
        { anchor: 'top', offset: 176 },
        { anchor: 'bottom', offset: 176 },
      ];
  const placedRects = [];

  return markers.map((marker) => {
    const items = getMarkerClusterItems(marker);
    const width = items.reduce((maxWidth, item) => Math.max(maxWidth, estimateMarkerWidth(item.label)), 64) + 12;
    const height = items.length * 16 + 8;
    const x = xOf(marker.month);

    let bestPlacement = null;
    for (const candidate of candidateOffsets) {
      const top = candidate.anchor === 'top'
        ? padT + candidate.offset
        : padT + plotH - candidate.offset - height;
      const rect = {
        left: x - width / 2,
        right: x + width / 2,
        top,
        bottom: top + height,
      };
      const evaluation = evaluatePlacement(rect, placedRects);
      if (!bestPlacement || (!evaluation.collides && bestPlacement.collides) || evaluation.overlapArea < bestPlacement.overlapArea) {
        bestPlacement = {
          ...candidate,
          top,
          rect,
          ...evaluation,
        };
        if (!evaluation.collides) break;
      }
    }

    placedRects.push(bestPlacement.rect);
    return {
      ...marker,
      labelItems: items,
      labelWidth: width,
      labelHeight: height,
      labelTop: bestPlacement.top,
      anchor: bestPlacement.anchor,
    };
  });
}

function getMarkerTextColor(item, markerColor, isPrimary) {
  if (isPrimary) return markerColor;
  if (item.kind === 'cliff') return UI_COLORS.caution;
  return UI_COLORS.textStrong;
}

function getMarkerLeaderY(marker, pointY) {
  if (marker.anchor === 'top') {
    return Math.min(pointY - 6, marker.labelTop + marker.labelHeight + 2);
  }
  return Math.max(pointY + 6, marker.labelTop - 2);
}

function getMarkerTextY(marker, index) {
  return marker.labelTop + 15 + index * 16;
}

function getMarkerClusterOpacity(pointY, marker) {
  const leaderY = getMarkerLeaderY(marker, pointY);
  return Math.abs(pointY - leaderY) > 4 ? 0.35 : 0.18;
}

function getMarkerBubbleY(marker) {
  return marker.labelTop + 1;
}

function getMarkerBubbleHeight(marker) {
  return marker.labelHeight - 2;
}

function getMarkerBubbleX(x, marker) {
  return x - marker.labelWidth / 2;
}

function getMarkerLabelPrefix(isPrimary) {
  return isPrimary ? '' : '• ';
}

function getMarkerLabelWeight(isPrimary) {
  return isPrimary ? '700' : '500';
}

function getMarkerLabelOpacity(isPrimary) {
  return isPrimary ? 1 : 0.92;
}

function getMarkerLabelTestId(item) {
  return `bridge-marker-${item.id}`;
}

function getMarkerClusterTestId(marker) {
  return `bridge-marker-cluster-${marker.id}`;
}

function getMarkerBubbleTestId(marker) {
  return `bridge-marker-bubble-${marker.id}`;
}

function getMarkerLineTestId(marker) {
  return `bridge-marker-line-${marker.id}`;
}

function getMarkerDotTestId(marker) {
  return `bridge-marker-dot-${marker.id}`;
}

function getMarkerTextAnchor() {
  return 'middle';
}

function getMarkerBubbleFill() {
  return 'rgba(15, 23, 42, 0.94)';
}

function getMarkerFontFamily() {
  return "'Inter', sans-serif";
}

function getMarkerFontSize() {
  return '11';
}

function getMarkerBubbleRadius() {
  return '8';
}

function getMarkerBubbleStrokeOpacity() {
  return '0.22';
}

function getMarkerTextBaseline() {
  return 'middle';
}

function getMarkerTextLetterSpacing(isPrimary) {
  return isPrimary ? '0' : '0.01em';
}

function getMarkerTextValue(item, isPrimary) {
  return `${getMarkerLabelPrefix(isPrimary)}${item.label}`;
}

function getMarkerTextFill(item, markerColor, isPrimary) {
  return getMarkerTextColor(item, markerColor, isPrimary);
}

function getMarkerTextKey(item) {
  return item.id;
}

function getMarkerTextItems(marker) {
  return marker.labelItems || [marker];
}

function getMarkerTextIsPrimary(marker, item, index) {
  return index === 0 && item.id === marker.id;
}

function getMarkerBubbleWidth(marker) {
  return marker.labelWidth;
}

function getMarkerLineOpacity(pointY, marker) {
  return getMarkerClusterOpacity(pointY, marker);
}

function getMarkerLineTargetY(pointY, marker) {
  return getMarkerLeaderY(marker, pointY);
}

function getMarkerCircleStroke() {
  return '#0f172a';
}

function getMarkerLayouts(story, xOf, padT, plotH, variant) {
  return layoutMarkerLabels(story.markers, xOf, padT, plotH, variant);
}

function getMarkerBubbleStroke(markerColor) {
  return markerColor;
}

function getMarkerTextFontWeight(isPrimary) {
  return getMarkerLabelWeight(isPrimary);
}

function getMarkerTextOpacityValue(isPrimary) {
  return getMarkerLabelOpacity(isPrimary);
}

function getMarkerLineDasharray() {
  return '3,3';
}

function getMarkerTextFamily() {
  return getMarkerFontFamily();
}

function getMarkerTextFontSizeValue() {
  return getMarkerFontSize();
}

function getMarkerBubbleRx() {
  return getMarkerBubbleRadius();
}

function getMarkerBubbleRy() {
  return getMarkerBubbleRadius();
}

function getMarkerTextDominantBaseline() {
  return getMarkerTextBaseline();
}

function getMarkerLineStrokeWidth() {
  return '1';
}

function getMarkerCircleRadius() {
  return '3.5';
}

function getMarkerCircleStrokeWidth() {
  return '1';
}

function getMarkerBubbleStrokeWidth() {
  return '1';
}

function getMarkerBubbleFillOpacity() {
  return 1;
}

function getMarkerLabelItems(marker) {
  return getMarkerTextItems(marker);
}

function getMarkerLabelItemProps(marker, item, index, markerColor) {
  const isPrimary = getMarkerTextIsPrimary(marker, item, index);
  return {
    isPrimary,
    testId: getMarkerLabelTestId(item),
    text: getMarkerTextValue(item, isPrimary),
    fill: getMarkerTextFill(item, markerColor, isPrimary),
    fontWeight: getMarkerTextFontWeight(isPrimary),
    opacity: getMarkerTextOpacityValue(isPrimary),
    letterSpacing: getMarkerTextLetterSpacing(isPrimary),
  };
}

function getMarkerLabelY(marker, index) {
  return getMarkerTextY(marker, index);
}

function getMarkerLabelX(x) {
  return x;
}

function getMarkerLayoutsForStory(story, xOf, padT, plotH, variant) {
  return getMarkerLayouts(story, xOf, padT, plotH, variant);
}

function getMarkerBubbleProps(marker, x, markerColor) {
  return {
    testId: getMarkerBubbleTestId(marker),
    x: getMarkerBubbleX(x, marker),
    y: getMarkerBubbleY(marker),
    width: getMarkerBubbleWidth(marker),
    height: getMarkerBubbleHeight(marker),
    rx: getMarkerBubbleRx(),
    ry: getMarkerBubbleRy(),
    fill: getMarkerBubbleFill(),
    fillOpacity: getMarkerBubbleFillOpacity(),
    stroke: getMarkerBubbleStroke(markerColor),
    strokeOpacity: getMarkerBubbleStrokeOpacity(),
    strokeWidth: getMarkerBubbleStrokeWidth(),
  };
}

function getMarkerLineProps(marker, x, pointY, padT, plotH, markerColor) {
  return {
    testId: getMarkerLineTestId(marker),
    x1: x,
    x2: x,
    y1: padT,
    y2: padT + plotH,
    stroke: markerColor,
    strokeWidth: getMarkerLineStrokeWidth(),
    strokeDasharray: getMarkerLineDasharray(),
    opacity: getMarkerLineOpacity(pointY, marker),
    targetY: getMarkerLineTargetY(pointY, marker),
  };
}

function getMarkerDotProps(marker, x, pointY, markerColor) {
  return {
    testId: getMarkerDotTestId(marker),
    cx: x,
    cy: pointY,
    r: getMarkerCircleRadius(),
    fill: markerColor,
    stroke: getMarkerCircleStroke(),
    strokeWidth: getMarkerCircleStrokeWidth(),
  };
}

function getMarkerClusterGroupTestId(marker) {
  return getMarkerClusterTestId(marker);
}

function getMarkerTextProps(marker, item, index, x, markerColor) {
  const itemProps = getMarkerLabelItemProps(marker, item, index, markerColor);
  return {
    ...itemProps,
    key: getMarkerTextKey(item),
    x: getMarkerLabelX(x),
    y: getMarkerLabelY(marker, index),
    textAnchor: getMarkerTextAnchor(),
    dominantBaseline: getMarkerTextDominantBaseline(),
    fontFamily: getMarkerTextFamily(),
    fontSize: getMarkerTextFontSizeValue(),
  };
}

function getMarkerGroupOpacity() {
  return 1;
}

function getMarkerLabelItemsForRender(marker) {
  return getMarkerLabelItems(marker);
}

function getMarkerLeadLineOpacity(pointY, marker) {
  return getMarkerLineOpacity(pointY, marker);
}

function getMarkerLeadLineTargetY(pointY, marker) {
  return getMarkerLineTargetY(pointY, marker);
}

function getMarkerClusterLayouts(story, xOf, padT, plotH, variant) {
  return getMarkerLayoutsForStory(story, xOf, padT, plotH, variant);
}

function getMarkerBubble(marker, x, markerColor) {
  return getMarkerBubbleProps(marker, x, markerColor);
}

function getMarkerLine(marker, x, pointY, padT, plotH, markerColor) {
  return getMarkerLineProps(marker, x, pointY, padT, plotH, markerColor);
}

function getMarkerDot(marker, x, pointY, markerColor) {
  return getMarkerDotProps(marker, x, pointY, markerColor);
}

function getMarkerTexts(marker, x, markerColor) {
  return getMarkerLabelItemsForRender(marker).map((item, index) => getMarkerTextProps(marker, item, index, x, markerColor));
}

function getMarkerLineConnector(pointY, marker) {
  return {
    y2: getMarkerLeadLineTargetY(pointY, marker),
    opacity: getMarkerLeadLineOpacity(pointY, marker),
  };
}

const BridgeChart = ({
  monthlyDetail, data,
  sarahCurrentNet, sarahRate, sarahMaxRate, sarahRateGrowth,
  sarahCurrentClients, sarahMaxClients, sarahClientGrowth,
  retireDebt, vanSold, lifestyleCutsApplied,
  ssType, ssdiApprovalMonth, ssdiDenied, ssdiFamilyTotal, chadConsulting,
  ssFamilyTotal, ssStartMonth,
  trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
  milestones, bcsYearsLeft, bcsFamilyMonthly,
  baseExpenses, debtService, vanMonthlySavings, vanSaleMonth,
  lifestyleCuts, cutInHalf, extraCuts,
  startingSavings, investmentReturn, msftGrowth,
  chadJob, chadJobSalary, chadJobTaxRate, chadJobStartMonth, chadJobHealthSavings,
  variant = 'overview',
}) => {
  const months = 60;
  const svgW = 800;
  const svgH = variant === 'plan' ? 240 : 290;
  const padL = 60;
  const padR = 16;
  const padT = 26;
  const padB = 30;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const pts = (monthlyDetail || []).filter((row) => row.month <= months);
  if (!pts.length) return null;

  // Memoize the entire expensive computation block — story model, SVG geometry, markers
  const computed = useMemo(() => {
    const trendNet = (row) => Math.round(row.netMonthlySmoothed ?? row.netMonthly ?? 0);
    const allNet = pts.map(trendNet);
    const maxNet = Math.max(...allNet, 1000) * 1.12;
    const minNet = Math.min(...allNet, -1000) * 1.12;
    const range = (maxNet - minNet) || 1;

    const xOf = (month) => padL + (month / months) * plotW;
    const yOf = (value) => padT + ((maxNet - value) / range) * plotH;
    const zeroY = yOf(0);
    const xTicks = [0, 12, 24, 36, 48, 60];
    const tickStep = getTickStep(minNet, maxNet);
    const yTicks = [];
    for (let value = Math.ceil(minNet / tickStep) * tickStep; value <= maxNet; value += tickStep) {
      yTicks.push(value);
    }

    const path = pts.map((point, index) => {
      const x = xOf(point.month);
      const y = yOf(trendNet(point));
      return index === 0 ? `M ${x},${y}` : `H ${x} V ${y}`;
    }).join(' ');

    const useSS = ssType === 'ss';
    const currentMsft = data?.[0]?.msftVesting || 0;
    const effectiveStartMonth = chadJobStartMonth ?? 3;
    const chadJobMonthlyNet = chadJob ? Math.round((chadJobSalary || 80000) * (1 - (chadJobTaxRate || 25) / 100) / 12) : 0;
    const chadJobHealthVal = chadJob ? (chadJobHealthSavings || 4200) : 0;
    const jobImmediate = chadJob && effectiveStartMonth === 0;
    const rawIncome = sarahCurrentNet + currentMsft + trustIncomeNow + (jobImmediate ? chadJobMonthlyNet : 0);
    const rawExpenses = baseExpenses + debtService + vanMonthlySavings + bcsFamilyMonthly - (jobImmediate ? chadJobHealthVal : 0);
    const todayGap = rawIncome - rawExpenses;
    const monthlyReturn = startingSavings > 0
      ? Math.round(startingSavings * (Math.pow(1 + investmentReturn / 100, 1 / 12) - 1))
      : 0;
    const sarahY3Rate = Math.min(sarahRate * Math.pow(1 + sarahRateGrowth / 100, 3), sarahMaxRate);
    const sarahY3Clients = Math.min(sarahCurrentClients * Math.pow(1 + sarahClientGrowth / 100, 3), sarahMaxClients);
    const sarahGrowth = Math.round(sarahY3Rate * sarahY3Clients * DAYS_PER_MONTH) - sarahCurrentNet;
    const postCliffMsft = getVestingMonthly(18, msftGrowth);
    const ssActive = !chadJob && (useSS || !ssdiDenied);
    const ssAmount = ssActive ? (useSS ? ssFamilyTotal : ssdiFamilyTotal) : 0;
    const ssMonth = useSS ? ssStartMonth : ssdiApprovalMonth;
    const totalCuts = lifestyleCuts + cutInHalf + extraCuts;

    const story = buildBridgeStoryModel({
      monthlyDetail,
      data,
      milestones,
      variant,
      todayGap,
      finalNet: trendNet(pts[pts.length - 1]),
      crossMonth: pts.find((row) => trendNet(row) >= 0) || null,
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
      ssLabel: useSS ? 'SS' : 'SSDI',
      ssMonth,
      ssAmount: ssActive ? ssAmount + (!chadJob && chadConsulting > 0 ? (useSS ? chadConsulting : Math.min(chadConsulting, SGA_LIMIT)) : 0) : 0,
      sarahGrowth,
      monthlyReturn,
      chadJobLabel: 'Chad job + health savings',
      chadJobMonth: effectiveStartMonth,
      chadJobMonthlyNet,
      chadJobHealthVal,
    });

    const finalNet = story.meta.steadyGap;
    const markerLayouts = getMarkerClusterLayouts(story, xOf, padT, plotH, variant);

    return { trendNet, maxNet, minNet, xOf, yOf, zeroY, xTicks, yTicks, path, story, finalNet, markerLayouts };
  }, [
    pts, monthlyDetail, data, variant,
    sarahCurrentNet, sarahRate, sarahMaxRate, sarahRateGrowth,
    sarahCurrentClients, sarahMaxClients, sarahClientGrowth,
    retireDebt, vanSold, lifestyleCutsApplied,
    ssType, ssdiApprovalMonth, ssdiDenied, ssdiFamilyTotal, chadConsulting,
    ssFamilyTotal, ssStartMonth,
    trustIncomeNow, trustIncomeFuture, trustIncreaseMonth,
    milestones, bcsYearsLeft, bcsFamilyMonthly,
    baseExpenses, debtService, vanMonthlySavings, vanSaleMonth,
    lifestyleCuts, cutInHalf, extraCuts,
    startingSavings, investmentReturn, msftGrowth,
    chadJob, chadJobSalary, chadJobTaxRate, chadJobStartMonth, chadJobHealthSavings,
  ]);

  const { trendNet, maxNet, minNet, xOf, yOf, zeroY, xTicks, yTicks, path, story, finalNet, markerLayouts } = computed;

  return (
    <SurfaceCard
      data-testid='bridge-card'
      tone={variant === 'overview' ? 'featured' : 'default'}
      padding='md'
      style={{ marginBottom: 24 }}
    >
      <div data-testid={variant === 'overview' ? 'bridge-variant-overview' : 'bridge-variant-plan'}>
        <div style={{ marginBottom: UI_SPACE.md }}>
          <div style={{ fontSize: variant === 'overview' ? UI_TEXT.heading : UI_TEXT.title, color: UI_COLORS.textStrong, fontWeight: 700, marginBottom: 4 }}>
            {story.title}
          </div>
          {variant === 'overview' ? (
            <div style={{ fontSize: UI_TEXT.caption, color: UI_COLORS.textMuted, lineHeight: 1.45 }}>
              {story.subtitle}
            </div>
          ) : null}
        </div>

        <div
          data-testid='bridge-kpi-strip'
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: UI_SPACE.sm,
            marginBottom: UI_SPACE.md,
          }}
        >
          {story.chips.map((chip) => {
            const chipColor = getChipToneColor(chip.tone);
            return (
              <div
                key={chip.id}
                style={{
                  background: 'rgba(15, 23, 42, 0.65)',
                  border: `1px solid ${UI_COLORS.border}`,
                  borderRadius: 10,
                  padding: `${UI_SPACE.sm}px ${UI_SPACE.md}px`,
                }}
              >
                <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textMuted, marginBottom: 4 }}>
                  {chip.label}
                </div>
                <div style={{ fontSize: UI_TEXT.label, color: chipColor, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                  {chip.value}
                </div>
              </div>
            );
          })}
        </div>

        <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          {yTicks.map((value) => (
            <g key={value}>
              <line x1={padL} x2={svgW - padR} y1={yOf(value)} y2={yOf(value)} stroke='rgba(71, 85, 105, 0.28)' strokeWidth='1' />
              <text x={padL - 8} y={yOf(value) + 4} textAnchor='end' fill={UI_COLORS.textDim} fontSize='11' fontFamily="'JetBrains Mono', monospace">
                {Math.abs(value) >= 1000 ? `$${Math.round(value / 1000)}K` : `$${Math.round(value)}`}
              </text>
            </g>
          ))}

          <line x1={padL} x2={svgW - padR} y1={zeroY} y2={zeroY} stroke={UI_COLORS.textMuted} strokeWidth='1.5' />
          <text x={padL - 8} y={zeroY + 4} textAnchor='end' fill={UI_COLORS.textMuted} fontSize='11' fontWeight='700' fontFamily="'JetBrains Mono', monospace">
            $0
          </text>

          {xTicks.map((month) => (
            <text
              key={month}
              x={xOf(month)}
              y={svgH - 6}
              textAnchor='middle'
              fill={UI_COLORS.textDim}
              fontSize='11'
              fontFamily="'JetBrains Mono', monospace"
            >
              {formatModelTimeLabel(month)}
            </text>
          ))}

          <clipPath id={`bridge-above-${variant}`}>
            <rect x={padL} y={padT} width={plotW} height={Math.max(0, zeroY - padT)} />
          </clipPath>
          <path
            d={`${path} H ${xOf(months)} V ${zeroY} H ${xOf(0)} Z`}
            fill='rgba(74, 222, 128, 0.08)'
            clipPath={`url(#bridge-above-${variant})`}
          />

          <clipPath id={`bridge-below-${variant}`}>
            <rect x={padL} y={zeroY} width={plotW} height={Math.max(0, padT + plotH - zeroY)} />
          </clipPath>
          <path
            d={`${path} H ${xOf(months)} V ${zeroY} H ${xOf(0)} Z`}
            fill='rgba(248, 113, 113, 0.08)'
            clipPath={`url(#bridge-below-${variant})`}
          />

          <path d={path} fill='none' stroke={UI_COLORS.textStrong} strokeWidth='2.25' strokeLinejoin='round' />

          <g data-testid='bridge-marker-layer'>
            {markerLayouts.map((marker) => {
              const x = xOf(marker.month);
              const point = pts.find((row) => row.month >= marker.month) || pts[0];
              const pointY = yOf(trendNet(point));
              const markerColor = MARKER_COLORS[marker.kind] || UI_COLORS.textMuted;
              const bubble = getMarkerBubble(marker, x, markerColor);
              const markerLine = getMarkerLine(marker, x, pointY, padT, plotH, markerColor);
              const markerDot = getMarkerDot(marker, x, pointY, markerColor);
              const connector = getMarkerLineConnector(pointY, marker);
              const texts = getMarkerTexts(marker, x, markerColor);
              return (
                <g key={marker.id} data-testid={getMarkerClusterGroupTestId(marker)} opacity={getMarkerGroupOpacity()}>
                  <line
                    data-testid={markerLine.testId}
                    x1={markerLine.x1}
                    x2={markerLine.x2}
                    y1={markerLine.y1}
                    y2={markerLine.y2}
                    stroke={markerLine.stroke}
                    strokeWidth={markerLine.strokeWidth}
                    strokeDasharray={markerLine.strokeDasharray}
                    opacity={markerLine.opacity}
                  />
                  <line
                    x1={x}
                    x2={x}
                    y1={pointY}
                    y2={connector.y2}
                    stroke={markerColor}
                    strokeWidth={getMarkerLineStrokeWidth()}
                    opacity={connector.opacity}
                  />
                  <circle
                    data-testid={markerDot.testId}
                    cx={markerDot.cx}
                    cy={markerDot.cy}
                    r={markerDot.r}
                    fill={markerDot.fill}
                    stroke={markerDot.stroke}
                    strokeWidth={markerDot.strokeWidth}
                  />
                  <rect
                    data-testid={bubble.testId}
                    x={bubble.x}
                    y={bubble.y}
                    width={bubble.width}
                    height={bubble.height}
                    rx={bubble.rx}
                    ry={bubble.ry}
                    fill={bubble.fill}
                    fillOpacity={bubble.fillOpacity}
                    stroke={bubble.stroke}
                    strokeOpacity={bubble.strokeOpacity}
                    strokeWidth={bubble.strokeWidth}
                  />
                  {texts.map((textProps) => (
                    <text
                      key={textProps.key}
                      data-testid={textProps.testId}
                      x={textProps.x}
                      y={textProps.y}
                      textAnchor={textProps.textAnchor}
                      dominantBaseline={textProps.dominantBaseline}
                      fill={textProps.fill}
                      fontSize={textProps.fontSize}
                      fontWeight={textProps.fontWeight}
                      opacity={textProps.opacity}
                      letterSpacing={textProps.letterSpacing}
                      fontFamily={textProps.fontFamily}
                    >
                      {textProps.text}
                    </text>
                  ))}
                </g>
              );
            })}
          </g>

          <text
            x={svgW - padR - 4}
            y={yOf(finalNet)}
            textAnchor='end'
            fill={finalNet >= 0 ? UI_COLORS.positive : UI_COLORS.destructive}
            fontSize='11'
            fontWeight='700'
            fontFamily="'JetBrains Mono', monospace"
            dominantBaseline='middle'
          >
            {fmtFull(finalNet)}/mo
          </text>
        </svg>

        <div
          data-testid='bridge-driver-groups'
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: UI_SPACE.sm,
            marginTop: UI_SPACE.md,
          }}
        >
          {story.driverGroups.map((group) => (
            <div
              key={group.id}
              style={{
                border: `1px solid ${UI_COLORS.border}`,
                borderRadius: 10,
                padding: `${UI_SPACE.sm}px ${UI_SPACE.md}px`,
                background: 'rgba(15, 23, 42, 0.48)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: UI_SPACE.sm, alignItems: 'baseline', marginBottom: 8 }}>
                <div style={{ fontSize: UI_TEXT.caption, color: UI_COLORS.textStrong, fontWeight: 700 }}>
                  {group.label}
                </div>
                <div style={{ fontSize: UI_TEXT.micro, color: group.totalImpact >= 0 ? UI_COLORS.positive : UI_COLORS.destructive, fontFamily: "'JetBrains Mono', monospace" }}>
                  {(group.totalImpact >= 0 ? '+' : '') + fmtFull(group.totalImpact)}/mo
                </div>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                {group.items.map((item) => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: UI_SPACE.sm, alignItems: 'baseline' }}>
                    <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textMuted }}>
                      {item.label}
                      {item.month > 0 ? (
                        <span style={{ color: UI_COLORS.textDim }}> · {formatModelTimeLabel(item.month)}</span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: UI_TEXT.micro, color: item.impact >= 0 ? UI_COLORS.positive : UI_COLORS.destructive, fontFamily: "'JetBrains Mono', monospace" }}>
                      {(item.impact >= 0 ? '+' : '') + fmtFull(item.impact)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SurfaceCard>
  );
};

export default memo(BridgeChart);
