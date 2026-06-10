# Financial Model Audit — Synthesis Report (2026-06-10)

## 1. Executive Summary

We audited the math behind every major number this model shows — taxes, Social Security/SSDI rules, the retirement simulation, and the Monte Carlo risk bands — and confirmed 30 defects (after merging duplicates found independently by multiple specialists). The good news: the core cash-flow engine is sound, the prior remediation held up, and several of the scariest-sounding claims were refuted on close inspection. The bad news: the errors that remain are not random — they systematically tilt the model's central question, "SSDI path vs. Chad takes a W-2 job." The biggest single distortion is that the simulation pays SSDI/SS benefits completely untaxed (~$57,000 of savings overstated over the default horizon) while also denying those same benefits the inflation increases (COLA) the law guarantees (~$35–45k understated over the default horizon, ~$190k on longer horizons) — two large errors in opposite directions that do not cancel cleanly. On the job side, a Schedule SE wage-base bug erases roughly $15,500/year of Sarah's self-employment tax whenever Chad works, flattering the job path; and the displayed Tax tab ignores the ~$307k of remaining Microsoft RSU vests entirely. The retirement view treats the entire pre-tax 401(k) (~$1.1M projected) as spendable with zero tax, overstating sustainable retirement spending by roughly $550–$690/month, and the Monte Carlo never randomizes the 401(k) or home — so the downside bands the family uses to judge "will we be OK" are too rosy. Each defect below has a precise location, a corrected treatment, and a fix sketch; none requires architectural change.

---

## 2. Confirmed Defects (ordered by financial materiality to this household)

### Tier A — Materially distorts the SSDI-vs-job decision or headline charts

**A1. SS/SSDI benefits and the back-pay lump flow into cash flow completely untaxed** — `src/model/projection.js:546, 558-560`
- **Wrong:** `cashIncome` adds `ssBenefit` (and the ~$104k back-pay deposit) gross. With Sarah's Schedule C profit, MFJ provisional income is far above the $44,000 tier, so 85% of the adult benefit is federally taxable (IRC §86, Pub 915). The repo's own tax engine computes this but is display-only by design (D1).
- **Impact:** ~$788/mo of tax never deducted (~$57,000 of overstated savings over 72 months) plus ~$14,200 of back-pay-year tax. This is the largest single flattery of the SSDI path on every savings chart.
- **Fix:** Haircut the *adult* share of `ssBenefit` and `backPayActual` by an effective rate (≈0.85 × marginal) in `runMonthlySimulation`, or accelerate D1-A2 (wire `taxMode==='engine'` into the loop). Kids' auxiliary share stays untaxed. Include `sarahSpousal` in the haircut.

**A2. No SS COLA while expenses inflate 3%/yr by default — mixed nominal/real frame** — `src/model/projection.js:337-397 vs 486-489`; `initialState.js:120-121` *(merged: ss-ssdi + realism findings)*
- **Wrong:** Expenses compound at 3% (default ON) and Sarah's rates grow 5% nominal, but every SS/SSDI/spousal stream is flat forever. SS COLA is automatic by statute (42 U.S.C. §415(i); 2.8% for 2026). The model is nominal on the expense side and real on the benefit side — penalizing the benefit-dependent path, whose income is ~100% legally indexed.
- **Impact:** ~$700–$1,050/mo of guaranteed income missing by year 6; ~$35–45k understated over the 72-month default horizon, ~$190k+ over 204 months.
- **Fix:** Add `ssColaRate` (default ~2.5, RANGE 0–4), multiply all SS/SSDI/spousal streams by `(1+cola)^(m/12)` whenever expense inflation is on. Direction of error is conservative, but it materially skews the model's reason for existing.

