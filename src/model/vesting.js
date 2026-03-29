import { MSFT_FLOOR_PRICE, VEST_SHARES } from './constants.js';

export function getMsftPrice(monthOffset, annualGrowth, startPrice) {
  const base = startPrice ?? MSFT_FLOOR_PRICE;
  return base * Math.pow(1 + annualGrowth / 100, monthOffset / 12);
}

export function getVestingMonthly(monthOffset, msftGrowth, msftPrice) {
  for (const v of VEST_SHARES) {
    if (monthOffset >= v.startMonth && monthOffset <= v.endMonth) {
      const price = getMsftPrice(v.endMonth, msftGrowth, msftPrice);
      return Math.round(v.shares * price * 0.8 / 3);
    }
  }
  return 0;
}

export function getVestingLumpSum(monthOffset, msftGrowth, msftPrice) {
  for (const v of VEST_SHARES) {
    if (monthOffset === v.endMonth) {
      const price = getMsftPrice(v.endMonth, msftGrowth, msftPrice);
      return Math.round(v.shares * price * 0.8);
    }
  }
  return 0;
}

export function getVestEvents(msftGrowth, msftPrice) {
  return VEST_SHARES.map(v => {
    const price = getMsftPrice(v.endMonth, msftGrowth, msftPrice);
    const gross = v.shares * price;
    return { label: v.label, shares: v.shares, gross, net: Math.round(gross * 0.8), price: Math.round(price * 100) / 100 };
  });
}

export function getTotalRemainingVesting(msftGrowth, msftPrice) {
  return getVestEvents(msftGrowth, msftPrice).reduce((sum, v) => sum + v.net, 0);
}
