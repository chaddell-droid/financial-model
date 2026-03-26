import React from 'react';
import ActionButton from './ui/ActionButton.jsx';
import { UI_ACTION_VARIANTS, UI_COLORS, UI_SPACE, UI_TEXT } from '../ui/tokens.js';

const EXPERIENCE_COPY = {
  planner: {
    title: 'Family Financial Plan',
    subtitle: 'Adjust assumptions, compare scenarios, and evaluate the current plan.',
  },
  present: {
    title: 'Family Financial Plan',
    subtitle: 'Presentation mode keeps the focus on the core summary and overview story.',
  },
};

export default function Header({
  activeExperience = 'planner',
  presentMode,
  onTogglePresentMode,
  showSaveLoad,
  onToggleSaveLoad,
  savedScenarios,
  onReset,
  onExportJSON,
}) {
  const copy = EXPERIENCE_COPY[activeExperience] || EXPERIENCE_COPY.planner;
  const isPlanner = activeExperience === 'planner';
  const isPresent = activeExperience === 'present';

  return (
    <div
      data-testid='header-bar'
      style={{
        marginBottom: 28,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: UI_SPACE.xl,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h1
          style={{
            fontSize: activeExperience === 'present' ? 28 : UI_TEXT.hero,
            fontWeight: 700,
            color: UI_COLORS.textStrong,
            margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          {copy.title}
        </h1>
        <p
          style={{
            fontSize: UI_TEXT.body,
            color: UI_COLORS.textMuted,
            margin: '6px 0 0',
            maxWidth: 720,
          }}
        >
          {copy.subtitle}
        </p>
      </div>

      <div style={{ display: 'flex', gap: UI_SPACE.sm, alignItems: 'center', flexWrap: 'wrap' }}>
        <ActionButton
          onClick={onTogglePresentMode}
          data-testid='header-present-mode'
          aria-label={presentMode ? 'Exit presentation mode' : 'Enter presentation mode'}
          variant={UI_ACTION_VARIANTS.chip}
          accent={UI_COLORS.positive}
          active={isPresent}
        >
          {presentMode ? 'Exit Presentation' : 'Present'}
        </ActionButton>

        {isPlanner ? (
          <ActionButton
            onClick={onToggleSaveLoad}
            data-testid='header-toggle-save-load'
            aria-label={showSaveLoad ? 'Hide saved scenarios' : 'Show saved scenarios'}
            variant={UI_ACTION_VARIANTS.secondary}
            active={showSaveLoad}
          >
            {showSaveLoad ? 'Hide Scenarios' : `Saved (${savedScenarios.length})`}
          </ActionButton>
        ) : null}

        {isPlanner ? (
          <ActionButton
            onClick={onReset}
            data-testid='header-reset-all'
            aria-label='Reset all assumptions'
            variant={UI_ACTION_VARIANTS.destructive}
          >
            Reset All
          </ActionButton>
        ) : null}

        {isPlanner && onExportJSON ? (
          <ActionButton
            onClick={onExportJSON}
            data-testid='header-export-json'
            aria-label='Export model data as JSON'
            variant={UI_ACTION_VARIANTS.secondary}
            accent={UI_COLORS.primary}
          >
            Export JSON
          </ActionButton>
        ) : null}
      </div>
    </div>
  );
}
