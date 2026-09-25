#!/usr/bin/env node
// Unit tests for the demo engines. Expected values are worked out by hand
// (shown in each comment), not produced by running the engine.
//   node tools/test-engines.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../assets/js/demo/commission-engine.js');
const W = require('../assets/js/demo/words-engine.js');

let failed = 0, passed = 0;
function eq(name, actual, expected, tol = 1e-9) {
  const ok = typeof expected === 'number' ? Math.abs(actual - expected) <= tol : actual === expected;
  if (ok) passed++; else { failed++; console.log(`FAIL ${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`); }
}
const line = (r, key) => (r.lines.find((l) => l.key === key) || {}).amount;

// ---------- Letters of credit ----------
// New L/C, SAR 1,250,000 for 6 months, VAT 15%:
//   400,000 × 0.25%            = 1,000.00
//   850,000 × 0.125%           = 1,062.50
//   6 − 3 = 3 further months → 1,250,000 × 3 × 0.0625% = 2,343.75
//   subtotal 4,406.25; VAT 660.9375; total 5,067.1875
let r = C.calcLC({ type: 'new', amount: 1250000, months: 6, vatRate: 15 });
eq('LC new: tier 1', line(r, 'tier1'), 1000);
eq('LC new: tier 2', line(r, 'tier2'), 1062.5);
eq('LC new: tier 3', line(r, 'tier3'), 2343.75);
eq('LC new: subtotal', r.subtotal, 4406.25);
eq('LC new: VAT', r.vat, 660.9375);
eq('LC new: total', r.total, 5067.1875);

// SAR 300,000 for 2 months: below the 400,000 threshold and within 3 months → 300,000 × 0.25% = 750
r = C.calcLC({ type: 'new', amount: 300000, months: 2, vatRate: 0 });
eq('LC under threshold, ≤3 months', r.total, 750);

// Exactly 3 months costs the same as 2 → 750
eq('LC exactly 3 months', C.calcLC({ type: 'new', amount: 300000, months: 3, vatRate: 0 }).total, 750);

// 3.2 months → one further (part) month: 750 + 300,000 × 0.0625% = 750 + 187.50 = 937.50
eq('LC part month rounds up', C.calcLC({ type: 'new', amount: 300000, months: 3.2, vatRate: 0 }).total, 937.5);

// Bank minimum SAR 1,000 above the computed 750 → 1,000
r = C.calcLC({ type: 'new', amount: 300000, months: 2, minimumCommission: 1000, vatRate: 0 });
eq('LC minimum applies', r.total, 1000);
// Minimum below the computed amount has no effect → 750
eq('LC minimum ignored when lower', C.calcLC({ type: 'new', amount: 300000, months: 2, minimumCommission: 500, vatRate: 0 }).total, 750);

// Increase of SAR 100,000 for 3 months → 100,000 × 0.25% = 250
eq('LC increase', C.calcLC({ type: 'increase', amount: 100000, months: 3, vatRate: 0 }).total, 250);

// Extension of SAR 500,000 by 4.2 months → 5 months × 0.0625% × 500,000 = 1,562.50
eq('LC extension', C.calcLC({ type: 'extension', amount: 500000, extensionMonths: 4.2, vatRate: 0 }).total, 1562.5);

// Other amendment: 25 + 10 = 35; VAT 15% = 5.25; total 40.25
r = C.calcLC({ type: 'amendment', amendmentFee: 25, cableCharges: 10, vatRate: 15 });
eq('LC amendment total', r.total, 40.25);
// Advising only, plus SAR 30 courier → 20 + 30 = 50
eq('LC advising + courier', C.calcLC({ type: 'advising', courier: 30, vatRate: 0 }).total, 50);
// Negative or empty inputs count as zero
eq('LC empty input', C.calcLC({ type: 'new', amount: '', months: '', vatRate: '' }).total, 0);
eq('LC negative input', C.calcLC({ type: 'new', amount: -5, months: 6, vatRate: 0 }).total, 0);

// ---------- Letters of guarantee ----------
// SAR 2,000,000 for 365 days: 2,000,000 × 0.25% = 5,000 a year × 365/365 = 5,000; VAT 750; total 5,750
r = C.calcLG({ amount: 2000000, period: 365, unit: 'days', vatRate: 15 });
eq('LG one year', r.subtotal, 5000);
eq('LG one year total', r.total, 5750);

// SAR 12,000,000 for 7 months: 10,000,000 × 0.25% = 25,000 + 2,000,000 × 0.125% = 2,500
//   27,500 × 7/12 = 16,041.666…
eq('LG above threshold, months', C.calcLG({ amount: 12000000, period: 7, unit: 'months', vatRate: 0 }).total, 27500 * 7 / 12);

// 6.5 months rounds up to 7 → same as above
eq('LG part month rounds up', C.calcLG({ amount: 12000000, period: 6.5, unit: 'months', vatRate: 0 }).total, 27500 * 7 / 12);

// SAR 1,000,000 for 90 days: 2,500 × 90/365 = 616.438356…
eq('LG days pro-rata', C.calcLG({ amount: 1000000, period: 90, unit: 'days', vatRate: 0 }).total, 2500 * 90 / 365);

// Small guarantee SAR 5,000 for 30 days: 12.50 × 30/365 = 1.03 → SAR 25 minimum, + SAR 20 missing B/L = 45
r = C.calcLG({ amount: 5000, period: 30, unit: 'days', applyMinimum: true, missingBl: true, vatRate: 0 });
eq('LG minimum then B/L fee', r.total, 45);
// Without the minimum flag the small fee stands: 12.5 × 30/365
eq('LG minimum off', C.calcLG({ amount: 5000, period: 30, unit: 'days', vatRate: 0 }).total, 12.5 * 30 / 365);

// ---------- Variance ----------
eq('variance none', C.variance(100, '').status, 'none');
eq('variance within 0.01 is a match', C.variance(5067.1875, '5067.19').status, 'match');
const v = C.variance(5067.1875, 5100);
eq('variance differs', v.status, 'differs');
eq('variance diff', v.diff, 32.8125);
eq('variance below', C.variance(100, 90).diff, -10);

// ---------- Amount in words ----------
eq('words 60,980.50 USD', W.amountToWords(60980.5, 'USD'), 'Sixty Thousand, Nine Hundred Eighty and 50/100 US Dollars');
eq('words 1,000,000 SAR', W.amountToWords(1000000, 'SAR'), 'One Million and 00/100 Saudi Riyals');
eq('words 0.99 EUR', W.amountToWords(0.99, 'EUR'), 'Zero and 99/100 Euros');
eq('words 115 AED (teens)', W.amountToWords(115, 'AED'), 'One Hundred Fifteen and 00/100 UAE Dirhams');
eq('words 1,234,567.89 GBP', W.amountToWords(1234567.89, 'GBP'),
  'One Million, Two Hundred Thirty-Four Thousand, Five Hundred Sixty-Seven and 89/100 Pounds Sterling');
eq('words 2,000,017 (skips empty group)', W.intToWords(2000017), 'Two Million, Seventeen');
eq('words string with commas', W.amountToWords('12,730.50', 'USD'), 'Twelve Thousand, Seven Hundred Thirty and 50/100 US Dollars');
eq('money format', W.formatMoney('60980.5'), '60,980.50');

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
