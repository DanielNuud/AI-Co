/* ==========================================================
   REVEAL: появление секций при доскролле — только там, где своей
   анимации появления ещё нет (hero, services, how, tech и cta
   управляют собой сами и сюда не входят).

   Срабатывает через IntersectionObserver, а не ScrollTrigger: так
   контент не останется скрытым, даже если пересчёт триггеров сбился.
   Каждая группа проигрывается один раз.
   ========================================================== */
(function () {
  if (!window.gsap) return;
  if (window.AiCo && AiCo.reduce) return; // разметка и так корректна без анимации
  if (!('IntersectionObserver' in window)) return;

  const $ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const CLEAR = 'opacity,visibility,transform'; // отдаём управление обратно CSS (hover, active и т.п.)

  /* targets — массив шагов { els, from, to }, играют параллельно со своей задержкой */
  function reveal(triggerSel, steps) {
    const trigger = document.querySelector(triggerSel);
    if (!trigger) return;
    const live = steps
      .map((s) => ({ ...s, els: (s.els || []).filter(Boolean) }))
      .filter((s) => s.els.length);
    if (!live.length) return;

    live.forEach((s) => gsap.set(s.els, { autoAlpha: 0, ...s.from }));

    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      live.forEach((s) => {
        gsap.to(s.els, {
          autoAlpha: 1, x: 0, y: 0, scale: 1,
          duration: s.duration || 0.8,
          delay: s.delay || 0,
          stagger: s.stagger || 0,
          ease: s.ease || 'power3.out',
          clearProps: CLEAR,
        });
      });
    }, { rootMargin: '0px 0px -12% 0px' });
    io.observe(trigger);
  }

  /* --- Problem: заголовок и текст (падающие карточки анимирует problem.js) --- */
  reveal('.problem__head', [
    { els: $('.problem__head .eyebrow, .problem__title, .problem__text'), from: { y: 28 }, stagger: 0.12 },
  ]);

  /* --- AI fits: диаграмма проявляется, плашки узлов выезжают по очереди, затем текст --- */
  reveal('.fits', [
    { els: $('.fits__stage'), from: {}, duration: 1 },
    { els: $('.fit-node'), from: { y: 16, scale: 0.92 }, stagger: 0.08, delay: 0.25, duration: 0.7 },
    { els: $('.fits__content-inner'), from: { y: 24 }, delay: 0.2 },
  ]);

  /* --- FAQ: левая колонка, затем карточки аккордеона каскадом --- */
  reveal('.faq__inner', [
    { els: $('.faq__content .eyebrow, .faq__title, .faq__text, .faq__btn'), from: { y: 24 }, stagger: 0.1 },
    { els: $('.faq__glow'), from: {}, delay: 0.1, duration: 1 },
    { els: $('.faq__item'), from: { y: 28 }, stagger: 0.09, delay: 0.15 },
  ]);

  /* --- Contact: текст слева, форма справа --- */
  reveal('.contact__inner', [
    { els: $('.contact__info .eyebrow, .contact__title, .contact__points li, .contact__detail'), from: { y: 22 }, stagger: 0.08 },
    { els: $('.contact__form > :not([hidden])'), from: { y: 26 }, stagger: 0.07, delay: 0.2 },
  ]);

  /* --- Footer: бренд, колонки, нижняя строка --- */
  reveal('.footer__inner', [
    { els: $('.footer__brand, .footer__col'), from: { y: 24 }, stagger: 0.08 },
    { els: $('.footer__bottom'), from: { y: 16 }, delay: 0.4, duration: 0.7 },
  ]);
})();
