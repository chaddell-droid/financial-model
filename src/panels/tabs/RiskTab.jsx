import React from "react";
import MonteCarloPanel from '../../charts/MonteCarloPanel.jsx';
import SequenceOfReturnsChart from '../../charts/SequenceOfReturnsChart.jsx';
import SavingsDrawdownChart from '../../charts/SavingsDrawdownChart.jsx';
import NetWorthChart from '../../charts/NetWorthChart.jsx';

export default function RiskTab({
  monteCarloProps, seqReturnsProps, savingsDrawdownProps, netWorthProps,
}) {
  return (
    <>
      <MonteCarloPanel {...monteCarloProps} />
      <SequenceOfReturnsChart {...seqReturnsProps} />
      <SavingsDrawdownChart {...savingsDrawdownProps} />
      <NetWorthChart {...netWorthProps} />
    </>
  );
}
