import React from 'react';
import ActionButton from './ui/ActionButton.jsx';
import { UI_ACTION_VARIANTS, UI_COLORS, UI_SPACE, UI_TEXT } from '../ui/tokens.js';

export default function Header({
  presentMode,
  onTogglePresentMode,
  showSaveLoad,
  onToggleSaveLoad,
  savedScenarios,
  onReset,
  onExportJSON,
}) {
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
            fontSize: presentMode ? 28 : UI_TEXT.hero,
            fontWeight: 700,
            color: UI_COLORS.textStrong,
            margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          Family Financial Plan
        </h1>
        <p
          style={{
            fontSize: UI_TEXT.body,
            color: UI_COLORS.textMuted,
            margin: '6px 0 0',
            maxWidth: 720,
          }}
        >
          {presentMode
            ? 'Presentation mode keeps the focus on the core summary and overview story.'
            : 'Adjust assumptions, compare scenarios, and evaluate the current plan.'}
        </p>
      </div>

      <div style={{ display: 'flex', gap: UI_SPACE.sm, alignItems: 'center', flexWrap: 'wrap' }}>
        <ActionButton
          onClick={onTogglePresentMode}
          data-testid='header-present-mode'
          aria-label={presentMode ? 'Exit presentation mode' : 'Enter presentation mode'}
          variant={UI_ACTION_VARIANTS.chip}
          accent={UI_COLORS.positive}
          active={presentMode}
        >
          {presentMode ? 'Exit Presentation' : 'Present'}
        </ActionButton>

        {!presentMode ? (
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

        {!presentMode ? (
          <ActionButton
            onClick={onReset}
            data-testid='header-reset-all'
            aria-label='Reset all assumptions'
            variant={UI_ACTION_VARIANTS.destructive}
          >
            Reset All
          </ActionButton>
        ) : null}

        {!presentMode && onExportJSON ? (
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
