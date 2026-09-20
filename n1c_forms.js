/* ============================================================
   N1C Gene Registry - shared engine for the two submission forms
   (submit.html = N-of-1 projects, submit_variant.html = variant
   assessments). Handles the step-by-step path, the file-upload
   path, format checks and sending to the Apps Script backend.
   ============================================================ */
(function () {
'use strict';
var N1C = window.N1C = {};

/* ============================================================
   1. SETTINGS - the only lines to change at cutover
   ------------------------------------------------------------
   ENV: 'TEST' sends to Aadhithya's own Apps Script (his test sheet
        and Drive); 'PROD' sends to the N1C account's Apps Script.
   ENDPOINTS.PROD: paste the web app URL that the N1C account gets
        after deploying Code.gs (Deploy > New deployment).
   SUBMITTER_EMAIL_ON: must match SEND_SUBMITTER_EMAIL in Code.gs;
        it only changes the wording of the thank-you panel here.
   ============================================================ */
N1C.ENV = 'TEST';
N1C.ENDPOINTS = {
  TEST: 'https://script.google.com/macros/s/AKfycbxhTS9LFMh6ZkY4Jeb7uhn7v9j5psSH3jb-VrteVof9q5dXR_Vk1ym8pGRjpuaHPPQ/exec',
  PROD: 'PASTE_THE_N1C_WEB_APP_URL_HERE'
};
N1C.SUBMITTER_EMAIL_ON = false;
N1C.MAX_BULK_ROWS = 500;
N1C.MAX_FILE_BYTES = 2 * 1024 * 1024;

N1C.endpoint = function () { return N1C.ENDPOINTS[N1C.ENV] || N1C.ENDPOINTS.TEST; };

/* ============================================================
   2. Small helpers
   ============================================================ */
function $(id) { return document.getElementById(id); }
function val(id) { var e = $(id); return e ? String(e.value) : ''; }
function radio(n) { var e = document.querySelector('input[name="' + n + '"]:checked'); return e ? e.value : ''; }
function put(id, v) { var e = $(id); if (!e) return; e.textContent = v || '—'; e.classList.toggle('empty', !v); }
function each(list, fn) { Array.prototype.forEach.call(list, fn); }
function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
N1C.$ = $; N1C.val = val; N1C.radio = radio; N1C.put = put; N1C.esc = esc;

/* ============================================================
   3. Format checks shared by both forms (true = passes)
   ============================================================ */
var V = N1C.V = {
  email:       function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()); },
  gene:        function (v) { return /^[A-Za-z][A-Za-z0-9@\-]{0,14}$/.test(v.trim()); },
  transcript:  function (v) { return /^N[MR]_\d+\.\d+$/.test(v.trim()); },
  coding:      function (v) { return /^c\..+/.test(v.trim()); },
  protein:     function (v) { return v.trim() === '' || /^p\..+/.test(v.trim()); },
  genomicHgvs: function (v) { return v.trim() === '' || /^NC_\d+\.\d+:g\..+/i.test(v.trim()); },
  mondo:       function (v) { return /^MONDO[:_]\d{7}$/i.test(v.trim()); },
  chromosome:  function (v) { return /^(1[0-9]|2[0-2]|[1-9]|X|Y|MT)$/i.test(v.trim()); },
  position:    function (v) { return v.trim() === '' || /^\d+$/.test(v.trim()); },
  allele:      function (v) { return v.trim() === '' || /^([ACGTN]+|-)$/i.test(v.trim()); },
  url:         function (v) { return v.trim() === '' || /^https?:\/\/\S+$/i.test(v.trim()); },
  clinvar:     function (v) { return v.trim() === '' || /ncbi\.nlm\.nih\.gov\/clinvar\/variation\/\d+/i.test(v.trim()); },
  date:        function (v) { return /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v.trim()); },
  notEmpty:    function (v) { return v.trim().length > 0; }
};

/* ============================================================
   4. One spelling per dropdown value (used for uploaded files)
   ============================================================ */
