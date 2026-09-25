// LC / LG commission engine for the portfolio demo.
// Re-implements the calculation of the original internal tool, which encodes
// the maximum tariff in SAMA's Fees Guide for Financial Institutions'
// Services (Item 1: documentary credits, Item 7: guarantees). Illustrative
// only — banks may charge less, and the guide can change.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CommissionEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LC = {
    tier1Cap: 400000,     // SAR
    tier1Rate: 0.0025,    // 1/4% for 3 months (or part)
    tier2Rate: 0.00125,   // 1/8% on the excess for 3 months (or part)
    monthlyRate: 0.000625, // 1/16% per month (or part) beyond 3 months
    baseMonths: 3,
    advisingFee: 20       // SAR flat, Item 1(c)
  };

  var LG = {
    tier1Cap: 10000000,   // SAR
    tier1Rate: 0.0025,    // 1/4% per year
    tier2Rate: 0.00125,   // 1/8% per year on the excess
    minimumFee: 25,       // SAR, small-amount guarantees
    missingBlFee: 20      // SAR flat, missing bill-of-lading indemnity
  };

  function num(v) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) && n > 0 ? n : 0;
  }

  function lcOpening(amount, months) {
    amount = num(amount); months = num(months);
    var tier1 = Math.min(amount, LC.tier1Cap) * LC.tier1Rate;
    var tier2 = Math.max(amount - LC.tier1Cap, 0) * LC.tier2Rate;
    var extraMonths = Math.max(Math.ceil(months - LC.baseMonths), 0);
    var tier3 = amount * extraMonths * LC.monthlyRate;
    return { tier1: tier1, tier2: tier2, tier3: tier3, extraMonths: extraMonths, subtotal: tier1 + tier2 + tier3 };
  }

  function withVat(lines, subtotal, vatRate) {
    var vat = subtotal * num(vatRate) / 100;
    return { lines: lines, subtotal: subtotal, vat: vat, total: subtotal + vat };
  }

  // type: 'new' | 'increase' | 'extension' | 'amendment' | 'advising'
  function calcLC(o) {
    var lines = [];
    var subtotal = 0;
    var extraAdvising = num(o.advisingExtra);
    var courier = num(o.courier);

    if (o.type === 'advising') {
      lines.push({ key: 'advising', amount: LC.advisingFee });
      subtotal = LC.advisingFee;
    } else if (o.type === 'amendment') {
      var base = num(o.amendmentFee), cable = num(o.cableCharges);
      lines.push({ key: 'amendmentFee', amount: base });
      lines.push({ key: 'cable', amount: cable });
      subtotal = base + cable;
    } else if (o.type === 'new' || o.type === 'increase') {
      var t = lcOpening(o.amount, o.months);
      lines.push({ key: 'tier1', amount: t.tier1 });
      lines.push({ key: 'tier2', amount: t.tier2 });
      lines.push({ key: 'tier3', amount: t.tier3, months: t.extraMonths });
      var opening = t.subtotal;
      var min = num(o.minimumCommission);
      if (min > 0 && opening < min) {
        lines.push({ key: 'minimum', amount: min });
        opening = min;
      }
      subtotal = opening;
    } else if (o.type === 'extension') {
      var months = Math.max(Math.ceil(num(o.extensionMonths)), 0);
      var ext = num(o.amount) * months * LC.monthlyRate;
      lines.push({ key: 'extension', amount: ext, months: months });
      subtotal = ext;
    } else {
      throw new Error('Unknown LC transaction type: ' + o.type);
    }

    // The amendment type carries its own charges; the others can add
    // advising and courier costs on top.
    if (o.type !== 'amendment') {
      if (extraAdvising) { lines.push({ key: 'advisingExtra', amount: extraAdvising }); subtotal += extraAdvising; }
      if (courier) { lines.push({ key: 'courier', amount: courier }); subtotal += courier; }
    }
    return withVat(lines, subtotal, o.vatRate);
  }

  // unit: 'days' (Actual/365) | 'months' (part month counts as a full month)
  function calcLG(o) {
    var amount = num(o.amount);
    var period = num(o.period);
    var tier1 = Math.min(amount, LG.tier1Cap) * LG.tier1Rate;
    var tier2 = Math.max(amount - LG.tier1Cap, 0) * LG.tier2Rate;
    var fraction = o.unit === 'months' ? Math.ceil(period) / 12 : period / 365;
    var commission = (tier1 + tier2) * fraction;
    var lines = [
      { key: 'annualTier1', amount: tier1 },
      { key: 'annualTier2', amount: tier2 },
      { key: 'prorated', amount: commission, fraction: fraction }
    ];
    if (o.applyMinimum && commission < LG.minimumFee) {
      lines.push({ key: 'minimum', amount: LG.minimumFee });
      commission = LG.minimumFee;
    }
    if (o.missingBl) {
      lines.push({ key: 'missingBl', amount: LG.missingBlFee });
      commission += LG.missingBlFee;
    }
    return withVat(lines, commission, o.vatRate);
  }

  // Compares an expected total with what the bank charged.
  function variance(expected, charged) {
    if (charged === '' || charged === null || charged === undefined || !isFinite(parseFloat(charged))) {
      return { status: 'none' };
    }
    var diff = parseFloat(charged) - expected;
    if (Math.abs(diff) < 0.01) return { status: 'match', diff: 0, pct: 0 };
    return { status: 'differs', diff: diff, pct: expected !== 0 ? diff / expected * 100 : null };
  }

  return { LC: LC, LG: LG, lcOpening: lcOpening, calcLC: calcLC, calcLG: calcLG, variance: variance };
});
