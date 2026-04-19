import React, { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import SortableChartCard from './SortableChartCard.jsx';
import ChartPicker from './ChartPicker.jsx';
import { UI_COLORS, UI_TEXT, UI_SPACE } from '../ui/tokens.js';

/**
 * Renders the right rail charts in a drag-and-drop sortable container.
 * Charts are resolved from chartIds → component map → rendered with props.
 *
 * Props:
 *   tab - current tab name (for display)
 *   chartIds - array of chart IDs to render in order
 *   componentMap - { chartId: ReactComponent } mapping
 *   propsMap - { chartId: props } mapping
 *   onReorder(fromIndex, toIndex) - called when a chart is dragged to a new position
 *   onRemove(chartId) - called when a chart is removed
 *   onAdd(chartId) - called when a chart is added from the picker
 *   onReset() - called to reset current tab to defaults
 */
export default function RailRenderer({ tab, chartIds, componentMap, propsMap, onReorder, onRemove, onAdd, onReset, onClearAll, onSave, isModified }) {
  const [showPicker, setShowPicker] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = chartIds.indexOf(active.id);
    const newIndex = chartIds.indexOf(over.id);
    if (oldIndex >= 0 && newIndex >= 0) {
      onReorder(oldIndex, newIndex);
    }
  };

  return (
    <div data-testid="rail-renderer" style={{ display: 'grid', gap: UI_SPACE.md }}>
      {/* Rail header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: `0 ${UI_SPACE.xs}px`,
      }}>
        <span style={{ fontSize: UI_TEXT.micro, color: UI_COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
          Charts
        </span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {isModified && onSave && (
            <button
              onClick={onSave}
              style={{
                background: 'none', border: 'none', color: UI_COLORS.positive,
                fontSize: 10, cursor: 'pointer', padding: '2px 6px', fontWeight: 700,
              }}
              aria-label="Save chart layout"
            >
              Save
            </button>
          )}
          {chartIds.length > 0 && onClearAll && (
            <button
              onClick={onClearAll}
              style={{
                background: 'none', border: 'none', color: UI_COLORS.textDim,
                fontSize: 10, cursor: 'pointer', padding: '2px 6px',
              }}
              aria-label="Clear all charts"
            >
              Clear
            </button>
          )}
          <button
            onClick={onReset}
            style={{
              background: 'none', border: 'none', color: UI_COLORS.textDim,
              fontSize: 10, cursor: 'pointer', padding: '2px 6px',
            }}
            aria-label="Reset charts to saved layout"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Sortable chart list */}
      {chartIds.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={chartIds} strategy={verticalListSortingStrategy}>
            <div style={{ display: 'grid', gap: UI_SPACE.md }}>
              {chartIds.map((id) => {
                const Component = componentMap[id];
                const props = propsMap[id];
                if (!Component || !props) return null;
                return (
                  <SortableChartCard key={id} id={id} onRemove={onRemove}>
                    <Component {...props} />
                  </SortableChartCard>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div style={{
          padding: UI_SPACE.lg, textAlign: 'center',
          color: UI_COLORS.textDim, fontSize: UI_TEXT.caption,
          border: `1px dashed ${UI_COLORS.border}`, borderRadius: 8,
        }}>
          No charts selected. Add charts below.
        </div>
      )}

      {/* Add chart button / picker */}
      {showPicker ? (
        <ChartPicker
          currentIds={chartIds}
          onAdd={(id) => { onAdd(id); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
        />
      ) : (
        <button
          onClick={() => setShowPicker(true)}
          data-testid="rail-add-chart"
          style={{
            background: 'none', border: `1px dashed ${UI_COLORS.border}`,
            borderRadius: 8, color: UI_COLORS.textDim,
            fontSize: UI_TEXT.caption, padding: `${UI_SPACE.sm}px ${UI_SPACE.md}px`,
            cursor: 'pointer', width: '100%',
          }}
        >
          + Add chart
        </button>
      )}
    </div>
  );
}
