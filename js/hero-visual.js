/* ==========================================================
   HERO VISUAL: оживление изометрической композиции

   Сюжет: трубы «зажигаются» по одной — труба заполняется от
   узла к центральному блоку, держится полностью залитой,
   гаснет, и та же история повторяется на следующей трубе.
   Одновременно анимируется только одна труба.

   Цвет заливки — белый: трубы и так импортированы с белой
   заливкой, поэтому поверх ничего дополнительно не подкрашиваем
   (раньше здесь был акцентный оранжевый — убрано по правкам).

   1. Интро: core -> узлы -> трубы -> карточка
   2. Цикл: трубы зажигаются по очереди (см. выше); когда
      зажигается труба-«исходящая» (outlook/gmail/onedrive),
      заодно меняется карточка сообщения
   3. Очередь сообщений: когда подходит очередь исходящей трубы,
      текущая карточка (msg-1, msg-2, ...) уходит вверх и
      растворяется, а из core «вырастает» следующая
   4. Пауза анимаций, когда hero вне экрана
   ========================================================== */
(function () {
  const wrap = document.querySelector('[data-hero-visual]');
  const svg = wrap && wrap.querySelector('svg.hv');
  const hero = document.querySelector('[data-hero]');
  if (!svg || !hero || !window.gsap) return;
  if (window.AiCo && AiCo.reduce) return; // без анимаций: статичная картинка

  const NS = 'http://www.w3.org/2000/svg';
  const $ = (id) => svg.querySelector('#' + id);

  /* ------------------------------------------------------
     КОНФИГ. Координаты в системе viewBox SVG (545 x 403).
     pts — осевая линия трубы, r — радиус скругления углов.
     role используется только для того, чтобы решить, когда
     менять карточку сообщения (на «исходящих» трубах) —
     на саму анимацию заливки роль больше не влияет, зажигаются
     все трубы одинаково, просто по очереди.
     ------------------------------------------------------ */
  const FILL_COLOR = '#FF6A4D'; // тёплый коралл из той же палитры, что градиенты
                                 // в секции Services (chat__btn и мэш-фоны карточек)
  const WIDTH = 3;              // толщина заливки внутри трубы
  const SPEED = 70;             // скорость заполнения, единиц viewBox в секунду
  const HOLD = 0.7;             // сколько труба стоит полностью залитой
  const FADE = 0.3;             // как быстро гаснет
  const GAP = 0.35;             // пауза перед тем, как зажжётся следующая труба

  const FLOWS = [
    { id: 'db', pipe: 'pipe-db', role: 'in', r: 0,
      pts: [[208.3, 196.3], [246, 218.0]] },
    { id: 'teams', pipe: 'pipe-4', role: 'in', r: 3,
      pts: [[85.0, 248.4], [125.7, 224.5], [190.0, 261.7], [230.0, 238.5], [247, 248.3]] },
    { id: 'whatsapp', pipe: 'pipe-2', role: 'in', r: 3.5,
      pts: [[449.6, 276.7], [429.0, 264.8], [377.0, 294.8], [338.6, 272.7]] },
    { id: 'outlook', pipe: 'pipe-1', role: 'out', r: 0,
      pts: [[366, 221.0], [447.0, 174.45]] },
    { id: 'gmail', pipe: 'pipe-5', role: 'out', r: 4,
      // осевая линия по середине между кромками контура трубы; старт на 3 единицы
      // заходит под ядро, чтобы косой срез трубы не оставлял щели у butt-торца
      d: 'M283.8 187.37 L255.5395 170.9615 C252.22 169.034 252.22 164.2405 255.539 162.3135 L314.5645 127.982',
      pts: [[283.8, 187.37], [255.5395, 170.9615], [255.539, 162.3135], [314.5645, 127.982]] },
    { id: 'onedrive', pipe: 'pipe-3', role: 'out', r: 6,
      // осевая линия — ровно посередине между двумя кромками контура трубы
      // (парные точки и контрольные точки кривых усреднены), поэтому заливка
      // ложится строго в трубу, в том числе на обоих скруглённых изгибах
      d: 'M279.7 276.96 L241.155 299.218 C238.155 300.9495 238.155 305.2795 241.155 307.012 L301.732 341.986 C304.9905 343.8675 305.082 348.5385 301.9 350.546 L281.003 363.75',
      pts: [[279.7, 276.96], [241.155, 299.218], [301.732, 341.986], [281.003, 363.75]] },
  ];

  /* ------------------------------------------------------
     Построение заливки: одна линия на трубу, без капель и хвостов
     ------------------------------------------------------ */
  function roundedPath(pts, r) {
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [p0, p1, p2] = [pts[i - 1], pts[i], pts[i + 1]];
      const d1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const k = Math.min(r, d1 / 2, d2 / 2);
      const a = [p1[0] - ((p1[0] - p0[0]) / d1) * k, p1[1] - ((p1[1] - p0[1]) / d1) * k];
      const b = [p1[0] + ((p2[0] - p1[0]) / d2) * k, p1[1] + ((p2[1] - p1[1]) / d2) * k];
      d += ` L${a[0]} ${a[1]} Q${p1[0]} ${p1[1]} ${b[0]} ${b[1]}`;
    }
    const last = pts[pts.length - 1];
    return d + ` L${last[0]} ${last[1]}`;
  }

  function build(f) {
    const host = $(f.pipe);
    const d = f.d || roundedPath(f.pts, f.r);

    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', 'hv-track');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', FILL_COLOR);
    p.setAttribute('stroke-width', WIDTH);
    // butt, а не round: у round при анимации stroke-dashoffset растущий
    // кончик — это круглая «нашлёпка», и на изгибе она может на мгновение
    // вылезти за пределы видимой ширины трубы (тот самый артефакт на скрине)
    p.setAttribute('stroke-linecap', 'butt');
    p.setAttribute('stroke-linejoin', 'round');
    p.setAttribute('pointer-events', 'none');

    // вставляем внутрь группы трубы (или сразу после неё), чтобы сохранить порядок слоёв
    if (host.tagName.toLowerCase() === 'g') host.appendChild(p);
    else host.after(p);

    f.track = p;
    f.len = p.getTotalLength();
    f.track.setAttribute('stroke-dasharray', `${f.len} ${f.len}`);
    f.track.setAttribute('stroke-dashoffset', f.len); // пустая труба до её очереди
    return f;
  }

  const flows = gsap.utils.shuffle(FLOWS.map(build)); // порядок зажигания труб — один раз в начале

  /* ------------------------------------------------------
     Элементы
     ------------------------------------------------------ */
  const core = $('core');

  /* Карточки сообщений: msg-1, msg-2, ... (порядок очереди = номер в имени слоя).
     Другой порядок можно задать здесь, например: ['msg-3', 'msg-2', 'msg-1', 'msg-4'] */
  const MSG_ORDER = null;
  const cards = (MSG_ORDER
    ? MSG_ORDER.map((id) => $(id))
    : [...svg.querySelectorAll('[id^="msg-"]')].sort((x, y) => parseInt(x.id.slice(4)) - parseInt(y.id.slice(4)))
  ).filter(Boolean);
  const MIN_SHOW = 3;        // минимум секунд, сколько карточка остаётся на экране
  let cardIdx = 0;
  let cardBusy = false;
  let cardReadyAt = Infinity; // время (gsap.ticker.time), после которого можно менять карточку
  const nodeEls = ['node-db', 'node-4', 'node-5', 'node-1', 'node-2', 'node-3'].map($);
  const pipeEls = ['pipe-db', 'pipe-4', 'pipe-5', 'pipe-1', 'pipe-2', 'pipe-3'].map($);

  // исходное состояние (контейнер до этого скрыт CSS-классом js-anim)
  gsap.set(core, { opacity: 0, y: 20, svgOrigin: '306 277' });
  gsap.set(nodeEls, { opacity: 0, y: 20 });
  gsap.set(pipeEls, { opacity: 0 });
  gsap.set(cards, { autoAlpha: 0, scale: 0.6, y: 40, svgOrigin: '308 215' }); // растут из core
  gsap.set(wrap, { opacity: 1, '--grid-o': 0, '--grid-s': 0.92 }); // сетка (::before) проявляется отдельно, см. intro()

  function pulseCore() {
    gsap.fromTo(core, { scale: 1 },
      { scale: 1.016, duration: 0.18, ease: 'power2.out', yoyo: true, repeat: 1, overwrite: 'auto' });
  }

  // текущая карточка уходит вверх и растворяется -> из core появляется следующая
  function nextMessage() {
    if (cardBusy || cards.length < 2) return;
    cardBusy = true;
    const cur = cards[cardIdx];
    cardIdx = (cardIdx + 1) % cards.length;
    const next = cards[cardIdx];

    gsap.timeline({ onComplete: () => { cardBusy = false; cardReadyAt = gsap.ticker.time + MIN_SHOW; } })
      .to(cur, { y: -50, autoAlpha: 0, duration: 0.8, ease: 'power2.in' })
      .set(next, { y: 40, scale: 0.6, autoAlpha: 0 })
      .to(next, { autoAlpha: 1, scale: 1, y: 0, duration: 1.1, ease: 'back.out(1.5)' }, '+=0.25');
  }

  /* ------------------------------------------------------
     Цикл: трубы зажигаются по очереди, одна за раз.
     Один общий таймлайн (как в остальных секциях сайта) — пауза
     вне экрана делается через tl.pause()/tl.play(), без ручного
     учёта «активности» на каждую трубу отдельно.
     ------------------------------------------------------ */
  const tl = gsap.timeline({ paused: true, repeat: -1 });

  flows.forEach((f) => {
    tl.set(f.track, { autoAlpha: 1 })
      .to(f.track, { strokeDashoffset: 0, duration: f.len / SPEED, ease: 'none' })
      .call(() => {
        pulseCore();
        if (f.role === 'out' && !cardBusy && gsap.ticker.time >= cardReadyAt) nextMessage();
      })
      .to({}, { duration: HOLD })
      .to(f.track, { autoAlpha: 0, duration: FADE })
      .call(() => { f.track.style.strokeDashoffset = f.len; }) // сброс, пока труба невидима
      .to({}, { duration: GAP });
  });

  /* ------------------------------------------------------
     Пауза вне экрана. IntersectionObserver срабатывает сразу
     же при подписке (если hero уже во вьюпорте), а интро в этот
     момент ещё не отыграло — guard не даёт циклу труб стартовать
     раньше, чем закончится интро (иначе труба-цикл уйдёт вперёд,
     пока пока трубы ещё невидимы, и после интро зрителю покажется
     уже не с начала цикла).
     ------------------------------------------------------ */
  let introDone = false;
  new IntersectionObserver(([e]) => {
    if (!introDone) return;
    e.isIntersecting ? tl.play() : tl.pause();
  }, { threshold: 0.05 }).observe(hero);

  /* ------------------------------------------------------
     Интро
     ------------------------------------------------------ */
  function intro() {
    const introTl = gsap.timeline({
      delay: 0.3,
      defaults: { ease: 'power3.out' },
      onComplete: () => {
        cardReadyAt = gsap.ticker.time + MIN_SHOW;
        introDone = true;
        tl.play();
      },
    });

    // сетка проявляется первой и чуть «вырастает»; остальное выезжает на её фоне
    introTl.to(wrap, { '--grid-o': 1, '--grid-s': 1, duration: 1.5, ease: 'power2.out' }, 0)
      .to(core, { opacity: 1, y: 0, duration: 0.9 }, 0.35)
      .to(nodeEls, { opacity: 1, y: 0, duration: 0.8, stagger: 0.09 }, '-=0.55')
      .to(pipeEls, { opacity: 1, duration: 0.5, stagger: 0.06 }, '-=0.35')
      // карточка «вылезает» из центрального блока
      .to(cards[0], { autoAlpha: 1, scale: 1, y: 0, duration: 1.1, ease: 'back.out(1.5)' }, '-=0.35');
  }

  // ждём шрифты: в карточке используется Onest
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(intro);
  else intro();
})();