**A3. Schedule SE wage-base coordination uses the SPOUSE'S W-2 wages — SE tax is per-individual** — `src/model/taxEngine.js:46-55, 188-194`; call sites `taxProjection.js:391, 413` — **critical**
- **Wrong:** Sarah's 12.4% SS SE-tax base is reduced by *Chad's* W-2 wages. Under IRC §1402(b)(1) / Schedule SE line 8a, only the *same person's* wages coordinate. Chad $200k W-2 + Sarah $150k Sch C → engine SS SE tax = $0; correct = $17,177. Net household tax understated ~$15,500/yr in every W-2-path year (after the larger ½SE deduction/QBI clawback).
- **Fix:** Call `computeSelfEmploymentTax` with `w2Wages=0` (or a `sarahW2Wages` input defaulting 0). Do **not** change `computeAdditionalMedicare` — the 0.9% $250K MFJ threshold correctly combines spouses. Update the locking tests; add regression: $200K W-2 + $150K Sch C → ssTax ≈ $17,177.

**A4. Legacy MSFT vests ($307.6k gross through Aug 2028) absent from the tax engine** — `src/model/taxProjection.js:230-339` (composition at :339)
- **Wrong:** `chadW2Gross` is built only from hypothetical new-job comp and is 0 on the SSDI path — but post-separation RSU vests are W-2 + FICA wages in the vest year regardless of employment. Display-only (Tax tab, advisor `taxBreakdown`, W-2 diagnostic), but the engine toggle promises "real federal tax."
- **Impact:** 2026 displayed household tax ~$50,050 vs ~$85–90k correct (≈$35–40k understated); similar 2027–28.
- **Fix:** In `buildTaxSchedule`'s monthly loop, accumulate gross legacy vests (expose a gross helper from `vesting.js`) into both `chadW2Gross` and `chadW2FicaBase`. Note the fix interacts with A3 (shared wage base) — land A3 first.

**A5. Retirement pool counts pre-tax 401(k) as fully spendable — retirement withdrawals never taxed** — `src/hooks/useRetirementSimulation.js:81-88`; `src/model/ernWithdrawal.js:36-52, 95-131`
- **Wrong:** `totalPool = endSavings + end401k + homeSaleNet` spends the ~$1.1M pre-tax 401(k) face value 1:1, while the same codebase grosses up pre-retirement 401(k) deficit draws by 1/(1−25%) (`projection.js:585-602`). Home proceeds are fine (§121 exclusion + 6% cost factor); the 401(k) leg is not — RMDs at 73+ make the tax unavoidable.
- **Impact:** At a realistic 10–15% effective MFJ rate: pool overstated $110–170k → ~$460–690/mo of phantom sustainable spending on the SWR/PWA cards.
- **Fix:** Haircut `end401k` by a `retirement401kTaxRate` (default ~12–15%) before summing, or track buckets. Regression test: `totalPool < endSavings + end401k + homeSaleNet` whenever `end401k > 0`.

**A6. 401(k) return and home appreciation never randomized in Monte Carlo** — `src/model/monteCarlo.js:101-110`; `initialState.js:236-238`
- **Wrong:** `simParams` randomizes savings return, Sarah growth, MSFT, SSDI timing — but the $478k 401(k) compounds at a deterministic 15%/yr and the $700k home at 4% in *every* sim (verified: bands401k p10=p50=p90 = $1,105,647 in solvent runs). The same equity exposure carries 12% σ when held in savings.
- **Impact:** p10 net worth overstated ~$25–48k in the default (drawdown) scenario, up to ~$340–640k in solvent scenarios; drawdown waterfall also flatters solvencyRate.
- **Fix:** Drive `return401k` with the same normal deviate as `investmentReturn`; give `homeAppreciation` its own smaller σ with partial correlation.

