# Server Memory Sector Overview – Part 3: Controllers, CXL, Modules & Equipment (Picks-and-Shovels)

**Research date:** May 10, 2026
**Author:** Researcher Agent (Picks-and-Shovels lane)
**Companion reports:** (1) Market Sizing, (2) Big 3 DRAM Makers, (4) Cycle/Valuation

---

## Executive Summary

The picks-and-shovels layer of the AI memory build-out has bifurcated into three distinct cohorts in 2026:

1. **Interface/controller silicon** (Astera Labs, Rambus, Montage, Marvell) – the highest-margin, highest-multiple cohort, riding DDR5 generational upgrades, MRDIMM/CKD attach, PCIe Gen6 retiming, CXL memory pooling, and custom XPU silicon.
2. **Module/subsystem makers** (Penguin Solutions/SMART Modular) – lower-margin, more cyclical, with a small but optionality-rich CXL module business.
3. **Equipment makers with HBM exposure** (Lam Research, Applied Materials, ASML, BE Semiconductor) – riding HBM TSV/etch, advanced packaging, EUV-on-DRAM (1c node), and the early innings of hybrid bonding for HBM4.

Across all three cohorts, AI-driven DRAM/HBM demand has lifted earnings estimates and multiples meaningfully YTD. The picks-and-shovels layer trades, on average, at a premium to the Big 3 memory makers because revenue is (a) more design-win locked, (b) carries 60-80% gross margins, and (c) is less directly exposed to DRAM ASP volatility.

---

## I. Memory Interface / Controller / Buffer Chips

### 1. Astera Labs (NASDAQ: ALAB)

**Profile.** Fabless connectivity-silicon house targeting AI infrastructure. Four product families: **Aries** (PCIe/CXL retimers and smart cable modules), **Leo** (CXL Smart Memory Controllers), **Taurus** (Ethernet smart cable modules / AECs), and **Scorpio** (PCIe Gen6 fabric switches – the newest and fastest-growing line). The company is the de-facto incumbent for PCIe-Gen5/6 retiming inside hyperscaler AI servers and is the only merchant CXL memory controller shipping into a hyperscaler (Microsoft Azure M-series).

**Q1 2026 results (reported May 5, 2026).**
- Revenue **$308.4M, +93% YoY, +14% QoQ**, beating consensus and the high end of guide ($297M).¹
- Non-GAAP gross margin **76.3%**, non-GAAP operating margin **36.2%**, non-GAAP diluted EPS **$0.61**.¹
- GAAP net income **$80.3M**; operating cash flow **$74.6M**; closed a **$74M acquisition** in the quarter.¹

**Product mix and customer concentration.** PCIe Gen6 solutions (Aries + Scorpio) now generate **>1/3 of total revenue**.² **Scorpio is on track to become the largest product line by year-end 2026**; Scorpio X-Series shipped initial production volumes in Q1 with full ramp in 2H26.² Leo is in private beta with Microsoft Azure M-series VMs, GA expected by year-end.² Concentration is severe: in FY2025, **one end customer was >70% of revenue and the top three ~86%**.³ Lead hyperscaler (widely understood to be a top US cloud) still drives the majority of Scorpio and Taurus revenue.⁴ Direct Nvidia exposure exists (Aries retimers in Nvidia HGX/MGX reference designs) but is not the dominant share.⁴

**Guidance.** Q2 2026 revenue **$355–365M** (midpoint +17% QoQ); non-GAAP diluted EPS **$0.68–0.70**.¹

**Stock & multiples.** ALAB ~$199 on May 10, 2026; market cap ~$34B; 52-week return +173%.⁵ Trades at **forward EV/sales ~26-28x** on consensus 2026 revenue, a P/E of ~135x trailing and ~70x on Q1-2026 run-rate.⁵ Stock dipped 8.5% on the Q1 print despite the beat, but is up ~45% from the late-Jan 2026 low (~$107).⁵ Full-year 2025 revenue was **$852.5M, +115% YoY**, the company's third consecutive year of triple-digit growth.³

**Why this is a server-memory play.** Leo is the only public-market pure-play merchant CXL memory controller. Aries/Scorpio are required for high-radix PCIe Gen6 fanout in AI servers, which is what enables HBM-attached XPUs to communicate with DRAM-backed host memory. The CXL ramp at Azure is the first material hyperscaler signal that CXL 2.0/3.0 memory pooling is moving from PoC into production.

