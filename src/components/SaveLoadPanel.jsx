import React from 'react';
import ActionButton from './ui/ActionButton.jsx';
import SurfaceCard from './ui/SurfaceCard.jsx';
import { UI_ACTION_VARIANTS, UI_COLORS, UI_SPACE, UI_TEXT } from '../ui/tokens.js';

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
  compareName,
  onClearCompare,
  onDelete,
  storageStatus,
  storageAvailable,
}) {
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
        {compareName ? (
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
              style={{ background: '#0f172a' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: UI_SPACE.md, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: UI_TEXT.body, color: UI_COLORS.textStrong, fontWeight: 600 }}>
                    {scenario.name}
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
                    aria-label={`${compareName === scenario.name ? 'Stop comparing' : 'Compare'} scenario ${scenario.name}`}
                    variant={UI_ACTION_VARIANTS.secondary}
                    size='sm'
                    accent={UI_COLORS.compare}
                    active={compareName === scenario.name}
                  >
                    {compareName === scenario.name ? 'Comparing now' : 'Compare'}
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
          ? `${savedScenarios.length} saved ${savedScenarios.length === 1 ? 'checkpoint' : 'checkpoints'} on this device${compareName ? ` · comparing ${compareName}` : ''}.`
          : 'This browser session cannot keep saved checkpoints.'}
      </div>
    </SurfaceCard>
  );
}
