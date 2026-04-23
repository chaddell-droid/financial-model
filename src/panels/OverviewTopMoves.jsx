import React, { useState, useEffect } from 'react';
import SurfaceCard from '../components/ui/SurfaceCard.jsx';
import { fmtFull } from '../model/formatters.js';
import { UI_COLORS, UI_SPACE, UI_TEXT } from '../ui/tokens.js';

/**
 * Auto-computing Top 3 Moves panel for Overview tab.
 * Runs sensitivity analysis on mount (no button click needed).
 */
export default function OverviewTopMoves({ gatherState, onTabChange }) {
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
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
  }, [gatherState]);

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
    <SurfaceCard padding="md" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: UI_SPACE.sm,
      }}>
        <span style={{
          fontSize: UI_TEXT.body, fontWeight: 600,
          color: UI_COLORS.textStrong,
        }}>
          Top 3 Moves
        </span>
        {onTabChange && (
          <button onClick={() => onTabChange('details')} style={{
            background: 'none', border: 'none', color: UI_COLORS.textDim,
            fontSize: 10, cursor: 'pointer', padding: 0, textDecoration: 'underline',
          }}>
            Details →
          </button>
        )}
      </div>

      {running && (
        <p style={{ color: UI_COLORS.textMuted, fontSize: UI_TEXT.caption, margin: 0 }}>
          Analyzing...
        </p>
      )}

      {!running && results && results.length === 0 && (
        <p style={{ color: UI_COLORS.textMuted, fontSize: UI_TEXT.caption, margin: 0 }}>
          Plan is well-optimized — no single-lever improvements found.
        </p>
      )}

      {!running && results && results.length > 0 && (
        <ol style={{ margin: 0, paddingLeft: UI_SPACE.lg, listStyleType: 'decimal' }}>
          {results.map((r, i) => (
            <li key={r.key} style={{
              marginBottom: i < results.length - 1 ? UI_SPACE.sm : 0,
              color: UI_COLORS.textBody,
              fontSize: UI_TEXT.caption,
            }}>
              <div style={{ fontWeight: 500 }}>
                {r.label} by {formatDelta(r)}
              </div>
              <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textMuted, marginTop: 1 }}>
                {r.finalBalanceDelta > 0 && (
                  <span style={{ color: UI_COLORS.positive }}>
                    +{fmtFull(r.finalBalanceDelta)} at end
                  </span>
                )}
                {r.finalBalanceDelta > 0 && r.runwayDelta > 0 && ' · '}
                {r.runwayDelta > 0 && (
                  <span style={{ color: UI_COLORS.positive }}>
                    +{r.runwayDelta} mo runway
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
