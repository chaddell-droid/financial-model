/**
 * Tiny escape-safe markdown renderer for the advisor pane.
 *
 * Intentionally minimal — no external deps, no remote URL fetching, no HTML
 * passthrough. Renders to React elements, not innerHTML, so injection is
 * structurally impossible: text becomes text nodes; only our own React
 * components add structure.
 *
 * Supported:
 *   - **bold**, *italic*, `code` (inline)
 *   - ```fenced code blocks```
 *   - # h1, ## h2, ### h3
 *   - - / * unordered lists, 1. ordered lists
 *   - paragraph breaks (double newlines)
 *
 * Not supported (intentionally): tables, links, images, blockquotes,
 * raw HTML. Anything not recognized renders as plain text.
 */

import React from 'react';

/**
 * Render a markdown string to a React fragment.
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {(node: React.Node, idx: number) => React.Node} [opts.wrapInline] - hook for wrapping inline nodes (used for citation hover)
 */
export function renderMarkdown(text, opts = {}) {
  if (typeof text !== 'string' || text.length === 0) return null;
  const blocks = splitBlocks(text);
  return React.createElement(
    React.Fragment,
    null,
    blocks.map((block, i) => renderBlock(block, i, opts)),
  );
}

function splitBlocks(text) {
  // Split into blocks separated by blank lines, but keep fenced code blocks intact.
  const blocks = [];
  const lines = text.split(/\r?\n/);
  let i = 0;
  let buf = [];
  const flush = () => {
    if (buf.length > 0) {
      blocks.push({ type: 'paragraph', text: buf.join('\n') });
      buf = [];
    }
  };
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      // Fenced code block — gather until closing fence.
      flush();
      const lang = line.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'code', lang, text: codeLines.join('\n') });
      i++; // skip closing fence
      continue;
    }
    if (/^#{1,3}\s+/.test(line)) {
      flush();
      const level = line.match(/^(#{1,3})\s+/)[1].length;
      blocks.push({ type: 'heading', level, text: line.replace(/^#{1,3}\s+/, '') });
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      flush();
      // Gather contiguous list items
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      flush();
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }
    if (line.trim() === '') {
      flush();
      i++;
      continue;
    }
    buf.push(line);
    i++;
  }
  flush();
  return blocks;
}

function renderBlock(block, key, opts) {
  switch (block.type) {
    case 'heading': {
      const Tag = `h${block.level}`;
      return React.createElement(
        Tag,
        { key, style: headingStyle(block.level) },
        renderInline(block.text, opts),
      );
    }
    case 'code':
      return React.createElement(
        'pre',
        { key, style: codeBlockStyle },
        React.createElement('code', { style: codeInlineStyle }, block.text),
      );
    case 'ul':
      return React.createElement(
        'ul',
        { key, style: listStyle },
        block.items.map((item, j) => React.createElement('li', { key: j, style: listItemStyle }, renderInline(item, opts))),
      );
    case 'ol':
      return React.createElement(
        'ol',
        { key, style: listStyle },
        block.items.map((item, j) => React.createElement('li', { key: j, style: listItemStyle }, renderInline(item, opts))),
      );
    case 'paragraph':
    default:
      return React.createElement('p', { key, style: paragraphStyle }, renderInline(block.text, opts));
  }
}

/**
 * Inline parser: splits on `code`, **bold**, *italic*. Recursive so bold can
 * contain code, etc. Returns a flat array of React nodes.
 */
function renderInline(text, opts) {
  const nodes = [];
  let i = 0;
  let buf = '';
  const flush = () => {
    if (buf.length > 0) {
      nodes.push(opts.wrapInline ? opts.wrapInline(buf, nodes.length) : buf);
      buf = '';
    }
  };
  while (i < text.length) {
    const ch = text[i];
    // Inline code
    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i) {
        flush();
        const code = text.slice(i + 1, end);
        nodes.push(React.createElement('code', { key: nodes.length, style: codeInlineStyle }, code));
        i = end + 1;
        continue;
      }
    }
    // Bold
    if (ch === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2);
      if (end > i) {
        flush();
        const inner = text.slice(i + 2, end);
        nodes.push(React.createElement('strong', { key: nodes.length, style: { fontWeight: 700 } }, renderInline(inner, opts)));
        i = end + 2;
        continue;
      }
    }
    // Italic (single asterisk)
    if (ch === '*' && text[i + 1] !== '*') {
      const end = text.indexOf('*', i + 1);
      if (end > i) {
        flush();
        const inner = text.slice(i + 1, end);
        nodes.push(React.createElement('em', { key: nodes.length, style: { fontStyle: 'italic' } }, renderInline(inner, opts)));
        i = end + 1;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return nodes;
}

const paragraphStyle = { margin: '0 0 8px', lineHeight: 1.55 };
const listStyle = { margin: '0 0 8px', paddingLeft: 22 };
const listItemStyle = { marginBottom: 3, lineHeight: 1.5 };
const codeBlockStyle = {
  margin: '6px 0',
  padding: '8px 10px',
  background: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: 6,
  overflowX: 'auto',
  fontSize: 11,
  fontFamily: "'JetBrains Mono', monospace",
  color: '#e2e8f0',
  whiteSpace: 'pre',
};
const codeInlineStyle = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: '0.92em',
  background: 'rgba(15, 23, 42, 0.6)',
  padding: '1px 5px',
  borderRadius: 3,
  color: '#bae6fd',
};

function headingStyle(level) {
  const sizes = { 1: 18, 2: 15, 3: 13 };
  return {
    margin: '10px 0 6px',
    fontSize: sizes[level],
    fontWeight: 700,
    color: '#e2e8f0',
  };
}
