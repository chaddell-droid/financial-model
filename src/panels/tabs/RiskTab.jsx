import React from 'react';
import MonteCarloPanel from '../../charts/MonteCarloPanel.jsx';
import SequenceOfReturnsChart from '../../charts/SequenceOfReturnsChart.jsx';
import SavingsDrawdownChart from '../../charts/SavingsDrawdownChart.jsx';
import NetWorthChart from '../../charts/NetWorthChart.jsx';
import SurfaceCard from '../../components/ui/SurfaceCard.jsx';

function RiskQuestion({ testId, step, title, body, children }) {
  return (
    <section data-testid={testId} style={{ marginBottom: 24 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>
          {step}
        </div>
        <div style={{ fontSize: 15, color: '#e2e8f0', fontWeight: 700, marginBottom: 4 }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
          {body}
        </div>
      </div>
      {children}
    </section>
  );
}

export default function RiskTab({
  monteCarloProps,
  seqReturnsProps,
  savingsDrawdownProps,
  netWorthProps,
  sarahWorkYears,
  showEmbeddedBalanceCharts = true,
}) {
  return (
    <>
      <SurfaceCard
        data-testid="risk-workflow-overview"
        tone="featured"
        padding="sm"
        style={{ background: '#0f172a', marginBottom: 20 }}
      >
        <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>
          Risk workflow
        </div>
        <div style={{ fontSize: 15, color: '#e2e8f0', fontWeight: 700, marginBottom: 6 }}>
          Read risk in order: probability, timing, then balance damage.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
          <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.45 }}>
            1. Monte Carlo answers how often the {sarahWorkYears || 6}-year plan stays above zero and how bad the typical downside gets.
          </div>
          <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.45 }}>
            2. Sequence risk shows what happens if the same average returns arrive in the wrong order before the plan stabilizes.
          </div>
          <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.45 }}>
            3. {showEmbeddedBalanceCharts
              ? 'Balance path and net worth stay last so they explain the damage after you understand the probability story.'
              : 'Balance path and net worth stay in the shared rail while you read the risk story here in the main column.'}
          </div>
        </div>
      </SurfaceCard>

      <RiskQuestion
        testId="risk-question-probability"
        step="Question 1"
        title={`How often does the plan stay solvent over the ${sarahWorkYears || 6}-year outlook?`}
        body="Start with probability. Monte Carlo tells you whether the base plan usually survives, what a bad-luck finish looks like, and which assumption moves the result most."
      >
        <MonteCarloPanel {...monteCarloProps} />
      </RiskQuestion>

      <RiskQuestion
        testId="risk-question-sequence"
        step="Question 2"
        title="What if bad returns hit before the plan reaches stability?"
        body="Once the probability story is clear, look at sequencing. This isolates the vulnerable early window where the order of returns matters more than the long-run average."
      >
        <SequenceOfReturnsChart {...seqReturnsProps} />
      </RiskQuestion>

      {showEmbeddedBalanceCharts ? (
        <RiskQuestion
          testId="risk-question-balance"
          step="Question 3"
          title="How much balance damage does a stressed path create?"
          body="Use the balance charts last. They show the practical runway effect after you already understand probability and sequence risk."
        >
          <SavingsDrawdownChart {...savingsDrawdownProps} />
          <NetWorthChart {...netWorthProps} />
        </RiskQuestion>
      ) : null}
    </>
  );
}
