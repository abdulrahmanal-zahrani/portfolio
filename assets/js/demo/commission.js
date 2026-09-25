// Interface for the commission demo. All arithmetic is in commission-engine.js.
(function () {
  var E = window.CommissionEngine;
  var form = document.getElementById('calc');
  var linesEl = document.getElementById('lines');
  var totalEl = document.getElementById('total');
  var varianceEl = document.getElementById('variance');

  var fmt = function (n) {
    return (isFinite(n) ? n : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  var val = function (id) { return document.getElementById(id).value; };

  function label(line) {
    switch (line.key) {
      case 'tier1': return 'Opening: ¼% on the first SAR 400,000 (3 months)';
      case 'tier2': return 'Opening: ⅛% on the excess (3 months)';
      case 'tier3': return 'Opening: 1/16% × ' + line.months + ' further month(s)';
      case 'minimum': return 'Minimum fee applied';
      case 'extension': return 'Extension: 1/16% × ' + line.months + ' month(s) on the full amount';
      case 'advising': return 'Advising fee';
      case 'advisingExtra': return 'Additional advising fee';
      case 'courier': return 'Cable / courier';
      case 'amendmentFee': return 'Amendment fee';
      case 'cable': return 'Telex / cable / mail';
      case 'annualTier1': return 'Annual: ¼% on the first SAR 10,000,000';
      case 'annualTier2': return 'Annual: ⅛% on the excess';
      case 'prorated': return 'Pro-rated for the validity period (' + (line.fraction * 100).toFixed(2) + '% of a year)';
      case 'missingBl': return 'Missing bill-of-lading indemnity';
      default: return line.key;
    }
  }

  function row(text, amount, cls) {
    var tr = document.createElement('tr');
    if (cls) tr.className = cls;
    var a = document.createElement('td'); a.textContent = text;
    var b = document.createElement('td'); b.className = 'num'; b.textContent = fmt(amount);
    tr.appendChild(a); tr.appendChild(b);
    linesEl.appendChild(tr);
  }

  function product() { return form.querySelector('input[name="product"]:checked').value; }

  function syncVisibility() {
    var p = product();
    document.getElementById('lc-inputs').hidden = p !== 'lc';
    document.getElementById('lg-inputs').hidden = p !== 'lg';
    var type = val('lc-type');
    document.querySelectorAll('#lc-inputs [data-show]').forEach(function (el) {
      el.hidden = el.dataset.show.split(' ').indexOf(type) === -1;
    });
    document.getElementById('lc-amount-label').textContent = type === 'increase' ? 'Increase amount' : 'L/C amount';
  }

  function calculate() {
    syncVisibility();
    var vat = val('vat');
    var r;
    if (product() === 'lc') {
      r = E.calcLC({
        type: val('lc-type'),
        amount: val('lc-amount'),
        months: val('lc-months'),
        extensionMonths: val('lc-ext'),
        amendmentFee: val('lc-amend-fee'),
        cableCharges: val('lc-cable'),
        minimumCommission: val('lc-min'),
        advisingExtra: val('lc-adv'),
        courier: val('lc-courier'),
        vatRate: vat
      });
    } else {
      r = E.calcLG({
        amount: val('lg-amount'),
        period: val('lg-period'),
        unit: val('lg-unit'),
        applyMinimum: document.getElementById('lg-min').checked,
        missingBl: document.getElementById('lg-bl').checked,
        vatRate: vat
      });
    }

    linesEl.textContent = '';
    r.lines.forEach(function (l) { row(label(l), l.amount); });
    row('Subtotal before VAT', r.subtotal, 'is-total');
    row('VAT (' + (parseFloat(vat) || 0) + '%)', r.vat);
    row('Total', r.total, 'is-grand');
    totalEl.textContent = 'SAR ' + fmt(r.total);

    var v = E.variance(r.total, val('charged'));
    varianceEl.className = 'status-box is-' + (v.status === 'differs' ? 'diff' : v.status);
    if (v.status === 'none') {
      varianceEl.textContent = 'Enter the amount charged by the bank to compare it with the calculated total.';
    } else if (v.status === 'match') {
      varianceEl.textContent = 'The amount charged matches the calculated total.';
    } else {
      varianceEl.textContent = 'Difference of SAR ' + fmt(Math.abs(v.diff)) + ' (' + (v.diff > 0 ? 'charged above' : 'charged below') +
        ' the calculated total' + (v.pct !== null ? ', ' + Math.abs(v.pct).toFixed(2) + '%' : '') + '). Worth checking against the facility pricing.';
    }
  }

  form.addEventListener('input', calculate);
  form.addEventListener('change', calculate);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  form.addEventListener('reset', function () { setTimeout(calculate, 0); });
  document.getElementById('print').addEventListener('click', function () { window.print(); });
  calculate();
})();
