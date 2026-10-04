// Interface for the numbers-to-words demo, adapted from the original tool:
// language switching is scoped to the tool and the page does not steal focus on load.
/* =========================================================================
   Numbers to Words Converter — User interface
   Presentation only; every conversion goes through window.NumbersToWords.
   ========================================================================= */
(function () {
  'use strict';

  var NTW = window.NumbersToWords;
  var $ = function (id) { return document.getElementById(id); };

  /* ----------------------------------------------------------------------
     Interface strings
     ---------------------------------------------------------------------- */
  var I18N = {
    en: {
      appTitle: 'Numbers to Words Converter',
      sectionInput: 'Amount Details',
      labelAmount: 'Amount',
      hintAmount: function (n) {
        return 'Thousands separators are inserted automatically. ' +
          (n === 0 ? 'This currency has no decimal places.' : 'Maximum ' + n + ' decimal place' + (n === 1 ? '' : 's') + ' for the selected currency.');
      },
      labelFilter: 'Find currency',
      labelCurrency: 'Currency',
      customTitle: 'Custom currency definition',
      customCode: 'ISO code', customGender: 'Arabic gender',
      customEnS: 'English singular', customEnP: 'English plural',
      customArS: 'Arabic singular', customArD: 'Arabic dual',
      customArP: 'Arabic plural', customArA: 'Arabic accusative',
      genderM: 'Masculine', genderF: 'Feminine',
      btnClear: 'Clear', btnCopy: 'Copy',
      btnCopyResult: 'Copy Amount in Words', btnCopyAll: 'Copy All',
      copied: 'Copied',
      sectionResult: 'Conversion Result',
      labelNumeric: 'Numeric Amount',
      labelWordsEn: 'Amount in Words — English',
      labelWordsAr: 'Amount in Words — Arabic',
      footerBuilt: 'Built by Abdulrahman Alzahrani',
      customOption: 'CUSTOM — Custom currency',
      err: {
        EMPTY: 'Please enter an amount.',
        NO_DIGITS: 'Please enter a valid numeric amount.',
        INVALID_CHARS: 'Invalid characters. Use digits, commas as thousands separators, and a single period for decimals.',
        MULTIPLE_DECIMALS: 'More than one decimal point was entered. Use a single period, for example 123,456.78.',
        BAD_COMMAS: 'Invalid comma placement. Thousands separators must group digits in threes, for example 1,250,000.00.',
        TOO_MANY_DECIMALS: function (n) {
          return 'Only ' + n + ' decimal place' + (n === 1 ? '' : 's') + ' ' + (n === 1 ? 'is' : 'are') +
            ' supported for the selected currency. The amount has not been rounded — please correct it.';
        },
        NEGATIVE: 'Negative amounts are not supported for financial documentation.',
        TOO_LARGE: 'The amount exceeds the supported range (maximum 36 whole-number digits).',
        CUSTOM_INCOMPLETE: 'Complete the custom currency: English singular name and all four Arabic forms (singular, dual, plural, accusative) are required. A missing Arabic dual, in particular, would drop the number "2" from the wording.'
      }
    },
    ar: {
      appTitle: 'محوّل الأرقام إلى كلمات',
      sectionInput: 'بيانات المبلغ',
      labelAmount: 'المبلغ',
      hintAmount: function (n) {
        var suffix;
        if (n === 0) suffix = 'لا تحتوي هذه العملة على خانات عشرية.';
        else if (n === 2) suffix = 'خانتان عشريتان كحد أقصى للعملة المختارة.';
        else if (n === 3) suffix = 'ثلاث خانات عشرية كحد أقصى للعملة المختارة.';
        else suffix = n + ' خانات عشرية كحد أقصى للعملة المختارة.';
        return 'تُضاف فواصل الآلاف تلقائياً أثناء الكتابة. ' + suffix;
      },
      labelFilter: 'البحث عن عملة',
      labelCurrency: 'العملة',
      customTitle: 'تعريف عملة مخصصة',
      customCode: 'رمز العملة', customGender: 'الجنس في العربية',
      customEnS: 'المفرد بالإنجليزية', customEnP: 'الجمع بالإنجليزية',
      customArS: 'المفرد بالعربية', customArD: 'المثنى بالعربية',
      customArP: 'الجمع بالعربية', customArA: 'المنصوب بالعربية',
      genderM: 'مذكر', genderF: 'مؤنث',
      btnClear: 'مسح', btnCopy: 'نسخ',
      btnCopyResult: 'نسخ المبلغ كتابةً', btnCopyAll: 'نسخ الكل',
      copied: 'تم النسخ',
      sectionResult: 'نتيجة التحويل',
      labelNumeric: 'المبلغ رقماً',
      labelWordsEn: 'المبلغ كتابةً — الإنجليزية',
      labelWordsAr: 'المبلغ كتابةً — العربية',
      footerBuilt: 'تطوير عبدالرحمن الزهراني',
      customOption: 'CUSTOM — عملة مخصصة',
      err: {
        EMPTY: 'الرجاء إدخال المبلغ.',
        NO_DIGITS: 'الرجاء إدخال مبلغ رقمي صحيح.',
        INVALID_CHARS: 'توجد رموز غير صالحة. استخدم الأرقام والفاصلة للآلاف ونقطة واحدة للكسور العشرية.',
        MULTIPLE_DECIMALS: 'تم إدخال أكثر من فاصلة عشرية. استخدم نقطة واحدة فقط، مثال: 123,456.78.',
        BAD_COMMAS: 'موضع الفاصلة غير صحيح. يجب أن تفصل الفواصل الأرقام كل ثلاث خانات، مثال: 1,250,000.00.',
        TOO_MANY_DECIMALS: function (n) {
          var digits = (n === 2) ? 'خانتان عشريتان فقط' : (n === 3) ? 'ثلاث خانات عشرية فقط' : (n + ' خانات عشرية فقط');
          return 'يُدعم ' + digits + ' للعملة المختارة. لم يتم تقريب المبلغ — الرجاء تصحيحه.';
        },
        NEGATIVE: 'المبالغ السالبة غير مدعومة في المستندات المالية.',
        TOO_LARGE: 'المبلغ يتجاوز النطاق المدعوم (36 خانة صحيحة كحد أقصى).',
        CUSTOM_INCOMPLETE: 'أكمل بيانات العملة المخصصة: الاسم المفرد بالإنجليزية وجميع الصيغ العربية الأربع (المفرد والمثنى والجمع والمنصوب) مطلوبة. فبدون صيغة المثنى تحديداً، يسقط الرقم "2" من الصياغة.'
      }
    }
  };

  var lang = 'en';
  var t = function () { return I18N[lang]; };

  /**
   * Remember the interface language across visits — nothing financial is
   * ever written to storage, only the two-letter language code.
   */
  var LANG_STORAGE_KEY = 'ntw-language';
  function readStoredLanguage() {
    try {
      var v = window.localStorage.getItem(LANG_STORAGE_KEY);
      return (v === 'ar' || v === 'en') ? v : null;
    } catch (e) { return null; }
  }
  function storeLanguage(v) {
    try { window.localStorage.setItem(LANG_STORAGE_KEY, v); } catch (e) { /* storage unavailable — ignore */ }
  }

  /* ----------------------------------------------------------------------
     Currency selection
     ----------------------------------------------------------------------
     Two controls, two clearly separated jobs:
       #currency        — a native <select>. Its value IS selectedCurrency,
                           so there is no text field that could ever end up
                           holding a stale label for new typing to land on
                           top of.
       #currencyFilter  — a pure, ephemeral search query. It is blanked the
                           moment it's done being used — on pick, and on
                           blur — so the next time the user clicks in there
                           is no leftover text to accidentally append to.
     selectedCurrency is the one authoritative piece of state; the filter
     text is never a source of truth for it, and filtering alone (without
     an explicit pick) never changes it.
     ---------------------------------------------------------------------- */
  var currencySelect = $('currency');
  var currencyFilter = $('currencyFilter');

  // Default currency follows the interface language the page is about to
  // start in: USD for English, SAR for Arabic.
  var selectedCurrency = (readStoredLanguage() === 'ar') ? 'SAR' : 'USD';

  function currencyLabel(code) {
    if (code === 'CUSTOM') return t().customOption;
    var c = NTW.CURRENCIES[code];
    return code + ' — ' + (lang === 'ar' ? c.arabic.s : c.nameEnglish);
  }

  function currencyMatches(code, q) {
    if (!q) return true;
    if (code === 'CUSTOM') return t().customOption.toLowerCase().indexOf(q) !== -1;
    var c = NTW.CURRENCIES[code];
    return code.toLowerCase().indexOf(q) !== -1 ||
      c.nameEnglish.toLowerCase().indexOf(q) !== -1 ||
      c.nameEnglishPlural.toLowerCase().indexOf(q) !== -1 ||
      c.arabic.s.indexOf(q) !== -1;
  }

  /** Rebuild the <select>'s options from the given filter query. Filtering
   *  never touches selectedCurrency — only what is visible to pick from. */
  function populateCurrencySelect(query) {
    var q = (query || '').trim().toLowerCase();
    var codes = NTW.CURRENCY_CODES.filter(function (code) { return currencyMatches(code, q); });
    codes.push('CUSTOM');

    currencySelect.innerHTML = '';
    codes.forEach(function (code) {
      var o = document.createElement('option');
      o.value = code;
      o.textContent = currencyLabel(code);
      currencySelect.appendChild(o);
    });

    if (codes.indexOf(selectedCurrency) !== -1) currencySelect.value = selectedCurrency;
  }

  /** Re-render the <select>'s options (e.g. after the interface language
   *  changes, since labels are localized) without ever touching what the
   *  user has typed into the Find-currency box — applying or refreshing a
   *  currency selection must never erase their search text. */
  function refreshCurrencySelect() {
    populateCurrencySelect(currencyFilter.value);
    if (NTW.CURRENCY_CODES.indexOf(selectedCurrency) !== -1 || selectedCurrency === 'CUSTOM') {
      currencySelect.value = selectedCurrency;
    }
  }

  /* ----------------------------------------------------------------------
     Language
     ---------------------------------------------------------------------- */
  function setLanguage(next) {
    lang = (next === 'ar') ? 'ar' : 'en';
    storeLanguage(lang);
    // Scoped to the tool so the surrounding portfolio page keeps its own language and direction.
    var d = document.getElementById('ntw');
    d.lang = lang;
    d.dir = (lang === 'ar') ? 'rtl' : 'ltr';

    var dict = t();
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      // hintAmount is a function (currency-decimal-aware), not a plain
      // string — handled separately by updateAmountHint below.
      if (dict[key] === undefined || key === 'hintAmount') return;
      el.textContent = dict[key];
    });
    $('langEn').setAttribute('aria-pressed', String(lang === 'en'));
    $('langAr').setAttribute('aria-pressed', String(lang === 'ar'));

    refreshCurrencySelect();
    updateAmountHint();
    if ($('error').classList.contains('show')) showError(lastErrorCode);
    convert(false);
  }

  /** Keeps the "maximum N decimal places" hint in sync with whichever
   *  currency is currently selected, since KWD/BHD/OMR/JOD/TND/IQD/LYD
   *  need 3 and every other currency needs 2. */
  function updateAmountHint() {
    var decimals = NTW.getCurrency(selectedCurrency, readCustom()).decimals;
    $('amountHint').textContent = t().hintAmount(decimals);
  }

  /* ----------------------------------------------------------------------
     Errors
     ---------------------------------------------------------------------- */
  var lastErrorCode = null;

  function showError(code) {
    lastErrorCode = code;
    var box = $('error');
    var msg = t().err[code] || t().err.NO_DIGITS;
    if (typeof msg === 'function') {
      msg = msg(NTW.getCurrency(selectedCurrency, readCustom()).decimals);
    }
    box.textContent = msg;
    box.classList.add('show');
  }
  function clearError() {
    lastErrorCode = null;
    $('error').classList.remove('show');
    $('error').textContent = '';
  }

  /* ----------------------------------------------------------------------
     Conversion
     ---------------------------------------------------------------------- */
  function readCustom() {
    return {
      code: $('cCode').value,
      nameEnglish: $('cEnS').value,
      nameEnglishPlural: $('cEnP').value,
      arabicSingular: $('cArS').value,
      arabicDual: $('cArD').value,
      arabicPlural: $('cArP').value,
      arabicAccusative: $('cArA').value,
      gender: $('cGender').value
    };
  }

  // Whether the result fields currently hold a real conversion (as opposed
  // to being blank because nothing valid has been entered yet). The
  // Conversion Result section itself is always visible; this only governs
  // whether the Copy buttons have anything to act on.
  var hasResult = false;

  function clearResultFields() {
    hasResult = false;
    $('outNumeric').textContent = '';
    $('outEnglish').textContent = '';
    $('outArabic').textContent = '';
  }

  /**
   * convert(reportEmpty) — reportEmpty=false keeps the form quiet while the
   * user is still typing; the Convert button passes true.
   */
  function convert(reportEmpty) {
    var raw = $('amount').value;
    var code = selectedCurrency;
    var custom = readCustom();

    if (raw.trim() === '') {
      clearResultFields();
      if (reportEmpty) showError('EMPTY'); else clearError();
      return;
    }

    // All four Arabic grammatical forms are required, not just the
    // singular: an amount of exactly 2 relies entirely on the dual noun
    // to convey "two" (real currencies never fall back here — ar.d is
    // always a genuine dual). A blank dual defaulting to the singular
    // silently drops the number 2 from the Arabic wording rather than
    // just reading awkwardly, which is a financial-correctness problem
    // in official documentation, not merely a style one.
    if (code === 'CUSTOM' && (
      !custom.nameEnglish.trim() || !custom.arabicSingular.trim() ||
      !custom.arabicDual.trim() || !custom.arabicPlural.trim() || !custom.arabicAccusative.trim()
    )) {
      clearResultFields();
      showError('CUSTOM_INCOMPLETE');
      return;
    }

    var res = NTW.convertAmount(raw, code, custom);
    if (!res.ok) {
      clearResultFields();
      showError(res.code);
      return;
    }

    clearError();
    $('outNumeric').textContent = res.formattedWithCode;
    $('outEnglish').textContent = res.english;
    $('outArabic').textContent = res.arabic;
    hasResult = true;
  }

  /* ----------------------------------------------------------------------
     Copy / clear
     ---------------------------------------------------------------------- */
  function writeClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  // file:// pages often have no async clipboard permission — fall back.
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* nothing else to try */ }
    document.body.removeChild(ta);
  }

  /**
   * Shows the "Copied" confirmation both visually and to assistive tech.
   * The element is `role="status"` (a live region), which only announces
   * on an actual text change — a CSS-only opacity/visibility toggle is not
   * reliably announced by screen readers, so the text is genuinely written
   * and then cleared, not just shown and hidden.
   */
  function flash(id) {
    var el = $(id);
    el.textContent = t().copied;
    el.classList.add('show');
    window.setTimeout(function () {
      el.classList.remove('show');
      el.textContent = '';
    }, 1400);
  }

  function copyResult(which) {
    if (!hasResult) return;
    if (which === 'en') { writeClipboard($('outEnglish').textContent); flash('copiedEn'); }
    else if (which === 'ar') { writeClipboard($('outArabic').textContent); flash('copiedAr'); }
    else if (which === 'all') {
      var all = $('outNumeric').textContent + '\n' +
        $('outEnglish').textContent + '\n' + $('outArabic').textContent;
      writeClipboard(all); flash('copiedNum');
    } else {
      // Primary copy: the amount in words for the active interface language.
      var isAr = (lang === 'ar');
      writeClipboard(isAr ? $('outArabic').textContent : $('outEnglish').textContent);
      flash(isAr ? 'copiedAr' : 'copiedEn');
    }
  }

  function clearForm() {
    $('amount').value = '';
    selectedCurrency = (lang === 'ar') ? 'SAR' : 'USD';
    currencyFilter.value = '';
    populateCurrencySelect('');
    currencySelect.value = selectedCurrency;
    ['cCode', 'cEnS', 'cEnP', 'cArS', 'cArD', 'cArP', 'cArA'].forEach(function (id) { $(id).value = ''; });
    $('cGender').value = 'm';
    $('customPanel').hidden = true;
    clearResultFields();
    clearError();
    $('amount').focus();
  }

  /* ----------------------------------------------------------------------
     Built-in verification suite
     ---------------------------------------------------------------------- */
  var TESTS = [
    ['fmt', '0', 'USD', '0.00'], ['fmt', '1', 'USD', '1.00'], ['fmt', '10', 'USD', '10.00'],
    ['fmt', '1,000', 'USD', '1,000.00'], ['fmt', '1,001', 'USD', '1,001.00'],
    ['fmt', '1,100', 'USD', '1,100.00'], ['fmt', '1,250.50', 'USD', '1,250.50'],
    ['fmt', '10,000', 'USD', '10,000.00'], ['fmt', '100,000', 'USD', '100,000.00'],
    ['fmt', '1,000,000', 'USD', '1,000,000.00'], ['fmt', '1,250,000.50', 'USD', '1,250,000.50'],
    ['fmt', '999,999,999,999.99', 'USD', '999,999,999,999.99'],
    ['fmt', '1234567890.5', 'USD', '1,234,567,890.50'],
    ['fmt', '123456.78', 'USD', '123,456.78'],
    ['fmt', '999,999,999,999,999.99', 'USD', '999,999,999,999,999.99'],
    ['en', '11', 'USD', 'Eleven US Dollars Only'],
    ['en', '21', 'USD', 'Twenty-One US Dollars Only'],
    ['en', '101', 'USD', 'One Hundred One US Dollars Only'],
    ['en', '110', 'USD', 'One Hundred Ten US Dollars Only'],
    ['en', '125', 'USD', 'One Hundred Twenty-Five US Dollars Only'],
    ['en', '123456.78', 'USD', 'One Hundred Twenty-Three Thousand Four Hundred Fifty-Six US Dollars and 78/100 Only'],
    ['en', '1250.50', 'SAR', 'One Thousand Two Hundred Fifty Saudi Riyals and 50/100 Only'],
    ['en', '100.05', 'SAR', 'One Hundred Saudi Riyals and 05/100 Only'],
    ['en', '100.01', 'USD', 'One Hundred US Dollars and 01/100 Only'],
    ['en', '1000.00', 'SAR', 'One Thousand Saudi Riyals Only'],
    ['en', '1000000.00', 'EUR', 'One Million Euros Only'],
    ['ar', '1', 'SAR', 'ريال سعودي واحد فقط لا غير'],
    ['ar', '2', 'SAR', 'ريالان سعوديان فقط لا غير'],
    ['ar', '3', 'SAR', 'ثلاثة ريالات سعودية فقط لا غير'],
    ['ar', '10', 'SAR', 'عشرة ريالات سعودية فقط لا غير'],
    ['ar', '11', 'SAR', 'أحد عشر ريالاً سعودياً فقط لا غير'],
    ['ar', '12', 'SAR', 'اثنا عشر ريالاً سعودياً فقط لا غير'],
    ['ar', '21', 'SAR', 'واحد وعشرون ريالاً سعودياً فقط لا غير'],
    ['ar', '100', 'SAR', 'مئة ريال سعودي فقط لا غير'],
    ['ar', '200', 'SAR', 'مئتا ريال سعودي فقط لا غير'],
    ['ar', '300', 'SAR', 'ثلاثمئة ريال سعودي فقط لا غير'],
    ['ar', '1000', 'SAR', 'ألف ريال سعودي فقط لا غير'],
    ['ar', '2000', 'SAR', 'ألفا ريال سعودي فقط لا غير'],
    ['ar', '3000', 'SAR', 'ثلاثة آلاف ريال سعودي فقط لا غير'],
    ['ar', '10000', 'SAR', 'عشرة آلاف ريال سعودي فقط لا غير'],
    ['ar', '100000', 'SAR', 'مئة ألف ريال سعودي فقط لا غير'],
    ['ar', '1000000', 'SAR', 'مليون ريال سعودي فقط لا غير'],
    ['ar', '2000000', 'SAR', 'مليونا ريال سعودي فقط لا غير'],
    ['ar', '1250.50', 'SAR', 'ألف ومئتان وخمسون ريالاً سعودياً و50/100 فقط لا غير'],
    ['ar', '123456.78', 'USD', 'مئة وثلاثة وعشرون ألفاً وأربعمئة وستة وخمسون دولاراً أمريكياً و78/100 فقط لا غير'],
    ['ar', '3', 'SYP', 'ثلاث ليرات سورية فقط لا غير'],
    ['ar', '23', 'SYP', 'ثلاث وعشرون ليرةً سوريةً فقط لا غير'],
    ['ar', '5', 'KWD', 'خمسة دنانير كويتية فقط لا غير'],
    ['ar', '0', 'SAR', 'صفر ريال سعودي فقط لا غير'],
    ['ar', '1200', 'SAR', 'ألف ومئتا ريال سعودي فقط لا غير'],
    ['ar', '200000', 'SAR', 'مئتا ألف ريال سعودي فقط لا غير'],
    ['ar', '250000', 'SAR', 'مئتان وخمسون ألف ريال سعودي فقط لا غير'],
    ['ar', '1250000.75', 'SAR', 'مليون ومئتان وخمسون ألف ريال سعودي و75/100 فقط لا غير'],
    ['ar', '21050', 'SAR', 'واحد وعشرون ألفاً وخمسون ريالاً سعودياً فقط لا غير'],
    ['ar', '123456000', 'SAR', 'مئة وثلاثة وعشرون مليوناً وأربعمئة وستة وخمسون ألف ريال سعودي فقط لا غير'],
    // section-28 formatting matrix + section-12 multi-currency grammar spot-check (audit)
    ['fmt', '0', 'USD', '0.00'],
    ['fmt', '1', 'USD', '1.00'],
    ['fmt', '2', 'USD', '2.00'],
    ['fmt', '10', 'USD', '10.00'],
    ['fmt', '11', 'USD', '11.00'],
    ['fmt', '12', 'USD', '12.00'],
    ['fmt', '19', 'USD', '19.00'],
    ['fmt', '20', 'USD', '20.00'],
    ['fmt', '21', 'USD', '21.00'],
    ['fmt', '99', 'USD', '99.00'],
    ['fmt', '100', 'USD', '100.00'],
    ['fmt', '101', 'USD', '101.00'],
    ['fmt', '110', 'USD', '110.00'],
    ['fmt', '111', 'USD', '111.00'],
    ['fmt', '200', 'USD', '200.00'],
    ['fmt', '999', 'USD', '999.00'],
    ['fmt', '1000', 'USD', '1,000.00'],
    ['fmt', '1001', 'USD', '1,001.00'],
    ['fmt', '1010', 'USD', '1,010.00'],
    ['fmt', '1100', 'USD', '1,100.00'],
    ['fmt', '1999', 'USD', '1,999.00'],
    ['fmt', '10000', 'USD', '10,000.00'],
    ['fmt', '100000', 'USD', '100,000.00'],
    ['fmt', '999999', 'USD', '999,999.00'],
    ['fmt', '1000000', 'USD', '1,000,000.00'],
    ['fmt', '1000001', 'USD', '1,000,001.00'],
    ['fmt', '1250000', 'USD', '1,250,000.00'],
    ['fmt', '999999999', 'USD', '999,999,999.00'],
    ['fmt', '1000000000', 'USD', '1,000,000,000.00'],
    ['fmt', '123456.01', 'USD', '123,456.01'],
    ['fmt', '123456.05', 'USD', '123,456.05'],
    ['fmt', '123456.10', 'USD', '123,456.10'],
    ['fmt', '123456.50', 'USD', '123,456.50'],
    ['fmt', '123456.78', 'USD', '123,456.78'],
    ['fmt', '123456.99', 'USD', '123,456.99'],
    ['fmt', '999999999999999.99', 'USD', '999,999,999,999,999.99'],
    ['en', '1250.75', 'AED', 'One Thousand Two Hundred Fifty UAE Dirhams and 75/100 Only'],
    ['ar', '1250.75', 'AED', 'ألف ومئتان وخمسون درهماً إماراتياً و75/100 فقط لا غير'],
    ['en', '1250.75', 'QAR', 'One Thousand Two Hundred Fifty Qatari Riyals and 75/100 Only'],
    ['ar', '1250.75', 'QAR', 'ألف ومئتان وخمسون ريالاً قطرياً و75/100 فقط لا غير'],
    ['en', '1250.75', 'KWD', 'One Thousand Two Hundred Fifty Kuwaiti Dinars and 75/100 Only'],
    ['ar', '1250.75', 'KWD', 'ألف ومئتان وخمسون ديناراً كويتياً و75/100 فقط لا غير'],
    ['en', '1250.75', 'BHD', 'One Thousand Two Hundred Fifty Bahraini Dinars and 75/100 Only'],
    ['ar', '1250.75', 'BHD', 'ألف ومئتان وخمسون ديناراً بحرينياً و75/100 فقط لا غير'],
    ['en', '1250.75', 'OMR', 'One Thousand Two Hundred Fifty Omani Rials and 75/100 Only'],
    ['ar', '1250.75', 'OMR', 'ألف ومئتان وخمسون ريالاً عمانياً و75/100 فقط لا غير'],
    ['en', '1250.75', 'JOD', 'One Thousand Two Hundred Fifty Jordanian Dinars and 75/100 Only'],
    ['ar', '1250.75', 'JOD', 'ألف ومئتان وخمسون ديناراً أردنياً و75/100 فقط لا غير'],
    ['en', '1250.75', 'EGP', 'One Thousand Two Hundred Fifty Egyptian Pounds and 75/100 Only'],
    ['ar', '1250.75', 'EGP', 'ألف ومئتان وخمسون جنيهاً مصرياً و75/100 فقط لا غير'],
    ['en', '1250.75', 'JPY', 'One Thousand Two Hundred Fifty Japanese Yen and 75/100 Only'],
    ['ar', '1250.75', 'JPY', 'ألف ومئتان وخمسون يناً يابانياً و75/100 فقط لا غير'],
    ['en', '1250.75', 'CNY', 'One Thousand Two Hundred Fifty Chinese Yuan and 75/100 Only'],
    ['ar', '1250.75', 'CNY', 'ألف ومئتان وخمسون يواناً صينياً و75/100 فقط لا غير'],
    ['en', '1250.75', 'CHF', 'One Thousand Two Hundred Fifty Swiss Francs and 75/100 Only'],
    ['ar', '1250.75', 'CHF', 'ألف ومئتان وخمسون فرنكاً سويسرياً و75/100 فقط لا غير'],
    ['en', '1250.75', 'CAD', 'One Thousand Two Hundred Fifty Canadian Dollars and 75/100 Only'],
    ['ar', '1250.75', 'CAD', 'ألف ومئتان وخمسون دولاراً كندياً و75/100 فقط لا غير'],
    ['en', '1250.75', 'AUD', 'One Thousand Two Hundred Fifty Australian Dollars and 75/100 Only'],
    ['ar', '1250.75', 'AUD', 'ألف ومئتان وخمسون دولاراً أسترالياً و75/100 فقط لا غير'],
    // audit fix: compound amounts ending in 1/2 — noun before the agreeing numeral
    ['ar', '101', 'SAR', 'مئة وريال سعودي واحد فقط لا غير'],
    ['ar', '102', 'SAR', 'مئة وريالان سعوديان فقط لا غير'],
    ['ar', '201', 'SAR', 'مئتان وريال سعودي واحد فقط لا غير'],
    ['ar', '1001', 'SAR', 'ألف وريال سعودي واحد فقط لا غير'],
    ['ar', '2001', 'SAR', 'ألفان وريال سعودي واحد فقط لا غير'],
    ['ar', '2002', 'SAR', 'ألفان وريالان سعوديان فقط لا غير'],
    // audit fix: idafa-style (fixed-phrase) currencies drop the dual's nun
    ['ar', '2', 'HKD', 'دولارا هونغ كونغ فقط لا غير'],
    ['ar', '2', 'KYD', 'دولارا جزر كايمان فقط لا غير'],
    ['ar', '2', 'ZAR', 'راندا جنوب أفريقي فقط لا غير'],
    ['err', '123.456', 'USD', 'TOO_MANY_DECIMALS'],
    ['err', '12,34', 'USD', 'BAD_COMMAS'],
    ['err', '1.2.3', 'USD', 'MULTIPLE_DECIMALS'],
    ['err', '-5', 'USD', 'NEGATIVE'],
    ['err', '12a3', 'USD', 'INVALID_CHARS'],
    // 3-decimal ISO currencies (KWD, BHD, OMR, JOD, TND): numeric precision
    // is currency-specific; the amount-in-words /100 convention still
    // truncates to exactly 2 fraction digits and never becomes /1000.
    ['fmt', '1', 'KWD', '1.000'], ['fmt', '1.1', 'KWD', '1.100'],
    ['fmt', '1.12', 'KWD', '1.120'], ['fmt', '1.123', 'KWD', '1.123'],
    ['fmt', '1000', 'KWD', '1,000.000'],
    ['fmt', '123456789.123', 'KWD', '123,456,789.123'],
    ['fmt', '1', 'SAR', '1.00'], ['fmt', '1.1', 'SAR', '1.10'], ['fmt', '1.12', 'SAR', '1.12'],
    ['err', '1.123', 'SAR', 'TOO_MANY_DECIMALS'],
    ['err', '1.1234', 'KWD', 'TOO_MANY_DECIMALS'],
    ['en', '1.001', 'KWD', 'One Kuwaiti Dinar Only'],
    ['en', '1.010', 'KWD', 'One Kuwaiti Dinar and 01/100 Only'],
    ['en', '1.011', 'KWD', 'One Kuwaiti Dinar and 01/100 Only'],
    ['en', '1.050', 'KWD', 'One Kuwaiti Dinar and 05/100 Only'],
    ['en', '1.099', 'KWD', 'One Kuwaiti Dinar and 09/100 Only'],
    ['en', '1.123', 'KWD', 'One Kuwaiti Dinar and 12/100 Only'],
    ['en', '1.999', 'KWD', 'One Kuwaiti Dinar and 99/100 Only'],
    ['en', '1.123', 'BHD', 'One Bahraini Dinar and 12/100 Only'],
    ['en', '1.123', 'OMR', 'One Omani Rial and 12/100 Only'],
    ['en', '1.123', 'JOD', 'One Jordanian Dinar and 12/100 Only'],
    ['en', '1.123', 'TND', 'One Tunisian Dinar and 12/100 Only'],
    ['ar', '1.001', 'KWD', 'دينار كويتي واحد فقط لا غير'],
    ['ar', '1.123', 'KWD', 'دينار كويتي واحد و12/100 فقط لا غير'],
    ['ar', '1.999', 'KWD', 'دينار كويتي واحد و99/100 فقط لا غير']
  ];

  /**
   * Internal verification harness, not wired to any UI control.
   * Run from the browser console: __ntwSelfTest()
   */
  function runSelfTests() {
    var passed = 0, failed = 0, failures = [];
    TESTS.forEach(function (tc) {
      var kind = tc[0], input = tc[1], code = tc[2], expected = tc[3];
      var r = NTW.convertAmount(input, code);
      var got;
      if (kind === 'err') got = r.ok ? '(accepted)' : r.code;
      else if (!r.ok) got = 'ERROR:' + r.code;
      else got = (kind === 'fmt') ? r.formatted : (kind === 'en' ? r.english : r.arabic);
      if (got === expected) { passed++; }
      else { failed++; failures.push({ case: code + ' ' + input, got: got, expected: expected }); }
    });
    if (failed) { console.error('Numbers-to-Words self test: ' + passed + ' passed, ' + failed + ' failed.'); console.table(failures); }
    else { console.log('Numbers-to-Words self test: all ' + passed + ' cases passed.'); }
    return { passed: passed, failed: failed, failures: failures };
  }
  window.__ntwSelfTest = runSelfTests;

  /* ----------------------------------------------------------------------
     Live thousands-separator formatting
     ----------------------------------------------------------------------
     Reformats the amount field on every keystroke/paste while preserving
     the caret position, so the user sees 1,234,567.89 as they type rather
     than only after conversion. The decimal portion is left untouched so
     TOO_MANY_DECIMALS validation can still surface a clear message instead
     of silently truncating a financial amount.
     ---------------------------------------------------------------------- */
  function groupIntegerPart(intPart) {
    return (/^\d+$/.test(intPart)) ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : intPart;
  }

  function reformatAmountField(el) {
    var raw = el.value;
    var selStart = (el.selectionStart === null) ? raw.length : el.selectionStart;
    var beforeCount = raw.slice(0, selStart).replace(/,/g, '').length;

    var cleaned = raw.replace(/,/g, '');
    var dotIdx = cleaned.indexOf('.');
    var intPart = (dotIdx === -1) ? cleaned : cleaned.slice(0, dotIdx);
    var rest = (dotIdx === -1) ? '' : cleaned.slice(dotIdx);
    var formatted = groupIntegerPart(intPart) + rest;

    if (formatted === raw) return;
    el.value = formatted;

    var pos = formatted.length, count = 0;
    if (beforeCount === 0) {
      pos = 0;
    } else {
      for (var i = 0; i < formatted.length; i++) {
        if (formatted.charAt(i) !== ',') count++;
        if (count === beforeCount) { pos = i + 1; break; }
      }
    }
    el.setSelectionRange(pos, pos);
  }

  /**
   * Adapts an already-valid amount string to a target decimal precision —
   * used both when the selected currency changes precision (e.g. SAR's 2dp
   * to KWD's 3dp, or back) and when the field settles (blur), so the
   * displayed amount always shows the currency's own precision without
   * forcing that padding on every keystroke while the user is still typing
   * (which would fight normal editing — see reformatAmountField above).
   *
   * Growing precision (e.g. 2dp -> 3dp) always pads with zeros: lossless.
   * Shrinking precision only trims trailing digits that are all zero —
   * lossless by definition. If a real (non-zero) digit would have to be
   * dropped to fit the new precision, returns null and changes nothing;
   * normal validation then surfaces a clear TOO_MANY_DECIMALS message
   * instead of silently discarding financial precision the user entered.
   */
  function adaptAmountToDecimals(rawValue, targetDecimals) {
    var cleaned = rawValue.replace(/,/g, '');
    var dotIdx = cleaned.indexOf('.');
    var intPart = (dotIdx === -1) ? cleaned : cleaned.slice(0, dotIdx);
    var fracPart = (dotIdx === -1) ? '' : cleaned.slice(dotIdx + 1);
    if (!/^\d*$/.test(intPart) || (intPart === '' && fracPart === '')) return null; // not a plain valid amount

    if (fracPart.length > targetDecimals) {
      var extra = fracPart.slice(targetDecimals);
      if (!/^0*$/.test(extra)) return null; // real precision would be lost
      fracPart = fracPart.slice(0, targetDecimals);
    } else {
      while (fracPart.length < targetDecimals) fracPart += '0';
    }
    return groupIntegerPart(intPart) + (targetDecimals > 0 ? '.' + fracPart : '');
  }

  /* ----------------------------------------------------------------------
     Wiring
     ---------------------------------------------------------------------- */
  populateCurrencySelect('');
  currencySelect.value = selectedCurrency;

  $('amount').addEventListener('input', function () {
    reformatAmountField(this);
    convert(false);
  });
  $('amount').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); convert(true); }
  });
  // On settle (leaving the field), pad a valid amount out to the selected
  // currency's full precision — "1" becomes "1.000" for KWD — without
  // forcing that on every keystroke, which would fight normal editing.
  $('amount').addEventListener('blur', function () {
    if (!hasResult) return;
    var decimals = NTW.getCurrency(selectedCurrency, readCustom()).decimals;
    var adapted = adaptAmountToDecimals(this.value, decimals);
    if (adapted !== null && adapted !== this.value) this.value = adapted;
  });

  // A pending debounced auto-commit (see below) — any explicit commit path
  // cancels it, so a delayed auto-pick can never fire after the user has
  // already moved on some other way.
  var pendingAutoCommit = null;
  function cancelPendingAutoCommit() {
    if (pendingAutoCommit) { window.clearTimeout(pendingAutoCommit); pendingAutoCommit = null; }
  }

  /** Apply `code` as the selected currency — the one path the select's own
   *  change event, the filter box's Enter, and the exact-match auto-commit
   *  all funnel through, so they behave identically. Never touches the
   *  Find-currency text: applying a currency must never erase what the
   *  user typed to find it. */
  function commitCurrencySelection(code) {
    cancelPendingAutoCommit();
    selectedCurrency = code;
    $('customPanel').hidden = (selectedCurrency !== 'CUSTOM');

    // Re-pad/re-trim the amount to the newly selected currency's own
    // precision (e.g. SAR's 2dp <-> KWD's 3dp) so it displays correctly
    // right away, without waiting for the user to touch the field again.
    // adaptAmountToDecimals refuses to drop any real (non-zero) digit, so
    // this never silently changes what the user actually entered.
    var newDecimals = NTW.getCurrency(code, readCustom()).decimals;
    var amountEl = $('amount');
    if (amountEl.value.trim() !== '') {
      var adapted = adaptAmountToDecimals(amountEl.value, newDecimals);
      if (adapted !== null && adapted !== amountEl.value) amountEl.value = adapted;
    }
    updateAmountHint();

    convert(false);
  }

  // Narrows the select's options live as the user types. Never touches
  // selectedCurrency by itself — except when what's been typed is already
  // an exact, unambiguous ISO code (or CUSTOM): typing "SAR" in full commits
  // it automatically, the same as picking it, with no extra Enter needed.
  // The commit is debounced briefly rather than instant, because a
  // currency's *name* can transiently pass through its own code as a
  // prefix while being typed (e.g. "Eur" en route to "Euro") — waiting a
  // beat and re-checking the field still holds that exact code avoids
  // locking in a pick before the user has finished typing a longer word.
  // Focusing the field (by click or by Tab) selects its existing text, so
  // the very next keystroke replaces it instead of appending to it. A
  // plain focus-time select() is not enough: the same click that caused
  // the focus also fires its own native mouseup, which collapses the
  // selection back down to a caret at the click point right afterward.
  // So the mousedown that is *about* to focus the (not-yet-focused) field
  // is flagged, and only that click's mouseup is suppressed — a later
  // click made while the field is already focused (to reposition the
  // caret normally) is left alone.
  var filterWasUnfocused = false;
  currencyFilter.addEventListener('mousedown', function () {
    filterWasUnfocused = (document.activeElement !== this);
  });
  currencyFilter.addEventListener('focus', function () {
    this.select();
  });
  currencyFilter.addEventListener('mouseup', function (e) {
    if (filterWasUnfocused) {
      filterWasUnfocused = false;
      e.preventDefault();
    }
  });
  currencyFilter.addEventListener('input', function () {
    populateCurrencySelect(this.value);
    cancelPendingAutoCommit();
    var exact = this.value.trim().toUpperCase();
    if (exact && (NTW.CURRENCIES[exact] || exact === 'CUSTOM')) {
      var el = this;
      pendingAutoCommit = window.setTimeout(function () {
        pendingAutoCommit = null;
        if (el.value.trim().toUpperCase() === exact) commitCurrencySelection(exact);
      }, 450);
    }
  });
  currencyFilter.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelPendingAutoCommit();
      this.blur();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Commit whatever the filtered list is currently showing as the top/
      // selected match — this is what was missing: Enter used to just move
      // focus into the select without ever actually applying a pick.
      if (currencySelect.options.length) commitCurrencySelection(currencySelect.value);
    }
  });
  // If the user finished typing an exact code and clicked elsewhere before
  // the debounce above fired, that's still a completed, valid pick — apply
  // it. Either way, what they typed stays in the box exactly as they left
  // it; blurring never clears or rewrites the Find-currency field.
  currencyFilter.addEventListener('blur', function () {
    if (!pendingAutoCommit) return;
    var exact = this.value.trim().toUpperCase();
    cancelPendingAutoCommit();
    if (NTW.CURRENCIES[exact] || exact === 'CUSTOM') commitCurrencySelection(exact);
  });

  currencySelect.addEventListener('change', function () {
    commitCurrencySelection(currencySelect.value);
  });

  ['cCode', 'cEnS', 'cEnP', 'cArS', 'cArD', 'cArP', 'cArA'].forEach(function (id) {
    $(id).addEventListener('input', function () { convert(false); });
  });
  $('cGender').addEventListener('change', function () { convert(false); });

  $('btnClear').addEventListener('click', clearForm);
  $('btnCopyEn').addEventListener('click', function () { copyResult('en'); });
  $('btnCopyAr').addEventListener('click', function () { copyResult('ar'); });
  $('btnCopyResult').addEventListener('click', function () { copyResult('primary'); });
  $('btnCopyAll').addEventListener('click', function () { copyResult('all'); });
  $('langEn').addEventListener('click', function () { setLanguage('en'); });
  $('langAr').addEventListener('click', function () { setLanguage('ar'); });

  setLanguage(readStoredLanguage() || 'en');
})();
