import React, { memo } from 'react';
import SurfaceCard from '../components/ui/SurfaceCard.jsx';
import { fmt } from '../model/formatters.js';
import { UI_COLORS, UI_SPACE, UI_TEXT } from '../ui/tokens.js';

const TYPE_LABELS = {
  savings_floor: 'Savings Floor',
  savings_target: 'Savings Target',
  income_target: 'Income Target',
  net_worth_target: 'Net Worth Target',
  debt_free: 'Debt Free',
};

/**
 * Read-only compact goal status display for Overview tab.
 * Shows goal cards with progress bars — no add/delete, no form, no MC rates.
 */
function GoalStatusStrip({ goals, goalResults, onTabChange }) {
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
          Goals
          {goals.length > 0 && goalResults && (
            <span style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, fontWeight: 400, marginLeft: 8 }}>
              {goalResults.filter(g => g.achieved).length}/{goals.length} on track
            </span>
          )}
        </span>
        {onTabChange && (
          <button onClick={() => onTabChange('risk')} style={{
            background: 'none', border: 'none', color: UI_COLORS.textDim,
            fontSize: 10, cursor: 'pointer', padding: 0, textDecoration: 'underline',
          }}>
            Manage →
          </button>
        )}
      </div>

      {goals.length === 0 && (
        <p style={{ color: UI_COLORS.textDim, fontSize: UI_TEXT.caption, margin: 0, textAlign: 'center', padding: '8px 0' }}>
          No goals set.{' '}
          {onTabChange && (
            <button onClick={() => onTabChange('risk')} style={{
              background: 'none', border: 'none', color: UI_COLORS.primary,
              fontSize: UI_TEXT.caption, cursor: 'pointer', padding: 0, textDecoration: 'underline',
            }}>
              Set goals on the Risk tab →
            </button>
          )}
        </p>
      )}

      {goals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {goals.map((goal) => {
            const result = goalResults?.find(item => item.id === goal.id);
            const progress = result?.progress ?? 0;

            return (
              <div key={goal.id} style={{
                background: '#0f172a', borderRadius: 8, padding: '8px 10px',
                border: '1px solid #334155',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: goal.color, flexShrink: 0 }} />
                  <span style={{ fontSize: UI_TEXT.caption, fontWeight: 600, color: UI_COLORS.textStrong, flex: 1 }}>
                    {goal.name}
                  </span>
                  <span style={{ fontSize: UI_TEXT.micro, background: '#334155', color: UI_COLORS.textMuted, borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap' }}>
                    {TYPE_LABELS[goal.type] || goal.type}
                  </span>
                </div>

                <div style={{ background: '#1e293b', borderRadius: 4, height: 6, marginBottom: 4, overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.round(progress * 100)}%`,
                    height: '100%',
                    background: goal.color,
                    borderRadius: 4,
                    transition: 'width 0.3s ease',
                  }} />
                </div>

                {result && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: UI_TEXT.micro }}>
                    <span style={{ color: result.achieved ? UI_COLORS.positive : UI_COLORS.destructive, fontSize: 13 }}>
                      {result.achieved ? '✓' : '✗'}
                    </span>
                    <span style={{ color: UI_COLORS.textMuted }}>
                      {result.type === 'debt_free' ? result.description : fmt(result.currentValue)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SurfaceCard>
  );
}

export default memo(GoalStatusStrip);
