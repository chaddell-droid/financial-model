# Server Memory Sector Overview — Part 1: Market Sizing & Demand Drivers

**Author:** Research Agent 1 (Demand Lane)
**Date:** May 10, 2026
**Scope:** Server DRAM TAM, HBM segment, DDR5/MRDIMM transition, CXL, AI accelerator demand, hyperscaler capex.

---

## 1. Server DRAM TAM & Forecast

### Total DRAM Revenue (whole-market context)

| Year | Total DRAM Revenue | YoY |
|------|-------------------:|----:|
| 2024A | ~$90.7B | +75% |
| 2025A | ~$136.5B | +51% |
| 2026E | ~$165B (TrendForce) / ">$440B" memory market estimate (BofA, broader) | mid-20s% |
| 2027E | Not formally published; sell-side mid-points imply $180–210B for DRAM only | — |

The 2024 and 2025 figures are TrendForce's most-cited prints ([TrendForce, July 2024](https://www.trendforce.com/presscenter/news/20240722-12228.html); reaffirmed in [TrendForce 3Q25 update](https://www.trendforce.com/presscenter/news/20251126-12802.html)). Q3 2025 alone was a record at "**+30.9% Q/Q**" with industry revenue blowing past prior peaks — Micron gained 3.7 ppts of share. The 2026 figure is triangulated from three data points: (i) BofA's $54.6B HBM 2026E (below) and ~33% HBM share of DRAM (TrendForce) implies DRAM ~$165B; (ii) "$440B+ memory market" estimate cited by SK Hynix referencing investment banks ([SK Hynix Newsroom, Jan 2026](https://news.skhynix.com/2026-market-outlook-focus-on-the-hbm-led-memory-supercycle/)) which includes NAND; (iii) TrendForce Q1 2026 contract pricing data showing 45–55% Q/Q price increases sustaining through year-end.

### Server-Specific DRAM

Server is now the dominant DRAM end market, displacing mobile/PC. Per TrendForce, **memory makers are explicitly prioritizing server applications across-the-board in 1Q26** ([TrendForce, Jan 2026](https://www.trendforce.com/presscenter/news/20260105-12860.html)). Global server unit shipments expected to grow ~4% in 2026, but **DRAM content per server is rising sharply**, doing the heavy lifting on server DRAM revenue ([TrendForce 4Q25 HBM report](https://www.trendforce.com/research/download/RP251208XI3)).

### Bit Growth & ASP

- **Industry DRAM bit growth:** "low 20%" in 2025; **~20% in 2026** ([TrendForce, Nov 2025](https://www.trendforce.com/presscenter/news/20251113-12780.html)).
- **ASP:** The driver of 2026 revenue. TrendForce forecasts conventional (non-HBM) DRAM contract prices **+45–50% Q/Q** in 1Q26, with combined contract prices **+50–55% Q/Q** ([TrendForce, Jan 2026](https://www.trendforce.com/presscenter/news/20260105-12860.html)). 64GB DDR5 RDIMM modules are tracking to **~2x** their early-2025 price by end-2026 ([Network World, citing TrendForce/Counterpoint](https://www.networkworld.com/article/4093752/server-memory-prices-could-double-by-2026-as-ai-demand-strains-supply.html)).

### Standard Server DRAM (DDR5 RDIMM/MRDIMM) vs HBM Split

Using HBM = 33% of total DRAM revenue in 2025 (TrendForce/[Astute Group](https://www.astutegroup.com/news/general/sk-hynix-holds-62-of-hbm-micron-overtakes-samsung-2026-battle-pivots-to-hbm4/)) and ~35% in 2028 ([Future Memory Storage, Mark Webb 2025](https://files.futurememorystorage.com/proceedings/2025/20250807_DRAM-302-1-WEBB.pdf)):

- 2025A: HBM ~$45B / Conventional ~$92B
- 2026E: HBM $54.6B (BofA) / Conventional ~$110B → server DRAM (DDR5 RDIMM/MRDIMM/3DS) is **the majority of "conventional"**, estimated ~$60–70B
- 2027E: HBM trending to ~$70B; HBM as a % of DRAM begins to plateau because **DDR5 ASP/wafer is projected to surpass HBM3e starting 1Q26** ([TrendForce, Oct 2025](https://www.trendforce.com/presscenter/news/20251029-12758.html)) — a critical inflection.

---

## 2. HBM Segment

### HBM Revenue Trajectory

| Year | HBM Revenue | Source |
|------|------------:|--------|
| 2023A | ~$4–5B (~5% DRAM) | TrendForce baseline |
| 2024A | ~$17B | [Introl, AI Memory Supercycle](https://introl.com/blog/ai-memory-supercycle-hbm-2026) |
| 2025A | ~$34.5B (~33% DRAM share) | BofA via [Astute Group](https://www.astutegroup.com/news/general/sk-hynix-holds-62-of-hbm-micron-overtakes-samsung-2026-battle-pivots-to-hbm4/) |
| 2026E | **$54.6B (+58% YoY)** | BofA |
| 2027E | $70–80B (triangulated; not a single published source — see note) | — |
| 2030E | $98B | [Introl](https://introl.com/blog/ai-memory-supercycle-hbm-2026) |

**Note on 2027:** No single broker figure was found for 2027 HBM revenue. Triangulating from (a) Micron's commentary that **2026 HBM supply is fully booked** at the time of their Q1 FY26 print ([TrendForce, Dec 2025](https://www.trendforce.com/news/2025/12/18/news-micron-hikes-capex-to-20b-with-2026-hbm-supply-fully-booked-hbm4-ramps-2q26/)) and (b) Samsung's announced **+50% capacity** expansion plan for 2026 ([TrendForce, Dec 2025](https://www.trendforce.com/news/2025/12/30/news-samsung-reportedly-plans-50-hbm-capacity-surge-in-2026-spotlight-on-hbm4/)) plus SK Hynix's "**4x infrastructure investment**" announcement, suggests bit shipments ramp ~50%+ in 2027 but ASP softens (BofA cited "HBM contract prices to shift into Y/Y decline" in 2026). $70–80B is a planning estimate, not a sourced print.

### HBM Bit Shipment Growth & % of DRAM

- HBM bit shipments expected to surpass **30 billion gigabits in 2026** ([Astute Group / SK Hynix data](https://www.astutegroup.com/news/general/sk-hynix-holds-62-of-hbm-micron-overtakes-samsung-2026-battle-pivots-to-hbm4/)).
- HBM **% of DRAM revenue: ~5% in 2023 → 33% in 2025 → ~33% in 2026** (capacity-constrained, not share-expanding by revenue) → 35% by 2028 ([Webb, FMS 2025](https://files.futurememorystorage.com/proceedings/2025/20250807_DRAM-302-1-WEBB.pdf)).
- Critically, **HBM = ~50% of industry DRAM gross margin by 2028** (Webb), capturing far more profit than its revenue weight implies.

### HBM3 / HBM3E / HBM4 Mix

- **2026 mix:** HBM3E ~⅔ of shipments, HBM4 ramping from Q2 ([SK Hynix outlook via TrendForce](https://www.trendforce.com/news/2026/01/05/news-sk-hynix-2026-outlook-hbm3e-remains-mainstream-hbm4-dual-strategy-amid-triple-market-headwinds/); [Samsung mass-production article](https://markets.financialcontent.com/stocks/article/tokenring-2026-1-26-the-hbm4-era-begins-samsung-and-sk-hynix-trigger-mass-production-for-next-gen-ai)).
- **Revenue mix forecast for 2026:** ~55% HBM4 / 45% HBM3E by year-end as HBM4 commands a meaningful price premium and feeds Nvidia Rubin ramp in H2 ([Astute Group](https://www.astutegroup.com/news/general/sk-hynix-holds-62-of-hbm-micron-overtakes-samsung-2026-battle-pivots-to-hbm4/)).
- **HBM4 share leadership:** UBS expects SK Hynix to hold ~**70% share of HBM4 for Nvidia Rubin in 2026** ([Astute Group](https://www.astutegroup.com/news/general/sk-hynix-holds-62-of-hbm-micron-overtakes-samsung-2026-battle-pivots-to-hbm4/)).
- **HBM3E pricing:** Samsung and SK Hynix raised HBM3E contract prices ~**20% for 2026** as H200 and ASIC demand absorbs supply ([TrendForce, Dec 2025](https://www.trendforce.com/news/2025/12/24/news-samsung-sk-hynix-reportedly-plan-20-hbm3e-price-hike-for-2026-as-nvidia-h200-asic-demand-rises/)).

### HBM Margin Premium

HBM has historically carried 50%+ gross margins vs. ~20–30% for commodity DRAM. However, the relationship is narrowing. **TrendForce projects DDR5 profitability to surpass HBM3e starting 1Q26** because (i) DDR5 contract prices are rising faster than HBM3E prices and (ii) DDR5 wafer cycle time is shorter, lifting ASP/wafer above HBM3E ([TrendForce, Oct 2025](https://www.trendforce.com/research/download/RP251022KY)). HBM4 reopens the margin gap in H2 2026.

---

## 3. DDR5 Transition & MRDIMM

### DDR5 vs DDR4 Server Bit Share

- **2024A:** DDR5 = ~40% of server DRAM bit shipments (TrendForce).
- **2025A:** **60–65%** ([TrendForce, March 2025 via StorageNewsletter](https://www.storagenewsletter.com/2025/03/07/trendforce-findings-server-dram-and-hbm-continue-to-drive-growth/)).
- **2026E:** Yole Développement projects **DDR4 falling to just ~5%** of the broader DRAM market, with DDR5 dominant ([AllPCB referencing Yole](https://www.allpcb.com/allelectrohub/ddr4-phaseout-shakes-up-memory-market)).
- DDR4 phase-out drivers: Samsung halted 8Gb DDR4 production by April 2025 and ceased final DDR4 module shipments by Dec 2025; Micron discontinuing legacy DDR4 server DIMMs; SK Hynix cut DDR4 output to a residual portion. Result: structural DDR4 supply tightness and **DDR4 spot prices spiking 100%+** in late 2025 — perversely pulling some DDR4 revenue back into the mix in 1H26.

### MRDIMM Adoption

- **Driver:** AI/HPC bandwidth-bound workloads on Granite Rapids/Sierra Forest (Intel) and Turin (AMD).
- **Gen1:** ~8,800 MT/s, currently shipping in volume.
- **Gen2 standard:** JEDEC published **MRDIMM Gen2 targeting 12,800 MT/s** (~+45% over Gen1) ([TweakTown, JEDEC announcement](https://www.tweaktown.com/news/111452/jedec-pushes-ddr5-server-memory-to-12800-mt-s-with-new-mrdimm-gen2-standard-for-ai-and-data-center-workloads/index.html); [HotHardware](https://hothardware.com/news/jedecs-ddr5-mrdimm-gen2-standard-pushes-12-gbps)).
- **Pushers:** Micron is the most explicit on volume MRDIMM ([Micron MRDIMM page](https://www.micron.com/products/memory/dram-modules/mrdimm)); SK Hynix and Samsung also shipping. Ramp accelerates in 2H 2026 alongside Granite Rapids/Turin refresh + GB300 deployments.

### DRAM Content per Server

Best-sourced point estimate ([RandTech, citing industry data](https://randtech.com/ai-memory-supply-chain/), confirmed by [TrendForce 4Q25 HBM report](https://www.trendforce.com/research/download/RP251208XI3)):

| Server Type | DRAM Content | HBM Content |
|-------------|-------------:|------------:|
| General-purpose 2025 | <1 TB | 0 |
| AI server (8x accelerator, 2026) | **~3 TB DDR5** | **~1.6 TB HBM** |
| AI inference cluster | 256 GB – 1 TB | varies |

So an AI server consumes **~3–4x the DDR5** of a general-purpose server **plus** 1.6 TB of HBM that simply did not exist in the conventional server BOM.

---

## 4. CXL Memory Expansion

### Market Size

- **2025 market size:** ~$1.3B ([MarketIntelo, CXL Memory Expansion Market](https://marketintelo.com/report/cxl-memory-expansion-market)).
- **2026E:** $1.8–2.5B ([KAD8 / industry estimates](https://www.kad8.com/server/cxl-type-3-memory-expansion-market-trends-and-outlook-for-2026/)).
- **CAGR 2026–2034:** **28.7%** to ~$11.8B by 2034 (MarketIntelo).
- **Yole 2028 forecast:** ~**$16B** by 2028 ([Yole Group webinar materials](https://medias.yolegroup.com/uploads/2023/12/yole_webinar_cxl_a_promising_solution_to_data_center_memory_bottlenecks_2023-final.pdf)) — note this is the 2023-vintage view; current trajectory is running closer to but slightly behind that path due to CXL 2.0 deployment lag.

### Deployment State

- **CXL 2.0:** Production-shipping today. Memory expander modules (Type 3) from Samsung, SK Hynix, Micron available.
- **CXL 3.1 on PCIe 6.1:** Defining technical milestone of 2026, supporting 128 GB/s bi-directional on x16 ([KAD8](https://www.kad8.com/hardware/cxl-opens-a-new-era-of-memory-expansion/)).
- **Server ecosystem readiness:** Reportedly **>90% of newly shipped servers are CXL-capable** ([KAD8](https://www.kad8.com/hardware/cxl-in-2026-how-memory-pooling-is-reshaping-data-centers/)) — this is the supply-side enabler; demand-side adoption lags.

### Hyperscaler Adoption

- **Microsoft Azure:** Public CXL preview is the most cited live deployment.
- **TCO impact:** CXL pooling has been reported to reduce hyperscaler TCO by **15–20%** (KAD8 — secondary, not directly hyperscaler-attributed).
- **Reality check:** [TechTarget reporting](https://www.techtarget.com/searchStorage/news/366570093/The-promise-of-CXL-still-hangs-in-the-balance) flags that CXL adoption remains slower than 2022/2023 hype suggested. The HBM/DDR5 supercycle is absorbing capacity; CXL is real but is a **2027–2028 inflection**, not a 2026 one.

---

## 5. AI Accelerator Demand

### HBM Per-Unit Capacity

| Accelerator | HBM Type | Capacity | Source |
|-------------|----------|---------:|--------|
| Nvidia H100 | HBM3 | 80 GB | Public spec |
| Nvidia H200 | HBM3E | 141 GB | [Nvidia](https://www.nvidia.com/en-us/data-center/h200/) |
| Nvidia B200 (HGX SXM) | HBM3E | 180 GB | [IntuitionLabs](https://intuitionlabs.ai/articles/nvidia-data-center-gpu-specs) |
| Nvidia B200 (in GB200 NVL72) | HBM3E | 186 GB | IntuitionLabs |
| Nvidia B300 / Blackwell Ultra | HBM3E (12-Hi) | 288 GB | [TweakTown](https://www.tweaktown.com/news/107359/amd-details-instinct-mi350-3d-chiplet-185b-transistors-288gb-hbm3e-tsmc-n3p-node/index.html) (referencing AMD parity), confirmed in [CudoCompute](https://www.cudocompute.com/blog/nvidia-gpu-upgrade-planning) |
| Nvidia Rubin (R100, H2 2026) | HBM4 | 288 GB | [CudoCompute](https://www.cudocompute.com/blog/nvidia-gpu-upgrade-planning) |
| AMD MI300X | HBM3 | 192 GB | [AMD](https://www.amd.com/en/products/accelerators/instinct/mi300.html) |
| AMD MI325X | HBM3E | 256 GB | [AMD newsroom](https://www.amd.com/en/newsroom/press-releases/2024-6-2-amd-accelerates-pace-of-data-center-ai-innovation-.html) |
| AMD MI350X / MI355X | HBM3E | 288 GB | [AMD MI350 page](https://www.amd.com/en/products/accelerators/instinct/mi350.html) |
| AMD MI400 (2026) | HBM4 | 432 GB | [VideoCardz](https://videocardz.com/newz/amd-launches-instinct-mi350-series-confirms-mi400-in-2026-with-432gb-hbm4-memory) |

### Forecast AI Accelerator Units

- **Nvidia data center GPU shipments 2023A:** 3.76M units ([DCD](https://www.datacenterdynamics.com/en/news/nvidia-gpu-shipments-totaled-376m-in-2023-equating-to-a-98-market-share-report/)).
- **2025E:** Mizuho ~7M Nvidia data center GPUs (cited in IntuitionLabs).
- **GB200 + GB300 racks 2026E:** Morgan Stanley forecasts AI server cabinet demand to rise from **~28,000 in 2025 to ≥60,000 in 2026** for Nvidia's platform alone ([wccftech, citing MS](https://wccftech.com/nvidia-blackwell-ultra-ai-servers-to-lead-the-ai-infrastructure-race-moving-into-2026/)). At 72 GPUs/rack, that's ~4.3M GPUs in NVL configurations alone.
- **GB300 specifically:** **+129% YoY shipment growth** projected for 2026 (KAD8 / wccftech).
- **B200/GB200 backlog:** **~3.6M units sold out through mid-2026** ([FinancialContent, Dec 2025](https://markets.financialcontent.com/wral/article/tokenring-2025-12-29-nvidias-blackwell-dynasty-b200-and-gb200-sold-out-through-mid-2026-as-backlog-hits-36-million-units)).
- **Custom ASICs (TPU, Trainium, MTIA):** **+44.6% in 2026** vs Nvidia GPUs at +16.1% ([Futurum / industry analysis](https://futurumgroup.com/insights/ai-capex-2026-the-690b-infrastructure-sprint/)) — ASICs are the faster-growing HBM consumer.
- **Nvidia revenue visibility:** **$500B Blackwell + Rubin revenue through 2026** per Nvidia management.

### HBM Bit Demand per Accelerator

Implied HBM bit demand math for 2026:
- ~5M Nvidia DC GPUs at ~200 GB average HBM = **1,000 TB / 1.0 EB of HBM** for Nvidia alone
- + ~2M AMD/ASIC accelerators at ~250 GB average HBM = **0.5 EB**
- Total ~**1.5 EB HBM = 12 billion gigabits**, against TrendForce's "30 billion gigabits HBM shipped in 2026" — i.e. accelerators consume ~40%, with the balance going to networking buffers, lower-bin product binning, and inventory build.

---

## 6. Hyperscaler Capex

### 2025A and 2026E Calendar-Year Capex

| Company | 2025A | 2026E Guide | YoY | Source |
|---------|------:|------------:|----:|--------|
| Microsoft | ~$88B FY25 (~$152B CY25 implied per consensus) | **$190B (CY26)** | +25% | [CNBC, Apr 29, 2026](https://www.cnbc.com/2026/04/29/microsoft-msft-q3-earnings-report-2026.html); [The Register](https://www.theregister.com/2026/04/30/microsoft_q3_2026/) |
| Alphabet (Google) | $91B | **$175–185B** | ~+98% | [Tom's Hardware](https://www.tomshardware.com/tech-industry/big-tech/big-techs-ai-spending-plans-reach-725-billion); [Axios, Feb 11, 2026](https://www.axios.com/2026/02/11/hyperscaler-spending-meta-microsoft-amazon-google) |
| Amazon | $125B | **$200B** | +60% | Tom's Hardware; Axios |
| Meta | ~$72B | **$125–145B** (raised from $115–135B) | ~+85% | Tom's Hardware; [CNBC](https://www.cnbc.com/2026/02/06/google-microsoft-meta-amazon-ai-cash.html) |
| Oracle | ~$21B FY25 | **~$50B FY26** | **+136%** | [Futurum, Q2 FY26](https://futurumgroup.com/insights/oracle-q2-fy-2026-cloud-grows-capex-rises-for-ai-buildout/); [DCD](https://www.datacenterdynamics.com/en/news/oracle-has-455bn-in-remaining-performance-obligations-at-end-of-q1-2026/) |
| **Big 4 Total** | **~$410B** | **~$725B** | **+77%** | Tom's Hardware |
| **Big 4 + Oracle** | **~$430B** | **~$775B** | **+80%** | derived |

**Critical anecdote:** Microsoft's CFO Amy Hood explicitly attributed **$25B of the $190B CY26 capex figure to rising memory chip and component costs** — a watershed admission that memory inflation is a line item in hyperscaler P&Ls ([Tom's Hardware](https://www.tomshardware.com/tech-industry/big-tech/microsoft-attributed-25-billion-of-its-record-ai-budget-to-memory-chip-costs); [The Register](https://www.theregister.com/off-prem/2026/04/30/microsoft-lifts-2026-capex-by-25b-to-cover-price-rises/5221545)). MSFT also said it expects to remain **capacity-constrained on GPUs, CPUs, and storage through at least 2026**.

### Capital Intensity

Per Futurum / CreditSights:
- Meta: **54% of sales** in 2026
- Microsoft: **47%**
- Alphabet: **46%**
- Amazon: **25%**

Amazon FCF tracking to **−$17B to −$28B in 2026** per Morgan Stanley / BofA estimates — first negative-FCF print at scale for AMZN.

### 2027E Capex

No clean published figure. CreditSights flagged "Raising Hyperscaler Capex 2026 Estimates" ([CreditSights](https://know.creditsights.com/insights/tech-raising-hyperscaler-capex-2026-estimates/)) but 2027 has not yet been formally guided. Sell-side range we triangulate from public commentary: **$850B–$1.0T for the Big 4 + Oracle in 2027**, predicated on ~+15–25% YoY growth (deceleration from 2026's +80% as capex/sales ratios approach a ceiling, particularly for Meta). This is **not a sourced number** — flag for follow-up.

---

## Cross-Cutting Conclusions for the Demand Lane

1. **Server is the only DRAM end-market that matters in 2026.** Mobile and PC are residual — TrendForce notes makers are "across-the-board" prioritizing server.
2. **Server DRAM revenue is being driven by ASP, not volume.** Bit growth is ~20% but revenue growth is 30%+ because contract prices step-functioned higher in late 2025 / early 2026.
3. **HBM's revenue share has plateaued at ~33% — but its profit share is heading to 50%.** This is the key margin-mix story for the memory makers (handed off to research lane #2).
4. **DDR5 profitability briefly exceeds HBM3E in 1H26.** This is a once-in-a-cycle anomaly driven by HBM3E price discipline and DDR5 spot-price spike.
5. **MRDIMM is the next ASP/content lever after DDR5 — ramps 2H 2026.**
6. **CXL is real but not a 2026 driver.** It's a 2027–2028 story; HBM/DDR5 capacity is absorbing all attention.
7. **Hyperscaler capex (+80% YoY in 2026 to ~$725B) is the demand catalyst.** Memory inflation is now a named line item — Microsoft's $25B attribution is the smoking gun.
8. **AI accelerator HBM content is rising even faster than units:** H100 (80 GB) → B300 (288 GB) → MI400 (432 GB) is **5.4x in three years** on a per-chip basis, meaning HBM bit demand grows even if accelerator unit growth slows.

---

## Items Flagged — Could Not Source Cleanly

- **Hard 2027 figures** for HBM revenue, total DRAM revenue, and hyperscaler capex (only triangulated/implied).
- **HBM gross margin dollars by year** — implied from "50% of DRAM margin in 2028" but not directly disclosed.
- **CXL hyperscaler-specific TAM** beyond Microsoft Azure preview — secondary sources only.
- **Average HBM content per accelerator (industry mix)** — derived, not published.

---

## Source Index (primary)

1. TrendForce — DRAM and HBM market research: https://www.trendforce.com/research/dram
2. TrendForce — 1Q26 server pricing: https://www.trendforce.com/presscenter/news/20260105-12860.html
3. TrendForce — DDR5 profitability vs HBM3e: https://www.trendforce.com/presscenter/news/20251029-12758.html
4. TrendForce — 4Q25 HBM dynamics: https://www.trendforce.com/research/download/RP251208XI3
5. TrendForce — AI 20% of DRAM wafer in 2026: https://www.trendforce.com/news/2025/12/26/news-ai-reportedly-to-consume-20-of-global-dram-wafer-capacity-in-2026-hbm-gddr7-lead-demand/
6. SK Hynix Newsroom — 2026 outlook: https://news.skhynix.com/2026-market-outlook-focus-on-the-hbm-led-memory-supercycle/
7. Astute Group — HBM share / BofA $54.6B: https://www.astutegroup.com/news/general/sk-hynix-holds-62-of-hbm-micron-overtakes-samsung-2026-battle-pivots-to-hbm4/
8. Mark Webb (FMS 2025) — HBM economics: https://files.futurememorystorage.com/proceedings/2025/20250807_DRAM-302-1-WEBB.pdf
9. CNBC — Microsoft $190B capex: https://www.cnbc.com/2026/04/29/microsoft-msft-q3-earnings-report-2026.html
10. Tom's Hardware — Big 4 $725B capex: https://www.tomshardware.com/tech-industry/big-tech/big-techs-ai-spending-plans-reach-725-billion
11. Tom's Hardware — Microsoft's $25B memory attribution: https://www.tomshardware.com/tech-industry/big-tech/microsoft-attributed-25-billion-of-its-record-ai-budget-to-memory-chip-costs
12. Futurum — Oracle Q2 FY26 capex: https://futurumgroup.com/insights/oracle-q2-fy-2026-cloud-grows-capex-rises-for-ai-buildout/
13. Yole Group — CXL outlook: https://medias.yolegroup.com/uploads/2023/12/yole_webinar_cxl_a_promising_solution_to_data_center_memory_bottlenecks_2023-final.pdf
14. Nvidia H200 spec page: https://www.nvidia.com/en-us/data-center/h200/
15. AMD MI350 product page: https://www.amd.com/en/products/accelerators/instinct/mi350.html
16. Morgan Stanley AI rack forecast (via wccftech): https://wccftech.com/nvidia-blackwell-ultra-ai-servers-to-lead-the-ai-infrastructure-race-moving-into-2026/
17. JEDEC MRDIMM Gen2: https://www.tweaktown.com/news/111452/jedec-pushes-ddr5-server-memory-to-12800-mt-s-with-new-mrdimm-gen2-standard-for-ai-and-data-center-workloads/index.html
18. RandTech — AI memory content per server: https://randtech.com/ai-memory-supply-chain/
19. Network World — DDR5 doubling: https://www.networkworld.com/article/4093752/server-memory-prices-could-double-by-2026-as-ai-demand-strains-supply.html
20. Introl — AI Memory Supercycle / HBM trajectory: https://introl.com/blog/ai-memory-supercycle-hbm-2026
