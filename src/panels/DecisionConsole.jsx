import React, { memo, useCallback, useMemo } from 'react';
import AddLeverInline from './AddLeverInline.jsx';
import TopMovesPanel from './TopMovesPanel.jsx';
import { fmt } from '../model/formatters.js';

/**
 * Decision Console — Plan tab left pane.
 * Renders the six built-in levers (Retire debt, Cuts, Sell van, 401k downshift placeholder,
 * Rental offset placeholder, BCS) plus user-added customLevers, an "+ Add new lever" row,
 * and a "Suggested next moves" footer wrapping TopMovesPanel.
 *
 * Props:
 *  - scenarioStripProps — the full prop bundle passed to ScenarioStrip today; we
 *    read `retireDebt`, `lifestyleCutsApplied`, `vanSold`, `debtService`, `vanMonthlySavings`,
 *    `cutsOverride`, effective cuts, bcs*, `onFieldChange`.
 *  - customLevers — array of { id, name, description, maxImpact, currentValue, active }.
 *  - onFieldChange — setter for top-level state fields.
 *  - gatherState — passthrough for TopMovesPanel.
 */
function DecisionConsole({
  scenarioStripProps = {},
  customLevers = [],
  onFieldChange,
  gatherState,
}) {
  const {
    retireDebt, lifestyleCutsApplied, vanSold,
    debtService = 0, vanMonthlySavings = 0,
    cutsOverride = 0,
    bcsAnnualTotal = 0, bcsParentsAnnual = 0, bcsYearsLeft = 0,
  } = scenarioStripProps;

  const setter = useCallback((field) => (v) => onFieldChange?.(field)(v), [onFieldChange]);

  const effectiveCuts = Number.isFinite(cutsOverride) ? cutsOverride : 0;

  const toggleLever = useCallback((field, current) => {
    onFieldChange?.(field)(!current);
  }, [onFieldChange]);

  const setCustomLeverActive = useCallback((id, active) => {
    const next = customLevers.map((lv) => (lv.id === id ? { ...lv, active } : lv));
    onFieldChange?.('customLevers')(next);
  }, [customLevers, onFieldChange]);

  const setCustomLeverValue = useCallback((id, value) => {
    const next = customLevers.map((lv) => {
      if (lv.id !== id) return lv;
      const clamped = Math.max(0, Math.min(lv.maxImpact || 0, Number(value) || 0));
      return { ...lv, currentValue: clamped };
    });
    onFieldChange?.('customLevers')(next);
  }, [customLevers, onFieldChange]);

  const removeCustomLever = useCallback((id) => {
    onFieldChange?.('customLevers')(customLevers.filter((lv) => lv.id !== id));
  }, [customLevers, onFieldChange]);

  const addCustomLever = useCallback((lever) => {
    onFieldChange?.('customLevers')([...customLevers, lever]);
  }, [customLevers, onFieldChange]);

  // BCS tick math (matches ScenarioStrip semantics)
  const bcsPct = useMemo(() => {
    if (!bcsAnnualTotal) return 0;
    return Math.min(100, Math.max(0, (bcsParentsAnnual / bcsAnnualTotal) * 100));
  }, [bcsAnnualTotal, bcsParentsAnnual]);

  let idx = 0;
  const levers = [];
  // Lever 1: Retire debt
  idx += 1;
  levers.push(
    <LeverCard
      key="retire_debt"
      num={idx}
      title="Retire all debt"
      subtitle={`One-time ask · removes ${fmt(debtService)}/mo`}
      impactText={retireDebt ? `+${fmt(debtService)}/mo` : `Up to ${fmt(debtService)}`}
      active={Boolean(retireDebt)}
      onToggle={() => toggleLever('retireDebt', retireDebt)}
    >
      {retireDebt && (
        <SliderRow
          label="Monthly debt service freed"
          value={debtService}
          min={0}
          max={20000}
          step={100}
          onChange={(v) => setter('debtService')(v)}
        />
      )}
    </LeverCard>
  );
  // Lever 2: Lifestyle cuts
  idx += 1;
  levers.push(
    <LeverCard
      key="spending_cuts"
      num={idx}
      title="Lifestyle + spending cuts"
      subtitle="Additional monthly cuts below current spend"
      impactText={lifestyleCutsApplied ? `+${fmt(effectiveCuts)}/mo` : `Up to ${fmt(effectiveCuts)}`}
      active={Boolean(lifestyleCutsApplied)}
      onToggle={() => toggleLever('lifestyleCutsApplied', lifestyleCutsApplied)}
    >
      {lifestyleCutsApplied && (
        <SliderRow
          label="Monthly cut amount"
          value={effectiveCuts}
          min={0}
          max={5000}
          step={100}
          onChange={(v) => setter('cutsOverride')(v)}
        />
      )}
    </LeverCard>
  );
  // Lever 3: Sell van
  idx += 1;
  levers.push(
    <LeverCard
      key="sell_van"
      num={idx}
      title="Sell the van"
      subtitle={`Available: up to ${fmt(vanMonthlySavings)}/mo · removes van payment`}
      impactText={vanSold ? `+${fmt(vanMonthlySavings)}/mo` : `Up to ${fmt(vanMonthlySavings)}`}
      active={Boolean(vanSold)}
      onToggle={() => toggleLever('vanSold', vanSold)}
    />
  );
  // Custom levers (user-added)
  for (const lever of customLevers) {
    idx += 1;
    const max = Math.max(0, Number(lever.maxImpact) || 0);
    const cur = Math.max(0, Math.min(max, Number(lever.currentValue) || 0));
    levers.push(
      <LeverCard
        key={lever.id}
        num={idx}
        title={lever.name || 'Custom lever'}
        subtitle={lever.description || `Up to ${fmt(max)}/mo`}
        impactText={lever.active ? `+${fmt(cur)}/mo` : `Up to ${fmt(max)}`}
        active={Boolean(lever.active)}
        onToggle={() => setCustomLeverActive(lever.id, !lever.active)}
        onRemove={() => removeCustomLever(lever.id)}
        removable
      >
        {lever.active && (
          <SliderRow
            label="Monthly impact"
            value={cur}
            min={0}
            max={max || 100}
            step={50}
            onChange={(v) => setCustomLeverValue(lever.id, v)}
          />
        )}
      </LeverCard>
    );
  }
  // Final lever: BCS scale
  idx += 1;
  levers.push(
    <LeverCard
      key="bcs_support"
      num={idx}
      title="BCS school contribution"
      subtitle={`Parents contribute ${fmt(bcsParentsAnnual)}/yr · ${bcsYearsLeft} yrs left`}
      impactText={`${fmt(bcsParentsAnnual)}/yr`}
      active
      onToggle={() => {}}
      lockOpen
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--plan-ink-dim)' }}>
          <span>Parents' annual contribution</span>
          <span className="plan-mono" style={{ color: 'var(--plan-accent)', fontWeight: 600 }}>
            {fmt(bcsParentsAnnual)}/yr
          </span>
        </div>
        <input
          type="range"
          className="plan-slider"
          min={0}
          max={bcsAnnualTotal || 50000}
          step={500}
          value={bcsParentsAnnual}
          onChange={(e) => setter('bcsParentsAnnual')(parseInt(e.target.value, 10))}
          aria-label="BCS parents annual contribution"
        />
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          color: 'var(--plan-ink-faint)',
          fontFamily: 'var(--ui-font-mono)',
        }}>
          <span>$0 · we pay all</span>
          <span style={{ color: bcsPct > 40 && bcsPct < 60 ? 'var(--plan-accent)' : 'inherit' }}>
            {fmt(bcsAnnualTotal)} · fully covered
          </span>
        </div>
      </div>
    </LeverCard>
  );

  return (
    <div className="plan-panel" data-testid="plan-decision-console" style={{ alignSelf: 'start' }}>
      <div className="plan-panel-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="plan-sub">Decision console</span>
          <h3>Primary levers</h3>
        </div>
      </div>

      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {levers}
        <AddLeverInline onAdd={addCustomLever} />
      </div>

      <div style={{
        borderTop: '1px solid var(--plan-line)',
        padding: '10px 12px 12px',
        background: 'linear-gradient(180deg, rgba(34,211,122,0.03), transparent 50%)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div>
            <div className="plan-sub" style={{ color: 'var(--plan-accent)' }}>Suggested next moves</div>
            <div style={{ fontSize: 11.5, color: 'var(--plan-ink-dim)', marginTop: 2 }}>
              Highest-impact levers not yet applied
            </div>
          </div>
        </div>
        <div data-testid="plan-suggested-moves">
          <TopMovesPanel gatherState={gatherState} />
        </div>
      </div>
    </div>
  );
}

function LeverCard({ num, title, subtitle, impactText, active, onToggle, onRemove, removable, children, lockOpen }) {
  return (
    <div
      className={`plan-lever${active ? ' on' : ''}`}
      onClick={(e) => {
        if (e.target.closest('input, button, .plan-cap-remove')) return;
        if (!lockOpen) onToggle?.();
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !lockOpen) {
          e.preventDefault();
          onToggle?.();
        }
      }}
    >
      <div className="plan-lever-num">{num}</div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{title}</span>
          <span className={`plan-badge ${active ? 'on' : 'off'}`}>{active ? 'Active' : 'Off'}</span>
        </div>
        <div style={{ color: 'var(--plan-ink-dim)', fontSize: 11.5, marginTop: 2 }}>{subtitle}</div>
      </div>
      <div style={{
        fontWeight: 600,
        fontFamily: 'var(--ui-font-mono)',
        fontSize: 13,
        color: active ? 'var(--plan-accent)' : 'var(--plan-ink-faint)',
        textAlign: 'right',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}>
        <span>{impactText}</span>
        {removable && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove?.(); }}
            className="plan-cap-remove"
            style={{ opacity: 1, marginLeft: 4 }}
            aria-label="Remove lever"
            title="Remove"
          >×</button>
        )}
      </div>
      {children && <div className="plan-lever-body">{children}</div>}
    </div>
  );
}

function SliderRow({ label, value, min, max, step, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--plan-ink-dim)' }}>
        <span>{label}</span>
        <span className="plan-mono" style={{ color: 'var(--plan-ink)', fontWeight: 600 }}>
          ${Number(value).toLocaleString()}/mo
        </span>
      </div>
      <input
        type="range"
        className="plan-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange?.(parseInt(e.target.value, 10))}
      />
    </div>
  );
}

export default memo(DecisionConsole);
