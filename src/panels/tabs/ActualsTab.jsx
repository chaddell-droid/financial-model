import React, { memo, useState, useMemo, useRef } from 'react';
import { fmtFull } from '../../model/formatters.js';
import { parseTransactionCSV, mergeTransactions, groupByMonth, getCurrentMonth, analyzeMerchantFrequency, ALWAYS_CORE, ALWAYS_ONETIME, MIXED_CATEGORY_THRESHOLDS } from '../../model/csvParser.js';
import { computeActualsDrift } from '../../model/checkIn.js';
import { UI_COLORS, UI_SPACE, UI_TEXT, UI_RADII } from '../../ui/tokens.js';
import SurfaceCard from '../../components/ui/SurfaceCard.jsx';

function getConfidence(txn, merchantClassifications, merchantFreq) {
  if (txn.amount > 0) return 'high';
  if (merchantClassifications && merchantClassifications[txn.merchant]) return 'high';
  if (merchantFreq && merchantFreq[txn.merchant] >= 2) return 'high';
  if (ALWAYS_CORE.has(txn.category) || ALWAYS_ONETIME.has(txn.category)) return 'high';
  if (MIXED_CATEGORY_THRESHOLDS[txn.category] !== undefined) return 'medium';
  return 'low';
}

function ActualsTab({ monthlyActuals, merchantClassifications, currentTotalMonthlySpend, currentOneTimeExtras, baseExpenses, debtService, vanMonthlySavings, bcsFamilyMonthly, dispatch }) {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [uploadFeedback, setUploadFeedback] = useState(null);
  const [showPushConfirm, setShowPushConfirm] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(null); // null | 'month' | 'all'
  const [resetClearClassifications, setResetClearClassifications] = useState(false);
  const [driftDismissedMonth, setDriftDismissedMonth] = useState(null);
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
    const confidenceOrder = { low: 0, medium: 1, high: 2 };
    return [...txns].sort((a, b) => {
      if (sortBy === 'amount') return (a.amount - b.amount) * dir;
      if (sortBy === 'merchant') return a.merchant.localeCompare(b.merchant) * dir;
      if (sortBy === 'category') return a.category.localeCompare(b.category) * dir;
      if (sortBy === 'confidence') {
        const ca = getConfidence(a, merchantClassifications);
        const cb = getConfidence(b, merchantClassifications);
        return (confidenceOrder[ca] - confidenceOrder[cb]) * dir;
      }
      return a.date.localeCompare(b.date) * dir;
    });
  }, [transactions, searchQuery, sortBy, sortDir, merchantClassifications]);

  const merchantFreq = useMemo(() => analyzeMerchantFrequency(monthlyActuals), [monthlyActuals]);

  const transactionsWithConfidence = useMemo(() =>
    filteredTransactions.map(t => ({ ...t, confidence: getConfidence(t, merchantClassifications, merchantFreq) })),
    [filteredTransactions, merchantClassifications, merchantFreq]
  );

  const reviewCount = useMemo(() =>
    transactions.filter(t => getConfidence(t, merchantClassifications, merchantFreq) !== 'high').length,
    [transactions, merchantClassifications, merchantFreq]
  );

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

  const drift = useMemo(() => {
    if (transactions.length === 0) return null;
    return computeActualsDrift(totals.coreTotal, totals.onetimeTotal, baseExpenses, debtService, vanMonthlySavings, bcsFamilyMonthly);
  }, [transactions.length, totals.coreTotal, totals.onetimeTotal, baseExpenses, debtService, vanMonthlySavings, bcsFamilyMonthly]);

  const showDriftBanner = drift && Math.abs(drift.pctDelta) > 10 && driftDismissedMonth !== selectedMonth;

  const categoryBreakdown = useMemo(() => {
    const cats = {};
    for (const t of transactions) {
      if (!cats[t.category]) cats[t.category] = { core: 0, onetime: 0, income: 0, count: 0 };
      cats[t.category][t.type] += Math.abs(t.amount);
      cats[t.category].count++;
    }
    return Object.entries(cats).sort((a, b) => (b[1].core + b[1].onetime + b[1].income) - (a[1].core + a[1].onetime + a[1].income));
  }, [transactions]);

  // Month-over-month trending
  const trending = useMemo(() => {
    const sortedMonths = Object.keys(monthlyActuals).sort();
    if (sortedMonths.length < 2) return null;
    return sortedMonths.map(m => {
      const txns = monthlyActuals[m]?.transactions || [];
      const core = Math.round(Math.abs(txns.filter(t => t.type === 'core').reduce((s, t) => s + t.amount, 0)));
      const onetime = Math.round(Math.abs(txns.filter(t => t.type === 'onetime').reduce((s, t) => s + t.amount, 0)));
      const income = Math.round(txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0));
      return { month: m, core, onetime, income };
    });
  }, [monthlyActuals]);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseTransactionCSV(e.target.result, merchantClassifications, monthlyActuals);
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
    if (txn.amount > 0) return;
    dispatch({
      type: 'UPDATE_TRANSACTION_TYPE',
      month: selectedMonth,
      transactionId: txn.id,
      newType: txn.type === 'core' ? 'onetime' : 'core',
    });
  };

  const handleMerchantBulk = (txn) => {
    if (txn.amount > 0) return;
    const newType = txn.type === 'core' ? 'onetime' : 'core';
    dispatch({
      type: 'BULK_CLASSIFY_MERCHANT',
      month: selectedMonth,
      merchant: txn.merchant,
      newType,
    });
  };

  const sortArrow = (col) => sortBy === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  const typePillStyle = (type, confidence) => ({
    padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, cursor: type === 'income' ? 'default' : 'pointer', userSelect: 'none',
    background: type === 'core' ? `${UI_COLORS.primary}22` : type === 'onetime' ? `${UI_COLORS.caution}22` : `${UI_COLORS.positive}22`,
    color: type === 'core' ? UI_COLORS.primary : type === 'onetime' ? UI_COLORS.caution : UI_COLORS.positive,
    opacity: confidence === 'high' ? 0.7 : 1,
    border: confidence === 'low' ? `1px dashed ${type === 'core' ? UI_COLORS.primary : type === 'onetime' ? UI_COLORS.caution : UI_COLORS.positive}` : 'none',
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
              <>
                <button onClick={() => setShowPushConfirm(true)}
                  data-testid="actuals-push-btn"
                  style={{
                    padding: '6px 14px', borderRadius: UI_RADII.sm, border: `1px solid ${UI_COLORS.positive}`,
                    background: `${UI_COLORS.positive}22`, color: UI_COLORS.positive,
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>
                  Push to Model
                </button>
                <button onClick={() => setShowResetConfirm('month')}
                  data-testid="actuals-reset-month-btn"
                  style={{
                    padding: '6px 14px', borderRadius: UI_RADII.sm, border: `1px solid ${UI_COLORS.destructive}`,
                    background: 'transparent', color: UI_COLORS.destructive,
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>
                  Reset Month
                </button>
              </>
            )}
            {Object.keys(monthlyActuals).length > 0 && (
              <button onClick={() => setShowResetConfirm('all')}
                data-testid="actuals-reset-all-btn"
                style={{
                  padding: '6px 14px', borderRadius: UI_RADII.sm, border: `1px solid ${UI_COLORS.destructive}`,
                  background: `${UI_COLORS.destructive}22`, color: UI_COLORS.destructive,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>
                Reset All
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

      {/* Reset confirmation */}
      {showResetConfirm && (
        <SurfaceCard padding="sm" tone="featured" style={{ marginBottom: UI_SPACE.md, borderColor: UI_COLORS.destructive }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: UI_COLORS.destructive, marginBottom: 8 }}>
            {showResetConfirm === 'all' ? 'Reset All Actuals?' : `Reset ${selectedMonth}?`}
          </div>
          <div style={{ fontSize: 12, color: UI_COLORS.textMuted, lineHeight: 1.6 }}>
            {showResetConfirm === 'all'
              ? 'This will delete all imported transactions across every month. Any values already pushed to the model will not be reverted. This cannot be undone.'
              : `This will delete all imported transactions for ${selectedMonth}. Any values already pushed to the model will not be affected. This cannot be undone.`}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, cursor: 'pointer', fontSize: 12, color: UI_COLORS.textSecondary }}>
            <input
              type="checkbox"
              checked={resetClearClassifications}
              onChange={(e) => setResetClearClassifications(e.target.checked)}
              data-testid="actuals-reset-clear-classifications"
              style={{ accentColor: UI_COLORS.destructive }}
            />
            Also clear learned merchant classifications
            <span style={{ fontSize: 10, color: UI_COLORS.textDim }}>(affects future CSV imports)</span>
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => { setShowResetConfirm(null); setResetClearClassifications(false); }}
              style={{ padding: '5px 12px', borderRadius: UI_RADII.sm, border: `1px solid ${UI_COLORS.border}`, background: 'transparent', color: UI_COLORS.textMuted, fontSize: 12, cursor: 'pointer' }}>
              Cancel
            </button>
            <button
              onClick={() => {
                if (showResetConfirm === 'all') {
                  dispatch({ type: 'RESET_ACTUALS_ALL', clearClassifications: resetClearClassifications });
                } else {
                  dispatch({ type: 'RESET_ACTUALS_MONTH', month: selectedMonth, clearClassifications: resetClearClassifications });
                  const remaining = Object.keys(monthlyActuals).filter(m => m !== selectedMonth).sort();
                  if (remaining.length > 0) setSelectedMonth(remaining[remaining.length - 1]);
                }
                setShowResetConfirm(null);
                setResetClearClassifications(false);
              }}
              data-testid="actuals-reset-confirm"
              style={{ padding: '5px 12px', borderRadius: UI_RADII.sm, border: `1px solid ${UI_COLORS.destructive}`, background: UI_COLORS.destructive, color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {showResetConfirm === 'all' ? 'Reset All' : 'Reset Month'}
            </button>
          </div>
        </SurfaceCard>
      )}

      {/* Month-over-month trending */}
      {trending && trending.length >= 2 && (
        <div style={{ marginBottom: UI_SPACE.sm, padding: '8px 12px', background: UI_COLORS.surfaceMuted, borderRadius: UI_RADII.sm, fontSize: 12 }}>
          <span style={{ color: UI_COLORS.textMuted, fontWeight: 600 }}>Trend: </span>
          <span style={{ color: UI_COLORS.primary, fontFamily: "'JetBrains Mono', monospace" }}>
            Core {trending.map(t => `${fmtFull(t.core)} (${t.month.slice(5)})`).join(' → ')}
          </span>
          <span style={{ margin: '0 8px', color: UI_COLORS.textDim }}>|</span>
          <span style={{ color: UI_COLORS.caution, fontFamily: "'JetBrains Mono', monospace" }}>
            One-Time {trending.map(t => `${fmtFull(t.onetime)} (${t.month.slice(5)})`).join(' → ')}
          </span>
        </div>
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

      {/* Drift suggestion banner */}
      {showDriftBanner && (
        <SurfaceCard padding="sm" style={{ marginBottom: UI_SPACE.md, borderColor: UI_COLORS.caution, borderWidth: 1, borderStyle: 'solid' }}>
          <div style={{ fontSize: 12, color: UI_COLORS.textSecondary, lineHeight: 1.6 }}>
            Your actual core spending (<strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(drift.actualCore)}/mo</strong>) differs from model assumption (<strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(drift.modelTotal)}/mo</strong>) by <strong>{Math.abs(drift.pctDelta)}%</strong>.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={() => {
                dispatch({ type: 'SET_FIELDS', fields: { totalMonthlySpend: drift.actualCore } });
                setDriftDismissedMonth(selectedMonth);
              }}
              data-testid="drift-update-model"
              style={{
                padding: '5px 12px', borderRadius: UI_RADII.sm,
                border: `1px solid ${UI_COLORS.caution}`, background: UI_COLORS.caution,
                color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>
              Update Model
            </button>
            <button
              onClick={() => setDriftDismissedMonth(selectedMonth)}
              data-testid="drift-dismiss"
              style={{
                padding: '5px 12px', borderRadius: UI_RADII.sm,
                border: `1px solid ${UI_COLORS.border}`, background: 'transparent',
                color: UI_COLORS.textMuted, fontSize: 12, cursor: 'pointer',
              }}>
              Dismiss
            </button>
          </div>
        </SurfaceCard>
      )}

      {/* Review count */}
      {reviewCount > 0 && (
        <div style={{
          marginBottom: UI_SPACE.sm, padding: '6px 12px', borderRadius: UI_RADII.sm,
          background: `${UI_COLORS.caution}15`, color: UI_COLORS.caution,
          fontSize: 12, fontWeight: 600,
        }}
          data-testid="actuals-review-count">
          {reviewCount} transaction{reviewCount !== 1 ? 's' : ''} need{reviewCount === 1 ? 's' : ''} review
        </div>
      )}

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
                {[['date', 'Date'], ['merchant', 'Merchant'], ['category', 'Category'], ['account', 'Account'], ['amount', 'Amount'], ['type', 'Type'], ['confidence', 'Conf.']].map(([col, label]) => (
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
              {transactionsWithConfidence.map((t) => (
                <tr key={t.id} style={{
                  borderBottom: `1px solid ${UI_COLORS.border}22`,
                  borderLeft: `3px solid ${t.type === 'core' ? UI_COLORS.primary : t.type === 'onetime' ? UI_COLORS.caution : UI_COLORS.positive}`,
                }}>
                  <td style={{ padding: '6px', color: UI_COLORS.textDim, whiteSpace: 'nowrap' }}>{t.date}</td>
                  <td style={{ padding: '6px', color: UI_COLORS.textSecondary }}>
                    {t.merchant}
                    {merchantFreq[t.merchant] >= 2 && t.amount < 0 && (
                      <span title={`Seen in ${merchantFreq[t.merchant]} months`} style={{ marginLeft: 4, fontSize: 10, color: UI_COLORS.primary, opacity: 0.6 }}>↻</span>
                    )}
                  </td>
                  <td style={{ padding: '6px', color: UI_COLORS.textDim }}>{t.category}</td>
                  <td style={{ padding: '6px', color: UI_COLORS.textDim, fontSize: 10 }}>{t.account}</td>
                  <td style={{ padding: '6px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: t.amount > 0 ? UI_COLORS.positive : UI_COLORS.destructive }}>
                    {t.amount > 0 ? '+' : ''}{t.amount.toFixed(2)}
                  </td>
                  <td style={{ padding: '6px' }}>
                    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                      <button onClick={() => handleTypeToggle(t)} style={typePillStyle(t.type, t.confidence)} data-testid={`actuals-type-${t.id}`}>
                        {(t.type === 'core' ? 'Core' : t.type === 'onetime' ? 'One-Time' : 'Income') + (t.confidence !== 'high' ? ' ?' : '')}
                      </button>
                      {t.amount < 0 && (
                        <button onClick={() => handleMerchantBulk(t)}
                          title={`Set all ${t.merchant} to ${t.type === 'core' ? 'One-Time' : 'Core'}`}
                          style={{ background: 'transparent', border: `1px solid ${UI_COLORS.border}`, borderRadius: 6, color: UI_COLORS.textDim, fontSize: 8, padding: '1px 4px', cursor: 'pointer' }}>
                          all
                        </button>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '6px', fontSize: 9, color: t.confidence === 'high' ? UI_COLORS.positive : t.confidence === 'medium' ? UI_COLORS.caution : UI_COLORS.destructive }}>
                    {t.confidence === 'high' ? '●' : t.confidence === 'medium' ? '◐' : '○'}
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
                    <th style={{ padding: '6px', textAlign: 'right', color: UI_COLORS.textDim, fontSize: 10 }}>Bulk</th>
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
                      <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                        {vals.income === 0 && (
                          <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                            <button onClick={() => dispatch({ type: 'BULK_CLASSIFY', month: selectedMonth, category: cat, newType: 'core' })}
                              style={{ ...typePillStyle('core'), fontSize: 9, padding: '1px 5px' }}>All Core</button>
                            <button onClick={() => dispatch({ type: 'BULK_CLASSIFY', month: selectedMonth, category: cat, newType: 'onetime' })}
                              style={{ ...typePillStyle('onetime'), fontSize: 9, padding: '1px 5px' }}>All 1x</button>
                          </div>
                        )}
                      </td>
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
