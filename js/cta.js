/* ==========================================================
   CTA: (1) пауза анимации mesh-градиента, пока секция вне экрана
   (сам градиент живёт на чистом CSS, см. cta.css); (2) появление
   при доскролле — заголовок, текст, кнопка и подпись каскадом.
   ========================================================== */
(function () {
  const section = document.querySelector('.cta');
  if (!section) return;

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      section.classList.toggle('is-idle', !entry.isIntersecting);
    }, { rootMargin: '100px 0px' }).observe(section);
  }

  if (!window.gsap) return;
  if (window.AiCo && AiCo.reduce) return; // разметка и так корректна без анимации

  const items = [...section.querySelectorAll('.cta .eyebrow, .cta__title, .cta__text, .cta__btn, .cta__note')];

  // скрываем сами (не через общий .js-anim — он снимается один раз глобально
  // сразу после интро hero, а этой секции нужно ждать своего доскролла)
  gsap.set(items, { autoAlpha: 0, y: 20 });

  function run() {
    gsap.to(items, {
      autoAlpha: 1, y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.1,
      scrollTrigger: { trigger: section, start: 'top 78%', once: true },
    });
  }

  if (window.ScrollTrigger) run();
  else gsap.set(items, { autoAlpha: 1, y: 0 }); // запасной путь без ScrollTrigger
})();
