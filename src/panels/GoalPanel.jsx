import { useState } from 'react';
import { fmt } from '../model/formatters.js';
import ActionButton from '../components/ui/ActionButton.jsx';
import SurfaceCard from '../components/ui/SurfaceCard.jsx';
import { UI_ACTION_VARIANTS, UI_COLORS, UI_SPACE, UI_TEXT } from '../ui/tokens.js';

const GOAL_TYPES = [
  { value: 'savings_floor', label: 'Savings Floor' },
  { value: 'savings_target', label: 'Savings Target' },
  { value: 'income_target', label: 'Income Target' },
  { value: 'net_worth_target', label: 'Net Worth Target' },
  { value: 'debt_free', label: 'Debt Free' },
];

const COLOR_PRESETS = ['#4ade80', '#60a5fa', '#fbbf24', '#f87171', '#a78bfa', '#fb923c', '#2dd4bf', '#e879f9'];
const TYPE_LABELS = Object.fromEntries(GOAL_TYPES.map((type) => [type.value, type.label]));

const fieldLabelStyle = {
  fontSize: UI_TEXT.micro,
  color: UI_COLORS.textMuted,
  display: 'block',
  marginBottom: 4,
};

const fieldStyle = {
  width: '100%',
  background: '#0f172a',
  color: '#e2e8f0',
  border: '1px solid #334155',
  borderRadius: 6,
  padding: '8px 10px',
  fontSize: 14,
  boxSizing: 'border-box',
};

function formatGoalTargetLabel(month) {
  if (month <= 0) return 'M0';
  if (month % 12 === 0) return `Y${month / 12}`;
  return `M${month}`;
}

