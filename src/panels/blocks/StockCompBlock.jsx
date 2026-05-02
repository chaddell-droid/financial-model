import React, { memo } from 'react';
import Slider from '../../components/Slider.jsx';
import Toggle from '../../components/Toggle.jsx';
import { fmtFull } from '../../model/formatters.js';
import { COLORS } from '../../charts/chartUtils.js';

/**
 * StockCompBlock — Chad's job stock compensation + 401(k) contributions.
 * Lives in the Plan tab Cashflow column per design (rebalanced from the
 * Income column to even out column heights). Hidden when chadJob is false.
 */
function StockCompBlock({
  chadJob,
  chadJobStockRefresh, chadJobRefreshStartMonth,
  chadJobHireStockY1, chadJobHireStockY2, chadJobHireStockY3, chadJobHireStockY4,
  chadJob401kEnabled, chadJob401kDeferral, chadJob401kCatchupRoth, chadJob401kMatch,
  onFieldChange,
}) {
  if (!chadJob) return null;
  const set = onFieldChange;
  const commitStrategy = 'release';
  const totalHireStock = (chadJobHireStockY1 || 0) + (chadJobHireStockY2 || 0) + (chadJobHireStockY3 || 0) + (chadJobHireStockY4 || 0);
  const annualContrib = (chadJob401kDeferral || 0) + (chadJob401kCatchupRoth || 0);
  const annualToBalance = annualContrib + (chadJob401kMatch || 0);
  const monthlyOutflow = Math.round(annualContrib / 12);
  const monthlyToBalance = Math.round(annualToBalance / 12);

  return (
    <>
      {/* Stock Compensation */}
      <div style={{ marginTop: 8, padding: "8px 10px", background: COLORS.bgDeep, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
        <div style={{ fontSize: 10, color: COLORS.blue, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Chad job — stock compensation</div>
        <Slider label="Annual stock refresh (grant $)" value={chadJobStockRefresh || 0} onChange={set('chadJobStockRefresh')} commitStrategy={commitStrategy} min={0} max={200000} step={5000} color={COLORS.blue} format={(v) => v === 0 ? "None" : "$" + (v/1000).toFixed(0) + "K/yr"} />
        {(chadJobStockRefresh || 0) > 0 && (
          <>
            <Slider label="First refresh grant — months after hire" value={chadJobRefreshStartMonth ?? 12} onChange={set('chadJobRefreshStartMonth')} commitStrategy={commitStrategy} min={0} max={24} step={1} color={COLORS.blue} format={(v) => v === 0 ? "On hire" : v + " mo"} />
            <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 2, marginBottom: 6 }}>
              Each grant vests 5% per quarter (Feb / May / Aug / Nov, last day) for 5 yrs. MSFT default: 12 mo (after first review).
            </div>
          </>
        )}
        <div style={{ fontSize: 10, color: COLORS.blue, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 8, marginBottom: 4 }}>One-time hire stock — anniversary lump</div>
        <Slider label="Year 1 vest" value={chadJobHireStockY1 || 0} onChange={set('chadJobHireStockY1')} commitStrategy={commitStrategy} min={0} max={200000} step={5000} color={COLORS.blue} format={(v) => v === 0 ? "—" : "$" + (v/1000).toFixed(0) + "K"} />
        <Slider label="Year 2 vest" value={chadJobHireStockY2 || 0} onChange={set('chadJobHireStockY2')} commitStrategy={commitStrategy} min={0} max={200000} step={5000} color={COLORS.blue} format={(v) => v === 0 ? "—" : "$" + (v/1000).toFixed(0) + "K"} />
        <Slider label="Year 3 vest" value={chadJobHireStockY3 || 0} onChange={set('chadJobHireStockY3')} commitStrategy={commitStrategy} min={0} max={200000} step={5000} color={COLORS.blue} format={(v) => v === 0 ? "—" : "$" + (v/1000).toFixed(0) + "K"} />
        <Slider label="Year 4 vest" value={chadJobHireStockY4 || 0} onChange={set('chadJobHireStockY4')} commitStrategy={commitStrategy} min={0} max={200000} step={5000} color={COLORS.blue} format={(v) => v === 0 ? "—" : "$" + (v/1000).toFixed(0) + "K"} />
        {totalHireStock > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 4, paddingTop: 4, borderTop: `1px solid ${COLORS.border}` }}>
            <span style={{ color: COLORS.textDim }}>Total hire stock:</span>
            <span style={{ color: COLORS.blue, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{fmtFull(totalHireStock)}</span>
          </div>
        )}
      </div>

      {/* 401(k) Contributions */}
      <div style={{ marginTop: 8, padding: "8px 10px", background: COLORS.bgDeep, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
        <div style={{ fontSize: 10, color: COLORS.blue, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>401(k) Contributions</div>
        <Toggle
          label="Enable 401(k) contributions"
          description={chadJob401kEnabled ? "Sliders below are active" : "Disabled — turn on to model deferral, Roth catch-up, and employer match"}
          checked={!!chadJob401kEnabled}
          onChange={set('chadJob401kEnabled')}
          color={COLORS.blue}
          testId="cashflow-401k-enabled"
        />
        {chadJob401kEnabled && (
          <>
            <Slider label="Pre-tax deferral $/yr (IRS 2026: $24,500)" value={chadJob401kDeferral || 0} onChange={set('chadJob401kDeferral')} commitStrategy={commitStrategy} min={0} max={24500} step={500} color={COLORS.blue} format={(v) => v === 0 ? "None" : "$" + (v/1000).toFixed(1) + "K"} />
            <Slider label="Roth catch-up $/yr (60-63 super: $11,250)" value={chadJob401kCatchupRoth || 0} onChange={set('chadJob401kCatchupRoth')} commitStrategy={commitStrategy} min={0} max={11250} step={250} color={COLORS.blue} format={(v) => v === 0 ? "None" : "$" + (v/1000).toFixed(2) + "K"} />
            <Slider label="Employer match $/yr" value={chadJob401kMatch || 0} onChange={set('chadJob401kMatch')} commitStrategy={commitStrategy} min={0} max={50000} step={250} color={COLORS.blue} format={(v) => v === 0 ? "None" : "$" + (v/1000).toFixed(2) + "K"} />
            {annualToBalance > 0 && (
              <div style={{ fontSize: 10, color: COLORS.textDim, marginTop: 4, paddingTop: 4, borderTop: `1px solid ${COLORS.border}`, lineHeight: 1.5 }}>
                Take-home reduced by <span style={{ color: COLORS.amber, fontWeight: 600 }}>${monthlyOutflow.toLocaleString()}/mo</span>; 401k grows by <span style={{ color: COLORS.greenDark, fontWeight: 600 }}>${monthlyToBalance.toLocaleString()}/mo</span> (incl. match).<br />
                Pre-tax deferral lowers W-2 wages; Roth catch-up is post-tax (per SECURE 2.0 mandate for high earners).
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default memo(StockCompBlock);
