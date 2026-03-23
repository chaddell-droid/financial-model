import React from "react";
import { fmtFull } from "../model/formatters.js";
import { UI_COLORS, UI_SPACE, UI_TEXT } from "../ui/tokens.js";

export default function ActiveTogglePills({ retireDebt, lifestyleCutsApplied, vanSold, debtService, totalCuts }) {
  const pills = [];
  if (retireDebt) pills.push({ id: 'debt-retired', label: `Debt retired`, detail: `+${fmtFull(debtService)}/mo`, color: UI_COLORS.positive });
  if (lifestyleCutsApplied) pills.push({ id: 'cuts-applied', label: `Cuts applied`, detail: `+${fmtFull(totalCuts)}/mo`, color: UI_COLORS.positive });
  if (vanSold) pills.push({ id: 'van-sold', label: "Van sold", detail: 'Monthly cost removed', color: UI_COLORS.positive });

  return (
    <div
      data-testid='overview-active-plan-summary'
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: UI_SPACE.sm,
        flexWrap: 'wrap',
        marginBottom: UI_SPACE.md,
      }}
    >
      <span style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Active plan
      </span>
      {pills.length === 0 ? (
        <span style={{ fontSize: UI_TEXT.caption, color: UI_COLORS.textDim }}>
          Baseline assumptions active.
        </span>
      ) : pills.map((p) => (
        <span
          key={p.id}
          data-testid={`overview-active-pill-${p.id}`}
          style={{
            fontSize: UI_TEXT.micro,
            fontWeight: 600,
            color: p.color,
            background: 'rgba(74, 222, 128, 0.08)',
            border: `1px solid ${p.color}33`,
            borderRadius: 999,
            padding: '4px 9px',
            letterSpacing: '0.02em',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>{p.label}</span>
          <span style={{ color: UI_COLORS.textDim, fontWeight: 500 }}>{p.detail}</span>
        </span>
      ))}
    </div>
  );
}