**A7. Sarah's spousal benefit: worker reduction factors, phantom delayed credits, and no reduction at all in the retirement sim** — `src/state/gatherState.js:118-125`; `src/model/retirementIncome.js:90-106` *(merged: 3 findings)*
- **Wrong:** (1) `gatherState.js:123` reduces spousal with the WORKER's `ssAdjustmentFactor` (62 → 70% vs correct 65%) and grants DRCs past FRA (70 → 124% vs correct cap 100%, +$506/mo phantom). (2) The retirement sim pays the *unreduced* 50% ceiling from age 62 — defaults overstate ~$288–351/mo (~$3.5–4.2k/yr) for life, and the model fills ages 65–67 with $2,107/mo SSA would never pay. (3) Early-claim configs can stack spousal past the family maximum.
- **Fix:** Add `ssSpousalAdjustmentFactor(claimAge)` (25/36%/mo first 36, 5/12%/mo beyond, clamp 1.0 at FRA) in `constants.js`; use it at `gatherState.js:123` and apply it to the `spousalCeiling` in `retirementIncome.js:97` (wire `sarahSpousalClaimAge` into `deriveRetirementParams`); apply the spousal excess vs own-record split per dual-entitlement; suppress spousal inside the family-max window.

**A8. No earnings test on Sarah's spousal while her practice is earning ~$190k+/yr** — `src/model/projection.js:405-413`
- **Wrong:** Spousal is paid whenever Chad has claimed, with no check on Sarah's own SE earnings. SSA fully withholds it under her FRA at her income level.
- **Impact:** ~$21,900 phantom at default `sarahWorkMonths=72` / claim 64; ~$54,600 at claim 62.
- **Fix:** Apply the same annualized earnings test Chad gets (lines 422–477) to `sarahSpousal` using her net SE earnings while she is under FRA; recredit at her FRA.

### Tier B — Real money in reachable scenarios

**B1. FRA recredit over-credits: partial-reduction months counted as fully-withheld months** — `src/model/projection.js:478-481, 640` → `retirementParams.js:40-43` → `ssRecalculatedBenefit`
- Counter increments on any partial reduction; SSA's ARF (20 CFR 404.412) removes only months with NO benefit payable, and SSA withholds whole checks. Overstates post-FRA benefit up to ~$900/mo in the ~$22k–$93k earnings band (slider-reachable, not default). **Fix:** model whole-check withholding (see Improvement B-3); count only fully-withheld months. *(Verifier-downgraded to medium.)*

**B2. Main projection never applies the FRA recredit at all — two surfaces disagree** — `src/model/projection.js:339-343, 465-466`
- `monthlyData` pays the early-claim amount forever post-FRA while `RetirementIncomeChart` simultaneously shows the (over-)recredited $3,933 for the same scenario; correct ≈$3,248. **Fix:** recompute the personal benefit at `SS_FRA_MONTH` with the corrected counter so all surfaces agree. Update `projection.test.js:1397-1408`.

**B3. SS earnings-test exempt amounts are 2024/2025 values mislabeled "2026"** — `src/model/constants.js:30-31`; literals duplicated `src/panels/IncomeControls.jsx:69, 655, 661, 698` *(found independently by 4 specialists)*
- $22,320 is the 2024 lower amount; $62,160 is the 2025 FRA-year amount. SSA 2026: **$24,480 / $65,160**. Over-withholds ~$83–90/mo whenever the test binds (conservative direction) and corrupts the withheld-months counter. SGA $1,690 and attorney-fee cap $9,200 verified correct. **Fix:** correct both constants; replace the four hardcoded UI literals with imports; update locked tests (`projection.test.js:1572, 1607, 2480, 2488, 2513-2516, 2554, 2583`).

**B4. Twins' child benefits cut at 18 despite the SSA full-time-student rule** — `src/model/constants.js:34-38`
- 20 CFR 404.367 pays through HS graduation (~June 2029, m=39); model stops at m=34. Understates family income **$12,642** (6 × $2,107) on both benefit paths. **Fix:** introduce a separate student-rule end month (m=40) for SS/SSDI child benefits; do NOT move `TWINS_AGE_OUT_MONTH` itself — it also anchors the CTC (`taxProjection.js:386`), which must stay on the age-17 timeline.

