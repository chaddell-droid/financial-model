import { MSFT_FLOOR_PRICE, VEST_SHARES } from './constants.js';

export function getMsftPrice(monthOffset, annualGrowth) {
  return MSFT_FLOOR_PRICE * Math.pow(1 + annualGrowth / 100, monthOffset / 12);
}

export function getVestingMonthly(monthOffset, msftGrowth) {
  for (const v of VEST_SHARES) {
    if (monthOffset >= v.startMonth && monthOffset <= v.endMonth) {
      const price = getMsftPrice(v.endMonth, msftGrowth);
      return Math.round(v.shares * price * 0.8 / 3);
    }
  }
  return 0;
}

export function getVestingLumpSum(monthOffset, msftGrowth) {
  for (const v of VEST_SHARES) {
    if (monthOffset === v.endMonth) {
      const price = getMsftPrice(v.endMonth, msftGrowth);
      return Math.round(v.shares * price * 0.8);
    }
  }
  return 0;
}

export function getVestEvents(msftGrowth) {
  return VEST_SHARES.map(v => {
    const price = getMsftPrice(v.endMonth, msftGrowth);
    const gross = v.shares * price;
    return { label: v.label, shares: v.shares, gross, net: Math.round(gross * 0.8), price: Math.round(price * 100) / 100 };
  });
}

export function getTotalRemainingVesting(msftGrowth) {
  return getVestEvents(msftGrowth).reduce((sum, v) => sum + v.net, 0);
}
