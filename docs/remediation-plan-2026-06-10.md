# Remediation Plan — 2026-06-10 Financial-Calculation Audit

Source: 122-agent financial audit (57 claims → 46 confirmed / 11 refuted → 30 merged findings + 41 improvement proposals).
Full findings: `docs/financial-calc-audit-2026-06-10.md`. IDs below (A1–A8, B1–B11, C1–C18, a/b/c-tier improvements) refer to that report.

## How we work this together

- **I execute phases; you decide gates.** Each phase is one focused working session. Between phases you answer the open decision gates (table below) for the next one — every gate has a recommended default (★) so "go with your recommendations" is always a valid answer.
- Reproducing test BEFORE each fix (project rule). Several findings are locked by tests asserting the *wrong* value — those tests get flipped first, shown failing, then fixed.
- Every phase ends with the full gate: `npm test` + `npx vite build` + browser verify on the isolated test server + push to main.
- One workstream per commit. Engine changes that move displayed numbers get before/after snapshots recorded in the commit message.
- **Direction-of-change ledger:** every phase's commit notes whether it makes the picture look better or worse and by roughly how much, so we can see the cumulative effect on the SSDI-vs-job comparison rather than absorbing it silently.

---

## Phase 0 — Statutory foundations (everything later depends on these)

The audit found stale 2024/2025 constants labeled "2026" and the same statutory values hardcoded in 4+ places. Build the tables once so later phases (and every future January) are one-line diffs.

