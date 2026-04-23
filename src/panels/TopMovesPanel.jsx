import React, { useState } from 'react';
import SurfaceCard from '../components/ui/SurfaceCard.jsx';
import { fmtFull } from '../model/formatters.js';
import { UI_COLORS, UI_SPACE, UI_TEXT } from '../ui/tokens.js';

/**
 * Your Top 3 Moves — two-tier action/awareness panel.
 *
 * Tier 1: "Levers to pull" — ranked INACTIVE Primary Levers (built-in + custom).
 *         Each is a real click on the Decision Console. Driven by computeTopMoves.
 *
 * Tier 2: "Sensitivities to watch" — 1-2 parameter sensitivities for awareness.
 *         Not presented as actions. Driven by computeSensitivities.
 */
export default function TopMovesPanel({ gatherState }) {
  const [tier1, setTier1] = useState(null);   // lever moves
  const [tier2, setTier2] = useState(null);   // sensitivities
  const [tier3, setTier3] = useState(null);   // income pathways
  const [running, setRunning] = useState(false);

  const handleCalculate = () => {
    if (!gatherState) return;
    setRunning(true);
    import('../model/sensitivityAnalysis.js').then(({ computeTopMoves, computeSensitivities, computeIncomePathways }) => {
      setTimeout(() => {
        const state = gatherState();
        setTier1(computeTopMoves(state, 3));
        setTier2(computeSensitivities(state, 2));
        setTier3(computeIncomePathways(state, 3));
        setRunning(false);
      }, 50);
    });
  };

  return (
    <SurfaceCard style={{ marginTop: UI_SPACE.lg }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: UI_SPACE.md,
      }}>
        <span style={{
          fontSize: UI_TEXT.title, fontWeight: 600,
          color: UI_COLORS.textStrong,
        }}>
          Your Top 3 Moves
        </span>
        <button
          onClick={handleCalculate}
          disabled={running}
          style={{
            padding: `${UI_SPACE.xs}px ${UI_SPACE.md}px`,
            fontSize: UI_TEXT.body,
            fontWeight: 500,
            border: `1px solid ${UI_COLORS.primary}`,
            borderRadius: 6,
            background: 'transparent',
            color: UI_COLORS.primary,
            cursor: running ? 'wait' : 'pointer',
            opacity: running ? 0.6 : 1,
          }}
        >
          {running ? 'Analyzing...' : 'Calculate'}
        </button>
      </div>

      {!tier1 && !running && (
        <p style={{
          color: UI_COLORS.textMuted,
          fontSize: UI_TEXT.body,
          margin: 0,
        }}>
          Click Calculate to find your highest-impact moves.
        </p>
      )}

      {tier1 && <TierOneList moves={tier1} />}
      {tier3 && tier3.length > 0 && <TierThreeList pathways={tier3} />}
      {tier2 && tier2.length > 0 && <TierTwoList sensitivities={tier2} />}

      {tier1 && tier1.length === 0 && (!tier2 || tier2.length === 0) && (!tier3 || tier3.length === 0) && (
        <p style={{
          color: UI_COLORS.textMuted,
          fontSize: UI_TEXT.body,
          margin: 0,
        }}>
          Your plan is fully leveraged — every primary lever is already active.
        </p>
      )}
    </SurfaceCard>
  );
}