**B5. Retirement family maximum: flat 150% + reduced-worker arithmetic overpays at claim-62** — `src/state/gatherState.js:94-110`
- The only reachable defect is the overstatement: at claim 62 the model pays $6,321/mo for 15 months vs SSA-correct $6,110 (bend-point FMAX ≈$7,374 − PIA, added to the reduced worker benefit) → **+$3,165**. The two errors must be fixed *together* (bend-point formula + POMS RS 00615.756 aux-pool arithmetic); fixing either alone makes it worse. SSDI side (150%) is correct. **Fix:** `familyMaxForPIA(pia)` helper + `ssFamilyTotal = ssPersonal + min(2×0.5·PIA, FMAX − PIA)`.

**B6. 401(k) pre-tax deferral escapes FICA in the cashflow engine** — `src/model/projection.js:209-220`; mirrored `src/model/w2Diagnostic.js:65-69` *(merged: 2 findings)*
- Deferral is subtracted before the ALL-IN mult, so it "saves" 7.65% FICA that IRC §3121(v)(1)(A) says it doesn't. The pension three lines above does it right (`pensionCashflowMult`), and `taxEngine.js:180-185` documents the correct rule. ~$156/mo (~$1,877/yr) of overstated take-home per max-deferral year; dormant at defaults. **Fix:** mirror the pension pattern (deferral × `ficaRateOnPension` added back); update test K1 and the W2 diagnostic together.

**B7. FRA-year earnings-test window is anniversary-anchored, not calendar-year, and frees one month late** — `src/model/projection.js:465-475` *(merged: 2 findings)*
- `m >= SS_FRA_MONTH - 12` gives Oct–Dec 2031 the generous $1/$3 + FRA-year limit (≈$4,700–5,700 over-credited in the cited scenarios); and `SS_FRA_MONTH=79` tests earnings in Sep 2032 (m=78), the FRA-attainment month, when no test applies. **Fix:** derive the calendar year from `m + PROJECTION_START_MONTH`; apply the FRA-year branch only within the FRA calendar year and before the attainment month (m=70..77); exempt m≥78.

**B8. Real-vs-nominal seam: nominal 2032-dollar pool fed into the real-return (Shiller) retirement engine** — `src/model/retirementParams.js:40-57`; `useRetirementSimulation.js:81-88`
- The accumulation projection is nominal (3% expense inflation, 15% returns); the retirement engine is deliberately real with flat 2026-dollar flows. Mixing frames misaligns pool vs guaranteed income by ~14–19% (~0.4pp of withdrawal rate on a $2M pool). Per the owner's documented today's-dollar convention, **deflate the pool to today's dollars** (≈÷1.19 at 3%/6yr) rather than COLA-indexing the flows. The "trust/pension fixed-nominal" sub-claim is an accepted, test-locked owner decision — out of scope.

**B9. Deterministic retirement trajectory pins at the pool floor and stops crediting guaranteed income** — `src/hooks/useRetirementSimulation.js:343-357` *(merged: 2 findings)*
- The exact bug fixed in `simulatePath` (finding 2.2) survives in the hook's inline loop: at the floor only inheritance is credited, so the dashed line flatlines while the bands recover, and `poolActive=false` mis-states the income plan. **Fix:** copy `simulatePath` semantics (always credit supplementalFlows; floor is a clamp only; delete the rescueFlows special case); add a parity test.

**B10. Deterministic line & "avg real return" label compound the ARITHMETIC mean — volatility drag ignored** — `useRetirementSimulation.js:334-340, 350`; `RetirementIncomeChart.jsx:221`; `RetirementSummaryCards.jsx:86`
- 60/40: arithmetic 5.89% vs geometric 5.46% real → line ends ~10.7% high on pure compounding, ~40% above the cohort p50 (≈p63) with withdrawals, while labeled "(expected)". **Fix:** geometric monthly mean for both, or relabel "arithmetic average (excludes volatility drag)" and drop "(expected)".

