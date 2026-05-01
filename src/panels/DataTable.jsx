import React from "react";
import { fmt } from '../model/formatters.js';

// Helpers — render only columns that have nonzero data anywhere in the projection.
const colorFor = {
  sarahIncome: '#60a5fa',
  msftVesting: '#f59e0b',
  trustLLC: '#c084fc',
  chadJobSalary: '#22c55e',
  chadJobBonus: '#86efac',
  chadJobStockRefresh: '#3b82f6',
  chadJobStockHire: '#60a5fa',
  chadJobSignOn: '#a78bfa',
  ssBenefit: '#fbbf24',
  consulting: '#38bdf8',
  investReturnQtr: '#22d3ee',
  baseLiving: '#f87171',
  debtService: '#ef4444',
  van: '#fb923c',
  bcs: '#a855f7',
  oneTimeExtras: '#facc15',
  lifestyleCuts: '#22c55e',     // negative — shown green (reduction)
  milestones: '#22c55e',         // negative — shown green
  healthInsurance: '#22c55e',    // negative — shown green
};

const cellStyle = (color, weight = 400) => ({
  padding: '6px',
  textAlign: 'right',
  color,
  fontWeight: weight,
  whiteSpace: 'nowrap',
});

const headerStyle = {
  padding: '8px 6px',
  textAlign: 'right',
  color: '#64748b',
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
};

function renderValue(v, color) {
  if (!v || v === 0) return <span style={{ color: '#334155' }}>—</span>;
  const display = v < 0 ? `-${fmt(Math.abs(v))}` : fmt(v);
  return <span style={{ color }}>{display}</span>;
}

const DataTable = ({ data, presentMode }) => {
  if (presentMode) return null;
  if (!data || data.length === 0) return null;

  // Decide which optional columns to show — only render columns that have nonzero data.
  const hasAny = (key, source = (d) => d[key]) => data.some(d => (source(d) || 0) !== 0);
  const hasBreakdown = (key) => data.some(d => d.expenseBreakdown && (d.expenseBreakdown[key] || 0) !== 0);

  const incomeCols = [
    { key: 'sarahIncome',          label: 'Sarah',     show: hasAny('sarahIncome') },
    { key: 'msftVesting',          label: 'MSFT',      show: hasAny('msftVesting') },
    { key: 'trustLLC',             label: 'Trust/LLC', show: hasAny('trustLLC') },
    { key: 'chadJobSalary',        label: 'Job: Salary',  show: hasAny('chadJobSalary') },
    { key: 'chadJobBonus',         label: 'Job: Bonus',   show: hasAny('chadJobBonus') },
    { key: 'chadJobStockRefresh',  label: 'Job: Refresh', show: hasAny('chadJobStockRefresh') },
    { key: 'chadJobStockHire',     label: 'Job: Hire',    show: hasAny('chadJobStockHire') },
    { key: 'chadJobSignOn',        label: 'Job: Sign-on', show: hasAny('chadJobSignOn') },
    { key: 'ssBenefit',            label: data.find(d => d.ssBenefitType === 'ssdi') ? 'SSDI' : 'SS', show: hasAny('ssBenefit') },
    { key: 'consulting',           label: 'Consult',   show: hasAny('consulting') },
    { key: 'investReturnQtr',      label: 'Invest/Q',  show: hasAny('investReturnQtr') },
  ].filter(c => c.show);

  const expenseCols = [
    { key: 'baseLiving',      label: 'Base Living' },
    { key: 'debtService',     label: 'Debt' },
    { key: 'van',             label: 'Van' },
    { key: 'bcs',             label: 'BCS' },
    { key: 'oneTimeExtras',   label: 'One-Time' },
    { key: 'lifestyleCuts',   label: 'Cuts (−)' },
    { key: 'milestones',      label: 'Milestones (−)' },
    { key: 'healthInsurance', label: 'Health (−)' },
  ].filter(c => hasBreakdown(c.key));

  const tableShell = {
    background: '#1e293b', borderRadius: 12, padding: 20,
    border: '1px solid #334155', overflowX: 'auto', marginBottom: 16,
  };

  return (
    <div>
      {/* Income detail */}
      <div style={tableShell}>
        <h3 style={{ fontSize: 14, color: '#94a3b8', margin: '0 0 4px', fontWeight: 600 }}>Income Detail</h3>
        <p style={{ fontSize: 10, color: '#475569', margin: '0 0 12px' }}>
          Quarterly snapshots — values are the monthly average across each quarter (after-tax net).
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #334155' }}>
              <th style={{ ...headerStyle, textAlign: 'left' }}>Period</th>
              {incomeCols.map(c => <th key={c.key} style={headerStyle}>{c.label}</th>)}
              <th style={{ ...headerStyle, color: '#e2e8f0' }}>Total In</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={i} style={{
                borderBottom: '1px solid #1e293b',
                background: i % 2 === 0 ? 'transparent' : 'rgba(15, 23, 42, 0.13)',
              }}>
                <td style={{ padding: '6px', color: '#94a3b8', fontWeight: 600 }}>{d.label}</td>
                {incomeCols.map(c => (
                  <td key={c.key} style={cellStyle(colorFor[c.key] || '#94a3b8')}>
                    {renderValue(d[c.key], colorFor[c.key] || '#94a3b8')}
                  </td>
                ))}
                <td style={cellStyle('#e2e8f0', 600)}>{fmt(d.totalIncome)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Expense detail */}
      <div style={tableShell}>
        <h3 style={{ fontSize: 14, color: '#94a3b8', margin: '0 0 4px', fontWeight: 600 }}>Expense Detail</h3>
        <p style={{ fontSize: 10, color: '#475569', margin: '0 0 12px' }}>
          Quarterly snapshots — monthly average. Negative columns (in green) reduce expenses.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #334155' }}>
              <th style={{ ...headerStyle, textAlign: 'left' }}>Period</th>
              {expenseCols.map(c => <th key={c.key} style={headerStyle}>{c.label}</th>)}
              <th style={{ ...headerStyle, color: '#f87171' }}>Expenses</th>
              <th style={{ ...headerStyle, color: '#e2e8f0' }}>Net/Mo</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={i} style={{
                borderBottom: '1px solid #1e293b',
                background: i % 2 === 0 ? 'transparent' : 'rgba(15, 23, 42, 0.13)',
              }}>
                <td style={{ padding: '6px', color: '#94a3b8', fontWeight: 600 }}>{d.label}</td>
                {expenseCols.map(c => {
                  const v = d.expenseBreakdown ? (d.expenseBreakdown[c.key] || 0) : 0;
                  return (
                    <td key={c.key} style={cellStyle(colorFor[c.key] || '#94a3b8')}>
                      {renderValue(v, colorFor[c.key] || '#94a3b8')}
                    </td>
                  );
                })}
                <td style={cellStyle('#f87171')}>{fmt(d.expenses)}</td>
                <td style={{ ...cellStyle(d.netMonthly >= 0 ? '#4ade80' : '#f87171', 700) }}>
                  {d.netMonthly >= 0 ? '+' : ''}{fmt(d.netMonthly)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DataTable;
