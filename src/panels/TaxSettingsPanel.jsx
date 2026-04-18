import React, { useMemo } from 'react';
import Slider from '../components/Slider.jsx';
import Toggle from '../components/Toggle.jsx';
import { fmtFull } from '../model/formatters.js';
import { COLORS } from '../charts/chartUtils.js';
import { buildTaxSchedule } from '../model/taxProjection.js';

function Section({ title, color, children }) {
  return (
    <div style={{ marginBottom: 12, padding: '10px 12px', background: COLORS.bgDeep, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
      <h4 style={{ fontSize: 11, color, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</h4>
      {children}
    </div>
  );
}

function ReadOnlyRow({ label, value, color = COLORS.textSecondary }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12 }}>
      <span style={{ color: COLORS.textMuted }}>{label}</span>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

export default function TaxSettingsPanel({
  taxMode, taxInflationAdjust, taxInflationRate, taxSchCExpenseRatio,
  taxPropertyTax, taxSalesTax, taxPersonalPropTax, taxMortgageInt,
  taxCharitable, taxMedical, taxW2Withholding, taxCtcChildren,
  taxOdcDependents, taxCapGainLoss, taxSolo401k,
  // Income context for the tax summary
  sarahRate, sarahMaxRate, sarahRateGrowth,
  sarahCurrentClients, sarahMaxClients, sarahClientGrowth,
  sarahWorkYears,
  chadJob, chadJobSalary, chadJobStartMonth,
  onFieldChange,
}) {
  const set = onFieldChange;
  const commitStrategy = 'release';
  const isEngine = taxMode === 'engine';

  // Compute current-year tax summary (year 0 of the schedule)
  const taxSummary = useMemo(() => {
    if (!isEngine) return null;
    const s = {
      sarahRate, sarahMaxRate, sarahRateGrowth,
      sarahCurrentClients, sarahMaxClients, sarahClientGrowth,
      sarahWorkYears,
      totalProjectionMonths: (sarahWorkYears || 6) * 12,
      chadJob, chadJobSalary: chadJobSalary || 0, chadJobStartMonth: chadJobStartMonth ?? 3,
      taxMode, taxInflationAdjust, taxInflationRate, taxSchCExpenseRatio,
      taxPropertyTax, taxSalesTax, taxPersonalPropTax, taxMortgageInt,
      taxCharitable, taxMedical, taxW2Withholding, taxCtcChildren,
      taxOdcDependents, taxCapGainLoss, taxSolo401k,
    };
    try {
      const schedule = buildTaxSchedule(s);
      return schedule[0] || null;
    } catch {
      return null;
    }
  }, [
    isEngine, sarahRate, sarahMaxRate, sarahRateGrowth,
    sarahCurrentClients, sarahMaxClients, sarahClientGrowth, sarahWorkYears,
    chadJob, chadJobSalary, chadJobStartMonth,
    taxMode, taxInflationAdjust, taxInflationRate, taxSchCExpenseRatio,
    taxPropertyTax, taxSalesTax, taxPersonalPropTax, taxMortgageInt,
    taxCharitable, taxMedical, taxW2Withholding, taxCtcChildren,
    taxOdcDependents, taxCapGainLoss, taxSolo401k,
  ]);

  const fmtPct = (rate) => (rate * 100).toFixed(1) + '%';

  return (
    <div style={{ background: COLORS.bgCard, borderRadius: 12, padding: 16, border: `1px solid ${COLORS.border}` }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, margin: '0 0 12px' }}>Tax Settings</h3>

      {/* Tax Mode Toggle */}
      <Section title="Tax Mode" color={COLORS.cyan}>
        <Toggle
          label="Use full tax engine"
          description={isEngine
            ? "Computing real federal tax with brackets, SE tax, deductions, and credits."
            : "Using flat percentage rates. Enable this for accurate tax modeling."}
          checked={isEngine}
          onChange={(v) => set('taxMode')(v ? 'engine' : 'flat')}
          color={COLORS.cyan}
        />
        {!isEngine && (
          <div style={{ fontSize: 11, color: COLORS.amber, marginTop: 4, padding: '6px 8px', background: `${COLORS.amber}11`, borderRadius: 6 }}>
            Flat-rate mode active. Switch to full tax engine for accurate projections with progressive brackets, SE tax, QBI deduction, and credits.
          </div>
        )}
      </Section>

      {isEngine && (
        <>
          {/* Itemized Deductions */}
          <Section title="Itemized Deductions" color={COLORS.blue}>
            <Slider label="Property tax" value={taxPropertyTax} onChange={set('taxPropertyTax')} commitStrategy={commitStrategy} min={0} max={50000} step={500} color={COLORS.blue} format={(v) => fmtFull(v)} />
            <Slider label="Sales tax" value={taxSalesTax} onChange={set('taxSalesTax')} commitStrategy={commitStrategy} min={0} max={50000} step={500} color={COLORS.blue} format={(v) => fmtFull(v)} />
            <Slider label="Personal property tax" value={taxPersonalPropTax} onChange={set('taxPersonalPropTax')} commitStrategy={commitStrategy} min={0} max={10000} step={250} color={COLORS.blue} format={(v) => fmtFull(v)} />
            <Slider label="Mortgage interest" value={taxMortgageInt} onChange={set('taxMortgageInt')} commitStrategy={commitStrategy} min={0} max={100000} step={1000} color={COLORS.blue} format={(v) => fmtFull(v)} />
            <Slider label="Charitable contributions" value={taxCharitable} onChange={set('taxCharitable')} commitStrategy={commitStrategy} min={0} max={100000} step={1000} color={COLORS.blue} format={(v) => fmtFull(v)} />
            <Slider label="Medical expenses (total)" value={taxMedical} onChange={set('taxMedical')} commitStrategy={commitStrategy} min={0} max={200000} step={1000} color={COLORS.blue} format={(v) => fmtFull(v)} />
          </Section>

          {/* Business Expenses */}
          <Section title="Business Expenses" color={COLORS.green}>
            <Slider label="Sch C expense ratio" value={taxSchCExpenseRatio} onChange={set('taxSchCExpenseRatio')} commitStrategy={commitStrategy} min={0} max={80} step={1} color={COLORS.green} format={(v) => v + '%'} />
            <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>
              Sarah's net = gross revenue x {100 - taxSchCExpenseRatio}%
            </div>
          </Section>

          {/* Credits & Withholding */}
          <Section title="Credits & Withholding" color={COLORS.purple}>
            <Slider label="CTC children (under 17)" value={taxCtcChildren} onChange={set('taxCtcChildren')} commitStrategy={commitStrategy} min={0} max={10} step={1} color={COLORS.purple} format={(v) => v.toString()} />
            <Slider label="Other dependents (ODC)" value={taxOdcDependents} onChange={set('taxOdcDependents')} commitStrategy={commitStrategy} min={0} max={10} step={1} color={COLORS.purple} format={(v) => v.toString()} />
            <Slider label="W-2 withholding (annual)" value={taxW2Withholding} onChange={set('taxW2Withholding')} commitStrategy={commitStrategy} min={0} max={100000} step={1000} color={COLORS.purple} format={(v) => fmtFull(v)} />
            {!chadJob && (
              <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>
                W-2 withholding only applies when Chad has a job.
              </div>
            )}
          </Section>

          {/* Other */}
          <Section title="Other Tax Inputs" color={COLORS.amber}>
            <Slider label="Capital gains / losses" value={taxCapGainLoss} onChange={set('taxCapGainLoss')} commitStrategy={commitStrategy} min={-100000} max={100000} step={1000} color={COLORS.amber} format={(v) => fmtFull(v)} />
            <Slider label="Solo 401(k) contribution" value={taxSolo401k} onChange={set('taxSolo401k')} commitStrategy={commitStrategy} min={0} max={70000} step={500} color={COLORS.amber} format={(v) => fmtFull(v)} />
          </Section>

          {/* Inflation */}
          <Section title="Inflation Adjustment" color={COLORS.cyan}>
            <Toggle
              label="Inflate tax parameters annually"
              description="Bracket thresholds, SALT cap, and deduction amounts grow at the rate below."
              checked={taxInflationAdjust}
              onChange={set('taxInflationAdjust')}
              color={COLORS.cyan}
            />
            {taxInflationAdjust && (
              <Slider label="Annual inflation rate" value={taxInflationRate} onChange={set('taxInflationRate')} commitStrategy={commitStrategy} min={0} max={10} step={0.5} color={COLORS.cyan} format={(v) => v + '%'} />
            )}
          </Section>

          {/* Current Year Tax Summary */}
          {taxSummary && (
            <Section title="Current Year Tax Summary" color={COLORS.textMuted}>
              <ReadOnlyRow label="Sarah gross revenue" value={fmtFull(taxSummary.annualSarahGross)} />
              <ReadOnlyRow label="Sch C net (after expenses)" value={fmtFull(taxSummary.schCNet)} />
              {taxSummary.chadW2 > 0 && <ReadOnlyRow label="Chad W-2 wages" value={fmtFull(taxSummary.chadW2)} />}
              <div style={{ borderTop: `1px solid ${COLORS.border}`, margin: '4px 0' }} />
              <ReadOnlyRow label="AGI" value={fmtFull(taxSummary.fullTax.agi)} />
              <ReadOnlyRow label="Taxable income" value={fmtFull(taxSummary.fullTax.taxableIncome)} />
              <ReadOnlyRow label="Federal income tax" value={fmtFull(taxSummary.fullTax.fedTax)} color={COLORS.red} />
              <ReadOnlyRow label="Self-employment tax" value={fmtFull(taxSummary.fullTax.seTax)} color={COLORS.red} />
              <ReadOnlyRow label="Total tax" value={fmtFull(taxSummary.annualTotalTax)} color={COLORS.red} />
              <div style={{ borderTop: `1px solid ${COLORS.border}`, margin: '4px 0' }} />
              <ReadOnlyRow label="Effective rate" value={fmtPct(taxSummary.effectiveTaxRate)} color={COLORS.blue} />
              <ReadOnlyRow label="Marginal rate" value={fmtPct(taxSummary.marginalRate)} color={COLORS.amber} />
              <div style={{ borderTop: `1px solid ${COLORS.border}`, margin: '4px 0' }} />
              <ReadOnlyRow label="Sarah's attributed tax" value={fmtFull(taxSummary.annualSarahTax)} />
              <ReadOnlyRow label="Sarah's monthly set-aside" value={fmtFull(Math.round(taxSummary.annualSarahTax / 12))} color={COLORS.amber} />
              <ReadOnlyRow label="Sarah's combined rate on gross" value={fmtPct(taxSummary.sarahEffectiveOnGross)} />
            </Section>
          )}
        </>
      )}
    </div>
  );
}
