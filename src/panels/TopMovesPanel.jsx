import React, { useState } from 'react';
import SurfaceCard from '../components/ui/SurfaceCard.jsx';
import { fmtFull } from '../model/formatters.js';
import { UI_COLORS, UI_SPACE, UI_TEXT } from '../ui/tokens.js';

export default function TopMovesPanel({ gatherState }) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);

  const handleCalculate = () => {
    if (!gatherState) return;
    setRunning(true);
    import('../model/sensitivityAnalysis.js').then(({ computeTopMoves }) => {
      setTimeout(() => {
        const state = gatherState();
        const moves = computeTopMoves(state);
        setResults(moves);
        setRunning(false);
      }, 50);
    });
  };

  const formatDelta = (v) => {
    if (v.unit === 'toggle') return v.label;
    const abs = Math.abs(v.delta);
    const sign = v.delta > 0 ? '+' : '-';
    if (v.unit === '$/hr') return `${sign}$${abs}/hr`;
    if (v.unit === '$/mo') return `${sign}$${abs}/mo`;
    if (v.unit === '$/yr') return `${sign}$${abs.toLocaleString()}/yr`;
    if (v.unit === '%') return `${sign}${abs}%`;
    if (v.unit === 'months') return `${abs} months ${v.delta < 0 ? 'sooner' : 'later'}`;
    if (v.unit === 'clients') return `${sign}${abs} client${abs !== 1 ? 's' : ''}`;
    return `${sign}${abs} ${v.unit}`;
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

      {!results && !running && (
        <p style={{
          color: UI_COLORS.textMuted,
          fontSize: UI_TEXT.body,
          margin: 0,
        }}>
          Click Calculate to find your highest-impact moves.
        </p>
      )}

      {results && results.length === 0 && (
        <p style={{
          color: UI_COLORS.textMuted,
          fontSize: UI_TEXT.body,
          margin: 0,
        }}>
          No single-lever improvements found. Your plan may already be well-optimized.
        </p>
      )}

      {results && results.length > 0 && (
        <ol style={{
          margin: 0, paddingLeft: UI_SPACE.xl,
          listStyleType: 'decimal',
        }}>
          {results.map((r, i) => (
            <li key={r.key} style={{
              marginBottom: i < results.length - 1 ? UI_SPACE.md : 0,
              color: UI_COLORS.textBody,
              fontSize: UI_TEXT.body,
            }}>
              <div style={{ fontWeight: 500 }}>
                {r.label} by {formatDelta(r)}
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
                {r.finalBalanceDelta > 0 && r.runwayDelta > 0 && ' · '}
                {r.runwayDelta > 0 && (
                  <span style={{ color: UI_COLORS.positive }}>
                    Runway extends {r.runwayDelta} month{r.runwayDelta !== 1 ? 's' : ''}
                  </span>
                )}
                {r.finalBalanceDelta <= 0 && r.runwayDelta > 0 && (
                  <span style={{ color: UI_COLORS.positive }}>
                    Runway extends {r.runwayDelta} month{r.runwayDelta !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </SurfaceCard>
  );
}