---

### 2. Montage Technology (SHA: 688008)

**Profile.** Shanghai-listed fabless designer of DDR memory interface chips: **RCD** (Registering Clock Driver) for RDIMMs, **MRCD/MDB** for MRDIMM, **CKD** for client DDR5, plus PCIe retimer and CXL controller IP. One of only three certified DDR5 RCD vendors globally (alongside Rambus and Renesas/IDT).

**Recent results.** FY2024 revenue **RMB 3.64B (+59% YoY)**; net income **RMB 1.41B (+213% YoY)**.⁶ Q1 2025 revenue **~RMB 1.22B (+66% YoY)**; net income **RMB 510-550M (+128-146%)**.⁶ The company released a Q1 2026 earnings update on April 27, 2026 indicating continued strong revenue and profit growth, though specific Q1 2026 figures were not fully translated in English-language sources.⁷

**DDR5 RCD share & product roadmap.** Industry estimates put Montage's DDR5 RCD share in the ~30-40% range, behind Rambus's mid-40s but well ahead of #3 Renesas. Gen3 RCD shipping at scale; Gen5 RCD samples already with customers.⁶ In January 2025 Montage shipped **Gen2 MRCD/MDB samples for DDR5 MRDIMM** at 12,800 MT/s to leading global memory makers⁸ – they are competitive with Rambus on the MRDIMM platform that Intel Granite Rapids and AMD Turin server CPUs are designed around.

**Trading multiples.** Listed in Shanghai (STAR market); trades at premium multiples typical of A-share semis. Specific May 2026 multiples are not consistently reported in English sources; market cap is approximately RMB 100B+ based on H-share dual listing (6809.HK).

**Why this is a server-memory play.** Montage is the dominant Chinese supplier of DDR5 RCD/MRCD into server DIMMs. Every DDR5 RDIMM/MRDIMM/LRDIMM ships with one Montage or Rambus chip. Server DDR5 attach is structurally rising (more channels per CPU, higher data rates per DIMM = more buffer chips per DIMM with MRDIMM), making this an *ASP-up + units-up* story.

---

### 3. Rambus (NASDAQ: RMBS)

**Profile.** Hybrid product/IP licensing model. Product side: DDR5 RCD/CKD/PMIC chips (~mid-40s share of DDR5 RCD), MRCD/MDB for MRDIMM. IP side: HBM3/HBM3E/HBM4 memory controllers, GDDR7, security IP, all licensed to ASIC and SoC designers. Highest-margin pure interface-chip play in the public markets.

**Q1 2026 results (reported April 27, 2026).**
- Total revenue **$180.2M**; product revenue **$88M, +15% YoY** in line with guide.⁹
- GAAP EPS **$0.55**; non-GAAP EPS **$0.63** vs. $0.61 consensus.⁹
- Non-GAAP gross margin **79.8%**; non-GAAP operating margin **42%**.¹⁰
- Q2 guide: product revenue +11% QoQ; double-digit product growth for FY26.⁹

**DDR5 share & strategic position.** Exited 2025 with **mid-40% DDR5 RCD share, no erosion observed in 2026**, and management targets the **40-50% range** through the DDR5 cycle.¹¹ The DDR5 Gen2-to-Gen3 transition is a positive ASP catalyst and supply-chain (OSAT) constraints from late 2025 have been resolved.⁹ HBM4 controller IP is shipping to multiple ASIC customers, providing royalty optionality on the HBM volume ramp.

**Trading multiples.** RMBS ~$131.80 on May 9, 2026; market cap **~$14.0B**.¹⁰ Trailing P/E **~61x**, P/S **~19.7x**, 52-week range $50.89–$161.80.¹⁰ Up ~20% YTD 2026 with strong product gross margin (~80%) and 42% non-GAAP operating margin. FCF profile is strong (royalty stream + product margins).

**Why this is a server-memory play.** Direct exposure to (a) DDR5 server DIMM units, (b) DDR5 ASP uplift from Gen2→Gen3 and from RDIMM→MRDIMM, and (c) HBM via memory controller IP royalties on every ASIC tape-out. Less concentrated than ALAB and with a defensive royalty layer.

---

### 4. Marvell Technology (NASDAQ: MRVL)

