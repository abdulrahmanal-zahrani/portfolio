// Interface for the trade-documents demo. Every value shown in the preview
// is escaped; the words conversion lives in words-engine.js.
(function () {
  var W = window.WordsEngine;
  var form = document.getElementById('docs-form');
  var preview = document.getElementById('preview');

  var STANDARD_DOCS = [
    { name: 'Commercial Invoice', orig: '1', copy: '2' },
    { name: 'Packing List', orig: '1', copy: '2' },
    { name: 'Certificate of Origin', orig: '1', copy: '1' },
    { name: 'Air Waybill', orig: '1', copy: '' },
    { name: 'Copy of L/C', orig: '', copy: '1' }
  ];

  function isoDate(offsetDays) {
    var d = new Date();
    d.setDate(d.getDate() + (offsetDays || 0));
    var m = String(d.getMonth() + 1).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + String(d.getDate()).padStart(2, '0');
  }

  function defaults() {
    return {
      date: isoDate(0), currency: 'USD', lc: 'DEMO-LC-0001', ourRef: 'EXP-DEMO-017',
      customer: 'Sample Trading LLC', company: 'Example Company',
      receivingBank: 'Demo Bank — Trade Operations', benBank: 'Demo Bank', benAccount: 'DEMO-ACCOUNT-0001',
      drawee: 'Demo Issuing Bank', place: 'Riyadh',
      wordsAuto: true, words: '',
      invoices: [
        { no: 'INV-DEMO-1001', date: isoDate(-14), amount: '48250.00' },
        { no: 'INV-DEMO-1002', date: isoDate(-7), amount: '12730.50' }
      ],
      docs: STANDARD_DOCS.map(function (d) { return Object.assign({}, d); })
    };
  }

  var state = defaults();
  var FIELDS = ['date', 'currency', 'lc', 'ourRef', 'customer', 'company', 'receivingBank', 'benBank', 'benAccount', 'drawee', 'place'];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function orDash(s) { return String(s || '').trim() ? esc(s) : '—'; }
  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return esc(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function total() {
    return state.invoices.reduce(function (s, i) { return s + W.parseAmount(i.amount); }, 0);
  }
  function words() { return state.wordsAuto ? W.amountToWords(total(), state.currency) : state.words; }
  function invoiceNumbers() {
    return state.invoices.map(function (i) { return i.no.trim(); }).filter(Boolean).join(', ');
  }

  // ----- Documents -----
  function coverLetter() {
    var nums = invoiceNumbers();
    var rows = state.docs.map(function (r) {
      var name = esc(r.name);
      if (/commercial invoice/i.test(r.name) && nums) name += ' ' + esc(nums);
      return '<tr><td>' + (name || '—') + '</td><td class="center">' + orDash(r.orig) + '</td><td class="center">' + orDash(r.copy) + '</td></tr>';
    }).join('');
    return '<article class="doc" aria-label="Cover letter preview">' +
      '<span class="watermark">Demo — fictional data</span>' +
      '<table class="plain"><tr><td>Date: ' + fmtDate(state.date) + '</td></tr>' +
      '<tr><td>L/C No.: ' + orDash(state.lc) + '</td></tr>' +
      '<tr><td>Our Ref.: ' + orDash(state.ourRef) + '</td></tr></table>' +
      '<p style="margin-block:1rem 1.25rem"><strong>' + orDash(state.receivingBank) + '</strong></p>' +
      '<p><strong>Subject:</strong> Submission of original documents</p>' +
      '<p>Dear Sirs,</p>' +
      '<p>Please find enclosed the shipping documents under L/C No. ' + orDash(state.lc) + ' for ' + orDash(state.customer) + ', as follows:</p>' +
      '<table><thead><tr><th>Document</th><th class="center">Original</th><th class="center">Copy</th></tr></thead><tbody>' + rows +
      '<tr><td colspan="3"><strong>Amount:</strong> ' + esc(state.currency) + ' ' + W.formatMoney(total()) + '</td></tr>' +
      '<tr><td colspan="3"><strong>In words:</strong> ' + orDash(words()) + '</td></tr>' +
      '</tbody></table>' +
      '<p style="margin-block-start:1rem">Upon receipt of funds from the issuing bank, kindly credit the proceeds to our account with ' +
      orDash(state.benBank) + ', account ' + orDash(state.benAccount) + '.</p>' +
      '<p>Please ensure the documents are fully compliant, and hold them and notify us immediately if any discrepancy is identified.</p>' +
      '<p class="sign">For and on behalf of<br><strong>' + orDash(state.company) + '</strong></p>' +
      '</article>';
  }

  function billOfExchange(copy) {
    var inv = state.invoices.map(function (i) {
      return '<tr><td>' + orDash(i.no) + '</td><td>' + fmtDate(i.date) + '</td><td class="num">' + W.formatMoney(i.amount) + '</td></tr>';
    }).join('');
    var label = copy === 1 ? 'First of exchange — second unpaid' : 'Second of exchange — first unpaid';
    return '<article class="doc" aria-label="Bill of exchange preview, ' + (copy === 1 ? 'first' : 'second') + ' copy">' +
      '<span class="watermark">Demo — fictional data</span>' +
      '<h2>BILL OF EXCHANGE</h2><p class="copy-label">' + label + '</p>' +
      '<table><tr><th scope="row">To (drawee bank)</th><td>' + orDash(state.drawee) + '</td></tr>' +
      '<tr><th scope="row">L/C reference</th><td>' + orDash(state.lc) + '</td></tr>' +
      '<tr><th scope="row">Date and place of issue</th><td>' + fmtDate(state.date) + ' · ' + orDash(state.place) + '</td></tr></table>' +
      '<p style="margin-block-start:1rem">At sight of this ' + (copy === 1 ? 'first' : 'second') + ' bill of exchange, pay to the order of ' + orDash(state.company) + ':</p>' +
      '<p class="amount">' + esc(state.currency) + ' ' + W.formatMoney(total()) + '</p>' +
      '<p class="words">' + orDash(words()) + '</p>' +
      '<table><thead><tr><th>Invoice no.</th><th>Date</th><th class="num">Amount (' + esc(state.currency) + ')</th></tr></thead><tbody>' + inv + '</tbody></table>' +
      '<p class="sign">Drawer<br><strong>' + orDash(state.company) + '</strong></p>' +
      '</article>';
  }

  var printAll = false;
  function renderPreview() {
    var view = form.querySelector('input[name="view"]:checked').value;
    if (printAll) {
      preview.innerHTML = coverLetter() + billOfExchange(1) + billOfExchange(2);
    } else {
      preview.innerHTML = view === 'cover' ? coverLetter() : billOfExchange(view === 'boe1' ? 1 : 2);
    }
    var wordsEl = document.getElementById('f-words');
    wordsEl.readOnly = state.wordsAuto;
    if (state.wordsAuto) wordsEl.value = words();
  }

  // ----- Row editors -----
  var ICON_REMOVE = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M12 4.7 11.3 4 8 7.3 4.7 4 4 4.7 7.3 8 4 11.3l.7.7L8 8.7l3.3 3.3.7-.7L8.7 8z" fill="currentColor"/></svg>';

  function input(attrs) {
    var el = document.createElement('input');
    el.className = 'input';
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }
  function labelled(text, el) {
    var wrap = document.createElement('div');
    wrap.className = 'field';
    wrap.style.marginBlockEnd = '0';
    var l = document.createElement('label');
    l.textContent = text;
    l.htmlFor = el.id;
    wrap.appendChild(l); wrap.appendChild(el);
    return wrap;
  }
  function removeButton(text, onClick) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'icon-btn';
    b.setAttribute('aria-label', text);
    b.innerHTML = ICON_REMOVE;
    b.addEventListener('click', onClick);
    return b;
  }

  function renderInvoices() {
    var box = document.getElementById('invoices');
    box.textContent = '';
    state.invoices.forEach(function (inv, i) {
      var row = document.createElement('div');
      row.className = 'row-editor__row';
      var n = i + 1;
      var no = input({ id: 'inv-no-' + i, value: inv.no, autocomplete: 'off' });
      var dt = input({ id: 'inv-date-' + i, type: 'date', value: inv.date });
      var am = input({ id: 'inv-amt-' + i, type: 'number', inputmode: 'decimal', step: '0.01', min: '0', value: inv.amount });
      no.addEventListener('input', function () { inv.no = no.value; renderPreview(); });
      dt.addEventListener('input', function () { inv.date = dt.value; renderPreview(); });
      am.addEventListener('input', function () { inv.amount = am.value; renderPreview(); });
      row.appendChild(labelled('Invoice ' + n + ' no.', no));
      row.appendChild(labelled('Date', dt));
      row.appendChild(labelled('Amount', am));
      var rm = removeButton('Remove invoice ' + n, function () {
        state.invoices.splice(i, 1); renderInvoices(); renderPreview();
        focusAfterRemove('#invoices', 'add-invoice');
      });
      rm.disabled = state.invoices.length === 1;
      row.appendChild(rm);
      box.appendChild(row);
    });
  }

  function renderDocRows() {
    var box = document.getElementById('doc-rows');
    box.textContent = '';
    state.docs.forEach(function (d, i) {
      var row = document.createElement('div');
      row.className = 'row-editor__row row-editor__row--docs';
      var name = input({ id: 'doc-name-' + i, value: d.name, autocomplete: 'off' });
      var orig = input({ id: 'doc-orig-' + i, value: d.orig, inputmode: 'numeric', autocomplete: 'off' });
      var copy = input({ id: 'doc-copy-' + i, value: d.copy, inputmode: 'numeric', autocomplete: 'off' });
      name.addEventListener('input', function () { d.name = name.value; renderPreview(); });
      orig.addEventListener('input', function () { d.orig = orig.value; renderPreview(); });
      copy.addEventListener('input', function () { d.copy = copy.value; renderPreview(); });
      row.appendChild(labelled('Document ' + (i + 1), name));
      row.appendChild(labelled('Originals', orig));
      row.appendChild(labelled('Copies', copy));
      row.appendChild(removeButton('Remove ' + (d.name || 'document ' + (i + 1)), function () {
        state.docs.splice(i, 1); renderDocRows(); renderPreview();
        focusAfterRemove('#doc-rows', 'add-doc');
      }));
      box.appendChild(row);
    });
  }

  function focusAfterRemove(boxSel, fallbackId) {
    var btns = document.querySelectorAll(boxSel + ' .icon-btn:not([disabled])');
    (btns[btns.length - 1] || document.getElementById(fallbackId)).focus();
  }

  // ----- Simple fields -----
  function syncFields() {
    FIELDS.forEach(function (k) { form.elements[k].value = state[k]; });
    document.getElementById('f-words-auto').checked = state.wordsAuto;
  }

  FIELDS.forEach(function (k) {
    form.elements[k].addEventListener('input', function (e) { state[k] = e.target.value; renderPreview(); });
  });
  document.getElementById('f-words-auto').addEventListener('change', function (e) {
    state.wordsAuto = e.target.checked;
    if (!state.wordsAuto) state.words = words() || W.amountToWords(total(), state.currency);
    renderPreview();
    if (!state.wordsAuto) document.getElementById('f-words').focus();
  });
  document.getElementById('f-words').addEventListener('input', function (e) {
    if (!state.wordsAuto) { state.words = e.target.value; renderPreview(); }
  });
  form.querySelectorAll('input[name="view"]').forEach(function (r) { r.addEventListener('change', renderPreview); });

  document.getElementById('add-invoice').addEventListener('click', function () {
    state.invoices.push({ no: '', date: state.date, amount: '' });
    renderInvoices(); renderPreview();
    document.getElementById('inv-no-' + (state.invoices.length - 1)).focus();
  });
  document.getElementById('add-doc').addEventListener('click', function () {
    state.docs.push({ name: '', orig: '', copy: '' });
    renderDocRows(); renderPreview();
    document.getElementById('doc-name-' + (state.docs.length - 1)).focus();
  });
  document.getElementById('reset-docs').addEventListener('click', function () {
    state.docs = STANDARD_DOCS.map(function (d) { return Object.assign({}, d); });
    renderDocRows(); renderPreview();
  });
  document.getElementById('reset-all').addEventListener('click', function () {
    state = defaults();
    syncFields(); renderInvoices(); renderDocRows(); renderPreview();
  });

  function doPrint(all) {
    printAll = all;
    renderPreview();
    window.print();
    printAll = false;
    renderPreview();
  }
  document.getElementById('print-one').addEventListener('click', function () { doPrint(false); });
  document.getElementById('print-all').addEventListener('click', function () { doPrint(true); });
  form.addEventListener('submit', function (e) { e.preventDefault(); });

  syncFields(); renderInvoices(); renderDocRows(); renderPreview();
})();
