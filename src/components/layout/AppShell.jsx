import React, { memo } from 'react';
import { UI_SPACE } from '../../ui/tokens.js';
import RailDivider from '../RailDivider.jsx';

function AppShell({
  summary,
  tabs,
  workspace,
  rail,
  showRail = true,
  compact = false,
  railPlacement = 'side',
  railWidth = 520,
  onRailWidthChange,
  onRailWidthCommit,
}) {
  const stackedRail = showRail && railPlacement !== 'side';
  const sideRail = showRail && railPlacement === 'side';

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
          gridTemplateColumns: sideRail
            ? `minmax(0, 1fr) 8px ${railWidth}px`
            : 'minmax(0, 1fr)',
          gap: 0,
          alignItems: 'start',
        }}
      >
        <div data-testid='app-shell-workspace' style={{ minWidth: 0, paddingRight: sideRail ? UI_SPACE.md : 0 }}>
          {workspace}
        </div>

        {sideRail ? (
          <RailDivider
            railWidth={railWidth}
            onWidthChange={onRailWidthChange || (() => {})}
            onWidthCommit={onRailWidthCommit || (() => {})}
          />
        ) : null}

        {sideRail ? (
          <div data-testid='app-shell-rail' style={{ position: 'sticky', top: UI_SPACE.lg, alignSelf: 'start', paddingLeft: UI_SPACE.md }}>
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
