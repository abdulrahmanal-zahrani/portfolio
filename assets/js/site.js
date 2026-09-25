// Shared behaviour: print buttons and the small-screen navigation toggle.
document.querySelectorAll('[data-print]').forEach(function (b) {
  b.addEventListener('click', function () { window.print(); });
});

(function () {
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.getElementById('site-nav');
  if (!toggle || !nav) return;

  function setOpen(open) {
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
  }

  toggle.addEventListener('click', function () {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });

  // Close when focus or a click leaves the header.
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.site-header')) setOpen(false);
  });
})();
