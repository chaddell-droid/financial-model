import React, { memo, useMemo } from 'react';
import SavingsDrawdownChart from '../charts/SavingsDrawdownChart.jsx';
import NetWorthChart from '../charts/NetWorthChart.jsx';
import Slider from '../components/Slider.jsx';
import { fmt, fmtFull } from '../model/formatters.js';

/**
 * ChartStackPanel — Plan tab right pane.
 *
 * Renders two charts (Savings + NetWorth) side-by-side in IDENTICAL shell cells so
 * their visual heights match exactly. The underlying chart components render in
 * Plan-compact mode (instanceId='plan') where they output only their SVG + no
 * chrome — this wrapper supplies all title / mini-stats / controls uniformly.
 */
function ChartStackPanel({ savingsChartProps = {}, netWorthChartProps = {} }) {
  const savingsStats = useMemo(() => computeSavingsStats(savingsChartProps), [savingsChartProps]);
  const netWorthStats = useMemo(() => computeNetWorthStats(netWorthChartProps), [netWorthChartProps]);
  const setSavings = (field) => savingsChartProps.onFieldChange?.(field);
  const setNw = (field) => netWorthChartProps.onFieldChange?.(field);

  return (
    <div
      className="plan-panel plan-chart-row"
      data-testid="plan-chart-stack"
      style={{ alignSelf: 'start', display: 'flex', flexDirection: 'row', alignItems: 'stretch', padding: 0 }}
    >
      <Cell
        title="Savings Balance Over Time"
        accent="var(--plan-accent)"
        stats={savingsStats}
        chart={<SavingsDrawdownChart {...savingsChartProps} instanceId="plan" />}
        controls={
          <>
            <ControlRow>
              <Slider
                label="Starting savings"
                value={savingsChartProps.startingSavings || 0}
                onChange={setSavings('startingSavings')}
                commitStrategy="release"
                min={50000}
                max={500000}
                step={10000}
                color="var(--plan-info)"
              />
              <Slider
                label="Investment return (annual)"
                value={savingsChartProps.investmentReturn || 0}
                onChange={setSavings('investmentReturn')}
                commitStrategy="release"
                min={0}
                max={50}
                format={(v) => v + '%'}
                color="var(--plan-info)"
              />
            </ControlRow>
            <ControlRow>
              <Slider
                label={savingsChartProps.totalMonthlySpend != null ? 'Base living (set via total spend)' : 'Base living expenses/mo'}
                value={savingsChartProps.baseExpenses || 0}
                onChange={savingsChartProps.totalMonthlySpend != null ? () => {} : setSavings('baseExpenses')}
                commitStrategy="release"
                min={25000}
                max={55000}
                step={500}
                color={savingsChartProps.totalMonthlySpend != null ? 'var(--plan-line-2)' : 'var(--plan-danger)'}
                disabled={savingsChartProps.totalMonthlySpend != null}
                disabledReason="Derived from Base Monthly Spend. Clear that field in Cashflow & Spend to edit directly."
              />
              <Slider
                label="Debt service/mo"
                value={savingsChartProps.debtService || 0}
                onChange={setSavings('debtService')}
                commitStrategy="release"
                min={0}
                max={20000}
                step={100}
                color={savingsChartProps.retireDebt ? 'var(--plan-line-2)' : 'var(--plan-danger)'}
              />
            </ControlRow>
          </>
        }
      />
      <div style={{ width: 1, background: 'var(--plan-line)', alignSelf: 'stretch' }} />
      <Cell
        title="Net Worth Projection"
        accent="var(--plan-info)"
        stats={netWorthStats}
        chart={<NetWorthChart {...netWorthChartProps} instanceId="plan" />}
        controls={
          <>
            <ControlRow>
              <Slider
                label="Starting 401k balance"
                value={netWorthChartProps.starting401k || 0}
                onChange={setNw('starting401k')}
                commitStrategy="release"
                min={0}
                max={1_000_000}
                step={10000}
                color="var(--plan-info)"
              />
              <Slider
                label="Annual return (401k)"
                value={netWorthChartProps.return401k || 0}
                onChange={setNw('return401k')}
                commitStrategy="release"
                min={0}
                max={40}
                format={(v) => v + '%'}
                color="var(--plan-info)"
              />
            </ControlRow>
            <ControlRow>
              <Slider
                label="Home equity"
                value={netWorthChartProps.homeEquity || 0}
                onChange={setNw('homeEquity')}
                commitStrategy="release"
                min={200000}
                max={2_000_000}
                step={25000}
                color="var(--plan-warn)"
              />
              <Slider
                label="Annual appreciation"
                value={netWorthChartProps.homeAppreciation || 0}
                onChange={setNw('homeAppreciation')}
                commitStrategy="release"
                min={0}
                max={10}
                step={0.5}
                format={(v) => v + '%'}
                color="var(--plan-warn)"
              />
            </ControlRow>
          </>
        }
      />
    </div>
  );
}

