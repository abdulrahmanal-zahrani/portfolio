// Amount-in-words for the documents demo, e.g.
// 60980.5, "USD" -> "Sixty Thousand, Nine Hundred Eighty and 50/100 US Dollars"
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WordsEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  var TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  var SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];
  var CURRENCIES = { USD: 'US Dollars', EUR: 'Euros', SAR: 'Saudi Riyals', AED: 'UAE Dirhams', GBP: 'Pounds Sterling' };

  function parseAmount(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var n = parseFloat(String(v || '').replace(/[,\s]/g, ''));
    return isFinite(n) ? n : 0;
  }

  function threeToWords(n) {
    var s = '';
    var h = Math.floor(n / 100), r = n % 100;
    if (h) s += ONES[h] + ' Hundred';
    if (r) {
      if (s) s += ' ';
      if (r < 20) s += ONES[r];
      else { s += TENS[Math.floor(r / 10)]; if (r % 10) s += '-' + ONES[r % 10]; }
    }
    return s;
  }

  function intToWords(num) {
    if (num === 0) return 'Zero';
    if (num >= Math.pow(1000, SCALES.length)) throw new RangeError('Amount too large');
    var parts = [], i = 0;
    while (num > 0) {
      var chunk = num % 1000;
      if (chunk) parts.unshift(threeToWords(chunk) + (SCALES[i] ? ' ' + SCALES[i] : ''));
      num = Math.floor(num / 1000); i++;
    }
    return parts.join(', ');
  }

  function amountToWords(amount, currency) {
    var cents = Math.round(Math.abs(parseAmount(amount)) * 100);
    var whole = Math.floor(cents / 100);
    var fraction = cents % 100;
    var cur = CURRENCIES[currency] || currency || '';
    return (intToWords(whole) + ' and ' + String(fraction).padStart(2, '0') + '/100 ' + cur).trim();
  }

  function formatMoney(n) {
    return parseAmount(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return { CURRENCIES: CURRENCIES, parseAmount: parseAmount, intToWords: intToWords, amountToWords: amountToWords, formatMoney: formatMoney };
});