**B11. MSFT price path drawn independent of market returns** — `src/model/monteCarlo.js:103, 106`
- Joint left tail (bad market AND cheap MSFT during the 2026–28 bridge) sampled ~1.0% vs ~4.7% at ρ=0.7 (~4.7× under-sampled), flattering solvencyRate exactly when RSU income is the main buffer. **Fix:** common market factor Z with ρ≈0.7 (see Improvement B-2).

### Tier C — Bounded, scenario-gated, or display-only

**C1. QBI phase-in ignores SSTB status** — `taxEngine.js:88-101`. Therapy is an SSTB (§199A(d)(2)); inside the $403,500–$553,500 MFJ band the lawful deduction is 20%·QBI·(1−p)², not 20%·QBI·(1−p). Max error ~$2.4–3.2k/yr of tax, only in high-comp W-2 years. Secondary: overall cap omits the net-capital-gain subtraction (§199A(a)(2)). **Fix:** `isSSTB` flag (default true) + applicable-percentage step.

**C2. Solo 401(k) employer cap uses 25% instead of the self-employed 20%** — `taxEngine.js:125-131`; `taxConstants.js:79`. Pub 560 reduced rate = 0.25/1.25. $100k Sch C: employerMax $23,234 vs legal $18,587 → tax understated ~$818 if maxed (after QBI interaction). **Fix:** effective rate = rate/(1+rate); update locking tests.

**C3. SSDI back-pay taxable amount excludes the withheld attorney fee** — `taxProjection.js:138-152`. SSA-1099 box 5 is gross (Pub 915); fee is nondeductible post-TCJA. Display-only; ~$1,720 understated tax in the receipt year. **Fix:** add gross back pay to `annualBenefits`; keep fee-net for cashflow.

**C4. Positive capital gains taxed at ordinary rates — no LTCG 0/15/20 stack, no NIIT anywhere** — `taxEngine.js:219, 227`. Manifests only when the user sets `taxCapGainLoss` positive (slider exposed ±$100k; realistic for MSFT sales). +$50k LTCG at ~$250k income: engine $12,000 vs correct $9,400. **Fix:** ST/LT split, LTCG bracket stack (Rev. Proc. 2025-32), NIIT = 3.8%·min(NII, MAGI−$250k).

**C5. taxInflationAdjust inflates brackets but not the standard deduction** — `taxProjection.js:362-376` vs `taxEngine.js:83`. Internally inconsistent (§63(c)(4) indexes it); ~$715/yr extra tax by year 6 for this household. Off by default, display-only; the toggle's UI text (`TaxSettingsPanel.jsx:122`) promises deduction growth that doesn't happen. **Fix:** pass `STD_DED × factor` into `calculateTax`.

**C6. Children's SSDI auxiliary benefits attributed to the parents' return** — `taxProjection.js:109, 113, 128`. Pub 915: child benefits are the child's income. Display-only phantom tax: +$9,062 (2026, incl. kids' back pay), +$4,728 (2027), +$3,940 (2028). **Fix:** use adult-only benefits (and adult-only back pay) in `estimateAnnualSSBenefits`.

**C7. Super catch-up $11,250 flows past the year Chad turns 64** — `projection.js:101, 219-221`. SECURE 2.0 §109: $11,250 only in years attaining 60–63; $8,000 after. ~$9,750 of impermissible inflow over ages 64–66; `sensitivityAnalysis.js:172` auto-fills it. **Fix:** age-gate by calendar year.

**C8. SALT phase-down threshold frozen at $500,000** — `taxConstants.js:40`. OBBBA indexes it +1%/yr ($505,000 for 2026). $0 error at this household's MAGI; matters only in high-income scenarios. **Fix:** threshold schedule mirroring `SALT_CAP_SCHEDULE`.

**C9. `balance` (refund/owed) includes employee FICA as liability but never credits its withholding** — `taxEngine.js:300-301`. Latent (no UI consumer); engine balance +$2,000 vs 1040-correct ≈+$17,451 (off by exactly the $15,451 FICA). **Fix:** define balance off 1040 quantities only; document the convention before any UI consumes it.

