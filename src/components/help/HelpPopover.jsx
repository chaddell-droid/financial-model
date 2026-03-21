import React from 'react';

export default function HelpPopover({ help, width = 320 }) {
  if (!help) return null;

  const resolvedWidth = typeof width === 'number' ? `${width}px` : width;

  return (
    <div
      style={{
        width: resolvedWidth,
        maxWidth: '92vw',
        background: '#0f172a',
        border: '1px solid #334155',
        borderRadius: 10,
        padding: '10px 12px',
        boxShadow: '0 10px 28px rgba(2, 6, 23, 0.45)',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>
        {help.title}
      </div>
      {help.short && (
        <div style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.45, marginBottom: help.body?.length ? 6 : 0 }}>
          {help.short}
        </div>
      )}
      {help.body?.map((paragraph, index) => (
        <div
          key={index}
          style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.45, marginTop: index === 0 ? 0 : 6 }}
        >
          {paragraph}
        </div>
      ))}
      {help.footer && (
        <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.4, marginTop: 8, borderTop: '1px solid #1e293b', paddingTop: 8 }}>
          {help.footer}
        </div>
      )}
    </div>
  );
}
