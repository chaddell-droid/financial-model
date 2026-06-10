import React, { memo } from 'react';
import { COLORS } from '../../charts/chartUtils.js';
import { vestSchedule } from '../../model/chadLevels.js';

/**
 * VestScheduleMatrix — year × grant table showing when each RSU refresh
 * grant vests and how much (after-tax $). Extracted verbatim from
 * src/panels/IncomeControls.jsx (Phase 7 file-size split). Always visible
 * when Chad has a job and at least one grant is configured; renders null
 * otherwise.
 */
function VestScheduleMatrix({
  chadJobStartMonth, chadWorkMonths, chadJobRefreshStartMonth, chadJobStockRefresh, chadJobSalary,
  chadCurrentAge, chadAge65VestOverride,
  chadL64Enabled, chadL64Month, chadL64Salary, chadL64StockRefresh, chadL64BonusPct,
  chadL65Enabled, chadL65Month, chadL65Salary, chadL65StockRefresh, chadL65BonusPct,
  msftPrice, msftGrowth,
  effectiveTaxRate, chadJobNoFICA,
}) {
  const synthState = {
    chadJob: true,
    chadJobStartMonth: chadJobStartMonth ?? 0,
    chadRetirementMonth: chadWorkMonths || 72,
    chadJobRefreshStartMonth: chadJobRefreshStartMonth ?? 12,
    chadJobStockRefresh: chadJobStockRefresh || 0,
    chadJobSalary: chadJobSalary || 0,
    chadJobBonusPct: 0,
    chadCurrentAge: chadCurrentAge ?? 61,
    chadAge65VestOverride: chadAge65VestOverride || 'auto',
    chadL64Enabled, chadL64Month, chadL64Salary, chadL64StockRefresh, chadL64BonusPct,
    chadL65Enabled, chadL65Month, chadL65Salary, chadL65StockRefresh, chadL65BonusPct,
    msftPrice, msftGrowth,
  };
  const sched = vestSchedule(synthState);
  const activeGrants = sched.grants.filter(g => g.gross > 0);
  if (activeGrants.length === 0) return null;
  // Display NET dollars (after tax) — matches how user thinks of cashflow.
  const taxRateDec = effectiveTaxRate / 100;
  const ficaPctDec = chadJobNoFICA ? 0.062 : 0;
  // In-employment vests use the active net mult (with FICA add-back when noFICA).
  const netMult = 1 - taxRateDec + ficaPctDec;
  // Post-retirement vests come from the FORMER employer's W-2 — full FICA always
  // withheld, so NO add-back (mirrors projection.js:115 chadJobBonusNetMultPostRet).
  const postRetNetMult = 1 - taxRateDec;
  const fmtCell = (v) => v > 0 ? '$' + (v / 1000).toFixed(2) + 'K' : '—';
  const fmtTotal = (v) => v > 0 ? '$' + (v / 1000).toFixed(2) + 'K' : '—';

  // Per-grant post-retirement gross is computed per-vest in vestSchedule
  // (vm > retMonth) so partial years are handled correctly. The Y? (post-ret)
  // shading and (retire mid-yr) tag are driven by sched.postRetYearTotals,
  // which keeps shading and subtotals consistent.
  const postRetTotalsByGrant = activeGrants.map(g => (g.postRetGross || 0) * postRetNetMult);
  const postRetGrandTotal = postRetTotalsByGrant.reduce((a, b) => a + b, 0);
  const eligibleGrantCount = activeGrants.filter(g => g.postRetVested).length;

  return (
    <div style={{ marginTop: 8, padding: "8px 10px", background: COLORS.bgDeep, borderRadius: 6, border: `1px solid ${COLORS.border}` }}>
      <div style={{ fontSize: 10, color: COLORS.blue, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
        Vest schedule by year (after-tax $)
        <span style={{ color: COLORS.textDim, fontWeight: 400, textTransform: "none", letterSpacing: 0, marginLeft: 6 }}>
          @ MSFT ${(msftPrice || 0).toFixed(2)} · {(msftGrowth || 0) >= 0 ? '+' : ''}{(msftGrowth || 0).toFixed(1)}%/yr growth
        </span>
      </div>
      <div style={{ fontSize: 10, color: COLORS.textDim, marginBottom: 6, lineHeight: 1.4 }}>
        Each grant vests 5%/qtr × 20 quarters = 5 years. Slider value = grant dollars at issue; shares = grant ÷ price-at-issue. Each vest's value scales with MSFT growth from issue → vest, so later grants buy fewer shares but each grant's vests grow within its 5-yr cycle. "(done)" = fully vested. <span style={{ color: COLORS.amber }}>★</span> = grant continues vesting post-retirement under age-65 rule. <span style={{ color: COLORS.greenDark }}>Green rows</span> are fully post-retirement; <span style={{ color: COLORS.amber }}>amber rows</span> straddle retirement and show "(post)" sub-amounts for the portion that lands after the last work month. The subtotal sums those post-retirement portions.
      </div>
      <div style={{ overflowX: "auto", marginTop: 4 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", color: COLORS.textDim, padding: "4px 6px", borderBottom: `1px solid ${COLORS.border}`, whiteSpace: "nowrap" }}>Year</th>
              {activeGrants.map(g => {
                const shares = Math.round(g.sharesAtIssue || 0);
                const issuePrice = g.priceAtIssue || (msftPrice || 0);
                return (
                  <th key={g.id} style={{ textAlign: "right", color: COLORS.textDim, padding: "4px 6px", borderBottom: `1px solid ${COLORS.border}`, whiteSpace: "nowrap" }}>
                    <div>
                      #{g.id} ({g.level})
                      {g.postRetVested && (
                        <span title="Continues vesting post-retirement (cleared 1-yr cliff)" style={{ color: COLORS.amber, marginLeft: 3 }}>★</span>
                      )}
                      {g.cliff && (
                        <span title="Forfeited at retirement (within 1-yr cliff)" style={{ color: COLORS.red, marginLeft: 3 }}>✕</span>
                      )}
                    </div>
                    <div style={{ fontSize: 9, color: COLORS.textDim, fontWeight: 400 }} title={`$${(g.gross / 1000).toFixed(0)}K grant at issue ÷ $${issuePrice.toFixed(2)} (price at issue month ${g.issueMonth}) = ${shares} shares`}>
                      {shares} sh @ ${issuePrice.toFixed(0)}
                    </div>
                  </th>
                );
              })}
              <th style={{ textAlign: "right", color: COLORS.blue, padding: "4px 6px", borderBottom: `1px solid ${COLORS.border}`, fontWeight: 700, whiteSpace: "nowrap" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {sched.years.map((yr, yi) => {
              const rowTotalNet = sched.yearTotals[yi] * netMult;
              const yearPostRetTotal = sched.postRetYearTotals[yi] || 0;
              const yearTotal = sched.yearTotals[yi] || 0;
              // Relative tolerance — yearTotal can reach $50K+ where 0.01 absolute is too tight under accumulated FP error.
              const isFullyPostRet = yearPostRetTotal > 0 && yearTotal > 0 && Math.abs(yearPostRetTotal - yearTotal) <= 1e-6 * yearTotal;
              const isStraddle = yearPostRetTotal > 0 && !isFullyPostRet;
              const rowBg = isFullyPostRet ? '#1a2e1a' : isStraddle ? '#3a2e1a' : 'transparent';
              const labelTag = isFullyPostRet
                ? <span style={{ color: COLORS.greenDark, fontWeight: 400, fontSize: 9 }}> (post-ret)</span>
                : isStraddle
                  ? <span style={{ color: COLORS.amber, fontWeight: 400, fontSize: 9 }}> (retire mid-yr)</span>
                  : null;
              return (
                <tr key={yr} style={{ background: rowBg }}>
                  <td style={{ color: COLORS.textSecondary, padding: "3px 6px", fontWeight: 600, whiteSpace: "nowrap" }}>
                    Y{yr}{labelTag}
                  </td>
                  {activeGrants.map((g) => {
                    const origIdx = sched.grants.indexOf(g);
                    const gross = sched.cells[yi][origIdx] || 0;
                    const net = gross * netMult;
                    const postRetNet = (sched.postRetCells[yi][origIdx] || 0) * postRetNetMult;
                    const isDone = g.lastVestYear > 0 && yr > g.lastVestYear;
                    const showPostInline = isStraddle && postRetNet > 0 && postRetNet < net;
                    return (
                      <td key={g.id} style={{ textAlign: "right", padding: "3px 6px", color: net > 0 ? COLORS.greenDark : COLORS.textDim, whiteSpace: "nowrap" }}>
                        {net > 0 ? (
                          <>
                            {fmtCell(net)}
                            {showPostInline && (
                              <span style={{ fontSize: 9, color: COLORS.amber, fontWeight: 400, marginLeft: 4 }} title={`${fmtCell(postRetNet)} of this cell vests after retirement (vest month > ${sched.retMonth})`}>
                                ({fmtCell(postRetNet)})
                              </span>
                            )}
                          </>
                        ) : isDone ? (
                          <span style={{ color: COLORS.textDim, fontStyle: "italic" }}>{g.cliff ? '(forfeit)' : '(done)'}</span>
                        ) : '—'}
                      </td>
                    );
                  })}
                  <td style={{ textAlign: "right", padding: "3px 6px", color: COLORS.blue, fontWeight: 700, whiteSpace: "nowrap" }}>
                    {fmtTotal(rowTotalNet)}
                    {isStraddle && yearPostRetTotal > 0 && (
                      <span style={{ fontSize: 9, color: COLORS.amber, fontWeight: 400, marginLeft: 4 }}>
                        ({fmtCell(yearPostRetTotal * postRetNetMult)})
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {/* Post-retirement subtotal row — only if there are any post-retirement vests */}
            {postRetGrandTotal > 0 && (
              <tr style={{ background: '#1a3a2a', borderTop: `2px solid ${COLORS.greenDark}` }}>
                <td style={{ color: COLORS.greenDark, padding: "5px 6px", fontWeight: 700, fontSize: 10, whiteSpace: "nowrap" }}>
                  Post-ret subtotal
                </td>
                {activeGrants.map((g, i) => {
                  const v = postRetTotalsByGrant[i];
                  return (
                    <td key={g.id} style={{ textAlign: "right", padding: "5px 6px", color: v > 0 ? COLORS.greenDark : COLORS.textDim, fontWeight: 700, whiteSpace: "nowrap" }}>
                      {fmtCell(v)}
                    </td>
                  );
                })}
                <td style={{ textAlign: "right", padding: "5px 6px", color: COLORS.greenDark, fontWeight: 700, fontSize: 11, whiteSpace: "nowrap" }}>
                  {fmtTotal(postRetGrandTotal)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 9, color: COLORS.textDim, fontStyle: "italic", marginTop: 6, lineHeight: 1.4 }}>
        {activeGrants.length} active grant{activeGrants.length === 1 ? '' : 's'} ·
        {' '}gross grant sizes: {activeGrants.map(g => `#${g.id} ${(g.gross/1000).toFixed(0)}K (${g.level})`).join(', ')}
        {eligibleGrantCount > 0 && (
          <span style={{ color: COLORS.greenDark }}>
            {' '}· <span style={{ fontWeight: 600 }}>★ {eligibleGrantCount} grant{eligibleGrantCount === 1 ? '' : 's'}</span> continue post-retirement (≈{fmtTotal(postRetGrandTotal)} after-tax windfall)
          </span>
        )}
        {sched.grants.some(g => g.cliff) && (
          <span style={{ color: COLORS.red }}>
            {' '}· <span style={{ fontWeight: 600 }}>✕ {sched.grants.filter(g => g.cliff && g.gross > 0).length} grant{sched.grants.filter(g => g.cliff && g.gross > 0).length === 1 ? '' : 's'}</span> forfeited (1-yr cliff)
          </span>
        )}
      </div>
    </div>
  );
}

export default memo(VestScheduleMatrix);
