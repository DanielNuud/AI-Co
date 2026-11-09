/* ==========================================================
   HOW: появление при доскролле — шапка, три шага каскадом,
   дорожка между иконками проявляется вместе с ними, а затем
   акцентная точка начинает спокойно курсировать по ней туда-обратно.
   ========================================================== */
(function () {
  const section = document.querySelector('.how');
  if (!section || !window.gsap) return;

  const head = section.querySelector('[data-how-reveal]');
  const steps = [...section.querySelectorAll('[data-how-step]')];
  const line = section.querySelector('[data-how-line]');
  const dot = section.querySelector('[data-how-dot]');
  const reduce = window.AiCo && AiCo.reduce;

  if (reduce) return; // разметка и так корректна без анимации

  // скрываем сами (не через общий .js-anim — он снимается один раз глобально
  // сразу после интро hero, а этой секции нужно ждать своего доскролла)
  gsap.set([head, ...steps], { autoAlpha: 0, y: 20 });
  gsap.set(line, { autoAlpha: 0 });

  function run() {
    const tl = gsap.timeline({
      defaults: { ease: 'power3.out' },
      scrollTrigger: { trigger: section, start: 'top 78%', once: true },
      onComplete: () => {
        // точка курсирует туда-обратно вдоль дорожки — не прогресс-бар,
        // а спокойный фоновый мотив, тот же приём, что у труб в hero
        gsap.to(dot, { left: '100%', duration: 2.6, ease: 'power1.inOut', yoyo: true, repeat: -1 });
      },
    });
    tl.to(head, { autoAlpha: 1, y: 0, duration: 0.7 })
      .to(steps, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.15 }, '-=0.35')
      .to(line, { autoAlpha: 1, duration: 0.5 }, '<0.1');
  }

  if (window.ScrollTrigger) run();
  else {
    // запасной путь без ScrollTrigger: показать сразу
    gsap.set([head, ...steps], { autoAlpha: 1, y: 0 });
    gsap.set(line, { autoAlpha: 1 });
    gsap.to(dot, { left: '100%', duration: 2.6, ease: 'power1.inOut', yoyo: true, repeat: -1 });
  }
})();