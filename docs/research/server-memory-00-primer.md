# Server Memory Sector Primer

**Date:** May 10, 2026
**Compiled from:** 4 parallel research lanes (`server-memory-01-demand`, `02-makers`, `03-controllers-cxl`, `04-cycle-valuation`)
**Sources:** All cited inline in lane reports; pulled from public IR releases, 10-Ks/10-Qs, TrendForce, BofA, FMS, news wires May 8–10, 2026.

---

## 1. The One-Paragraph Story

Server memory is in the deepest super-cycle in the industry's history. Total DRAM revenue went from $90.7B (2024) to ~$165B (2026E) — driven by ASP, not bits. HBM alone is ~$54.6B in 2026 and is structurally sold out at all three majors through year-end, with 2027 allocations being negotiated under multi-year LTAs. SK Hynix posted a **72% group operating margin in 1Q26** — materially above the 2018 peak (~50%) — and Samsung's DS Division hit **65.7% OP margin**. Micron's FY3Q26 guide is **$33.5B revenue / 81% gross margin / $19.15 EPS**, blowing through every street estimate. The decisive question is duration: bulls argue HBM's physical bottlenecks (CoWoS at TSMC, hybrid bonding at Besi, TSV at Lam/AMAT) make this a multi-year structural shift; bears point to Samsung +50% HBM, Hynix doubling DRAM wafers in 2H26, and Micron +23% capex as textbook late-cycle behavior. We are likely in the **8th–9th inning of generic DRAM tightness, but only the 5th–6th inning of HBM tightness** given longer lead times for hybrid-bonding capacity. The single most underappreciated datapoint: Microsoft's CFO attributed **$25B of its $190B CY26 capex line directly to memory chip price increases** — memory inflation is now a named line item in hyperscaler P&Ls.

---

## 2. Demand Map

| Driver | 2024A | 2026E | Comment |
|---|---:|---:|---|
| Total DRAM revenue | $90.7B | ~$165B | ASP is the lever; bit growth ~20% |
| HBM revenue | $17B | $54.6B (+58% YoY) | BofA estimate via Astute Group |
| HBM as % DRAM revenue | ~19% | ~33% | Plateau — but ~50% of industry margin by 2028 |
| HBM as % DRAM gross margin | — | heading to 50% by 2028 | Mark Webb / FMS 2025 |
| DDR5 server bit share | ~40% | ~95% | DDR4 force-deprecated; DDR4 spot +100% in late '25 |
| AI server DDR5 content | — | ~3 TB | vs <1 TB on a general-purpose server |
| AI accelerator HBM (avg) | ~80 GB (H100) | 288–432 GB (B300/MI400) | **5.4x growth in 3 years per chip** |
| Big-5 hyperscaler capex | $430B (2025A) | **$775B (+80% YoY)** | MSFT $190B, AMZN $200B, GOOGL $175–185B, META $125–145B, ORCL ~$50B FY26 |

**The anomaly to remember:** TrendForce reports DDR5 wafer profitability briefly **surpasses HBM3E starting 1Q26** — DDR5 contract prices spiked faster and HBM3E pricing was disciplined. HBM4 reopens the gap in H2 2026.

---

## 3. The Big 3 Memory Makers — Side by Side

