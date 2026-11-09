/* ==========================================================
   BASE: GSAP, ScrollTrigger, Lenis, якорные ссылки
   Общее пространство имён: window.AiCo
   ========================================================== */
(function () {
  window.AiCo = window.AiCo || {};

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  AiCo.reduce = reduce;

  if (window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
    gsap.defaults({ ease: 'power3.out', duration: 0.8 });
  }

  /* --- плавный скролл --- */
  let lenis = null;
  if (!reduce && window.Lenis && window.gsap) {
    lenis = new Lenis({ lerp: 0.1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  AiCo.lenis = lenis;

  /* --- якоря --- */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;

    const id = a.getAttribute('href');
    if (id.length < 2) return;

    const target = document.querySelector(id);
    if (!target) return;

    e.preventDefault();
    const header = document.querySelector('[data-header]');
    const offset = id === '#top' ? 0 : -(header ? header.offsetHeight : 0);

    if (lenis) lenis.scrollTo(target, { offset });
    else target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });

    history.pushState(null, '', id);
  });
})();
