import React, { memo } from 'react';
import Slider from '../../components/Slider.jsx';
import { fmtFull } from '../../model/formatters.js';
import { COLORS } from '../../charts/chartUtils.js';
import { projectedPostRetirementVests } from '../../model/chadLevels.js';

/**
 * Age65VestBlock — "Retirement Stock Benefit (Age 65+)" section.
 * Extracted verbatim from src/panels/IncomeControls.jsx (Phase 7 file-size
 * split). Post-retirement RSU vest continuation under the MSFT age-65 rule:
 * standalone section, always visible whenever Chad has a job, independent of
 * the Stock Compensation block (which is hidden in some Plan-tab columns).
 */
function Age65VestBlock({
  chadCurrentAge, chadWorkMonths, chadAge65VestOverride,
  chadJobStartMonth, chadJobRefreshStartMonth, chadJobStockRefresh, chadJobSalary,
  chadL64Enabled, chadL64Month, chadL64Salary, chadL64StockRefresh, chadL64BonusPct,
  chadL65Enabled, chadL65Month, chadL65Salary, chadL65StockRefresh, chadL65BonusPct,
  msftPrice, msftGrowth,
  effectiveTaxRate,
  commitStrategy,
  onFieldChange,
}) {
  const set = onFieldChange;
  return (
    <div style={{ marginTop: 8, padding: "8px 10px", background: COLORS.bgDeep, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
      <div style={{ fontSize: 10, color: COLORS.blue, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Retirement Stock Benefit (Age 65+)</div>
      <div style={{ fontSize: 10, color: COLORS.textDim, marginBottom: 6, lineHeight: 1.4 }}>
        MSFT-style: when Chad is age 65+ at retirement, unvested refresh grants keep vesting on their original 5-yr schedule.
      </div>
      <Slider label="Chad's current age" value={chadCurrentAge} onChange={set('chadCurrentAge')} commitStrategy={commitStrategy} min={30} max={75} step={1} color={COLORS.blue} format={(v) => v + " yrs"} />
      {(() => {
        const retMonth = chadWorkMonths || 72;
        const ageAtRetirement = (chadCurrentAge || 61) + retMonth / 12;
        const eligibleAuto = ageAtRetirement >= 65;
        const override = chadAge65VestOverride || 'auto';
        const applies =
          override === 'on' ? true :
          override === 'off' ? false :
          eligibleAuto;
        const labelMap = { auto: 'Auto (by age)', on: 'Force on', off: 'Force off' };
        return (
          <>
            <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
              {['auto', 'on', 'off'].map(opt => (
                <button
                  key={opt}
                  onClick={() => set('chadAge65VestOverride')(opt)}
                  data-testid={`income-age65-${opt}`}
                  style={{
                    flex: 1, padding: "6px 4px", borderRadius: 4, cursor: "pointer",
                    fontSize: 11, fontWeight: 600, fontFamily: "'Inter', sans-serif",
                    border: override === opt ? `1px solid ${COLORS.blue}` : `1px solid ${COLORS.border}`,
                    background: override === opt ? "#1e3a5f" : COLORS.bgDeep,
                    color: override === opt ? COLORS.blue : COLORS.textDim,
                  }}
                >
                  {labelMap[opt]}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: COLORS.textDim, lineHeight: 1.5 }}>
              Age at retirement: <span style={{ color: applies ? COLORS.greenDark : COLORS.amber, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{ageAtRetirement.toFixed(1)}</span>
              {' '}·{' '}
              Vest continues: <span style={{ color: applies ? COLORS.greenDark : COLORS.amber, fontWeight: 600 }}>{applies ? 'YES' : 'NO'}</span>
              {override === 'auto' && (
                <span style={{ color: COLORS.textDim, fontSize: 10 }}> ({eligibleAuto ? 'eligible by age' : 'too young at retirement'})</span>
              )}
              {override !== 'auto' && (
                <span style={{ color: COLORS.textDim, fontSize: 10 }}> (manual override)</span>
              )}
            </div>
            {applies && (() => {
              // Build a synthetic state mirroring what the engine would see, then
              // ask chadLevels.js for the analytic windfall (1-year cliff applied).
              const synthState = {
                chadJob: true,
                chadJobStartMonth: chadJobStartMonth ?? 0,
                chadRetirementMonth: retMonth,
                chadJobRefreshStartMonth: chadJobRefreshStartMonth ?? 12,
                chadJobStockRefresh: chadJobStockRefresh || 0,
                chadJobSalary: chadJobSalary || 0,
                chadJobBonusPct: 0,
                chadCurrentAge: chadCurrentAge ?? 61,
                chadAge65VestOverride: override,
                chadL64Enabled, chadL64Month, chadL64Salary, chadL64StockRefresh, chadL64BonusPct,
                chadL65Enabled, chadL65Month, chadL65Salary, chadL65StockRefresh, chadL65BonusPct,
                msftPrice, msftGrowth,
              };
              const w = projectedPostRetirementVests(synthState);
              const taxRateDec = effectiveTaxRate / 100;
              // Post-retirement vests come from the FORMER employer's W-2, which
              // ALWAYS withholds full FICA — the active-employment noFICA toggle does
              // NOT carry over (mirrors projection.js:115 chadJobBonusNetMultPostRet).
              // So NO 6.2% FICA add-back here, unlike the in-employment bonus mult.
              const postRetNetMult = 1 - taxRateDec;
              const netWindfall = Math.round(w.grossWindfall * postRetNetMult);
              const hasGrants = w.grossWindfall > 0 || w.forfeitedGrants > 0;
              return (
                <div style={{ marginTop: 6, padding: "6px 8px", background: hasGrants ? "#1a3a2a" : "#3a2e1a", borderRadius: 4, border: `1px solid ${hasGrants ? COLORS.greenDark : COLORS.amber}55`, fontSize: 10, color: hasGrants ? COLORS.greenDark : COLORS.amber, lineHeight: 1.5 }}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>Projected post-retirement RSU windfall</div>
                  {w.grossWindfall > 0 && (
                    <div>
                      {w.eligibleGrants} grant{w.eligibleGrants === 1 ? '' : 's'} continue vesting · gross <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{fmtFull(Math.round(w.grossWindfall))}</span> · net ~<span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{fmtFull(netWindfall)}</span> after tax.
                    </div>
                  )}
                  {w.forfeitedGrants > 0 && (
                    <div style={{ color: COLORS.amber, marginTop: 2 }}>
                      {w.forfeitedGrants} grant{w.forfeitedGrants === 1 ? '' : 's'} forfeited (1-year cliff: issued within 12 months of retirement).
                    </div>
                  )}
                  {!hasGrants && (
                    <div>
                      Eligibility met, but no refresh grants are configured. Set "Annual stock refresh" in Plan → Cashflow → Stock compensation, or set L64/L65 refresh grants above.
                    </div>
                  )}
                  <div style={{ color: COLORS.textDim, marginTop: 3, fontStyle: "italic" }}>
                    Computed analytically. Post-retirement vests are NOT run through the main savings simulation — that produced misleading crashes when both spouses retired together with no SS yet active. Treat this as a side windfall, not a runway extension.
                  </div>
                </div>
              );
            })()}
          </>
        );
      })()}
    </div>
  );
}

export default memo(Age65VestBlock);
