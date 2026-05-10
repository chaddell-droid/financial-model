# Equity Research Deep-Dive — Micron Technology (NASDAQ: MU)

**Date:** May 10, 2026
**Prepared for:** Generalist PM
**Author:** Research Agent (deep-dive lane)
**Builds on:** sector primer in `server-memory-00-primer.md` and `server-memory-02-makers.md` (citations pulled forward where applicable)

> **Data caveat — read first.** This session does not have access to FactSet, CapIQ, or IBES MCP servers. All consensus estimates, multiples, and price targets in this note come from public aggregators (TipRanks, Stockanalysis.com, GuruFocus, Macrotrends, Marketbeat) and primary IR documents. Where aggregators disagree, we cite the discrepancy rather than pick one. Numbers here should be re-validated against the desk's IBES feed before any sizing decision.

---

## Section 1 — Executive Summary

**Recommendation: BUY (starter position, not full-size). Conviction: Medium.**

Micron is the cleanest US-listed expression of the AI memory super-cycle. FY2Q26 just printed **$23.86B revenue at 75% GAAP gross margin and $12.07 GAAP diluted EPS** — numbers no Street model contemplated 12 months ago — and management has already guided FY3Q26 to **$33.5B at ~81% gross margin and $19.15 EPS**, implying another +40% sequential step ([Micron IR, Mar 18, 2026](https://investors.micron.com/news-releases/news-release-details/micron-technology-inc-reports-results-second-quarter-fiscal-2026); [Quartr Q2 FY26 summary](https://quartr.com/events/micron-technology-inc-mu-q2-2026_3Yxg298f)). The stock at ~$757 trades at **~7.5–8.1x forward P/E** ([GuruFocus](https://www.gurufocus.com/term/forward-pe-ratio/MU); [Stockanalysis](https://stockanalysis.com/stocks/mu/statistics/)) — optically the cheapest large-cap AI name in the market — but on **22.7x EV/EBITDA** ([same](https://stockanalysis.com/stocks/mu/statistics/)) it is also the most expensive Micron has been on a normalized basis since 2017. The right framing for the PM: this is a **trade, not a hold**, where the bull/bear distance compresses dramatically once you re-derive scenarios off mid-cycle (FY28) earnings rather than peak (FY27).

**Fair value range — re-derived (see Section 6 for build-up):**
- **Trough scenario (cycle rolls 2H27):** ~$310 (5.5x EV/EBITDA × $35B FY28 mid-cycle EBITDA, less net debt)
- **Base scenario (super-cycle through 2027, normalize 2028):** ~$700 (10x × FY27E ~$70B EBITDA)
- **Bull scenario (HBM4/HBM4E sustains, structural re-rate):** ~$1,050 (12x × FY27E ~$80B EBITDA)
- **Probability-weighted midpoint: ~$650–$700.** Stock at $757 is fairly priced toward the bull-skew of consensus.

**Bull case (2 sentences):** HBM is structurally tight through 2027 — supply additions are physically gated by CoWoS, hybrid bonding (Besi), and TSV equipment — and Micron has 3–5 year LTAs locking calendar-2026 supply with the volume curve flowing into FY27. Crucial-exit pure-play status, AMD MI350/MI400 design wins, and Vera Rubin shipments (per Micron's 1Q26 announcement) give the company three independent demand legs that have not historically existed simultaneously.

**Bear case (3 sentences):** The 7.5x forward P/E uses **peak-margin EPS** — a 75% GM is not steady-state, and FY28 EPS could mean-revert 30–50% if commodity DRAM ASPs roll. Industry capacity expansions are real (Samsung +50% HBM, SK Hynix doubling DRAM wafers in 2H26, Micron capex >$25B) — textbook late-cycle behavior. Most importantly: multiple sources report Micron may have been **excluded or significantly under-allocated on Nvidia HBM4 Vera Rubin** (split estimated 70% Hynix / 30% Samsung), which — if true — would be a strategic loss the stock is not pricing ([Dr. Robert Castellano, Substack](https://drrobertcastellano.substack.com/p/micron-is-locked-out-of-hbm4-in-nvidias); [wccftech](https://wccftech.com/the-memory-industry-is-at-a-turning-point-with-hbm4/)).

**Why "starter" rather than full-size:** The HBM4-Vera-Rubin exclusion question is the single loudest signal we cannot resolve from public data. Micron's own announcements ([Micron IR, HBM4 volume production](https://investors.micron.com/news-releases/news-release-details/micron-high-volume-production-hbm4-designed-nvidia-vera-rubin)) directly contradict the exclusion narrative; both can't be right. Sizing decision waits on the FY3Q26 print (June 24, 2026) and ideally Nvidia's May 20 print before going full-position.

---

## Section 2 — Business Overview

### What Micron makes

Micron is the **only US-domiciled pure-play memory manufacturer** — DRAM (~79% of revenue in FY2Q26) and NAND (~21%), with HBM the highest-margin DRAM sub-segment ([Micron IR FY2Q26](https://investors.micron.com/news-releases/news-release-details/micron-technology-inc-reports-results-second-quarter-fiscal-2026)). Products include:

- **DRAM:** Standard DDR5 server RDIMMs, MRDIMMs (high-bandwidth modules for AI/HPC), LPDDR5/5X for client and server (LP-server DRAM is a Micron-pioneered category), and **HBM** (HBM3E 12-high 36GB cubes shipping in volume, HBM4 36GB 12-high in volume production for Nvidia Vera Rubin per Micron's own claim).
- **NAND:** Client SSDs (Crucial-branded for consumer, exited Feb 2026), data-center SSDs, and BICS-architecture raw NAND.
- **Modules:** RDIMMs, MRDIMMs, SOCAMM2 (small-form-factor server module — Micron is co-leader with Samsung).

### Business-unit segmentation (FY1Q26 reorganized reporting → FY2Q26 confirmed)

In FY1Q26, Micron re-segmented from the old four-unit structure (CBU/MBU/SBU/EBU) into a clearer data-center-vs-edge split. As reported in FY2Q26 ([Micron IR, Mar 18, 2026](https://investors.micron.com/news-releases/news-release-details/micron-technology-inc-reports-results-second-quarter-fiscal-2026); [stocktitan summary](https://www.stocktitan.net/news/MU/micron-technology-inc-reports-results-for-the-second-quarter-of-5oyd4rwdgqrb.html)):

| Business Unit | FY2Q26 Revenue | % of Total | QoQ | Notes |
|---|---:|---:|---:|---|
| **Cloud Memory (CMBU)** | $7.7B | 32% | +47% | Primary HBM home; Nvidia/AMD HBM3E and HBM4 |
| **Core Data Center (CDBU)** | $5.7B | 24% | +139% | High-cap DDR5 RDIMMs/MRDIMMs to hyperscalers; 74% GM |
| **Mobile & Client (MCBU)** | $7.7B | 32% | +81% | LPDDR5X for smartphones, PC DRAM/NAND |
| **Automotive & Embedded (AEBU)** | $2.7B | 11% | +57% | Auto, industrial, IoT |
| **Total** | **$23.86B** | ~100% | +75% | (~1% rounding) |

**Reading the mix:** CMBU + CDBU = **56% of revenue** in FY2Q26, structurally rising from ~50% in FY1Q26 and <30% in FY24. The data-center mix-shift is the single most important fundamental story.

### Crucial consumer business exit — Feb 2026

In December 2025 Micron announced it would exit the Crucial consumer business (DDR memory modules, SSDs sold direct to consumers and through retail) by end of FY2Q26 ([Micron IR — Crucial Exit](https://investors.micron.com/news-releases/news-release-details/micron-announces-exit-crucial-consumer-business)). The strategic rationale: redirect every available wafer of supply to enterprise/AI customers, where pricing and margins are dramatically higher. The exit was completed in February 2026.

**Significance:** This is the cleanest possible signal of pure-play AI-memory positioning. Crucial had been a Micron operational signature for 25+ years; killing it is a one-way commitment. It also means Micron's FY26 numbers are on a slightly *narrower* revenue base — consensus models that simply roll forward FY25 segments will overstate consumer/PC contribution.

### Customer concentration

Micron does not disclose customer concentration in its press releases, but triangulating from public sources:

- **Nvidia:** HBM3E qualified into B200/B300 platforms; HBM4 qualified for Vera Rubin per Micron's claim ([Micron IR — HBM4 Vera Rubin](https://investors.micron.com/news-releases/news-release-details/micron-high-volume-production-hbm4-designed-nvidia-vera-rubin)). However, **independent reports estimate Micron's HBM4 share for Vera Rubin is materially smaller than at HBM3E**, with the platform split estimated 70% Hynix / 30% Samsung in some sources ([Dr. Castellano](https://drrobertcastellano.substack.com/p/micron-is-locked-out-of-hbm4-in-nvidias); [wccftech](https://wccftech.com/the-memory-industry-is-at-a-turning-point-with-hbm4/)). This is the most consequential unresolved question in the bull/bear debate.
- **AMD:** HBM3E 12-high 36GB cubes are spec'd into the AMD Instinct MI350 series at 288GB total per accelerator. MI400 (2026 ramp) targets 432GB HBM4 per accelerator and Micron is in active discussion ([Trendforce, Jun 2025](https://www.trendforce.com/news/2025/06/26/news-micron-scales-up-hbm-to-four-major-gpuasic-clients-targets-24-market-share-by-year-end/)).
- **Hyperscalers (direct):** Microsoft, Google, Meta, Amazon, and Oracle all consume Micron high-cap DDR5/MRDIMM directly through CDBU, alongside the GPU/HBM channel.

**Best estimate of customer concentration**: The top 5 customers (Nvidia, AMD, Microsoft, Google, Meta) likely represent >50% of revenue in FY2Q26, with Nvidia alone in the 15–25% range. *This is a triangulation, not a disclosed figure — flag for the desk to validate against the 10-K customer-concentration footnote when the FY26 10-K lands in late 2026.*

### Manufacturing footprint

| Site | Function | Status |
|---|---|---|
| Boise, ID (HQ) | DRAM R&D, pilot lines, planned ID1 fab | ID1 first wafer output **2H 2027** ([Tom's Hardware](https://www.tomshardware.com/pc-components/dram/micron-details-new-u-s-fab-projects-idaho-fab-1-comes-online-in-2h-2027-new-york-fabs-come-later-hbm-assembly-in-the-u-s)) |
| Manassas, VA | Long-product DRAM (auto, industrial) | Operating; expansion underway |
| Clay, NY (megafab) | Future DRAM fab cluster | First fab online late decade |
| Hiroshima, Japan | DRAM and HBM | New $9.6B HBM-dedicated fab; construction begins May 2026, output ~2028 ([DCD](https://www.datacenterdynamics.com/en/news/micron-planning-96bn-hbm-fab-at-hiroshima-site-report/)) |
| Singapore | DRAM and NAND back-end, advanced packaging | HBM TSV/stacking concentration |
| Taichung, Taiwan (and acquired P5 fab) | DRAM front-end | P5 acquisition Jan 2026, output 2H 2027 ([Blocksandfiles](https://blocksandfiles.com/2026/01/19/micron-buying-taiwan-dram-fab/)) |

**Concentration risk:** Taiwan exposure remains material (estimated >40% of DRAM wafer starts) — a geopolitical overhang separate from China. The Hiroshima HBM and Idaho ID1 buildouts are strategic responses but don't materialize before 2027–2028.

---

## Section 3 — Recent Results: FY2Q26 (Quarter ended Feb 26, 2026; reported Mar 18, 2026)

### Headline P&L

| Metric | FY2Q26 | FY1Q26 | FY2Q25 | QoQ | YoY |
|---|---:|---:|---:|---:|---:|
| **Revenue** | **$23.86B** | $13.64B | $8.05B | **+75%** | **+196%** |
| **GAAP Gross Margin** | **~75%** | 56.8% | 36.8% | +18ppt | +38ppt |
| **GAAP Operating Income** | **~$16.1B** | n/d | n/d | n/m | n/m |
| **GAAP Net Income** | **$13.79B** | $5.24B | $1.58B | +163% | +773% |
| **GAAP Diluted EPS** | **$12.07** | $4.60 | $1.41 | +162% | +756% |
| **Operating Cash Flow** | **$11.90B** | $8.41B | $3.94B | +41% | +202% |
| **FCF** | record (not separately quantified) | — | — | — | — |

Sources: [Micron IR FY2Q26](https://investors.micron.com/news-releases/news-release-details/micron-technology-inc-reports-results-second-quarter-fiscal-2026); [Globenewswire 3/18/26](https://www.globenewswire.com/news-release/2026/03/18/3258579/14450/en/Micron-Technology-Inc-Reports-Results-for-the-Second-Quarter-of-Fiscal-2026.html); [Quartr Q2 FY26](https://quartr.com/events/micron-technology-inc-mu-q2-2026_3Yxg298f); [Stocktitan](https://www.stocktitan.net/news/MU/micron-technology-inc-reports-results-for-the-second-quarter-of-5oyd4rwdgqrb.html); [tech-insider](https://tech-insider.org/micron-q2-2026-earnings-ai-memory-market/).

### Segment revenue (FY2Q26)

| Segment | Revenue | % | QoQ | Color |
|---|---:|---:|---:|---|
| Cloud Memory (CMBU) | $7.7B | 32% | +47% | HBM home; record, driven by HBM3E ramp + HBM4 first-quarter shipments |
| Core Data Center (CDBU) | $5.7B | 24% | +139% | 74% gross margin; high-cap DDR5/MRDIMM hyperscaler ramp |
| Mobile & Client (MCBU) | $7.7B | 32% | +81% | Pricing-driven; bit shipments declined |
| Automotive & Embedded (AEBU) | $2.7B | 11% | +57% | Pricing-driven |

Source: [Micron IR FY2Q26](https://investors.micron.com/news-releases/news-release-details/micron-technology-inc-reports-results-second-quarter-fiscal-2026); [Stocktitan](https://www.stocktitan.net/news/MU/micron-technology-inc-reports-results-for-the-second-quarter-of-5oyd4rwdgqrb.html).

### DRAM vs NAND

| Product | FY2Q26 Revenue | % of Total | YoY |
|---|---:|---:|---:|
| DRAM | $18.8B | 79% | +207% |
| NAND | ~$5.0B | 21% | +175% (estimate) |

Source: [Micron IR FY2Q26](https://investors.micron.com/news-releases/news-release-details/micron-technology-inc-reports-results-second-quarter-fiscal-2026); FY1Q26 split was DRAM 79% / NAND 20% ([Micron IR FY1Q26](https://investors.micron.com/news-releases/news-release-details/micron-technology-inc-reports-results-first-quarter-fiscal-2026)).

### HBM revenue commentary

- HBM revenue reached ~$2B in FY4Q25 (~$8B annualized run-rate) and is "ramping above that" in FY1H26. *Micron does not separately disclose HBM revenue each quarter.*
- Combined HBM + high-cap DIMMs + LP-server DRAM hit **$10B in FY2025**, +5x YoY ([Futurum FY1Q26](https://futurumgroup.com/insights/micron-technology-q1-fy-2026-sets-records-strong-q2-outlook/)).
- Calendar 2026 HBM supply is **fully sold out under multi-year contracts** with 3–5 year price/volume agreements emerging ([Micron FY2Q26 prepared remarks](https://investors.micron.com/static-files/e089f8c0-065d-47b8-9d02-bfa863cdb357)).
- HBM TAM forecast revised upward: Micron now projects HBM TAM reaches **$100B by calendar 2028** (40% CAGR) — two years earlier than the prior forecast ([Micron IR](https://investors.micron.com/static-files/088991c5-a249-4f66-a0a6-258d9b66f3f9)).

### Read-through

The print was a clean beat-and-raise on every dimension. Three observations matter for the model:
1. **CDBU GM at 74%** — high-cap DDR5 economics are now memory-class peak, not HBM-class. This is the DDR5/HBM3E margin convergence flagged by TrendForce in late 2025.
2. **MCBU price-driven, units down** — confirms makers are de-prioritizing mobile/client for server allocation. This is a 2018-style cycle peak signal.
3. **OCF $11.9B in a single quarter** — at FY3Q26 guide of $33.5B revenue and ~81% GM, OCF could touch $18–20B in a single quarter. FCF ramps are the under-modeled driver of capital return optionality.

---

## Section 4 — Forward Estimates & Consensus

### FY3Q26 company-issued guide (Mar 18, 2026)

| Metric | Guidance | vs. FY2Q26 actual |
|---|---|---|
| Revenue | **$33.5B ± $0.75B** | +40% sequential midpoint |
| GAAP Gross Margin | **~81% ± 100bps** | +6ppt |
| Non-GAAP Diluted EPS | **$19.15 ± $0.40** | +59% (vs FY2Q26 GAAP $12.07) |

Source: [Quartr/TradingView](https://www.tradingview.com/news/urn:summary_document_report:quartr.com:3108258:0-mu-record-revenue-margins-and-eps-in-q2-2026-q3-outlook-signals-continued-strong-growth/), [Investing.com FY2Q26 transcript](https://www.investing.com/news/transcripts/earnings-call-transcript-micron-technology-q2-2026-beats-forecasts-with-strong-growth-93CH-4569498).

### Consensus snapshot — FY26 / FY27 (fiscal year ends late August)

**Important caveat:** Sell-side estimates are **moving fast** and aggregator displays may be stale. A ranking dispersion of estimates cited in public sources is shown below — *we have flagged data we believe is unreliable*.

| Period | Metric | Consensus / Range | Source / Caveat |
|---|---|---|---|
| **FY3Q26** (ending May 26) | Revenue | $33.7B–$40.9B range | [Yahoo Finance Q3 preview](https://finance.yahoo.com/markets/stocks/articles/expect-micron-technologys-q3-2026-130651343.html) |
| FY3Q26 | Company guide midpoint | $33.5B / $19.15 EPS | [Quartr](https://quartr.com/events/micron-technology-inc-mu-q2-2026_3Yxg298f) |
| **FY2026** (full year, ending Aug) | Revenue | ~$108.7B (one aggregator cited "raised from $79.8B") | [Daily Political, Apr 2026](https://www.dailypolitical.com/2026/04/08/fy2026-eps-estimate-for-micron-technology-lifted-by-analyst.html). **FLAG: this looks high vs guide trajectory; we'd model ~$95–105B based on FY1H actual + FY3Q guide + plausible FY4Q.** |
| FY2026 | EPS | $50–60 range (Wells Fargo); $57.16 (Erste) | [Erste/dailypolitical, May 2026](https://www.dailypolitical.com/2026/05/08/what-is-erste-group-banks-forecast-for-mu-fy2027-earnings.html); [247wallst, Mar 2026](https://247wallst.com/investing/2026/03/12/micron-price-prediction-one-wall-street-analyst-thinks-mu-has-16-more-upside-in-2026/) |
| FY2027 | Revenue | ~$130–200B+ range (very wide) | [Daily Political](https://www.dailypolitical.com/2026/05/08/what-is-erste-group-banks-forecast-for-mu-fy2027-earnings.html). **FLAG: dispersion suggests sell-side has not yet aligned models; some "$200B" prints look like extrapolated peak math** |
| FY2027 | EPS | ~$100 (Erste $100.45, "average" $101.48 cited) | Same source — flag treat as one analyst data point |

**A simpler internal sanity-check:** If we annualize the FY3Q26 guide ($33.5B × 4 = $134B) and assume FY4Q26 is broadly similar, FY26 revenue lands ~$95–105B. EPS arithmetic: ~$50–60 fits cleanly. For FY27 the question becomes whether sequential growth continues (bull) or normalizes (base/bear) — which is exactly the central debate in Section 7.

### Sell-side rating distribution

| Source | Coverage | Distribution | Avg PT | Range |
|---|---|---|---|---|
| **TipRanks** ([link](https://www.tipranks.com/stocks/mu/forecast)) | 30 analysts | Strong Buy consensus | **$581.89** | $400 (low) – $1,000 (high) |
| **Marketbeat** | 51 (47 Buy / 4 Hold / 0 Sell) | Strong Buy | not directly cited | similar range |

Source: [TipRanks MU](https://www.tipranks.com/stocks/mu/forecast); [Marketbeat MU](https://www.marketbeat.com/stocks/NASDAQ/MU/forecast/).

### Recent material PT moves

- **Mizuho (Vijay Rakesh, May 6, 2026):** Raised PT to **$740** from $545, maintained Outperform ([Yahoo](https://finance.yahoo.com/markets/stocks/articles/mizuho-raises-price-target-micron-101330552.html)).
- **Wells Fargo (cited 2026):** Raised PT to $470, models peak EPS $50–60 range ([24/7 Wall St](https://247wallst.com/investing/2026/03/12/micron-price-prediction-one-wall-street-analyst-thinks-mu-has-16-more-upside-in-2026/)).
- **Erste Group (May 8, 2026):** FY27 EPS estimate $100.45 (very high end of public sell-side) ([Daily Political](https://www.dailypolitical.com/2026/05/08/what-is-erste-group-banks-forecast-for-mu-fy2027-earnings.html)).
- **Seeking Alpha bull case:** "Clear path to over $1,500" ([SA, 2026](https://seekingalpha.com/article/4899989-micron-technology-i-think-there-is-a-clear-path-to-over-1500)).

**The stock has run through the consensus PT.** At $757 vs. consensus of $581.89, MU is +30% above where the average sell-side analyst thinks fair value is. This is itself a non-trivial signal: either the stock is overrunning fundamentals or the sell-side is lagging on revisions. Mizuho's mid-cycle PT update from $545 to $740 in a single move is the canary that the latter is happening — but we note that even Mizuho's $740 target essentially equals the current price.

---

## Section 5 — Historical Financials (FY23–FY25, plus partial FY26)

Micron's fiscal year ends on the **Thursday closest to August 31**. Numbers below are GAAP and pulled from press releases / aggregators with sources cited.

| Metric | FY2023 (ended Aug '23) | FY2024 (ended Aug '24) | FY2025 (ended Aug '25) | FY26 LTM (Feb '26) |
|---|---:|---:|---:|---:|
| **Revenue** | $15.54B | $25.11B | $37.38B | $58.12B |
| **YoY growth** | -50% | +62% | +49% | +86% |
| **Gross Margin (GAAP)** | -9% (negative; charges) | ~22% | ~40% | ~63% (LTM blended) |
| **Operating Margin (GAAP)** | -38% | ~6% | ~26% | n/d clean LTM |
| **Net Income (GAAP)** | **-$5.83B** | **$778M** | ~$8.5B (estimated)¹ | **$24.11B** |
| **Net Margin** | -38% | 3.1% | ~23% | ~41% |
| **Diluted EPS (GAAP)** | -$5.34 | $0.70 | ~$7.50 (estimated)¹ | n/d clean LTM |
| **EBITDA** | ~$1.5B | ~$8.6B | ~$17B | ~$37B (per primer) |
| **Operating Cash Flow** | $1.56B | $8.51B | n/d clean | $11.9B (Q2 alone) |
| **Capex (net)** | ~$7.0B | ~$8.1B | $13.80B | n/a |
| **FCF (adjusted)** | -$5.4B (negative) | -$0.4B | $3.72B | rapidly +ve, ramping |
| **Dividend per share (annual)** | $0.46 | $0.46 | $0.46 → $0.60 hike | $0.60 |

Sources: [Stocktitan FY24](https://www.stocktitan.net/news/MU/micron-technology-inc-reports-results-for-the-fourth-quarter-and-p1p84vp5xra8.html); [Globenewswire FY24](https://www.globenewswire.com/news-release/2024/09/25/2953357/14450/en/Micron-Technology-Inc-Reports-Results-for-the-Fourth-Quarter-and-Full-Year-of-Fiscal-2024.html); [Micron IR FY25](https://investors.micron.com/news-releases/news-release-details/micron-technology-inc-reports-results-fourth-quarter-and-full-8); [The Register FY23](https://www.theregister.com/2023/09/28/micron_revenue_halved_in_fy23/); [Macrotrends](https://www.macrotrends.net/stocks/charts/MU/micron-technology/revenue); [Stockanalysis MU statistics (LTM)](https://stockanalysis.com/stocks/mu/statistics/); [Financecharts](https://www.financecharts.com/stocks/MU/value/pe-ratio).

¹ *FY25 GAAP net income figure flagged as estimate.* FY25 Q4 standalone GAAP NI was $3.20B ([Micron IR](https://investors.micron.com/news-releases/news-release-details/micron-technology-inc-reports-results-fourth-quarter-and-full-8)) and FY25 Q1 GAAP NI was $1.87B per [GuruFocus](https://www.gurufocus.com/news/2636133/micron-technology-inc-mu-q1-fy2025-earnings-eps-of-179-beats-estimates-revenue-at-871-billion-slightly-misses-expectations); summing four quarters yields ~$8.5B, but the full-year GAAP figure should be confirmed against the FY25 10-K which we could not retrieve from the IR site directly in this session. *Flag for desk validation.*

### What the historical table tells the PM

1. **The cyclicality is severe.** Net income swung from -$5.83B (FY23) to ~+$8.5B (FY25) to a $24.1B LTM run-rate in 18 months. This is NOT a steady compounder; it is a leveraged cyclical with a structural mix shift overlaid.
2. **FCF generation is recent.** FY25 was the first full year of meaningful positive FCF since the prior peak. The FY26 setup — with capex stepping up to >$25B but OCF likely $40B+ — is the first time MU has been in a true FCF "shower" while also growing the business.
3. **EPS arithmetic for "8x P/E."** TTM EPS at ~$22 (Stockanalysis trailing P/E of 35.13 × $757 ÷ 1.13B shares) implies a TTM EPS in the $22–25 range. Forward at $50–60 implies 12.6x → 15x → ~ 8x rolling forward. **The 8x forward P/E uses next-12-month earnings, where each quarter will be close to or above peak — this is structurally what makes the multiple look so cheap.**
4. **Capital return:** Dividend was raised in FY26; share repurchases have been muted. With OCF inflecting to $40B+ in FY26, capital-return optionality (buyback or dividend acceleration) is meaningful — not yet announced.

---

## Section 6 — Valuation

### Trading multiples — current (as of May 10, 2026)

| Metric | MU Current | Comment / Source |
|---|---|---|
| **Stock price** | ~$757 | [Stockanalysis MU](https://stockanalysis.com/stocks/mu/) |
| **Market cap** | **~$842B** | 1.13B shares × $757 ([CompaniesMarketCap](https://companiesmarketcap.com/micron-technology/marketcap/)) |
| **Enterprise value** | ~$845B (small net debt position) | Estimated; net debt ~$3B per Q2 FY26 commentary |
| **Shares outstanding** | ~1.13B (diluted) | [CompaniesMarketCap](https://companiesmarketcap.com/micron-technology/marketcap/) |
| **P/E (TTM)** | **~35x** | [Stockanalysis](https://stockanalysis.com/stocks/mu/statistics/), [Macrotrends](https://www.macrotrends.net/stocks/charts/MU/micron-technology/pe-ratio) |
| **Forward P/E (FY26 cons)** | **~8.1x** at $93/sh EPS or **~7.5x** at $100 EPS | [GuruFocus 7.55x](https://www.gurufocus.com/term/forward-pe-ratio/MU); [Stockanalysis 8.11x](https://stockanalysis.com/stocks/mu/statistics/) |
| **Forward P/E on FY3Q26 annualized guide** | $19.15 × 4 = $76.60 → **~9.9x** | derived from [Quartr](https://quartr.com/events/micron-technology-inc-mu-q2-2026_3Yxg298f) |
| **EV/EBITDA (LTM)** | **~22.7x** | [Stockanalysis](https://stockanalysis.com/stocks/mu/statistics/) |
| **EV/EBITDA (NTM)** | ~12–13x estimate | derived (EBITDA ramping ~75–85% of revenue in peak quarters) |
| **P/Sales (TTM)** | ~14.5x | $842B mkt cap / $58.1B LTM revenue |
| **P/Book** | n/d clean | flag for desk |
| **ROE (TTM)** | **39.8%** | [Stockanalysis](https://stockanalysis.com/stocks/mu/statistics/) |
| **PEG ratio** | 0.06 | [Stockanalysis](https://stockanalysis.com/stocks/mu/statistics/) — distorted by peak EPS growth |
| **Beta** | n/d | flag |

### Where multiples sit vs. history

- **EV/EBITDA**: 13-yr range low **1.71x**, high **69.36x**, median **6.72x** ([GuruFocus](https://www.gurufocus.com/term/enterprise-value-to-ebitda/MU)). LTM 22.7x is **+238% above 10-yr median**. This is the most stretched MU has ever been on EV/EBITDA outside of cyclical-trough EBITDA distortions.
- **Forward P/E 7.5–8.1x**: This is structurally LOW relative to the 12–18x mid-cycle multiple MU usually trades at. The reason: it uses peak-margin EPS. Trough P/E (when MU is loss-making) is meaningless; peak-margin P/E always looks cheap because the market is discounting normalization.
- **P/B**: We could not source cleanly; flag for desk.

### Relative to memory peers

| Name | Forward P/E | EV/EBITDA | Comment |
|---|---:|---:|---|
| **Micron (MU)** | **7.5–8.1x** | 22.7x LTM | Pure-play; sold-out 2026 LTAs |
| **SK Hynix** | **5.9x** | 7.4x LTM | HBM incumbent; 72% OP margin |
| **Samsung (group)** | ~14x | ~7.7x LTM | Conglomerate discount |

Source: primer Section 4-5 in `server-memory-04-cycle-valuation.md`; [GuruFocus](https://www.gurufocus.com/term/forward-pe-ratio/MU).

**Read:** SK Hynix is cheaper than MU on both forward P/E and EV/EBITDA, with the better HBM share. Samsung is cheaper on EV/EBITDA only, with conglomerate baggage. MU's value proposition is purity + US-listing — that earns ~2x of forward P/E premium to Hynix in a normal market, and that's roughly what we see today.

### Trough / Base / Bull scenario fair value

We re-derive fair value off **FY27E or FY28E** rather than NTM, because the 8x forward P/E *only* makes sense if FY27 earnings hold; the central question is FY28 normalization.

**Build assumptions:**
- Current shares outstanding: ~1.13B
- Net debt: ~$3B (treat as zero for round numbers)
- FY26E revenue: ~$100B; FY26E EBITDA ~$70B (70% margin midpoint of FY1H actual + FY3Q guide)
- FY27E revenue: ~$120B (super-cycle continues, +20% on FY26)
- FY27E EBITDA: ~$80B (67% margin — modest compression)
- FY28E mid-cycle revenue: ~$80B (unwind to mid-cycle if HBM holds but commodity DRAM normalizes)
- FY28E mid-cycle EBITDA: ~$32–38B (40–48% margin, mid-cycle)

| Scenario | Driver | EV/EBITDA Multiple | EBITDA Used | EV ($B) | Implied Equity / Share |
|---|---|---:|---:|---:|---:|
| **Trough** | Cycle rolls 2H27; FY28 mid-cycle | **5.5x** (trough multiple, applied to mid-cycle EBITDA) | $35B (FY28 mid-cycle) | $193 | **~$170** |
| **Trough (less severe)** | Cycle softens but HBM holds | **7.0x** | $40B | $280 | **~$245** |
| **Base** | Super-cycle holds through FY27; FY28 mid-cycle | **10x on FY27** | $70B (FY27E) | $700 | **~$615** |
| **Base (alt)** | Super-cycle holds; structural pure-play premium | **10x on FY27 EBITDA** | $80B (FY27 incl HBM mix) | $800 | **~$705** |
| **Bull** | HBM4/HBM4E sustains structural moat through FY28 | **12x** | $80B (FY27E) | $960 | **~$845** |
| **Bull (super)** | "AI is different, multiples rerate" | **14x** | $80B | $1,120 | **~$990** |

**Probability-weighted FV (our weights — desk should debate these):**
- Trough (less severe): 25% × $245 = $61
- Base: 45% × $660 = $297
- Bull: 25% × $920 = $230
- Bull (super): 5% × $990 = $50
- **Probability-weighted fair value ≈ $640**

Stock at $757 is therefore **~+18% above probability-weighted fair value** — but well within the base-case range. **Not expensive enough to short, not cheap enough to be a full-position long.** The trade is sized around catalyst-driven re-pricing, not absolute mispricing.

### Reconciling against the 8x forward P/E narrative

A simpler "if FY27 EPS prints $90, what's a fair multiple" lens:
- $90 × 10x (mid-cycle for cyclical-with-structural-upgrade) = **$900**
- $90 × 8x (cyclical-only, peak-margin) = **$720**
- $90 × 6x (full cyclical fade, peak earnings) = **$540**

This brackets the same range. The PM should think of the bull case as "FY27 prints, multiple stays at 8–9x" → ~$750 (current). The bear case is "FY27 misses or FY28 normalizes hard, multiple compresses to 6x" → ~$540 (which is roughly the consensus PT of $581).

**Conclusion of the valuation work: the stock at $757 is fairly valued for its base case but carries asymmetric risk into a trough scenario. The right way to play it is starter long with a clear stop at FY3Q26 print or any HBM4 negative datapoint.**

---

## Section 7 — Cyclicality & The Central Debate

This is the heart of the note for a PM.

### Why the market is debating an 8x forward P/E

The optical "cheapness" of 8x P/E is the loudest investor-relations headline at Micron right now. It is the single number repeated in every bullish broker note. **It is also misleading**, and understanding why is the actual analytical exercise.

**Forward P/E uses NTM (next 12 months) earnings.** Micron's next 12 months span FY3Q26 through FY2Q27 — every quarter of which will be close to or above peak-margin levels under the current LTA structure. The 8x P/E is therefore "8x peak EPS." Every cyclical name in history has traded at single-digit P/E at the cycle peak, because the market is implicitly pricing earnings normalization.

In 2018, Micron traded at 4–6x forward P/E at the prior cycle peak, and the stock fell 60% over the next 18 months as DRAM prices rolled. **The forward-P/E framing is a feature of cycles, not a bug — and not, by itself, a buy signal.**

### The bull case for "this time is different"

Four pillars (paraphrasing Sections 5–6 of the primer):

1. **HBM physics breaks normal cyclicality.** HBM requires CoWoS at TSMC (2-yr lead time on advanced packaging), TSV equipment from AMAT/Lam (long delivery), and hybrid bonding from Besi (single-supplier monopoly with 12–18 month lead times). These bottlenecks are physical and multi-year — not solvable by a 6-month wafer-start cut.
2. **Demand is a step-change, not a cycle.** Hyperscaler capex went from $430B (CY25) to ~$775B (CY26E) — a +80% step, driven by AI infrastructure not consumer electronics. Microsoft's CFO attributed **$25B of its $190B 2026 capex to memory inflation** specifically — memory is now a named line item in hyperscaler P&L ([Tom's Hardware](https://www.tomshardware.com/tech-industry/big-tech/microsoft-attributed-25-billion-of-its-record-ai-budget-to-memory-chip-costs)).
3. **Inventory is at all-time lows.** SK Hynix DRAM inventory is at **2–3 weeks** vs. a 31-week peak in 1Q23 ([TechInsights](https://www.techinsights.com/blog/memory-market-outlook-ai-demand-and-tight-supply-drive-resurgence)). LTAs of 3–5 years are being negotiated (against industry historical norm of 1-quarter contracts). Demand visibility extends years out, not quarters.
4. **Three-player oligopoly is behaving rationally.** No major share-grab; capacity additions are HBM-skewed and lag-loaded. Even Samsung's 50% HBM expansion takes until 4Q26 to be fully online.

### The bear case for "value trap"

Four pillars (also paraphrasing the primer):

1. **Capacity expansions are real and large.** Samsung +50% HBM (170k → 250k wafers/mo). SK Hynix doubling DRAM wafer input to 600k/mo in 2H26 — the biggest single capacity bet in industry history. Micron capex >$25B (+25% YoY). These are textbook late-cycle moves.
2. **70%+ operating margins always revert.** SK Hynix at 72% OP margin in 1Q26 is not a steady state — it is the *peak*. The 2018 peak was ~50% OP margin, and within 12 months SK Hynix was at 8% OP margin. Micron at FY3Q26 guide ~75%+ GM is more extreme than 2018. *We have never seen these margins hold for more than 4–6 quarters.*
3. **HBM gluts have happened before** — HBM2e in 2019, HBM3 briefly in 2022. The supply-demand math for HBM4 in 2027 (with all three players competing on yield, all expanding capacity, all priced into Nvidia/AMD/ASIC platforms) does not look obviously different from prior cycles.
4. **The Vera Rubin HBM4 question.** Multiple sources report Micron has been **excluded or significantly under-allocated** at Nvidia HBM4 for the Vera Rubin platform, with split estimated 70% Hynix / 30% Samsung ([Dr. Castellano](https://drrobertcastellano.substack.com/p/micron-is-locked-out-of-hbm4-in-nvidias); [wccftech](https://wccftech.com/the-memory-industry-is-at-a-turning-point-with-hbm4/)). Micron's own announcement claims volume HBM4 production for Vera Rubin ([Micron IR](https://investors.micron.com/news-releases/news-release-details/micron-high-volume-production-hbm4-designed-nvidia-vera-rubin)) — **both can't be right.** If Micron is materially under-allocated at Nvidia for HBM4 (the highest-margin product through 2027), the FY27 EPS bull case has a meaningful air pocket.

### Mid-cycle EPS — what is actually defensible?

This is the math the PM needs to walk through. **Mid-cycle EPS for Micron is the single-most-disputed number in the bull/bear debate.**

**Bull-side derivation:**
- HBM mix becomes ~50% of DRAM gross margin by 2028 (per Mark Webb, [FMS 2025](https://files.futurememorystorage.com/proceedings/2025/20250807_DRAM-302-1-WEBB.pdf))
- Even if commodity DRAM ASPs cut in half from peak, HBM/high-cap product holds 50%+ GM
- Blended GM mid-cycle: ~50% (vs. peak 75–80% and trough <0%)
- FY28 revenue ~$80B (down from $120B FY27 peak)
- FY28 GM at 50% = $40B gross profit
- FY28 OPEX ~$8B
- FY28 OP income ~$32B
- FY28 net income ~$25B
- FY28 EPS ~$22
- At 12x mid-cycle multiple: ~$265/sh — **which is below current price**.

**Bear-side derivation:**
- Same setup, but commodity DRAM ASP rolls 50% (not 25%) and HBM faces price pressure as Samsung HBM4 yields ramp from 60% → 85% in late 2026
- FY28 revenue $65B
- FY28 GM at 38% = $25B
- FY28 OP income ~$15B
- FY28 net income ~$11B
- FY28 EPS ~$10
- At 8x cyclical multiple: ~$80/sh — **stock has 90% downside in this case**.

**The honest answer:** mid-cycle EPS is somewhere between $10 and $22, and where it lands depends almost entirely on (a) HBM4 share at Nvidia and (b) commodity DRAM ASP trajectory through 2028. Public data does not currently let us pin either with confidence.

### Why the sell-side disagrees so much ($400 to $1,000 PT range)

The $600 spread (~$400 low / $1,000 high) corresponds almost exactly to the trough/bull spread in Section 6. The bear analysts are using FY28 normalized EBITDA at 6x (~$310 implied) and the bull analysts are using FY27 peak EBITDA at 14x (~$1,000+). These are not differing forecasts of FY26 — they are differing assumptions about which year's earnings to multiply, and what multiple to apply. The "8x P/E" itself is not a debated number; it's the *appropriate denominator and multiple* that bulls and bears disagree on.

---

## Section 8 — Catalyst Calendar (next 6–12 months)

| Date | Event | Why it matters |
|---|---|---|
| **May 20, 2026** | **Nvidia FQ1 2027 earnings (CY1Q26)** | Confirms hyperscaler GPU/HBM demand pull. Source: [WallStreetZen NVDA](https://www.wallstreetzen.com/stocks/us/nasdaq/nvda/earnings). MU will track. |
| Late May 2026 | TrendForce 2Q26 contract pricing data | Confirms +58–63% QoQ DRAM contract price move flagged in the primer |
| **June 24, 2026** | **Micron FY3Q26 earnings** (after market) | Tests $33.5B / $19.15 EPS guide; FY4Q guide; FY27 commentary | Source: [Marketbeat MU earnings](https://www.marketbeat.com/stocks/NASDAQ/MU/earnings/) |
| Mid-2026 | HBM4 yield prints (Samsung 60% → 85% target, SK Hynix HBM4 ramp 3Q26) | Yield ramps would compress HBM3E ASPs faster |
| **August 2026** | NVDA FQ2 2027 earnings | Hyperscaler capex re-confirm; Vera Rubin HBM4 supplier disclosure (if any) |
| **Late September 2026** | **Micron FY4Q26 earnings** (typically ~Sep 25) | Full-year FY26 print + first FY27 commentary; **the next high-conviction directional read** |
| Q4 2026 | HBM4E sampling | Indicates next-cycle competitive position |
| Throughout 2026 | China memory exposure / export-control updates | Geopolitical event-risk; Micron has direct China revenue exposure |
| Throughout 2026 | DDR4 ASP trajectory (already softening in spot per Apr–May 2026 TrendForce) | First crack of cycle — DDR4 spot weakness was the tell in 2018 cycle |

Source for primary memory-cycle catalyst dates: cross-referenced from primer Section 5 ([server-memory-04-cycle-valuation.md](server-memory-04-cycle-valuation.md)) and [Marketbeat MU](https://www.marketbeat.com/stocks/NASDAQ/MU/earnings/), [WallStreetHorizon NVDA](https://www.wallstreethorizon.com/nvidia-earnings-calendar).

**The critical date for sizing:** **June 24, 2026 (FY3Q26 print).** A clean beat on the $33.5B guide AND constructive FY4Q commentary AND any positive HBM4-Vera-Rubin update would justify scaling the position from starter to half. A miss or any negative HBM4 commentary would justify exiting.

---

## Section 9 — Risks & What Would Make Us Wrong

### What would make us *more* wrong (further upside risk on the long)

1. **HBM4 wins vs. expectations.** If Micron clarifies it has a meaningful HBM4 share at Vera Rubin (>15%), the fwd P/E re-rates to 10–12x and the stock has 25–50% upside.
2. **HBM TAM revision.** Micron's $100B HBM TAM by 2028 is the most aggressive forecast on the Street. If it proves correct, FY27/28 numbers run far ahead of consensus.
3. **Capital return acceleration.** With FY26 OCF likely $40B+, a $20–30B buyback announcement at the FY4Q26 print could be a meaningful catalyst.

### What would make us wrong (downside risk to the long)

1. **Cycle peak in FY27.** Sequential DRAM ASP roll begins in 2H27 (Hynix's own internal models reportedly assume 2027 oversupply per [Memory Supercycle](https://medium.com/@Elongated_musk/memory-supercycle-how-ais-hbm-hunger-is-squeezing-dram-and-what-to-own-79c316f89586)). EPS could halve in FY28.
2. **HBM4 Vera Rubin under-allocation.** If the 70/30 Hynix/Samsung split for Vera Rubin holds and Micron is meaningfully smaller on HBM4 than HBM3E, FY27 HBM revenue is at risk.
3. **Hyperscaler capex pause.** Microsoft, Meta, Amazon all have $100B+ capex run-rates; any one signaling a pause (return-on-capex pressure in 2H26) compresses every memory name.
4. **China exposure.** Micron has direct China revenue exposure (~5–10% of revenue, smaller post-Crucial). Export control escalation is a tail risk.
5. **DDR5 ASP rollover.** Already starting at the spot level in DDR4 ([DigiTimes](https://www.digitimes.com/news/a20260504PD215/china-ddr4-nand-dram-demand-2026.html)). DDR5 spot rollover would be the canonical late-cycle tell.
6. **Customer concentration (Nvidia).** Nvidia at ~15–25% of revenue (estimated) means any HBM allocation shift moves the needle. The HBM4 question is exhibit A.
7. **Margin sustainability.** 75–81% gross margin is unprecedented; even modest reversion (to 60%) cuts EPS by ~30%.

### Risk-management framework

For a generalist PM, sizing should follow:
- **Starter (1.0–1.5% NAV)**: Take it now at $757
- **Half (2.5–3.0% NAV)**: Add on a clean FY3Q26 beat (June 24) AND positive HBM4 datapoints
- **Full (4.0–5.0% NAV)**: Add at FY4Q26 (late Sep) only if FY27 commentary is constructive AND DDR5 spot pricing hasn't rolled
- **Stop**: Trim hard at any HBM4-Nvidia exclusion confirmation or DDR5 spot price decline of >10% sustained over 2 months.

---

## Section 10 — Recommendation Summary

**BUY — starter position (1.0–1.5% NAV).** This is a high-quality, US-listed pure-play on the AI memory super-cycle with a multi-year LTA structure that the market has not historically seen at memory makers. The forward P/E of ~7.5–8.1x is optically cheap but uses peak earnings; on probability-weighted fair value of ~$640, the stock at $757 is roughly +18% rich to a fair midpoint and within the base-case range.

**Why not full size:** The single most consequential question — Micron's HBM4 share at Nvidia Vera Rubin — has conflicting public signals. The FY3Q26 print on **June 24, 2026** is the next high-conviction read; the FY4Q26 print in **late September 2026** is the directional signal for FY27.

**Sizing call:**
| Action | Size | Trigger |
|---|---|---|
| **Take now** | 1.0–1.5% NAV | Initial position |
| **Scale up to half** | 2.5–3.0% NAV | Clean FY3Q26 beat + positive HBM4-Vera-Rubin clarification |
| **Scale up to full** | 4.0–5.0% NAV | FY4Q26 confirms FY27 trajectory |
| **Trim** | back to starter or zero | Any HBM4 exclusion confirmation, DDR5 spot rollover, or hyperscaler capex pause signal |

**Conviction: Medium.** Higher than "passing" because the structural HBM tailwind, LTA contract structure, and FY3Q26 guide all support the bull setup; lower than "high conviction" because (a) the stock has run through consensus PT, (b) the HBM4 share question is unresolved, and (c) cyclical names always trade at single-digit P/E at the peak.

**Pair-trade alternative (for risk-managed exposure):** Long MU / Short Samsung memory (via 005930 KS or proxy) captures the AI-pure-play thesis stripped of conglomerate drag. This was identified in the sector primer as the cleanest expression. We would size this 1:1 nominal.

---

## Data Gaps & Caveats Flagged

The following items could not be sourced cleanly within this session and should be validated by the desk before any sizing decision:

1. **FY25 full-year GAAP net income** — quarterly sum yields ~$8.5B; need 10-K confirmation.
2. **Customer concentration breakdown** — top-5 customer % of revenue not disclosed quarterly; available in 10-K customer-concentration footnote.
3. **5-year clean EV/Sales and P/B history** — aggregator displays partial data; full series requires Bloomberg/CapIQ.
4. **Forward FY26 / FY27 / FY28 consensus (clean)** — aggregator estimates show wide dispersion ($79.8B → $108.7B for FY26 revenue) suggesting some sources have not been updated post-FY2Q26 print. Use IBES.
5. **HBM4 Nvidia Vera Rubin allocation** — public data is contradictory: Micron claims volume production for Vera Rubin; Substack/wccftech sources allege exclusion. Resolution requires either Micron disclosure or Nvidia GTC/keynote commentary.
6. **Net debt and exact share count** — used $3B / 1.13B share approximations; exact figures in FY2Q26 10-Q (not retrieved this session).
7. **Beta and P/B** — flagged.
8. **Mid-cycle margin** — heavily inferred; SK Hynix and Micron have never operated at sustained 50%+ blended GM, so any "mid-cycle" estimate is structurally extrapolated.
9. **The FY27 EPS estimate of $100/share** (Erste) is a single-analyst data point, not a clean consensus. Treat as bull-end of distribution.

---

## Source Index

### Primary IR documents
- [Micron — FY2Q26 Press Release (Mar 18, 2026)](https://investors.micron.com/news-releases/news-release-details/micron-technology-inc-reports-results-second-quarter-fiscal-2026)
- [Micron — FY2Q26 Prepared Remarks](https://investors.micron.com/static-files/e089f8c0-065d-47b8-9d02-bfa863cdb357)
- [Micron — FY1Q26 Press Release (Dec 17, 2025)](https://investors.micron.com/news-releases/news-release-details/micron-technology-inc-reports-results-first-quarter-fiscal-2026)
- [Micron — FY1Q26 Prepared Remarks](https://investors.micron.com/static-files/088991c5-a249-4f66-a0a6-258d9b66f3f9)
- [Micron — FY4Q25/FY25 Full-Year Results](https://investors.micron.com/news-releases/news-release-details/micron-technology-inc-reports-results-fourth-quarter-and-full-8)
- [Micron — FY24 Full-Year Results](https://www.globenewswire.com/news-release/2024/09/25/2953357/14450/en/Micron-Technology-Inc-Reports-Results-for-the-Fourth-Quarter-and-Full-Year-of-Fiscal-2024.html)
- [Micron — Crucial Consumer Exit](https://investors.micron.com/news-releases/news-release-details/micron-announces-exit-crucial-consumer-business)
- [Micron — HBM4 Volume Production for Vera Rubin (announcement)](https://investors.micron.com/news-releases/news-release-details/micron-high-volume-production-hbm4-designed-nvidia-vera-rubin)
- [Micron — Locations](https://www.micron.com/about/locations)

### Aggregators and financial databases
- [Stockanalysis.com — MU Statistics](https://stockanalysis.com/stocks/mu/statistics/)
- [Stockanalysis.com — MU Forecast](https://stockanalysis.com/stocks/mu/forecast/)
- [Stockanalysis.com — MU Financials](https://stockanalysis.com/stocks/mu/financials/)
- [GuruFocus — MU Forward P/E](https://www.gurufocus.com/term/forward-pe-ratio/MU)
- [GuruFocus — MU EV/EBITDA](https://www.gurufocus.com/term/enterprise-value-to-ebitda/MU)
- [Macrotrends — MU Revenue 2012–2026](https://www.macrotrends.net/stocks/charts/MU/micron-technology/revenue)
- [Macrotrends — MU P/E History](https://www.macrotrends.net/stocks/charts/MU/micron-technology/pe-ratio)
- [CompaniesMarketCap — MU](https://companiesmarketcap.com/micron-technology/marketcap/)
- [Financecharts — MU P/E](https://www.financecharts.com/stocks/MU/value/pe-ratio)
- [TipRanks — MU Forecast](https://www.tipranks.com/stocks/mu/forecast)
- [Marketbeat — MU Forecast](https://www.marketbeat.com/stocks/NASDAQ/MU/forecast/)
- [Marketbeat — MU Earnings](https://www.marketbeat.com/stocks/NASDAQ/MU/earnings/)
- [Yahoo — Mizuho Raises MU PT to $740 (May 6, 2026)](https://finance.yahoo.com/markets/stocks/articles/mizuho-raises-price-target-micron-101330552.html)

### News & analysis
- [CNBC — Micron Q2 2026 Earnings (Mar 18, 2026)](https://www.cnbc.com/2026/03/18/micron-mu-q2-earnings-report-2026.html)
- [Stocktitan — Micron FY2Q26 Summary](https://www.stocktitan.net/news/MU/micron-technology-inc-reports-results-for-the-second-quarter-of-5oyd4rwdgqrb.html)
- [Quartr — Micron Q2 2026](https://quartr.com/events/micron-technology-inc-mu-q2-2026_3Yxg298f)
- [Investing.com — Q2 FY26 transcript](https://www.investing.com/news/transcripts/earnings-call-transcript-micron-technology-q2-2026-beats-forecasts-with-strong-growth-93CH-4569498)
- [Tech-Insider — Micron Q2 2026 Analysis](https://tech-insider.org/micron-q2-2026-earnings-ai-memory-market/)
- [The Register — Micron FY23 Revenue Halved](https://www.theregister.com/2023/09/28/micron_revenue_halved_in_fy23/)
- [Futurum — Q1 FY26 Sets Records](https://futurumgroup.com/insights/micron-technology-q1-fy-2026-sets-records-strong-q2-outlook/)
- [Futurum — Q2 FY26 AI Memory Demand](https://futurumgroup.com/insights/micron-q2-fy-2026-earnings-driven-by-ai-led-memory-demand/)
- [TrendForce — Micron Capex Hike $20B+ HBM Sold Out](https://www.trendforce.com/news/2025/12/18/news-micron-hikes-capex-to-20b-with-2026-hbm-supply-fully-booked-hbm4-ramps-2q26/)
- [TrendForce — Micron HBM 24% target](https://www.trendforce.com/news/2025/06/26/news-micron-scales-up-hbm-to-four-major-gpuasic-clients-targets-24-market-share-by-year-end/)
- [Tom's Hardware — Micron Idaho ID1 2H27, Hiroshima HBM](https://www.tomshardware.com/pc-components/dram/micron-details-new-u-s-fab-projects-idaho-fab-1-comes-online-in-2h-2027-new-york-fabs-come-later-hbm-assembly-in-the-u-s)
- [DCD — Micron Hiroshima $9.6B](https://www.datacenterdynamics.com/en/news/micron-planning-96bn-hbm-fab-at-hiroshima-site-report/)
- [Blocksandfiles — Micron Buying Taiwan P5](https://blocksandfiles.com/2026/01/19/micron-buying-taiwan-dram-fab/)
- [DigiTimes — Micron HBM4 design (denial of redesign)](https://www.digitimes.com/news/a20251124PD213/micron-hbm4-design-nvidia-2026.html)
- [Dr. Robert Castellano (Substack) — Micron Locked Out of HBM4 Vera Rubin (bear)](https://drrobertcastellano.substack.com/p/micron-is-locked-out-of-hbm4-in-nvidias)
- [wccftech — HBM4 Tilts to Samsung/SK Hynix](https://wccftech.com/the-memory-industry-is-at-a-turning-point-with-hbm4/)
- [Seeking Alpha — Micron $1500 bull case](https://seekingalpha.com/article/4899989-micron-technology-i-think-there-is-a-clear-path-to-over-1500)
- [24/7 Wall St — MU 16% Upside](https://247wallst.com/investing/2026/03/12/micron-price-prediction-one-wall-street-analyst-thinks-mu-has-16-more-upside-in-2026/)
- [GuruFocus — Micron Q1 FY25 EPS $1.79](https://www.gurufocus.com/news/2636133/micron-technology-inc-mu-q1-fy2025-earnings-eps-of-179-beats-estimates-revenue-at-871-billion-slightly-misses-expectations)

### Sector context (from primer files)
- [server-memory-00-primer.md](server-memory-00-primer.md)
- [server-memory-01-demand.md](server-memory-01-demand.md)
- [server-memory-02-makers.md](server-memory-02-makers.md)
- [server-memory-03-controllers-cxl.md](server-memory-03-controllers-cxl.md)
- [server-memory-04-cycle-valuation.md](server-memory-04-cycle-valuation.md)

### Other primer-cited (used for context)
- [TechInsights — Memory market outlook (inventory data)](https://www.techinsights.com/blog/memory-market-outlook-ai-demand-and-tight-supply-drive-resurgence)
- [Tom's Hardware — Microsoft $25B memory inflation](https://www.tomshardware.com/tech-industry/big-tech/microsoft-attributed-25-billion-of-its-record-ai-budget-to-memory-chip-costs)
- [Mark Webb / FMS 2025 — HBM economics](https://files.futurememorystorage.com/proceedings/2025/20250807_DRAM-302-1-WEBB.pdf)
- [DigiTimes — China DDR4 weakening](https://www.digitimes.com/news/a20260504PD215/china-ddr4-nand-dram-demand-2026.html)
- [WallStreetZen — NVDA earnings May 20 2026](https://www.wallstreetzen.com/stocks/us/nasdaq/nvda/earnings)
