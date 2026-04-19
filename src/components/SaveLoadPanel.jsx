import React, { useState } from 'react';
import ActionButton from './ui/ActionButton.jsx';
import SurfaceCard from './ui/SurfaceCard.jsx';
import { UI_ACTION_VARIANTS, UI_COLORS, UI_SPACE, UI_RADII, UI_TEXT } from '../ui/tokens.js';
import { SCENARIO_TEMPLATES } from '../model/scenarioTemplates.js';

function getStorageMessage(storageStatus) {
  if (storageStatus === 'saved') return { text: 'Checkpoint saved locally.', color: UI_COLORS.positive };
  if (storageStatus === 'no-storage') return { text: 'Saved scenarios are unavailable in this browser session.', color: UI_COLORS.destructive };
  if (storageStatus === 'set-returned-null') return { text: 'The current checkpoint could not be saved.', color: UI_COLORS.destructive };
  if (storageStatus?.startsWith('error')) return { text: storageStatus, color: UI_COLORS.destructive };
  return null;
}

export default function SaveLoadPanel({
  showSaveLoad,
  savedScenarios,
  scenarioName,
  onScenarioNameChange,
  onSave,
  onLoad,
  onCompare,
  comparisons,
  compareColors,
  onClearCompare,
  onDelete,
  onApplyTemplate,
  onCompareTemplate,
  storageStatus,
  storageAvailable,
}) {
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const isComparing = (name) => (comparisons || []).some(c => c.name === name);
  const compIdx = (name) => (comparisons || []).findIndex(c => c.name === name);
  const hasComparisons = (comparisons || []).length > 0;

  if (!showSaveLoad) return null;

  const storageMessage = getStorageMessage(storageStatus);

  return (
    <SurfaceCard data-testid='save-load-panel' tone='default' padding='lg' style={{ marginBottom: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: UI_SPACE.sm, alignItems: 'start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: UI_TEXT.title, color: UI_COLORS.textStrong, fontWeight: 700, marginBottom: 4 }}>
            Scenario workspace
          </div>
          <div style={{ fontSize: UI_TEXT.caption, color: UI_COLORS.textMuted, lineHeight: 1.45 }}>
            Save the current plan as a checkpoint, reload an earlier version, or compare it against what you are editing now.
          </div>
        </div>
        {hasComparisons ? (
          <ActionButton onClick={onClearCompare} variant={UI_ACTION_VARIANTS.secondary} size='sm'>
            Stop comparing
          </ActionButton>
        ) : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: UI_SPACE.sm, alignItems: 'center', marginBottom: 12 }}>
        <input
          type='text'
          value={scenarioName}
          onChange={(e) => onScenarioNameChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSave(scenarioName)}
          data-testid='save-load-name'
          aria-label='Scenario name'
          placeholder='Name this scenario...'
          style={{
            width: '100%',
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: 6,
            color: '#e2e8f0',
            padding: '8px 12px',
            fontSize: UI_TEXT.body,
            outline: 'none',
          }}
        />
        <ActionButton
          onClick={() => onSave(scenarioName)}
          disabled={!scenarioName.trim()}
          data-testid='save-load-save-current'
          aria-label='Save current scenario'
          variant={UI_ACTION_VARIANTS.primary}
        >
          Save checkpoint
        </ActionButton>
      </div>

      {storageMessage ? (
        <div style={{ fontSize: UI_TEXT.micro, color: storageMessage.color, marginBottom: 12 }}>
          {storageMessage.text}
        </div>
      ) : null}

      {onApplyTemplate && (
        <div style={{ marginBottom: UI_SPACE.md }}>
          <button
            onClick={() => setTemplatesOpen(!templatesOpen)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              display: 'flex', alignItems: 'center', gap: UI_SPACE.xs, width: '100%',
            }}
          >
            <span style={{
              fontSize: UI_TEXT.micro, color: UI_COLORS.caution, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              Quick Templates
            </span>
            <span style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim }}>
              {templatesOpen ? '\u25B4' : '\u25BE'}
            </span>
          </button>

          {templatesOpen && (
            <div style={{ display: 'grid', gap: UI_SPACE.xs, marginTop: UI_SPACE.xs }}>
              {SCENARIO_TEMPLATES.map((t) => (
                <div
                  key={t.id}
                  data-testid={`template-${t.id}`}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    gap: UI_SPACE.sm, padding: `${UI_SPACE.xs}px ${UI_SPACE.sm}px`,
                    background: scenarioName === t.name ? '#1e3a5f' : isComparing(t.name) ? '#3b2a1a' : '#0f172a',
                    borderRadius: UI_RADII.sm,
                    border: scenarioName === t.name ? `1px solid ${UI_COLORS.primary}` : isComparing(t.name) ? `1px solid ${(compareColors || [])[compIdx(t.name)] || UI_COLORS.compare}` : '1px solid #334155',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: UI_TEXT.caption, color: scenarioName === t.name ? UI_COLORS.primary : UI_COLORS.textStrong, fontWeight: 600 }}>
                        {t.name}
                      </span>
                      {scenarioName === t.name && (
                        <span style={{ fontSize: 9, color: UI_COLORS.primary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active</span>
                      )}
                      {isComparing(t.name) && (
                        <span style={{ fontSize: 9, color: (compareColors || [])[compIdx(t.name)] || UI_COLORS.compare, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Comparing</span>
                      )}
                    </div>
                    <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, lineHeight: 1.3 }}>
                      {t.description}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {onCompareTemplate && (
                      <ActionButton
                        onClick={() => onCompareTemplate(t.name, t.overrides)}
                        data-testid={`template-compare-${t.id}`}
                        variant={UI_ACTION_VARIANTS.secondary}
                        size='sm'
                        accent={UI_COLORS.compare}
                        active={isComparing(t.name)}
                      >
                        {isComparing(t.name) ? 'Comparing' : 'Compare'}
                      </ActionButton>
                    )}
                    <ActionButton
                      onClick={() => onApplyTemplate(t.name, t.overrides)}
                      data-testid={`template-apply-${t.id}`}
                      variant={UI_ACTION_VARIANTS.ghost}
                      size='sm'
                      accent={UI_COLORS.caution}
                    >
                      Apply
                    </ActionButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {savedScenarios.length === 0 ? (
        <div style={{ fontSize: UI_TEXT.caption, color: UI_COLORS.textDim, fontStyle: 'italic' }}>
          No saved scenarios yet. Save a version of the plan once you have something you want to compare.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {savedScenarios.map((scenario, index) => (
            <SurfaceCard
              key={index}
              data-testid={`save-load-row-${index}`}
              data-scenario-name={scenario.name}
              tone='featured'
              padding='sm'
              style={{
                background: scenarioName === scenario.name ? '#1e3a5f' : isComparing(scenario.name) ? '#3b2a1a' : '#0f172a',
                border: scenarioName === scenario.name ? `1px solid ${UI_COLORS.primary}` : isComparing(scenario.name) ? `1px solid ${(compareColors || [])[compIdx(scenario.name)] || UI_COLORS.compare}` : undefined,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: UI_SPACE.md, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: UI_TEXT.body, color: scenarioName === scenario.name ? UI_COLORS.primary : UI_COLORS.textStrong, fontWeight: 600 }}>
                      {scenario.name}
                    </span>
                    {scenarioName === scenario.name && (
                      <span style={{ fontSize: 9, color: UI_COLORS.primary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active</span>
                    )}
                    {isComparing(scenario.name) && (
                      <span style={{ fontSize: 9, color: (compareColors || [])[compIdx(scenario.name)] || UI_COLORS.compare, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Comparing</span>
                    )}
                  </div>
                  <div style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textDim, marginTop: 2 }}>
                    {new Date(scenario.savedAt).toLocaleDateString()} {new Date(scenario.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <ActionButton onClick={() => onLoad(scenario)} data-testid={`save-load-load-${index}`} aria-label={`Load scenario ${scenario.name}`} variant={UI_ACTION_VARIANTS.secondary} size='sm' accent={UI_COLORS.positive}>
                    Load
                  </ActionButton>
                  <ActionButton onClick={() => onSave(scenario.name)} data-testid={`save-load-update-${index}`} aria-label={`Update scenario ${scenario.name}`} variant={UI_ACTION_VARIANTS.secondary} size='sm' accent={UI_COLORS.primary}>
                    Update checkpoint
                  </ActionButton>
                  <ActionButton
                    onClick={() => onCompare(scenario.name, scenario.state)}
                    data-testid={`save-load-compare-${index}`}
                    aria-label={`${isComparing(scenario.name) ? 'Stop comparing' : 'Compare'} scenario ${scenario.name}`}
                    variant={UI_ACTION_VARIANTS.secondary}
                    size='sm'
                    accent={UI_COLORS.compare}
                    active={isComparing(scenario.name)}
                  >
                    {isComparing(scenario.name) ? 'Comparing' : 'Compare'}
                  </ActionButton>
                  <ActionButton onClick={() => onDelete(scenario.name)} data-testid={`save-load-delete-${index}`} aria-label={`Delete scenario ${scenario.name}`} variant={UI_ACTION_VARIANTS.destructive} size='sm'>
                    Delete
                  </ActionButton>
                </div>
              </div>
            </SurfaceCard>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10, fontSize: UI_TEXT.micro, color: UI_COLORS.textDim }}>
        {storageAvailable
          ? `${savedScenarios.length} saved ${savedScenarios.length === 1 ? 'checkpoint' : 'checkpoints'} on this device${hasComparisons ? ` · comparing ${comparisons.map(c => c.name).join(', ')}` : ''}.`
          : 'This browser session cannot keep saved checkpoints.'}
      </div>
    </SurfaceCard>
  );
}
