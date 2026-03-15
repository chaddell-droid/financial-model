export const MONTHS = ["Q1'26", "Q2'26", "Q3'26", "Q4'26", "Q1'27", "Q2'27", "Q3'27", "Q4'27", "Q1'28", "Q2'28", "Q3'28", "Q4'28", "Q1'29", "Q2'29", "Q3'29", "Q4'29", "Q1'30", "Q2'30", "Q3'30", "Q4'30"];
export const MONTH_VALUES = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57];

// MSFT vesting schedule (net 80% of gross) — hedged at $410.68/share floor
// Starting March 2026 = month 0. Each vest covers ~3 months.
export const MSFT_FLOOR_PRICE = 410.68;

// Share counts per vest period
export const VEST_SHARES = [
  { startMonth: 0,  endMonth: 2,  shares: 133, label: "May '26" },
  { startMonth: 3,  endMonth: 5,  shares: 134, label: "Aug '26" },
  { startMonth: 6,  endMonth: 8,  shares: 88,  label: "Nov '26" },
  { startMonth: 9,  endMonth: 11, shares: 88,  label: "Feb '27" },
  { startMonth: 12, endMonth: 14, shares: 88,  label: "May '27" },
  { startMonth: 15, endMonth: 17, shares: 89,  label: "Aug '27" },
  { startMonth: 18, endMonth: 20, shares: 32,  label: "Nov '27" },
  { startMonth: 21, endMonth: 23, shares: 32,  label: "Feb '28" },
  { startMonth: 24, endMonth: 26, shares: 32,  label: "May '28" },
  { startMonth: 27, endMonth: 29, shares: 33,  label: "Aug '28" },
];

export const SGA_LIMIT = 1690;
export const DAYS_PER_MONTH = 21.5;