**C10. Earnings-test panel diverges from the engine (salary-only vs salary+bonus+RSU+sign-on; no FRA-year tier)** — `IncomeControls.jsx:659-686`; dead variables at :69-71. **Fix:** shared helper + import the constant + display-parity test.

**C11. `withdrawalHome` computed but never exposed on monthlyData rows** — `projection.js:590, 608-612 vs 621-637`. From m≈27–52 (defaults) home-equity draws silently cover deficits; `monteCarlo.js:134-148` already diffs the series to reconstruct it. **Fix:** add the field to the push + tooltips (additive, no snapshot change).

**C12. `Math.max(expenses, 0)` clamp breaks expenses=Σbreakdown parity** — `projection.js:540`. Over-cut scenarios show a tooltip that doesn't sum, unflagged. **Fix:** record a `clampAdjustment` breakdown line + row flag.

**C13. PERS Plan 2 pension pays below the 5-year vesting threshold** — `chadLevels.js:100-114`. A 36-month stint pays $514/mo for life + survivor; PERS pays $0. (The final-salary-vs-AFC half is a disclosed, test-locked simplification — fix only the vesting floor.) **Fix:** return 0 when paidMonths < 60, with a contribution-refund note.

**C14. Pension pays 100% alive AND a 50% survivor benefit — a combination PERS doesn't offer** — `retirementIncome.js:5-15`. Apply a J&S option factor (~0.95) when survivor coverage is modeled. Latent (pension rate defaults 0).

**C15. Nearest-rank percentiles without interpolation, inconsistent with the interpolated PWA percentiles** — `monteCarlo.js:37-38, 45-49`; `useRetirementSimulation.js:324`; `retirementParams.js:133`. Sub-noise dollar impact; real issue is two quantile definitions in one app, mildly optimistic on downside bands. **Fix:** shared interpolated util (see Improvement B-5).

**C16. SequenceOfReturnsChart "steady" baseline embeds volatility drag** — `SequenceOfReturnsChart.jsx:33-53, 115-117`. All printed stats (bad vs good) are clean; only the caption "changes only the order that returns arrive" is wrong for the steady line. **Fix:** one caption line.

**C17. W-2 diagnostic refreshSteadyMult uses vest ages 0.5–4.5 vs engine 0.25–5.0** — `w2Diagnostic.js:78-82, 109`; duplicated in `sensitivityAnalysis.js:190` and the displayParity test helper. ~1.23% low at g=10%. **Fix:** exact 20-quarter mean at all three sites + test W2-5.

**C18. SS earnings test annualizes refresh/hire RSU wages without the msftGrowth multiplier** — `projection.js:446-455 (453), 434-436`. Zero impact at default g=0. **Fix:** include the per-grant growth factor in the estimate.

---

## 3. Improvement Roadmap

### Tier (a) — Truth-critical (the model misleads without these)

