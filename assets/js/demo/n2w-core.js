// Numbers-to-words conversion core (English and Arabic), unchanged from the
// original tool. Pure logic, no DOM access.
/* =========================================================================
   Numbers to Words Converter — Conversion Core
   Pure logic. No DOM access. Safe for financial use (string / BigInt based).
   ========================================================================= */
(function (root) {
  'use strict';

  /* ----------------------------------------------------------------------
     1. Constants
     ---------------------------------------------------------------------- */

  var MAX_INT_DIGITS = 36;          // up to 999...999 (36 digits) = < 10^36
  var FATHATAN = 'ً';          // Arabic tanwin fath  ( ً )
  // \s plus NBSP, narrow-no-break-space, and the General Punctuation space
  // block (EN QUAD..ZERO WIDTH SPACE) -- named + escaped explicitly so the
  // pattern is unambiguous in source rather than relying on invisible
  // literal whitespace characters inside a character class.
  var WHITESPACE_RE = /[\s\u00A0\u202F\u2000-\u200B]/g;

  /* ----------------------------------------------------------------------
     2. Input parsing & validation
     ---------------------------------------------------------------------- */

  // Arabic-Indic and Eastern Arabic-Indic digits -> ASCII
  var DIGIT_MAP = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
    '٫': '.', // Arabic decimal separator
    '٬': ','  // Arabic thousands separator
  };

  function normalizeDigits(raw) {
    var out = '';
    for (var i = 0; i < raw.length; i++) {
      var ch = raw.charAt(i);
      out += (DIGIT_MAP[ch] !== undefined) ? DIGIT_MAP[ch] : ch;
    }
    return out;
  }

  /**
   * validateInput(raw, maxDecimals)
   * Returns { ok:true, integer:"123456", fraction:"78" }
   *      or { ok:false, code:"ERROR_CODE" }
   * Never rounds, never silently repairs a malformed amount.
   * maxDecimals is the selected currency's own minor-unit precision (2 for
   * almost every currency, 3 for KWD/BHD/OMR/JOD/TND) -- defaults to 2 so
   * any caller that predates currency-aware precision keeps working
   * unchanged. This is purely how many fraction digits the NUMERIC value
   * may carry; it has no bearing on the separate amount-in-words /100
   * convention, which always operates on exactly two digits regardless.
   */
  function validateInput(raw, maxDecimals) {
    if (maxDecimals !== 2 && maxDecimals !== 3) maxDecimals = 2;
    if (raw === null || raw === undefined) return { ok: false, code: 'EMPTY' };

    var s = normalizeDigits(String(raw));
    s = s.replace(WHITESPACE_RE, ''); // all whitespace incl. NBSP / thin space

    if (s === '') return { ok: false, code: 'EMPTY' };

    if (s.charAt(0) === '+') s = s.slice(1);
    if (s.indexOf('-') !== -1 || s.indexOf('−') !== -1) {
      return { ok: false, code: 'NEGATIVE' };
    }
    if (s === '') return { ok: false, code: 'EMPTY' };

    if (!/^[0-9.,]+$/.test(s)) return { ok: false, code: 'INVALID_CHARS' };

    var dots = s.split('.').length - 1;
    if (dots > 1) return { ok: false, code: 'MULTIPLE_DECIMALS' };

    var intPart, fracPart;
    if (dots === 1) {
      var pieces = s.split('.');
      intPart = pieces[0];
      fracPart = pieces[1];
    } else {
      intPart = s;
      fracPart = '';
    }

    // Fraction: digits only, at most the selected currency's precision.
    // Never round or truncate a digit the user actually entered.
    if (fracPart.indexOf(',') !== -1) return { ok: false, code: 'INVALID_CHARS' };
    if (fracPart.length > maxDecimals) return { ok: false, code: 'TOO_MANY_DECIMALS' };

    // Integer part: either plain digits, or correctly grouped in threes.
    if (intPart === '') {
      if (fracPart === '') return { ok: false, code: 'NO_DIGITS' };
      intPart = '0';                       // ".50" -> "0.50"
    } else if (intPart.indexOf(',') !== -1) {
      if (!/^\d{1,3}(,\d{3})+$/.test(intPart)) return { ok: false, code: 'BAD_COMMAS' };
      intPart = intPart.replace(/,/g, '');
    } else if (!/^\d+$/.test(intPart)) {
      return { ok: false, code: 'INVALID_CHARS' };
    }

    // Strip leading zeros (keep at least one digit).
    intPart = intPart.replace(/^0+(?=\d)/, '');
    if (intPart.length > MAX_INT_DIGITS) return { ok: false, code: 'TOO_LARGE' };

    // Pad the fraction to the currency's exact precision: "7" -> "70" (2dp)
    // or "700" (3dp); "" -> "00"/"000".
    while (fracPart.length < maxDecimals) fracPart += '0';

    return { ok: true, integer: intPart, fraction: fracPart };
  }

  /**
   * parseAmount(raw, maxDecimals) -> { ok, whole:BigInt, integer:String, fraction:String }
   */
  function parseAmount(raw, maxDecimals) {
    var v = validateInput(raw, maxDecimals);
    if (!v.ok) return v;
    return {
      ok: true,
      integer: v.integer,
      fraction: v.fraction,
      whole: BigInt(v.integer)
    };
  }

  /* ----------------------------------------------------------------------
     3. Numeric formatting — always 1,234,567.89
     ---------------------------------------------------------------------- */

  function groupThousands(digits) {
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /** formatAmount("123456","78") -> "123,456.78" */
  function formatAmount(integer, fraction) {
    return groupThousands(integer) + '.' + fraction;
  }

  /* ----------------------------------------------------------------------
     4. English number-to-words
     ---------------------------------------------------------------------- */

  var EN_ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven',
    'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen',
    'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

  var EN_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty',
    'Seventy', 'Eighty', 'Ninety'];

  // Short scale. Index = group position (0 = units).
  var EN_SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion',
    'Quadrillion', 'Quintillion', 'Sextillion', 'Septillion', 'Octillion',
    'Nonillion', 'Decillion'];

  function enUnder1000(n) {
    var parts = [];
    var h = Math.floor(n / 100);
    var r = n % 100;
    if (h) parts.push(EN_ONES[h] + ' Hundred');
    if (r) {
      if (r < 20) {
        parts.push(EN_ONES[r]);
      } else {
        var t = Math.floor(r / 10), u = r % 10;
        parts.push(u ? EN_TENS[t] + '-' + EN_ONES[u] : EN_TENS[t]);
      }
    }
    return parts.join(' ');
  }

  /** Split a digit string into 3-digit groups, most significant first. */
  function splitGroups(digits) {
    var groups = [];
    for (var end = digits.length; end > 0; end -= 3) {
      groups.unshift(parseInt(digits.slice(Math.max(0, end - 3), end), 10));
    }
    return groups;
  }

  /** numberToEnglishWords(BigInt) -> "One Hundred Twenty-Three Thousand ..." */
  function numberToEnglishWords(value) {
    var digits = value.toString();
    if (digits === '0') return 'Zero';
    var groups = splitGroups(digits);
    var top = groups.length - 1;               // scale index of first group
    var out = [];
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (g === 0) continue;
      var scale = EN_SCALES[top - i];
      out.push(enUnder1000(g) + (scale ? ' ' + scale : ''));
    }
    return out.join(' ');
  }

  /* ----------------------------------------------------------------------
     5. Arabic number-to-words
     ----------------------------------------------------------------------
     Grammar notes (Modern Standard Arabic, financial register):

     * Reverse gender agreement (التمييز المعدود) for 3-10: the numeral takes
       the OPPOSITE gender of the counted noun, so a masculine noun such as
       "ريال" is counted with "ثلاثة", a feminine noun such as "ليرة" with "ثلاث".
     * 1 and 2 agree normally, and are expressed by the noun itself
       (singular / dual) rather than by a numeral.
     * Form of the counted noun, decided by r = n mod 100:
         r = 0        -> singular, genitive  (مئة ريالٍ / ألف ريالٍ)
         r = 1 or 2   -> singular
         r = 3 .. 10  -> plural, genitive    (خمسة ريالاتٍ)
         r = 11 .. 99 -> singular, accusative(خمسون ريالاً)
     * Idafa (إضافة): a dual immediately preceding the noun it counts drops
       its final nun — مئتان + ريال => "مئتا ريال", ألفان + ريال => "ألفا ريال".
     ---------------------------------------------------------------------- */

  var AR_ONES_M = ['', 'واحد', 'اثنان',
    'ثلاثة', 'أربعة',
    'خمسة', 'ستة', 'سبعة',
    'ثمانية', 'تسعة',
    'عشرة'];

  var AR_ONES_F = ['', 'واحدة', 'اثنتان',
    'ثلاث', 'أربع', 'خمس',
    'ست', 'سبع', 'ثمان', 'تسع',
    'عشر'];

  // index 1..9 -> 11..19
  var AR_TEENS_M = ['', 'أحد عشر',
    'اثنا عشر',
    'ثلاثة عشر',
    'أربعة عشر',
    'خمسة عشر', 'ستة عشر',
    'سبعة عشر',
    'ثمانية عشر',
    'تسعة عشر'];

  var AR_TEENS_F = ['', 'إحدى عشرة',
    'اثنتا عشرة',
    'ثلاث عشرة',
    'أربع عشرة', 'خمس عشرة',
    'ست عشرة', 'سبع عشرة',
    'ثمان عشرة', 'تسع عشرة'];

  var AR_TENS = ['', '', 'عشرون', 'ثلاثون',
    'أربعون', 'خمسون',
    'ستون', 'سبعون', 'ثمانون',
    'تسعون'];

  var AR_HUNDREDS = ['', 'مئة', 'مئتان',
    'ثلاثمئة', 'أربعمئة',
    'خمسمئة', 'ستمئة',
    'سبعمئة', 'ثمانمئة',
    'تسعمئة'];

  var AR_ZERO = 'صفر';
  var AR_ONLY = 'فقط لا غير';   // Saudi cheque/banking closing convention
  var AR_AND = ' و';   // wa- prefix: joined to the following word

  /**
   * Scale words. Each carries the four grammatical forms required by the
   * tamyiz rules above, plus the construct (nun-dropped) dual.
   */
  function scale(sing, plural) {
    return {
      s: sing,
      d: sing + 'ان',            // ألفان
      dc: sing + 'ا',                 // ألفا  (construct / idafa)
      p: plural,
      a: sing + 'ا' + FATHATAN        // ألفاً
    };
  }

  var AR_SCALES = [
    null,
    scale('ألف', 'آلاف'),                                   // ألف / آلاف
    scale('مليون', 'ملايين'),           // مليون / ملايين
    scale('مليار', 'مليارات'),     // مليار
    scale('تريليون', 'تريليونات'),
    scale('كوادريليون', 'كوادريليونات'),
    scale('كوينتليون', 'كوينتليونات'),
    scale('سكستليون', 'سكستليونات'),
    scale('سبتليون', 'سبتليونات'),
    scale('أوكتليون', 'أوكتليونات'),
    scale('نونيليون', 'نونيليونات'),
    scale('ديسيليون', 'ديسيليونات')
  ];

  /**
   * Endings rewritten when the word is the LAST one before a noun annexed to
   * it (idafa). Two transformations are needed:
   *   - a dual drops its final nun:     ألفان ريال  -> ألفا ريال
   *   - an accusative tamyiz drops its  خمسون ألفاً ريال -> خمسون ألف ريال
   *     tanwin, because an annexed noun cannot carry one.
   * Deliberately excludes اثنان: that numeral is never in idafa here.
   */
  var AR_CONSTRUCT_PAIRS = (function () {
    var pairs = [['مئتان', 'مئتا']]; // مئتان -> مئتا
    for (var i = 1; i < AR_SCALES.length; i++) {
      pairs.push([AR_SCALES[i].d, AR_SCALES[i].dc]);   // ألفان -> ألفا
      pairs.push([AR_SCALES[i].a, AR_SCALES[i].s]);    // ألفاً  -> ألف
    }
    return pairs;
  })();

  function applyConstructState(text) {
    for (var i = 0; i < AR_CONSTRUCT_PAIRS.length; i++) {
      var dual = AR_CONSTRUCT_PAIRS[i][0];
      if (text.length >= dual.length && text.slice(-dual.length) === dual) {
        return text.slice(0, text.length - dual.length) + AR_CONSTRUCT_PAIRS[i][1];
      }
    }
    return text;
  }

  /**
   * 1..999 in Arabic, agreeing with the gender of the counted noun.
   * `omitFinalOneOrTwo`: when the group's own last two digits are exactly
   * 01 or 02, leave that final "one"/"two" out of the digit-spelling
   * entirely. Compound amounts ending in 1 or 2 (101, 1001, 2002, ...) do
   * not say "[number] وواحد [noun]" — MSA numeral-noun agreement instead
   * places the noun immediately after the higher digits and lets "واحد"/
   * the dual noun carry the agreement afterward: "مائة وريال واحد", never
   * "مئة وواحد ريال" (verified against Arabic grammar references on
   * numeral-counted-noun agreement for 1 and 2, since these two numbers
   * are the ones that follow rather than precede their counted noun).
   * The caller is responsible for appending that agreeing noun form.
   */
  function arUnder1000(n, gender, omitFinalOneOrTwo) {
    var ones = (gender === 'f') ? AR_ONES_F : AR_ONES_M;
    var teens = (gender === 'f') ? AR_TEENS_F : AR_TEENS_M;
    var parts = [];
    var h = Math.floor(n / 100);
    var r = n % 100;
    if (h) parts.push(AR_HUNDREDS[h]);
    if (r) {
      if (omitFinalOneOrTwo && (r === 1 || r === 2)) {
        // handled by the caller via noun agreement — nothing to add here
      } else if (r <= 10) {
        parts.push(ones[r]);
      } else if (r < 20) {
        parts.push(teens[r - 10]);
      } else {
        var t = Math.floor(r / 10), u = r % 10;
        parts.push(u ? ones[u] + AR_AND + AR_TENS[t] : AR_TENS[t]);
      }
    }
    return parts.join(AR_AND);
  }

  /**
   * One scale group (thousands, millions, ...). The scale word is itself the
   * counted noun, and it is always masculine, so the numeral uses masculine
   * agreement.
   */
  function arScaleGroup(count, sc) {
    if (count === 1) return sc.s;                       // ألف
    if (count === 2) return sc.d;                       // ألفان
    var r = count % 100;
    var num = arUnder1000(count, 'm');
    if (r >= 3 && r <= 10) return num + ' ' + sc.p;     // ثلاثة آلاف
    if (r >= 11) return num + ' ' + sc.a;               // ثلاثة وعشرون ألفاً
    return applyConstructState(num) + ' ' + sc.s;       // مئتا ألف / مئة ألف
  }

  /**
   * numberToArabicWords(BigInt, gender of the counted noun, omitFinalOneOrTwo)
   * omitFinalOneOrTwo only ever applies to the units group (idx === 0),
   * since r = value % 100 — the condition this whole file's r-based
   * grammar dispatch keys off — is entirely determined by that group.
   */
  function numberToArabicWords(value, gender, omitFinalOneOrTwo) {
    var digits = value.toString();
    if (digits === '0') return AR_ZERO;
    var groups = splitGroups(digits);
    var top = groups.length - 1;
    var parts = [];
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      if (g === 0) continue;
      var idx = top - i;
      if (idx === 0) {
        var piece = arUnder1000(g, gender, omitFinalOneOrTwo);
        if (piece) parts.push(piece);
      } else {
        parts.push(arScaleGroup(g, AR_SCALES[idx]));
      }
    }
    return parts.join(AR_AND);
  }

  root.__NTW_CORE_A__ = {
    MAX_INT_DIGITS: MAX_INT_DIGITS,
    FATHATAN: FATHATAN,
    validateInput: validateInput,
    parseAmount: parseAmount,
    groupThousands: groupThousands,
    formatAmount: formatAmount,
    numberToEnglishWords: numberToEnglishWords,
    numberToArabicWords: numberToArabicWords,
    applyConstructState: applyConstructState,
    AR_ONLY: AR_ONLY,
    AR_AND: AR_AND
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* =========================================================================
   Numbers to Words Converter — Currency configuration
   Centralised, data-driven. Arabic forms are generated from a noun stem and
   an optional nisba (relative adjective) so the table stays maintainable.
   ========================================================================= */
(function (root) {
  'use strict';

  var FATHATAN = root.__NTW_CORE_A__.FATHATAN;

  /* ----------------------------------------------------------------------
     Arabic noun declension.
       - stem ending in ة  -> feminine  (ليرة / ليرتان / ليرات / ليرةً)
       - stem ending in ا or و -> indeclinable loanword (بيزو، كوانزا)
       - otherwise -> sound masculine (ريال / ريالان / ريالات / ريالاً)
     ---------------------------------------------------------------------- */
  function declineNoun(word, pluralOverride) {
    var last = word.charAt(word.length - 1);

    if (last === 'ة') {
      var stem = word.slice(0, -1);
      return {
        s: word,
        d: stem + 'تان',
        dc: stem + 'تا',       // construct-state dual (idafa): drops the nun
        p: pluralOverride || stem + 'ات',
        a: word + FATHATAN,
        g: 'f'
      };
    }

    if (last === 'ا' || last === 'و' || last === 'ى') {
      // Loanwords that do not inflect; the adjective carries the marking.
      return {
        s: word,
        d: word,
        dc: word,               // already invariant — nothing to drop
        p: pluralOverride || word,
        a: word,
        g: (last === 'ا') ? 'f' : 'm',
        indeclinable: true
      };
    }

    return {
      s: word,
      d: word + 'ان',
      dc: word + 'ا',          // construct-state dual (idafa): drops the nun
      p: pluralOverride || word + 'ات',
      a: word + 'ا' + FATHATAN,
      g: 'm'
    };
  }

  /* ----------------------------------------------------------------------
     Nisba adjective agreement. Non-human plurals take the feminine singular
     adjective, hence p === feminine singular for both genders.
     ---------------------------------------------------------------------- */
  function declineAdjective(base, gender) {
    if (gender === 'f') {
      return {
        s: base + 'ة',
        d: base + 'تان',
        p: base + 'ة',
        a: base + 'ة' + FATHATAN
      };
    }
    return {
      s: base,
      d: base + 'ان',
      p: base + 'ة',
      a: base + 'ا' + FATHATAN
    };
  }

  /**
   * Build the four Arabic currency forms.
   * `adjective` may be:
   *   ""            -> no qualifier            (يورو)
   *   "سعودي"        -> nisba, fully declined   (ريال سعودي / ريالاً سعودياً)
   *   "*جزر كايمان"  -> fixed phrase, appended unchanged
   */
  function buildArabicForms(nounWord, adjective, pluralOverride) {
    var n = declineNoun(nounWord, pluralOverride);

    if (!adjective) {
      var dual = n.d;
      if (n.indeclinable) dual = n.s + (n.g === 'f' ? ' اثنتان' : ' اثنان');
      return { s: n.s, d: dual, p: n.p, a: n.a, g: n.g };
    }

    if (adjective.charAt(0) === '*') {
      // A fixed phrase here is a genitive annexation (idafa), e.g.
      // "دولار" + "جزر كايمان" = "دولار جزر كايمان" ("Dollar OF the Cayman
      // Islands"), not a noun+adjective pair. Idafa carries two
      // consequences for the first term (the mudaf): it never takes
      // tanwin (undiacritized text looks the same regardless of case, so
      // singular and accusative are identical here — n.s for both), and a
      // dual or sound-plural mudaf drops its final nun, hence dc (not d)
      // for the dual: "دولاران" -> "دولارا جزر كايمان", never "دولاران جزر كايمان".
      var fixed = ' ' + adjective.slice(1);
      return {
        s: n.s + fixed,
        d: n.dc + fixed,
        p: n.p + fixed,
        a: n.s + fixed,
        g: n.g
      };
    }

    var a = declineAdjective(adjective, n.g);
    return {
      s: n.s + ' ' + a.s,
      d: n.d + ' ' + a.d,
      p: n.p + ' ' + a.p,
      a: n.a + ' ' + a.a,
      g: n.g
    };
  }

  /* ----------------------------------------------------------------------
     ISO 4217 table.
     code | English singular | English plural | Arabic noun | Arabic nisba
          | Arabic broken-plural override
     ---------------------------------------------------------------------- */
  var ROWS = [
    'AED|UAE Dirham|UAE Dirhams|درهم|إماراتي|دراهم',
    'AFN|Afghan Afghani|Afghan Afghanis|أفغاني||',
    'ALL|Albanian Lek|Albanian Leks|ليك|ألباني|',
    'AMD|Armenian Dram|Armenian Drams|درام|أرميني|',
    'ANG|Netherlands Antillean Guilder|Netherlands Antillean Guilders|غيلدر|*أنتيلي هولندي|',
    'AOA|Angolan Kwanza|Angolan Kwanzas|كوانزا|أنغولي|',
    'ARS|Argentine Peso|Argentine Pesos|بيزو|أرجنتيني|',
    'AUD|Australian Dollar|Australian Dollars|دولار|أسترالي|',
    'AWG|Aruban Florin|Aruban Florins|فلورين|أروبي|',
    'AZN|Azerbaijani Manat|Azerbaijani Manat|مانات|أذربيجاني|',
    'BAM|Bosnia and Herzegovina Convertible Mark|Bosnia and Herzegovina Convertible Marks|مارك|*بوسني قابل للتحويل|',
    'BBD|Barbados Dollar|Barbados Dollars|دولار|باربادوسي|',
    'BDT|Bangladeshi Taka|Bangladeshi Taka|تاكا|بنغلاديشي|',
    'BGN|Bulgarian Lev|Bulgarian Leva|ليف|بلغاري|',
    'BHD|Bahraini Dinar|Bahraini Dinars|دينار|بحريني|دنانير',
    'BIF|Burundian Franc|Burundian Francs|فرنك|بوروندي|',
    'BMD|Bermudian Dollar|Bermudian Dollars|دولار|برمودي|',
    'BND|Brunei Dollar|Brunei Dollars|دولار|*بروناي|',
    'BOB|Bolivian Boliviano|Bolivian Bolivianos|بوليفيانو||',
    'BRL|Brazilian Real|Brazilian Reals|ريال|برازيلي|',
    'BSD|Bahamian Dollar|Bahamian Dollars|دولار|باهامي|',
    'BTN|Bhutanese Ngultrum|Bhutanese Ngultrum|نغولتروم|بوتاني|',
    'BWP|Botswana Pula|Botswana Pula|بولا|بوتسواني|',
    'BYN|Belarusian Ruble|Belarusian Rubles|روبل|بيلاروسي|',
    'BZD|Belize Dollar|Belize Dollars|دولار|بليزي|',
    'CAD|Canadian Dollar|Canadian Dollars|دولار|كندي|',
    'CDF|Congolese Franc|Congolese Francs|فرنك|كونغولي|',
    'CHF|Swiss Franc|Swiss Francs|فرنك|سويسري|',
    'CLP|Chilean Peso|Chilean Pesos|بيزو|تشيلي|',
    'CNY|Chinese Yuan|Chinese Yuan|يوان|صيني|',
    'COP|Colombian Peso|Colombian Pesos|بيزو|كولومبي|',
    'CRC|Costa Rican Colon|Costa Rican Colones|كولون|كوستاريكي|',
    'CUP|Cuban Peso|Cuban Pesos|بيزو|كوبي|',
    'CVE|Cape Verdean Escudo|Cape Verdean Escudos|إسكودو|*كابو فيردي|',
    'CZK|Czech Koruna|Czech Koruny|كورونا|تشيكي|',
    'DJF|Djiboutian Franc|Djiboutian Francs|فرنك|جيبوتي|',
    'DKK|Danish Krone|Danish Kroner|كرونة|دنماركي|',
    'DOP|Dominican Peso|Dominican Pesos|بيزو|دومينيكي|',
    'DZD|Algerian Dinar|Algerian Dinars|دينار|جزائري|دنانير',
    'EGP|Egyptian Pound|Egyptian Pounds|جنيه|مصري|',
    'ERN|Eritrean Nakfa|Eritrean Nakfa|نقفة|إريتري|',
    'ETB|Ethiopian Birr|Ethiopian Birr|بير|إثيوبي|',
    'EUR|Euro|Euros|يورو||',
    'FJD|Fijian Dollar|Fijian Dollars|دولار|فيجي|',
    'FKP|Falkland Islands Pound|Falkland Islands Pounds|جنيه|*جزر فوكلاند|',
    'GBP|British Pound|British Pounds|جنيه|إسترليني|',
    'GEL|Georgian Lari|Georgian Lari|لاري|جورجي|',
    'GHS|Ghanaian Cedi|Ghanaian Cedis|سيدي|غاني|',
    'GIP|Gibraltar Pound|Gibraltar Pounds|جنيه|*جبل طارق|',
    'GMD|Gambian Dalasi|Gambian Dalasis|دالاسي|غامبي|',
    'GNF|Guinean Franc|Guinean Francs|فرنك|غيني|',
    'GTQ|Guatemalan Quetzal|Guatemalan Quetzales|كتزال|غواتيمالي|',
    'GYD|Guyana Dollar|Guyana Dollars|دولار|غياني|',
    'HKD|Hong Kong Dollar|Hong Kong Dollars|دولار|*هونغ كونغ|',
    'HNL|Honduran Lempira|Honduran Lempiras|ليمبيرا|هندوراسي|',
    'HTG|Haitian Gourde|Haitian Gourdes|غورد|هايتي|',
    'HUF|Hungarian Forint|Hungarian Forint|فورنت|مجري|',
    'IDR|Indonesian Rupiah|Indonesian Rupiah|روبية|إندونيسي|',
    'ILS|Israeli New Shekel|Israeli New Shekels|شيكل|إسرائيلي|',
    'INR|Indian Rupee|Indian Rupees|روبية|هندي|',
    'IQD|Iraqi Dinar|Iraqi Dinars|دينار|عراقي|دنانير',
    'IRR|Iranian Rial|Iranian Rials|ريال|إيراني|',
    'ISK|Icelandic Krona|Icelandic Kronur|كرونة|آيسلندي|',
    'JMD|Jamaican Dollar|Jamaican Dollars|دولار|جامايكي|',
    'JOD|Jordanian Dinar|Jordanian Dinars|دينار|أردني|دنانير',
    'JPY|Japanese Yen|Japanese Yen|ين|ياباني|',
    'KES|Kenyan Shilling|Kenyan Shillings|شلن|كيني|',
    'KGS|Kyrgyzstani Som|Kyrgyzstani Som|سوم|قيرغيزي|',
    'KHR|Cambodian Riel|Cambodian Riel|رييل|كمبودي|',
    'KMF|Comorian Franc|Comorian Francs|فرنك|قمري|',
    'KPW|North Korean Won|North Korean Won|وون|*كوري شمالي|',
    'KRW|South Korean Won|South Korean Won|وون|*كوري جنوبي|',
    'KWD|Kuwaiti Dinar|Kuwaiti Dinars|دينار|كويتي|دنانير',
    'KYD|Cayman Islands Dollar|Cayman Islands Dollars|دولار|*جزر كايمان|',
    'KZT|Kazakhstani Tenge|Kazakhstani Tenge|تينغي|كازاخستاني|',
    'LAK|Lao Kip|Lao Kip|كيب|لاوسي|',
    'LBP|Lebanese Pound|Lebanese Pounds|ليرة|لبناني|',
    'LKR|Sri Lankan Rupee|Sri Lankan Rupees|روبية|سريلانكي|',
    'LRD|Liberian Dollar|Liberian Dollars|دولار|ليبيري|',
    'LSL|Lesotho Loti|Lesotho Maloti|لوتي|ليسوتي|',
    'LYD|Libyan Dinar|Libyan Dinars|دينار|ليبي|دنانير',
    'MAD|Moroccan Dirham|Moroccan Dirhams|درهم|مغربي|دراهم',
    'MDL|Moldovan Leu|Moldovan Lei|ليو|مولدوفي|',
    'MGA|Malagasy Ariary|Malagasy Ariary|أرياري|ملغاشي|',
    'MKD|Macedonian Denar|Macedonian Denari|دينار|مقدوني|دنانير',
    'MMK|Myanmar Kyat|Myanmar Kyats|كيات|ميانماري|',
    'MNT|Mongolian Tugrik|Mongolian Tugrik|توغريك|منغولي|',
    'MOP|Macanese Pataca|Macanese Patacas|باتاكا|ماكاوي|',
    'MRU|Mauritanian Ouguiya|Mauritanian Ouguiya|أوقية|موريتاني|',
    'MUR|Mauritian Rupee|Mauritian Rupees|روبية|موريشي|',
    'MVR|Maldivian Rufiyaa|Maldivian Rufiyaa|روفية|مالديفي|',
    'MWK|Malawian Kwacha|Malawian Kwacha|كواتشا|مالاوي|',
    'MXN|Mexican Peso|Mexican Pesos|بيزو|مكسيكي|',
    'MYR|Malaysian Ringgit|Malaysian Ringgit|رينغيت|ماليزي|',
    'MZN|Mozambican Metical|Mozambican Meticais|متكال|موزمبيقي|',
    'NAD|Namibian Dollar|Namibian Dollars|دولار|ناميبي|',
    'NGN|Nigerian Naira|Nigerian Naira|نايرا|نيجيري|',
    'NIO|Nicaraguan Cordoba|Nicaraguan Cordobas|كوردوبا|نيكاراغوي|',
    'NOK|Norwegian Krone|Norwegian Kroner|كرونة|نرويجي|',
    'NPR|Nepalese Rupee|Nepalese Rupees|روبية|نيبالي|',
    'NZD|New Zealand Dollar|New Zealand Dollars|دولار|نيوزيلندي|',
    'OMR|Omani Rial|Omani Rials|ريال|عماني|',
    'PAB|Panamanian Balboa|Panamanian Balboas|بالبوا|بنمي|',
    'PEN|Peruvian Sol|Peruvian Soles|سول|بيروفي|',
    'PGK|Papua New Guinean Kina|Papua New Guinean Kina|كينا|*بابوا غينيا الجديدة|',
    'PHP|Philippine Peso|Philippine Pesos|بيزو|فلبيني|',
    'PKR|Pakistani Rupee|Pakistani Rupees|روبية|باكستاني|',
    'PLN|Polish Zloty|Polish Zlotys|زلوتي|بولندي|',
    'PYG|Paraguayan Guarani|Paraguayan Guaranies|غواراني|باراغوايي|',
    'QAR|Qatari Riyal|Qatari Riyals|ريال|قطري|',
    'RON|Romanian Leu|Romanian Lei|ليو|روماني|',
    'RSD|Serbian Dinar|Serbian Dinars|دينار|صربي|دنانير',
    'RUB|Russian Ruble|Russian Rubles|روبل|روسي|',
    'RWF|Rwandan Franc|Rwandan Francs|فرنك|رواندي|',
    'SAR|Saudi Riyal|Saudi Riyals|ريال|سعودي|',
    'SBD|Solomon Islands Dollar|Solomon Islands Dollars|دولار|*جزر سليمان|',
    'SCR|Seychellois Rupee|Seychellois Rupees|روبية|سيشلي|',
    'SDG|Sudanese Pound|Sudanese Pounds|جنيه|سوداني|',
    'SEK|Swedish Krona|Swedish Kronor|كرونة|سويدي|',
    'SGD|Singapore Dollar|Singapore Dollars|دولار|سنغافوري|',
    'SHP|Saint Helena Pound|Saint Helena Pounds|جنيه|*سانت هيلينا|',
    'SLE|Sierra Leonean Leone|Sierra Leonean Leones|ليون|سيراليوني|',
    'SOS|Somali Shilling|Somali Shillings|شلن|صومالي|',
    'SRD|Surinamese Dollar|Surinamese Dollars|دولار|سورينامي|',
    'SSP|South Sudanese Pound|South Sudanese Pounds|جنيه|*جنوب سوداني|',
    'STN|Sao Tome and Principe Dobra|Sao Tome and Principe Dobras|دوبرا|*ساو تومي وبرينسيبي|',
    'SVC|Salvadoran Colon|Salvadoran Colones|كولون|سلفادوري|',
    'SYP|Syrian Pound|Syrian Pounds|ليرة|سوري|',
    'SZL|Eswatini Lilangeni|Eswatini Emalangeni|ليلانغيني|إسواتيني|',
    'THB|Thai Baht|Thai Baht|بات|تايلندي|',
    'TJS|Tajikistani Somoni|Tajikistani Somoni|سوموني|طاجيكي|',
    'TMT|Turkmenistani Manat|Turkmenistani Manat|مانات|تركمانستاني|',
    'TND|Tunisian Dinar|Tunisian Dinars|دينار|تونسي|دنانير',
    'TOP|Tongan Paanga|Tongan Paanga|باانغا|تونغي|',
    'TRY|Turkish Lira|Turkish Liras|ليرة|تركي|',
    'TTD|Trinidad and Tobago Dollar|Trinidad and Tobago Dollars|دولار|*ترينيداد وتوباغو|',
    'TWD|New Taiwan Dollar|New Taiwan Dollars|دولار|تايواني|',
    'TZS|Tanzanian Shilling|Tanzanian Shillings|شلن|تنزاني|',
    'UAH|Ukrainian Hryvnia|Ukrainian Hryvnias|هريفنيا|أوكراني|',
    'UGX|Ugandan Shilling|Ugandan Shillings|شلن|أوغندي|',
    'USD|US Dollar|US Dollars|دولار|أمريكي|',
    'UYU|Uruguayan Peso|Uruguayan Pesos|بيزو|أوروغوياني|',
    'UZS|Uzbekistani Som|Uzbekistani Som|سوم|أوزبكي|',
    'VED|Venezuelan Digital Bolivar|Venezuelan Digital Bolivares|بوليفار|*فنزويلي رقمي|',
    'VES|Venezuelan Bolivar Soberano|Venezuelan Bolivares Soberanos|بوليفار|*فنزويلي سيادي|',
    'VND|Vietnamese Dong|Vietnamese Dong|دونغ|فيتنامي|',
    'VUV|Vanuatu Vatu|Vanuatu Vatu|فاتو|*فانواتو|',
    'WST|Samoan Tala|Samoan Tala|تالا|ساموي|',
    'XAF|Central African CFA Franc|Central African CFA Francs|فرنك|*وسط أفريقي|',
    'XCD|East Caribbean Dollar|East Caribbean Dollars|دولار|*شرق كاريبي|',
    'XOF|West African CFA Franc|West African CFA Francs|فرنك|*غرب أفريقي|',
    'XPF|CFP Franc|CFP Francs|فرنك|باسيفيكي|',
    'YER|Yemeni Rial|Yemeni Rials|ريال|يمني|',
    'ZAR|South African Rand|South African Rand|راند|*جنوب أفريقي|',
    'ZMW|Zambian Kwacha|Zambian Kwacha|كواتشا|زامبي|',
    'ZWG|Zimbabwe Gold|Zimbabwe Gold|زيغ|*زيمبابوي|'
  ];

  /* ----------------------------------------------------------------------
     ISO 4217 minor-unit metadata vs. this application's display convention
     ----------------------------------------------------------------------
     ISO 4217 does NOT give every currency two decimal digits: Kuwaiti-style
     dinars (BHD, IQD, JOD, KWD, LYD, OMR, TND) use three, and a further
     group (yen/won/franc-family currencies with no minor unit in practice)
     use zero. `isoMinorUnit` below records the real ISO exponent per
     currency, verified against currency-code references cross-corroborated
     across independent sources during this audit (not a single source, and
     not the primary ISO 4217 registry itself, which this environment's
     network policy could not reach at audit time).

     `decimals` is this application's own NUMERIC input/display precision —
     3 for the seven 3-decimal ISO currencies, 2 for every other currency —
     and it now drives live formatting, validation, and the Numeric Amount
     line. It is derived from `isoMinorUnit` (see displayDecimalsFor below)
     but the two fields remain conceptually distinct on purpose: one is ISO
     4217 metadata, the other is this tool's own display behaviour, and a
     future change to one must not be assumed to imply the other.

     The amount-in-words `XX/100` convention is a SEPARATE, THIRD thing
     again, unconditionally two digits for every currency regardless of
     `decimals` — see buildEnglish/buildArabic in core_c.js. A currency's
     display precision must never be confused with its words-fraction
     convention; conflating the two here would have been exactly the kind
     of silent, undocumented behaviour change this file exists to avoid.

     Two currencies with a genuinely non-decimal traditional subdivision
     (MGA: 1 ariary = 5 iraimbilanja; MRU: 1 ouguiya = 5 khoums) have
     inconsistent exponent values across the sources available during this
     audit. Rather than assert an unverified figure, both are left at the
     conventional default of 2 with this note, pending confirmation against
     the primary ISO 4217 registry.
     ---------------------------------------------------------------------- */
  var ISO_ZERO_DECIMAL = ['BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW',
    'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'];
  var ISO_THREE_DECIMAL = ['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'];

  function isoMinorUnitFor(code) {
    if (ISO_ZERO_DECIMAL.indexOf(code) !== -1) return 0;
    if (ISO_THREE_DECIMAL.indexOf(code) !== -1) return 3;
    return 2;
  }

  /**
   * displayDecimalsFor(code) -> the NUMERIC input/output precision this
   * application actually uses for the currency: 3 for the ISO 4217
   * 3-decimal currencies, 2 for everything else (including the 0-decimal
   * ISO group — JPY-style currencies are not in scope for this display
   * feature and keep the existing 2dp behaviour unchanged).
   *
   * This is deliberately DERIVED from isoMinorUnit rather than a separate
   * hardcoded list, so it stays correct if that metadata is ever revised.
   * It therefore covers all seven ISO 3-decimal currencies (BHD, IQD, JOD,
   * KWD, LYD, OMR, TND) rather than only the five most commonly cited in
   * casual references (KWD, BHD, OMR, JOD, TND) — IQD and LYD genuinely
   * share the same 3-decimal minor unit and are included on that basis.
   *
   * Separately and unconditionally: the amount-in-words XX/100 convention
   * is NOT driven by this value and is never affected by it — see
   * buildEnglish/buildArabic in core_c.js, which always operate on exactly
   * two fraction digits regardless of a currency's display precision.
   */
  function displayDecimalsFor(code) {
    return (isoMinorUnitFor(code) === 3) ? 3 : 2;
  }

  var CURRENCIES = {};
  var CURRENCY_CODES = [];

  ROWS.forEach(function (row) {
    var f = row.split('|');
    var code = f[0];
    CURRENCIES[code] = {
      code: code,
      nameEnglish: f[1],
      nameEnglishPlural: f[2],
      decimals: displayDecimalsFor(code),  // NUMERIC display/input precision
      isoMinorUnit: isoMinorUnitFor(code), // real ISO 4217 exponent (metadata)
      arabic: buildArabicForms(f[3], f[4], f[5] || '')
    };
    CURRENCY_CODES.push(code);
  });

  root.__NTW_CORE_B__ = {
    declineNoun: declineNoun,
    declineAdjective: declineAdjective,
    buildArabicForms: buildArabicForms,
    CURRENCIES: CURRENCIES,
    CURRENCY_CODES: CURRENCY_CODES
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* =========================================================================
   Numbers to Words Converter — Amount assembly
   Joins the number words to the currency, applying the /100 financial rule.
   ========================================================================= */
(function (root) {
  'use strict';

  var A = root.__NTW_CORE_A__;
  var B = root.__NTW_CORE_B__;

  var AR_ONLY = A.AR_ONLY;
  var AR_AND = A.AR_AND;

  /** getCurrency(code, customConfig) -> currency object (never null). */
  function getCurrency(code, custom) {
    if (code === 'CUSTOM') {
      return normalizeCustom(custom);
    }
    return B.CURRENCIES[code] || B.CURRENCIES.USD;
  }

  /** Turn raw user-entered custom-currency fields into a currency object. */
  function normalizeCustom(c) {
    c = c || {};
    var sing = (c.nameEnglish || '').trim() || 'Unit';
    var plur = (c.nameEnglishPlural || '').trim() || sing + 's';
    var arS = (c.arabicSingular || '').trim() || sing;
    var arD = (c.arabicDual || '').trim() || arS;
    var arP = (c.arabicPlural || '').trim() || arS;
    var arA = (c.arabicAccusative || '').trim() || arS;
    return {
      code: ((c.code || '').trim() || 'CUR').toUpperCase(),
      nameEnglish: sing,
      nameEnglishPlural: plur,
      decimals: 2,
      isoMinorUnit: 2, // custom currencies are outside ISO 4217; not applicable
      custom: true,
      arabic: { s: arS, d: arD, p: arP, a: arA, g: (c.gender === 'f' ? 'f' : 'm') }
    };
  }

  /* ----------------------------------------------------------------------
     English
     ---------------------------------------------------------------------- */

  /** formatCurrency(currency, 'en', whole) -> "US Dollars" */
  function formatCurrencyEnglish(currency, whole) {
    return (whole === 1n) ? currency.nameEnglish : currency.nameEnglishPlural;
  }

  /** `fraction` here is always exactly two digits (the words-fraction —
   *  see convertAmount) regardless of the currency's numeric precision. */
  function buildEnglish(whole, fraction, currency) {
    var words = A.numberToEnglishWords(whole);
    var name = formatCurrencyEnglish(currency, whole);
    var out = words + ' ' + name;
    if (fraction !== '00') out += ' and ' + fraction + '/100';
    return out + ' Only';
  }

  /* ----------------------------------------------------------------------
     Arabic
     ----------------------------------------------------------------------
     Selects the grammatical form of the currency noun from r = n mod 100,
     then joins. When the noun stands in annexation (r = 0) a preceding
     dual drops its nun: "ألفان" + "ريال" => "ألفا ريال".
     ---------------------------------------------------------------------- */

  /** formatCurrency(currency, 'ar', whole) -> the declined form for r>=3.
   *  r===1 and r===2 are handled entirely inside buildArabic(), because
   *  they need a different sentence shape (noun before the agreeing
   *  numeral), not just a different noun form — this covers only the
   *  cases where the number precedes the noun as an ordinary tamyiz. */
  function formatCurrencyArabic(currency, whole) {
    var ar = currency.arabic;
    if (whole === 1n) return ar.s;
    if (whole === 2n) return ar.d;
    var r = Number(whole % 100n);
    if (r >= 3 && r <= 10) return ar.p;   // plural genitive
    if (r >= 11) return ar.a;             // accusative singular
    return ar.s;                          // annexed singular
  }

  /** `fraction` here is always exactly two digits (the words-fraction —
   *  see convertAmount) regardless of the currency's numeric precision. */
  function buildArabic(whole, fraction, currency) {
    var ar = currency.arabic;
    var phrase;

    if (whole === 1n) {
      // The noun itself expresses "one"; the numeral follows and agrees.
      phrase = ar.s + ' ' + (ar.g === 'f' ? 'واحدة' : 'واحد');
    } else if (whole === 2n) {
      phrase = ar.d;                       // dual noun, no numeral needed
    } else {
      var r = Number(whole % 100n);

      if (r === 1 || r === 2) {
        // Compound amounts ending in 1 or 2 (101, 1001, 2002, ...) do not
        // say "[number] وواحد [noun]" — 1 and 2 follow their counted noun
        // and agree with it, the same as the standalone whole===1n/2n
        // cases above, so the noun is inserted before the agreeing 1/2
        // rather than appended after the full number the way r=0/3-10/11+
        // do. The higher-order prefix (everything except this final
        // group's 1/2) is joined to the noun with وَ — a coordinating
        // conjunction, not annexation — so, unlike the r===0 case, no
        // construct-state conversion applies here: a dual prefix keeps its
        // nun ("ألفان وريال سعودي واحد", not "ألفا وريال سعودي واحد"),
        // exactly as it already does before any other conjoined word
        // (compare "ألفان وخمسون ريالاً سعودياً" for 2050).
        var prefix = A.numberToArabicWords(whole, ar.g, true);
        var agreeing = (r === 1) ? (ar.s + ' ' + (ar.g === 'f' ? 'واحدة' : 'واحد')) : ar.d;
        phrase = prefix + AR_AND + agreeing;
      } else {
        var words = A.numberToArabicWords(whole, ar.g);
        if (r === 0) words = A.applyConstructState(words); // annexation
        phrase = words + ' ' + formatCurrencyArabic(currency, whole);
      }
    }

    if (fraction !== '00') phrase += AR_AND + fraction + '/100';
    return phrase + ' ' + AR_ONLY;
  }

  /* ----------------------------------------------------------------------
     Public conversion entry point
     ---------------------------------------------------------------------- */

  /**
   * convertAmount(rawInput, currencyCode, customConfig)
   *  -> { ok:true, formatted, formattedWithCode, english, arabic, ... }
   *  -> { ok:false, code }
   *
   * The currency must be resolved before parsing, because its `decimals`
   * (2 for almost everything, 3 for the ISO 3-decimal group) determines how
   * many fraction digits the raw input is even allowed to carry.
   */
  function convertAmount(rawInput, currencyCode, custom) {
    var currency = getCurrency(currencyCode, custom);
    var parsed = A.parseAmount(rawInput, currency.decimals);
    if (!parsed.ok) return parsed;

    var formatted = A.formatAmount(parsed.integer, parsed.fraction);

    // The amount-in-words /100 convention is unconditionally two digits,
    // regardless of the currency's own display precision — per this
    // application's explicit financial-document specification, a
    // 3-decimal currency's numeric value keeps its 3rd digit in full
    // (parsed.fraction, and thus `formatted`/`formattedWithCode`, is
    // never touched), but the WORDS sentence only ever states the first
    // two, truncated rather than rounded, and never grows a "/1000" of
    // its own. Explicit product decision — see core_b.js for the fuller
    // rationale on why these stay two separate concepts.
    var wordsFraction = parsed.fraction.slice(0, 2);

    return {
      ok: true,
      currency: currency,
      integer: parsed.integer,
      fraction: parsed.fraction,
      wordsFraction: wordsFraction,
      whole: parsed.whole,
      formatted: formatted,
      formattedWithCode: formatted + ' ' + currency.code,
      english: buildEnglish(parsed.whole, wordsFraction, currency),
      arabic: buildArabic(parsed.whole, wordsFraction, currency)
    };
  }

  root.NumbersToWords = {
    validateInput: A.validateInput,
    parseAmount: A.parseAmount,
    formatAmount: A.formatAmount,
    numberToEnglishWords: A.numberToEnglishWords,
    numberToArabicWords: A.numberToArabicWords,
    getCurrency: getCurrency,
    formatCurrencyEnglish: formatCurrencyEnglish,
    formatCurrencyArabic: formatCurrencyArabic,
    convertAmount: convertAmount,
    CURRENCIES: B.CURRENCIES,
    CURRENCY_CODES: B.CURRENCY_CODES,
    MAX_INT_DIGITS: A.MAX_INT_DIGITS
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
