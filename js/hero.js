/* ==========================================================
   HERO: одна оркестрованная последовательность при загрузке
   шапка -> строки заголовка -> текст -> кнопки -> заметка -> соцсети
   ========================================================== */
(function () {
  const root = document.documentElement;
  const hero = document.querySelector('[data-hero]');
  if (!hero) return;

  clearTimeout(window.__animGuard);

  if (!window.gsap || (window.AiCo && AiCo.reduce)) {
    root.classList.remove('js-anim');
    return;
  }

  function run() {
    const tl = gsap.timeline({
      defaults: { ease: 'power4.out' },
      delay: 0.1,
      onComplete: () => root.classList.remove('js-anim'),
    });

    tl.from('[data-header]', {
      yPercent: -100, opacity: 0, duration: 0.9, clearProps: 'transform,opacity',
    }, 0)

    // строки заголовка выезжают из-под маски (em, а не yPercent: не зависит от bounding-box строки)
    .fromTo(hero.querySelectorAll('.line__inner'),
      { y: '1.3em' },
      { y: '0em', duration: 1.1, stagger: 0.12 },
      0.15)

    // всё остальное — мягко снизу
    .fromTo(hero.querySelectorAll('[data-hero-fade]'),
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.8, stagger: 0.1 },
      '-=0.7');
  }

  // ждём шрифты, чтобы строки не «прыгали» после подгрузки Poppins
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(run);
  else run();
})();