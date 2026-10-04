// Receivables reporting demo — rebuilt for the portfolio from the owner's
// internal tool: company identity, logo, colours, customer codes and
// internal process modes removed. Data comes from fictional sample workbooks.
"use strict";

/* ============================================================================
   SECTION 0 — PRIMITIVES
   ========================================================================== */
const LOG = [];
function log(msg, kind){ LOG.push({t:new Date(), msg:msg, kind:kind||''}); }
const $  = function(s,r){ return (r||document).querySelector(s); };
const $$ = function(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };

const TD = new TextDecoder('utf-8');
const TE = new TextEncoder();
function u8str(u8){ return TD.decode(u8); }
function strU8(s){ return TE.encode(s); }

/* ---- CRC-32 (IEEE 802.3, reflected) ---- */
const CRC_TABLE = (function(){
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++){
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(u8){
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* ============================================================================
   SECTION 1 — DEFLATE / INFLATE
   Primary path: native Compression Streams API (offline, no library).
   Fallback: embedded RFC-1951 inflate for engines without the API.
   ========================================================================== */
const HAS_DS = (typeof DecompressionStream !== 'undefined');
const HAS_CS = (typeof CompressionStream !== 'undefined');

async function inflateRaw(u8){
  if (HAS_DS){
    try{
      const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(s).arrayBuffer());
    }catch(e){ log('native inflate failed, using fallback: ' + e.message, 'warn'); }
  }
  return inflateRawSync(u8);
}
async function deflateRaw(u8){
  if (HAS_CS){
    try{
      const s = new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(s).arrayBuffer());
    }catch(e){ /* fall through to STORE */ }
  }
  return null; // signal: store uncompressed
}

/* RFC-1951 inflate — compact reference implementation */
const _LB=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
const _LE=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
const _DB=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
const _DE=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
const _CLO=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
let _FIXL=null,_FIXD=null;

function _huff(lens){
  let max = 0;
  for (let i=0;i<lens.length;i++) if (lens[i] > max) max = lens[i];
  const bl = new Int32Array(max+1);
  for (let i=0;i<lens.length;i++) if (lens[i]) bl[lens[i]]++;
  const next = new Int32Array(max+2);
  let code = 0;
  for (let b=1;b<=max;b++){ code = (code + bl[b-1]) << 1; next[b] = code; }
  const map = new Map();
  for (let i=0;i<lens.length;i++){ const l = lens[i]; if (l) map.set(l*0x10000 + (next[l]++), i); }
  return { map:map, max:max };
}
function inflateRawSync(src){
  let o = new Uint8Array(Math.max(4096, src.length*6)), outLen = 0, bp = 0;
  function grow(n){
    if (outLen + n <= o.length) return;
    let cap = o.length*2; while (cap < outLen+n) cap *= 2;
    const nu = new Uint8Array(cap); nu.set(o.subarray(0,outLen)); o = nu;
  }
  function bit(){ const b = (src[bp>>>3] >>> (bp & 7)) & 1; bp++; return b; }
  function bits(n){ let v = 0; for (let i=0;i<n;i++) v |= bit() << i; return v; }
  function dec(t){
    let code = 0;
    for (let l=1;l<=t.max;l++){
      code = (code << 1) | bit();
      const s = t.map.get(l*0x10000 + code);
      if (s !== undefined) return s;
    }
    throw new Error('inflate: invalid Huffman code');
  }
  for(;;){
    const final = bit(), type = bits(2);
    if (type === 0){
      bp = (bp + 7) & ~7;
      const p = bp >>> 3, len = src[p] | (src[p+1] << 8);
      bp += 32;
      const st = bp >>> 3;
      grow(len); o.set(src.subarray(st, st+len), outLen);
      outLen += len; bp += len*8;
    } else {
      let lt, dt;
      if (type === 1){
        if (!_FIXL){
          const l = new Uint8Array(288);
          for (let i=0;i<144;i++) l[i]=8;
          for (let i=144;i<256;i++) l[i]=9;
          for (let i=256;i<280;i++) l[i]=7;
          for (let i=280;i<288;i++) l[i]=8;
          _FIXL = _huff(l);
          const d = new Uint8Array(30); d.fill(5); _FIXD = _huff(d);
        }
        lt=_FIXL; dt=_FIXD;
      } else if (type === 2){
        const hlit = bits(5)+257, hdist = bits(5)+1, hclen = bits(4)+4;
        const cl = new Uint8Array(19);
        for (let i=0;i<hclen;i++) cl[_CLO[i]] = bits(3);
        const clt = _huff(cl);
        const lens = new Uint8Array(hlit + hdist);
        for (let i=0;i<hlit+hdist;){
          const s = dec(clt);
          if (s < 16) lens[i++] = s;
          else if (s === 16){ const pv = lens[i-1]; let r = 3+bits(2); while (r--) lens[i++] = pv; }
          else if (s === 17){ let r = 3+bits(3);  while (r--) lens[i++] = 0; }
          else { let r = 11+bits(7); while (r--) lens[i++] = 0; }
        }
        lt = _huff(lens.subarray(0,hlit)); dt = _huff(lens.subarray(hlit));
      } else throw new Error('inflate: bad block type');
      for(;;){
        const s = dec(lt);
        if (s === 256) break;
        if (s < 256){ grow(1); o[outLen++] = s; }
        else {
          const li = s-257, len = _LB[li] + bits(_LE[li]);
          const ds = dec(dt), dist = _DB[ds] + bits(_DE[ds]);
          grow(len);
          let from = outLen - dist;
          for (let i=0;i<len;i++) o[outLen++] = o[from++];
        }
      }
    }
    if (final) break;
  }
  return o.subarray(0, outLen);
}

/* ============================================================================
   SECTION 2 — ZIP CONTAINER (read + write)
   ========================================================================== */
async function unzip(buf){
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  let eocd = -1;
  const lo = Math.max(0, u8.length - 65558);
  for (let i = u8.length - 22; i >= lo; i--){
    if (dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid .xlsx package (no ZIP end-of-directory record).');
  let count = dv.getUint16(eocd + 10, true);
  let cdOff = dv.getUint32(eocd + 16, true);
  // ZIP64 locator
  if (cdOff === 0xFFFFFFFF || count === 0xFFFF){
    const z64l = eocd - 20;
    if (z64l >= 0 && dv.getUint32(z64l, true) === 0x07064b50){
      const z64 = Number(dv.getBigUint64(z64l + 8, true));
      if (dv.getUint32(z64, true) === 0x06064b50){
        count = Number(dv.getBigUint64(z64 + 32, true));
        cdOff = Number(dv.getBigUint64(z64 + 48, true));
      }
    }
  }
  const out = {};
  let p = cdOff;
  for (let i = 0; i < count; i++){
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    let  csize   = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const cmtLen = dv.getUint16(p + 32, true);
    let  lho = dv.getUint32(p + 42, true);
    const name = u8str(u8.subarray(p + 46, p + 46 + nameLen));
    // ZIP64 extra field
    if (csize === 0xFFFFFFFF || lho === 0xFFFFFFFF){
      let ep = p + 46 + nameLen; const eEnd = ep + extraLen;
      while (ep + 4 <= eEnd){
        const hid = dv.getUint16(ep, true), hsz = dv.getUint16(ep + 2, true);
        if (hid === 0x0001){
          let q = ep + 4;
          if (dv.getUint32(p + 24, true) === 0xFFFFFFFF) q += 8;      // usize
          if (csize === 0xFFFFFFFF){ csize = Number(dv.getBigUint64(q, true)); q += 8; }
          if (lho === 0xFFFFFFFF)  { lho   = Number(dv.getBigUint64(q, true)); }
          break;
        }
        ep += 4 + hsz;
      }
    }
    const lnLen = dv.getUint16(lho + 26, true), lxLen = dv.getUint16(lho + 28, true);
    const start = lho + 30 + lnLen + lxLen;
    out[name] = { method: method, raw: u8.subarray(start, start + csize) };
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return out;
}
async function zipEntryText(entries, name){
  const e = entries[name];
  if (!e) return null;
  if (e.method === 0) return u8str(e.raw);
  if (e.method === 8) return u8str(await inflateRaw(e.raw));
  throw new Error('Unsupported ZIP compression method ' + e.method + ' for ' + name);
}

/* --- writer --- */
function dosTime(d){
  return (((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF);
}
function dosDate(d){
  return ((((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF);
}
async function zipBuild(files){
  // files: [{name, data:Uint8Array|string}]
  const now = new Date(), dt = dosTime(now), dd = dosDate(now);
  const prepped = [];
  for (let i = 0; i < files.length; i++){
    const f = files[i];
    const data = (typeof f.data === 'string') ? strU8(f.data) : f.data;
    let comp = null;
    if (data.length > 180){ comp = await deflateRaw(data); }
    const useDeflate = comp && comp.length < data.length;
    prepped.push({
      name: f.name,
      nameU8: strU8(f.name),
      crc: crc32(data),
      usize: data.length,
      body: useDeflate ? comp : data,
      method: useDeflate ? 8 : 0
    });
  }
  let total = 0, cdSize = 0;
  for (const p of prepped){ total += 30 + p.nameU8.length + p.body.length; cdSize += 46 + p.nameU8.length; }
  const out = new Uint8Array(total + cdSize + 22);
  const dv = new DataView(out.buffer);
  let off = 0;
  const offsets = [];
  for (const p of prepped){
    offsets.push(off);
    dv.setUint32(off, 0x04034b50, true);
    dv.setUint16(off + 4, 20, true);
    dv.setUint16(off + 6, 0x0800, true);          // UTF-8 filename flag
    dv.setUint16(off + 8, p.method, true);
    dv.setUint16(off + 10, dt, true);
    dv.setUint16(off + 12, dd, true);
    dv.setUint32(off + 14, p.crc, true);
    dv.setUint32(off + 18, p.body.length, true);
    dv.setUint32(off + 22, p.usize, true);
    dv.setUint16(off + 26, p.nameU8.length, true);
    dv.setUint16(off + 28, 0, true);
    off += 30;
    out.set(p.nameU8, off); off += p.nameU8.length;
    out.set(p.body, off);   off += p.body.length;
  }
  const cdStart = off;
  for (let i = 0; i < prepped.length; i++){
    const p = prepped[i];
    dv.setUint32(off, 0x02014b50, true);
    dv.setUint16(off + 4, 20, true);
    dv.setUint16(off + 6, 20, true);
    dv.setUint16(off + 8, 0x0800, true);
    dv.setUint16(off + 10, p.method, true);
    dv.setUint16(off + 12, dt, true);
    dv.setUint16(off + 14, dd, true);
    dv.setUint32(off + 16, p.crc, true);
    dv.setUint32(off + 20, p.body.length, true);
    dv.setUint32(off + 24, p.usize, true);
    dv.setUint16(off + 28, p.nameU8.length, true);
    dv.setUint16(off + 30, 0, true);
    dv.setUint16(off + 32, 0, true);
    dv.setUint16(off + 34, 0, true);
    dv.setUint16(off + 36, 0, true);
    dv.setUint32(off + 38, 0, true);
    dv.setUint32(off + 42, offsets[i], true);
    off += 46;
    out.set(p.nameU8, off); off += p.nameU8.length;
  }
  dv.setUint32(off, 0x06054b50, true);
  dv.setUint16(off + 4, 0, true);
  dv.setUint16(off + 6, 0, true);
  dv.setUint16(off + 8, prepped.length, true);
  dv.setUint16(off + 10, prepped.length, true);
  dv.setUint32(off + 12, cdSize, true);
  dv.setUint32(off + 16, cdStart, true);
  dv.setUint16(off + 20, 0, true);
  return out;
}

/* ============================================================================
   SECTION 3 — XML HELPERS
   ========================================================================== */
function xesc(s){
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
function parseXML(text){
  const d = new DOMParser().parseFromString(text, 'application/xml');
  const err = d.getElementsByTagName('parsererror');
  if (err && err.length) throw new Error('Malformed XML in package part.');
  return d;
}
function tags(node, local){ return Array.prototype.slice.call(node.getElementsByTagNameNS('*', local)); }
function firstTag(node, local){ const r = node.getElementsByTagNameNS('*', local); return r.length ? r[0] : null; }
function attrNS(el, local){
  if (el.hasAttribute(local)) return el.getAttribute(local);
  const a = el.attributes;
  for (let i = 0; i < a.length; i++) if (a[i].localName === local) return a[i].value;
  return null;
}

/* ============================================================================
   SECTION 4 — VALUE COERCION
   ========================================================================== */
function toNum(v){
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (!s) return 0;
  let neg = false;
  if (/^\((.*)\)$/.test(s)){ neg = true; s = s.replace(/^\(|\)$/g, ''); }
  if (/^-/.test(s)) { neg = !neg; s = s.replace(/^-/, ''); }
  s = s.replace(/[^0-9.eE+]/g, '');
  const n = parseFloat(s);
  if (!isFinite(n)) return 0;
  return neg ? -n : n;
}
function isNumLike(v){
  if (typeof v === 'number') return true;
  if (typeof v !== 'string') return false;
  const s = v.trim();
  if (!s) return false;
  return /^[-+(]?\s*[\d,]*\.?\d+(?:[eE][-+]?\d+)?\s*\)?$/.test(s);
}
function normCode(v){
  if (v === null || v === undefined) return '';
  if (typeof v === 'number'){
    return Number.isInteger(v) ? String(v) : String(v).replace(/\.0+$/, '');
  }
  return String(v).trim();
}
function normText(v){
  return String(v === null || v === undefined ? '' : v)
    .replace(/[\r\n\t]+/g, ' ').replace(/[\u00A0\u200B\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function normKey(v){ return normText(v).toLowerCase(); }

/* number → millions, 2dp */
function fmtM(v, dp){
  const d = (dp === undefined) ? 2 : dp;
  const n = (v || 0) / 1e6;
  return n.toLocaleString('en-US', { minimumFractionDigits:d, maximumFractionDigits:d });
}
function fmtN(v, dp){
  const d = (dp === undefined) ? 0 : dp;
  return (v || 0).toLocaleString('en-US', { minimumFractionDigits:d, maximumFractionDigits:d });
}
function fmtPct(v, dp){
  const d = (dp === undefined) ? 1 : dp;
  if (!isFinite(v)) return '—';
  return (v * 100).toFixed(d) + '%';
}
function fmtSignedM(v){ return (v > 0 ? '+' : '') + fmtM(v); }

/* ============================================================================
   SECTION 5 — XLSX READER (SpreadsheetML → sheet matrices)
   ========================================================================== */
function colFromRef(ref){
  let n = 0;
  for (let i = 0; i < ref.length; i++){
    const c = ref.charCodeAt(i);
    if (c >= 65 && c <= 90) n = n*26 + (c - 64);
    else if (c >= 97 && c <= 122) n = n*26 + (c - 96);
    else break;
  }
  return n;
}
function rowFromRef(ref){ const m = /(\d+)/.exec(ref); return m ? parseInt(m[1],10) : 0; }
function colLetter(n){
  let s = '';
  while (n > 0){ const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = ((n - r) / 26) | 0; }
  return s;
}

/* Excel serial date → JS Date (1900 system, incl. the 1900 leap-year quirk) */
function excelSerialToDate(n){
  const ms = Math.round((n - 25569) * 86400000);
  return new Date(ms);
}
const BUILTIN_DATE_FMT = { 14:1,15:1,16:1,17:1,18:1,19:1,20:1,21:1,22:1,45:1,46:1,47:1 };

async function readXlsx(arrayBuffer, fileName){
  const z = await unzip(arrayBuffer);

  // ---- shared strings ----
  const ssXml = await zipEntryText(z, 'xl/sharedStrings.xml');
  const shared = [];
  if (ssXml){
    const d = parseXML(ssXml);
    const sis = tags(d, 'si');
    for (let i = 0; i < sis.length; i++){
      const ts = tags(sis[i], 't');
      let s = '';
      // skip <rPh> phonetic runs
      for (let j = 0; j < ts.length; j++){
        let anc = ts[j].parentNode, skip = false;
        while (anc && anc !== sis[i]){ if (anc.localName === 'rPh'){ skip = true; break; } anc = anc.parentNode; }
        if (!skip) s += ts[j].textContent;
      }
      shared.push(s);
    }
  }

  // ---- styles (number formats, to detect dates) ----
  const stXml = await zipEntryText(z, 'xl/styles.xml');
  const xfDate = [];
  if (stXml){
    const d = parseXML(stXml);
    const custom = {};
    tags(d, 'numFmt').forEach(function(nf){
      custom[nf.getAttribute('numFmtId')] = nf.getAttribute('formatCode') || '';
    });
    const cellXfs = firstTag(d, 'cellXfs');
    if (cellXfs){
      tags(cellXfs, 'xf').forEach(function(xf){
        const id = xf.getAttribute('numFmtId') || '0';
        let isDate = !!BUILTIN_DATE_FMT[parseInt(id,10)];
        const code = custom[id];
        if (code && /[dmyhs]/i.test(code.replace(/\[[^\]]*\]/g,'').replace(/"[^"]*"/g,''))
                 && /(y{2,}|d{1,2}|m{3,})/i.test(code)) isDate = true;
        xfDate.push(isDate);
      });
    }
  }

  // ---- workbook: sheet names → part paths ----
  const wbXml = await zipEntryText(z, 'xl/workbook.xml');
  if (!wbXml) throw new Error('Missing xl/workbook.xml — not a valid Excel workbook.');
  const wbDoc = parseXML(wbXml);
  const relXml = await zipEntryText(z, 'xl/_rels/workbook.xml.rels');
  const relMap = {};
  if (relXml){
    tags(parseXML(relXml), 'Relationship').forEach(function(r){
      relMap[r.getAttribute('Id')] = r.getAttribute('Target');
    });
  }
  const sheetDefs = tags(wbDoc, 'sheet').map(function(sh){
    const rid = attrNS(sh, 'id');
    let target = relMap[rid] || '';
    if (target.charAt(0) === '/') target = target.slice(1);
    else if (target.indexOf('xl/') !== 0) target = 'xl/' + target.replace(/^\.\//,'');
    return {
      name: sh.getAttribute('name') || '',
      state: sh.getAttribute('state') || 'visible',
      path: target
    };
  });

  // ---- each sheet → dense matrix ----
  const sheets = [];
  for (let si = 0; si < sheetDefs.length; si++){
    const def = sheetDefs[si];
    const xml = await zipEntryText(z, def.path);
    if (!xml) continue;
    const doc = parseXML(xml);
    const rowsEls = tags(doc, 'row');
    const grid = [];
    let maxCol = 0;
    for (let ri = 0; ri < rowsEls.length; ri++){
      const rEl = rowsEls[ri];
      const rIdx = parseInt(rEl.getAttribute('r') || (ri+1), 10);
      const cells = tags(rEl, 'c');
      const arr = grid[rIdx - 1] || (grid[rIdx - 1] = []);
      for (let ci = 0; ci < cells.length; ci++){
        const c = cells[ci];
        const ref = c.getAttribute('r') || '';
        const cIdx = ref ? colFromRef(ref) : (ci + 1);
        if (cIdx > maxCol) maxCol = cIdx;
        const t = c.getAttribute('t');
        let val = null;
        if (t === 'inlineStr'){
          const is = firstTag(c, 'is');
          val = is ? tags(is, 't').map(function(x){ return x.textContent; }).join('') : '';
        } else {
          const vEl = firstTag(c, 'v');
          const raw = vEl ? vEl.textContent : null;
          if (raw === null || raw === '') val = null;
          else if (t === 's') val = shared[parseInt(raw,10)] !== undefined ? shared[parseInt(raw,10)] : '';
          else if (t === 'str') val = raw;
          else if (t === 'b') val = (raw === '1');
          else if (t === 'e') val = null;                       // error cell → blank
          else {
            const n = parseFloat(raw);
            if (isFinite(n)){
              const sIdx = parseInt(c.getAttribute('s') || '0', 10);
              val = (xfDate[sIdx] && n > 0) ? excelSerialToDate(n) : n;
            } else val = raw;
          }
        }
        arr[cIdx - 1] = val;
      }
    }
    for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = [];
    sheets.push({ name: def.name, state: def.state, grid: grid, rows: grid.length, cols: maxCol });
  }
  return { fileName: fileName, sheets: sheets };
}

/* ============================================================================
   SECTION 6 — DYNAMIC PATTERN MATCHING ENGINE
   Header text drifts every period. Resolution is by scored regex, never by
   literal string equality or fixed column position.
   ========================================================================== */
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const MON3   = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const MON_TITLE = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function monthIndex(word){
  const w = normKey(word).replace(/[^a-z]/g,'');
  if (!w) return -1;
  for (let i = 0; i < 12; i++) if (MONTHS[i] === w) return i;
  for (let i = 0; i < 12; i++) if (MON3[i] === w.slice(0,3) && w.length <= 4) return i;
  for (let i = 0; i < 12; i++) if (MONTHS[i].indexOf(w) === 0 && w.length >= 3) return i;
  return -1;
}
function fullYear(y){
  const n = parseInt(y, 10);
  if (!isFinite(n)) return null;
  if (n >= 1000) return n;
  return n < 70 ? 2000 + n : 1900 + n;
}

/* Field rule table — ordered; highest score wins, each field claimed once. */
const FIELD_RULES = [
  { key:'code',    label:'Customer Code',      tests:[
      [/^cust(omer)?\s*(no\.?|num(ber)?|code|id|#)$/,1.00],
      [/^(customer|account)$/,0.94],
      [/^(debtor|payer)$/,0.80],
      [/cust.*\b(no|num|code|id)\b/,0.72] ] },
  { key:'name',    label:'Customer Name',      tests:[
      [/^(customer\s*)?name\s*\d*$/,1.00],
      [/^(cust(omer)?|account|payer)\s*(name|desc(ription)?)$/,0.95],
      [/^(name1|description)$/,0.72] ] },
  { key:'cluster', label:'Cluster',            tests:[
      [/^clust(er)?$/,1.00],
      [/^(region|segment|business\s*unit|bu)$/,0.70],
      [/clust/,0.62] ] },
  { key:'country', label:'Country',            tests:[
      [/^country(\s*name)?$/,1.00],
      [/^(land|market|territory)$/,0.66],
      [/countr/,0.60] ] },
  { key:'beg',     label:'Beginning Balance',  tests:[
      [/^(beginning|opening)\s*(balance|bal|ar)?s?$/,1.00],
      [/^(jan|january)\s*\d{2,4}\s*ar$/,0.92],
      [/^ar\s*(opening|b\/?f|bf)$/,0.80],
      [/^[a-z]{3,9}\s*\d{2,4}\s*ar$/,0.55] ] },
  { key:'sales',   label:'Sales',              tests:[
      [/^(gross\s*)?sales$/,1.00],
      [/^(revenue|billing|invoiced)$/,0.66] ] },
  { key:'coll',    label:'Collections',        tests:[
      [/^collections?$/,1.00],
      [/^(receipts?|payments?\s*received|cash\s*in)$/,0.66] ] },
  { key:'ap',      label:'AP Offset',          tests:[
      [/^a\/?p\s*offset\b/,1.00],
      [/^(offset|clearing|netting)$/,0.62] ] },
  { key:'endCalc', label:'Ending AR (Calc)',   tests:[
      [/^ending\s*ar\s*\(?\s*calc(ulated)?\s*\)?$/,1.00],
      [/^calculated\s*(ending\s*)?ar$/,0.95],
      [/^[a-z]{3,9}\s*\d{2,4}\s*ar$/,0.86],
      [/^(closing|ending)\s*(balance|ar)$/,0.72] ] },
  { key:'endAct',  label:'Ending AR (Actual)', tests:[
      [/^actual\s*ar$/,1.00],
      [/^ending\s*ar\s*\(?\s*actual\s*\)?$/,1.00],
      [/^ar\s*actual$/,0.95],
      [/actual.*\bar\b/,0.80] ] },
  { key:'change',  label:'Change',             tests:[
      [/^(change|delta|diff(erence)?|variance|check)$/,1.00] ] }
];

function scoreHeader(text){
  const k = normKey(text);
  const out = [];
  if (!k) return out;
  for (let i = 0; i < FIELD_RULES.length; i++){
    const rule = FIELD_RULES[i];
    let best = 0;
    for (let j = 0; j < rule.tests.length; j++){
      if (rule.tests[j][0].test(k) && rule.tests[j][1] > best) best = rule.tests[j][1];
    }
    if (best > 0) out.push({ key: rule.key, score: best });
  }
  return out;
}

/* "Due Jul 2026" / "Overdue Jul-26" / "Due 31.07.2026" → {year, month} */
const DUE_RULES = [
  /^\s*(?:over)?due\s+([a-z]{3,9})[\s\-\/]*(\d{2,4})\s*$/,
  /^\s*(?:over)?due\s+(?:amount|bal(?:ance)?)?\s*([a-z]{3,9})[\s\-\/]*(\d{2,4})\s*$/,
  /^\s*(?:over)?due\s+\d{1,2}[.\/-](\d{1,2})[.\/-](\d{2,4})\s*$/,
  /^\s*([a-z]{3,9})[\s\-\/]*(\d{2,4})\s+(?:over)?due\s*$/
];
function parseDueHeader(text){
  const k = normKey(text);
  if (!k || !/due/.test(k)) return null;
  for (let i = 0; i < DUE_RULES.length; i++){
    const m = DUE_RULES[i].exec(k);
    if (!m) continue;
    let mo, yr;
    if (i === 2){ mo = parseInt(m[1],10) - 1; yr = fullYear(m[2]); }
    else { mo = monthIndex(m[1]); yr = fullYear(m[2]); }
    if (yr && mo >= 0 && mo <= 11) return { month: mo, year: yr };
    if (yr) return { month: null, year: yr };
  }
  const y = /(\d{4})/.exec(k);
  if (y) return { month: null, year: parseInt(y[1],10) };
  return null;
}

/* Sheet-name date-range hint: "1.1.26to31.7.26" */
function parseSheetRange(name){
  const m = /(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})\s*(?:to|-|–|through|thru)\s*(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})/i.exec(String(name||''));
  if (!m) return null;
  return {
    start:{ day:+m[1], month:+m[2]-1, year:fullYear(m[3]) },
    end:  { day:+m[4], month:+m[5]-1, year:fullYear(m[6]) }
  };
}
/* Sheet-name single-date hint: "Due 31.7.2026" */
function parseSheetDate(name){
  const m = /(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})/.exec(String(name||''));
  if (!m) return null;
  return { day:+m[1], month:+m[2]-1, year:fullYear(m[3]) };
}

/* ---- header-row discovery: scan the first N rows, score by rule hits ---- */
function findHeaderRow(grid, maxScan){
  const lim = Math.min(grid.length, maxScan || 12);
  let best = { row:-1, score:-1, map:null };
  for (let r = 0; r < lim; r++){
    const row = grid[r] || [];
    let strings = 0, hits = 0, dueHits = 0;
    const seen = {};
    for (let c = 0; c < row.length; c++){
      const v = row[c];
      if (typeof v !== 'string' || !normText(v)) continue;
      strings++;
      const sc = scoreHeader(v);
      for (let i = 0; i < sc.length; i++){
        if (!seen[sc[i].key] || seen[sc[i].key] < sc[i].score){ seen[sc[i].key] = sc[i].score; }
      }
      if (parseDueHeader(v)) dueHits++;
    }
    for (const k in seen) hits += seen[k];
    const score = hits * 3 + dueHits * 2.5 + Math.min(strings, 8) * 0.25 - r * 0.12;
    if (score > best.score) best = { row:r, score:score, strings:strings, hits:hits, dueHits:dueHits };
  }
  return best.row < 0 ? 0 : best.row;
}

/* ---- resolve one sheet: header row + field→column assignment ---- */
function resolveSheet(sheet){
  const grid = sheet.grid;
  const hr = findHeaderRow(grid);
  const header = grid[hr] || [];
  const cand = [];               // {col, key, score}
  const dueCols = [];            // {col, month, year, text}
  for (let c = 0; c < Math.max(header.length, sheet.cols); c++){
    const raw = header[c];
    if (raw === null || raw === undefined || raw === '') continue;
    const txt = (raw instanceof Date) ? raw.toISOString().slice(0,10) : String(raw);
    const due = parseDueHeader(txt);
    if (due){ dueCols.push({ col:c, month:due.month, year:due.year, text:normText(txt) }); }
    const sc = scoreHeader(txt);
    for (let i = 0; i < sc.length; i++) cand.push({ col:c, key:sc[i].key, score:sc[i].score, text:normText(txt) });
  }
  cand.sort(function(a,b){ return b.score - a.score; });
  const map = {}, usedCol = {}, conf = {}, srcText = {};
  for (let i = 0; i < cand.length; i++){
    const x = cand[i];
    if (map[x.key] !== undefined) continue;
    if (usedCol[x.col]) continue;
    map[x.key] = x.col; usedCol[x.col] = 1; conf[x.key] = x.score; srcText[x.key] = x.text;
  }
  // role classification
  const hasBridge = (map.sales !== undefined) && (map.coll !== undefined || map.ap !== undefined);
  const hasDue = dueCols.length >= 1 && map.code !== undefined;
  let role = 'unknown';
  if (hasBridge) role = 'bridge';
  else if (hasDue) role = 'overdue';
  return {
    sheetName: sheet.name, headerRow: hr, map: map, conf: conf, srcText: srcText,
    dueCols: dueCols, role: role,
    headerTexts: header.map(function(v){ return v === null || v === undefined ? '' : normText(String(v)); })
  };
}

/* ---- period inference for a bridge sheet ---- */
function inferBridgePeriod(res, sheet){
  let month = null, year = null, src = [];
  const endTxt = res.srcText.endCalc || '';
  let m = /^([a-z]{3,9})\s*(\d{2,4})\s*ar$/i.exec(normKey(endTxt));
  if (m){ const mi = monthIndex(m[1]); if (mi >= 0){ month = mi; year = fullYear(m[2]); src.push('header "' + endTxt + '"'); } }
  if (year === null){
    const begTxt = res.srcText.beg || '';
    m = /^([a-z]{3,9})\s*(\d{2,4})\s*ar$/i.exec(normKey(begTxt));
    if (m){ year = fullYear(m[2]); src.push('beginning header "' + begTxt + '"'); }
  }
  const rng = parseSheetRange(sheet.name);
  if (rng && rng.end){
    if (month === null) month = rng.end.month;
    if (year === null) year = rng.end.year;
    src.push('sheet name "' + sheet.name + '"');
  }
  return { month: month, year: year, sources: src };
}

/* ============================================================================
   SECTION 7 — APPLICATION STATE
   ========================================================================== */
const LS = {
  get: function(k, d){ try{ const v = localStorage.getItem('rptDemo.' + k); return v === null ? d : JSON.parse(v); }catch(e){ return d; } },
  set: function(k, v){ try{ localStorage.setItem('rptDemo.' + k, JSON.stringify(v)); }catch(e){} }
};

/* Cluster reclassification rules, editable in the UI and saved in this browser.
   The demo ships with none. */
const DEFAULT_CLUSTER_OVERRIDES = {};
/* Spelling / whitespace normalisation of cluster names. */
const CLUSTER_NORMALISE = [
  [/^n[ou]{1,2}rth\s*africa$/i, 'North Africa'],
  [/^gcc$/i,                    'GCC']
];
function normaliseCluster(raw){
  const t = normText(raw);
  if (!t) return 'Unassigned';
  for (let i = 0; i < CLUSTER_NORMALISE.length; i++){
    if (CLUSTER_NORMALISE[i][0].test(t)) return CLUSTER_NORMALISE[i][1];
  }
  return t;
}

const S = {
  clusterScope: 'top20',
  files: [],            // {name,size,workbook,resolved[]}
  bridgeCur: null,      // {sheet,res,period}
  bridgePri: null,
  overdue: null,        // {sheet,res,colCur,colPri}
  customers: [],
  period: null,
  overrides: LS.get('overrides', {}),           // scope.field -> col index
  clusterOverrides: LS.get('clusterOverrides', Object.assign({}, DEFAULT_CLUSTER_OVERRIDES)),
  commentary: LS.get('commentary', {}),
  mail: LS.get('mail', {}),
  bridgePick: '__all__',
  validations: [],
  search: '',
  clusterFilter: '',
  sortKey: 'ar26',
  sortDir: -1
};

/* ============================================================================
   SECTION 8 — INGEST → DOMAIN MODEL
   ========================================================================== */
const LABEL_WORDS = /^(grand\s*)?(total|top\s*\d+|remaining|check|sum|subtotal|balance)\b/i;

function readDataRows(sheet, res){
  const grid = sheet.grid, out = [];
  const m = res.map;
  if (m.code === undefined) return out;
  for (let r = res.headerRow + 1; r < grid.length; r++){
    const row = grid[r] || [];
    const code = normCode(row[m.code]);
    const name = (m.name !== undefined) ? normText(row[m.name]) : '';
    if (!code) continue;
    if (LABEL_WORDS.test(code)) continue;
    if (!name && LABEL_WORDS.test(normText(row[m.name === undefined ? 2 : m.name]))) continue;
    if (!name && !isNumLike(code) && /^[a-z\s]+$/i.test(code)) continue;   // stray label in code column
    out.push({ rowIndex: r, code: code, row: row });
  }
  return out;
}

function buildModel(){
  const cur = S.bridgeCur, pri = S.bridgePri, ovd = S.overdue;
  if (!cur) throw new Error('No current-period AR bridge sheet was resolved.');

  const idx = {};        // code -> customer
  const order = [];

  function ensure(code){
    if (!idx[code]){
      const c = {
        code: code, name: '', clusterRaw: '', cluster: '', country: '',
        beg26:0, sales26:0, collCash26:0, ap26:0, endCalc26:0, endAct26:0,
        beg25:0, sales25:0, collCash25:0, ap25:0, endCalc25:0, endAct25:0,
        ovd26:0, ovd25:0,
        inCur:false, inPri:false, inOvd:false,
        clusterOvdRaw:''
      };
      idx[code] = c; order.push(c);
    }
    return idx[code];
  }

  function ingestBridge(pack, suffix){
    if (!pack) return;
    const rows = readDataRows(pack.sheet, pack.res);
    const m = pack.res.map;
    const g = function(row, key){ return m[key] === undefined ? 0 : toNum(row[m[key]]); };
    for (let i = 0; i < rows.length; i++){
      const rec = rows[i], row = rec.row, c = ensure(rec.code);
      const nm = (m.name !== undefined) ? normText(row[m.name]) : '';
      if (nm) c.name = nm;                                  // later source wins; current period ingested last
      if (m.cluster !== undefined){
        const cl = normText(row[m.cluster]);
        if (cl){ c.clusterRaw = cl; }
      }
      if (m.country !== undefined){
        const co = normText(row[m.country]);
        if (co) c.country = co;
      }
      c['beg'  + suffix] = g(row, 'beg');
      c['sales'+ suffix] = g(row, 'sales');
      c['collCash'+suffix] = g(row, 'coll');
      c['ap'   + suffix] = g(row, 'ap');
      c['endCalc'+suffix]= (m.endCalc !== undefined) ? g(row, 'endCalc')
                          : (g(row,'beg') + g(row,'sales') + g(row,'coll') + g(row,'ap'));
      c['endAct'+ suffix]= (m.endAct !== undefined) ? g(row, 'endAct') : c['endCalc'+suffix];
      c[suffix === '26' ? 'inCur' : 'inPri'] = true;
    }
  }

  // prior first, then current (so current-period names/clusters win)
  ingestBridge(pri, '25');
  ingestBridge(cur, '26');

  // ---- overdue join (LEFT JOIN onto the AR universe) ----
  const ovdOnly = [];
  if (ovd){
    const rows = readDataRows(ovd.sheet, ovd.res);
    const m = ovd.res.map;
    for (let i = 0; i < rows.length; i++){
      const rec = rows[i], row = rec.row;
      const known = !!idx[rec.code];
      const c = ensure(rec.code);
      if (!known){
        ovdOnly.push(rec.code);
        if (m.name !== undefined && !c.name) c.name = normText(row[m.name]);
      }
      if (m.cluster !== undefined) c.clusterOvdRaw = normText(row[m.cluster]);
      c.ovd26 = ovd.colCur >= 0 ? toNum(row[ovd.colCur]) : 0;
      c.ovd25 = ovd.colPri >= 0 ? toNum(row[ovd.colPri]) : 0;
      c.inOvd = true;
    }
  }

  // ---- RULE 7: cluster source + overrides + normalisation ----
  for (let i = 0; i < order.length; i++){
    const c = order[i];
    let base = c.clusterRaw || c.clusterOvdRaw || '';
    const ovr = S.clusterOverrides[c.code];
    if (ovr) base = ovr;
    c.clusterSource = base;
    c.cluster = normaliseCluster(base);
    c.clusterOvd = c.cluster;
    if (!c.country) c.country = '';
    if (!c.name) c.name = c.code;

    // ---- RULE 1: Collection = cash collections + AP offset ----
    c.coll26 = c.collCash26 + c.ap26;
    c.coll25 = c.collCash25 + c.ap25;
    // ---- RULE 2: AR = Ending AR (Actual) ----
    c.ar26 = c.endAct26;
    c.ar25 = c.endAct25;
    // reconciliation residual
    c.change26 = c.endAct26 - c.endCalc26;
    c.change25 = c.endAct25 - c.endCalc25;
  }

  // ---- RULE 3: single ranking cohort, AR (current) descending ----
  order.sort(function(a,b){
    if (b.ar26 !== a.ar26) return b.ar26 - a.ar26;
    if (b.sales26 !== a.sales26) return b.sales26 - a.sales26;
    return a.code < b.code ? -1 : (a.code > b.code ? 1 : 0);
  });
  for (let i = 0; i < order.length; i++) order[i].rank = i + 1;

  // ---- RULE 4: overdue ranks independently; ties fall back to AR rank ----
  const ovdOrder = order.slice().sort(function(a,b){
    if (b.ovd26 !== a.ovd26) return b.ovd26 - a.ovd26;
    return a.rank - b.rank;
  });
  for (let i = 0; i < ovdOrder.length; i++) ovdOrder[i].ovdRank = i + 1;

  S.customers = order;
  S.ovdOrder = ovdOrder;
  S.ovdOnly = ovdOnly;
  return order;
}

/* ============================================================================
   SECTION 9 — AGGREGATION
   ========================================================================== */
const TOP_N = 20;

function sumBy(list, key){ let t = 0; for (let i = 0; i < list.length; i++) t += list[i][key] || 0; return t; }

/* Portfolio-level AR bridge steps, shared by the on-screen bridge, the deck
   preview and the exported PPTX bridge slide — one source of truth. */
function portfolioBridgeSteps(){
  const beg = sumBy(S.customers, 'beg26'), sales = sumBy(S.customers, 'sales26');
  const coll = sumBy(S.customers, 'collCash26'), ap = sumBy(S.customers, 'ap26');
  const endCalc = sumBy(S.customers, 'endCalc26'), endAct = sumBy(S.customers, 'endAct26');
  return {
    steps: [
      { label:'Beginning AR', value:beg, type:'total' },
      { label:'Sales', value:sales, type:'delta' },
      { label:'Collections', value:coll, type:'delta' },
      { label:'AP Offset', value:ap, type:'delta' },
      { label:'Ending AR', value:endCalc, type:'total' }
    ],
    endCalc: endCalc, endAct: endAct, resid: endAct - endCalc
  };
}

function metricBlock(list, ovdList, key26, key25, isOverdue){
  const src = isOverdue ? ovdList : list;
  const top = src.slice(0, TOP_N), rest = src.slice(TOP_N);
  const t26 = sumBy(top, key26), t25 = sumBy(top, key25);
  const r26 = sumBy(rest, key26), r25 = sumBy(rest, key25);
  const a26 = t26 + r26, a25 = t25 + r25;
  return {
    top26:t26, top25:t25, rem26:r26, rem25:r25, tot26:a26, tot25:a25,
    topPct26: a26 ? t26/a26 : 0, topPct25: a25 ? t25/a25 : 0,
    topGrowth: t25 ? (t26 - t25)/t25 : (t26 ? Infinity : 0),
    totGrowth: a25 ? (a26 - a25)/a25 : (a26 ? Infinity : 0)
  };
}

/* RULE 5: cluster pivots default to the Top-20 cohort; Grand Total is always
   the full portfolio. Scope is user-switchable. */
function clusterPivot(metric){
  const isOvd = (metric === 'ovd');
  const src = isOvd ? S.ovdOrder : S.customers;
  const cohort = (S.clusterScope === 'full') ? src : src.slice(0, TOP_N);
  const k26 = metric + '26', k25 = metric + '25';
  const clKey = 'cluster';

  const buckets = {};
  for (let i = 0; i < cohort.length; i++){
    const c = cohort[i], k = c[clKey] || 'Unassigned';
    if (!buckets[k]) buckets[k] = { name:k, v26:0, v25:0 };
    buckets[k].v26 += c[k26] || 0;
    buckets[k].v25 += c[k25] || 0;
  }
  const rows = Object.keys(buckets).sort().map(function(k){ return buckets[k]; });

  // Collections are stored negative; charts present magnitude.
  if (metric === 'coll'){
    for (let i = 0; i < rows.length; i++){
      rows[i].v26 = -rows[i].v26;
      rows[i].v25 = -rows[i].v25;
    }
  }
  const blk = S.blocks[metric];
  let g26 = blk.tot26, g25 = blk.tot25;
  if (metric === 'coll'){ g26 = -g26; g25 = -g25; }
  rows.push({ name:'Grand Total', v26:g26, v25:g25, isTotal:true });
  return rows;
}

/* RULE 8: KPI polarity — which direction is favourable for each measure. */
function buildKpis(){
  const b = S.blocks;
  const defs = [
    { key:'sales', label:'MTD Gross Sales', v26:b.sales.tot26,  v25:b.sales.tot25,  polarity:+1 },
    { key:'coll',  label:'Collection',      v26:-b.coll.tot26,  v25:-b.coll.tot25,  polarity:+1 },
    { key:'ar',    label:'AR',              v26:b.ar.tot26,     v25:b.ar.tot25,     polarity:-1 },
    { key:'ovd',   label:'Overdue Balance', v26:b.ovd.tot26,    v25:b.ovd.tot25,    polarity:-1 }
  ];
  return defs.map(function(d){
    const variance = d.v26 - d.v25;
    const growth = d.v25 ? variance / Math.abs(d.v25) : (variance ? Infinity : 0);
    const arrow = variance > 0 ? '↑' : (variance < 0 ? '↓' : '→');
    const favourable = variance === 0 ? null : ((variance > 0) === (d.polarity > 0));
    return Object.assign({}, d, {
      variance: variance, growth: growth, arrow: arrow,
      favourable: favourable,
      wind: variance === 0 ? 'Neutral' : (favourable ? 'Tailwind' : 'Headwind')
    });
  });
}

function computeAll(){
  buildModel();
  const cust = S.customers, ovd = S.ovdOrder;
  S.blocks = {
    sales: metricBlock(cust, ovd, 'sales26', 'sales25', false),
    coll:  metricBlock(cust, ovd, 'coll26',  'coll25',  false),
    ar:    metricBlock(cust, ovd, 'ar26',    'ar25',    false),
    ovd:   metricBlock(cust, ovd, 'ovd26',   'ovd25',   true)
  };
  S.kpis = buildKpis();
  S.pivots = { sales:clusterPivot('sales'), coll:clusterPivot('coll'), ar:clusterPivot('ar'), ovd:clusterPivot('ovd') };
  S.validations = runValidations();
}

/* ============================================================================
   SECTION 10 — VALIDATION
   ========================================================================== */
function runValidations(){
  const v = [];
  const cust = S.customers;
  const push = function(level, title, detail){ v.push({ level:level, title:title, detail:detail }); };

  // 1. AR bridge reconciliation: Actual vs Calculated
  const TOL = 0.05;
  const breaks26 = cust.filter(function(c){ return Math.abs(c.change26) > TOL; });
  const breaks25 = cust.filter(function(c){ return Math.abs(c.change25) > TOL; });
  if (breaks26.length || breaks25.length){
    const names = breaks26.concat(breaks25).slice(0,6).map(function(c){ return c.code + ' ' + c.name; });
    push('err', 'AR bridge does not reconcile for ' + (breaks26.length + breaks25.length) + ' customer-period(s)',
      'Beginning + Sales + Collections + AP Offset does not equal Actual AR beyond ' + TOL +
      ' SAR. Affected: ' + names.join('; ') + (breaks26.length + breaks25.length > 6 ? ' …' : ''));
  } else {
    push('ok', 'AR bridge reconciles across all ' + cust.length + ' customers',
      'Beginning + Sales + Collections + AP Offset equals Actual AR in both periods (tolerance ' + TOL + ' SAR).');
  }

  // 2. Duplicate codes
  const seen = {}, dupes = [];
  cust.forEach(function(c){ if (seen[c.code]) dupes.push(c.code); seen[c.code] = 1; });
  if (dupes.length) push('err', 'Duplicate customer codes', dupes.join(', '));

  // 3. Coverage between periods
  const missPri = cust.filter(function(c){ return c.inCur && !c.inPri; });
  const missCur = cust.filter(function(c){ return c.inPri && !c.inCur; });
  if (missPri.length) push('warn', missPri.length + ' customer(s) present in the current period only',
    'Prior-year comparatives default to zero: ' + missPri.slice(0,8).map(function(c){ return c.code; }).join(', ') + (missPri.length>8?' …':''));
  if (missCur.length) push('warn', missCur.length + ' customer(s) present in the prior period only',
    'Current-year values default to zero: ' + missCur.slice(0,8).map(function(c){ return c.code; }).join(', ') + (missCur.length>8?' …':''));

  // 4. Overdue coverage
  if (!S.overdue){
    push('warn', 'No overdue workbook loaded', 'Overdue KPIs, the Due Amounts chart and slide 10 will report zero.');
  } else {
    const noOvd = cust.filter(function(c){ return !c.inOvd; });
    if (noOvd.length) push('warn', noOvd.length + ' customer(s) absent from the overdue export',
      'Treated as zero overdue (left join on the AR customer universe).');
    if (S.ovdOnly && S.ovdOnly.length) push('warn', S.ovdOnly.length + ' overdue row(s) not in the AR workbook',
      'Added to the universe with zero sales/collections: ' + S.ovdOnly.slice(0,8).join(', '));
    else push('ok', 'Overdue export fully joined', S.customers.filter(function(c){return c.inOvd;}).length + ' of ' + cust.length + ' customers matched.');
  }

  // 5. Unassigned clusters
  const noCl = cust.filter(function(c){ return !c.clusterSource; });
  if (noCl.length) push('warn', noCl.length + ' customer(s) have no cluster',
    'Grouped as "Unassigned": ' + noCl.slice(0,8).map(function(c){ return c.code; }).join(', '));

  // 6. Period sanity
  if (S.period && S.period.priorYear >= S.period.year){
    push('err', 'Period ordering looks wrong', 'Current period resolved as ' + S.period.year + ' and prior as ' + S.period.priorYear + '.');
  }

  // 7. Low-confidence mappings
  const low = [];
  [['Current AR', S.bridgeCur], ['Prior AR', S.bridgePri]].forEach(function(p){
    if (!p[1]) return;
    const conf = p[1].res.conf;
    for (const k in conf) if (conf[k] < 0.75) low.push(p[0] + ' → ' + k + ' (' + Math.round(conf[k]*100) + '%)');
  });
  if (low.length) push('warn', 'Low-confidence column mappings', low.join('; ') + ' — review in Field Mapping.');

  // 8. Top-20 sanity
  if (cust.length < TOP_N) push('warn', 'Fewer than ' + TOP_N + ' customers', 'Top-20 tables will list ' + cust.length + ' rows.');

  return v;
}

/* ============================================================================
   SECTION 11 — INGEST ORCHESTRATION (role + period resolution)
   ========================================================================== */
/* ============================================================================
   SAMPLE DATA (portfolio demo)
   Builds two fictional workbooks with the app's own XLSX writer — an AR bridge
   workbook (current and prior period sheets) and an overdue export — and feeds
   them through the normal file-reading path. Every name and number is invented.
   ========================================================================== */
function sampleRandom(seed){
  // mulberry32: small deterministic PRNG so the sample is identical on every load
  return function(){
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const SAMPLE_CLUSTERS = [
  { name:'GCC',            countries:['United Arab Emirates','Kuwait','Oman','Bahrain','Qatar'] },
  { name:'Levant',         countries:['Jordan','Iraq','Lebanon'] },
  { name:'North Africa',   countries:['Egypt','Morocco','Tunisia','Algeria'] },
  { name:'East Africa',    countries:['Kenya','Ethiopia','Tanzania'] },
  { name:'Asia',           countries:['Pakistan','Malaysia','Philippines'] }
];
const SAMPLE_NAMES = ['Alder','Birch','Cedar','Delta','Ember','Fjord','Granite','Harbor','Iris','Juniper','Kestrel','Linden',
  'Maple','Nimbus','Onyx','Pine','Quartz','Raven','Sable','Tamarind','Umber','Vale','Willow','Yarrow','Zephyr','Aspen',
  'Basalt','Coral','Dune','Elm','Flint','Garnet'];
const SAMPLE_KINDS = ['Trading','Distribution','Medical Supplies','Healthcare','Pharma Partners'];

function sampleCustomers(){
  const rnd = sampleRandom(20260731);
  return SAMPLE_NAMES.map(function(n, i){
    const cl = SAMPLE_CLUSTERS[i % SAMPLE_CLUSTERS.length];
    const size = Math.pow(rnd(), 1.8) * 9e6 + 2.5e5;           // a few large accounts, a long tail
    const mk = function(scale){
      const beg = Math.round(size * (0.8 + rnd() * 0.6) * scale);
      const sales = Math.round(size * (0.35 + rnd() * 0.5) * scale);
      const coll = -Math.round(sales * (0.55 + rnd() * 0.6));
      const ap = rnd() < 0.25 ? -Math.round(sales * rnd() * 0.08) : 0;
      return { beg:beg, sales:sales, coll:coll, ap:ap, end:beg + sales + coll + ap };
    };
    const cur = mk(1), pri = mk(0.82 + rnd() * 0.3);
    const ovd = function(end){ return rnd() < 0.55 ? Math.round(Math.max(0, end) * (0.05 + rnd() * 0.4)) : 0; };
    return {
      code: 'C-' + (10001 + i * 7), name: n + ' ' + SAMPLE_KINDS[i % SAMPLE_KINDS.length] + ' (Demo)',
      cluster: cl.name, country: cl.countries[i % cl.countries.length],
      cur: cur, pri: pri, ovdCur: ovd(cur.end), ovdPri: ovd(pri.end),
      newThisYear: i === SAMPLE_NAMES.length - 1                    // shows the coverage warning
    };
  });
}

function sampleBridgeSheet(list, key, monthLabel){
  const head = ['Customer Code','Customer Name','Cluster','Country','Beginning Balance','Sales','Collections',
                'AP Offset', monthLabel + ' AR','Actual AR','Change'];
  const rows = [rowXml(1, head.map(function(h, i){ return cS(colLetter(i + 1) + '1', h); }))];
  let r = 2;
  list.forEach(function(c){
    if (key === 'pri' && c.newThisYear) return;
    const v = c[key];
    rows.push(rowXml(r, [cS('A' + r, c.code), cS('B' + r, c.name), cS('C' + r, c.cluster), cS('D' + r, c.country),
      cN('E' + r, v.beg), cN('F' + r, v.sales), cN('G' + r, v.coll), cN('H' + r, v.ap),
      cN('I' + r, v.end), cN('J' + r, v.end), cN('K' + r, 0)]));
    r++;
  });
  return sheetXml(rows, {});
}
function sampleOverdueSheet(list){
  const head = ['Customer Code','Customer Name','Cluster','Due Jul 2025','Due Jul 2026'];
  const rows = [rowXml(1, head.map(function(h, i){ return cS(colLetter(i + 1) + '1', h); }))];
  let r = 2;
  list.forEach(function(c){
    if (!c.ovdCur && !c.ovdPri) return;
    rows.push(rowXml(r, [cS('A' + r, c.code), cS('B' + r, c.name), cS('C' + r, c.cluster),
      cN('D' + r, c.ovdPri), cN('E' + r, c.ovdCur)]));
    r++;
  });
  return sheetXml(rows, {});
}
async function sampleWorkbook(sheets){
  const files = [];
  const rels = [];
  sheets.forEach(function(sh, i){
    files.push({ name:'xl/worksheets/sheet' + (i + 1) + '.xml', data:sh.xml });
    rels.push({ id:'rId' + (i + 1), type:RT.sheet, target:'worksheets/sheet' + (i + 1) + '.xml' });
  });
  files.push({ name:'xl/workbook.xml', data: XML_DECL +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="' + NS_R + '"><sheets>' +
    sheets.map(function(sh, i){ return '<sheet name="' + xesc(sh.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') +
    '</sheets></workbook>' });
  files.push({ name:'xl/_rels/workbook.xml.rels', data:relsXml(rels.concat([{ id:'rId' + (sheets.length + 1), type:RT.styles, target:'styles.xml' }])) });
  files.push({ name:'xl/styles.xml', data:xlsxStylesXml() });
  files.push({ name:'_rels/.rels', data:relsXml([{ id:'rId1', type:RT.wb, target:'xl/workbook.xml' }]) });
  let ct = XML_DECL + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
  sheets.forEach(function(sh, i){
    ct += '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
  });
  files.unshift({ name:'[Content_Types].xml', data:ct + '</Types>' });
  return zipBuild(files);
}
async function sampleFiles(){
  const list = sampleCustomers();
  const bridge = await sampleWorkbook([
    { name:'1.1.26to31.7.26', xml:sampleBridgeSheet(list, 'cur', 'Jul 26') },
    { name:'1.1.25to31.7.25', xml:sampleBridgeSheet(list, 'pri', 'Jul 25') }
  ]);
  const overdue = await sampleWorkbook([{ name:'Due 31.7.2026', xml:sampleOverdueSheet(list) }]);
  return [
    new File([bridge], 'Sample AR bridge (fictional).xlsx', { type:MIME_XLSX }),
    new File([overdue], 'Sample overdue export (fictional).xlsx', { type:MIME_XLSX })
  ];
}
async function loadSampleData(){
  S.files = [];
  await ingestFiles(await sampleFiles());
  toast('Fictional sample workbooks loaded.', 'ok');
}
async function downloadSampleFiles(){
  const files = await sampleFiles();
  for (const f of files) downloadBlob(new Uint8Array(await f.arrayBuffer()), f.name, MIME_XLSX);
}

async function ingestFiles(fileList){
  const arr = Array.prototype.slice.call(fileList).filter(function(f){ return /\.xls[xm]$/i.test(f.name); });
  if (!arr.length){ toast('Only .xlsx / .xlsm workbooks are supported.', 'err'); return; }

  for (let i = 0; i < arr.length; i++){
    const f = arr[i];
    try{
      const buf = await f.arrayBuffer();
      const wb = await readXlsx(buf, f.name);
      const resolved = wb.sheets
        .filter(function(s){ return s.state === 'visible' && s.rows > 1; })
        .map(function(s){ return { sheet:s, res:resolveSheet(s) }; });
      // drop any file previously loaded under the same name
      S.files = S.files.filter(function(x){ return x.name !== f.name; });
      S.files.push({ name:f.name, size:f.size, workbook:wb, resolved:resolved });
      log('Parsed ' + f.name + ' — ' + wb.sheets.length + ' sheet(s)', 'ok');
    }catch(e){
      log('Failed to parse ' + f.name + ': ' + e.message, 'err');
      toast('Could not read ' + f.name + ' — ' + e.message, 'err');
    }
  }
  assignRoles();
  refreshAll();
}

function assignRoles(){
  const bridges = [], overdues = [];
  S.files.forEach(function(f){
    f.resolved.forEach(function(r){
      const item = { file:f, sheet:r.sheet, res:r.res };
      if (r.res.role === 'bridge'){
        item.period = inferBridgePeriod(r.res, r.sheet);
        bridges.push(item);
      } else if (r.res.role === 'overdue'){
        overdues.push(item);
      }
    });
  });

  // --- AR bridge sheets: newest = current, next = prior ---
  bridges.sort(function(a,b){
    const ya = (a.period && a.period.year) || 0, yb = (b.period && b.period.year) || 0;
    if (yb !== ya) return yb - ya;
    const ma = (a.period && a.period.month) || 0, mb = (b.period && b.period.month) || 0;
    return mb - ma;
  });
  S.bridgeCur = bridges[0] || null;
  S.bridgePri = bridges[1] || null;
  S.allBridges = bridges;

  // --- period ---
  if (S.bridgeCur){
    const p = S.bridgeCur.period || {};
    let month = (p.month === null || p.month === undefined) ? null : p.month;
    let year  = p.year || null;
    if (year === null && S.bridgePri && S.bridgePri.period) year = (S.bridgePri.period.year || 0) + 1;
    if (month === null) month = new Date().getMonth();
    if (year === null) year = new Date().getFullYear();
    const priorYear = (S.bridgePri && S.bridgePri.period && S.bridgePri.period.year) || (year - 1);
    S.period = {
      month: month, year: year, priorYear: priorYear,
      monTitle: MON_TITLE[month],
      monFull: MONTHS[month].charAt(0).toUpperCase() + MONTHS[month].slice(1),
      yy: String(year).slice(-2), yyPrior: String(priorYear).slice(-2),
      labelCur: MON_TITLE[month] + '-' + String(year).slice(-2),
      labelPri: MON_TITLE[month] + '-' + String(priorYear).slice(-2),
      sources: (p.sources || []).join(', ')
    };
  } else {
    S.period = null;
  }

  // --- overdue sheet: pick the richest, then map its two Due columns by year ---
  overdues.sort(function(a,b){ return b.res.dueCols.length - a.res.dueCols.length; });
  const od = overdues[0] || null;
  if (od && S.period){
    const cols = od.res.dueCols.slice();
    let cur = -1, pri = -1;
    for (let i = 0; i < cols.length; i++){
      if (cols[i].year === S.period.year) cur = cols[i].col;
      if (cols[i].year === S.period.priorYear) pri = cols[i].col;
    }
    if (cur < 0 || pri < 0){
      // fall back to sheet-name date + positional order (older first, as exported)
      const byYear = cols.slice().sort(function(a,b){ return (a.year||0) - (b.year||0); });
      if (pri < 0 && byYear.length) pri = byYear[0].col;
      if (cur < 0 && byYear.length > 1) cur = byYear[byYear.length-1].col;
      if (cur < 0 && byYear.length === 1) cur = byYear[0].col;
    }
    S.overdue = { file:od.file, sheet:od.sheet, res:od.res, colCur:cur, colPri:pri };
    log('Overdue columns → current=' + (cur>=0?colLetter(cur+1):'none') + ', prior=' + (pri>=0?colLetter(pri+1):'none'), 'ok');
  } else {
    S.overdue = od ? { file:od.file, sheet:od.sheet, res:od.res, colCur:-1, colPri:-1 } : null;
  }

  // --- apply persisted manual overrides ---
  applyOverrides();

  if (S.bridgeCur) log('Current AR sheet: "' + S.bridgeCur.sheet.name + '" (' + (S.period ? S.period.labelCur : '?') + ')', 'ok');
  if (S.bridgePri) log('Prior AR sheet:   "' + S.bridgePri.sheet.name + '" (' + (S.period ? S.period.labelPri : '?') + ')', 'ok');
}

function applyOverrides(){
  const scopes = { cur:S.bridgeCur, pri:S.bridgePri, ovd:S.overdue };
  for (const scope in scopes){
    const pack = scopes[scope];
    if (!pack) continue;
    for (const field in S.overrides){
      const parts = field.split('.');
      if (parts[0] !== scope) continue;
      const key = parts[1], col = S.overrides[field];
      if (col === -1 || col === '' || col === null){ delete pack.res.map[key]; }
      else if (scope === 'ovd' && (key === 'colCur' || key === 'colPri')){ pack[key] = +col; }
      else { pack.res.map[key] = +col; pack.res.conf[key] = 1; }
    }
  }
}

/* ============================================================================
   SECTION 12 — INLINE SVG CHART ENGINE (no libraries, theme-aware)
   ========================================================================== */
function svgTag(inner, w, h, extra){
  // overflow:hidden on the viewBox is the final guarantee that no mark can
  // ever paint over the title rule, whatever the data.
  return '<svg class="viz" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet" ' +
         'style="overflow:hidden" role="img" ' + (extra||'') + '>' + inner + '</svg>';
}
function niceCeil(x){
  if (x <= 0) return 1;
  const e = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / e;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return n * e;
}
/* Ticks must always SPAN the data. Rounding the end down (the previous
   behaviour) left values above the last tick drawing outside the plot area. */
function axisTicks(min, max, count){
  const span = (max - min) || Math.abs(max) || 1;
  const step = niceCeil(span / (count || 5));
  const start = Math.floor(min / step) * step;
  const end   = Math.ceil(max / step) * step;
  const out = [];
  for (let v = start; v <= end + step * 1e-6; v += step){
    out.push(Math.abs(v) < step * 1e-9 ? 0 : +v.toPrecision(12));
  }
  return out.length > 1 ? out : [start, start + step];
}

/* --- grouped column chart (2 series) --- */
/* Best practice: the portfolio Grand Total is not a cluster and dwarfs the
   real comparisons — Affiliates/North Africa read as zero next to it. It is
   surfaced as a callout by the caller instead, so every cluster gets the
   full axis. */
function renderGroupedBars(rows, labelCur, labelPri){
  const W = 720, H = 352;
  const ml = 62, mr = 14, mt = 38, mb = 74;
  const iw = W - ml - mr, ih = H - mt - mb;
  const plot = rows.filter(function(r){ return !r.isTotal; });
  if (!plot.length) return svgTag('', W, H);

  let vmax = 0, vmin = 0;
  plot.forEach(function(r){
    vmax = Math.max(vmax, r.v26/1e6, r.v25/1e6);
    vmin = Math.min(vmin, r.v26/1e6, r.v25/1e6);
  });
  const ticks = axisTicks(Math.min(0, vmin), Math.max(vmax, 0.0001), 5);
  const tmin = Math.min.apply(null, ticks), tmax = Math.max.apply(null, ticks);
  const y = function(v){ return mt + ih - ((v - tmin) / (tmax - tmin || 1)) * ih; };

  let s = '';
  // grid + y axis
  s += '<g class="grid">';
  ticks.forEach(function(t){
    s += '<line x1="' + ml + '" y1="' + y(t).toFixed(1) + '" x2="' + (ml+iw) + '" y2="' + y(t).toFixed(1) + '" stroke-width="1"/>';
    s += '<text class="lbl" x="' + (ml-8) + '" y="' + (y(t)+3.5).toFixed(1) + '" text-anchor="end">' + t.toFixed(t % 1 ? 1 : 0) + '</text>';
  });
  s += '</g>';
  s += '<line class="axis" x1="' + ml + '" y1="' + y(0).toFixed(1) + '" x2="' + (ml+iw) + '" y2="' + y(0).toFixed(1) + '" stroke-width="1.5"/>';

  const bandW = iw / plot.length;
  const gap = bandW * 0.22;
  const barW = Math.min(56, (bandW - gap) / 2 - 3);

  plot.forEach(function(r, i){
    const cx = ml + bandW*i + bandW/2;
    const v26 = r.v26/1e6, v25 = r.v25/1e6;
    const zero = y(0);
    [[v26,'var(--f-series-1)',-1],[v25,'var(--f-series-2)',1]].forEach(function(pair){
      const v = pair[0], col = pair[1], side = pair[2];
      const x = cx + (side < 0 ? -(barW + 2) : 2);
      const yy = Math.min(y(v), zero), hh = Math.max(1.5, Math.abs(y(v) - zero));
      s += '<rect x="' + x.toFixed(1) + '" y="' + yy.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + hh.toFixed(1) +
           '" rx="2" fill="' + col + '"><title>' +
           xesc(r.name + ' — ' + (side<0 ? labelCur : labelPri) + ': ' + fmtM(pair[0]*1e6) + 'M SAR') + '</title></rect>';
      const ly = Math.max(v >= 0 ? yy - 5 : yy + hh + 11, 11);
      s += '<text class="vlbl" x="' + (x + barW/2).toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="middle">' +
           v.toFixed(2) + '</text>';
    });
    // category label (wrap onto 2 lines if long)
    const words = String(r.name).split(/\s+/);
    let l1 = words[0] || '', l2 = words.slice(1).join(' ');
    if (l1.length > 14){ l2 = l1.slice(13) + (l2 ? ' ' + l2 : ''); l1 = l1.slice(0,13); }
    s += '<text class="lbl" x="' + cx.toFixed(1) + '" y="' + (mt+ih+18) + '" text-anchor="middle">' + xesc(l1) + '</text>';
    if (l2) s += '<text class="lbl" x="' + cx.toFixed(1) + '" y="' + (mt+ih+31) + '" text-anchor="middle">' + xesc(l2.slice(0,18)) + '</text>';
  });
  s += '<text class="lbl" x="' + (ml-8) + '" y="' + (mt-4) + '" text-anchor="end">M SAR</text>';
  return svgTag(s, W, H);
}
/* Small callout for the portfolio total, shown beside the chart title
   instead of as a distorting fifth bar. */
function totalCalloutHtml(rows){
  const t = rows.filter(function(r){ return r.isTotal; })[0];
  if (!t) return '';
  return '<span class="badge badge-info" title="Full portfolio, both periods">Grand Total ' +
    fmtM(t.v26) + 'M <span class="muted">vs</span> ' + fmtM(t.v25) + 'M</span>';
}

/* --- AR waterfall bridge --- */
function renderBridge(steps, title){
  const W = 900, H = 372;
  const ml = 70, mr = 16, mt = 52, mb = 86;
  const iw = W - ml - mr, ih = H - mt - mb;

  // running positions
  let run = 0, lo = 0, hi = 0;
  const laid = steps.map(function(st){
    if (st.type === 'total'){
      const rec = { st:st, from:0, to:st.value/1e6 };
      lo = Math.min(lo, 0, rec.to); hi = Math.max(hi, 0, rec.to);
      run = st.value/1e6;
      return rec;
    }
    const from = run, to = run + st.value/1e6;
    run = to;
    lo = Math.min(lo, from, to); hi = Math.max(hi, from, to);
    return { st:st, from:from, to:to };
  });
  const ticks = axisTicks(Math.min(0,lo), Math.max(hi, 0.0001), 5);
  const tmin = Math.min.apply(null, ticks), tmax = Math.max.apply(null, ticks);
  const y = function(v){ return mt + ih - ((v - tmin) / (tmax - tmin || 1)) * ih; };

  let s = '';
  s += '<g class="grid">';
  ticks.forEach(function(t){
    s += '<line x1="' + ml + '" y1="' + y(t).toFixed(1) + '" x2="' + (ml+iw) + '" y2="' + y(t).toFixed(1) + '" stroke-width="1"/>';
    s += '<text class="lbl" x="' + (ml-8) + '" y="' + (y(t)+3.5).toFixed(1) + '" text-anchor="end">' + t.toFixed(0) + '</text>';
  });
  s += '</g>';
  s += '<line class="axis" x1="' + ml + '" y1="' + y(0).toFixed(1) + '" x2="' + (ml+iw) + '" y2="' + y(0).toFixed(1) + '" stroke-width="1.5"/>';

  const bandW = iw / laid.length;
  const barW = Math.min(78, bandW * 0.56);

  laid.forEach(function(rec, i){
    const cx = ml + bandW*i + bandW/2;
    const x = cx - barW/2;
    const yTop = Math.min(y(rec.from), y(rec.to));
    const hh = Math.max(2, Math.abs(y(rec.to) - y(rec.from)));
    // Monochrome: balance = black, increase = mid grey, decrease = light grey
    // with an outline. Value labels also carry the +/− sign.
    let fill, stroke = 'none';
    if (rec.st.type === 'total') fill = '#161616';
    else if (rec.st.value >= 0) fill = '#8D8D8D';
    else { fill = '#E0E0E0'; stroke = '#161616'; }
    s += '<rect x="' + x.toFixed(1) + '" y="' + yTop.toFixed(1) + '" width="' + barW.toFixed(1) +
         '" height="' + hh.toFixed(1) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1">' +
         '<title>' + xesc(rec.st.label + ': ' + fmtM(rec.st.value) + 'M SAR') + '</title></rect>';
    // connector
    if (i < laid.length - 1 && laid[i+1].st.type !== 'total'){
      const nx = ml + bandW*(i+1) + bandW/2 - barW/2;
      s += '<line x1="' + (x+barW).toFixed(1) + '" y1="' + y(rec.to).toFixed(1) + '" x2="' + nx.toFixed(1) +
           '" y2="' + y(rec.to).toFixed(1) + '" stroke="var(--f-fg-4)" stroke-width="1" stroke-dasharray="3 2"/>';
    }
    let lblY = (rec.st.value >= 0 || rec.st.type === 'total') ? yTop - 7 : yTop + hh + 14;
    lblY = Math.max(lblY, 12);                       // never escape the plot area
    s += '<text class="vlbl" x="' + cx.toFixed(1) + '" y="' + lblY.toFixed(1) + '" text-anchor="middle">' +
         (rec.st.type !== 'total' && rec.st.value > 0 ? '+' : '') + fmtM(rec.st.value) + '</text>';
    // label, up to 2 lines
    const w = String(rec.st.label).split(/\s+/);
    let l1 = w[0], l2 = w.slice(1).join(' ');
    s += '<text class="lbl" x="' + cx.toFixed(1) + '" y="' + (mt+ih+18) + '" text-anchor="middle">' + xesc(l1) + '</text>';
    if (l2) s += '<text class="lbl" x="' + cx.toFixed(1) + '" y="' + (mt+ih+31) + '" text-anchor="middle">' + xesc(l2) + '</text>';
  });
  s += '<text class="lbl" x="' + (ml-8) + '" y="' + (mt-6) + '" text-anchor="end">M SAR</text>';
  return svgTag(s, W, H, 'aria-label="' + xesc(title||'AR bridge') + '"');
}

/* --- KPI sparkline (2-point comparison) --- */
function renderSpark(v25, v26, good){
  const W = 240, H = 34, pad = 3;
  const mx = Math.max(Math.abs(v25), Math.abs(v26), 1);
  const y = function(v){ return H - pad - (Math.abs(v)/mx) * (H - pad*2); };
  const col = good === null ? 'var(--f-fg-3)' : (good ? 'var(--f-success)' : 'var(--f-danger)');
  const x1 = pad, x2 = W - pad;
  let s = '';
  s += '<defs><linearGradient id="g' + Math.random().toString(36).slice(2,8) + '"></linearGradient></defs>';
  s += '<line x1="' + x1 + '" y1="' + y(v25).toFixed(1) + '" x2="' + x2 + '" y2="' + y(v26).toFixed(1) +
       '" stroke="' + col + '" stroke-width="2" stroke-linecap="round"/>';
  s += '<circle cx="' + x1 + '" cy="' + y(v25).toFixed(1) + '" r="3" fill="var(--f-fg-4)"/>';
  s += '<circle cx="' + x2 + '" cy="' + y(v26).toFixed(1) + '" r="3.5" fill="' + col + '"/>';
  return svgTag(s, W, H);
}

/* ============================================================================
   SECTION 13 — UI
   ========================================================================== */
function toast(msg, kind){
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || 'info');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(function(){
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0'; el.style.transform = 'translateX(20px)';
    setTimeout(function(){ el.remove(); }, 320);
  }, 4200);
}

function refreshAll(){
  renderChips();
  const ready = !!S.bridgeCur;
  $('#results').classList.toggle('hidden', !ready);
  $('#emptyState').classList.toggle('hidden', ready);
  if (!ready){ renderLog(); return; }
  try{
    computeAll();
  }catch(e){
    log('Computation failed: ' + e.message, 'err');
    toast('Computation failed — ' + e.message, 'err');
    renderLog();
    return;
  }
  renderMapping();
  renderValidations();
  renderKpis();
  renderBridgeSection();
  renderClusterCharts();
  renderTableControls();
  renderTable();
  renderCommentary();
  renderExportInfo();
  renderLog();
}

/* ---- file chips ---- */
function renderChips(){
  const box = $('#fileChips');
  if (!S.files.length){ box.innerHTML = ''; return; }
  box.innerHTML = S.files.map(function(f, i){
    const roles = f.resolved.map(function(r){ return r.res.role; });
    const nBridge = roles.filter(function(r){ return r === 'bridge'; }).length;
    const nOvd = roles.filter(function(r){ return r === 'overdue'; }).length;
    let badge, cls;
    if (nBridge && nOvd){ badge = nBridge + ' AR + ' + nOvd + ' overdue'; cls = 'badge-ok'; }
    else if (nBridge){ badge = nBridge + ' AR bridge sheet' + (nBridge>1?'s':''); cls = 'badge-ok'; }
    else if (nOvd){ badge = 'overdue export'; cls = 'badge-ok'; }
    else { badge = 'no recognised sheets'; cls = 'badge-err'; }
    return '<div class="chip">' +
      '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" style="color:var(--f-success)"><path d="M4 3h8l4 4v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/></svg>' +
      '<span class="nm">' + xesc(f.name) + '</span>' +
      '<span class="badge ' + cls + '">' + xesc(badge) + '</span>' +
      '<span class="meta">' + (f.size/1024).toFixed(0) + ' KB</span>' +
      '<button data-rm="' + i + '" title="Remove" aria-label="Remove ' + xesc(f.name) + '">' +
      '<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M5.3 4.3 10 9l4.7-4.7 1 1L11 10l4.7 4.7-1 1L10 11l-4.7 4.7-1-1L9 10 4.3 5.3z"/></svg>' +
      '</button></div>';
  }).join('');
  $$('#fileChips button[data-rm]').forEach(function(b){
    b.addEventListener('click', function(){
      S.files.splice(+b.getAttribute('data-rm'), 1);
      assignRoles(); refreshAll();
    });
  });
}

/* ---- log ---- */
function renderLog(){
  const box = $('#logBox');
  if (!box) return;
  box.innerHTML = LOG.slice(-160).map(function(e){
    const t = e.t.toTimeString().slice(0,8);
    return '<div><span class="t">' + t + '</span><span class="' + e.kind + '">' + xesc(e.msg) + '</span></div>';
  }).join('');
  box.scrollTop = box.scrollHeight;
}

/* ---- field mapping ---- */
function renderMapping(){
  const scopes = [
    { key:'cur', title:'Current Period — AR Bridge', pack:S.bridgeCur },
    { key:'pri', title:'Prior Period — AR Bridge',   pack:S.bridgePri },
    { key:'ovd', title:'Overdue Export',             pack:S.overdue }
  ];
  let html = '';
  let lowest = 1;

  scopes.forEach(function(sc){
    if (!sc.pack){
      html += '<h3 style="margin:18px 0 8px;font-size:14px">' + xesc(sc.title) +
              ' <span class="badge badge-warn">not loaded</span></h3>';
      return;
    }
    const res = sc.pack.res, sheet = sc.pack.sheet;
    const opts = res.headerTexts.map(function(t, i){
      return '<option value="' + i + '">' + colLetter(i+1) + ' — ' + xesc(t || '(blank)') + '</option>';
    }).join('');

    html += '<h3 style="margin:18px 0 8px;font-size:14px">' + xesc(sc.title) +
            ' <span class="badge badge-info">' + xesc(sheet.name) + '</span>' +
            ' <span class="badge badge-neutral">header row ' + (res.headerRow+1) + '</span></h3>';
    html += '<div class="map-grid">';

    const fields = (sc.key === 'ovd')
      ? [['code','Customer Code'],['name','Customer Name'],['cluster','Cluster']]
      : FIELD_RULES.map(function(r){ return [r.key, r.label]; });

    fields.forEach(function(f){
      const col = res.map[f[0]];
      const c = res.conf[f[0]] || 0;
      const badge = col === undefined ? '<span class="badge badge-warn">unmapped</span>'
        : (c >= 0.9 ? '<span class="badge badge-ok">' + Math.round(c*100) + '%</span>'
                    : '<span class="badge badge-warn">' + Math.round(c*100) + '%</span>');
      if (col !== undefined && c < lowest) lowest = c;
      html += '<div class="map-row"><div style="min-width:0">' +
              '<div class="k">' + xesc(f[1]) + ' ' + badge + '</div>' +
              '<div class="v">' + (col === undefined ? '—' : colLetter(col+1) + ': ' + xesc(res.srcText[f[0]] || res.headerTexts[col] || '')) + '</div>' +
              '</div><select class="input" data-map="' + sc.key + '.' + f[0] + '">' +
              '<option value="-1">— none —</option>' + opts + '</select></div>';
    });

    if (sc.key === 'ovd'){
      [['colCur','Overdue — Current Period'],['colPri','Overdue — Prior Period']].forEach(function(f){
        const col = sc.pack[f[0]];
        html += '<div class="map-row"><div style="min-width:0">' +
                '<div class="k">' + xesc(f[1]) + ' <span class="badge ' + (col>=0?'badge-ok':'badge-warn') + '">' +
                (col>=0?'mapped':'unmapped') + '</span></div>' +
                '<div class="v">' + (col < 0 ? '—' : colLetter(col+1) + ': ' + xesc(res.headerTexts[col] || '')) + '</div>' +
                '</div><select class="input" data-map="ovd.' + f[0] + '">' +
                '<option value="-1">— none —</option>' + opts + '</select></div>';
      });
    }
    html += '</div>';
  });

  // cluster overrides
  html += '<h3 style="margin:22px 0 8px;font-size:14px">Cluster Reclassification' +
          ' <span class="badge badge-info">' + Object.keys(S.clusterOverrides).length + ' rule(s)</span></h3>' +
          '<p class="note" style="margin:0 0 10px">Force a customer into a different cluster. Applied to every table, chart and slide.</p>';
  const clusters = uniqueClusters();
  html += '<div class="map-grid">';
  S.customers.slice(0, 400).forEach(function(c){
    const ovr = S.clusterOverrides[c.code];
    if (!ovr && !S.showAllClusterRows) return;
    html += '<div class="map-row"><div style="min-width:0">' +
            '<div class="k">' + xesc(c.code) + ' — ' + xesc(c.name) + '</div>' +
            '<div class="v">source: ' + xesc(c.clusterRaw || c.clusterOvdRaw || '—') + '</div>' +
            '</div><select class="input" data-cl="' + xesc(c.code) + '">' +
            '<option value="">— use source —</option>' +
            clusters.map(function(k){ return '<option value="' + xesc(k) + '"' + (ovr === k ? ' selected' : '') + '>' + xesc(k) + '</option>'; }).join('') +
            '</select></div>';
  });
  html += '</div>';
  html += '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">' +
          '<button class="btn" id="btnShowAllCl">' + (S.showAllClusterRows ? 'Show only overridden' : 'Show all customers') + '</button>' +
          '<button class="btn" id="btnResetMap">Reset all mappings &amp; overrides</button></div>';

  $('#mapContent').innerHTML = html;

  // preselect current values
  $$('#mapContent select[data-map]').forEach(function(sel){
    const parts = sel.getAttribute('data-map').split('.');
    const pack = parts[0] === 'cur' ? S.bridgeCur : parts[0] === 'pri' ? S.bridgePri : S.overdue;
    if (!pack) return;
    const v = (parts[1] === 'colCur' || parts[1] === 'colPri') ? pack[parts[1]] : pack.res.map[parts[1]];
    sel.value = (v === undefined || v === null) ? '-1' : String(v);
    sel.addEventListener('change', function(){
      S.overrides[sel.getAttribute('data-map')] = +sel.value;
      LS.set('overrides', S.overrides);
      applyOverrides();
      refreshAll();
      toast('Mapping updated', 'ok');
    });
  });
  $$('#mapContent select[data-cl]').forEach(function(sel){
    sel.addEventListener('change', function(){
      const code = sel.getAttribute('data-cl');
      if (sel.value) S.clusterOverrides[code] = sel.value; else delete S.clusterOverrides[code];
      LS.set('clusterOverrides', S.clusterOverrides);
      refreshAll();
    });
  });
  const bSa = $('#btnShowAllCl');
  if (bSa) bSa.addEventListener('click', function(){ S.showAllClusterRows = !S.showAllClusterRows; renderMapping(); });
  const bR = $('#btnResetMap');
  if (bR) bR.addEventListener('click', function(){
    S.overrides = {}; S.clusterOverrides = Object.assign({}, DEFAULT_CLUSTER_OVERRIDES);
    LS.set('overrides', S.overrides); LS.set('clusterOverrides', S.clusterOverrides);
    assignRoles(); refreshAll(); toast('Mappings and overrides reset to defaults', 'ok');
  });

  const badge = $('#mapBadge');
  if (lowest >= 0.85){ badge.className = 'badge badge-ok'; badge.textContent = 'auto-resolved'; }
  else if (lowest >= 0.75){ badge.className = 'badge badge-warn'; badge.textContent = 'review suggested'; }
  else { badge.className = 'badge badge-err'; badge.textContent = 'needs review'; }
}
function uniqueClusters(){
  const set = {};
  S.customers.forEach(function(c){ if (c.cluster) set[c.cluster] = 1; });
  return Object.keys(set).sort();
}

/* ---- validation ---- */
function renderValidations(){
  const v = S.validations;
  const ICON = {
    ok:'<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm3.7 5.3-4.9 4.9-2.5-2.5-1 1 3.5 3.5 5.9-5.9-1-1Z"/></svg>',
    warn:'<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M9.1 2.6a1 1 0 0 1 1.8 0l7 12.9a1 1 0 0 1-.9 1.5H3a1 1 0 0 1-.9-1.5l7-12.9ZM10 7v5h1V7h-1Zm.5 7.8a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8Z"/></svg>',
    err:'<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm0 3.5a.9.9 0 0 0-.9 1v4.6a.9.9 0 0 0 1.8 0V6.5a.9.9 0 0 0-.9-1Zm0 8a1 1 0 1 0 0 2.1 1 1 0 0 0 0-2.1Z"/></svg>'
  };
  $('#valList').innerHTML = v.map(function(x){
    return '<div class="vitem ' + x.level + '"><span class="ic">' + ICON[x.level] + '</span>' +
           '<span class="bd"><b>' + xesc(x.title) + '</b>' + xesc(x.detail || '') + '</span></div>';
  }).join('') || '<div class="vitem ok"><span class="bd"><b>No issues</b></span></div>';

  const errs = v.filter(function(x){ return x.level === 'err'; }).length;
  const warns = v.filter(function(x){ return x.level === 'warn'; }).length;
  const b = $('#valBadge');
  if (errs){ b.className = 'badge badge-err'; b.textContent = errs + ' error' + (errs>1?'s':'') + (warns?', ' + warns + ' warning' + (warns>1?'s':''):''); }
  else if (warns){ b.className = 'badge badge-warn'; b.textContent = warns + ' warning' + (warns>1?'s':''); }
  else { b.className = 'badge badge-ok'; b.textContent = 'all checks passed'; }
  if (errs) $('#valAcc').open = true;
}

/* ---- KPI cards ---- */
function renderKpis(){
  const p = S.period;
  $('#kpiSub').textContent = 'MTD ' + p.monFull + ' ' + p.year + ' versus ' + p.monFull + ' ' + p.priorYear +
                             '  ·  ' + S.customers.length + ' customers';
  $('#brandSub').textContent = 'Demo portfolio  ·  Period ' + p.labelCur + ' vs ' + p.labelPri;
  $('#kpiCards').innerHTML = S.kpis.map(function(k){
    const cls = k.favourable === null ? '' : (k.favourable ? 'good' : 'bad');
    const dir = k.variance > 0 ? 'up' : 'down';
    return '<div class="card kpi ' + cls + '">' +
      '<div class="kpi-hd"><span class="lbl">' + xesc(k.label) + '</span>' +
        '<span class="badge ' + (k.favourable === null ? 'badge-neutral' : (k.favourable ? 'badge-ok' : 'badge-err')) + '">' +
        k.arrow + ' ' + k.wind + '</span></div>' +
      '<div class="kpi-val">' + fmtM(k.v26) + '<span class="unit">M SAR</span></div>' +
      '<div class="kpi-cmp">' +
        '<span class="kpi-delta ' + dir + '">' + k.arrow + ' ' + fmtSignedM(k.variance) + 'M</span>' +
        '<span class="kpi-delta ' + dir + '">' + (isFinite(k.growth) ? (k.growth>0?'+':'') + fmtPct(k.growth) : 'n/a') + '</span>' +
        '<span class="kpi-prior">vs ' + fmtM(k.v25) + 'M in ' + S.period.priorYear + '</span>' +
      '</div>' +
      '<div class="kpi-spark">' + renderSpark(k.v25, k.v26, k.favourable) + '</div>' +
    '</div>';
  }).join('');
}

/* ---- Fluent combobox (bridge scope) ---- */
function buildBridgeCombo(){
  const combo = $('#bridgeCombo'), btn = $('#bridgeComboBtn'),
        search = $('#bridgeComboSearch'), list = $('#bridgeComboList');
  const opts = [{ v:'__all__', t:'Portfolio Total' }].concat(S.customers.map(function(c){
    return { v:c.code, t:c.rank + '. ' + c.name, sub:c.cluster + ' · ' + c.country };
  }));
  S.bridgeOpts = opts;
  if (!S.bridgePick) S.bridgePick = '__all__';

  function paint(filter){
    const q = (filter || '').toLowerCase().trim();
    const hits = opts.filter(function(o){
      return !q || (o.t + ' ' + (o.sub || '')).toLowerCase().indexOf(q) >= 0;
    });
    list.innerHTML = hits.length
      ? hits.map(function(o){
          return '<div class="combo-opt" role="option" data-v="' + xesc(o.v) + '" aria-selected="' +
                 (o.v === S.bridgePick) + '">' + xesc(o.t) + '</div>';
        }).join('')
      : '<div class="combo-empty">No matching customer</div>';
    Array.prototype.forEach.call(list.querySelectorAll('.combo-opt'), function(el){
      el.addEventListener('click', function(){
        S.bridgePick = el.getAttribute('data-v');
        close();
        renderBridgeSection();
      });
    });
  }
  function open(){
    combo.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
    search.value = ''; paint(''); search.focus();
  }
  function close(){ combo.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }

  if (!combo.getAttribute('data-wired')){
    combo.setAttribute('data-wired', '1');
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      combo.classList.contains('open') ? close() : open();
    });
    search.addEventListener('input', function(){ paint(search.value); });
    search.addEventListener('keydown', function(e){
      if (e.key === 'Escape'){ close(); btn.focus(); }
      if (e.key === 'Enter'){
        const first = list.querySelector('.combo-opt');
        if (first){ S.bridgePick = first.getAttribute('data-v'); close(); renderBridgeSection(); }
      }
    });
    document.addEventListener('click', function(e){ if (!combo.contains(e.target)) close(); });
  }
  const cur = opts.filter(function(o){ return o.v === S.bridgePick; })[0] || opts[0];
  btn.querySelector('.lbl').textContent = cur.t;
}

/* ---- AR bridge ---- */
function renderBridgeSection(){
  buildBridgeCombo();
  const pick = S.bridgePick || '__all__';
  let beg, sales, coll, ap, endCalc, endAct, title;
  if (pick === '__all__'){
    beg = sumBy(S.customers,'beg26'); sales = sumBy(S.customers,'sales26');
    coll = sumBy(S.customers,'collCash26'); ap = sumBy(S.customers,'ap26');
    endCalc = sumBy(S.customers,'endCalc26'); endAct = sumBy(S.customers,'endAct26');
    title = 'Portfolio Total';
  } else {
    const c = S.customers.filter(function(x){ return x.code === pick; })[0] || S.customers[0];
    beg = c.beg26; sales = c.sales26; coll = c.collCash26; ap = c.ap26;
    endCalc = c.endCalc26; endAct = c.endAct26; title = c.name + ' (' + c.code + ')';
  }
  const steps = [
    { label:'Beginning AR', value:beg, type:'total' },
    { label:'Sales', value:sales, type:'delta' },
    { label:'Collections', value:coll, type:'delta' },
    { label:'AP Offset', value:ap, type:'delta' },
    { label:'Ending AR', value:endCalc, type:'total' }
  ];
  const resid = endAct - endCalc;
  const ok = Math.abs(resid) <= 0.05;
  $('#bridgeCard').innerHTML =
    '<h3>' + xesc(title) + ' — ' + S.period.labelCur + '</h3>' +
    '<p class="cap">Beginning balance rolled forward through sales, collections and AP offsets to the closing receivable.</p>' +
    renderBridge(steps, title) +
    '<div class="legend" style="margin-top:10px">' +
      '<span><i style="background:#161616"></i>Balance</span>' +
      '<span><i style="background:#8D8D8D"></i>Increase (+)</span>' +
      '<span><i style="background:#E0E0E0;outline:1px solid #161616;outline-offset:-1px"></i>Decrease (−)</span>' +
      '<span class="' + (ok ? 'pos' : 'neg') + '" style="font-weight:600">' +
        (ok ? '✓ Reconciled' : '⚠ Residual ' + fmtN(resid,2) + ' SAR') +
        ' — Actual AR ' + fmtM(endAct) + 'M vs Calculated ' + fmtM(endCalc) + 'M</span>' +
    '</div>';
}

/* ---- cluster charts ---- */
function renderClusterCharts(){
  const p = S.period;
  $('#scopeSub').textContent = S.clusterScope === 'top20'
    ? 'Cluster bars aggregate the Top-20 cohort, on a full axis; the portfolio total is shown separately.'
    : 'Cluster bars aggregate the full portfolio; total shown separately so clusters keep the full axis.';
  const defs = [
    { k:'sales', t:'MTD Gross Sales — per Cluster', c:'Gross sales for the month.' },
    { k:'ar',    t:'Exposure (Accounts Receivable) — per Cluster', c:'Closing receivable balance (Actual AR).' },
    { k:'coll',  t:'MTD Collection — per Cluster', c:'Cash collected plus AP offsets, shown as magnitude.' },
    { k:'ovd',   t:'Due Amounts — per Cluster', c:'Overdue balances past due date.' }
  ];
  $('#clusterCharts').innerHTML = defs.map(function(d){
    return '<div class="card chart-card"><div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">' +
      '<h3 style="margin:0">' + xesc(d.t) + '</h3>' + totalCalloutHtml(S.pivots[d.k]) + '</div>' +
      '<p class="cap">' + xesc(d.c) + '</p>' +
      renderGroupedBars(S.pivots[d.k], p.labelCur, p.labelPri) +
      '<div class="legend"><span><i style="background:var(--f-series-1)"></i>' + p.labelCur + '</span>' +
      '<span><i style="background:var(--f-series-2)"></i>' + p.labelPri + '</span></div></div>';
  }).join('');
}

/* ---- customer table ---- */
const TBL_COLS = [
  { k:'rank',   t:'#',        num:true,  fmt:function(c){ return c.rank; } },
  { k:'code',   t:'Code',     num:false, fmt:function(c){ return xesc(c.code); } },
  { k:'name',   t:'Customer Name', num:false, fmt:function(c){ return xesc(c.name); } },
  { k:'cluster',t:'Cluster',  num:false, fmt:function(c){ return xesc(c.cluster); } },
  { k:'country',t:'Country',  num:false, fmt:function(c){ return xesc(c.country); } },
  { k:'sales26',t:'Sales C',  num:true,  m:true },
  { k:'sales25',t:'Sales P',  num:true,  m:true },
  { k:'coll26', t:'Coll. C',  num:true,  m:true },
  { k:'coll25', t:'Coll. P',  num:true,  m:true },
  { k:'ar26',   t:'AR C',     num:true,  m:true },
  { k:'ar25',   t:'AR P',     num:true,  m:true },
  { k:'ovd26',  t:'Overdue C',num:true,  m:true },
  { k:'ovd25',  t:'Overdue P',num:true,  m:true }
];
function renderTableControls(){
  const sel = $('#clusterFilter');
  const cur = sel.value;
  const cl = {};
  S.customers.forEach(function(c){ cl[c.cluster] = 1; });
  sel.innerHTML = '<option value="">All clusters</option>' +
    Object.keys(cl).sort().map(function(k){ return '<option value="' + xesc(k) + '">' + xesc(k) + '</option>'; }).join('');
  sel.value = cur || '';
}
function filteredRows(){
  const q = S.search.toLowerCase().trim();
  const f = S.clusterFilter;
  return S.customers.filter(function(c){
    if (f && c.cluster !== f) return false;
    if (!q) return true;
    return (c.code + ' ' + c.name + ' ' + c.cluster + ' ' + c.country).toLowerCase().indexOf(q) >= 0;
  });
}
function renderTable(){
  const p = S.period;
  const rows = filteredRows().slice().sort(function(a,b){
    const k = S.sortKey;
    let av = a[k], bv = b[k];
    if (typeof av === 'string') return S.sortDir * String(av).localeCompare(String(bv));
    return S.sortDir * ((av||0) - (bv||0));
  });
  const head = '<thead><tr>' + TBL_COLS.map(function(c){
    const t = c.t.replace(/ C$/, ' ' + p.labelCur).replace(/ P$/, ' ' + p.labelPri);
    return '<th class="' + (c.num?'num':'') + '" data-sk="' + c.k + '" data-active="' + (S.sortKey===c.k?1:0) + '">' +
           xesc(t) + '<span class="sort">' + (S.sortKey===c.k ? (S.sortDir<0?'▼':'▲') : '↕') + '</span></th>';
  }).join('') + '</tr></thead>';

  const body = '<tbody>' + rows.map(function(c){
    const isTop = c.rank <= TOP_N;
    const isBoundary = c.rank === TOP_N && S.sortKey === 'ar26' && S.sortDir === -1;
    return '<tr class="' + (isTop?'top20 ':'') + (isBoundary?'boundary':'') + '">' + TBL_COLS.map(function(col){
      if (col.fmt) return '<td class="' + (col.num?'num':'') + '">' + col.fmt(c) + '</td>';
      const v = c[col.k] || 0;
      return '<td class="num ' + (v<0?'neg':'') + '">' + fmtM(v) + '</td>';
    }).join('') + '</tr>';
  }).join('') + '</tbody>';

  const b = S.blocks;
  function foot(label, s26,s25,c26,c25,a26,a25,o26,o25, cls){
    return '<tr class="' + (cls||'') + '"><td colspan="5">' + xesc(label) + '</td>' +
      [s26,s25,c26,c25,a26,a25,o26,o25].map(function(v){
        return '<td class="num ' + ((v||0)<0?'neg':'') + '">' + fmtM(v) + '</td>';
      }).join('') + '</tr>';
  }
  const tfoot = '<tfoot>' +
    foot('Top ' + TOP_N, b.sales.top26,b.sales.top25,b.coll.top26,b.coll.top25,b.ar.top26,b.ar.top25,b.ovd.top26,b.ovd.top25,'sub') +
    foot('Remaining',    b.sales.rem26,b.sales.rem25,b.coll.rem26,b.coll.rem25,b.ar.rem26,b.ar.rem25,b.ovd.rem26,b.ovd.rem25,'sub') +
    foot('Total',        b.sales.tot26,b.sales.tot25,b.coll.tot26,b.coll.tot25,b.ar.tot26,b.ar.tot25,b.ovd.tot26,b.ovd.tot25) +
  '</tfoot>';

  $('#dataTable').innerHTML = head + body + tfoot;
  $('#tblNote').textContent = 'Showing ' + rows.length + ' of ' + S.customers.length +
    ' customers. Values in millions SAR. Rows 1–' + TOP_N + ' form the Top-20 cohort used on the Sales, Collection and AR slides.';

  $$('#dataTable thead th').forEach(function(th){
    th.addEventListener('click', function(){
      const k = th.getAttribute('data-sk');
      if (S.sortKey === k) S.sortDir = -S.sortDir; else { S.sortKey = k; S.sortDir = (k==='name'||k==='code'||k==='cluster'||k==='country') ? 1 : -1; }
      renderTable();
    });
  });
}

/* ---- overdue commentary ---- */
function renderCommentary(){
  const top = S.ovdOrder.filter(function(c){ return c.ovd26 > 0; }).slice(0, 8);
  if (!top.length){ $('#cmtList').innerHTML = '<p class="note">No overdue balances in the current period.</p>'; return; }
  $('#cmtList').innerHTML = top.map(function(c){
    const v = S.commentary[c.code] || '';
    return '<div class="field"><label>' + xesc(c.name) + ' (' + xesc(c.cluster) + ') — SAR ' + fmtM(c.ovd26) + 'M</label>' +
      '<textarea class="input" rows="2" data-cmt="' + xesc(c.code) + '" placeholder="Optional note shown on the Executive Summary slide, e.g. funds credited early next month.">' +
      xesc(v) + '</textarea></div>';
  }).join('');
  $$('#cmtList textarea[data-cmt]').forEach(function(ta){
    ta.addEventListener('input', function(){
      const code = ta.getAttribute('data-cmt');
      if (ta.value.trim()) S.commentary[code] = ta.value.trim(); else delete S.commentary[code];
      LS.set('commentary', S.commentary);
    });
  });
}

/* ---- export info ---- */
function renderExportInfo(){
  const p = S.period;
  $('#btnPptxLabel').textContent = reportTitle();
  $('#expInfo').innerHTML =
    '<dt>Master workbook</dt><dd>' + xesc(xlsxFileName()) + '</dd>' +
    '<dt>Presentation</dt><dd>' + xesc(pptxFileName()) + '</dd>' +
    '<dt>Email subject</dt><dd>' + xesc(reportTitle()) + '</dd>' +
    '<dt>Period</dt><dd>' + p.labelCur + ' vs ' + p.labelPri + '</dd>' +
    '<dt>Customers</dt><dd>' + S.customers.length + ' (Top ' + TOP_N + ' cohort ranked by AR ' + p.labelCur + ')</dd>' +
    '<dt>Cluster scope</dt><dd>' + (S.clusterScope === 'top20' ? 'Top-20 cohort' : 'Full portfolio') + '</dd>';
}
function reportTitle(){ return 'Receivables Report - ' + S.period.monTitle + ' - ' + S.period.year; }
function xlsxFileName(){ return 'Master Sheet - ' + S.period.monTitle + ' - ' + S.period.year + '.xlsx'; }
function pptxFileName(){ return reportTitle() + '.pptx'; }

/* ============================================================================
   SECTION 13b — EMAIL (.eml draft with real attachments)
   mailto: cannot carry attachments; a MIME .eml with X-Unsent:1 opens in
   Outlook / Mail as an editable, unsent draft with the files already attached.
   ========================================================================== */
function defaultMailBody(){
  return 'Dear,\n\nGood day,\n\nPlease find attached ' + reportTitle() + ' and master sheet.\n';
}
function b64(u8){
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s);
}
function b64Lines(u8){ return b64(u8).replace(/(.{76})/g, '$1\r\n'); }
function mimeWord(s){
  return /^[\x20-\x7E]*$/.test(s) ? s : '=?UTF-8?B?' + btoa(unescape(encodeURIComponent(s))) + '?=';
}
function kpiHtmlTable(){
  const P = S.period;
  let h = '<table style="border-collapse:collapse;font-family:Aptos Narrow,Segoe UI,Arial,sans-serif;font-size:13px">' +
    '<tr style="background:#161616;color:#fff">' +
    ['KPI', String(P.year), String(P.priorYear), 'Variance', 'Growth', 'Signal'].map(function(t){
      return '<th style="padding:6px 12px;border:1px solid #BFBFBF;text-align:left">' + xesc(t) + '</th>';
    }).join('') + '</tr>';
  S.kpis.forEach(function(k, i){
    const bg = i % 2 ? '#F4F4F4' : '#FFFFFF';
    const col = k.favourable === null ? '#000000' : (k.favourable ? '#161616' : '#161616');
    h += '<tr style="background:' + bg + '">' +
      '<td style="padding:6px 12px;border:1px solid #BFBFBF"><b>' + xesc(k.label) + '</b></td>' +
      '<td style="padding:6px 12px;border:1px solid #BFBFBF;text-align:right">' + fmtM(k.v26) + '</td>' +
      '<td style="padding:6px 12px;border:1px solid #BFBFBF;text-align:right">' + fmtM(k.v25) + '</td>' +
      '<td style="padding:6px 12px;border:1px solid #BFBFBF;text-align:right">' + fmtSignedM(k.variance) + '</td>' +
      '<td style="padding:6px 12px;border:1px solid #BFBFBF;text-align:right;color:' + col + '">' +
        (isFinite(k.growth) ? (k.growth > 0 ? '+' : '') + fmtPct(k.growth) : 'n/a') + '</td>' +
      '<td style="padding:6px 12px;border:1px solid #BFBFBF;color:' + col + '">' + k.arrow + ' ' + k.wind + '</td>' +
    '</tr>';
  });
  return h + '</table>';
}
function buildEml(attachments){
  const P = S.period;
  const subject = reportTitle();
  const bodyTxt = defaultMailBody();
  const bnd = '----=_RPT_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  const CRLF = '\r\n';

  const bodyHtml =
    '<html><body style="font-family:Aptos Narrow,Segoe UI,Arial,sans-serif;font-size:14px;color:#000">' +
    bodyTxt.split(/\n/).map(function(l){ return l.trim() === '' ? '<p style="margin:10px 0"></p>' : '<p style="margin:4px 0">' + xesc(l) + '</p>'; }).join('') +
    '<p style="margin:16px 0 6px"><b>Amounts in Millions SAR &mdash; MTD ' + xesc(P.monFull + ' ' + P.year) +
      ' vs ' + xesc(P.monFull + ' ' + P.priorYear) + '</b></p>' +
    kpiHtmlTable() +
    '</body></html>';

  let m = '';
  m += 'X-Unsent: 1' + CRLF;                       // Outlook: open as an editable draft
  m += 'From: ' + CRLF;
  m += 'To: ' + CRLF;
  m += 'Subject: ' + mimeWord(subject) + CRLF;
  m += 'Date: ' + new Date().toUTCString().replace('GMT', '+0000') + CRLF;
  m += 'MIME-Version: 1.0' + CRLF;
  m += 'Content-Type: multipart/mixed; boundary="' + bnd + '"' + CRLF + CRLF;
  m += 'This is a multi-part message in MIME format.' + CRLF + CRLF;

  m += '--' + bnd + CRLF;
  m += 'Content-Type: text/html; charset="utf-8"' + CRLF;
  m += 'Content-Transfer-Encoding: base64' + CRLF + CRLF;
  m += b64Lines(strU8(bodyHtml)) + CRLF + CRLF;

  attachments.forEach(function(a){
    m += '--' + bnd + CRLF;
    m += 'Content-Type: ' + a.mime + '; name="' + a.name + '"' + CRLF;
    m += 'Content-Transfer-Encoding: base64' + CRLF;
    m += 'Content-Disposition: attachment; filename="' + a.name + '"' + CRLF + CRLF;
    m += b64Lines(a.data) + CRLF + CRLF;
  });
  m += '--' + bnd + '--' + CRLF;
  return m;
}
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MIME_PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

function downloadBlob(u8, name, mime){
  const blob = new Blob([u8], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); }, 1500);
}

/* ============================================================================
   SECTION 13c — DECK PREVIEW
   Renders the same 11 slides in HTML using the identical inch geometry the
   PPTX writer uses, so what you see is what gets exported.
   ========================================================================== */
const SL_W = 10, SL_H = 7.5;                       // slide size in inches
function pcX(v){ return (v / SL_W * 100).toFixed(3) + '%'; }
function pcY(v){ return (v / SL_H * 100).toFixed(3) + '%'; }
function ptFont(pt){ return 'font-size:calc(var(--ppi) * ' + (pt / 72).toFixed(4) + ')'; }
function box(xIn, yIn, wIn, hIn){
  return 'left:' + pcX(xIn) + ';top:' + pcY(yIn) + ';width:' + pcX(wIn) +
         (hIn !== undefined ? ';height:' + pcY(hIn) : '');
}
function pvRule(xIn, yIn, wIn, color){
  return '<div class="sl-rule" style="' + box(xIn, yIn, wIn, 0.028) + ';background:#' + color + '"></div>';
}
function pvTitle(text){
  const pt = autoTitlePt(text, TITLE_W, 20, 12, 2);
  return '<div class="sl-title" style="' + box(TITLE_X, TITLE_Y, TITLE_W, TITLE_H) + ';' + ptFont(pt) + '">' +
         xesc(text) + '</div>';
}
function pvChrome(){ return pvRule(0.95, RULE_Y, 8.68, '161616'); }
/* Mirrors the PPTX Grand Total callout so the preview matches the export. */
function pvTotalCallout(rows){
  const t = rows.filter(function(r){ return r.isTotal; })[0];
  if (!t) return '';
  return '<div class="sl-txt" style="' + box(6.10, RULE_Y + 0.06, 2.58) +
    ';text-align:right;color:#161616;font-weight:700;' + ptFont(11) + '">' +
    'Grand Total  ' + fmtM(t.v26) + 'M <span style="color:#606060;font-weight:400">vs</span> ' + fmtM(t.v25) + 'M</div>';
}

/* HTML twin of the PPTX table shape */
function pvTable(xIn, yIn, wIn, colFrac, rows, rowHIn){
  const cols = colFrac.map(function(f){ return '<col style="width:' + (f * 100).toFixed(3) + '%">'; }).join('');
  const body = rows.map(function(r){
    return '<tr style="height:' + pcY(r.h || rowHIn) + '">' + r.cells.map(function(c){
      const borderCss = c.line === false ? ';border:none'
        : c.lineTop ? ';border:none;border-top:1px solid #BFBFBF' : '';
      return '<td style="' + ptFont(c.sz || 9) +
        (c.wrap ? ';white-space:normal;line-height:1.05' : '') + borderCss +
        ';text-align:' + (c.align || 'left') +
        ';font-weight:' + (c.b ? 700 : 400) +
        ';color:#' + (c.color || '000000') +
        ';background:' + (c.fill ? '#' + c.fill : 'transparent') + '">' + xesc(c.t || '') + '</td>';
    }).join('') + '</tr>';
  }).join('');
  return '<table class="sl-tbl" style="' + box(xIn, yIn, wIn) + '"><colgroup>' + cols + '</colgroup><tbody>' + body + '</tbody></table>';
}

function buildPreviewSlides(){
  const P = S.period, B = S.blocks;
  const LC = P.labelCur, LP = P.labelPri;
  const HDR = '161616', HT = 'FFFFFF', BA = 'FFFFFF', BB = 'FFFFFF', SUM = 'FFFFFF';
  const AMT = ' (Amounts in Millions SAR)';
  const nTop = Math.min(TOP_N, S.customers.length);
  const out = [];

  /* 1 — title */
  out.push({ name:'Title', html:
    pvRule(3.00, 4.62, 4.00, '8D8D8D') +
    '<div class="sl-txt" style="' + box(1.00, 2.55, 8.00) + ';text-align:center;color:#161616;font-weight:700;line-height:1.25;' + ptFont(40) + '">' +
      'Sales & Receivables\nMTD ' + xesc(P.monTitle + ' – ' + P.year) + ' Results</div>' +
    '<div class="sl-txt" style="' + box(1.00, 4.85, 8.00) + ';text-align:center;color:#606060;' + ptFont(14) + '">' +
      xesc('Amounts in Millions SAR  ·  ' + P.monFull + ' ' + P.year + ' versus ' + P.monFull + ' ' + P.priorYear) + '</div>' });

  /* 2 — executive summary */
  const topOvd = S.ovdOrder.filter(function(c){ return c.ovd26 > 0; }).slice(0, 5);
  const headline = buildHeadline();
  let narr = 'Key Findings:\n';
  S.kpis.forEach(function(k){
    narr += '   • ' + kpiSentence(k) + (k.key === 'ovd' && topOvd.length ? ' Details as below:' : '') + '\n';
  });
  topOvd.forEach(function(c){
    const note = S.commentary[c.code];
    narr += '        - ' + c.name + ' (' + c.cluster + ')' + (c.country ? ' – ' + c.country : '') +
            ': SAR ' + fmtM(c.ovd26) + 'M.' + (note ? ' (' + note + ')' : '') + '\n';
  });
  const kpiRows = [{ h:0.19, cells:[
    { t:'', fill:HDR }, { t:String(P.year), b:true, align:'center', color:HT, fill:HDR, sz:10 },
    { t:String(P.priorYear), b:true, align:'center', color:HT, fill:HDR, sz:10 },
    { t:'', fill:HDR }, { t:'', fill:HDR }] }];
  S.kpis.forEach(function(k, i){
    const bg = i % 2 ? BA : BB;
    const col = k.favourable === null ? '000000' : (k.favourable ? '161616' : '161616');
    kpiRows.push({ h:0.19, cells:[
      { t:k.label, b:true, fill:bg, sz:10 },
      { t:fmtM(k.v26), align:'center', fill:bg, sz:10 },
      { t:fmtM(k.v25), align:'center', fill:bg, sz:10 },
      { t:k.arrow, align:'center', b:true, fill:bg, sz:10, color:col },
      { t:k.wind, align:'center', b:true, fill:bg, sz:10, color:col }] });
  });
  out.push({ name:'Executive Summary', html:
    pvChrome() + pvTitle('Executive Summary' + AMT) +
    (headline ? '<div class="sl-txt" style="' + box(0.35, BODY_Y - 0.06, 9.29) +
      ';font-weight:700;color:#161616;' + ptFont(14) + '">' + xesc(headline) + '</div>' : '') +
    '<div class="sl-txt" style="' + box(0.35, BODY_Y + 0.20, 9.29) + ';color:#606060;' + ptFont(10.5) + '">' +
      xesc('MTD ' + P.monTitle + ' ' + P.year + ' versus ' + P.monTitle + ' ' + P.priorYear + '.') + '</div>' +
    '<div class="sl-txt" style="' + box(0.35, BODY_Y + 0.50, 9.29) + ';font-weight:700;line-height:1.32;' + ptFont(11) + '">' + xesc(narr) + '</div>' +
    pvTable(0.35, 4.80, 9.29, [3.05/9.29, 1.45/9.29, 1.45/9.29, 1.10/9.29, 2.24/9.29], kpiRows) });

  /* 3 — AR bridge (best practice: show the mechanism right after the
     summary, before drilling into cluster/customer detail) */
  const bridge = portfolioBridgeSteps();
  const bridgeOk = Math.abs(bridge.resid) <= 0.05;
  out.push({ name:'AR Bridge', html:
    pvChrome() + pvTitle('Accounts Receivable Bridge' + AMT) +
    '<div class="sl-txt" style="' + box(0.95, BODY_Y, 8.10) + ';color:#606060;' + ptFont(10) + '">' +
      'Beginning AR rolled forward through Sales, Collections and AP Offsets to Ending AR.</div>' +
    '<div class="sl-abs" style="' + box(0.95, BODY_Y + 0.24, 8.10, 3.60) + '">' +
      renderBridge(bridge.steps, 'AR Bridge') + '</div>' +
    '<div class="sl-txt" style="' + box(0.95, BODY_Y + 4.10, 8.10) + ';font-weight:700;' + ptFont(10) +
      ';color:' + (bridgeOk ? '#161616' : '#161616') + '">' +
      xesc((bridgeOk ? 'Reconciled — ' : 'Residual ' + fmtN(bridge.resid, 2) + ' SAR — ') +
        'Actual AR ' + fmtM(bridge.endAct) + 'M vs Calculated ' + fmtM(bridge.endCalc) + 'M') + '</div>' });

  /* 4–7 — cluster charts */
  [['sales','MTD Gross Sales – per Cluster'],
   ['ar','Exposure (Account Receivable) - per Cluster'],
   ['coll','MTD Collection – per Cluster'],
   ['ovd','Due Amounts – per Cluster']].forEach(function(d){
    out.push({ name:d[1].split(' –')[0].split(' -')[0], html:
      pvChrome() + pvTitle(d[1] + AMT) + pvTotalCallout(S.pivots[d[0]]) +
      '<div class="sl-abs" style="' + box(0.61, BODY_Y, 8.77, 4.50) + '">' +
        renderGroupedBars(S.pivots[d[0]], LC, LP) + '</div>' });
  });

  /* 7–10 — Top-20 tables */
  const COLW = [559948, 723834, 2949970, 1055024, 669206, 915037, 1065266];
  const COLT = COLW.reduce(function(a, b){ return a + b; }, 0);
  const frac = COLW.map(function(c){ return c / COLT; });
  [['sales26','sales25',B.sales,'Top ' + nTop + ' – MTD Gross Sales','Total Sales Growth',S.customers,false],
   ['ar26','ar25',B.ar,'Top ' + nTop + ' – AR Exposure','Total AR Growth',S.customers,false],
   ['coll26','coll25',B.coll,'Top ' + nTop + ' – MTD Collection','Total Collection Growth',S.customers,false],
   ['ovd26','ovd25',B.ovd,'Top ' + nTop + ' – Due Amounts',null,S.ovdOrder,true]].forEach(function(d){
    const k26 = d[0], k25 = d[1], blk = d[2], title = d[3], glabel = d[4], list = d[5], isOvd = d[6];
    const head = ['Number', isOvd ? 'Customer Code' : 'Customer', 'Customer Name', 'Cluster',
                  isOvd ? 'Country Name' : 'Country', LC, LP];
    const rows = [{ h:0.19, cells:head.map(function(h, i){
      return { t:h, b:true, color:HT, fill:HDR, sz:9, align:(i >= 5 ? 'center' : 'left') }; }) }];
    for (let i = 0; i < nTop && list[i]; i++){
      const c = list[i], bg = i % 2 ? BA : BB;
      rows.push({ h:0.168, cells:[
        { t:String(i+1), fill:bg, sz:9, align:'center' },
        { t:c.code, fill:bg, sz:9 }, { t:c.name, fill:bg, sz:9 },
        { t:c.cluster, fill:bg, sz:9 }, { t:c.country, fill:bg, sz:9 },
        { t:fmtM(c[k26]), fill:bg, sz:9, align:'right' },
        { t:fmtM(c[k25]), fill:bg, sz:9, align:'right' }] });
    }
    // Mirrors the PPTX summary block: no grid on the mostly-blank totals
    // rows, just a top rule where "Grand Total" begins.
    const pad = function(n){ const a = []; for (let i = 0; i < n; i++) a.push({ t:'', fill:SUM, sz:9, line:false }); return a; };
    const padTop = function(n){ const a = []; for (let i = 0; i < n; i++) a.push({ t:'', fill:SUM, sz:9, lineTop:true }); return a; };
    rows.push({ h:0.168, cells:padTop(2).concat([{ t:'Grand Total', b:true, fill:SUM, sz:9, lineTop:true }], padTop(2),
      [{ t:fmtM(blk.top26), b:true, fill:SUM, sz:9, align:'right', lineTop:true },
       { t:fmtM(blk.top25), b:true, fill:SUM, sz:9, align:'right', lineTop:true }]) });
    rows.push({ h:0.09, cells:pad(7) });
    const sum = function(lbl, v26, v25, pct){
      return { h:0.168, cells:pad(2).concat([{ t:lbl, b:true, fill:SUM, sz:9, line:false }], pad(2),
        [{ t:pct ? fmtPct(v26, 0) : fmtM(v26), b:true, fill:SUM, sz:9, align:'right', line:false },
         { t:(v25 === null ? '' : (pct ? fmtPct(v25, 0) : fmtM(v25))), b:true, fill:SUM, sz:9, align:'right', line:false }]) };
    };
    rows.push(sum('Top ' + nTop, blk.top26, blk.top25));
    rows.push(sum('Remaining', blk.rem26, blk.rem25));
    rows.push(sum('Total', blk.tot26, blk.tot25));
    rows.push(sum(isOvd ? 'Top ' + nTop + ' Overdue %' : 'Top ' + nTop + ' %', blk.topPct26, blk.topPct25, true));
    if (!isOvd){
      rows.push(sum('Top ' + nTop + ' Growth', isFinite(blk.topGrowth) ? blk.topGrowth : 0, null, true));
      rows.push(sum(glabel, isFinite(blk.totGrowth) ? blk.totGrowth : 0, null, true));
    }
    out.push({ name:title, html: pvChrome() + pvTitle(title + AMT) + pvTable(0.66, BODY_Y, 8.68, frac, rows) });
  });

  /* 11 — closing */
  out.push({ name:'Thank you', html:
    pvRule(3.60, 3.62, 2.80, '8D8D8D') +
    '<div class="sl-txt" style="' + box(1.25, 3.95, 7.50) + ';text-align:center;color:#161616;font-weight:700;' + ptFont(28) + '">Thank you</div>' });

  return out;
}

let PV = { slides:[], idx:0 };
function openPreview(){
  if (!S.customers || !S.customers.length){ toast('Load the source workbooks first.', 'err'); return; }
  PV.slides = buildPreviewSlides();
  PV.idx = 0;
  $('#pvTitle').textContent = reportTitle();
  $('#pvBadge').textContent = PV.slides.length + ' slides';
  const rail = $('#pvRail');
  rail.innerHTML = PV.slides.map(function(s, i){
    return '<div class="pv-thumb" data-i="' + i + '" aria-current="' + (i === 0) + '" title="' + xesc(s.name) + '">' +
      '<span class="n">' + (i+1) + '</span>' +
      '<div class="slide mini" style="--ppi:16.2px">' + s.html + '</div></div>';
  }).join('');
  Array.prototype.forEach.call(rail.querySelectorAll('.pv-thumb'), function(el){
    el.addEventListener('click', function(){ PV.idx = +el.getAttribute('data-i'); paintPreview(); });
  });
  $('#pvBack').classList.add('on');
  document.body.style.overflow = 'hidden';
  paintPreview();
}
function paintPreview(){
  const s = PV.slides[PV.idx];
  $('#pvStage').innerHTML = '<div class="slide" id="pvSlide">' + s.html + '</div>';
  $('#pvCount').textContent = (PV.idx + 1) + ' / ' + PV.slides.length;
  Array.prototype.forEach.call($('#pvRail').querySelectorAll('.pv-thumb'), function(el, i){
    el.setAttribute('aria-current', String(i === PV.idx));
    if (i === PV.idx) el.scrollIntoView({ block:'nearest' });
  });
  sizePreview();
}
function sizePreview(){
  const el = $('#pvSlide');
  if (el) el.style.setProperty('--ppi', (el.getBoundingClientRect().width / SL_W) + 'px');
  Array.prototype.forEach.call($('#pvRail').querySelectorAll('.slide.mini'), function(m){
    m.style.setProperty('--ppi', (m.getBoundingClientRect().width / SL_W) + 'px');
  });
}
function closePreview(){
  $('#pvBack').classList.remove('on');
  document.body.style.overflow = '';
}

/* ============================================================================
   SECTION 14 — EVENT WIRING
   ========================================================================== */
function wire(){

  const dz = $('#dropzone'), fi = $('#fileInput');
  dz.addEventListener('click', function(){ fi.click(); });
  dz.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); fi.click(); } });
  fi.addEventListener('change', function(){ if (fi.files.length) ingestFiles(fi.files); fi.value = ''; });
  ['dragenter','dragover'].forEach(function(ev){
    dz.addEventListener(ev, function(e){ e.preventDefault(); e.stopPropagation(); dz.classList.add('drag'); });
  });
  ['dragleave','drop'].forEach(function(ev){
    dz.addEventListener(ev, function(e){ e.preventDefault(); e.stopPropagation(); if (ev==='dragleave' && dz.contains(e.relatedTarget)) return; dz.classList.remove('drag'); });
  });
  dz.addEventListener('drop', function(e){
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length) ingestFiles(dt.files);
  });
  window.addEventListener('dragover', function(e){ e.preventDefault(); });
  window.addEventListener('drop', function(e){ e.preventDefault(); });

  $$('#scopeSeg button').forEach(function(b){
    b.addEventListener('click', function(){
      S.clusterScope = b.getAttribute('data-scope');
      $$('#scopeSeg button').forEach(function(x){ x.setAttribute('aria-pressed', String(x === b)); });
      refreshAll();
    });
  });

  let tmr = null;
  $('#tblSearch').addEventListener('input', function(e){
    clearTimeout(tmr);
    tmr = setTimeout(function(){ S.search = e.target.value; renderTable(); }, 120);
  });
  $('#clusterFilter').addEventListener('change', function(e){ S.clusterFilter = e.target.value; renderTable(); });

  $('#btnXlsx').addEventListener('click', function(){ doExport('xlsx'); });
  $('#btnPptx').addEventListener('click', function(){ doExport('pptx'); });
  $('#btnBoth').addEventListener('click', function(){ doExport('both'); });
  $('#btnEmail').addEventListener('click', function(){ doExport('email'); });

  $('#btnSample').addEventListener('click', loadSampleData);
  $('#btnSampleFiles').addEventListener('click', downloadSampleFiles);
  $('#btnPreview').addEventListener('click', openPreview);
  $('#pvClose').addEventListener('click', closePreview);
  $('#pvPrev').addEventListener('click', function(){ if (PV.idx > 0){ PV.idx--; paintPreview(); } });
  $('#pvNext').addEventListener('click', function(){ if (PV.idx < PV.slides.length - 1){ PV.idx++; paintPreview(); } });
  $('#pvDownload').addEventListener('click', function(){ closePreview(); doExport('pptx'); });
  $('#pvBack').addEventListener('click', function(e){ if (e.target === $('#pvBack')) closePreview(); });
  window.addEventListener('keydown', function(e){
    if (!$('#pvBack').classList.contains('on')) return;
    if (e.key === 'Escape') closePreview();
    else if (e.key === 'ArrowLeft' && PV.idx > 0){ PV.idx--; paintPreview(); }
    else if (e.key === 'ArrowRight' && PV.idx < PV.slides.length - 1){ PV.idx++; paintPreview(); }
  });
  window.addEventListener('resize', function(){ if ($('#pvBack').classList.contains('on')) sizePreview(); });
}

async function doExport(kind){
  const bar = $('#expBar'), st = $('#expStatus');
  const set = function(pct, txt, cls){
    bar.classList.remove('hidden');
    bar.firstElementChild.style.width = pct + '%';
    st.textContent = txt; st.className = 'badge ' + (cls || 'badge-info');
  };
  const btns = [$('#btnXlsx'), $('#btnPptx'), $('#btnBoth'), $('#btnEmail')];
  btns.forEach(function(b){ b.disabled = true; });
  try{
    if (kind === 'email'){
      set(15, 'building workbook…');
      const x = await buildMasterXlsx();
      set(45, 'building presentation…');
      const p = await buildDeckPptx();
      set(80, 'composing email…');
      const eml = buildEml([
        { name:pptxFileName(), mime:MIME_PPTX, data:p },
        { name:xlsxFileName(), mime:MIME_XLSX, data:x }
      ]);
      downloadBlob(strU8(eml), reportTitle() + '.eml', 'message/rfc822');
      log('Generated email draft with 2 attachments (' + ((x.length + p.length)/1024).toFixed(0) + ' KB payload)', 'ok');
      set(100, 'draft ready', 'badge-ok');
      toast('Email draft downloaded — open it to launch Outlook with both files attached.', 'ok');
      setTimeout(function(){ bar.classList.add('hidden'); st.textContent = 'ready'; st.className = 'badge badge-neutral'; }, 3600);
      btns.forEach(function(b){ b.disabled = false; });
      renderLog();
      return;
    }
    if (kind === 'xlsx' || kind === 'both'){
      set(15, 'building workbook…');
      const u8 = await buildMasterXlsx();
      set(50, 'saving workbook…');
      downloadBlob(u8, xlsxFileName(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      log('Exported ' + xlsxFileName() + ' (' + (u8.length/1024).toFixed(0) + ' KB)', 'ok');
    }
    if (kind === 'pptx' || kind === 'both'){
      set(70, 'building presentation…');
      const u8 = await buildDeckPptx();
      set(95, 'saving presentation…');
      downloadBlob(u8, pptxFileName(), 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      log('Exported ' + pptxFileName() + ' (' + (u8.length/1024).toFixed(0) + ' KB)', 'ok');
    }
    set(100, 'complete', 'badge-ok');
    toast('Export complete.', 'ok');
    setTimeout(function(){ bar.classList.add('hidden'); st.textContent = 'ready'; st.className = 'badge badge-neutral'; }, 2600);
  }catch(e){
    log('Export failed: ' + (e && e.message), 'err');
    set(100, 'failed', 'badge-err');
    toast('Export failed — ' + (e && e.message), 'err');
  }finally{
    btns.forEach(function(b){ b.disabled = false; });
    renderLog();
  }
}

/* ============================================================================
   SECTION 15 — SHARED OOXML FOUNDATIONS
   ========================================================================== */
const NS_R  = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_A  = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_C  = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const SERIES_COLOR = ['161616', 'A8A8A8'];     // current / prior period
const HDR_FILL = '161616';

function themeXml(name){
  const accents = ['4472C4','ED7D31','A5A5A5','FFC000','5B9BD5','70AD47'];
  let acc = '';
  for (let i = 0; i < 6; i++) acc += '<a:accent' + (i+1) + '><a:srgbClr val="' + accents[i] + '"/></a:accent' + (i+1) + '>';
  const fillStyles =
    '<a:fillStyleLst>' +
      '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
      '<a:solidFill><a:schemeClr val="phClr"><a:lumMod val="110000"/><a:satMod val="105000"/><a:tint val="67000"/></a:schemeClr></a:solidFill>' +
      '<a:solidFill><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="103000"/><a:tint val="73000"/></a:schemeClr></a:solidFill>' +
    '</a:fillStyleLst>';
  const lineStyles =
    '<a:lnStyleLst>' +
      '<a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>' +
      '<a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>' +
      '<a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>' +
    '</a:lnStyleLst>';
  const effectStyles = '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>';
  const bgFill = '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/></a:schemeClr></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:shade val="90000"/></a:schemeClr></a:solidFill></a:bgFillStyleLst>';
  return XML_DECL +
    '<a:theme xmlns:a="' + NS_A + '" name="' + xesc(name || 'Office Theme') + '">' +
    '<a:themeElements>' +
      '<a:clrScheme name="Office">' +
        '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
        '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
        '<a:dk2><a:srgbClr val="44546A"/></a:dk2>' +
        '<a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>' + acc +
        '<a:hlink><a:srgbClr val="0563C1"/></a:hlink>' +
        '<a:folHlink><a:srgbClr val="954F72"/></a:folHlink>' +
      '</a:clrScheme>' +
      '<a:fontScheme name="Office">' +
        '<a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
        '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>' +
      '</a:fontScheme>' +
      '<a:fmtScheme name="Office">' + fillStyles + lineStyles + effectStyles + bgFill + '</a:fmtScheme>' +
    '</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';
}

function coreXml(title){
  const iso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return XML_DECL +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>' + xesc(title) + '</dc:title>' +
    '<dc:creator>Receivables Reporting Demo</dc:creator>' +
    '<cp:lastModifiedBy>Receivables Reporting Demo</cp:lastModifiedBy>' +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' + iso + '</dcterms:created>' +
    '<dcterms:modified xsi:type="dcterms:W3CDTF">' + iso + '</dcterms:modified>' +
    '</cp:coreProperties>';
}

/* ---------------------------------------------------------------------------
   Native DrawingML clustered-column chart (editable in Excel & PowerPoint)
   ------------------------------------------------------------------------- */
function chartXml(o){
  // o: { cats[], series:[{name, values[], color}], numFmt, sheetName, external }
  const nf = o.numFmt || '#,##0.00,,';
  const n = o.cats.length;
  const catRefBase = "'" + (o.sheetName || 'Sheet1') + "'!";
  const catRange = o.catRange || ('$A$2:$A$' + (n + 1));

  function strCache(vals){
    return '<c:ptCount val="' + vals.length + '"/>' + vals.map(function(v, i){
      return '<c:pt idx="' + i + '"><c:v>' + xesc(v) + '</c:v></c:pt>';
    }).join('');
  }
  function numCache(vals){
    return '<c:formatCode>' + xesc(nf) + '</c:formatCode><c:ptCount val="' + vals.length + '"/>' +
      vals.map(function(v, i){
        const num = (typeof v === 'number' && isFinite(v)) ? v : 0;
        return '<c:pt idx="' + i + '"><c:v>' + num + '</c:v></c:pt>';
      }).join('');
  }

  const sers = o.series.map(function(s, i){
    const valRange = s.valRange || ('$' + colLetter(i + 2) + '$2:$' + colLetter(i + 2) + '$' + (n + 1));
    const nameRange = s.nameRange || ('$' + colLetter(i + 2) + '$1');
    return '<c:ser>' +
      '<c:idx val="' + i + '"/><c:order val="' + i + '"/>' +
      '<c:tx><c:strRef><c:f>' + xesc(catRefBase + nameRange) + '</c:f>' +
        '<c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>' + xesc(s.name) + '</c:v></c:pt></c:strCache></c:strRef></c:tx>' +
      '<c:spPr><a:solidFill><a:srgbClr val="' + (s.color || SERIES_COLOR[i % 2]) + '"/></a:solidFill>' +
        '<a:ln><a:noFill/></a:ln></c:spPr>' +
      '<c:invertIfNegative val="0"/>' +
      '<c:dLbls>' +
        '<c:numFmt formatCode="' + xesc(nf) + '" sourceLinked="0"/>' +
        '<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>' +
        '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"/></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>' +
        '<c:dLblPos val="outEnd"/>' +
        '<c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/>' +
        '<c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/>' +
      '</c:dLbls>' +
      '<c:cat><c:strRef><c:f>' + xesc(catRefBase + catRange) + '</c:f><c:strCache>' + strCache(o.cats) + '</c:strCache></c:strRef></c:cat>' +
      '<c:val><c:numRef><c:f>' + xesc(catRefBase + valRange) + '</c:f><c:numCache>' + numCache(s.values) + '</c:numCache></c:numRef></c:val>' +
      '</c:ser>';
  }).join('');

  return XML_DECL +
  '<c:chartSpace xmlns:c="' + NS_C + '" xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '">' +
    '<c:date1904 val="0"/><c:lang val="en-US"/><c:roundedCorners val="0"/>' +
    '<c:chart>' +
      '<c:autoTitleDeleted val="1"/>' +
      '<c:plotArea><c:layout/>' +
        '<c:barChart>' +
          '<c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>' +
          sers +
          '<c:gapWidth val="219"/><c:overlap val="-27"/>' +
          '<c:axId val="538197152"/><c:axId val="538198712"/>' +
        '</c:barChart>' +
        '<c:catAx>' +
          '<c:axId val="538197152"/><c:scaling><c:orientation val="minMax"/></c:scaling>' +
          '<c:delete val="0"/><c:axPos val="b"/>' +
          '<c:numFmt formatCode="General" sourceLinked="1"/>' +
          '<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>' +
          '<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr>' +
          '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"/></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>' +
          '<c:crossAx val="538198712"/><c:crosses val="autoZero"/><c:auto val="1"/>' +
          '<c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/>' +
        '</c:catAx>' +
        '<c:valAx>' +
          '<c:axId val="538198712"/><c:scaling><c:orientation val="minMax"/></c:scaling>' +
          '<c:delete val="0"/><c:axPos val="l"/>' +
          '<c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="ECECEC"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>' +
          '<c:numFmt formatCode="' + xesc(nf) + '" sourceLinked="0"/>' +
          '<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>' +
          '<c:spPr><a:ln><a:noFill/></a:ln></c:spPr>' +
          '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"/></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>' +
          '<c:crossAx val="538197152"/><c:crosses val="autoZero"/><c:crossBetween val="between"/>' +
        '</c:valAx>' +
      '</c:plotArea>' +
      '<c:legend><c:legendPos val="b"/><c:overlay val="0"/>' +
        '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"/></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr></c:legend>' +
      '<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>' +
    '</c:chart>' +
    '<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>' +
    (o.external ? '<c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData>' : '') +
  '</c:chartSpace>';
}

/* ============================================================================
   SECTION 16 — XLSX WRITER
   ========================================================================== */
const NUMFMT = {
  ACC:  164,   // accounting, 2dp
  MIL:  165,   // millions, 2dp
  PCT:  166,   // 0%
  PLAIN:167    // #,##0.00
};
const ST = { DEF:0, HDR:1, ACC:2, MIL:3, PCT:4, BOLD:5, BACC:6, BMIL:7, BPCT:8, LBL:9, TXT:10 };

function xlsxStylesXml(){
  return XML_DECL +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="4">' +
      '<numFmt numFmtId="164" formatCode="_(* #,##0.00_);_(* \\(#,##0.00\\);_(* &quot;-&quot;??_);_(@_)"/>' +
      '<numFmt numFmtId="165" formatCode="#,##0.00,,"/>' +
      '<numFmt numFmtId="166" formatCode="0%"/>' +
      '<numFmt numFmtId="167" formatCode="#,##0.00"/>' +
    '</numFmts>' +
    '<fonts count="3">' +
      '<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>' +
      '<font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>' +
    '</fonts>' +
    '<fills count="4">' +
      '<fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF' + HDR_FILL + '"/><bgColor indexed="64"/></patternFill></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="2">' +
      '<border><left/><right/><top/><bottom/><diagonal/></border>' +
      '<border><left/><right/><top/><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="11">' +
      '<xf numFmtId="0"   fontId="0" fillId="0" borderId="0" xfId="0"/>' +                                                        /* 0 DEF  */
      '<xf numFmtId="0"   fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' + /* 1 HDR */
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +                                  /* 2 ACC  */
      '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +                                  /* 3 MIL  */
      '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +                                  /* 4 PCT  */
      '<xf numFmtId="0"   fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +                                          /* 5 BOLD */
      '<xf numFmtId="164" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +                    /* 6 BACC */
      '<xf numFmtId="165" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +                    /* 7 BMIL */
      '<xf numFmtId="166" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +                    /* 8 BPCT */
      '<xf numFmtId="0"   fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +                            /* 9 LBL  */
      '<xf numFmtId="49"  fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +                                  /* 10 TXT */
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '<dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2"/>' +
  '</styleSheet>';
}

/* --- cell + row builders --- */
function cS(ref, text, st){          // inline string
  if (text === null || text === undefined || text === '') return '';
  return '<c r="' + ref + '"' + (st ? ' s="' + st + '"' : '') + ' t="inlineStr"><is><t xml:space="preserve">' + xesc(text) + '</t></is></c>';
}
function cN(ref, v, st){             // number
  if (v === null || v === undefined || !isFinite(v)) return '';
  return '<c r="' + ref + '"' + (st ? ' s="' + st + '"' : '') + '><v>' + (Math.round(v * 1e6) / 1e6) + '</v></c>';
}
function cF(ref, formula, cached, st){   // formula + cached value
  const v = (typeof cached === 'number' && isFinite(cached)) ? '<v>' + (Math.round(cached * 1e6) / 1e6) + '</v>' : '';
  return '<c r="' + ref + '"' + (st ? ' s="' + st + '"' : '') + '><f>' + xesc(formula) + '</f>' + v + '</c>';
}
function rowXml(rIdx, cells){
  const body = cells.filter(Boolean).join('');
  if (!body) return '';
  return '<row r="' + rIdx + '">' + body + '</row>';
}
function sheetXml(rows, opts){
  const o = opts || {};
  return XML_DECL +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="' + NS_R + '">' +
    (o.dimension ? '<dimension ref="' + o.dimension + '"/>' : '') +
    '<sheetViews><sheetView' + (o.tab ? ' tabSelected="1"' : '') + ' workbookViewId="0">' +
      (o.freeze ? '<pane ySplit="' + o.freeze + '" topLeftCell="A' + (o.freeze+1) + '" activePane="bottomLeft" state="frozen"/>' +
                  '<selection pane="bottomLeft"/>' : '') +
    '</sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (o.cols ? '<cols>' + o.cols + '</cols>' : '') +
    '<sheetData>' + rows.filter(Boolean).join('') + '</sheetData>' +
    (o.autoFilter ? '<autoFilter ref="' + o.autoFilter + '"/>' : '') +
    (o.merges && o.merges.length ? '<mergeCells count="' + o.merges.length + '">' +
        o.merges.map(function(m){ return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>' : '') +
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    (o.drawing ? '<drawing r:id="rId1"/>' : '') +
    '</worksheet>';
}
function colsXml(widths){
  return widths.map(function(w, i){
    return '<col min="' + (i+1) + '" max="' + (i+1) + '" width="' + w + '" customWidth="1"/>';
  }).join('');
}
function drawingXml(fromCol, fromRow, toCol, toRow){
  return XML_DECL +
  '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="' + NS_A + '">' +
    '<xdr:twoCellAnchor>' +
      '<xdr:from><xdr:col>' + fromCol + '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + fromRow + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>' +
      '<xdr:to><xdr:col>' + toCol + '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + toRow + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>' +
      '<xdr:graphicFrame macro="">' +
        '<xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Chart 1"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>' +
        '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>' +
        '<a:graphic><a:graphicData uri="' + NS_C + '">' +
          '<c:chart xmlns:c="' + NS_C + '" xmlns:r="' + NS_R + '" r:id="rId1"/>' +
        '</a:graphicData></a:graphic>' +
      '</xdr:graphicFrame><xdr:clientData/>' +
    '</xdr:twoCellAnchor></xdr:wsDr>';
}
function relsXml(list){
  return XML_DECL + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    list.map(function(r){
      return '<Relationship Id="' + r.id + '" Type="' + r.type + '" Target="' + r.target + '"' +
             (r.mode ? ' TargetMode="' + r.mode + '"' : '') + '/>';
    }).join('') + '</Relationships>';
}
const RT = {
  sheet:  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet',
  styles: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
  theme:  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
  wb:     'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
  core:   'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
  app:    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties',
  drawing:'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing',
  chart:  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart',
  pkg:    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/package',
  slide:  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
  sldMaster:'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster',
  sldLayout:'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
  image:    'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'
};

function sref(name){ return /[^A-Za-z0-9_]/.test(name) ? "'" + name.replace(/'/g, "''") + "'" : name; }

/* Geometry of the generated workbook, derived from customer count. */
function xlsxGeom(){
  const n = S.customers.length;
  const nTop = Math.min(TOP_N, n);
  const rd = { start:3, end:2 + n };
  rd.label = rd.end + 2; rd.top = rd.end + 3; rd.rem = rd.end + 4; rd.tot = rd.end + 6; rd.chk = rd.end + 7;
  const pr = { start:3, end:2 + nTop };
  pr.grand = pr.end + 1; pr.top = pr.end + 3; pr.rem = pr.top + 1; pr.tot = pr.top + 2;
  pr.pct = pr.top + 3; pr.tgrow = pr.top + 4; pr.agrow = pr.top + 5;
  return { n:n, nTop:nTop, rd:rd, pr:pr };
}

async function buildMasterXlsx(){
  const P = S.period, G = xlsxGeom(), n = G.n, nTop = G.nTop;
  const cust = S.customers, ovdList = S.ovdOrder, B = S.blocks;
  const RD = 'Row Data', RD2 = 'Row Data 2';
  const LC = P.labelCur, LP = P.labelPri;

  /* ---------- 1. Row Data ---------- */
  const rdRows = [];
  rdRows.push(rowXml(1, [
    cF('F1', 'SUM(F' + G.rd.start + ':F' + G.rd.end + ')', B.sales.tot26, ST.BACC),
    cF('G1', 'SUM(G' + G.rd.start + ':G' + G.rd.end + ')', B.sales.tot25, ST.BACC),
    cF('H1', 'SUM(H' + G.rd.start + ':H' + G.rd.end + ')', B.coll.tot26,  ST.BACC),
    cF('I1', 'SUM(I' + G.rd.start + ':I' + G.rd.end + ')', B.coll.tot25,  ST.BACC),
    cF('J1', 'SUM(J' + G.rd.start + ':J' + G.rd.end + ')', B.ar.tot26,    ST.BACC),
    cF('K1', 'SUM(K' + G.rd.start + ':K' + G.rd.end + ')', B.ar.tot25,    ST.BACC)
  ]));
  const rdHead = ['#','Customer Number','Customer Name','Cluster','Country',
    'Sales ' + P.year, 'Sales ' + P.priorYear, 'Collection ' + P.year, 'Collection ' + P.priorYear,
    'AR ' + P.year, 'AR ' + P.priorYear];
  rdRows.push(rowXml(2, rdHead.map(function(h, i){ return cS(colLetter(i+1) + '2', h, ST.HDR); })));
  cust.forEach(function(c, i){
    const r = G.rd.start + i;
    rdRows.push(rowXml(r, [
      cN('A' + r, c.rank), cS('B' + r, c.code, ST.TXT), cS('C' + r, c.name), cS('D' + r, c.cluster), cS('E' + r, c.country),
      cN('F' + r, c.sales26, ST.ACC), cN('G' + r, c.sales25, ST.ACC),
      cN('H' + r, c.coll26,  ST.ACC), cN('I' + r, c.coll25,  ST.ACC),
      cN('J' + r, c.ar26,    ST.ACC), cN('K' + r, c.ar25,    ST.ACC)
    ]));
  });
  rdRows.push(rowXml(G.rd.label, ['F','G','H','I','J','K'].map(function(col, i){
    const labels = [P.year + ' Sales', P.priorYear + ' Sales', P.year + ' Collection', P.priorYear + ' Collection', P.year + ' AR', P.priorYear + ' AR'];
    return cS(col + G.rd.label, labels[i], ST.BOLD);
  })));
  function rdBlock(rowIdx, label, from, to, cached){
    const cells = [cS('E' + rowIdx, label, ST.BOLD)];
    ['F','G','H','I','J','K'].forEach(function(col, i){
      cells.push(cF(col + rowIdx, 'SUM(' + col + from + ':' + col + to + ')', cached[i], ST.BACC));
    });
    return rowXml(rowIdx, cells);
  }
  rdRows.push(rdBlock(G.rd.top, 'Top ' + nTop, G.rd.start, G.rd.start + nTop - 1,
    [B.sales.top26, B.sales.top25, B.coll.top26, B.coll.top25, B.ar.top26, B.ar.top25]));
  rdRows.push(rdBlock(G.rd.rem, 'Remaining', G.rd.start + nTop, G.rd.end,
    [B.sales.rem26, B.sales.rem25, B.coll.rem26, B.coll.rem25, B.ar.rem26, B.ar.rem25]));
  rdRows.push(rowXml(G.rd.tot, [cS('E' + G.rd.tot, 'Total', ST.BOLD)].concat(
    ['F','G','H','I','J','K'].map(function(col, i){
      const v = [B.sales.tot26, B.sales.tot25, B.coll.tot26, B.coll.tot25, B.ar.tot26, B.ar.tot25][i];
      return cF(col + G.rd.tot, col + G.rd.top + '+' + col + G.rd.rem, v, ST.BACC);
    }))));
  rdRows.push(rowXml(G.rd.chk, [cS('E' + G.rd.chk, 'Check', ST.BOLD)].concat(
    ['F','G','H','I','J','K'].map(function(col){
      return cF(col + G.rd.chk, col + G.rd.tot + '-' + col + '1', 0, ST.BACC);
    }))));

  /* ---------- 2. Row Data 2 ---------- */
  const rd2Rows = [];
  rd2Rows.push(rowXml(1, [
    cF('F1', 'SUM(F' + G.rd.start + ':F' + G.rd.end + ')', B.ovd.tot26, ST.BACC),
    cF('G1', 'SUM(G' + G.rd.start + ':G' + G.rd.end + ')', B.ovd.tot25, ST.BACC)
  ]));
  const rd2Head = ['#','Customer Number','Customer Name','Cluster','Country','Overdue ' + P.year, 'Overdue ' + P.priorYear];
  rd2Rows.push(rowXml(2, rd2Head.map(function(h, i){ return cS(colLetter(i+1) + '2', h, ST.HDR); })));
  ovdList.forEach(function(c, i){
    const r = G.rd.start + i;
    rd2Rows.push(rowXml(r, [
      cN('A' + r, c.ovdRank), cS('B' + r, c.code, ST.TXT), cS('C' + r, c.name),
      cS('D' + r, c.cluster), cS('E' + r, c.country),
      cN('F' + r, c.ovd26, ST.ACC), cN('G' + r, c.ovd25, ST.ACC)
    ]));
  });
  rd2Rows.push(rowXml(G.rd.label, [
    cS('F' + G.rd.label, 'Overdue ' + P.year, ST.BOLD), cS('G' + G.rd.label, 'Overdue ' + P.priorYear, ST.BOLD)]));
  function rd2Block(rowIdx, label, from, to, v26, v25){
    return rowXml(rowIdx, [cS('E' + rowIdx, label, ST.BOLD),
      cF('F' + rowIdx, 'SUM(F' + from + ':F' + to + ')', v26, ST.BACC),
      cF('G' + rowIdx, 'SUM(G' + from + ':G' + to + ')', v25, ST.BACC)]);
  }
  rd2Rows.push(rd2Block(G.rd.top, 'Top ' + nTop, G.rd.start, G.rd.start + nTop - 1, B.ovd.top26, B.ovd.top25));
  rd2Rows.push(rd2Block(G.rd.rem, 'Remaining', G.rd.start + nTop, G.rd.end, B.ovd.rem26, B.ovd.rem25));
  rd2Rows.push(rowXml(G.rd.tot, [cS('E' + G.rd.tot, 'Total', ST.BOLD),
    cF('F' + G.rd.tot, 'F' + G.rd.top + '+F' + G.rd.rem, B.ovd.tot26, ST.BACC),
    cF('G' + G.rd.tot, 'G' + G.rd.top + '+G' + G.rd.rem, B.ovd.tot25, ST.BACC)]));
  rd2Rows.push(rowXml(G.rd.chk, [cS('E' + G.rd.chk, 'Check', ST.BOLD),
    cF('F' + G.rd.chk, 'F' + G.rd.tot + '-F1', 0, ST.BACC),
    cF('G' + G.rd.chk, 'G' + G.rd.tot + '-G1', 0, ST.BACC)]));

  /* ---------- chart data sheets ---------- */
  function chartSheetRows(pivot, nameCur, namePri){
    const rows = [];
    rows.push(rowXml(3, [cS('E3', 'Row Labels', ST.BOLD), cS('F3', nameCur, ST.BOLD), cS('G3', namePri, ST.BOLD)]));
    pivot.forEach(function(p, i){
      const r = 4 + i;
      rows.push(rowXml(r, [
        cS('E' + r, p.name, p.isTotal ? ST.BOLD : 0),
        cN('F' + r, p.v26, p.isTotal ? ST.BACC : ST.ACC),
        cN('G' + r, p.v25, p.isTotal ? ST.BACC : ST.ACC)
      ]));
    });
    return rows;
  }

  /* ---------- presentation sheets ---------- */
  function presSheet(cfg){
    // cfg: {srcSheet, colCur, colPri, block, list, growthLabel, isOverdue}
    const rows = [];
    const head = ['Number','Customer','Customer Name','Cluster','Country', LC, LP];
    rows.push(rowXml(2, head.map(function(h, i){ return cS(colLetter(i+1) + '2', h, ST.HDR); })));
    const src = sref(cfg.srcSheet);
    for (let i = 0; i < nTop; i++){
      const r = G.pr.start + i, sr = G.rd.start + i, c = cfg.list[i];
      rows.push(rowXml(r, [
        cN('A' + r, i + 1),
        cF('B' + r, src + '!B' + sr, null, ST.TXT),
        cF('C' + r, src + '!C' + sr, null),
        cF('D' + r, src + '!D' + sr, null),
        cF('E' + r, src + '!E' + sr, null),
        cF('F' + r, src + '!' + cfg.colCur + sr, c ? c[cfg.k26] : 0, ST.MIL),
        cF('G' + r, src + '!' + cfg.colPri + sr, c ? c[cfg.k25] : 0, ST.MIL)
      ]));
    }
    const gr = G.pr.grand;
    rows.push(rowXml(gr, [cS('A' + gr, 'Grand Total', ST.BOLD),
      cF('F' + gr, 'SUM(F' + G.pr.start + ':F' + G.pr.end + ')', cfg.block.top26, ST.BMIL),
      cF('G' + gr, 'SUM(G' + G.pr.start + ':G' + G.pr.end + ')', cfg.block.top25, ST.BMIL)]));
    rows.push(rowXml(G.pr.top, [cS('C' + G.pr.top, 'Top ' + nTop, ST.BOLD),
      cF('F' + G.pr.top, 'SUM(F' + G.pr.start + ':F' + G.pr.end + ')', cfg.block.top26, ST.BMIL),
      cF('G' + G.pr.top, 'SUM(G' + G.pr.start + ':G' + G.pr.end + ')', cfg.block.top25, ST.BMIL)]));
    rows.push(rowXml(G.pr.rem, [cS('C' + G.pr.rem, 'Remaining', ST.BOLD),
      cF('F' + G.pr.rem, src + '!' + cfg.colCur + G.rd.rem, cfg.block.rem26, ST.MIL),
      cF('G' + G.pr.rem, src + '!' + cfg.colPri + G.rd.rem, cfg.block.rem25, ST.MIL)]));
    rows.push(rowXml(G.pr.tot, [cS('C' + G.pr.tot, 'Total', ST.BOLD),
      cF('F' + G.pr.tot, 'F' + G.pr.top + '+F' + G.pr.rem, cfg.block.tot26, ST.BMIL),
      cF('G' + G.pr.tot, 'G' + G.pr.top + '+G' + G.pr.rem, cfg.block.tot25, ST.BMIL)]));
    rows.push(rowXml(G.pr.pct, [cS('C' + G.pr.pct, cfg.isOverdue ? 'Top ' + nTop + ' Overdue %' : 'Top ' + nTop + ' %', ST.BOLD),
      cF('F' + G.pr.pct, 'IFERROR(F' + G.pr.top + '/F' + G.pr.tot + ',0)', cfg.block.topPct26, ST.PCT),
      cF('G' + G.pr.pct, 'IFERROR(G' + G.pr.top + '/G' + G.pr.tot + ',0)', cfg.block.topPct25, ST.PCT)]));
    if (!cfg.isOverdue){
      rows.push(rowXml(G.pr.tgrow, [cS('C' + G.pr.tgrow, 'Top ' + nTop + ' Growth', ST.BOLD),
        cF('F' + G.pr.tgrow, 'IFERROR((F' + G.pr.top + '-G' + G.pr.top + ')/ABS(G' + G.pr.top + '),0)',
           isFinite(cfg.block.topGrowth) ? cfg.block.topGrowth : 0, ST.PCT)]));
      rows.push(rowXml(G.pr.agrow, [cS('C' + G.pr.agrow, cfg.growthLabel, ST.BOLD),
        cF('F' + G.pr.agrow, 'IFERROR((F' + G.pr.tot + '-G' + G.pr.tot + ')/ABS(G' + G.pr.tot + '),0)',
           isFinite(cfg.block.totGrowth) ? cfg.block.totGrowth : 0, ST.PCT)]));
    }
    return rows;
  }

  /* ---------- Sheet1 (KPI scorecard) ---------- */
  const kpiRows = [];
  kpiRows.push(rowXml(6, [
    cS('F6', 'Variance', ST.HDR), cS('G6', 'Growth %', ST.HDR), cS('H6', 'KPI', ST.HDR),
    cS('I6', String(P.year), ST.HDR), cS('J6', String(P.priorYear), ST.HDR),
    cS('L6', 'Trend', ST.HDR), cS('M6', 'Signal', ST.HDR)]));
  const kpiSrc = [
    { sheet:'Sales',      neg:false },
    { sheet:'Collection', neg:true  },
    { sheet:'AR',         neg:false },
    { sheet:'Overdue',    neg:false }
  ];
  S.kpis.forEach(function(k, i){
    const r = 7 + i, sh = sref(kpiSrc[i].sheet), m = kpiSrc[i].neg ? '*-1' : '';
    kpiRows.push(rowXml(r, [
      cF('F' + r, 'I' + r + '-J' + r, k.variance, ST.MIL),
      cF('G' + r, 'IFERROR(I' + r + '/J' + r + '-1,0)', isFinite(k.growth) ? k.growth : 0, ST.PCT),
      cS('H' + r, k.label, ST.BOLD),
      cF('I' + r, sh + '!F' + G.pr.tot + m, k.v26, ST.MIL),
      cF('J' + r, sh + '!G' + G.pr.tot + m, k.v25, ST.MIL),
      cS('L' + r, k.arrow, ST.BOLD),
      cS('M' + r, k.wind, ST.BOLD)
    ]));
  });
  kpiRows.push(rowXml(12, [cS('H12', 'Amounts in Millions SAR. Generated ' + new Date().toISOString().slice(0,10) + '.')]));

  /* ---------- assemble sheets ---------- */
  const wCommon = colsXml([6.6, 19.9, 42.1, 15.5, 12.9, 16.1, 16.1, 18.6, 18.6, 16.1, 16.1]);
  const wPres   = colsXml([8.7, 13.0, 41.1, 16.7, 11.3, 14.7, 14.9]);
  const wChart  = colsXml([3, 3, 3, 3, 18.5, 16.5, 16.5]);
  const nc = S.pivots.sales.length;
  const chartCatRange = '$E$4:$E$' + (3 + nc);
  const chartValF = '$F$4:$F$' + (3 + nc);
  const chartValG = '$G$4:$G$' + (3 + nc);

  const sheetDefs = [
    { name:RD,  xml:sheetXml(rdRows,  { cols:wCommon, freeze:2, autoFilter:'A2:K' + G.rd.end, tab:true }) },
    { name:RD2, xml:sheetXml(rd2Rows, { cols:wCommon, freeze:2, autoFilter:'A2:G' + G.rd.end }) },
    { name:'sales chart', chart:0,
      xml:sheetXml(chartSheetRows(S.pivots.sales, 'Sum of ' + LC, 'Sum of ' + LP), { cols:wChart, drawing:true }) },
    { name:'Sales', xml:sheetXml(presSheet({ srcSheet:RD, colCur:'F', colPri:'G', block:B.sales, list:cust,
        k26:'sales26', k25:'sales25', growthLabel:'Total Sales Growth' }), { cols:wPres }) },
    { name:'collection chart', chart:1,
      xml:sheetXml(chartSheetRows(S.pivots.coll, 'Sum of ' + LC, 'Sum of ' + LP), { cols:wChart, drawing:true }) },
    { name:'Collection', xml:sheetXml(presSheet({ srcSheet:RD, colCur:'H', colPri:'I', block:B.coll, list:cust,
        k26:'coll26', k25:'coll25', growthLabel:'Total Collection Growth' }), { cols:wPres }) },
    { name:'ar chart', chart:2,
      xml:sheetXml(chartSheetRows(S.pivots.ar, 'Sum of ' + LC, 'Sum of ' + LP), { cols:wChart, drawing:true }) },
    { name:'AR', xml:sheetXml(presSheet({ srcSheet:RD, colCur:'J', colPri:'K', block:B.ar, list:cust,
        k26:'ar26', k25:'ar25', growthLabel:'Total AR Growth' }), { cols:wPres }) },
    { name:'overdue chart', chart:3,
      xml:sheetXml(chartSheetRows(S.pivots.ovd, 'Sum of ' + LC, 'Sum of ' + LP), { cols:wChart, drawing:true }) },
    { name:'Overdue', xml:sheetXml(presSheet({ srcSheet:RD2, colCur:'F', colPri:'G', block:B.ovd, list:ovdList,
        k26:'ovd26', k25:'ovd25', isOverdue:true }), { cols:wPres }) },
    { name:'Sheet1', xml:sheetXml(kpiRows, { cols:colsXml([3,3,3,3,3,14,12,18,15.7,15.7,4,8,12]) }) }
  ];

  /* ---------- charts ---------- */
  const chartSpecs = [
    { sheet:'sales chart',      pivot:S.pivots.sales },
    { sheet:'collection chart', pivot:S.pivots.coll },
    { sheet:'ar chart',         pivot:S.pivots.ar },
    { sheet:'overdue chart',    pivot:S.pivots.ovd }
  ];
  const chartParts = chartSpecs.map(function(cs, i){
    const swap = false;
    return chartXml({
      sheetName: cs.sheet,
      cats: cs.pivot.map(function(p){ return p.name; }),
      catRange: chartCatRange,
      numFmt: '#,##0.00,,',
      series: [
        { name:(swap ? 'Sum of ' + LP : 'Sum of ' + LC), values:cs.pivot.map(function(p){ return p.v26; }),
          color:SERIES_COLOR[0], valRange:chartValF, nameRange:'$F$3' },
        { name:(swap ? 'Sum of ' + LC : 'Sum of ' + LP), values:cs.pivot.map(function(p){ return p.v25; }),
          color:SERIES_COLOR[1], valRange:chartValG, nameRange:'$G$3' }
      ]
    });
  });

  /* ---------- package ---------- */
  const files = [];
  const sheetRels = [];
  sheetDefs.forEach(function(sd, i){
    files.push({ name:'xl/worksheets/sheet' + (i+1) + '.xml', data:sd.xml });
    sheetRels.push({ id:'rId' + (i+1), type:RT.sheet, target:'worksheets/sheet' + (i+1) + '.xml' });
    if (sd.chart !== undefined){
      const dIdx = sd.chart + 1;
      files.push({ name:'xl/drawings/drawing' + dIdx + '.xml', data:drawingXml(4, 10, 13, 32) });
      files.push({ name:'xl/drawings/_rels/drawing' + dIdx + '.xml.rels',
                   data:relsXml([{ id:'rId1', type:RT.chart, target:'../charts/chart' + dIdx + '.xml' }]) });
      files.push({ name:'xl/charts/chart' + dIdx + '.xml', data:chartParts[sd.chart] });
      files.push({ name:'xl/worksheets/_rels/sheet' + (i+1) + '.xml.rels',
                   data:relsXml([{ id:'rId1', type:RT.drawing, target:'../drawings/drawing' + dIdx + '.xml' }]) });
    }
  });

  const nSheets = sheetDefs.length;
  files.push({ name:'xl/workbook.xml', data: XML_DECL +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="' + NS_R + '">' +
    '<workbookPr/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="14000"/></bookViews>' +
    '<sheets>' + sheetDefs.map(function(sd, i){
      return '<sheet name="' + xesc(sd.name) + '" sheetId="' + (i+1) + '" r:id="rId' + (i+1) + '"/>';
    }).join('') + '</sheets>' +
    '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>' });

  files.push({ name:'xl/_rels/workbook.xml.rels', data:relsXml(sheetRels.concat([
    { id:'rId' + (nSheets+1), type:RT.styles, target:'styles.xml' },
    { id:'rId' + (nSheets+2), type:RT.theme,  target:'theme/theme1.xml' }
  ])) });
  files.push({ name:'xl/styles.xml', data:xlsxStylesXml() });
  files.push({ name:'xl/theme/theme1.xml', data:themeXml('Office Theme') });
  files.push({ name:'docProps/core.xml', data:coreXml('Master Sheet ' + P.monTitle + ' ' + P.year) });
  files.push({ name:'docProps/app.xml', data: XML_DECL +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
    'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    '<Application>Receivables Reporting Demo</Application><DocSecurity>0</DocSecurity>' +
    '<ScaleCrop>false</ScaleCrop><LinksUpToDate>false</LinksUpToDate>' +
    '<SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0300</AppVersion></Properties>' });
  files.push({ name:'_rels/.rels', data:relsXml([
    { id:'rId1', type:RT.wb,   target:'xl/workbook.xml' },
    { id:'rId2', type:RT.core, target:'docProps/core.xml' },
    { id:'rId3', type:RT.app,  target:'docProps/app.xml' }
  ]) });

  let ct = XML_DECL + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>';
  for (let i = 0; i < nSheets; i++)
    ct += '<Override PartName="/xl/worksheets/sheet' + (i+1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
  for (let i = 1; i <= 4; i++){
    ct += '<Override PartName="/xl/drawings/drawing' + i + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
    ct += '<Override PartName="/xl/charts/chart' + i + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>';
  }
  ct += '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
        '</Types>';
  files.unshift({ name:'[Content_Types].xml', data:ct });

  return zipBuild(files);
}

/* ============================================================================
   SECTION 17 — PPTX WRITER
   ========================================================================== */
const EMU = 914400;
const SLIDE_W = 9144000, SLIDE_H = 6858000;      // 10in x 7.5in (4:3), matches template
const DECK_FONT = 'Aptos Narrow';
function inEmu(v){ return Math.round(v * EMU); }

/* Slide-title geometry: the title must not overrun the rule below it. */
const TITLE_X = 0.95, TITLE_Y = 0.20, TITLE_W = 7.05, TITLE_H = 0.88;
const RULE_Y  = 1.16;
const BODY_Y  = 1.36;

/* Pick the largest point size whose wrapped text still fits `maxLines`.
   Average advance for a narrow bold face is ~0.47em — close enough to keep
   long month/metric titles inside the box without manual tuning. */
function autoTitlePt(text, widthIn, maxPt, minPt, maxLines){
  const wPt = widthIn * 72;
  for (let pt = maxPt; pt > minPt; pt--){
    const perLine = Math.max(8, Math.floor(wPt / (pt * 0.47)));
    if (Math.ceil(String(text).length / perLine) <= maxLines) return pt;
  }
  return minPt;
}

/* ---- text body ---- */
function txBody(paras, opts){
  const o = opts || {};
  const bp = '<a:bodyPr wrap="square" lIns="' + (o.lIns !== undefined ? o.lIns : 45720) + '" tIns="45720" rIns="45720" bIns="45720" ' +
             'anchor="' + (o.anchor || 't') + '"' + (o.autofit === false ? '' : '') + '><a:normAutofit/></a:bodyPr><a:lstStyle/>';
  const body = paras.map(function(p){
    const align = p.align ? ' algn="' + p.align + '"' : '';
    const lvl = p.level ? ' lvl="' + p.level + '"' : '';
    const marL = (p.marL !== undefined) ? ' marL="' + p.marL + '" indent="' + (p.indent || 0) + '"' : '';
    const bullet = p.bullet ? '<a:buFont typeface="Arial"/><a:buChar char="&#8226;"/>' : '<a:buNone/>';
    const spc = p.spaceBefore ? '<a:spcBef><a:spcPts val="' + p.spaceBefore + '"/></a:spcBef>' : '';
    const rPr = function(tag, close){
      return '<' + tag + ' lang="en-US" sz="' + (p.sz || 1200) * 1 + '"' +
        (p.b ? ' b="1"' : ' b="0"') + (p.i ? ' i="1"' : '') + ' dirty="0"' + (close ? '/>' : '>');
    };
    const fill = '<a:solidFill><a:srgbClr val="' + (p.color || '000000') + '"/></a:solidFill>' +
                 '<a:latin typeface="' + xesc(p.font || DECK_FONT) + '"/><a:cs typeface="' + xesc(p.font || DECK_FONT) + '"/>';
    if (!p.text) return '<a:p><a:pPr' + lvl + align + marL + '>' + spc + bullet + '</a:pPr><a:endParaRPr lang="en-US" sz="' + (p.sz||1200) + '"/></a:p>';
    return '<a:p><a:pPr' + lvl + align + marL + '>' + spc + bullet + '</a:pPr>' +
      '<a:r>' + rPr('a:rPr', false) + fill + '</a:rPr><a:t>' + xesc(p.text) + '</a:t></a:r></a:p>';
  }).join('');
  return '<p:txBody>' + bp + body + '</p:txBody>';
}
function spTextBox(id, name, x, y, w, h, paras, opts){
  const o = opts || {};
  return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="' + xesc(name) + '"/>' +
    '<p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>' +
    '<p:spPr><a:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + w + '" cy="' + h + '"/></a:xfrm>' +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
    (o.fill ? '<a:solidFill><a:srgbClr val="' + o.fill + '"/></a:solidFill>' : '<a:noFill/>') +
    '</p:spPr>' + txBody(paras, o) + '</p:sp>';
}
function spChartFrame(id, name, x, y, w, h, rid){
  return '<p:graphicFrame><p:nvGraphicFramePr>' +
    '<p:cNvPr id="' + id + '" name="' + xesc(name) + '"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>' +
    '<p:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + w + '" cy="' + h + '"/></p:xfrm>' +
    '<a:graphic><a:graphicData uri="' + NS_C + '">' +
      '<c:chart xmlns:c="' + NS_C + '" xmlns:r="' + NS_R + '" r:id="' + rid + '"/>' +
    '</a:graphicData></a:graphic></p:graphicFrame>';
}
/* rows: [{cells:[{t,align,b,color,fill,sz}], h}] */
function spTable(id, name, x, y, w, colW, rows){
  const grid = colW.map(function(c){ return '<a:gridCol w="' + c + '"/>'; }).join('');
  const trs = rows.map(function(r){
    const tcs = r.cells.map(function(c){
      const sz = c.sz || 900;
      const col = c.color || '000000';
      const p = '<a:p><a:pPr algn="' + (c.align || 'l') + '"/>' +
        (c.t === '' || c.t === null || c.t === undefined
          ? '<a:endParaRPr lang="en-US" sz="' + sz + '"/>'
          : '<a:r><a:rPr lang="en-US" sz="' + sz + '"' + (c.b ? ' b="1"' : ' b="0"') + ' dirty="0">' +
            '<a:solidFill><a:srgbClr val="' + col + '"/></a:solidFill>' +
            '<a:latin typeface="' + DECK_FONT + '"/><a:cs typeface="' + DECK_FONT + '"/></a:rPr>' +
            '<a:t>' + xesc(c.t) + '</a:t></a:r>') + '</a:p>';
      const marks = 'marL="36000" marR="36000" marT="18000" marB="18000" anchor="ctr"';
      const fill = c.fill ? '<a:solidFill><a:srgbClr val="' + c.fill + '"/></a:solidFill>' : '<a:noFill/>';
      // c.line === false drops the grid on this cell — used for the blank
      // padding cells (and the whole totals block) so the summary reads as
      // plain text rather than a grid drawn over mostly empty space.
      // c.lineTop draws only a top rule, used to divide the summary from
      // the detail rows above it without boxing every cell.
      const noLn = '<a:noFill/>';
      const gridLn = '<a:solidFill><a:srgbClr val="BFBFBF"/></a:solidFill>';
      const ln = (c.line === false)
        ? '<a:lnL>' + noLn + '</a:lnL><a:lnR>' + noLn + '</a:lnR><a:lnT>' + noLn + '</a:lnT><a:lnB>' + noLn + '</a:lnB>'
        : c.lineTop
        ? '<a:lnL>' + noLn + '</a:lnL><a:lnR>' + noLn + '</a:lnR><a:lnT w="9525">' + gridLn + '</a:lnT><a:lnB>' + noLn + '</a:lnB>'
        : '<a:lnL w="6350">' + gridLn + '</a:lnL><a:lnR w="6350">' + gridLn + '</a:lnR>' +
          '<a:lnT w="6350">' + gridLn + '</a:lnT><a:lnB w="6350">' + gridLn + '</a:lnB>';
      return '<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>' + p + '</a:txBody>' +
             '<a:tcPr ' + marks + '>' + ln + fill + '</a:tcPr></a:tc>';
    }).join('');
    return '<a:tr h="' + (r.h || 155000) + '">' + tcs + '</a:tr>';
  }).join('');
  const totalH = rows.reduce(function(a, r){ return a + (r.h || 155000); }, 0);
  return '<p:graphicFrame><p:nvGraphicFramePr>' +
    '<p:cNvPr id="' + id + '" name="' + xesc(name) + '"/>' +
    '<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>' +
    '<p:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + w + '" cy="' + totalH + '"/></p:xfrm>' +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">' +
      '<a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>' + grid + '</a:tblGrid>' + trs + '</a:tbl>' +
    '</a:graphicData></a:graphic></p:graphicFrame>';
}
function slideXml(shapes){
  return XML_DECL +
  '<p:sld xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
    '<p:cSld><p:spTree>' +
      '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
        '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
      shapes.join('') +
    '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
}
function slideMasterXml(){
  const txStyle = function(tag){
    let lv = '';
    for (let i = 1; i <= 9; i++){
      lv += '<a:lvl' + i + 'pPr marL="' + ((i-1) * 342900) + '" algn="l" rtl="0">' +
            '<a:defRPr sz="' + (tag === 'titleStyle' ? 4400 : 1800) + '" kern="1200">' +
            '<a:solidFill><a:schemeClr val="tx1"/></a:solidFill>' +
            '<a:latin typeface="+mn-lt"/></a:defRPr></a:lvl' + i + 'pPr>';
    }
    return '<p:' + tag + '>' + lv + '</p:' + tag + '>';
  };
  return XML_DECL +
  '<p:sldMaster xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
    '<p:cSld><p:bg><p:bgPr><a:solidFill><a:schemeClr val="bg1"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>' +
    '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
    '</p:spTree></p:cSld>' +
    '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" ' +
      'accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
    '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
    '<p:txStyles>' + txStyle('titleStyle') + txStyle('bodyStyle') + txStyle('otherStyle') + '</p:txStyles>' +
  '</p:sldMaster>';
}
function slideLayoutXml(name){
  return XML_DECL +
  '<p:sldLayout xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
  'type="blank" preserve="1">' +
    '<p:cSld name="' + xesc(name) + '"><p:spTree>' +
      '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
    '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>' +
  '</p:sldLayout>';
}
/* Thin rule used under slide titles. */
function spRule(id, xIn, yIn, wIn, color){
  return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="Rule"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>' +
    '<p:spPr><a:xfrm><a:off x="' + inEmu(xIn) + '" y="' + inEmu(yIn) + '"/>' +
    '<a:ext cx="' + inEmu(wIn) + '" cy="' + inEmu(0.028) + '"/></a:xfrm>' +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
    '<a:solidFill><a:srgbClr val="' + color + '"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr>' +
    '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>';
}
/* A single filled, borderless rectangle — the building block for the native
   PPTX waterfall bars (kept as plain shapes, not a chart, so each bar can
   carry its own colour — increase/decrease/total — which a chart series
   cannot do per-point without much more machinery). */
function spRect(id, xIn, yIn, wIn, hIn, color, opacityPct){
  const alpha = (opacityPct === undefined) ? '' : '<a:alpha val="' + (opacityPct * 1000) + '"/>';
  return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="Bar"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>' +
    '<p:spPr><a:xfrm><a:off x="' + inEmu(xIn) + '" y="' + inEmu(yIn) + '"/>' +
    '<a:ext cx="' + inEmu(Math.max(wIn, 0.001)) + '" cy="' + inEmu(Math.max(hIn, 0.02)) + '"/></a:xfrm>' +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
    '<a:solidFill><a:srgbClr val="' + color + '">' + alpha + '</a:srgbClr></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr>' +
    '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>';
}
/* Centered plain-text label used by the waterfall (value labels, category
   labels) — thin wrapper around spTextBox with inch coordinates. */
function spLabel(id, xIn, yIn, wIn, hIn, text, opts){
  const o = opts || {};
  return spTextBox(id, 'Label', inEmu(xIn), inEmu(yIn), inEmu(wIn), inEmu(hIn),
    [{ text:text, sz:(o.pt || 9) * 100, b:!!o.b, color:o.color || '000000', align:o.align || 'ctr' }],
    { anchor:o.anchor || 'ctr' });
}
/* Native waterfall built from plain shapes: Beginning AR -> Sales ->
   Collections -> AP Offset -> Ending AR. Mirrors renderBridge()'s layout
   logic (running position, shared axis) but in inches instead of SVG px. */
function buildBridgeShapes(steps, xIn, yIn, wIn, hIn, idStart){
  let id = idStart;
  let run = 0, lo = 0, hi = 0;
  const laid = steps.map(function(st){
    if (st.type === 'total'){
      const rec = { st:st, from:0, to:st.value };
      lo = Math.min(lo, 0, rec.to); hi = Math.max(hi, 0, rec.to);
      run = st.value;
      return rec;
    }
    const from = run, to = run + st.value;
    run = to;
    lo = Math.min(lo, from, to); hi = Math.max(hi, from, to);
    return { st:st, from:from, to:to };
  });
  const span = (hi - lo) || 1;
  const y = function(v){ return yIn + hIn - ((v - lo) / span) * hIn; };

  const shapes = [];
  // zero baseline
  shapes.push(spRect(id++, xIn, y(0), wIn, 0.012, 'D1D1D1'));

  const n = laid.length, bandW = wIn / n, barW = Math.min(1.15, bandW * 0.56);
  laid.forEach(function(rec, i){
    const cx = xIn + bandW * i + bandW / 2;
    const bx = cx - barW / 2;
    const yTop = Math.min(y(rec.from), y(rec.to));
    const hh = Math.max(0.02, Math.abs(y(rec.to) - y(rec.from)));
    const color = rec.st.type === 'total' ? '161616' : (rec.st.value >= 0 ? '8D8D8D' : 'D9D9D9');
    shapes.push(spRect(id++, bx, yTop, barW, hh, color));

    const above = (rec.st.value >= 0 || rec.st.type === 'total');
    const sign = (rec.st.type !== 'total' && rec.st.value > 0) ? '+' : '';
    const labelY = above ? Math.max(yIn, yTop - 0.26) : yTop + hh + 0.02;
    shapes.push(spLabel(id++, cx - 0.75, labelY, 1.5, 0.24, sign + fmtM(rec.st.value) + 'M', { pt:10, b:true }));
    shapes.push(spLabel(id++, cx - 0.75, yIn + hIn + 0.06, 1.5, 0.28, rec.st.label, { pt:9 }));
  });
  return shapes;
}
/* ---- minimal embedded workbook backing each chart ---- */
async function miniWorkbook(cats, seriesNames, seriesValues){
  const rows = [];
  rows.push(rowXml(1, [cS('A1', ' ')].concat(seriesNames.map(function(nm, i){
    return cS(colLetter(i+2) + '1', nm);
  }))));
  cats.forEach(function(c, i){
    const r = i + 2;
    const cells = [cS('A' + r, c)];
    seriesValues.forEach(function(vals, si){ cells.push(cN(colLetter(si+2) + r, vals[i])); });
    rows.push(rowXml(r, cells));
  });
  const files = [
    { name:'[Content_Types].xml', data: XML_DECL +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>' },
    { name:'_rels/.rels', data:relsXml([{ id:'rId1', type:RT.wb, target:'xl/workbook.xml' }]) },
    { name:'xl/workbook.xml', data: XML_DECL +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="' + NS_R + '">' +
      '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name:'xl/_rels/workbook.xml.rels', data:relsXml([
      { id:'rId1', type:RT.sheet,  target:'worksheets/sheet1.xml' },
      { id:'rId2', type:RT.styles, target:'styles.xml' }]) },
    { name:'xl/styles.xml', data:xlsxStylesXml() },
    { name:'xl/worksheets/sheet1.xml', data:sheetXml(rows, {}) }
  ];
  return zipBuild(files);
}

/* ---- narrative helpers ---- */
function pctShort(g){
  if (!isFinite(g)) return 'n/a';
  const v = Math.abs(g * 100);
  const s = v >= 10 ? v.toFixed(0) : v.toFixed(1);
  return s.replace(/\.0$/, '');
}
function kpiSentence(k){
  const dir = k.variance > 0 ? 'Increased' : (k.variance < 0 ? 'Decreased' : 'Flat');
  if (k.variance === 0) return k.label + ': Flat versus the same period last year.';
  return k.label + ': ' + dir + ' by ' + pctShort(k.growth) + '% (SAR ' +
         fmtM(Math.abs(k.variance)) + 'M) compared to the same period last year.';
}
/* Best practice: lead with the mechanism, not a flat list of four equal
   bullets. Sales/Collection moving in opposite directions is what actually
   drove the AR change — state that relationship, generically for any month
   (it also degrades gracefully when everything moves the same way). */
function buildHeadline(){
  if (!S.kpis || !S.kpis.length) return '';
  const byKey = {}; S.kpis.forEach(function(k){ byKey[k.key] = k; });
  const sales = byKey.sales, coll = byKey.coll, ar = byKey.ar;
  if (!sales || !coll || !ar) return '';
  const verb = function(k, up, down, flat){ return k.variance > 0 ? up : (k.variance < 0 ? down : flat); };
  const salesVerb = verb(sales, 'grew', 'declined', 'held flat');
  const collVerb  = verb(coll,  'grew', 'declined', 'held flat');
  const arVerb    = verb(ar,    'increased', 'decreased', 'was flat');
  const diverge = (sales.variance > 0) !== (coll.variance > 0) && sales.variance !== 0 && coll.variance !== 0;
  const conj = diverge ? 'while' : 'and';
  let s = 'Sales ' + salesVerb + ' ' + pctShort(sales.growth) + '% ' + conj +
          ' collections ' + collVerb + ' ' + pctShort(coll.growth) + '%';
  s += ' — accounts receivable ' + arVerb + ' ' + pctShort(ar.growth) + '%' + (diverge ? ' as a result.' : ' this period.');
  return s;
}

async function buildDeckPptx(){
  const P = S.period, B = S.blocks, G = xlsxGeom(), nTop = G.nTop;
  const LC = P.labelCur, LP = P.labelPri;
  // Clean, white table body — only the header row is filled.
  const HDR_TXT = 'FFFFFF', BAND_A = 'FFFFFF', BAND_B = 'FFFFFF', SUM_FILL = 'FFFFFF';

  function titleShape(text){
    const pt = autoTitlePt(text, TITLE_W, 20, 12, 2);
    return spTextBox(2, 'Title 1', inEmu(TITLE_X), inEmu(TITLE_Y), inEmu(TITLE_W), inEmu(TITLE_H),
      [{ text:text, sz:pt * 100, b:true, color:'161616', align:'l' }], { anchor:'ctr' });
  }
  // rule repeated on every content slide
  const CHROME = [ spRule(91, 0.95, RULE_Y, 8.68, '161616') ];
  // Grand Total, shown beside the chart rather than as a fifth distorting bar
  // (best practice: a portfolio total is not a peer of the cluster values).
  function totalCallout(id, rows){
    const t = rows.filter(function(r){ return r.isTotal; })[0];
    if (!t) return '';
    return spTextBox(id, 'Grand Total', inEmu(6.10), inEmu(RULE_Y + 0.06), inEmu(2.58), inEmu(0.30),
      [{ text:'Grand Total  ' + fmtM(t.v26) + 'M vs ' + fmtM(t.v25) + 'M', sz:1100, b:true, color:'161616', align:'r' }],
      { anchor:'ctr' });
  }
  const AMT = ' (Amounts in Millions SAR)';

  /* ---------- slide 1 — title ---------- */
  const slide1 = slideXml([
    spRule(91, 3.00, 4.62, 4.00, '8D8D8D'),
    spTextBox(2, 'Title 3', inEmu(1.00), inEmu(2.55), inEmu(8.00), inEmu(1.90),
      [{ text:'Sales & Receivables', sz:4000, b:true, color:'161616', align:'ctr', font:'Arial' },
       { text:'MTD ' + P.monTitle + ' – ' + P.year + ' Results', sz:4000, b:true, color:'161616', align:'ctr', font:'Arial' }],
      { anchor:'ctr' }),
    spTextBox(3, 'Subtitle', inEmu(1.00), inEmu(4.85), inEmu(8.00), inEmu(0.50),
      [{ text:'Amounts in Millions SAR  ·  ' + P.monFull + ' ' + P.year + ' versus ' + P.monFull + ' ' + P.priorYear,
         sz:1400, b:false, color:'606060', align:'ctr' }], { anchor:'ctr' })
  ]);

  /* ---------- slide 2 — executive summary ---------- */
  const topOvd = S.ovdOrder.filter(function(c){ return c.ovd26 > 0; }).slice(0, 5);
  const paras = [];
  const headline = buildHeadline();
  if (headline) paras.push({ text:headline, sz:1400, b:true, color:'161616' });
  paras.push({ text:'MTD ' + P.monTitle + ' ' + P.year + ' versus ' + P.monTitle + ' ' + P.priorYear + '.',
    sz:1050, b:false, color:'606060' });
  paras.push({ text:'', sz:500 });
  paras.push({ text:'Key Findings:', sz:1200, b:true, color:'000000' });
  S.kpis.forEach(function(k){
    const isOvd = (k.key === 'ovd');
    paras.push({ text:kpiSentence(k) + (isOvd && topOvd.length ? ' Details as below:' : ''),
      sz:1150, b:true, color:'000000', level:1, bullet:true, marL:285750, indent:-285750 });
  });
  topOvd.forEach(function(c){
    const note = S.commentary[c.code];
    paras.push({ text:'- ' + c.name + ' (' + c.cluster + ')' + (c.country ? ' – ' + c.country : '') +
      ': SAR ' + fmtM(c.ovd26) + 'M.' + (note ? ' (' + note + ')' : ''),
      sz:1000, b:true, color:'000000', level:2, marL:571500, indent:0 });
  });

  const kpiTableRows = [{
    h:170000, cells:[
      { t:'', fill:HDR_FILL }, { t:String(P.year), b:true, align:'ctr', color:HDR_TXT, fill:HDR_FILL, sz:1000 },
      { t:String(P.priorYear), b:true, align:'ctr', color:HDR_TXT, fill:HDR_FILL, sz:1000 },
      { t:'', fill:HDR_FILL }, { t:'', fill:HDR_FILL }]
  }];
  S.kpis.forEach(function(k, i){
    const bg = i % 2 ? BAND_A : BAND_B;
    kpiTableRows.push({ h:170000, cells:[
      { t:k.label, b:true, fill:bg, sz:1000 },
      { t:fmtM(k.v26), align:'ctr', fill:bg, sz:1000 },
      { t:fmtM(k.v25), align:'ctr', fill:bg, sz:1000 },
      { t:k.arrow, align:'ctr', b:true, fill:bg, sz:1000, color:(k.variance > 0 ? '161616' : '161616') },
      { t:k.wind, align:'ctr', b:true, fill:bg, sz:1000, color:(k.favourable === null ? '000000' : (k.favourable ? '161616' : '161616')) }
    ]});
  });
  const slide2 = slideXml(CHROME.concat([
    titleShape('Executive Summary' + AMT),
    spTextBox(3, 'TextBox 4', inEmu(0.35), inEmu(BODY_Y - 0.06), inEmu(9.29), inEmu(3.35), paras, { anchor:'t' }),
    spTable(4, 'Table 5', inEmu(0.35), inEmu(4.80), inEmu(9.29),
      [inEmu(3.05), inEmu(1.45), inEmu(1.45), inEmu(1.10), inEmu(2.24)], kpiTableRows)
  ]));

  /* ---------- slide 3 — AR bridge ----------
     Best practice: show the mechanism behind the AR figure right after the
     summary, before drilling into cluster/customer detail. Native shapes
     (not a chart) so bars can each carry their own increase/decrease/total
     colour. */
  const bridge = portfolioBridgeSteps();
  const bridgeOk = Math.abs(bridge.resid) <= 0.05;
  const bridgeShapes = buildBridgeShapes(bridge.steps, 0.95, BODY_Y + 0.30, 8.10, 3.30, 200);
  const bridgeSlide = slideXml(CHROME.concat([
    titleShape('Accounts Receivable Bridge' + AMT),
    spLabel(190, 0.95, BODY_Y, 8.10, 0.24,
      'Beginning AR rolled forward through Sales, Collections and AP Offsets to Ending AR.',
      { pt:10, color:'606060', align:'l' })
  ]).concat(bridgeShapes).concat([
    spLabel(299, 0.95, BODY_Y + 3.98, 8.10, 0.24,
      (bridgeOk ? 'Reconciled — ' : 'Residual ' + fmtN(bridge.resid, 2) + ' SAR — ') +
      'Actual AR ' + fmtM(bridge.endAct) + 'M vs Calculated ' + fmtM(bridge.endCalc) + 'M',
      { pt:10, b:true, color:bridgeOk ? '161616' : '161616', align:'l' })
  ]));

  /* ---------- slides 4–7 — cluster charts ---------- */
  const chartSlideDefs = [
    { pivot:S.pivots.sales, title:'MTD Gross Sales – per Cluster' + AMT },
    { pivot:S.pivots.ar,    title:'Exposure (Account Receivable) - per Cluster' + AMT },
    { pivot:S.pivots.coll,  title:'MTD Collection – per Cluster' + AMT },
    { pivot:S.pivots.ovd,   title:'Due Amounts – per Cluster' + AMT }
  ];
  const chartSlides = chartSlideDefs.map(function(d, i){
    return slideXml(CHROME.concat([
      titleShape(d.title),
      totalCallout(4, d.pivot),
      spChartFrame(3, 'Chart ' + (i+1), inEmu(0.61), inEmu(BODY_Y), inEmu(8.77), inEmu(4.50), 'rId3')
    ]));
  });

  /* ---------- slides 7–10 — Top-20 tables ---------- */
  const COLS7 = [559948, 723834, 2949970, 1055024, 669206, 915037, 1065266];
  const COLS8 = [500000, 650000, 1700000, 1700000, 950000, 620000, 900000, 918285];

  function topTable(cfg){
    // cfg: {list, k26, k25, block, isOverdue, dupName}
    const dup = !!cfg.dupName;
    const head = dup
      ? ['Number','Customer Code','Customer Name','Customer Name','Cluster','Country Name', LC, LP]
      : ['Number', cfg.isOverdue ? 'Customer Code' : 'Customer', 'Customer Name', 'Cluster',
         cfg.isOverdue ? 'Country Name' : 'Country', LC, LP];
    const ncol = head.length;
    const rows = [{ h:170000, cells:head.map(function(h, i){
      return { t:h, b:true, color:HDR_TXT, fill:HDR_FILL, sz:900, align:(i >= ncol-2 ? 'ctr' : 'l') };
    })}];
    for (let i = 0; i < nTop; i++){
      const c = cfg.list[i];
      if (!c) break;
      const bg = i % 2 ? BAND_A : BAND_B;
      const base = dup
        ? [String(i+1), c.code, c.name, c.name, c.cluster, c.country]
        : [String(i+1), c.code, c.name, c.cluster, c.country];
      const cells = base.map(function(t, ci){
        return { t:t, fill:bg, sz:900, align:(ci === 0 ? 'ctr' : 'l') };
      });
      cells.push({ t:fmtM(c[cfg.k26]), fill:bg, sz:900, align:'r' });
      cells.push({ t:fmtM(c[cfg.k25]), fill:bg, sz:900, align:'r' });
      rows.push({ h:155000, cells:cells });
    }
    // Summary block (Grand Total downward) carries no grid — it's mostly
    // blank cells and a full border on every one of them reads as visual
    // noise rather than a table. A single top rule marks where it begins.
    const pad = function(n){ const a = []; for (let i = 0; i < n; i++) a.push({ t:'', fill:SUM_FILL, sz:900, line:false }); return a; };
    const padTop = function(n){ const a = []; for (let i = 0; i < n; i++) a.push({ t:'', fill:SUM_FILL, sz:900, lineTop:true }); return a; };
    // Grand total — label sits in the wide "Customer Name" column so it never wraps
    const gLead = dup ? 4 : 3;
    rows.push({ h:155000, cells:padTop(gLead - 1)
      .concat([{ t:'Grand Total', b:true, fill:SUM_FILL, sz:900, lineTop:true }], padTop(ncol - gLead - 2),
      [{ t:fmtM(cfg.block.top26), b:true, fill:SUM_FILL, sz:900, align:'r', lineTop:true },
       { t:fmtM(cfg.block.top25), b:true, fill:SUM_FILL, sz:900, align:'r', lineTop:true }])});
    rows.push({ h:80000, cells:pad(ncol) });
    function sumRow(label, v26, v25, isPct){
      const lead = dup ? 4 : 3;
      const cells = pad(lead - 1);
      cells.push({ t:label, b:true, fill:SUM_FILL, sz:900, line:false });
      cells.push.apply(cells, pad(ncol - lead - 2));
      cells.push({ t:isPct ? fmtPct(v26, 0) : fmtM(v26), b:true, fill:SUM_FILL, sz:900, align:'r', line:false });
      cells.push({ t:(v25 === null ? '' : (isPct ? fmtPct(v25, 0) : fmtM(v25))), b:true, fill:SUM_FILL, sz:900, align:'r', line:false });
      return { h:155000, cells:cells };
    }
    rows.push(sumRow('Top ' + nTop, cfg.block.top26, cfg.block.top25));
    rows.push(sumRow('Remaining', cfg.block.rem26, cfg.block.rem25));
    rows.push(sumRow('Total', cfg.block.tot26, cfg.block.tot25));
    rows.push(sumRow(cfg.isOverdue ? 'Top ' + nTop + ' Overdue %' : 'Top ' + nTop + ' %',
      cfg.block.topPct26, cfg.block.topPct25, true));
    if (!cfg.isOverdue){
      rows.push(sumRow('Top ' + nTop + ' Growth', isFinite(cfg.block.topGrowth) ? cfg.block.topGrowth : 0, null, true));
      rows.push(sumRow(cfg.growthLabel, isFinite(cfg.block.totGrowth) ? cfg.block.totGrowth : 0, null, true));
    }
    return rows;
  }

  const tableSlideDefs = [
    { title:'Top ' + nTop + ' – MTD Gross Sales' + AMT,
      cfg:{ list:S.customers, k26:'sales26', k25:'sales25', block:B.sales, growthLabel:'Total Sales Growth' } },
    { title:'Top ' + nTop + ' – AR Exposure' + AMT,
      cfg:{ list:S.customers, k26:'ar26', k25:'ar25', block:B.ar, growthLabel:'Total AR Growth' } },
    { title:'Top ' + nTop + ' – MTD Collection' + AMT,
      cfg:{ list:S.customers, k26:'coll26', k25:'coll25', block:B.coll, growthLabel:'Total Collection Growth' } },
    { title:'Top ' + nTop + ' – Due Amounts' + AMT,
      cfg:{ list:S.ovdOrder, k26:'ovd26', k25:'ovd25', block:B.ovd, isOverdue:true } }
  ];
  const tableSlides = tableSlideDefs.map(function(d, i){
    const rows = topTable(d.cfg);
    const cols = d.cfg.dupName ? COLS8 : COLS7;
    return slideXml(CHROME.concat([
      titleShape(d.title),
      spTable(3, 'Table ' + (i+1), inEmu(0.66), inEmu(BODY_Y), inEmu(8.68), cols, rows)
    ]));
  });

  /* ---------- slide 11 — closing ---------- */
  const slide11 = slideXml([
    spRule(91, 3.60, 3.62, 2.80, '8D8D8D'),
    spTextBox(2, 'TextBox 3', inEmu(1.25), inEmu(3.95), inEmu(7.50), inEmu(0.90),
      [{ text:'Thank you', sz:2800, b:true, color:'161616', align:'ctr' }], { anchor:'ctr' })
  ]);

  // Track which absolute slide index carries which chart number, rather than
  // relying on a hardcoded position range — the bridge slide sits between
  // Executive Summary and the charts, so the old "index 2..5" assumption
  // would silently point every chart relationship at the wrong slide.
  const slides = [slide1, slide2, bridgeSlide];
  const slideChartNum = {};
  chartSlides.forEach(function(s, i){ slideChartNum[slides.length] = i + 1; slides.push(s); });
  tableSlides.forEach(function(s){ slides.push(s); });
  slides.push(slide11);

  /* ---------- chart parts + embedded workbooks ---------- */
  const chartFiles = [];
  for (let i = 0; i < chartSlideDefs.length; i++){
    // Grand Total is rendered as the callout text box, not a chart bar —
    // it dwarfs the real clusters and isn't a peer category.
    const piv = chartSlideDefs[i].pivot.filter(function(p){ return !p.isTotal; });
    const isOvdChart = (i === 3);
    const swap = false;
    const nameCur = swap ? 'Sum of ' + LP : 'Sum of ' + LC;
    const namePri = swap ? 'Sum of ' + LC : 'Sum of ' + LP;
    const cats = piv.map(function(p){ return p.name; });
    const v26 = piv.map(function(p){ return p.v26; });
    const v25 = piv.map(function(p){ return p.v25; });
    const idx = i + 1;
    chartFiles.push({ name:'ppt/charts/chart' + idx + '.xml', data:chartXml({
      sheetName:'Sheet1', cats:cats, numFmt:'#,##0.00,,', external:true,
      catRange:'$A$2:$A$' + (cats.length + 1),
      series:[
        { name:nameCur, values:v26, color:SERIES_COLOR[0], valRange:'$B$2:$B$' + (cats.length+1), nameRange:'$B$1' },
        { name:namePri, values:v25, color:SERIES_COLOR[1], valRange:'$C$2:$C$' + (cats.length+1), nameRange:'$C$1' }
      ]
    })});
    chartFiles.push({ name:'ppt/charts/_rels/chart' + idx + '.xml.rels', data:relsXml([
      { id:'rId1', type:RT.pkg, target:'../embeddings/Microsoft_Excel_Sheet' + idx + '.xlsx' }]) });
    chartFiles.push({ name:'ppt/embeddings/Microsoft_Excel_Sheet' + idx + '.xlsx',
      data: await miniWorkbook(cats, [nameCur, namePri], [v26, v25]) });
  }

  /* ---------- package ---------- */
  const files = [];
  slides.forEach(function(s, i){
    files.push({ name:'ppt/slides/slide' + (i+1) + '.xml', data:s });
    const rels = [
      { id:'rId1', type:RT.sldLayout, target:'../slideLayouts/slideLayout1.xml' }
    ];
    if (slideChartNum[i] !== undefined) rels.push({ id:'rId3', type:RT.chart, target:'../charts/chart' + slideChartNum[i] + '.xml' });
    files.push({ name:'ppt/slides/_rels/slide' + (i+1) + '.xml.rels', data:relsXml(rels) });
  });
  files.push.apply(files, chartFiles);

  files.push({ name:'ppt/slideMasters/slideMaster1.xml', data:slideMasterXml() });
  files.push({ name:'ppt/slideMasters/_rels/slideMaster1.xml.rels', data:relsXml([
    { id:'rId1', type:RT.sldLayout, target:'../slideLayouts/slideLayout1.xml' },
    { id:'rId2', type:RT.theme,     target:'../theme/theme1.xml' }]) });
  files.push({ name:'ppt/slideLayouts/slideLayout1.xml', data:slideLayoutXml('Blank') });
  files.push({ name:'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data:relsXml([
    { id:'rId1', type:RT.sldMaster, target:'../slideMasters/slideMaster1.xml' }]) });
  files.push({ name:'ppt/theme/theme1.xml', data:themeXml('Office Theme') });

  const presRels = [{ id:'rId1', type:RT.sldMaster, target:'slideMasters/slideMaster1.xml' }];
  let sldIds = '';
  slides.forEach(function(s, i){
    presRels.push({ id:'rId' + (i+2), type:RT.slide, target:'slides/slide' + (i+1) + '.xml' });
    sldIds += '<p:sldId id="' + (256 + i) + '" r:id="rId' + (i+2) + '"/>';
  });
  presRels.push({ id:'rId' + (slides.length + 2), type:RT.theme, target:'theme/theme1.xml' });

  files.push({ name:'ppt/presentation.xml', data: XML_DECL +
    '<p:presentation xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '" ' +
    'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1">' +
    '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
    '<p:sldIdLst>' + sldIds + '</p:sldIdLst>' +
    '<p:sldSz cx="' + SLIDE_W + '" cy="' + SLIDE_H + '" type="screen4x3"/>' +
    '<p:notesSz cx="' + SLIDE_H + '" cy="' + SLIDE_W + '"/>' +
    '<p:defaultTextStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr></p:defaultTextStyle>' +
    '</p:presentation>' });
  files.push({ name:'ppt/_rels/presentation.xml.rels', data:relsXml(presRels) });
  files.push({ name:'docProps/core.xml', data:coreXml('Receivables Report ' + P.monTitle + ' ' + P.year) });
  files.push({ name:'docProps/app.xml', data: XML_DECL +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
    'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    '<Application>Receivables Reporting Demo</Application>' +
    '<Slides>' + slides.length + '</Slides>' +
    '<AppVersion>16.0300</AppVersion></Properties>' });
  files.push({ name:'_rels/.rels', data:relsXml([
    { id:'rId1', type:RT.wb,   target:'ppt/presentation.xml' },
    { id:'rId2', type:RT.core, target:'docProps/core.xml' },
    { id:'rId3', type:RT.app,  target:'docProps/app.xml' }]) });

  let ct = XML_DECL + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/>' +
    '<Default Extension="png" ContentType="image/png"/>' +
    '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
    '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
    '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>';
  for (let i = 0; i < slides.length; i++)
    ct += '<Override PartName="/ppt/slides/slide' + (i+1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
  for (let i = 1; i <= 4; i++)
    ct += '<Override PartName="/ppt/charts/chart' + i + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>';
  ct += '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
        '</Types>';
  files.unshift({ name:'[Content_Types].xml', data:ct });

  return zipBuild(files);
}

/* ============================================================================
   SECTION 18 — BOOTSTRAP
   ========================================================================== */
(function init(){
  log('Receivables reporting demo ready — runs offline in the browser.', 'ok');
  log('Deflate: ' + (HAS_DS ? 'native DecompressionStream' : 'embedded fallback inflate') +
      ' · Compress: ' + (HAS_CS ? 'native CompressionStream' : 'STORE'), '');
  try{ wire(); }catch(e){ console.error(e); }
  renderLog();
})();

