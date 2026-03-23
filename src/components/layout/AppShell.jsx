import React, { memo } from 'react';
import { UI_SPACE } from '../../ui/tokens.js';

function AppShell({
  summary,
  tabs,
  workspace,
  rail,
  showRail = true,
  compact = false,
  railPlacement = 'side',
}) {
  const stackedRail = showRail && railPlacement !== 'side';

  return (
    <div
      data-testid='app-shell'
      data-compact={compact ? 'true' : 'false'}
      data-rail-placement={showRail ? railPlacement : 'hidden'}
      style={{ display: 'grid', gap: UI_SPACE.xl }}
    >
      {summary ? <div data-testid='app-shell-summary'>{summary}</div> : null}
      {tabs ? <div data-testid='app-shell-tabs'>{tabs}</div> : null}

      <div
        data-testid='app-shell-body'
        style={{
          display: 'grid',
          gridTemplateColumns: showRail && railPlacement === 'side'
            ? 'minmax(0, 1fr) minmax(320px, 420px)'
            : 'minmax(0, 1fr)',
          gap: UI_SPACE.xl,
          alignItems: 'start',
        }}
      >
        <div data-testid='app-shell-workspace' style={{ minWidth: 0 }}>
          {workspace}
        </div>

        {showRail && railPlacement === 'side' ? (
          <div data-testid='app-shell-rail' style={{ position: 'sticky', top: UI_SPACE.lg, alignSelf: 'start' }}>
            {rail}
          </div>
        ) : null}
      </div>

      {stackedRail ? (
        <div data-testid='app-shell-rail' style={{ minWidth: 0 }}>
          {rail}
        </div>
      ) : null}
    </div>
  );
}

export default memo(AppShell);
