// Document viewer. Only documents listed in the page's #doc-allowlist
// (generated from data/site.json) can be shown. Anything else — another
// path, an external URL, a javascript: URL — is refused.
(function () {
  var listEl = document.getElementById('doc-allowlist');
  var docs = {};
  try { docs = JSON.parse(listEl.textContent); } catch (e) { docs = {}; }

  var params = new URLSearchParams(window.location.search);
  var id = params.get('doc');

  // Legacy links used ?file=<path>&name=<label>. Accept them only when the
  // path exactly matches an allowlisted file; the label is never used.
  if (!id && params.has('file')) {
    var file = params.get('file');
    Object.keys(docs).forEach(function (key) {
      if (docs[key].file === file) id = key;
    });
  }

  var doc = id && Object.prototype.hasOwnProperty.call(docs, id) ? docs[id] : null;
  var found = document.getElementById('viewer-found');
  var missing = document.getElementById('viewer-missing');

  if (!doc) {
    found.hidden = true;
    missing.hidden = false;
    return;
  }

  document.title = doc.title + ' — ' + document.body.dataset.siteName;
  document.getElementById('viewer-title').textContent = doc.title;
  var crumb = document.getElementById('viewer-crumb');
  if (crumb) crumb.textContent = doc.title;

  var back = document.getElementById('viewer-back');
  if (doc.back) back.href = doc.back; else back.hidden = true;
  if (doc.backLabel) back.querySelector('span').textContent = doc.backLabel;

  document.getElementById('viewer-open').href = doc.file;
  var dl = document.getElementById('viewer-download');
  dl.href = doc.file;
  dl.setAttribute('download', doc.file.split('/').pop());

  var frame = document.getElementById('viewer-frame');
  frame.title = doc.title;
  frame.src = doc.file;
  found.hidden = false;

  // When keyboard focus moves into the embedded PDF the frame does not match
  // :focus in Chromium, so mark it with a class to keep the focus ring visible.
  window.addEventListener('blur', function () {
    setTimeout(function () { frame.classList.toggle('has-focus', document.activeElement === frame); }, 0);
  });
  window.addEventListener('focus', function () { frame.classList.remove('has-focus'); });
})();
