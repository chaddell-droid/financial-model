export const fmt = (n) => {
  if (Math.abs(n) >= 1000) return (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n / 100) / 10).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "K";
  return "$" + Math.round(n).toLocaleString();
};

export const fmtFull = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString();