1. **Wire the real tax engine into the monthly simulation (`taxMode='engine'`, the planned D1-A2)** — fixes A1 properly, captures Sarah's SE tax + QBI, RSU lumpiness, SS taxability tiers, CTC; makes the Tax tab, W-2 diagnostic, and savings charts agree. Sketch: per-year effective rates from `buildTaxSchedule` replacing the flat multipliers; flat mode stays as regression baseline; display-parity tests. **Effort: large.** *(merged duplicate proposals from tax-law / cashflow-engine / realism)*
2. **Self-employed health insurance deduction (§162(l))** — the family pays $50,400/yr in premiums; deductible above the line against Sarah's Sch C in every non-W-2 year (~$11–12k/yr of tax), and *disallowed* in employer-coverage months — an honest cost of NOT taking the job. Sketch: `taxSehiPremiums` field; `min(premiums, schCNet − ½SE − 401k)` off AGI and the QBI base; zeroed during `chadJobHealthSavings` windows. **Effort: medium.**
3. **College costs / 529 for the twins** — today "Twins to college" *reduces* expenses $3,000/mo with zero tuition; reality is ~$68k/yr combined starting Sept 2029, landing exactly in the post-vest, post-child-benefit squeeze. The sign of the event is wrong. Sketch: `collegeCostPerKidMonthly`/`collegeStartMonth`/`collegeMonths`/`college529Balance` + an `expenseBreakdown.college` line, keeping the existing milestone separate. **Effort: medium.**
4. **Year-indexed statutory parameter tables (tax + SSA constants)** — one `getParamsForYear(year)` for brackets/std deduction/SS wage base/QBI threshold/CTC/401(k) limits, and an `SSA_LIMITS` table (earnings test, SGA, fee cap) with assumed-COLA indexing, pinning the legally frozen thresholds ($250k addl-Medicare, $32k/$44k provisional). Removes the systematic late-year overstatement and makes the annual update a one-line diff. **Effort: medium.** *(merged: tax-law + ss-ssdi + cashflow-engine proposals)*
5. **Amortize the debt stack** — $6,434/mo `debtService` runs forever, but the $189,778 of balances amortizes to zero in ~36–42 months; months ~42–72 carry ~$190k of phantom expense, darkening the SSDI path most. Sketch: per-debt APR fields, balance tracking, payment drops to 0 at payoff; `retireDebt` keeps its meaning. **Effort: medium.**
6. **Healthcare cost path: Chad's Medicare via SSDI 24-month rule, Medicare at 65, medical-trend inflation** — with 18 months of back pay, Chad's Medicare could start within months, plausibly +$1,000/mo of relief on the SSDI path; offset by 6–7% medical trend on the rest of the $4,200/mo premium. Sketch: split `healthPremiumMonthly` out of baseExpenses with its own trend rate; derive `chadMedicareMonth = min(entitlement+24, age 65)`. **Effort: medium.**

### Tier (b) — High-value additions

1. **Trial Work Period / EPE module** — the model presents job-vs-SSDI as irreversible; SSA's TWP (9 months full benefits + paycheck, 3-month grace, 36-month expedited reinstatement) is exactly the option value of Chad *trying* work. The single most consequential framing improvement for Chad personally. **Effort: medium.**
2. **One correlated market factor + block-bootstrap returns from the repo's Shiller series** — fixes A6/B11 jointly, gives the MC sequence-of-returns risk (the family's actual 2026–28 question), and unifies the MC and historical engines. Sketch: common Z driving savings/401(k)/MSFT(ρ≈0.7)/home(ρ≈0.3); optional 12-month block bootstrap behind the D8 toggle. **Effort: medium.** *(merged)*
3. **Whole-check earnings-test withholding** — models SSA's actual January-forward $0-check pattern; fixes the B1 counter and B2 recredit as side effects and shows true month-to-month cash. **Effort: medium.**
4. **Sarah's own-record benefit + deemed filing in the main projection** — her $1,900 own benefit is invisible in cash-flow charts; deemed filing (own + spousal excess) is how SSA actually pays her cohort. Pairs with the A7 fix. **Effort: medium.**
5. **Shared interpolated percentile utility** — one tested quantile function across MC bands, cohort bands, optimal-rate extraction, and PWA (fixes C15). **Effort: small.**
6. **Sarah solo 401(k)/SEP lever** — her practice is the durable earner and the model has no retirement-savings lever for her; the tax engine already computes her max. **Effort: large.**
7. **Sarah-dies-first survivor scenario + term life/DI on Sarah** — the family's largest income stream has no mortality/disability hedge anywhere in the model. **Effort: medium.**
8. **Reconcile the 15% nominal 401(k) growth with the real-return retirement engine** — the headline pool is built by the model's most aggressive assumption, then handed to a real engine (see B8). Either relabel/re-default to a real return or extend the cohort machinery backward. **Effort: medium.**
9. **RMDs at 75 once the pool is tax-aware** — forced taxable distributions from ~$1.1M pre-tax mid-horizon; follows the A5 bucket split. **Effort: medium.**
10. **§86(e) lump-sum election for SSDI back pay** — compute both treatments, take the min, flag which won; can cut the back-pay-year tax by thousands at no real-world cost. **Effort: small.**
11. **Tax drag / cost basis on the taxable savings balance** — an untaxed 15% taxable return is the most optimistic untracked assumption (~$15–30k over 6 years); default-0 field preserves snapshots. **Effort: small.** *(merged: cashflow-engine + realism)*
12. **Split fixed mortgage P&I out of inflating baseExpenses; credit principal paydown to home equity** — ~$970/mo of phantom expense by year 6 if P&I ≈$5k/mo, and real forced saving currently dropped from net worth. **Effort: medium.**
13. **Family-maximum bend-point helper** — companion to B5; one tested `familyMaxForPIA` used by gatherState and future survivor math. **Effort: small.**
14. **True-up RSU withholding vs final liability (29.65% at vest, April reconciliation)** — moves ~$30k of cash out of the bridge months into refund months; gate behind `taxMode='engine'`. **Effort: medium.**
15. **Emergency-fund floor + two-bucket cash/invested returns** — the only buffer against an SSDI denial currently earns the full equity return. **Effort: small.**