**Profile.** Diversified data-center chipmaker. Four end markets: data center (~75% of revenue), enterprise networking, carrier, consumer. Data center revenue has three buckets: (1) custom AI silicon (XPU programs for hyperscalers – AWS Trainium, Google Axion, and a third Tier-1), (2) electro-optics (PAM4 DSPs, CPO), (3) switching/storage. HBM-adjacent rather than HBM-direct: Marvell's custom XPUs *consume* HBM but don't make it.

**Q4 FY26 results (fiscal year ended Feb 2026, reported March 5, 2026).**
- Q4 net revenue **$2.219B**, $19M above guide midpoint.¹²
- Q4 data center revenue **record $1.65B, +9% QoQ, +21% YoY**.¹²
- FY26 net revenue **$8.195B (record); data center revenue >$6B, +46% YoY**.¹²
- **Custom silicon doubled in FY26 to $1.5B**, the first full year of production for major programs.¹²

**Outlook.** Custom silicon expected to **at least double again in FY28**, with a new Tier-1 XPU program and multiple XPU-attach ramps. Marvell has set an aspirational **FY28 revenue target of ~$15B**.¹²

**Trading multiples.** MRVL ~$170 on May 10, 2026; 52-week range $58.61-$175.80.¹³ Forward P/E **~42-44x**, forward P/S **~10x**.¹³ EV/EBITDA has compressed from 54x (Q1 FY26) to ~34x (Q3 FY26) as estimates rose.¹³ All-time high reached in early May 2026.¹³

**Why this is a server-memory play.** Each custom XPU Marvell tapes out drives ~6-8 HBM3E/HBM4 stacks of pull-through demand. As Marvell's custom silicon doubles to ~$3B in FY28, that implies meaningful HBM volume contribution from a non-Nvidia source, which matters for memory-maker (Hynix/Samsung/Micron) revenue diversification.

---

## II. Module / Subsystem Makers

### 5. Penguin Solutions / SMART Modular (NASDAQ: PENG, formerly SGH)

**Profile.** Rebranded from Smart Global Holdings (SGH) to **Penguin Solutions (ticker PENG)** in late 2024. Three segments: **Advanced Computing / IPS** (HPC/AI cluster integrator – the "Penguin" brand), **Integrated Memory** (the legacy SMART Modular DRAM/Flash/CXL module business), and **LED Solutions**. Memory is no longer the largest segment but remains the most relevant to this report.

**Q2 FY26 results (reported April 2026).**
- Net sales **$343M, -6% YoY**; non-GAAP gross margin **31.2% (+40bps YoY)**.¹⁴
- **Integrated Memory revenue $172M, +63% YoY**, driven by AI-related demand and favorable flash pricing.¹⁵
- Memory segment full-year guidance raised to **65-75% growth**.¹⁵
- LED segment -7% YoY; mixed conditions and disciplined investment.¹⁵
- FY26 raised guide: **net sales +12% YoY at the midpoint, non-GAAP diluted EPS $2.15**.¹⁵
- 5 new AI/HPC customer wins in Q2, including a Tier-1 financial institution deploying their **MemoryAI CXL-based KV-cache server**.¹⁴

**CXL traction.** SMART released a **CXL NV-CMM E3.S 2T non-volatile CXL module** plus DDR5 SODIMM/CSODIMM in Q2.¹⁴ The MemoryAI KV-cache product is one of the few publicly-disclosed productized CXL memory deployments outside of Azure's M-series, suggesting CXL is starting to find a credible AI inference niche (KV-cache offload from HBM to slower-but-cheaper CXL memory).

**Why this is a server-memory play.** Optionality-rich rather than core. The integrated memory business benefits from AI-related DRAM/Flash module demand, and CXL module wins are a real (if small) data point for the CXL ecosystem moving past PoC.

### 6. Private peers (brief mention)

**ADATA, TeamGroup, Kingston** – three of the largest private/foreign-listed module makers globally. Kingston is the world's largest third-party memory module supplier (private; >$15B revenue per industry estimates). ADATA (Taiwan: 3260) and TeamGroup (Taiwan: 4967) are both publicly listed in Taipei but rarely included in US-investor sector coverage. They compete with Penguin's SMART Modular in the channel and white-box server module markets but have limited CXL/AI server exposure today.

---

## III. Equipment Makers (HBM / Advanced Packaging Exposure)

### 7. Lam Research (NASDAQ: LRCX)