| | SK Hynix (000660) | Samsung (005930) | Micron (MU) |
|---|---|---|---|
| Latest qtr | 1Q26 (Apr 22) | 1Q26 (Apr 30) | FY2Q26 (Mar 18) |
| Revenue | ₩52.6T (~$36B) | ₩133.9T group / Mem ~$51B | $23.86B (+196% YoY) |
| OP margin | **72%** group | **65.7%** DS | ~63% (75% GM) |
| HBM share (Q3'25 last clean) | ~57–59% | ~22% (rising to 30%+) | ~21% |
| HBM4 Nvidia allocation | **~⅔** | >30% target | designed-in |
| 2026 capex | ~$20.5B | ~$20B (mem) / ~$40B (semi) | **>$25B** |
| Forward P/E | **~5.9x** | ~14x blended | **~8.1x** |
| 1-yr stock perf | **+768%** | +387% | ~+500% |
| Pure-play? | Strong second (NAND ~21%) | No (group co.) | **Yes** (Crucial exit Feb '26) |
| Mkt cap | ~$817B | ~$1.05T (crossed $1T May 6) | ~$842B |

**Who's winning:** Hynix on margin, HBM moat, and HBM4 incumbency. Micron on purity, capital-efficiency, and contract structure (sold out 2026 under 3–5 year LTAs). Samsung is the catch-up story that's working but from behind — the 18-month HBM3E delay cost them the Blackwell cycle entirely.

---

## 4. Picks-and-Shovels — The Highest-Conviction Layer

| Tier | Name | Ticker | Why interesting | Multiple |
|---|---|---|---|---|
| Structural | **BE Semiconductor (Besi)** | BESI / BESIY | Hybrid-bonding monopoly for HBM4; 3 memory players in eval; orders 2x QoQ | 68x fwd P/E |
| Defensive | **Rambus** | RMBS | Mid-40% DDR5 RCD share, 80% GM, 42% OM, HBM4 IP royalty | ~50x P/E |
| Equipment | **Lam Research** | LRCX | Memory record 39% of systems mix, 1c-node SAM +20% | ~30x fwd P/E |
| High-beta | **Astera Labs** | ALAB | Leo CXL controller GA Azure YE; 76% GM; **70%+ single customer** | ~26–28x EV/Sales |
| Equipment | Applied Materials | AMAT | Record DRAM segment from HBM/3D packaging | ~31x fwd P/E |
| Equipment | ASML | ASML | First quarter ever where memory > logic in mix | 38x EV/EBITDA |
| Custom ASIC | Marvell | MRVL | Custom XPU silicon doubling FY26; HBM-adjacent | 42–44x fwd P/E |
| Module | Penguin/SMART | PENG | Mem segment +63% YoY; CXL KV-cache wins | ~mid-teens P/E |

The picks-and-shovels layer trades at premiums to the Big 3 because revenue is more design-win-locked, carries 60–80% gross margins, and is less exposed to DRAM ASP volatility. **All assume continued AI capex acceleration**; a hyperscaler capex pause would compress ALAB and BESI multiples fastest.

---

## 5. Cycle Position & Valuation

**Late-cycle peak being formed:**
- Industry inventory at **2–3 weeks (Hynix) / 6 weeks (Samsung)** vs 31-week peak in 1Q23
- Spot DRAM prices traded above contract since late 2025 (panic-buy signal); DDR4 spot has just begun softening
- Contract DRAM prices set to rise **+58–63% QoQ in 2Q26** (TrendForce)
- Capacity additions ARE happening: **Samsung +50% HBM**, **Hynix doubling DRAM wafers to 600k/mo in 2H26**, **Micron +23% capex** — relief wave in 2027–2028

**Where multiples sit vs history:**
- **MU**: 15.1x EV/EBITDA = +125% above 10-yr median (6.7x). Forward P/E 8.1x is "cheap on peak earnings" — classic double-counting risk
- **Hynix**: P/B at **6.8x — all-time high**, vs 5-yr median 1.8x and 2022 trough 0.8x. Most stretched in absolute terms
- **Samsung**: ~14x NTM P/E — the conglomerate discount makes it the cheapest large-cap memory exposure
- **BESI**: 135x LTM EV/EBITDA / 68x fwd P/E — most speculative on hybrid-bonding optionality
- **ALAB**: ~26–28x forward EV/Sales — priced for perfection

**Bull case (4 pillars):** physical bottlenecks compound; demand step-change not blip; inventory at all-time lows + multi-year LTAs locked; 3-player oligopoly behaving rationally.

**Bear case (4 pillars):** capacity expansions are real and large (textbook late cycle); 70%+ margins unsustainable; HBM has had brief gluts before (HBM2e '19, HBM3 '22); multiple compression risk severe at Hynix.

**Resolving catalysts:** Nvidia results May 28 / Aug; Micron F4Q26 late-Sep; Hynix 2H26 capacity execution; HBM4 yield prints; sustained spot/contract divergence.

---

## 6. Thematic Ideas Shortlist

1. **Cleanest pure-play AI memory long: MICRON (MU).** Exited consumer (Crucial), 100% memory, ~56% data center, sold out 2026 under 3-5yr contracts, designed into Nvidia Vera Rubin and AMD MI350/MI400, fwd P/E 8.1x. Stock has run *through* the consensus PT of $581.89 (current ~$757). Risk: cycle peak in FY27.

2. **Highest-conviction operator with HBM moat: SK HYNIX (000660).** Two-thirds of Nvidia HBM4 allocation, 72% group OP margin, 5.9x fwd P/E. Risk: 6.8x P/B unprecedented; Samsung HBM4 catch-up.

3. **Pure-play HBM4 picks-and-shovels: BE SEMICONDUCTOR (BESI/BESIY).** Hybrid-bonding monopoly with 3 memory players in evaluation. Q2 guide +30–40% QoQ. Trades rich (135x LTM EV/EBITDA) but on a TAM that hasn't started at scale yet.

4. **Best risk-adjusted controller play: RAMBUS (RMBS).** 80% GM, 42% OM, mid-40% DDR5 RCD share with no erosion, HBM4 IP royalty optionality. Cheaper than ALAB and far more diversified.

5. **Catch-up / relative-value: SAMSUNG (005930).** Cheapest large-cap memory exposure (~14x) with HBM4 yield ramp 60→85% by year-end '26 as the operational catalyst. Dilutes the AI memory thesis with mobile/foundry/displays drag.

6. **Pair-trade thoughts:**
   - Long Micron / Short Samsung = clean AI memory exposure stripped of conglomerate drag
   - Long Besi / Short Lam = HBM4 hybrid bonding leverage vs. broader WFE
   - Long Rambus / Short ALAB = controller IP royalty vs. concentration risk

---

## 7. What's Flagged as Unverified

- 2027 HBM revenue & DRAM TAM — only triangulated from broker comments
- Samsung memory-segment-only operating profit (only DS-level disclosed)
- Micron 5-yr clean valuation ranges (need Bloomberg/CapIQ)
- Hynix HBM standalone $ (referenced by management but not quantified each quarter)
- Hyperscaler capex 2027 (no formal guide yet)

---

## 8. Recommended Deep Dive

**Micron (MU)** — for the following reasons:
1. **Cleanest US-listed exposure** — most relevant for US investors and most-followed by US sell-side
2. **Real debate** — fwd P/E 8.1x vs cycle-peak-margin risk is a genuine, unresolved question
3. **Stock has run through consensus PT** ($757 vs $581.89 avg PT) — opportunity to re-derive the valuation
4. **Comp set is well-defined** — Hynix, Samsung memory, plus broader semis
5. **Catalyst calendar is dense** — F3Q26 guide already given (so testable); F4Q26 print late September is the next big read

Running the `equity-research` skill on MU next.
