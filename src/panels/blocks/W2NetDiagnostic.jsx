import React, { memo } from 'react';
import { fmtFull } from '../../model/formatters.js';
import { COLORS } from '../../charts/chartUtils.js';
import { SS_WAGE_BASE } from '../../model/taxConstants.js';

/**
 * W2NetDiagnostic — exposes every input feeding chadJobMonthlyNet.
 * Extracted verbatim from src/panels/IncomeControls.jsx (Phase 7 file-size
 * split). All numeric values come from the shared w2 diagnostic object
 * (src/model/w2Diagnostic.js — single source of truth, mirrors
 * src/model/projection.js exactly) so this display and the SSDI comparison
 * in IncomeControls always show the same numbers. Edit w2Diagnostic.js, not
 * here (display-parity rule, per CLAUDE.md).
 */
function W2NetDiagnostic({
  w2,
  chadJobSalary, chadJobNoFICA, chadJobPensionRate, chadJobPensionContrib,
  chadJob401kEnabled, chadJob401kDeferral, chadJob401kCatchupRoth, chadJob401kMatch,
  chadL64Enabled, chadL64Month, chadL64Salary, chadL64StockRefresh, chadL64BonusPct,
  chadL65Enabled, chadL65Month, chadL65Salary, chadL65StockRefresh, chadL65BonusPct,
  msftGrowth, effectiveTaxRate,
  chadTaxBreakdown,
  onFieldChange,
}) {
  const set = onFieldChange;
  // Same hoisted aliases as the original IncomeControls w2* block.
  const w2MonthlyGross = w2.monthlyGross;
  const w2SalaryMult = w2.salaryMult;
  const w2BonusMult = w2.bonusMult;
  const w2PensionCashflowMult = w2.pensionCashflowMult;
  const w2RefreshSteadyMult = w2.refreshSteadyMult;
  const w2TaxableMo = w2.taxableMo;
  const w2PensionCashflowMo = w2.pensionCashflowMo;
  const w2SalaryNetMo = w2.salaryNetMo;
  const w2AnnualSalaryNet = w2.annualSalaryNet;
  const w2BonusGrossYr = w2.bonusGrossYr;
  const w2BonusNetYr = w2.bonusNetYr;
  const w2HireTotalAtHire = w2.hireTotalAtHire;
  const w2HireGrownTotal = w2.hireGrownTotal;
  const w2HireNetAvgYr = w2.hireNetAvgYr;
  const w2RefreshNetYr = w2.refreshNetYrSteady;
  const w2FicaBaseAnnual = w2.ficaBaseAnnual;
  const w2FicaSS = w2.ficaSocialSecurity;
  const w2FicaMedicare = w2.ficaMedicare;
  const w2FicaAddlMedicare = w2.ficaAddlMedicare;
  const w2FicaAllInTotal = w2.ficaAllInTotal;
  const w2FicaEffectivePct = w2.ficaEffectivePct;
  const w2TotalAvgYr = w2.totalAvgYr;
  const w2TotalAvgMo = w2.totalAvgMo;
  const w2TotalGrossYr = w2.totalGrossYr;
  const w2BlendedTakeHomePct = w2.blendedTakeHomePct;
  const w2SignOnGross = w2.signOnGross;
  const w2SignOnNet = w2.signOnNet;

  const annualGross = chadJobSalary || 0;
  const monthlyGross = w2MonthlyGross;
  const ficaPct = chadJobNoFICA ? 6.2 : 0;
  const pensionPct = chadJobPensionContrib || 0;
  const deferral = chadJob401kEnabled ? (chadJob401kDeferral || 0) : 0;
  const catchup = chadJob401kEnabled ? (chadJob401kCatchupRoth || 0) : 0;
  const match = chadJob401kEnabled ? (chadJob401kMatch || 0) : 0;
  const salaryMult = w2SalaryMult;
  const bonusMult = w2BonusMult;
  const pensionCashflowMult = w2PensionCashflowMult;
  const taxableSalaryMo = w2TaxableMo;
  const afterTaxSalaryMo = w2TaxableMo * w2SalaryMult;
  const pensionCashflowMo = w2PensionCashflowMo;
  const salaryNetMo = w2SalaryNetMo;
  const bonusNetYr = w2BonusNetYr;
  const refreshNetYr = w2RefreshNetYr;
  const refreshSteadyMult = w2RefreshSteadyMult;
  const hireTotalAtHire = w2HireTotalAtHire;
  const hireNetAvgYr = w2HireNetAvgYr;
  const annualSalaryNet = w2AnnualSalaryNet;
  const totalAvgMo = w2TotalAvgMo;
  const totalAvgYr = w2TotalAvgYr;
  const totalGrossYr = w2TotalGrossYr;
  const blendedTakeHomePct = w2BlendedTakeHomePct;
  const signOnGross = w2SignOnGross;
  const signOnNet = w2SignOnNet;
  // 401(k) economic value to the household (added to the 401k balance incl. match).
  const k401AnnualToBalance = deferral + catchup + match;
  const k401MonthlyToBalance = k401AnnualToBalance / 12;
  const msftGrowthPct = (msftGrowth || 0);
  const hiddenPension = pensionPct > 0 && (chadJobPensionRate || 0) === 0;
  const rowStyle = { display: "flex", justifyContent: "space-between", marginTop: 1, fontSize: 10 };
  const monoStyle = { fontFamily: "'JetBrains Mono', monospace" };
  return (
    <div data-testid="w2-diagnostic" style={{ marginTop: 6, padding: "6px 8px", background: COLORS.bgDeep, borderRadius: 6, border: `1px dashed ${COLORS.border}` }}>
      <div style={{ color: COLORS.amber, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
        W-2 Net Diagnostic
      </div>
      {hiddenPension && (
        <div style={{ color: COLORS.amber, fontSize: 10, marginBottom: 4, padding: "4px 6px", background: "#3a2e1a", borderRadius: 4, border: `1px solid ${COLORS.amber}55` }}>
          <div style={{ fontWeight: 600 }}>PENSION INCONSISTENCY</div>
          <div style={{ marginTop: 2 }}>Contributing {pensionPct.toFixed(1)}% to a pension with 0% accrual rate — you're paying in but not earning benefits. This costs ~{fmtFull(Math.round(annualGross * pensionPct / 100 / 12))}/mo. Either set an accrual rate above, or zero the contribution.</div>
          <button
            onClick={() => set('chadJobPensionContrib')(0)}
            style={{ marginTop: 4, padding: "3px 8px", fontSize: 10, fontWeight: 600, cursor: "pointer", background: COLORS.amber, color: "#000", border: "none", borderRadius: 3 }}
          >
            Reset pension contribution to 0
          </button>
        </div>
      )}
      <div style={{ color: COLORS.textDim, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 2 }}>Inputs (L63 baseline — see Promotion Schedule for L64/L65)</div>
      <div style={rowStyle}><span>Annual gross salary</span><span style={monoStyle}>{fmtFull(annualGross)}</span></div>
      <div style={rowStyle}><span>Monthly gross</span><span style={monoStyle}>{fmtFull(Math.round(monthlyGross))}</span></div>
      <div style={rowStyle}><span>Tax rate (effective)</span><span style={monoStyle}>{effectiveTaxRate}%</span></div>
      <div style={rowStyle}><span>FICA addback (no-FICA toggle)</span><span style={{ ...monoStyle, color: ficaPct > 0 ? COLORS.green : COLORS.textDim }}>+{ficaPct.toFixed(1)}%</span></div>
      <div style={rowStyle}><span>Pension contribution</span><span style={{ ...monoStyle, color: pensionPct > 0 ? COLORS.amber : COLORS.textDim }}>−{pensionPct.toFixed(1)}%</span></div>
      <div style={rowStyle}><span>401(k) pre-tax deferral</span><span style={{ ...monoStyle, color: deferral > 0 ? COLORS.amber : COLORS.textDim }}>{deferral > 0 ? `${fmtFull(deferral)}/yr` : '—'}</span></div>
      <div style={rowStyle}><span>401(k) Roth catch-up</span><span style={{ ...monoStyle, color: catchup > 0 ? COLORS.amber : COLORS.textDim }}>{catchup > 0 ? `${fmtFull(catchup)}/yr` : '—'}</span></div>
      <div style={rowStyle}><span>Employer match (to 401k bal, not cashflow)</span><span style={{ ...monoStyle, color: match > 0 ? COLORS.green : COLORS.textDim }}>{match > 0 ? `${fmtFull(match)}/yr` : '—'}</span></div>

      <div style={{ color: COLORS.textDim, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 6 }}>Multipliers</div>
      <div style={rowStyle}><span>Salary net mult (1 − tax + fica)</span><span style={monoStyle}>{salaryMult.toFixed(4)}</span></div>
      <div style={rowStyle}><span>Bonus / RSU / sign-on net mult (1 − tax + fica)</span><span style={monoStyle}>{bonusMult.toFixed(4)}</span></div>
      {pensionPct > 0 && (
        <div style={rowStyle}><span>Pension cashflow mult (1 − tax + FICA-on-pension)</span><span style={monoStyle}>{pensionCashflowMult.toFixed(4)}</span></div>
      )}
      <div style={{ fontSize: 9, color: COLORS.textDim, fontStyle: "italic", marginTop: 2, lineHeight: 1.4 }}>
        The multiplier is a FLAT all-in effective rate (income tax + FICA folded into your {effectiveTaxRate}% assumption). The real, traceable split is below — same engine as the <span style={{ color: COLORS.blueLight, fontWeight: 600 }}>Tax tab</span>.
      </div>

      {/* Tax breakdown. FICA is on the STEADY-STATE comp shown above (exact —
          FICA depends only on gross wages, and this is the comp the whole pane
          describes). Federal income tax can't be a single steady-state number
          (it depends on the year's full household return), so it is shown only
          as a clearly-labeled per-year reference from the Tax tab — never mixed
          into the FICA basis. */}
      <div style={{ color: COLORS.textDim, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 6 }}>FICA on this comp (exact)</div>
      <div style={{ ...rowStyle, color: COLORS.textDim, fontSize: 9 }}><span>FICA base (gross W-2 wages)</span><span style={monoStyle}>{fmtFull(Math.round(w2FicaBaseAnnual))}/yr</span></div>
      <div style={rowStyle}><span>FICA — Social Security {chadJobNoFICA ? '(none — non-FICA employer)' : `(6.2%, capped at ${fmtFull(SS_WAGE_BASE)} wages)`}</span><span style={{ ...monoStyle, color: w2FicaSS > 0 ? COLORS.textSecondary : COLORS.textDim }}>{fmtFull(Math.round(w2FicaSS))}/yr</span></div>
      <div style={rowStyle}><span>FICA — Medicare (1.45%)</span><span style={monoStyle}>{fmtFull(Math.round(w2FicaMedicare))}/yr</span></div>
      {w2FicaAddlMedicare > 0 && (
        <div style={rowStyle}><span>Additional Medicare (0.9% over {fmtFull(250000)})</span><span style={monoStyle}>{fmtFull(Math.round(w2FicaAddlMedicare))}/yr</span></div>
      )}
      <div style={{ ...rowStyle, fontWeight: 600, paddingTop: 2, borderTop: `1px solid ${COLORS.border}` }}><span>FICA total</span><span style={monoStyle}>{fmtFull(Math.round(w2FicaAllInTotal))}/yr · {(w2FicaEffectivePct * 100).toFixed(1)}% of gross</span></div>
      {chadTaxBreakdown ? (
        <div style={{ fontSize: 9, color: COLORS.textDim, fontStyle: "italic", marginTop: 2, lineHeight: 1.4 }}>
          Federal income tax varies by year on your full household return, so there's no single steady-state figure. For reference, the <span style={{ color: COLORS.blueLight, fontWeight: 600 }}>Tax tab</span> engine shows ≈{fmtFull(Math.round(chadTaxBreakdown.fedTax))}/yr federal in projection year {chadTaxBreakdown.year} (on that year's {fmtFull(Math.round(chadTaxBreakdown.ficaBase))} gross), an all-in ≈{(chadTaxBreakdown.effectivePct * 100).toFixed(1)}% vs your flat {effectiveTaxRate}% assumption. No state income tax is modeled.
        </div>
      ) : (
        <div style={{ fontSize: 9, color: COLORS.textDim, fontStyle: "italic", marginTop: 2, lineHeight: 1.4 }}>
          FICA is exact (depends only on gross wages). See the <span style={{ color: COLORS.blueLight, fontWeight: 600 }}>Tax tab</span> for precise per-year federal income tax. No state income tax is modeled.
        </div>
      )}

      <div style={{ color: COLORS.textDim, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 6 }}>Salary cashflow walk</div>
      <div style={rowStyle}><span>Monthly gross</span><span style={monoStyle}>{fmtFull(Math.round(monthlyGross))}</span></div>
      <div style={rowStyle}><span>− 401(k) deferral / 12</span><span style={monoStyle}>−{fmtFull(Math.round(deferral / 12))}</span></div>
      <div style={rowStyle}><span>= Taxable salary</span><span style={monoStyle}>{fmtFull(Math.round(taxableSalaryMo))}</span></div>
      <div style={rowStyle}><span>× salary mult</span><span style={monoStyle}>{fmtFull(Math.round(afterTaxSalaryMo))}</span></div>
      {pensionPct > 0 && (
        <div style={rowStyle}><span>− Pension × pension mult</span><span style={monoStyle}>−{fmtFull(Math.round(pensionCashflowMo))}</span></div>
      )}
      <div style={rowStyle}><span>− Roth catch-up / 12</span><span style={monoStyle}>−{fmtFull(Math.round(catchup / 12))}</span></div>
      <div style={{ ...rowStyle, fontWeight: 600, color: COLORS.greenDark, paddingTop: 2, borderTop: `1px solid ${COLORS.border}` }}><span>= Salary net (cashflow)</span><span style={monoStyle}>{fmtFull(salaryNetMo)}/mo</span></div>

      <div style={{ color: COLORS.textDim, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 6 }}>Annual W-2 (steady state, all components)</div>
      <div style={rowStyle}><span>Salary net (12 × monthly)</span><span style={monoStyle}>{fmtFull(annualSalaryNet)}/yr</span></div>
      <div style={rowStyle}><span>Bonus net (paid Sept lump)</span><span style={monoStyle}>{fmtFull(Math.round(bonusNetYr))}/yr</span></div>
      <div style={rowStyle}>
        <span>RSU refresh net {msftGrowthPct !== 0 ? `(steady state · ×${refreshSteadyMult.toFixed(3)} for ${msftGrowthPct}% MSFT growth)` : '(steady state)'}</span>
        <span style={monoStyle}>{fmtFull(Math.round(refreshNetYr))}/yr</span>
      </div>
      <div style={rowStyle}>
        <span>Hire stock net {msftGrowthPct !== 0 ? `(avg over 4 yr · ${msftGrowthPct}% MSFT growth applied)` : '(avg over 4 yr)'}</span>
        <span style={monoStyle}>{fmtFull(Math.round(hireNetAvgYr))}/yr</span>
      </div>
      <div style={{ ...rowStyle, fontWeight: 600, color: COLORS.greenDark, paddingTop: 2, borderTop: `1px solid ${COLORS.border}` }}><span>Avg total monthly W-2 net</span><span style={monoStyle}>{fmtFull(totalAvgMo)}/mo</span></div>
      <div style={rowStyle}><span>Total annual W-2 net (take-home)</span><span style={monoStyle}>{fmtFull(Math.round(totalAvgYr))}/yr</span></div>

      {/* Gross comp denominator + blended take-home %. */}
      <div style={{ color: COLORS.textDim, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 6 }}>Total comp (steady state, gross → net)</div>
      <div style={rowStyle}><span>Total annual gross comp</span><span style={monoStyle}>{fmtFull(Math.round(totalGrossYr))}/yr</span></div>
      <div style={rowStyle}><span>Total annual net comp</span><span style={{ ...monoStyle, color: COLORS.greenDark }}>{fmtFull(Math.round(totalAvgYr))}/yr</span></div>
      <div style={rowStyle}><span>Blended take-home %</span><span style={monoStyle}>{(blendedTakeHomePct * 100).toFixed(1)}%</span></div>
      <div style={{ ...rowStyle, color: COLORS.textDim, fontSize: 9 }}><span>↳ salary gross → net</span><span style={monoStyle}>{fmtFull(annualGross)} → {fmtFull(annualSalaryNet)}</span></div>
      <div style={{ ...rowStyle, color: COLORS.textDim, fontSize: 9 }}><span>↳ bonus gross → net</span><span style={monoStyle}>{fmtFull(Math.round(w2BonusGrossYr))} → {fmtFull(Math.round(bonusNetYr))}</span></div>
      <div style={{ ...rowStyle, color: COLORS.textDim, fontSize: 9 }}><span>↳ hire stock (grown) gross → net (avg/yr)</span><span style={monoStyle}>{fmtFull(Math.round(w2HireGrownTotal / 4))} → {fmtFull(Math.round(hireNetAvgYr))}</span></div>

      {/* Economic value to household = cash net + 401(k) incl. match. */}
      {k401AnnualToBalance > 0 && (
        <>
          <div style={{ color: COLORS.textDim, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 6 }}>Economic value to household</div>
          <div style={rowStyle}><span>Cash net</span><span style={monoStyle}>{fmtFull(totalAvgMo)}/mo</span></div>
          <div style={rowStyle}><span>+ 401(k) incl. match (to balance)</span><span style={{ ...monoStyle, color: COLORS.green }}>+{fmtFull(Math.round(k401MonthlyToBalance))}/mo</span></div>
          <div style={{ ...rowStyle, fontWeight: 600, color: COLORS.greenDark, paddingTop: 2, borderTop: `1px solid ${COLORS.border}` }}><span>= Total economic value</span><span style={monoStyle}>{fmtFull(Math.round(totalAvgMo + k401MonthlyToBalance))}/mo</span></div>
        </>
      )}

      {/* Sign-on bonus — ONE-TIME, NOT in the steady-state average above. */}
      {signOnGross > 0 && (
        <>
          <div style={{ color: COLORS.textDim, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 6 }}>Sign-on bonus (one-time, not in average)</div>
          <div style={rowStyle}><span>Sign-on gross (50% hire / 50% 1-yr)</span><span style={monoStyle}>{fmtFull(Math.round(signOnGross))}</span></div>
          <div style={rowStyle}><span>Sign-on net (× bonus mult)</span><span style={{ ...monoStyle, color: COLORS.greenDark }}>{fmtFull(Math.round(signOnNet))}</span></div>
        </>
      )}
      <div style={{ fontSize: 9, color: COLORS.textDim, fontStyle: "italic", marginTop: 3 }}>
        "Monthly after tax" above shows salary only. Bonus, RSUs, and sign-on land in specific months — average above includes them (sign-on is one-time and excluded). RSU and hire-stock totals reflect projected MSFT growth from grant to vest (matches engine).
      </div>
      {/* Promotion projections — show monthly net at L64 and L65 if those toggles are on. */}
      {(chadL64Enabled || chadL65Enabled) && (() => {
        const projectLevel = (salary, refresh, bonusPctRaw, label, monthsFromHire) => {
          const gross = salary || 0;
          const monGross = gross / 12;
          const taxableMo = Math.max(0, monGross - deferral / 12);
          const pensionMo = monGross * pensionPct / 100 * pensionCashflowMult;
          const salNet = Math.round(taxableMo * salaryMult - pensionMo - catchup / 12);
          const bPct = (bonusPctRaw || 0) / 100;
          const bonusYr = gross * bPct * bonusMult;
          // Apply same steady-state MSFT growth mult to L64/L65 refresh as L63 (matches engine treatment).
          const refreshYr = (refresh || 0) * bonusMult * refreshSteadyMult;
          const totalMo = Math.round((salNet * 12 + bonusYr + refreshYr) / 12);
          return (
            <div key={label} style={rowStyle}>
              <span>{label} (mo {monthsFromHire})</span>
              <span style={monoStyle}>{fmtFull(salNet)}/mo salary · {fmtFull(totalMo)}/mo total</span>
            </div>
          );
        };
        return (
          <>
            <div style={{ color: COLORS.textDim, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 6 }}>After promotion (jump-and-hold, no raise compounding shown)</div>
            {chadL64Enabled && projectLevel(chadL64Salary, chadL64StockRefresh, chadL64BonusPct, 'L64', chadL64Month)}
            {chadL65Enabled && projectLevel(chadL65Salary, chadL65StockRefresh, chadL65BonusPct, 'L65', chadL65Month)}
          </>
        );
      })()}
    </div>
  );
}

export default memo(W2NetDiagnostic);