### Tier (c) — Nice-to-have

- **ODC $500/child after the twins age out of the CTC** ($1,000/yr from 2028; small). 
- **ESPP on the W-2 path** (~$2,500/yr near-risk-free; medium). 
- **Sign-on clawback modeling** instead of the 50/50 split (small). 
- **msftPrice provenance stamp + staleness/floor warning** (small). 
- **Comp-band sanity hints for L63/L64/L65 entries** (display-only; small). 
- **Birthday-anchored start month for Sarah's spousal claim** (same class as remediation 2.4; up to ~$23k of timing error; small). 
- **Effective-sample-size caveat on the cohort success rate** (~6 independent 25-year windows in 155 years; small). 
- **Verify hire-grant vest cadence against Chad's actual offer; optional quarterly mode** (small). 
- **First-calendar-year pre-tax catch-up (SECURE 2.0 §603 same-employer lookback)** (~$2.5–3k of deferred tax; small). 
- **MSFT RSU sale module (per-lot basis, LTCG+NIIT)** — depends on the C4 LTCG stack (large). 
- **Van loan amortization to the sale month** (~$15k pessimistic error; small). 
- **Defensive age guard + §72(t) disability exception on 401(k) deficit draws** (small). 
- **Per-flow real/nominal `indexed` classification with assumed COLA** — fuller successor to the B8 minimal fix (medium).

---

## 4. Refuted Claims (for the record — do not re-report)

- CTC modeled as purely nonrefundable (no ACTC) — refuted.
- Monte Carlo σ as permanent mean shift makes the fan ~2.4× too wide — refuted (deliberate assumption-uncertainty design).
- SS-path consulting zeroed until claim has no legal basis — refuted.
- Month-0 savings/401(k)/home growth timing asymmetry — refuted (immaterial/intended).
- Legacy vest 0.80 net factor vs 29.65% statutory minimum withholding — refuted (deliberate, test-locked).
- $410.68 hedge floor never enforced as a Math.max — refuted (fallback semantics intended).
- w2Diagnostic `chadJobRefreshStartMonth` default 0 vs 12 — refuted (not reachable as claimed).
- Diagnostic Additional Medicare ignores Sarah's SE income — refuted (intended scope of the W-2-only line).
- Default $80k chadJobSalary implausible for L63 — refuted (user-owned input, not a defect).
- chadJob=true forfeits SSDI/back pay ignoring TWP — refuted (claim still pending; TWP inapplicable). *Note: the Tier (b) TWP improvement remains worthwhile as a feature.*
- Default 15% return assumptions overstate wealth — refuted as a defect (explicit user assumption); addressed as improvements (b)8 and (a) labeling work.