export default function GoalPanel({ goals, goalResults, mcGoalResults, mcRunning, presentMode, onGoalsChange }) {
  const [collapsed, setCollapsed] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newGoal, setNewGoal] = useState({
    name: '',
    type: 'savings_target',
    targetAmount: 50000,
    targetMonth: 36,
    color: '#4ade80',
  });

  const handleAdd = () => {
    if (!newGoal.name.trim()) return;
    const goal = { ...newGoal, id: String(Date.now()), name: newGoal.name.trim() };
    onGoalsChange([...goals, goal]);
    setNewGoal({ name: '', type: 'savings_target', targetAmount: 50000, targetMonth: 36, color: '#4ade80' });
    setShowForm(false);
  };

  const handleDelete = (id) => {
    onGoalsChange(goals.filter((goal) => goal.id !== id));
  };

  const getMcRate = (goalId) => {
    if (!mcGoalResults) return null;
    const entry = mcGoalResults.find((result) => result.goalId === goalId);
    return entry ? entry.successRate : null;
  };

  const mcColor = (rate) => {
    if (rate >= 0.9) return UI_COLORS.positive;
    if (rate >= 0.7) return UI_COLORS.caution;
    return UI_COLORS.destructive;
  };

  return (
    <div data-testid='goal-panel' style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: collapsed ? 0 : 12, gap: UI_SPACE.md, flexWrap: 'wrap' }}>
        <div>
          <button
            type='button'
            onClick={() => setCollapsed(!collapsed)}
            data-testid='goal-panel-toggle'
            aria-expanded={!collapsed}
            style={{
              margin: 0,
              fontSize: UI_TEXT.title,
              color: UI_COLORS.textStrong,
              cursor: 'pointer',
              userSelect: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: UI_SPACE.sm,
              background: 'transparent',
              border: 0,
              padding: 0,
              fontWeight: 700,
            }}
          >
            <span style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, transition: 'transform 0.15s', display: 'inline-block', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
              ▾
            </span>
            Planning goals
            {collapsed && goals.length > 0 ? (
              <span style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, fontWeight: 400 }}>
                ({goalResults.filter((goal) => goal.achieved).length}/{goals.length} on track)
              </span>
            ) : null}
          </button>
          {!collapsed ? (
            <div data-testid='goal-panel-subtitle' style={{ fontSize: UI_TEXT.caption, color: UI_COLORS.textMuted, marginTop: 6, lineHeight: 1.45 }}>
              Track the milestones that tell you whether the plan is working.
            </div>
          ) : null}
        </div>

        {!presentMode && !collapsed ? (
          <ActionButton
            onClick={() => setShowForm(!showForm)}
            data-testid='goal-panel-add-toggle'
            variant={showForm ? UI_ACTION_VARIANTS.secondary : UI_ACTION_VARIANTS.primary}
          >
            {showForm ? 'Close goal form' : 'Add planning goal'}
          </ActionButton>
        ) : null}
      </div>

      {collapsed ? null : (
        <>
          {showForm && !presentMode ? (
            <SurfaceCard data-testid='goal-panel-form' tone='default' padding='md' style={{ marginBottom: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: UI_SPACE.md }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={fieldLabelStyle}>Goal name</label>
                  <input
                    type='text'
                    placeholder='What outcome do you want to track?'
                    data-testid='goal-form-name'
                    value={newGoal.name}
                    onChange={(e) => setNewGoal({ ...newGoal, name: e.target.value })}
                    style={fieldStyle}
                  />
                </div>

                <div>
                  <label style={fieldLabelStyle}>Type</label>
                  <select
                    value={newGoal.type}
                    data-testid='goal-form-type'
                    onChange={(e) => setNewGoal({ ...newGoal, type: e.target.value })}
                    style={{ ...fieldStyle, padding: '8px 8px' }}
                  >
                    {GOAL_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </div>

                <div>
                  <label style={fieldLabelStyle}>Target amount ($)</label>
                  <input
                    type='number'
                    data-testid='goal-form-target-amount'
                    value={newGoal.targetAmount}
                    onChange={(e) => setNewGoal({ ...newGoal, targetAmount: Number(e.target.value) })}
                    disabled={newGoal.type === 'debt_free'}
                    style={fieldStyle}
                  />
                </div>

                <div>
                  <label style={fieldLabelStyle}>
                    Target timeframe: {formatGoalTargetLabel(newGoal.targetMonth)}
                  </label>
                  <input
                    type='range'
                    min={0}
                    max={72}
                    value={newGoal.targetMonth}
                    data-testid='goal-form-target-month'
                    onChange={(e) => setNewGoal({ ...newGoal, targetMonth: Number(e.target.value) })}
                    disabled={newGoal.type === 'debt_free'}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={fieldLabelStyle}>Color</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {COLOR_PRESETS.map((color) => (
                      <button
                        key={color}
                        type='button'
                        onClick={() => setNewGoal({ ...newGoal, color })}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: color,
                          border: newGoal.color === color ? '2px solid #fff' : '2px solid transparent',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: UI_SPACE.sm, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <ActionButton onClick={() => setShowForm(false)} variant={UI_ACTION_VARIANTS.secondary}>
                    Close
                  </ActionButton>
                  <ActionButton
                    data-testid='goal-form-submit'
                    onClick={handleAdd}
                    disabled={!newGoal.name.trim()}
                    variant={UI_ACTION_VARIANTS.primary}
                  >
                    Track goal
                  </ActionButton>
                </div>
              </div>
            </SurfaceCard>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {goals.map((goal) => {
              const result = goalResults?.find((item) => item.id === goal.id);
              const mcRate = getMcRate(goal.id);
              const progress = result?.progress ?? 0;

              return (
                <SurfaceCard key={goal.id} tone='default' padding='md' style={{ position: 'relative' }}>
                  {!presentMode ? (
                    <ActionButton
                      onClick={() => handleDelete(goal.id)}
                      data-testid={`goal-delete-${goal.id}`}
                      variant={UI_ACTION_VARIANTS.ghost}
                      size='sm'
                      style={{ position: 'absolute', top: 8, right: 8, padding: '2px 8px' }}
                      title='Remove goal'
                    >
                      x
                    </ActionButton>
                  ) : null}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: goal.color, flexShrink: 0 }} />
                    <span style={{ fontSize: UI_TEXT.body, fontWeight: 600, color: UI_COLORS.textStrong, flex: 1 }}>{goal.name}</span>
                    <span style={{ fontSize: UI_TEXT.micro, background: '#334155', color: UI_COLORS.textMuted, borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap' }}>
                      {TYPE_LABELS[goal.type] || goal.type}
                    </span>
                  </div>

                  <div style={{ background: '#0f172a', borderRadius: 6, height: 8, marginBottom: 8, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.round(progress * 100)}%`,
                        height: '100%',
                        background: goal.color,
                        borderRadius: 6,
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: UI_SPACE.sm, fontSize: UI_TEXT.caption }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {result ? (
                        <>
                          <span style={{ color: result.achieved ? UI_COLORS.positive : UI_COLORS.destructive, fontSize: 16 }}>
                            {result.achieved ? '✓' : '✗'}
                          </span>
                          <span style={{ color: UI_COLORS.textMuted }}>
                            {result.type === 'debt_free'
                              ? result.description
                              : fmt(result.currentValue)}
                          </span>
                        </>
                      ) : (
                        <span style={{ color: UI_COLORS.textDim }}>Calculating...</span>
                      )}
                    </div>

                    {mcRate !== null ? (
                      <span style={{ fontSize: UI_TEXT.micro, fontWeight: 700, color: mcColor(mcRate), background: '#0f172a', borderRadius: 4, padding: '2px 6px' }}>
                        {Math.round(mcRate * 100)}% MC
                      </span>
                    ) : null}
                    {mcRate === null && mcRunning ? (
                      <span style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim }}>MC...</span>
                    ) : null}
                  </div>
                </SurfaceCard>
              );
            })}
          </div>

          {goals.length === 0 ? (
            <div style={{ color: UI_COLORS.textDim, fontSize: UI_TEXT.caption, textAlign: 'center', padding: '20px 0' }}>
              No planning goals yet. {!presentMode ? 'Open the goal form to track the outcomes that matter most.' : ''}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
