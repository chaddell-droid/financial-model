import React from "react";
import { fmtFull } from '../model/formatters.js';

const SummaryAsk = ({
  totalRemainingVesting, data, startingSavings,
  savingsZeroMonth, savingsZeroLabel,
  ssdiApprovalMonth, ssdiBackPayActual, ssdiBackPayMonths,
  retireDebt, debtTotal, debtService,
  moldInclude, moldCost, roofInclude, roofCost, otherInclude, otherProjects,
  bcsParentsAnnual, bcsYearsLeft, bcsFamilyMonthly,
  advanceNeeded, breakevenIdx,
}) => {
  return (
        <div style={{
          background: "linear-gradient(135deg, #1e293b, #0f172a)", borderRadius: 12, padding: 20,
          border: "1px solid #475569", marginTop: 24
        }}>
          <h3 style={{ fontSize: 14, color: "#fbbf24", margin: "0 0 12px", fontWeight: 700 }}>The Ask — Summary</h3>
          <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.8 }}>
            <p style={{ margin: "0 0 10px" }}>
              <strong style={{ color: "#f59e0b" }}>Critical context:</strong> MSFT retirement stock vesting ({fmtFull(totalRemainingVesting)} remaining) declines sharply in late 2027 and ends entirely by August 2028. This is currently funding ~{fmtFull(data[0].msftVesting)}/month of our expenses and is not replaceable.
              {savingsZeroMonth && (<> At the current burn rate, our {fmtFull(startingSavings)} in savings will be depleted in approximately {savingsZeroLabel}.</>)}
            </p>
            <p style={{ margin: "0 0 10px" }}>
              <strong style={{ color: "#4ade80" }}>SSDI back pay:</strong> Upon approval (~{ssdiApprovalMonth} months out), Chad is entitled to an estimated {fmtFull(ssdiBackPayActual)} lump sum covering {ssdiBackPayMonths} months of retroactive benefits (onset Sept 2024, net of attorney fees). This provides a one-time buffer for savings.
            </p>
            {retireDebt && (
              <p style={{ margin: "0 0 10px" }}>
                <strong style={{ color: "#f8fafc" }}>Debt retirement:</strong> Retire high-interest debt ({fmtFull(debtTotal)}) to free up {fmtFull(debtService)}/month in cash flow.
              </p>
            )}
            {moldInclude && (
              <p style={{ margin: "0 0 10px" }}>
                <strong style={{ color: "#f8fafc" }}>Mold remediation:</strong> {fmtFull(moldCost)} — directly impacts Chad's health (MCAS exacerbated by mold exposure). Urgent.
              </p>
            )}
            {roofInclude && (
              <p style={{ margin: "0 0 10px" }}>
                <strong style={{ color: "#f8fafc" }}>Roof replacement:</strong> {fmtFull(roofCost)} — can be phased but needed within 12 months.
              </p>
            )}
            {otherInclude && (
              <p style={{ margin: "0 0 10px" }}>
                <strong style={{ color: "#f8fafc" }}>House projects + toilets:</strong> {fmtFull(otherProjects)} — can be phased over 12{"\u2013"}18 months.
              </p>
            )}
            {bcsParentsAnnual > 25000 && (
              <p style={{ margin: "0 0 10px" }}>
                <strong style={{ color: "#c084fc" }}>Ongoing ({bcsYearsLeft} yrs):</strong> Parents increase BCS contribution from $25K to {fmtFull(bcsParentsAnnual)}/yr (our share: {fmtFull(bcsFamilyMonthly)}/mo → {bcsFamilyMonthly === 0 ? "fully covered" : fmtFull(bcsFamilyMonthly) + "/mo"}).
              </p>
            )}
            <p style={{ margin: "0 0 10px" }}>
              <strong style={{ color: "#f8fafc" }}>Total one-time advance request:</strong>{" "}
              <span style={{ color: "#fbbf24", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", fontSize: 16 }}>
                {fmtFull(advanceNeeded)}
              </span>
            </p>
            <p style={{ margin: 0, color: "#94a3b8", fontSize: 12, fontStyle: "italic" }}>
              With debt retired and SSDI active, monthly cash flow moves from {fmtFull(data[0].netMonthly)} to approximately {fmtFull(data[breakevenIdx >= 0 ? breakevenIdx : 4]?.netMonthly || 0)}/month {"\u2014"} achieving sustainability before vesting ends.
            </p>
          </div>
        </div>
  );
};

export default SummaryAsk;
