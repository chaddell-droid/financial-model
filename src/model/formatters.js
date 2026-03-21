export const fmt = (n) => {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const formatScaled = (value, suffix) => `${sign}$${value.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}${suffix}`;

  // Use the next unit slightly early so one-decimal rounding does not spill into 1000.0K or 1000.0M.
  if (abs >= 999500000) {
    return formatScaled(abs / 1000000000, 'B');
  }

  if (abs >= 999500) {
    return formatScaled(abs / 1000000, 'M');
  }

  if (abs >= 1000) {
    return formatScaled(abs / 1000, 'K');
  }

  return `${sign}$${Math.abs(Math.round(n)).toLocaleString()}`;
};

export const fmtFull = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString();
