import React, { useState } from 'react';
import SurfaceCard from '../components/ui/SurfaceCard.jsx';
import { fmtFull } from '../model/formatters.js';
import { UI_COLORS, UI_SPACE, UI_TEXT } from '../ui/tokens.js';
import RecommendationCascade from './RecommendationCascade.jsx';

/**
 * Suggested Next Moves panel — Plan-tab footer.
 *
 * Tier 1 (always-live): RecommendationCascade — greedy cascade of next-best
 *   moves with preview-sandbox apply/remove actions. Auto-computes on every
 *   state change; no Calculate button required (FR9).
 *
 * Tier 2 (on-demand awareness): Sensitivities — awareness-only parameter
 *   sweeps (investment return, inflation, MSFT). Shown on explicit Analyze
 *   click so the slower computation doesn't run on every state tick.
 *
 * Tier 3 (on-demand counterfactuals): Income pathways — counterfactual
 *   income expansions (Sarah's rate bumps, Chad W-2, consulting scale).
 *   Also shown on Analyze click.
 */
export default function TopMovesPanel({
  gatherState,
  previewProps = {},
  presentMode = false,
}) {
  const [tier2, setTier2] = useState(null);   // sensitivities
  const [tier3, setTier3] = useState(null);   // income pathways
  const [running, setRunning] = useState(false);
  const awarenessLoaded = tier2 !== null || tier3 !== null;

  const handleAnalyze = () => {
    if (!gatherState) return;
    setRunning(true);
    import('../model/sensitivityAnalysis.js').then(({ computeSensitivities, computeIncomePathways }) => {
      setTimeout(() => {
        const state = gatherState();
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
          Suggested Next Moves
        </span>
        {!presentMode && (
          <button
            onClick={handleAnalyze}
            disabled={running}
            style={{
              padding: `${UI_SPACE.xs}px ${UI_SPACE.md}px`,
              fontSize: UI_TEXT.caption,
              fontWeight: 500,
              border: `1px solid ${UI_COLORS.border}`,
              borderRadius: 6,
              background: 'transparent',
              color: UI_COLORS.textMuted,
              cursor: running ? 'wait' : 'pointer',
              opacity: running ? 0.6 : 1,
            }}
            title="Compute awareness-only sensitivities and income pathways"
          >
            {running ? 'Analyzing…' : awarenessLoaded ? 'Refresh analysis' : 'Show sensitivities & pathways'}
          </button>
        )}
      </div>

      {/* Always-live cascade (Tier 1) */}
      <RecommendationCascade
        gatherState={gatherState}
        previewMoves={previewProps.previewMoves}
        applyPreviewMove={previewProps.applyPreviewMove}
        removePreviewMove={previewProps.removePreviewMove}
        clearPreview={previewProps.clearPreview}
        commitPreview={previewProps.commitPreview}
        saveFromPreview={previewProps.saveFromPreview}
        count={5}
        presentMode={presentMode}
      />

      {tier3 && tier3.length > 0 && <TierThreeList pathways={tier3} />}
      {tier2 && tier2.length > 0 && <TierTwoList sensitivities={tier2} />}
    </SurfaceCard>
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
