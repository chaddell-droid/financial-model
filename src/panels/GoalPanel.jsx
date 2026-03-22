import { useState } from 'react';
import { fmt } from '../model/formatters.js';

const GOAL_TYPES = [
  { value: 'savings_floor', label: 'Savings Floor' },
  { value: 'savings_target', label: 'Savings Target' },
  { value: 'income_target', label: 'Income Target' },
  { value: 'net_worth_target', label: 'Net Worth Target' },
  { value: 'debt_free', label: 'Debt Free' },
];

const COLOR_PRESETS = ['#4ade80', '#60a5fa', '#fbbf24', '#f87171', '#a78bfa', '#fb923c', '#2dd4bf', '#e879f9'];

const TYPE_LABELS = Object.fromEntries(GOAL_TYPES.map(t => [t.value, t.label]));

export default function GoalPanel({ goals, goalResults, mcGoalResults, mcRunning, presentMode, onGoalsChange }) {
  const [collapsed, setCollapsed] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newGoal, setNewGoal] = useState({
    name: '', type: 'savings_target', targetAmount: 50000, targetMonth: 36, color: '#4ade80'
  });

  const handleAdd = () => {
    if (!newGoal.name.trim()) return;
    const goal = { ...newGoal, id: String(Date.now()), name: newGoal.name.trim() };
    onGoalsChange([...goals, goal]);
    setNewGoal({ name: '', type: 'savings_target', targetAmount: 50000, targetMonth: 36, color: '#4ade80' });
    setShowForm(false);
  };

  const handleDelete = (id) => {
    onGoalsChange(goals.filter(g => g.id !== id));
  };

  const getMcRate = (goalId) => {
    if (!mcGoalResults) return null;
    const entry = mcGoalResults.find(r => r.goalId === goalId);
    return entry ? entry.successRate : null;
  };

  const mcColor = (rate) => {
    if (rate >= 0.9) return '#4ade80';
    if (rate >= 0.7) return '#fbbf24';
    return '#f87171';
  };

  const cardStyle = {
    background: '#1e293b',
    borderRadius: 12,
    padding: '16px',
    position: 'relative',
  };

  return (
    <div data-testid="goal-panel" style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: collapsed ? 0 : 12 }}>
        <h3
          onClick={() => setCollapsed(!collapsed)}
          data-testid="goal-panel-toggle"
          style={{ margin: 0, fontSize: 16, color: '#94a3b8', cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span style={{ fontSize: 12, color: '#64748b', transition: 'transform 0.15s', display: 'inline-block', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>{'\u25BC'}</span>
          Goal Tracker
          {collapsed && goals.length > 0 && (
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>
              ({goalResults.filter(g => g.achieved).length}/{goals.length} met)
            </span>
          )}
        </h3>
        {!presentMode && !collapsed && (
          <button
            onClick={() => setShowForm(!showForm)}
            data-testid="goal-panel-add-toggle"
            style={{
              background: showForm ? '#475569' : '#334155',
              color: '#e2e8f0',
              border: 'none',
              borderRadius: 8,
              padding: '6px 14px',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {showForm ? 'Cancel' : '+ Add Goal'}
          </button>
        )}
      </div>

      {collapsed ? null : <>
      {/* Add Goal Form */}
      {showForm && !presentMode && (
        <div data-testid="goal-panel-form" style={{ background: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <input
              type="text"
              placeholder="Goal name..."
              data-testid="goal-form-name"
              value={newGoal.name}
              onChange={e => setNewGoal({ ...newGoal, name: e.target.value })}
              style={{ width: '100%', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, padding: '8px 10px', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>Type</label>
            <select
              value={newGoal.type}
              data-testid="goal-form-type"
              onChange={e => setNewGoal({ ...newGoal, type: e.target.value })}
              style={{ width: '100%', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px', fontSize: 13 }}
            >
              {GOAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>Target Amount ($)</label>
            <input
              type="number"
              data-testid="goal-form-target-amount"
              value={newGoal.targetAmount}
              onChange={e => setNewGoal({ ...newGoal, targetAmount: Number(e.target.value) })}
              disabled={newGoal.type === 'debt_free'}
              style={{ width: '100%', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>
              Target Month: {newGoal.targetMonth} ({Math.floor(newGoal.targetMonth / 12)}Y{newGoal.targetMonth % 12}M)
            </label>
            <input
              type="range" min={0} max={72} value={newGoal.targetMonth}
              data-testid="goal-form-target-month"
              onChange={e => setNewGoal({ ...newGoal, targetMonth: Number(e.target.value) })}
              disabled={newGoal.type === 'debt_free'}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#64748b', display: 'block', marginBottom: 4 }}>Color</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {COLOR_PRESETS.map(c => (
                <button
                  key={c}
                  onClick={() => setNewGoal({ ...newGoal, color: c })}
                  style={{
                    width: 24, height: 24, borderRadius: '50%', background: c,
                    border: newGoal.color === c ? '2px solid #fff' : '2px solid transparent',
                    cursor: 'pointer', padding: 0,
                  }}
                />
              ))}
            </div>
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowForm(false)} style={{ background: '#334155', color: '#94a3b8', border: 'none', borderRadius: 6, padding: '6px 16px', cursor: 'pointer', fontSize: 13 }}>
              Cancel
            </button>
            <button data-testid="goal-form-submit" onClick={handleAdd} disabled={!newGoal.name.trim()} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 16px', cursor: 'pointer', fontSize: 13, opacity: newGoal.name.trim() ? 1 : 0.5 }}>
              Add Goal
            </button>
          </div>
        </div>
      )}

      {/* Goal Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {goals.map(goal => {
          const result = goalResults?.find(r => r.id === goal.id);
          const mcRate = getMcRate(goal.id);
          const progress = result?.progress ?? 0;

          return (
            <div key={goal.id} style={cardStyle}>
              {/* Delete button */}
              {!presentMode && (
                <button
                  onClick={() => handleDelete(goal.id)}
                  data-testid={`goal-delete-${goal.id}`}
                  style={{
                    position: 'absolute', top: 8, right: 8,
                    background: 'transparent', border: 'none', color: '#475569',
                    cursor: 'pointer', fontSize: 16, padding: '2px 6px', lineHeight: 1,
                  }}
                  title="Remove goal"
                >
                  x
                </button>
              )}

              {/* Header: color dot + name + type badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: goal.color, flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', flex: 1 }}>{goal.name}</span>
                <span style={{ fontSize: 10, background: '#334155', color: '#94a3b8', borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap' }}>
                  {TYPE_LABELS[goal.type] || goal.type}
                </span>
              </div>

              {/* Progress bar */}
              <div style={{ background: '#0f172a', borderRadius: 6, height: 8, marginBottom: 8, overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.round(progress * 100)}%`,
                  height: '100%',
                  background: goal.color,
                  borderRadius: 6,
                  transition: 'width 0.3s ease',
                }} />
              </div>

              {/* Result row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {result ? (
                    <>
                      <span style={{ color: result.achieved ? '#4ade80' : '#f87171', fontSize: 16 }}>
                        {result.achieved ? '\u2713' : '\u2717'}
                      </span>
                      <span style={{ color: '#94a3b8' }}>
                        {result.type === 'debt_free'
                          ? result.description
                          : fmt(result.currentValue)}
                      </span>
                    </>
                  ) : (
                    <span style={{ color: '#475569' }}>Calculating...</span>
                  )}
                </div>

                {/* MC badge */}
                {mcRate !== null && (
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: mcColor(mcRate),
                    background: '#0f172a',
                    borderRadius: 4,
                    padding: '2px 6px',
                  }}>
                    {Math.round(mcRate * 100)}% MC
                  </span>
                )}
                {mcRate === null && mcRunning && (
                  <span style={{ fontSize: 11, color: '#475569' }}>MC...</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {goals.length === 0 && (
        <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
          No goals defined. {!presentMode && 'Click "+ Add Goal" to get started.'}
        </div>
      )}
      </>}
    </div>
  );
}
