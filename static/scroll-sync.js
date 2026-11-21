/* Two-column layout: the story column is much taller than the sidebar, so the
   sidebar is shifted down in proportion to scroll progress. Both columns start
   aligned at the top and finish aligned at the bottom. */
(function () {
  'use strict';

  var sidebar = document.querySelector('.sidebar');
  var stories = document.querySelector('.stories');
  if (!sidebar || !stories || !window.matchMedia) return;

  var wide = window.matchMedia('(min-width: 64rem)');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var root = document.documentElement;
  var travel = 0;
  var queued = false;

  function active() {
    return wide.matches && !reduceMotion.matches;
  }

  function measure() {
    travel = Math.max(0, stories.offsetHeight - sidebar.offsetHeight);
  }

  function update() {
    queued = false;
    if (!active()) {
      sidebar.style.transform = '';
      return;
    }
    var range = root.scrollHeight - window.innerHeight;
    var progress = range > 0 ? Math.min(1, Math.max(0, window.scrollY / range)) : 0;
    sidebar.style.transform = 'translateY(' + (progress * travel).toFixed(1) + 'px)';
  }

  function schedule() {
    if (!queued) {
      queued = true;
      window.requestAnimationFrame(update);
    }
  }

  function refresh() {
    root.classList.toggle('scroll-sync', active());
    measure();
    schedule();
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', refresh);
  if (wide.addEventListener) {
    wide.addEventListener('change', refresh);
    reduceMotion.addEventListener('change', refresh);
  }
  if (window.ResizeObserver) {
    var observer = new ResizeObserver(refresh);
    observer.observe(sidebar);
    observer.observe(stories);
  }
  window.addEventListener('load', refresh);
  refresh();
})();