function squash(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
var NORM = N1C.NORM = {
  yesNo: function (v) {
    var s = String(v || '').trim().toLowerCase();
    if (!s) return '';
    if (/^y/.test(s) || s === 'true' || s === '1') return 'Yes';
    if (/^n/.test(s) || s === 'false' || s === '0') return 'No';
    if (/^m/.test(s)) return 'Maybe';
    return String(v).trim();
  },
  modality: function (v) {
    var s = String(v || '').toLowerCase();
    if (!s.trim()) return '';
    if (/antisense|\baso/.test(s)) return 'Antisense oligonucleotide';
    if (/replacement/.test(s)) return 'Gene replacement';
    if (/rna\s*edit/.test(s)) return 'RNA editing';
    if (/edit|crispr|cas9|base|prime/.test(s)) return 'Gene editing';
    if (/^other/.test(s.trim())) return 'Other';
    return String(v).trim();
  },
  status: function (v) {
    var s = String(v || '').toLowerCase();
    if (!s.trim()) return '';
    if (/not pursued|pause|paused|stopped/.test(s)) return 'Currently Not Pursued for Development';
    if (/clinical/.test(s)) return 'Clinical Application';
    if (/under/.test(s)) return 'Under Development';
    if (/developed/.test(s)) return 'Developed';
    return String(v).trim();
  },
  eligibility: function (v) {
    var s = squash(v);
    if (!s) return '';
    if (s === 'eligible') return 'Eligible';
    if (s === 'likelyeligible') return 'Likely eligible';
    if (s === 'unlikelyeligible') return 'Unlikely eligible';
    if (/^noteligi/.test(s)) return 'Not eligible';
    if (/^unabletoassess/.test(s)) return 'Unable to assess';
    if (/^underdevelopment/.test(s)) return 'Under development';
    return String(v).trim();
  },
  approach: function (v) {
    var s = squash(v);
    if (!s) return '';
    if (s === 'exonskipping') return 'Exon skipping';
    if (s === 'splicecorrection') return 'Splice correction';
    if (s === 'exoninclusion') return 'Exon inclusion';
    if (s === 'knockdownalleleselective') return 'Knockdown (allele-selective)';
    if (s === 'knockdown') return 'Knockdown';
    if (s === 'genereplacement') return 'Gene replacement';
    if (s === 'na' || s === 'notapplicable' || s === 'none') return 'Not applicable';
    if (s === 'other') return 'Other';
    return String(v).trim();
  },
  pathomechanism: function (v) {
    var s = squash(v);
    if (!s) return '';
    if (/mixed/.test(s)) return 'Mixed gain and loss of function';
    if (s === 'lossoffunction' || s === 'lof') return 'Loss of function';
    if (s === 'gainoffunction' || s === 'gof') return 'Gain of function';
    if (s === 'dominantnegative') return 'Dominant negative';
    if (s === 'unknown') return 'Unknown';
    return String(v).trim();
  },
  inheritance: function (v) {
    var s = squash(v);
    if (!s) return '';
    if (s === 'autosomalrecessive' || s === 'ar') return 'Autosomal recessive';
    if (s === 'autosomaldominant' || s === 'ad') return 'Autosomal dominant';
    if (s === 'xlinkedrecessive' || s === 'xlr') return 'X-linked recessive';
    if (s === 'xlinkeddominant' || s === 'xld') return 'X-linked dominant';
    if (s === 'other') return 'Other';
    return String(v).trim();
  },
  splicing: function (v) {
    var s = squash(v);
    if (!s) return '';
    if (/^y/.test(s)) return 'Yes';
    if (/^n/.test(s)) return 'No';
    if (/^unk/.test(s)) return 'Unknown';
    return String(v).trim();
  },
  chromosome: function (v) {
    var s = String(v || '').trim().toUpperCase().replace(/^CHR/, '');
    if (s === 'M') s = 'MT';
    return s;
  },
  mondo: function (v) {
    var m = /^MONDO[:_](\d{7})$/i.exec(String(v || '').trim());
    return m ? 'MONDO:' + m[1] : String(v || '').trim();
  },
  genomeBuild: function (v) {
    var s = String(v || '').trim();
    return s === '' ? 'GRCh38' : (/grch38|hg38/i.test(s) ? 'GRCh38' : s);
  }
};

/* ============================================================
   5. Step-by-step engine (one entry per pass)
   ------------------------------------------------------------
   cfg = {
     kind: 'project' | 'variant',
     last: index of the review step,
     rules:   { key: {el, fg, step, name, t(v)->bool, bad, good} },
     radios:  { name: {fg, step, name} },
     selects: { elementId: {fg, step, name} },
     afterCheck(stepOk): optional, for previews and conditional fields,
     fillReview(): fills the review step,
     payload(): the fields to send
   }
   ============================================================ */
N1C.initSteps = function (cfg) {
  var STEP = 0, LAST = cfg.last, touched = {}, forced = {}, sending = false;
  var RULES = cfg.rules || {}, RADIOS = cfg.radios || {}, SELECTS = cfg.selects || {};

  for (var k in RULES) {
    var m = document.createElement('div');
    m.className = 'ok-msg'; m.id = 'ok-' + k;
    $(RULES[k].fg).appendChild(m);
  }

  function hidden(el) {
    while (el && el !== document.body) {
      if (el.hidden || el.style.display === 'none') return true;
      el = el.parentElement;
    }
    return false;
  }

  function check() {
    var stepOk = {}, problems = [];
    for (var i = 0; i <= LAST; i++) stepOk[i] = true;

    for (var k in RULES) {
      var r = RULES[k], raw = val(r.el), blank = raw.trim() === '', ok = r.t(raw);
      var fg = $(r.fg);
      if (hidden(fg) && fg.dataset.optionalWhenHidden === 'yes') ok = true;
      var showBad = !ok && !!(touched[r.el] || forced[r.step]);
      fg.classList.toggle('bad', showBad);
      fg.classList.toggle('ok', ok && !blank);
      var hint = fg.querySelector('.hint');
      if (hint) {
        if (!hint.dataset.orig) hint.dataset.orig = hint.innerHTML;
        hint.innerHTML = showBad ? r.bad : hint.dataset.orig;
      }
      $('ok-' + k).textContent = (ok && !blank) ? '✓ ' + r.good : '';
      if (!ok) { stepOk[r.step] = false; if (r.step === STEP) problems.push({ n: r.name, t: r.el }); }
    }

    for (var n in RADIOS) {
      var rr = RADIOS[n], got = radio(n) !== '';
      $(rr.fg).classList.toggle('bad', !got && !!forced[rr.step]);
      if (!got) { stepOk[rr.step] = false; if (rr.step === STEP) problems.push({ n: rr.name, t: rr.fg }); }
    }

    for (var id in SELECTS) {
      var sl = SELECTS[id], got2 = val(id) !== '';
      $(sl.fg).classList.toggle('bad', !got2 && !!forced[sl.step]);
      if (!got2) { stepOk[sl.step] = false; if (sl.step === STEP) problems.push({ n: sl.name, t: id }); }
    }

    if (cfg.afterCheck) cfg.afterCheck(stepOk);

    var es = $('errsum');
    if (forced[STEP] && problems.length) {
      es.innerHTML = '<b>' + problems.length + ' field' + (problems.length > 1 ? 's need' : ' needs') +
        ' your attention before you can continue</b><ul>' +
        problems.map(function (p) { return '<li data-t="' + p.t + '">' + esc(p.n) + '</li>'; }).join('') + '</ul>';
      es.style.display = 'block';
      each(es.querySelectorAll('li'), function (li) {
        li.onclick = function () {
          var t = $(li.dataset.t);
          if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (t.focus) t.focus(); }
        };
      });
    } else { es.style.display = 'none'; }

    each(document.querySelectorAll('#steps .s'), function (b) {
      var i = +b.dataset.i;
      b.classList.toggle('ok', i < LAST && stepOk[i] && i !== STEP);
    });
    return stepOk;
  }

  function show() {
    each(document.querySelectorAll('.step'), function (s) { s.hidden = (+s.dataset.s !== STEP); });
    each(document.querySelectorAll('#steps .s'), function (b) { b.classList.toggle('on', +b.dataset.i === STEP); });
    $('back').style.visibility = STEP === 0 ? 'hidden' : 'visible';
    $('next').innerHTML = STEP === LAST ? 'Submit' : 'Continue &rarr;';
    if (STEP === LAST && cfg.fillReview) cfg.fillReview();
    check();
    $('stat').textContent = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function goStep(i) { STEP = i; show(); }
  function prev() { if (STEP > 0) { STEP--; show(); } }
  function next() {
    forced[STEP] = true;
    var ok = check();
    if (!ok[STEP]) { $('errsum').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (STEP !== LAST) { STEP++; show(); return; }
    send();
  }

  function send() {
    if (sending) return;
    sending = true;
    var btn = $('next');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    $('stat').textContent = 'Please wait, this takes a few seconds.';

    var data = cfg.payload();
    data.website = val('f-website');
    data.kind = cfg.kind;
    data.mode = 'single';

    fetch(N1C.endpoint(), { method: 'POST', body: JSON.stringify(data) })   // text/plain: no CORS preflight
      .then(function (r) { return r.json().catch(function () { return { ok: true }; }); })
      .then(function (res) {
        if (res && res.ok === false) throw new Error(res.error || 'rejected');
        succeed(res && res.id ? res.id : '');
      })
      .catch(function () { fail(data); });
  }

  function succeed(id) {
    $('formCard').style.display = 'none';
    $('steps').style.display = 'none';
    $('after').style.display = 'none';
    if ($('mode')) $('mode').style.display = 'none';
    $('done-id').textContent = id || 'sent';
    $('done').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function fail(data) {
    sending = false;
    $('next').disabled = false;
    $('next').textContent = 'Submit';
    $('stat').textContent = '';
    var lines = [];
    for (var k in data) { if (k !== 'website' && k !== 'kind' && k !== 'mode' && data[k] !== '') lines.push(k + ': ' + data[k]); }
    $('failed-text').value = lines.join('\n');
    $('formCard').style.display = 'none';
    $('steps').style.display = 'none';
    $('failed').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  N1C.copyFallback = function () {
    var t = $('failed-text');
    t.select(); t.setSelectionRange(0, 99999);
    try { document.execCommand('copy'); } catch (e) {}
  };
  N1C.backToForm = function () {
    $('failed').style.display = 'none';
    $('formCard').style.display = 'block';
    $('steps').style.display = 'flex';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  each(document.querySelectorAll('#steps .s'), function (b) { b.onclick = function () { goStep(+b.dataset.i); }; });

  each(document.querySelectorAll('#formCard input, #formCard select, #formCard textarea'), function (el) {
    el.addEventListener('input', function () { check(); });
    el.addEventListener('change', function () { check(); });
    el.addEventListener('blur', function () { if (String(el.value).trim() !== '') touched[el.id] = true; check(); });
  });

  each(document.querySelectorAll('#formCard .radio label'), function (l) {
    l.addEventListener('change', function () {
      each(document.querySelectorAll('#formCard .radio label[data-g="' + l.dataset.g + '"]'), function (x) {
        x.classList.toggle('sel', !!x.querySelector('input:checked'));
      });
      if (cfg.onRadio) cfg.onRadio(l.dataset.g);
      check();
    });
  });

  N1C.check = check; N1C.goStep = goStep; N1C.prev = prev; N1C.next = next;
  N1C.applyEmailText();
  show();
};

// Shows the thank-you wording that matches SUBMITTER_EMAIL_ON.
N1C.applyEmailText = function () {
  each(document.querySelectorAll('[data-email]'), function (el) {
    var on = el.getAttribute('data-email') === 'on';
    el.style.display = (on === N1C.SUBMITTER_EMAIL_ON) ? '' : 'none';
  });
};

/* ============================================================
   6. Mode switch: one entry step by step, or several from a file
   ============================================================ */
N1C.setMode = function (mode) {
  var single = mode !== 'bulk';
  $('steps').style.display = single ? 'flex' : 'none';
  $('formCard').style.display = single ? 'block' : 'none';
  $('after').style.display = single ? 'grid' : 'none';
  $('bulkCard').style.display = single ? 'none' : 'block';
  $('mode-single').classList.toggle('on', single);
  $('mode-bulk').classList.toggle('on', !single);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

/* ============================================================
   7. File-upload engine (several entries from a spreadsheet)
   ------------------------------------------------------------
   spec = {
     kind, label ('project' | 'assessment'),
     columns: [{ key, label, aliases: ['exact header', 'prefix*'],
                 required, check(v)->true/false, checkMsg, norm(v)->v }],
     keys: [column keys used to decide whether a row is blank],
     derive(fields, note): optional, runs before the checks,
     previewKeys: [keys shown in the preview table]
   }
   ============================================================ */
N1C.initBulk = function (spec) {
  var state = { rows: [], notes: [], file: null, ready: false };
  var norm = function (s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); };

  function cellText(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return '';
      var p = function (n) { return (n < 10 ? '0' : '') + n; };
      return v.getUTCFullYear() + '-' + p(v.getUTCMonth() + 1) + '-' + p(v.getUTCDate());
    }
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return String(v).trim();
  }

  function matchHeaders(headerRow) {
    var map = {}, used = {};
    var hs = headerRow.map(function (h) { return norm(cellText(h)); });
    // pass 1: exact matches, pass 2: prefix matches (aliases ending in *)
    [false, true].forEach(function (prefixPass) {
      spec.columns.forEach(function (col) {
        if (map[col.key] !== undefined) return;
        for (var j = 0; j < hs.length; j++) {
          if (used[j] || !hs[j]) continue;
          var hit = col.aliases.some(function (a) {
            var isPrefix = /\*$/.test(a);
            var an = norm(a.replace(/\*$/, ''));
            return prefixPass ? (isPrefix && hs[j].indexOf(an) === 0) : (!isPrefix && hs[j] === an);
          });
          if (hit) { map[col.key] = j; used[j] = true; break; }
        }
      });
    });
    return map;
  }

  function setMsg(html, cls) {
    var s = $('bulk-summary');
    s.className = 'summary ' + (cls || '');
    s.innerHTML = html;
    s.style.display = html ? 'block' : 'none';
  }

  function resetResult() {
    state.rows = []; state.notes = []; state.ready = false;
    $('bulk-notes').innerHTML = ''; $('bulk-notes').style.display = 'none';
    $('bulk-preview').innerHTML = ''; $('bulk-preview').style.display = 'none';
    $('bulk-submit').disabled = true;
    setMsg('', '');
  }

  function readFile(file) {
    resetResult();
    if (!file) return;
    if (file.size > N1C.MAX_FILE_BYTES) { setMsg('This file is larger than 2 MB. Please split it into smaller files.', 'warn'); return; }
    if (!window.XLSX) { setMsg('The spreadsheet reader could not be loaded. Please reload the page, or email the file to generegistry@n1collaborative.org.', 'warn'); return; }

    var reader = new FileReader();
    reader.onerror = function () { setMsg('The file could not be read.', 'warn'); };
    reader.onload = function (ev) {
      var wb;
      try {
        wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array', cellDates: true });
      } catch (err) { setMsg('This does not look like an Excel or CSV file.', 'warn'); return; }
      var ws = wb.Sheets[wb.SheetNames[0]];
      var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
      handleRows(aoa);
      var r2 = new FileReader();
      r2.onload = function (e2) {
        state.file = { name: file.name, mimeType: file.type || 'application/octet-stream',
          base64: String(e2.target.result).split(',')[1] || '' };
      };
      r2.readAsDataURL(file);
    };
    reader.readAsArrayBuffer(file);
  }

  function handleRows(aoa) {
    var h = -1;
    for (var i = 0; i < Math.min(aoa.length, 15); i++) {
      var filled = aoa[i].filter(function (c) { return cellText(c) !== ''; }).length;
      if (filled >= 3) { h = i; break; }
    }
    if (h < 0) { setMsg('No header row was found. Please use the template.', 'warn'); return; }

    var map = matchHeaders(aoa[h]);
    var missing = spec.columns.filter(function (c) { return c.required && map[c.key] === undefined; });
    if (missing.length) {
      setMsg('The file is missing these columns: <b>' + missing.map(function (c) { return esc(c.label); }).join('</b>, <b>') +
        '</b>. Please use the template and keep its header row.', 'warn');
      return;
    }

    var rows = [], notes = [], blanks = 0, withNotes = 0, blankSinceLastRow = 0, tooMany = false;
    for (var r = h + 1; r < aoa.length; r++) {
      var line = aoa[r], fields = {}, rowNo = r + 1, rowNotes = [];
      spec.columns.forEach(function (c) {
        fields[c.key] = (map[c.key] !== undefined) ? cellText(line[map[c.key]]) : '';
      });
      var blank = spec.keys.every(function (k) { return !fields[k]; });
      if (blank) { blankSinceLastRow++; continue; }          // empty rows at the end are not counted
      blanks += blankSinceLastRow; blankSinceLastRow = 0;
      if (rows.length >= N1C.MAX_BULK_ROWS) { tooMany = true; break; }

      var note = function (t) { rowNotes.push(t); };
      if (spec.derive) spec.derive(fields, note);
      spec.columns.forEach(function (c) {
        if (c.norm) fields[c.key] = c.norm(fields[c.key], note);
        var v = fields[c.key];
        if (c.required && !v) { note(c.label + ' is missing'); return; }
        if (v && c.check && !c.check(v)) note(c.checkMsg || (c.label + ' looks wrong (' + v + ')'));
      });
      fields._row = rowNo;
      rows.push(fields);
      if (rowNotes.length) {
        withNotes++;
        rowNotes.forEach(function (t) { notes.push({ row: rowNo, text: t }); });
      }
    }

    if (!rows.length) { setMsg('The file has a header row but no entries under it.', 'warn'); return; }
    if (tooMany) {
      setMsg('This file has more than ' + N1C.MAX_BULK_ROWS + ' entries. Please split it.', 'warn'); return;
    }

    state.rows = rows; state.notes = notes; state.ready = true;
    var fine = rows.length - withNotes;
    setMsg('<b>' + rows.length + ' ' + spec.label + (rows.length > 1 ? 's' : '') + ' read</b>: ' + fine + ' look' + (fine === 1 ? 's' : '') +
      ' fine, ' + withNotes + ' ' + (withNotes === 1 ? 'has' : 'have') + ' notes' +
      (blanks ? ', ' + blanks + ' blank row' + (blanks > 1 ? 's' : '') + ' skipped' : '') +
      '. Nothing is blocked: rows with notes are still sent and a curator will check them.', withNotes ? 'warn' : 'good');

    var nl = $('bulk-notes');
    if (notes.length) {
      nl.innerHTML = notes.slice(0, 100).map(function (n) { return '<li>Row ' + n.row + ': ' + esc(n.text) + '</li>'; }).join('') +
        (notes.length > 100 ? '<li>and ' + (notes.length - 100) + ' more</li>' : '');
      nl.style.display = 'block';
    }

    var keys = spec.previewKeys, labels = {};
    spec.columns.forEach(function (c) { labels[c.key] = c.label; });
    var html = ['<table><thead><tr><th>Row</th>'];
    keys.forEach(function (k) { html.push('<th>' + esc(labels[k] || k) + '</th>'); });
    html.push('</tr></thead><tbody>');
    rows.slice(0, 10).forEach(function (f) {
      html.push('<tr><td>' + f._row + '</td>');
      keys.forEach(function (k) { html.push('<td>' + esc(f[k]) + '</td>'); });
      html.push('</tr>');
    });
    html.push('</tbody></table>');
    if (rows.length > 10) html.push('<div class="more">Showing the first 10 of ' + rows.length + ' rows.</div>');
    $('bulk-preview').innerHTML = html.join('');
    $('bulk-preview').style.display = 'block';
    $('bulk-submit').disabled = false;
  }

  function submit() {
    var name = val('bulk-name').trim(), email = val('bulk-email').trim();
    $('fg-bulk-name').classList.toggle('bad', name.length < 2);
    $('fg-bulk-email').classList.toggle('bad', !V.email(email));
    if (name.length < 2 || !V.email(email)) { $('bulk-stat').textContent = 'Please give your name and a valid email address first.'; return; }
    if (!state.ready) { $('bulk-stat').textContent = 'Please choose a file first.'; return; }

    var btn = $('bulk-submit');
    btn.disabled = true; btn.textContent = 'Sending…';
    $('bulk-stat').textContent = 'Please wait, this can take up to a minute for large files.';

    var data = { website: val('f-website'), kind: spec.kind, mode: 'bulk',
      uploader: { name: name, email: email }, rows: state.rows, notes: state.notes, file: state.file };

    fetch(N1C.endpoint(), { method: 'POST', body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return { ok: true, ids: [] }; }); })
      .then(function (res) {
        if (res && res.ok === false) throw new Error(res.error || 'rejected');
        var ids = (res && res.ids) || [];
        $('bulk-done-count').textContent = String(ids.length || state.rows.length);
        $('bulk-ids').textContent = ids.length ? ids.join(', ') : 'sent';
        $('bulkCard').style.display = 'none';
        if ($('mode')) $('mode').style.display = 'none';
        $('bulk-done').style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      })
      .catch(function () {
        btn.disabled = false; btn.textContent = 'Submit all rows';
        $('bulk-stat').textContent = '';
        $('bulkCard').style.display = 'none';
        $('bulk-failed').style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
  }

  $('bulk-file').addEventListener('change', function () { readFile(this.files && this.files[0]); });
  $('bulk-submit').addEventListener('click', submit);
  N1C.bulkBack = function () {
    $('bulk-failed').style.display = 'none';
    $('bulkCard').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  N1C.bulkState = state;
};

})();
