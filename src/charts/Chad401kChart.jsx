import React, { useState } from 'react';
import { fmt, fmtFull } from '../model/formatters.js';
import { COLORS } from './chartUtils.js';

/**
 * Chad401kChart — detailed view of 401(k) balance growth over the projection horizon.
 *
 * Decomposes the running balance into 4 stacked layers from bottom up:
 *   1. Starting balance (gray)
 *   2. Cumulative employee contributions (pre-tax deferral + Roth catch-up) — blue
 *   3. Cumulative employer match — teal
 *   4. Investment growth (residual = balance − starting − contribs − match) — amber
 *
 * KPI strip: Starting / Total contributions / Total match / Investment growth / Ending.
 * Vertical dashed line at retirement month where contributions end.
 *
 * Reads per-month fields from monthlyDetail:
 *   - balance401k, chadJob401kContribGross, chadJob401kMatchGross, withdrawal401k
 */
export default function Chad401kChart({
  monthlyDetail = [],
  starting401k = 0,
  return401k = 0,
  chadJob = false,
  chadRetirementMonth = 72,
  chadJob401kEnabled = false,
}) {
  const [tooltip, setTooltip] = useState(null);
  const data = Array.isArray(monthlyDetail) ? monthlyDetail : [];
  const n = data.length;
  if (n === 0) {
    return (
      <div style={{ padding: 20, color: COLORS.textDim, fontSize: 12, textAlign: 'center' }}>
        No 401(k) data available.
      </div>
    );
  }

  // Compute per-month decomposition
  let cumContrib = 0;
  let cumMatch = 0;
  let cumWithdrawal = 0;
  const series = data.map(d => {
    cumContrib += d.chadJob401kContribGross || 0;
    cumMatch += d.chadJob401kMatchGross || 0;
    cumWithdrawal += d.withdrawal401k || 0;
    const balance = d.balance401k || 0;
    // Growth = balance − starting − contribs − match + withdrawals (gross-up withdrawals so the
    // "growth" area reflects compounding alone, not net of drawdowns)
    const growth = Math.max(0, balance - starting401k - cumContrib - cumMatch + cumWithdrawal);
    return {
      month: d.month,
      starting: starting401k,
      contributions: cumContrib,
      match: cumMatch,
      withdrawal: cumWithdrawal,
      growth,
      balance,
    };
  });

  const final = series[series.length - 1];
  const totalContrib = final.contributions;
  const totalMatch = final.match;
  const totalGrowth = final.balance - starting401k - totalContrib - totalMatch + final.withdrawal;
  const totalWithdrawn = final.withdrawal;

  // Chart geometry
  const chartH = 280;
  const chartW = 600; // viewBox width
  const padL = 50;
  const padR = 20;
  const padT = 10;
  const padB = 28;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;
  const maxVal = Math.max(...series.map(s => s.starting + s.contributions + s.match + s.growth), 1);
  const x = (i) => padL + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2);
  const y = (v) => padT + innerH * (1 - v / maxVal);

  // Build stacked polygons (bottom-up)
  const buildLayer = (lower, upper) => {
    const top = series.map((s, i) => `${x(i)},${y(upper(s))}`).join(' ');
    const bottom = series.map((s, i) => `${x(i)},${y(lower(s))}`).reverse().join(' ');
    return `${top} ${bottom}`;
  };
  const startingPoly = buildLayer(_ => 0, s => s.starting);
  const contribPoly = buildLayer(s => s.starting, s => s.starting + s.contributions);
  const matchPoly = buildLayer(s => s.starting + s.contributions, s => s.starting + s.contributions + s.match);
  const growthPoly = buildLayer(s => s.starting + s.contributions + s.match, s => s.starting + s.contributions + s.match + s.growth);

  // Balance line (= top of stack)
  const balancePath = series
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${x(i)},${y(s.starting + s.contributions + s.match + s.growth)}`)
    .join(' ');

  // Y-axis ticks
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => {
    const v = (maxVal * (tickCount - i)) / tickCount;
    return { v, y: y(v) };
  });

  const formatYrLabel = (m) => {
    if (m === 0) return 'Now';
    const yr = Math.floor(m / 12);
    return `Y${yr}`;
  };
  // X-axis ticks every 12 months
  const xTicks = [];
  for (let i = 0; i < n; i += 12) xTicks.push({ i, label: formatYrLabel(data[i].month) });

  const retIdx = data.findIndex(d => d.month === chadRetirementMonth);

  const layerColors = {
    starting: '#475569',
    contrib: '#3b82f6',
    match: '#14b8a6',
    growth: '#f59e0b',
  };

  const kpis = [
    { k: 'Starting', v: fmtFull(starting401k), color: layerColors.starting },
    { k: 'Total contributions', v: fmtFull(totalContrib), color: layerColors.contrib },
    { k: 'Employer match', v: fmtFull(totalMatch), color: layerColors.match },
    { k: 'Investment growth', v: (totalGrowth >= 0 ? '+' : '') + fmtFull(totalGrowth), color: totalGrowth >= 0 ? layerColors.growth : COLORS.red },
    { k: 'Ending balance', v: fmtFull(final.balance), color: COLORS.greenDark },
  ];
  if (totalWithdrawn > 0) {
    kpis.push({ k: 'Drawn for cashflow', v: '−' + fmtFull(totalWithdrawn), color: COLORS.red });
  }

  return (
    <div data-testid="chad-401k-chart" style={{
      background: COLORS.bgCard, borderRadius: 12, padding: '16px 16px 12px',
      border: `1px solid ${COLORS.border}`, marginBottom: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <h3 style={{ fontSize: 14, color: COLORS.blue, margin: 0, fontWeight: 600 }}>
          401(k) Balance Decomposition
        </h3>
        <span style={{ fontSize: 10, color: COLORS.textDim }}>
          {chadJob401kEnabled ? `Active contributions @ ${return401k}%/yr return` : `Starting balance compounds @ ${return401k}%/yr (no active contributions)`}
        </span>
      </div>
      <p style={{ fontSize: 10, color: COLORS.textDim, margin: '0 0 10px' }}>
        Starting balance + cumulative employee contributions + employer match + investment growth = total 401(k) balance.
      </p>

      {/* KPI strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${kpis.length}, 1fr)`,
        gap: 6,
        marginBottom: 10,
      }}>
        {kpis.map((s, i) => (
          <div key={i} style={{
            background: COLORS.bgDeep, borderRadius: 6, border: `1px solid ${COLORS.border}`,
            padding: '6px 8px', minWidth: 0,
          }}>
            <div style={{ fontSize: 9, color: COLORS.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{s.k}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ position: 'relative', width: '100%' }}>
        <svg viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none" style={{ width: '100%', height: chartH, display: 'block' }}>
          {/* Y-axis grid + labels */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={padL} x2={chartW - padR} y1={t.y} y2={t.y} stroke={COLORS.border} strokeOpacity={0.4} strokeWidth={0.5} />
              <text x={padL - 6} y={t.y + 3} fontSize={9} fill={COLORS.textDim} fontFamily="'JetBrains Mono', monospace" textAnchor="end">
                {fmt(t.v)}
              </text>
            </g>
          ))}
          {/* Stacked layers */}
          <polygon points={startingPoly} fill={layerColors.starting} fillOpacity={0.65} />
          <polygon points={contribPoly} fill={layerColors.contrib} fillOpacity={0.65} />
          <polygon points={matchPoly} fill={layerColors.match} fillOpacity={0.65} />
          <polygon points={growthPoly} fill={layerColors.growth} fillOpacity={0.7} />
          {/* Balance line */}
          <path d={balancePath} stroke={COLORS.greenDark} strokeWidth={1.5} fill="none" />
          {/* Retirement marker */}
          {retIdx > 0 && (
            <g>
              <line x1={x(retIdx)} x2={x(retIdx)} y1={padT} y2={padT + innerH} stroke={COLORS.amber} strokeDasharray="3,3" strokeWidth={1} />
              <text x={x(retIdx) + 4} y={padT + 12} fontSize={10} fill={COLORS.amber} fontFamily="'Inter', sans-serif">
                Retire ↓
              </text>
            </g>
          )}
          {/* X-axis labels */}
          {xTicks.map((t, i) => (
            <text key={i} x={x(t.i)} y={chartH - 8} fontSize={9} fill={COLORS.textDim} fontFamily="'JetBrains Mono', monospace" textAnchor="middle">
              {t.label}
            </text>
          ))}
          {/* Hover surface — captures mouse, finds nearest column */}
          <rect
            x={padL} y={padT} width={innerW} height={innerH}
            fill="transparent"
            onMouseMove={(e) => {
              const svg = e.currentTarget.ownerSVGElement;
              const pt = svg.createSVGPoint();
              pt.x = e.clientX; pt.y = e.clientY;
              const ctm = svg.getScreenCTM();
              if (!ctm) return;
              const local = pt.matrixTransform(ctm.inverse());
              const ratio = (local.x - padL) / innerW;
              const idx = Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1))));
              setTooltip({ idx, mx: e.clientX, my: e.clientY });
            }}
            onMouseLeave={() => setTooltip(null)}
          />
          {/* Tooltip vertical line */}
          {tooltip && (
            <line x1={x(tooltip.idx)} x2={x(tooltip.idx)} y1={padT} y2={padT + innerH} stroke={COLORS.text} strokeOpacity={0.4} strokeWidth={1} />
          )}
        </svg>

        {/* Tooltip overlay */}
        {tooltip && (() => {
          const s = series[tooltip.idx];
          if (!s) return null;
          return (
            <div style={{
              position: 'absolute',
              left: `${(x(tooltip.idx) / chartW) * 100}%`,
              top: 0,
              transform: 'translateX(8px)',
              background: COLORS.bgDeep,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
              pointerEvents: 'none',
              minWidth: 180,
              zIndex: 10,
            }}>
              <div style={{ fontSize: 10, color: COLORS.textDim, marginBottom: 3 }}>Month {s.month} ({formatYrLabel(s.month)})</div>
              <Row label="Starting" value={fmtFull(s.starting)} color={layerColors.starting} />
              <Row label="Contributions" value={fmtFull(s.contributions)} color={layerColors.contrib} />
              <Row label="Match" value={fmtFull(s.match)} color={layerColors.match} />
              <Row label="Growth" value={fmtFull(s.growth)} color={layerColors.growth} />
              {s.withdrawal > 0 && (
                <Row label="Withdrawn" value={'−' + fmtFull(s.withdrawal)} color={COLORS.red} />
              )}
              <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 3, paddingTop: 3 }}>
                <Row label="Balance" value={fmtFull(s.balance)} color={COLORS.greenDark} bold />
              </div>
            </div>
          );
        })()}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, fontSize: 10, color: COLORS.textDim, marginTop: 6, flexWrap: 'wrap' }}>
        <Swatch color={layerColors.starting} label="Starting" />
        <Swatch color={layerColors.contrib} label="Contributions" />
        <Swatch color={layerColors.match} label="Match" />
        <Swatch color={layerColors.growth} label="Investment growth" />
      </div>
    </div>
  );
}

function Row({ label, value, color, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontWeight: bold ? 700 : 400 }}>
      <span style={{ color }}>{label}</span>
      <span style={{ color }}>{value}</span>
    </div>
  );
}

function Swatch({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 10, height: 10, background: color, opacity: 0.7, borderRadius: 2, display: 'inline-block' }} />
      {label}
    </span>
  );
}