// ─── Tier 1: Levers to pull ───
function TierOneList({ moves }) {
  if (moves.length === 0) {
    return (
      <div>
        <SectionHeader title="Levers to pull" subtitle="Actions available on the Decision Console" />
        <p style={{
          color: UI_COLORS.textMuted,
          fontSize: UI_TEXT.caption,
          margin: `${UI_SPACE.sm}px 0 ${UI_SPACE.md}px`,
          fontStyle: 'italic',
        }}>
          Every primary lever is already active. Check the sensitivities below.
        </p>
      </div>
    );
  }
  return (
    <div>
      <SectionHeader title="Levers to pull" subtitle="Inactive levers ranked by impact" />
      <ol style={{
        margin: `${UI_SPACE.sm}px 0 ${UI_SPACE.md}px`,
        paddingLeft: UI_SPACE.xl,
        listStyleType: 'decimal',
      }}>
        {moves.map((r, i) => (
          <li key={r.key} style={{
            marginBottom: i < moves.length - 1 ? UI_SPACE.md : 0,
            color: UI_COLORS.textBody,
            fontSize: UI_TEXT.body,
          }}>
            <div style={{ fontWeight: 500 }}>
              {r.label}
              {r.delta > 0 && (
                <span style={{ color: UI_COLORS.positive, marginLeft: 6, fontFamily: "'JetBrains Mono', monospace" }}>
                  +{fmtFull(r.delta)}/mo
                </span>
              )}
            </div>
            <div style={{
              fontSize: UI_TEXT.caption,
              color: UI_COLORS.textMuted,
              marginTop: 2,
            }}>
              {r.finalBalanceDelta > 0 && (
                <span style={{ color: UI_COLORS.positive }}>
                  +{fmtFull(r.finalBalanceDelta)} at end of plan
                </span>
              )}
              {r.finalBalanceDelta > 0 && r.breakevenMonthDelta < 0 && ' · '}
              {r.breakevenMonthDelta < 0 && (
                <span style={{ color: UI_COLORS.positive }}>
                  Breakeven {Math.abs(r.breakevenMonthDelta)} month{Math.abs(r.breakevenMonthDelta) !== 1 ? 's' : ''} sooner
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── Tier 2: Sensitivities (awareness only) ───
function TierTwoList({ sensitivities }) {
  return (
    <div style={{
      marginTop: UI_SPACE.md,
      paddingTop: UI_SPACE.md,
      borderTop: `1px dashed ${UI_COLORS.border}`,
    }}>
      <SectionHeader
        title="Sensitivities to watch"
        subtitle="Assumptions that move the outcome — context, not actions"
      />
      <ul style={{
        margin: `${UI_SPACE.sm}px 0 0`,
        padding: 0,
        listStyle: 'none',
      }}>
        {sensitivities.map((s) => {
          const deltaSign = s.delta > 0 ? '+' : '';
          const deltaStr = `${deltaSign}${s.delta}${s.unit}`;
          const impact = s.finalBalanceDelta;
          const impactColor = impact >= 0 ? UI_COLORS.positive : UI_COLORS.destructive;
          const impactStr = `${impact >= 0 ? '+' : ''}${fmtFull(impact)} at end of plan`;
          return (
            <li
              key={s.key}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                fontSize: UI_TEXT.caption,
                color: UI_COLORS.textMuted,
                padding: `${UI_SPACE.xs}px 0`,
              }}
            >
              <span>
                {s.label} <span style={{ color: UI_COLORS.textDim }}>({deltaStr})</span>
              </span>
              <span style={{ color: impactColor, fontFamily: "'JetBrains Mono', monospace" }}>
                {impactStr}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── Tier 3: Income pathways (counterfactuals to pursue, not click) ───
function TierThreeList({ pathways }) {
  if (pathways.length === 0) return null;
  return (
    <div style={{
      marginTop: UI_SPACE.md,
      paddingTop: UI_SPACE.md,
      borderTop: `1px dashed ${UI_COLORS.border}`,
    }}>
      <SectionHeader
        title="Income pathways"
        subtitle="Upside you could pursue — negotiation, job change, business scaling"
      />
      <ul style={{
        margin: `${UI_SPACE.sm}px 0 0`,
        padding: 0,
        listStyle: 'none',
      }}>
        {pathways.map((p) => (
          <li
            key={p.key}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              fontSize: UI_TEXT.body,
              color: UI_COLORS.textBody,
              padding: `${UI_SPACE.xs}px 0`,
            }}
          >
            <span>
              <span style={{ color: UI_COLORS.primary, marginRight: 4 }}>Pursue →</span>
              {p.label}
            </span>
            <span style={{ color: UI_COLORS.positive, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
              +{fmtFull(p.finalBalanceDelta)} at end of plan
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div>
      <div style={{
        fontSize: UI_TEXT.label,
        fontWeight: 600,
        color: UI_COLORS.textBody,
      }}>
        {title}
      </div>
      <div style={{
        fontSize: UI_TEXT.micro,
        color: UI_COLORS.textDim,
        marginTop: 1,
      }}>
        {subtitle}
      </div>
    </div>
  );
}
