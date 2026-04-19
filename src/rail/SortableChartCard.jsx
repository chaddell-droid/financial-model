import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getChartMeta } from './chartRegistry.js';

/**
 * Sortable wrapper for a chart in the rail.
 * Provides drag handle, colored accent, label, and remove button.
 */
export default function SortableChartCard({ id, onRemove, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const meta = getChartMeta(id);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
  };

  return (
    <div ref={setNodeRef} style={style} data-testid={`rail-chart-${id}`}>
      {/* Header bar — drag handle + label + remove */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 8px',
        background: '#0f172a',
        borderRadius: '8px 8px 0 0',
        borderBottom: `2px solid ${meta?.color || '#334155'}`,
        cursor: 'grab',
      }}
        {...attributes}
        {...listeners}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#64748b', cursor: 'grab' }}>⠿</span>
          <span style={{ fontSize: 11, color: meta?.color || '#94a3b8', fontWeight: 600 }}>
            {meta?.label || id}
          </span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(id); }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`Remove ${meta?.label || id} from rail`}
          style={{
            background: 'none', border: 'none', color: '#64748b',
            fontSize: 12, cursor: 'pointer', padding: '2px 4px',
            lineHeight: 1,
          }}
        >✕</button>
      </div>
      {/* Chart content */}
      <div style={{ borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}