- **0.1 Year-indexed tax parameter table** *(improvement a-4)* — `getTaxParamsForYear(year)`: MFJ brackets, standard deduction, QBI thresholds, CTC, 401(k)/catch-up limits, SS wage base; assumed-index rate for future years; legally-frozen thresholds pinned ($250k addl-Medicare, $32k/$44k provisional income).
- **0.2 SSA limits table** — earnings-test exempt amounts, SGA, attorney-fee cap, by year. Fixes **B3** (2026 values: $24,480 lower / $65,160 FRA-year — current code has $22,320/$62,160). Replace the four hardcoded literals in `IncomeControls.jsx` with imports. Update the locked tests (`projection.test.js:1572, 1607, 2480-2583`).
- **0.3 `familyMaxForPIA(pia)`** bend-point helper in `constants.js` *(improvement b-13; prerequisite for Phase 1's B5/A7)*.
- **0.4 Shared interpolated percentile utility** *(improvement b-5; prerequisite for Phase 4's C15)*.
- **0.5 SALT threshold schedule** (**C8**, trivial once 0.1 exists).

**Exit criteria:** all statutory values flow from the two tables; zero hardcoded duplicates (grep-verified); table values locked by per-year tests.
**Effort:** 1 session. **Gates:** none.

---

## Phase 1 — Benefits-engine truth (SS/SSDI; the biggest tilt on the core decision)

- **1.1 SS COLA (A2).** New field `ssColaRate` (full New Field Checklist), applied as `(1+cola)^(m/12)` to ALL SS/SSDI/spousal/child streams whenever expense inflation is on. → Gate **D2**.
- **1.2 SS taxability haircut (A1, interim).** Haircut the *adult* share of `ssBenefit`, `sarahSpousal`, and back pay by an effective rate (≈0.85 × marginal) inside `runMonthlySimulation`. Kids' share stays untaxed. Explicitly temporary — replaced by Phase 7 engine wiring. → Gate **D1**.
- **1.3 Twins' student rule (B4).** Child benefits run through HS graduation (~m=40), via a NEW constant — `TWINS_AGE_OUT_MONTH` stays put because the CTC correctly keys on the age-17 timeline (+$12,642 family income).
- **1.4 Retirement family maximum (B5).** `ssFamilyTotal = ssPersonal + min(2×0.5·PIA, familyMaxForPIA(PIA) − PIA)` — bend-point formula and aux-pool arithmetic land together (fixing either alone makes it worse).
- **1.5 Spousal-benefit corrections (A7).** `ssSpousalAdjustmentFactor(claimAge)` (25/36%/mo first 36, 5/12%/mo after, clamp 1.0 at FRA — no delayed credits on spousal); apply in `gatherState.js:123` AND to the retirement sim's `spousalCeiling`; suppress spousal inside the family-max window; wire `sarahSpousalClaimAge` into `deriveRetirementParams`. → Gate **D9**.
- **1.6 Earnings test on Sarah's spousal (A8).** Same annualized test Chad gets, against her net SE earnings, while she's under HER FRA; recredit at her FRA.
- **1.7 Whole-check earnings-test withholding (B1 + B2 via improvement b-3).** Model SSA's actual whole-check withholding; count only fully-withheld months toward the ARF recredit; apply the recredit at FRA in the MAIN projection so `monthlyData` and `RetirementIncomeChart` finally agree. Update `projection.test.js:1397-1408`.
- **1.8 FRA-year window (B7).** Calendar-year anchored $1/$3 branch (m=70..77 for this household); attainment month and later exempt (m≥78).
- **1.9 RSU growth in the earnings-test wage estimate (C18)** — same code area, zero-cost to include.

**Effort:** 2–3 sessions. **Gates: D1, D2, D9.**

---

## Phase 2 — Tax-engine correctness (display layer today; Phase 7 makes it the engine)

Order matters: **2.1 lands before 2.2** (shared wage base interacts).

- **2.1 SE tax per-individual (A3, CRITICAL).** Sarah's Schedule SE base no longer reduced by Chad's W-2 wages. `computeAdditionalMedicare` stays household-combined (correct as-is). Regression: $200k W-2 + $150k Sch C → ssTax ≈ $17,177.
- **2.2 Legacy MSFT vests into the tax engine (A4).** Accumulate gross legacy vests into `chadW2Gross` + `chadW2FicaBase` in `buildTaxSchedule` (expose a gross helper from `vesting.js`). 2026 displayed tax moves ~$50k → ~$85–90k.
- **2.3 QBI: SSTB phase-in (C1).** `isSSTB` flag (default true — therapy is an SSTB), applicable-percentage step inside the $403,500–$553,500 band; add the net-capital-gain term to the overall cap.
- **2.4 Solo-401(k) employer cap 20% (C2).** Effective rate = rate/(1+rate); update locking tests.
- **2.5 Back-pay gross of attorney fee (C3)** + **§86(e) lump-sum election (improvement b-10)** — compute both treatments, take the min, flag which won.
- **2.6 LTCG stack + NIIT (C4).** ST/LT split on `taxCapGainLoss`, 0/15/20 brackets from the Phase-0 table, NIIT 3.8%.
- **2.7 Standard deduction indexes with `taxInflationAdjust` (C5).**
- **2.8 Kids' SS benefits off the parents' return (C6).** Adult-only benefits and back pay in `estimateAnnualSSBenefits`.
- **2.9 FICA out of `balance` (C9).** Define refund/owed off 1040 quantities only; document the convention.

**Effort:** 2–3 sessions. **Gates:** none (all corrections of law).

---

## Phase 3 — Retirement & 401(k) truth

- **3.1 Tax-aware retirement pool (A5).** Haircut `end401k` by `retirement401kTaxRate` before pooling. Regression: `totalPool < endSavings + end401k + homeSaleNet` whenever `end401k > 0`. → Gate **D3**.
- **3.2 Real-vs-nominal seam (B8).** Deflate the nominal pool to today's dollars (≈÷(1+inflation)^years) at the accumulation→retirement hand-off, matching the engine's documented today's-dollar convention.
- **3.3 Floor-crediting parity (B9).** Port `simulatePath` semantics into the hook's deterministic loop (always credit supplementalFlows; floor is a clamp only); add a parity test.
- **3.4 Geometric mean for the deterministic line (B10).** Both the trajectory and the "avg real return" label; relabel "(expected)". → Gate **D10**.
- **3.5 401(k) deferral FICA add-back (B6).** Mirror the pension pattern in `projection.js` AND `w2Diagnostic.js` together; update test K1.
- **3.6 Super catch-up age gate (C7).** $11,250 only in years attaining 60–63; $8,000 after; fix `sensitivityAnalysis.js` auto-fill.
- **3.7 PERS corrections (C13, C14).** $0 below 60 paid months (5-yr vesting) with contribution-refund note; ~0.95 J&S factor when survivor coverage is on.

**Effort:** 2 sessions. **Gates: D3, D10.**

---

## Phase 4 — Monte Carlo & risk bands

- **4.1 Randomize 401(k) and home (A6) + correlated market factor (B11 + improvement b-2).** One common normal deviate Z drives savings return, 401(k) return, MSFT price (ρ≈0.7), home appreciation (ρ≈0.3, own σ). → Gate **D7**.
- **4.2 Optional block-bootstrap mode** from the repo's Shiller series (12-month blocks), behind the existing "assumption uncertainty" labeling decision — gives true sequence-of-returns risk in the MC. → Gate **D7**.
- **4.3 Shared percentiles (C15).** Adopt the Phase-0 utility at all four quantile sites.
- **4.4 Caption fix (C16).** One line.

**Effort:** 1–2 sessions. **Gates: D7.** Expect the downside bands to widen — that is the point.

---

## Phase 5 — Display parity & small leaks (one tidy session)

- **5.1** Earnings-test panel uses the engine's wage basis + FRA-year tier via a shared helper (C10); delete the dead locals.
- **5.2** `withdrawalHome` exposed on monthlyData rows + chart tooltips (C11); un-diff the reconstruction in `monteCarlo.js`.
- **5.3** `clampAdjustment` breakdown line when `Math.max(expenses,0)` binds (C12).
- **5.4** Refresh steady-state mult = exact 20-quarter mean at all three sites (C17) + test W2-5.

**Effort:** 1 session. **Gates:** none.

---

## Phase 6 — Truth-critical model additions (this is where the picture gets honest)

Each needs your real-world data — see **Chad data needed** below.

- **6.1 Self-employed health-insurance deduction (improvement a-2).** `min(premiums, schCNet − ½SE − solo401k)` above the line in non-employer-coverage months; zeroed when `chadJobHealthSavings` is active. ~$11–12k/yr of tax relief on the SSDI path the model currently misses.
- **6.2 College costs / 529 for the twins (improvement a-3).** New fields (`collegeCostPerKidMonthly`, `collegeStartMonth`, `collegeMonths`, `college529Balance`), `expenseBreakdown.college` line. Fixes the sign of "Twins to college". → Gate **D4**.
- **6.3 Debt amortization (improvement a-5) + mortgage P&I split (improvement b-12).** Per-debt balance/APR/payment; payments drop to zero at payoff (~$190k of phantom expense removed, mostly relieving the SSDI path); mortgage P&I excluded from expense inflation; principal paydown credited to home equity. → Gate **D5** (data).
- **6.4 Healthcare cost path (improvement a-6).** Split `healthPremiumMonthly` out of baseExpenses with its own medical-trend rate; `chadMedicareMonth = min(SSDI entitlement + 24 months, age 65)` — plausibly ~$1,000/mo of relief on the SSDI path. → Gate **D6** (data).
- **6.5 Tax drag on the taxable balance (improvement b-11).** Default-0 `taxableReturnDragPct` field (snapshot-preserving).
- **6.6 Emergency-fund floor / two-bucket returns (improvement b-15).** Cash bucket at cash yield; invested remainder at the equity return.

**Effort:** ~3 sessions. **Gates: D4, D5, D6.**

---

## Phase 7 — Wire the real tax engine into the simulation (improvement a-1, the big one)

Replaces the Phase-1 interim SS-tax haircut and the flat multipliers with per-year effective rates from `buildTaxSchedule` behind `taxMode='engine'` (flat mode stays as the regression baseline). Captures Sarah's SE tax + QBI, RSU lumpiness, SS taxability tiers, CTC, SEHI — and makes the Tax tab, W-2 diagnostic, and savings charts tell one story.

Includes: **RSU withholding true-up** (improvement b-14, ~$30k of cash timing moved out of the bridge months) and **RMDs at 75** (improvement b-9, follows the 3.1 bucket split).

**Prereqs:** Phases 1–3 and 6 (the engine must be computing the right liability before it drives cash flow).
**Effort:** 2–3 sessions. **Gates:** D1 already chose this path; final go/no-go after Phase 6 numbers settle.

---

## Phase 8 — Strategic modules (pick what you want)

| Module | Why | Effort |
|---|---|---|
| ★ **Trial Work Period / EPE (b-1)** | The job-vs-SSDI decision is NOT irreversible — 9 TWP months + 36-month expedited reinstatement is real option value for you specifically | medium |
| Sarah deemed filing + own-record benefit in main projection (b-4) | Her $1,900 own benefit is invisible in cash-flow charts today | medium |
| Sarah solo 401(k)/SEP lever (b-6) | The durable earner has no retirement-savings lever | large |
| Survivor scenario + term life/DI on Sarah (b-7) | Largest income stream has no mortality/disability hedge | medium |
| Tier (c) small items (ODC credit, ESPP, vest-cadence verify, van amortization, §72(t) guard, …) | Batch of small accuracy nits | 1 session |

---

## Decision gates (answer before the phase that needs them)

| # | Phase | Decision | Recommendation ★ |
|---|---|---|---|
| D1 | 1 | SS taxability: interim haircut now + engine later, or wait for Phase 7? | ★ Haircut now — the $57k flattery is too big to leave standing for weeks |
| D2 | 1 | `ssColaRate` default | ★ 2.5% (recent-decade average; 2026 actual is 2.8%), RANGE 0–4, applied only when expense inflation is on |
| D3 | 3 | `retirement401kTaxRate` default | ★ 13% effective MFJ (mid of the audit's 10–15% band) |
| D9 | 1 | `sarahSpousalClaimAge` default | ★ Her FRA (67) — avoids both the early-reduction and earnings-test traps; slider 62–70 |
| D10 | 3 | Deterministic line: fix to geometric, or relabel only? | ★ Fix to geometric — "(expected)" should mean expected |
| D4 | 6 | College: $/kid/yr, start, duration, current 529 balance | ★ $34k/kid/yr (in-state all-in), Sept 2029 start, 48 months — **need your real intent + 529 balance** |
| D5 | 6 | Debt stack: per-debt balances, APRs, minimum payments | **Need your real numbers** (statements suffice); fallback: keep flat `debtService` + document |
| D6 | 6 | Chad's SSDI entitlement date (drives Medicare 24-month rule) + medical trend | ★ trend 6.5%; **need the entitlement date** from your SSA award letter |
| D7 | 4 | MC correlations + block-bootstrap toggle | ★ ρ(MSFT)=0.7, ρ(home)=0.3; bootstrap as an opt-in toggle |
| D8 | 8 | Include the TWP/EPE module? | ★ Yes — most decision-relevant feature in the whole roadmap |

## Chad data needed (gather at your leisure; blocks only Phase 6)

1. Per-debt: balance, APR, minimum payment (and which loan `retireDebt` refers to).
2. Mortgage: P&I amount, rate, remaining balance (if you want b-12).
3. SSDI entitlement date (award letter) — for Medicare timing.
4. Current 529 balance(s) + intended college spend for the twins.
5. (Phase 8, optional) Your actual MSFT hire-grant vest cadence from the offer letter.

## Sequencing summary

```
P0 foundations → P1 benefits ┬→ P2 tax display → P7 engine wiring
                             └→ P3 retirement → P4 monte carlo
P5 parity (anytime after P0) ; P6 additions (needs your data) → P7 ; P8 picks
```

Estimated total: ~12–15 working sessions for P0–P7; P8 by selection.
