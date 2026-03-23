export const UI_BREAKPOINTS = {
  compact: 960,
  railCollapse: 1180,
  desktop: 1400,
};

export const UI_TEXT = {
  micro: 12,
  caption: 13,
  body: 14,
  label: 13,
  title: 16,
  heading: 18,
  hero: 24,
};

export const UI_SPACE = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const UI_RADII = {
  sm: 8,
  md: 12,
  lg: 16,
};

export const UI_COLORS = {
  page: 'var(--ui-page)',
  surface: 'var(--ui-surface)',
  surfaceMuted: 'var(--ui-surface-muted)',
  border: 'var(--ui-border)',
  borderStrong: 'var(--ui-border-strong)',
  textStrong: 'var(--ui-text-strong)',
  textBody: 'var(--ui-text-body)',
  textMuted: 'var(--ui-text-muted)',
  textDim: 'var(--ui-text-dim)',
  primary: 'var(--ui-primary)',
  positive: 'var(--ui-positive)',
  caution: 'var(--ui-caution)',
  destructive: 'var(--ui-destructive)',
  info: 'var(--ui-info)',
  compare: 'var(--ui-compare)',
  modeSarah: 'var(--ui-mode-sarah)',
  modeDad: 'var(--ui-mode-dad)',
};

export const UI_ACTION_VARIANTS = {
  primary: 'primary',
  secondary: 'secondary',
  ghost: 'ghost',
  destructive: 'destructive',
  chip: 'chip',
};

export function getShellWidthBucket(width) {
  if (width < UI_BREAKPOINTS.compact) return 'compact';
  if (width < UI_BREAKPOINTS.railCollapse) return 'stacked';
  return 'desktop';
}
