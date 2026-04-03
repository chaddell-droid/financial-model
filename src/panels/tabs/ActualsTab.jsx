import React, { memo, useState, useMemo, useRef } from 'react';
import { fmtFull } from '../../model/formatters.js';
import { parseTransactionCSV, mergeTransactions, groupByMonth, getCurrentMonth } from '../../model/csvParser.js';
import { UI_COLORS, UI_SPACE, UI_TEXT, UI_RADII } from '../../ui/tokens.js';
import SurfaceCard from '../../components/ui/SurfaceCard.jsx';

function ActualsTab({ monthlyActuals, currentTotalMonthlySpend, currentOneTimeExtras, dispatch }) {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [uploadFeedback, setUploadFeedback] = useState(null);
  const [showPushConfirm, setShowPushConfirm] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const fileInputRef = useRef(null);

  const currentMonth = getCurrentMonth();
  const months = useMemo(() => {
    const keys = Object.keys(monthlyActuals).sort();
    if (!keys.includes(currentMonth)) keys.push(currentMonth);
    return keys.sort();
  }, [monthlyActuals, currentMonth]);

  const transactions = useMemo(() => {
    return monthlyActuals[selectedMonth]?.transactions || [];
  }, [monthlyActuals, selectedMonth]);

  const filteredTransactions = useMemo(() => {
    let txns = transactions;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      txns = txns.filter(t => t.merchant.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...txns].sort((a, b) => {
      if (sortBy === 'amount') return (a.amount - b.amount) * dir;
      if (sortBy === 'merchant') return a.merchant.localeCompare(b.merchant) * dir;
      if (sortBy === 'category') return a.category.localeCompare(b.category) * dir;
      return a.date.localeCompare(b.date) * dir;
    });
  }, [transactions, searchQuery, sortBy, sortDir]);

  // Running totals always from full month (not filtered)
  const totals = useMemo(() => {
    const core = transactions.filter(t => t.type === 'core');
    const onetime = transactions.filter(t => t.type === 'onetime');
    const income = transactions.filter(t => t.type === 'income');
    return {
      coreTotal: Math.round(Math.abs(core.reduce((s, t) => s + t.amount, 0))),
      coreCount: core.length,
      onetimeTotal: Math.round(Math.abs(onetime.reduce((s, t) => s + t.amount, 0))),
      onetimeCount: onetime.length,
      incomeTotal: Math.round(income.reduce((s, t) => s + t.amount, 0)),
      incomeCount: income.length,
    };
  }, [transactions]);

  const categoryBreakdown = useMemo(() => {
    const cats = {};
    for (const t of transactions) {
      if (!cats[t.category]) cats[t.category] = { core: 0, onetime: 0, income: 0, count: 0 };
      cats[t.category][t.type] += Math.abs(t.amount);
      cats[t.category].count++;
    }
    return Object.entries(cats).sort((a, b) => (b[1].core + b[1].onetime + b[1].income) - (a[1].core + a[1].onetime + a[1].income));
  }, [transactions]);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseTransactionCSV(e.target.result);
      if (parsed.length === 0) {
        setUploadFeedback('No valid transactions found in file.');
        setTimeout(() => setUploadFeedback(null), 5000);
        return;
      }
      const grouped = groupByMonth(parsed);
      let totalNew = 0, totalSkipped = 0;
      for (const [month, txns] of Object.entries(grouped)) {
        const existing = monthlyActuals[month]?.transactions || [];
        const merged = mergeTransactions(existing, txns);
        totalNew += merged.length - existing.length;
        totalSkipped += txns.length - (merged.length - existing.length);
        dispatch({ type: 'MERGE_ACTUALS', month, transactions: merged });
      }
      const firstMonth = Object.keys(grouped).sort()[0];
      if (firstMonth) setSelectedMonth(firstMonth);
      setUploadFeedback(`Added ${totalNew} new transactions (${totalSkipped} duplicates skipped)`);
      setTimeout(() => setUploadFeedback(null), 5000);
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handlePushConfirm = () => {
    dispatch({
      type: 'SET_FIELDS',
      fields: {
        totalMonthlySpend: totals.coreTotal,
        oneTimeExtras: totals.onetimeTotal,
        oneTimeMonths: 1,
      },
    });
    setShowPushConfirm(false);
  };

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const handleTypeToggle = (txn) => {
    if (txn.amount > 0) return; // income is locked
    dispatch({
      type: 'UPDATE_TRANSACTION_TYPE',
      month: selectedMonth,
      transactionId: txn.id,
      newType: txn.type === 'core' ? 'onetime' : 'core',
    });
  };

  const sortArrow = (col) => sortBy === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  const typePillStyle = (type) => ({
    padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, cursor: type === 'income' ? 'default' : 'pointer', border: 'none', userSelect: 'none',
    background: type === 'core' ? `${UI_COLORS.primary}22` : type === 'onetime' ? `${UI_COLORS.caution}22` : `${UI_COLORS.positive}22`,
    color: type === 'core' ? UI_COLORS.primary : type === 'onetime' ? UI_COLORS.caution : UI_COLORS.positive,
  });

  return (
    <div data-testid="actuals-tab">
      {/* Header: Month selector + Upload + Push */}
      <SurfaceCard padding="sm" style={{ marginBottom: UI_SPACE.md }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {months.map(m => (
              <button key={m} onClick={() => setSelectedMonth(m)}
                data-testid={`actuals-month-${m}`}
                style={{
                  padding: '4px 10px', borderRadius: UI_RADII.sm, border: `1px solid ${m === selectedMonth ? UI_COLORS.caution : UI_COLORS.border}`,
                  background: m === selectedMonth ? `${UI_COLORS.caution}22` : 'transparent',
                  color: m === selectedMonth ? UI_COLORS.caution : UI_COLORS.textMuted,
                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                }}>
                {m}{m === currentMonth ? ' (current)' : ''}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} data-testid="actuals-file-input" />
            <button onClick={() => fileInputRef.current?.click()}
              data-testid="actuals-upload-btn"
              style={{
                padding: '6px 14px', borderRadius: UI_RADII.sm, border: `1px solid ${UI_COLORS.border}`,
                background: UI_COLORS.surface, color: UI_COLORS.textSecondary,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>
              Upload CSV
            </button>
            {transactions.length > 0 && (
              <button onClick={() => setShowPushConfirm(true)}
                data-testid="actuals-push-btn"
                style={{
                  padding: '6px 14px', borderRadius: UI_RADII.sm, border: `1px solid ${UI_COLORS.positive}`,
                  background: `${UI_COLORS.positive}22`, color: UI_COLORS.positive,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>
                Push to Model
              </button>
            )}
          </div>
        </div>
        {uploadFeedback && (
          <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: UI_RADII.sm, background: `${UI_COLORS.primary}15`, color: UI_COLORS.primary, fontSize: 12 }}>
            {uploadFeedback}
          </div>
        )}
      </SurfaceCard>

      {/* Push confirmation */}
      {showPushConfirm && (
        <SurfaceCard padding="sm" tone="featured" style={{ marginBottom: UI_SPACE.md, borderColor: UI_COLORS.positive }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.textSecondary, marginBottom: 8 }}>Push to Model?</div>
          <div style={{ fontSize: 12, color: UI_COLORS.textMuted, lineHeight: 1.6, fontFamily: "'JetBrains Mono', monospace" }}>
            Core (recurring): {fmtFull(totals.coreTotal)} → Base Monthly Spend (currently {fmtFull(currentTotalMonthlySpend ?? 0)})<br/>
            One-Time: {fmtFull(totals.onetimeTotal)} → One-Time Extras (currently {fmtFull(currentOneTimeExtras ?? 0)})
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => setShowPushConfirm(false)} style={{ padding: '5px 12px', borderRadius: UI_RADII.sm, border: `1px solid ${UI_COLORS.border}`, background: 'transparent', color: UI_COLORS.textMuted, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
            <button onClick={handlePushConfirm} data-testid="actuals-push-confirm" style={{ padding: '5px 12px', borderRadius: UI_RADII.sm, border: `1px solid ${UI_COLORS.positive}`, background: UI_COLORS.positive, color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Push</button>
          </div>
        </SurfaceCard>
      )}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: UI_SPACE.sm, marginBottom: UI_SPACE.md }}>
        <SurfaceCard padding="sm">
          <div style={{ fontSize: 10, color: UI_COLORS.primary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Core (Recurring)</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: UI_COLORS.primary, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(totals.coreTotal)}</div>
          <div style={{ fontSize: 10, color: UI_COLORS.textDim }}>{totals.coreCount} transactions</div>
        </SurfaceCard>
        <SurfaceCard padding="sm">
          <div style={{ fontSize: 10, color: UI_COLORS.caution, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>One-Time</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: UI_COLORS.caution, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(totals.onetimeTotal)}</div>
          <div style={{ fontSize: 10, color: UI_COLORS.textDim }}>{totals.onetimeCount} transactions</div>
        </SurfaceCard>
        <SurfaceCard padding="sm">
          <div style={{ fontSize: 10, color: UI_COLORS.positive, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Income</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: UI_COLORS.positive, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(totals.incomeTotal)}</div>
          <div style={{ fontSize: 10, color: UI_COLORS.textDim }}>{totals.incomeCount} transactions</div>
        </SurfaceCard>
      </div>

      {/* Search */}
      <div style={{ marginBottom: UI_SPACE.sm }}>
        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search merchants..."
          data-testid="actuals-search"
          style={{
            width: '100%', padding: '8px 12px', borderRadius: UI_RADII.sm,
            border: `1px solid ${UI_COLORS.border}`, background: UI_COLORS.surface,
            color: UI_COLORS.textSecondary, fontSize: 12, outline: 'none',
            fontFamily: "'Inter', sans-serif",
          }} />
      </div>

      {/* Transaction table */}
      {transactions.length === 0 ? (
        <SurfaceCard padding="md" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: UI_COLORS.textMuted, padding: 24 }}>
            No transactions for this month. Upload a CSV to get started.
          </div>
        </SurfaceCard>
      ) : (
        <div style={{ overflowX: 'auto', marginBottom: UI_SPACE.md }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${UI_COLORS.border}` }}>
                {[['date', 'Date'], ['merchant', 'Merchant'], ['category', 'Category'], ['account', 'Account'], ['amount', 'Amount'], ['type', 'Type']].map(([col, label]) => (
                  <th key={col} onClick={() => col !== 'type' && handleSort(col)}
                    style={{
                      padding: '8px 6px', textAlign: col === 'amount' ? 'right' : 'left',
                      color: UI_COLORS.textMuted, fontWeight: 600, cursor: col !== 'type' ? 'pointer' : 'default',
                      whiteSpace: 'nowrap', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                    {label}{col !== 'type' && sortArrow(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((t) => (
                <tr key={t.id} style={{
                  borderBottom: `1px solid ${UI_COLORS.border}22`,
                  borderLeft: `3px solid ${t.type === 'core' ? UI_COLORS.primary : t.type === 'onetime' ? UI_COLORS.caution : UI_COLORS.positive}`,
                }}>
                  <td style={{ padding: '6px', color: UI_COLORS.textDim, whiteSpace: 'nowrap' }}>{t.date}</td>
                  <td style={{ padding: '6px', color: UI_COLORS.textSecondary }}>{t.merchant}</td>
                  <td style={{ padding: '6px', color: UI_COLORS.textDim }}>{t.category}</td>
                  <td style={{ padding: '6px', color: UI_COLORS.textDim, fontSize: 10 }}>{t.account}</td>
                  <td style={{ padding: '6px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: t.amount > 0 ? UI_COLORS.positive : UI_COLORS.destructive }}>
                    {t.amount > 0 ? '+' : ''}{t.amount.toFixed(2)}
                  </td>
                  <td style={{ padding: '6px' }}>
                    <button onClick={() => handleTypeToggle(t)} style={typePillStyle(t.type)} data-testid={`actuals-type-${t.id}`}>
                      {t.type === 'core' ? 'Core' : t.type === 'onetime' ? 'One-Time' : 'Income'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Category breakdown */}
      {transactions.length > 0 && (
        <SurfaceCard padding="sm">
          <div onClick={() => setShowCategories(!showCategories)}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}>
            <span style={{ fontSize: 11, color: UI_COLORS.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>By Category</span>
            <span style={{ fontSize: 10, color: UI_COLORS.textDim }}>{showCategories ? '▼' : '▶'}</span>
          </div>
          {showCategories && (
            <div style={{ marginTop: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${UI_COLORS.border}` }}>
                    <th style={{ padding: '6px', textAlign: 'left', color: UI_COLORS.textMuted, fontSize: 10 }}>Category</th>
                    <th style={{ padding: '6px', textAlign: 'right', color: UI_COLORS.primary, fontSize: 10 }}>Core</th>
                    <th style={{ padding: '6px', textAlign: 'right', color: UI_COLORS.caution, fontSize: 10 }}>One-Time</th>
                    <th style={{ padding: '6px', textAlign: 'right', color: UI_COLORS.positive, fontSize: 10 }}>Income</th>
                    <th style={{ padding: '6px', textAlign: 'right', color: UI_COLORS.textDim, fontSize: 10 }}>#</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryBreakdown.map(([cat, vals]) => (
                    <tr key={cat} style={{ borderBottom: `1px solid ${UI_COLORS.border}22` }}>
                      <td style={{ padding: '4px 6px', color: UI_COLORS.textSecondary }}>{cat}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: vals.core > 0 ? UI_COLORS.primary : UI_COLORS.textDim }}>{vals.core > 0 ? fmtFull(Math.round(vals.core)) : '—'}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: vals.onetime > 0 ? UI_COLORS.caution : UI_COLORS.textDim }}>{vals.onetime > 0 ? fmtFull(Math.round(vals.onetime)) : '—'}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: vals.income > 0 ? UI_COLORS.positive : UI_COLORS.textDim }}>{vals.income > 0 ? fmtFull(Math.round(vals.income)) : '—'}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right', color: UI_COLORS.textDim }}>{vals.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SurfaceCard>
      )}
    </div>
  );
}

export default memo(ActualsTab);
