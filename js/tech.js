/* ==========================================================
   TECH: цепочка плиток с логотипами

   1. Появление (один раз, когда секция доскроллилась): плитки верхнего ряда
      въезжают слева, нижнего — справа, затем растут перемычки — и благодаря
      SVG-фильтру «липкой капли» плитки на глазах склеиваются в цепочку.
   2. Дальше по цепочке бежит подсветка: одна плитка за раз (как трубы в hero) —
      мягкий тон акцента у фона плитки и лёгкое увеличение иконки.
   3. Наведение мышью подсвечивает плитку и останавливает бегущую подсветку;
      подпись с названием — чистый CSS (см. tech.css).

   Каждая плитка состоит из двух элементов в разных слоях (фон в .tech__chain,
   иконка в .tech__tiles) — они анимируются одинаковыми твинами с одним stagger,
   поэтому не расходятся.
   ========================================================== */
(function () {
  const section = document.querySelector('.tech');
  if (!section || !window.gsap) return;

  const reduce = window.AiCo && AiCo.reduce;
  const rows = [...section.querySelectorAll('[data-tech-row]')].map((row) => ({
    blobs: [...row.querySelectorAll('.tech__blob')],
    links: [...row.querySelectorAll('.tech__link')],
    tiles: [...row.querySelectorAll('.tech__tile')],
  }));
  if (!rows.length) return;

  // плоский список в порядке чтения: верхний ряд слева направо, затем нижний
  const all = rows.flatMap((r) => r.tiles.map((tile, i) => ({ tile, blob: r.blobs[i] })));
  let hovered = -1;

  function light(i) {
    all.forEach((o, k) => {
      const on = k === i;
      o.tile.classList.toggle('is-lit', on);
      o.blob.classList.toggle('is-lit', on);
    });
  }

  all.forEach((o, i) => {
    o.tile.addEventListener('mouseenter', () => { hovered = i; light(i); });
    o.tile.addEventListener('mouseleave', () => { hovered = -1; });
  });

  if (reduce) return; // без анимаций: статичная цепочка, подсветка только по наведению

  /* ------------------------------------------------------
     Бегущая подсветка: один общий зацикленный таймлайн
     ------------------------------------------------------ */
  const run = gsap.timeline({ paused: true, repeat: -1 });
  all.forEach((_, i) => {
    run.call(() => { if (hovered < 0) light(i); })
       .to({}, { duration: 2 });
  });

  /* ------------------------------------------------------
     Появление
     ------------------------------------------------------ */
  const phone = window.matchMedia('(max-width: 600px)').matches;
  const dx = phone ? 0 : 70;          // на телефонах плитки просто поднимаются, а не въезжают сбоку
  const dy = phone ? 16 : 0;

  rows.forEach((r, k) => {
    const dir = k % 2 === 0 ? -1 : 1; // верхний ряд слева, нижний справа
    gsap.set([...r.blobs, ...r.tiles], { autoAlpha: 0, x: dir * dx, y: dy });
    gsap.set(r.links, { scaleX: 0 });
  });
  const head = section.querySelectorAll('.tech__content > *');
  gsap.set(head, { autoAlpha: 0, y: 16 });

  const reveal = gsap.timeline({ paused: true, onComplete: () => { inView && run.play(); revealed = true; } });
  reveal.to(head, { autoAlpha: 1, y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.1 });
  rows.forEach((r, k) => {
    const at = 0.35 + k * 0.35;
    const p = { autoAlpha: 1, x: 0, y: 0, duration: 0.7, ease: 'power3.out', stagger: 0.08 };
    // фон и иконки — одинаковые параметры и stagger, чтобы двигались синхронно
    reveal.to(r.blobs, p, at).to(r.tiles, p, at);
    // перемычки вырастают после того, как плитки встали на места — здесь и происходит «склейка»
    reveal.to(r.links, { scaleX: 1, duration: 0.45, ease: 'power2.out', stagger: 0.06 }, at + 0.6);
  });

  /* ------------------------------------------------------
     Запуск по видимости: появление один раз, подсветка — пока секция на экране
     ------------------------------------------------------ */
  let inView = false;
  let revealed = false;
  let started = false;
  const content = section.querySelector('.tech__content');

  function start() { if (!started) { started = true; reveal.play(); } }

  // триггер — по заголовку (он выше плиток), чтобы не было пустого места, пока плитки ещё не доскроллены
  if (window.ScrollTrigger) {
    ScrollTrigger.create({ trigger: content, start: 'top 80%', once: true, onEnter: start });
  }
  new IntersectionObserver(([e]) => {
    inView = e.isIntersecting;
    if (inView && !window.ScrollTrigger) start();  // запасной путь без ScrollTrigger
    if (revealed) inView ? run.play() : run.pause();
  }, { threshold: 0.2 }).observe(section);
})();