**Profile.** Etch and deposition leader; dominant share in HBM TSV (through-silicon via) etch and the moly/W deposition steps used in advanced DRAM. Also strong in CMP, ALD, and increasingly in hybrid-bonding-adjacent processes via the Coventor/SEMulator EDA tools.

**Q3 FY26 results (quarter ended March 29, 2026).**
- Revenue **$5.84B, +9% QoQ, +24% YoY**.¹⁶
- GAAP net income **$1.83B**.¹⁶
- **Memory at 39% of systems revenue (up from 34%); DRAM at record 27%** of systems revenue – a clear HBM/DDR5/1c-node fingerprint.¹⁶
- HBM investment described as "robust"; 1c node transition expanding Lam's SAM by **>20%**.¹⁶

**Outlook.** Q4 FY26 guide **$6.60B ±$400M**.¹⁶ Lam now expects **2026 WFE of ~$140B with bias to upside**, sets stage for "compelling WFE growth in 2027."¹⁶

**Trading multiples & price.** LRCX ~$294 on May 10, 2026.¹⁷ Up ~91% over the prior six months; trades at multi-year-high multiples reflecting the AI WFE upcycle.¹⁷

**Why this is a server-memory play.** HBM TSV etch is the bottleneck step for HBM stacking capacity, and DRAM bit growth at the 1c node requires Lam's most advanced etch/dep tooling. Memory at record 27% of systems is the cleanest read-through to the AI memory cycle in the equipment space.

---

### 8. Applied Materials (NASDAQ: AMAT)

**Profile.** Broadest WFE portfolio – deposition, ion implant, CMP, epi, metrology, and #1 share in advanced packaging tooling. Strong ICAPS (mature-node) franchise plus leading-edge logic, HBM DRAM, and 3D packaging.

**Q1 FY26 results (reported Feb 12, 2026).**
- Revenue **$7.0B, -2% YoY** (vs. $6.9B consensus).¹⁸
- Semi Systems revenue $5.1B (-8% YoY); AGS $1.6B (+15% YoY).¹⁸
- **Record DRAM revenue** in Semi Systems segment, driven by HBM and 3D advanced packaging.¹⁹
- HBM and 3D chiplet stacking called out as fastest-growing 2026 packaging segments, with AMAT in the #1 position in both.¹⁹

**Outlook.** Q2 FY26 guide **$7.65B ±$0.5B**, non-GAAP EPS **$2.64 ±$0.20**.¹⁸ Calendar-2026 semi equipment business expected to **grow >20%**.¹⁹

**Trading multiples.** Forward P/E **~31x** as of late April 2026.¹⁷ Stock surged ~170% over 2025.²⁰

**Why this is a server-memory play.** Record DRAM-segment quarter is the cleanest single equipment data point that HBM capacity additions are accelerating in 2026. AMAT's advanced packaging franchise is the picks-and-shovels for HBM4's move to hybrid bonding (2027) and for chiplet-based XPUs.

---

### 9. ASML (NASDAQ: ASML)

**Profile.** EUV monopolist. DRAM EUV adoption has accelerated as memory makers move from 1a/1b to 1c (and now planning 1d) nodes; EUV layer count per DRAM wafer is rising into the mid-single digits.

**Q1 2026 results (reported April 16, 2026).**
- Total net sales **€8.8B**, in line with guidance.²¹
- Net system sales **€6.3B**; **revenue mix 49% logic / 51% memory** – first quarter ever with memory > logic.²¹
- EUV system revenue **€4.1B+, including 2 High-NA systems** in the quarter.²¹

**Outlook.** Raised **2026 revenue guidance to €36-40B from €34-39B**.²¹ Major EUV adoption in DRAM and similar trajectory expected for High-NA EUV.²¹

**Trading multiples & price.** ASML ~$1,592 on May 10, 2026.¹⁷ Forward P/E **~37-43x**.¹⁷

**Why this is a server-memory play.** Memory > logic in ASML's mix is a structural, not cyclical, signal: DRAM makers are adopting EUV at multiple layers per wafer to enable 1c/1d-node bit-density gains needed for HBM4 and DDR5 capacity scaling. Every Hynix/Samsung/Micron HBM/DDR5 capacity-add now requires more ASML EUV tools than the prior generation.

---

### 10. BE Semiconductor (Besi) (AMS: BESI)

**Profile.** Dutch back-end equipment maker; the **leader in hybrid bonding** for advanced packaging. Hybrid bonding replaces solder microbumps with direct copper-to-copper bonds, enabling much higher-density stacking – and is widely expected to be required for **HBM4/HBM4E** stacks above 12-Hi/16-Hi.