// Identical shell used for both charts. Every element has the same height/layout.
function Cell({ title, accent, stats, chart, controls }) {
  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      <div style={{
        height: 22,
        display: 'flex',
        alignItems: 'center',
      }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: accent }}>{title}</h3>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 2,
        height: 54,
      }}>
        {stats.map((s, i) => (
          <div key={i} style={{
            background: 'var(--plan-panel-2)',
            border: '1px solid var(--plan-line)',
            borderRadius: 6,
            padding: '6px 10px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minWidth: 0,
          }}>
            <div style={{
              fontSize: 9,
              color: 'var(--plan-ink-faint)',
              textTransform: 'uppercase',
              letterSpacing: '.08em',
              marginBottom: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>{s.k}</div>
            <div className="plan-mono" style={{
              fontSize: 13,
              fontWeight: 700,
              color: s.color || 'var(--plan-ink)',
            }}>{s.v}</div>
          </div>
        ))}
      </div>
      <div style={{ height: 380 }}>
        {chart}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {controls}
      </div>
    </div>
  );
}

function ControlRow({ children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {children}
    </div>
  );
}

function computeSavingsStats(p) {
  const data = Array.isArray(p.savingsData) ? p.savingsData : [];
  const start = data[0]?.balance ?? (p.startingSavings || 0);
  const end = data[data.length - 1]?.balance ?? start;
  const delta = end - start;
  const annualReturn = Math.round((p.startingSavings || 0) * ((p.investmentReturn || 0) / 100));
  return [
    { k: 'Starting', v: fmt(start) },
    { k: 'Ending', v: fmt(end), color: end >= start ? 'var(--plan-accent)' : 'var(--plan-danger)' },
    { k: 'Net change', v: (delta >= 0 ? '+' : '') + fmt(delta), color: delta >= 0 ? 'var(--plan-accent)' : 'var(--plan-danger)' },
    { k: 'Annual return', v: fmt(annualReturn), color: 'var(--plan-info)' },
  ];
}

function computeNetWorthStats(p) {
  const savings = Array.isArray(p.savingsData) ? p.savingsData : [];
  const wealth = Array.isArray(p.wealthData) ? p.wealthData : [];
  const start401k = p.starting401k || 0;
  const startHome = p.homeEquity || 0;
  const startLiquid = savings[0]?.balance ?? 0;
  const startNW = startLiquid + start401k + startHome;
  const endLiquid = savings[savings.length - 1]?.balance ?? startLiquid;
  const end401k = wealth[wealth.length - 1]?.balance401k ?? start401k;
  const endHome = wealth[wealth.length - 1]?.homeEquity ?? startHome;
  const endNW = endLiquid + end401k + endHome;
  const delta = endNW - startNW;
  return [
    { k: 'Starting NW', v: fmtFull(startNW) },
    { k: 'Ending NW', v: fmtFull(endNW), color: delta >= 0 ? 'var(--plan-accent)' : 'var(--plan-danger)' },
    { k: '401k growth', v: (end401k - start401k >= 0 ? '+' : '') + fmtFull(end401k - start401k), color: 'var(--plan-info)' },
    { k: 'Home apprec.', v: (endHome - startHome >= 0 ? '+' : '') + fmtFull(endHome - startHome), color: 'var(--plan-warn)' },
  ];
}

export default memo(ChartStackPanel);
