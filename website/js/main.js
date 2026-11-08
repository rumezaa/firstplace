// Classic script (no modules) so the page also works from file://.
(function () {
  if (window.ChatterTabs) ChatterTabs.initTabs(document.getElementById('how'));

  var targets = Array.prototype.slice.call(document.querySelectorAll('.reveal, .panel'));
  var legend = document.getElementById('legend');
  var header = document.querySelector('.site-header');

  if (!('IntersectionObserver' in window)) {
    targets.forEach(function (el) { el.classList.add('is-in'); });
    return;
  }

  var revealObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.35 });
  targets.forEach(function (el) { revealObserver.observe(el); });

  // The header is always solid. Once the legend band crosses the top line of the viewport
  // (#p6 has scrolled past), in both scroll directions, it gains a mint strip underneath. The zero-height root
  // at the top edge makes the observer fire only at that crossing.
  if (legend && header) {
    var headerObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        header.classList.toggle('is-solid', entry.boundingClientRect.top <= 0);
      });
    }, { threshold: 0, rootMargin: '0px 0px -100% 0px' });
    headerObserver.observe(legend);
  }
})();