**Q1 2026 results (reported April 23, 2026).**
- Revenue **€184.9M, +11.1% QoQ, +28.3% YoY**.²²
- **Orders €269.7M, +7.7% QoQ**, driven by hybrid-bonding bookings.²²
- **Hybrid-bonder unit orders more than doubled QoQ, surpassing the prior Q2 2024 peak**; customer base expanded to 20 (logic + memory + photonics + mobile).²²
- A second memory customer received two additional evaluation hybrid bonders – **three memory players now testing HBM hybrid stacking**.²²
- Gross margin **63.5%**; Q2 guide **64-66%**.²²

**Outlook.** Besi guides **Q2 2026 revenue +30-40% QoQ**.²² HBM4 hybrid-bonded stacks remain in qualification; **customers eyeing 2026 qualification with mainstream adoption in 2027**, contingent on yields reaching 99.9%+.²²

**Trading.** Trades on Euronext Amsterdam (BESI.AS); ADR is BESIY. Specific May 2026 forward P/E was not consistently reported in English sources searched, but the stock has historically traded at premium multiples (40x+ forward P/E) reflecting the hybrid-bonding monopoly thesis.

**Why this is a server-memory play.** Besi is the single best public-market pure-play on HBM4 hybrid bonding. With three memory players (presumably Hynix, Samsung, Micron) now in evaluation and HBM4 qualifications in 2026, this is the picks-and-shovels equivalent of being long HBM4 unit growth without taking memory ASP risk.

---

## IV. Comparison Table

| Company | Ticker | Category | Latest Qtr Rev | YoY Growth | GM (NG) | Fwd EV/Sales | Fwd P/E | Server-Memory Linkage |
|---|---|---|---|---|---|---|---|---|
| Astera Labs | ALAB | Controller (PCIe/CXL) | $308.4M (Q1'26) | +93% | 76.3% | ~26-28x | ~70x | Leo CXL controller; Aries/Scorpio retiming for HBM-attached XPUs |
| Rambus | RMBS | Controller (DDR5/HBM IP) | $180.2M (Q1'26) | +28% | 79.8% | ~14-16x | ~50-60x | Mid-40s DDR5 RCD share; HBM4 controller IP royalty |
| Montage | 688008 | Controller (DDR5/MRDIMM) | RMB ~1.2B (Q1'25)⁶ | +66% | n/a | n/a (A-share) | n/a | DDR5 RCD ~30-40% share; MRCD/MDB Gen2 sampling |
| Marvell | MRVL | Custom ASIC (HBM-adj.) | $2.22B (Q4 FY26) | +28% | mid-60s | ~8-10x | ~42-44x | Custom XPUs consume HBM3E/HBM4 |
| Penguin / SMART | PENG | Module (DRAM + CXL) | $343M (Q2 FY26) | -6% (mem +63%) | 31.2% | ~1-2x | ~mid-teens | SMART DDR5 modules; CXL NV-CMM and KV-cache |
| Lam Research | LRCX | Equipment (HBM etch) | $5.84B (Q3 FY26) | +24% | ~48% | ~7-8x | ~28-30x | HBM TSV etch; memory at 39% systems mix |
| Applied Materials | AMAT | Equipment (HBM packaging) | $7.0B (Q1 FY26) | -2% | ~48% | ~6-7x | ~31x | Record DRAM segment from HBM/3D packaging |
| ASML | ASML | Equipment (EUV) | €8.8B (Q1'26) | strong | ~52% | ~13-15x | ~37-43x | DRAM EUV; memory > logic for first time |
| BE Semiconductor | BESI / BESIY | Equipment (hybrid bonding) | €184.9M (Q1'26) | +28% | 63.5% | premium | ~40x+ | Pure-play HBM4 hybrid bonding |

*Rev = revenue; GM (NG) = non-GAAP gross margin; Fwd = forward consensus estimates as of early May 2026. Multiples are approximate ranges drawn from cited sources.*

---

## Sources

1. [Astera Labs Reports First Quarter 2026 Financial Results – ALAB IR / GlobeNewswire (May 5, 2026)](https://www.globenewswire.com/news-release/2026/05/05/3288259/0/en/astera-labs-reports-first-quarter-2026-financial-results.html)
2. [ALAB Q1 2026 Earnings Call recap – BigGo Finance](https://finance.biggo.com/news/US_ALAB_2026-05-05)
3. [Astera Labs 10-K / FY2025 results – StockTitan SEC filing](https://www.stocktitan.net/sec-filings/ALAB/10-k-astera-labs-inc-files-annual-report-7e1d9c67b16b.html)
4. [Astera Labs: PCIe, CXL, and the Scale-Up Bet – iamfabian.substack.com](https://iamfabian.substack.com/p/the-architecture-of-ai-interconnect)
5. [Astera Labs valuation/stock price coverage – Simply Wall St](https://simplywall.st/stocks/us/semiconductors/nasdaq-alab/astera-labs/news/astera-labs-alab-valuation-check-after-record-q1-2026-result)
6. [Montage Technology 688008: Performance continues to improve – Yicai Global (April 2025)](https://www.yicaiglobal.com/star50news/2025_04_166816163513262669832)
7. [Montage Technology Q1 2026 update – Futubull](https://news.futunn.com/en/post/46209689/montage-technology-688008-ddr5-penetration-speedup-ai-wave-dual-drive)
8. [Montage Technology Delivers Gen2 MRCD & MDB Engineering Samples for DDR5 MRDIMM – PR Newswire (Jan 2025)](https://www.prnewswire.com/apac/news-releases/montage-technology-delivers-gen2-mrcd--mdb-engineering-samples-for-ddr5-mrdimm-302358328.html)
9. [Rambus Q1 2026 results – BusinessWire / Rambus IR (April 27, 2026)](https://www.businesswire.com/news/home/20260427186060/en/Rambus-Reports-First-Quarter-2026-Financial-Results)
10. [Rambus Reports First Quarter 2026 Financial Results – Rambus.com](https://www.rambus.com/first-quarter-2026-financial-results/)
11. [Rambus: A Leveraged Play On The AI Memory Bottleneck – Seeking Alpha](https://seekingalpha.com/article/4888941-rambus-a-leveraged-play-on-the-ai-memory-bottleneck)
12. [Marvell Technology Reports Fourth Quarter and Fiscal Year 2026 Financial Results – Marvell IR](https://investor.marvell.com/news-events/press-releases/detail/1011/marvell-technology-inc-reports-fourth-quarter-and-fiscal-year-2026-financial-results)
13. [Marvell stock data – StockAnalysis / 24/7 Wall St (May 2026)](https://247wallst.com/investing/2026/05/07/marvell-reaches-all-time-highs-buy-sell-or-hold/)
14. [Penguin Solutions Reports Q2 Fiscal 2026 Financial Results – PENG IR](https://ir.penguinsolutions.com/news/news-details/2026/Penguin-Solutions-Reports-Q2-Fiscal-2026-Financial-Results/default.aspx)
15. [Penguin Solutions PENG Q2 2026 highlights – Yahoo Finance](https://finance.yahoo.com/markets/stocks/articles/penguin-solutions-inc-peng-q2-030035128.html)
16. [Lam Research Q3 FY26 results – PR Newswire (April 22, 2026)](https://www.prnewswire.com/news-releases/lam-research-corporation-reports-financial-results-for-the-quarter-ended-march-29-2026-302750629.html)
17. [Semiconductor Equipment Stocks – Robert Castellano Substack (May 2026)](https://drrobertcastellano.substack.com/p/semiconductor-equipment-stocks-a)
18. [Applied Materials Q1 2026 Press Release – AMAT IR](https://ir.appliedmaterials.com/news-releases/news-release-details/applied-materials-announces-first-quarter-2026-results/)
19. [Applied Materials Q1 FY 2026: AI Demand Lifts Outlook – Futurum](https://futurumgroup.com/insights/applied-materials-q1-fy-2026-ai-demand-lifts-outlook/)
20. [Applied Materials Stock Surged 170% Last Year – TIKR](https://www.tikr.com/blog/applied-materials-stock-surged-170-last-year-can-the-rally-continue-in-2026)
21. [ASML Q1 2026 Results – ASML IR](https://www.asml.com/en/investors/financial-results/q1-2026)
22. [BE Semiconductor Q1 2026 Results – Besi IR / GlobeNewswire (April 23, 2026)](https://www.globenewswire.com/news-release/2026/04/23/3279584/0/en/BE-Semiconductor-Industries-N-V-Announces-Q1-26-Results.html)
