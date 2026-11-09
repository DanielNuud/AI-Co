/* ==========================================================
   ОБЩЕЕ: пункты списка + полоска прогресса + переключатель сцен

   AiCo.itemBars(items) — вставляет под каждый пункт полоску прогресса
   (поверх разделителя, видна только у активного) и возвращает
   { set(i, 0..1), clear() }.

   AiCo.sceneSwitcher({ stage, scenes, reduce, onCycle }) — блоки 2 и 4.
   Пункты переключаются САМИ: сцена играет ОДИН круг, полоска под пунктом
   показывает прогресс этого круга, по завершении включается следующий
   пункт (после последнего — первый, и вызывается onCycle). Клик по
   пункту включает его сразу и запускает автопереключение заново.

   Каждая сцена — объект { reset, next, build, final }:
     reset() — привести элементы сцены в исходное скрытое состояние
     next()  — подготовить данные для ближайшего показа (вызывается при активации)
     build() — собрать СВЕЖИЙ таймлайн одного круга (paused, без repeat)
     final() — показать финальный кадр (для prefers-reduced-motion)
   Сцена собирается заново при каждой активации — так пункт всегда
   начинается с начала своей истории (restart() тут не годится:
   коллбэки в нулевой позиции при перемотке подавляются).
   ========================================================== */
(function () {
  window.AiCo = window.AiCo || {};

  AiCo.itemBars = function (items) {
    const fills = items.map((b) => {
      let bar = b.querySelector('.svc-item__bar');
      if (!bar) {
        bar = document.createElement('span');
        bar.className = 'svc-item__bar';
        bar.setAttribute('aria-hidden', 'true');
        bar.innerHTML = '<i></i>';
        b.appendChild(bar);
      }
      return bar.firstElementChild;
    });
    return {
      set(i, v) { if (fills[i]) fills[i].style.width = `${Math.min(1, Math.max(0, v)) * 100}%`; },
      clear() { fills.forEach((f) => { f.style.width = '0%'; }); },
    };
  };

  AiCo.sceneSwitcher = function ({ stage, scenes, reduce, onCycle }) {
    const block = stage.closest('.svc-block');
    const items = [...block.querySelectorAll('.svc-item')];
    const names = items.map((b) => b.dataset.scene);
    const roots = [...stage.querySelectorAll('.svc-scene')];
    const bars = AiCo.itemBars(items);
    let current = null;   // { name, tl }
    let inView = false;

    function show(name) {
      roots.forEach((r) => r.classList.toggle('is-visible', r.dataset.sceneEl === name));
      stage.dataset.active = name; // направление ленты пилюль в CSS
      items.forEach((b) => {
        const on = b.dataset.scene === name;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', String(on));
      });
    }

    // всё в исходное скрытое состояние — чтобы до старта не мелькали пустые карточки
    Object.values(scenes).forEach((s) => s.reset());

    if (reduce) {
      // без анимаций: каждая сцена сразу в финальном кадре, пункты просто переключают видимую
      Object.values(scenes).forEach((s) => { s.next(); s.final(); });
      show((items.find((b) => b.classList.contains('is-active')) || items[0]).dataset.scene);
      items.forEach((b) => b.addEventListener('click', () => show(b.dataset.scene)));
      return;
    }

    function advance() {
      const n = (names.indexOf(current.name) + 1) % names.length;
      if (n === 0 && onCycle) onCycle();
      activate(names[n]);
    }

    function activate(name) {
      const prev = current;
      if (prev) prev.tl.kill();
      bars.clear();
      scenes[name].reset();
      scenes[name].next();
      const tl = scenes[name].build();
      const idx = names.indexOf(name);
      tl.eventCallback('onUpdate', () => bars.set(idx, tl.progress()));
      tl.eventCallback('onComplete', advance);
      current = { name, tl };
      show(name);
      // уходящая сцена сбрасывается не сразу, а после кросс-фейда контейнеров
      if (prev && prev.name !== name) {
        gsap.delayedCall(0.45, () => { if (!current || current.name !== prev.name) scenes[prev.name].reset(); });
      }
      if (inView) tl.play();
    }

    items.forEach((b) => b.addEventListener('click', () => {
      if (current && current.name === b.dataset.scene) return;
      activate(b.dataset.scene);
    }));

    new IntersectionObserver(([e]) => {
      inView = e.isIntersecting;
      if (!current) {
        if (inView) activate((items.find((b) => b.classList.contains('is-active')) || items[0]).dataset.scene);
        return;
      }
      inView ? current.tl.play() : current.tl.pause();
    }, { threshold: 0.25 }).observe(stage);
  };
})();

/* ==========================================================
   SERVICES: блок «24/7 Smart Assistants»

   Три сцены лежат друг на друге в .svc-stage (см. .svc-scene
   в CSS) и переключаются классом .is-visible по клику на пункт
   списка. Каждая сцена, один раз начав, крутится вечным циклом
   в общем таймлайне master — так проще, чем отменять и
   перезапускать анимацию при каждом переключении, а работает
   это дёшево: пока сцена скрыта, она просто не видна, а когда
   блок уходит с экрана, master.pause() останавливает всё разом.

   Сцена 1 «voice»    — карточка чата растёт в 3 шага (было)
   Сцена 2 «instant»  — очередь из 3 сообщений, каждое
                        получает галочку и «архивируется»
   Сцена 3 «handoff»  — сообщение летит по дуге от бота к
                        аватару человека и «передаётся» ему
   ========================================================== */
(function () {
  const block = document.querySelector('[data-svc-block]');
  if (!block || !window.gsap) return;

  const reduce = window.AiCo && AiCo.reduce;
  const stage = block.querySelector('.svc-stage');

  /* ------------------------------------------------------
     Общий таймлайн-«часы»: пауза вне экрана работает сразу
     для всех трёх сцен, потому что они тикают в нём же.
     ------------------------------------------------------ */
  const master = gsap.timeline({ paused: true });
  master.set({}, {}, 1e6); // держим таймлайн «бесконечным»
  const now = () => master.time();
  const wait = (s) => new Promise((r) => master.call(r, null, now() + s));

  /* ========================================================
     СЦЕНА 1 — Trained on your voice
     ======================================================== */
  const card = block.querySelector('[data-chat]');
  const ASSISTANT_NAME = 'AI Assistant';
  const DIALOGS = [
    // photo — необязательное поле: путь к файлу в assets/services/.
    // Нет фото — показываются initials на цветном кружке, как сейчас.
    { name: 'Jordan Lee', initials: 'JL', photo: 'assets/photo/avatar/man.jpg', q: 'Hi! Do you offer any discounts for annual plans?', a: "Yes! Annual plans save 20% compared to monthly billing. I've put together your pricing breakdown below.", btn: 'View Pricing' },
    { name: 'Maria Chen', initials: 'MC', photo: 'assets/photo/avatar/woman.jpg', q: 'Can I change my subscription plan later?', a: 'Of course. You can upgrade or downgrade anytime from your account settings, with no extra fees.', btn: 'Open Settings' },
    { name: 'Alex Novak', initials: 'AN', photo: 'assets/photo/avatar/man1.jpg', q: 'Is there a free trial available?', a: 'Yes, every plan includes a 14-day free trial. No credit card required to start.', btn: 'Start Free Trial' },
  ];

  const voiceEl = {
    initials: card.querySelector('[data-q-initials]'),
    photo: card.querySelector('[data-q-photo]'),
    name: card.querySelector('[data-q-name]'),
    q: card.querySelector('[data-q-text]'),
    aSub: card.querySelector('[data-a-sub]'),
    aText: card.querySelector('[data-a-text]'),
    btn: card.querySelector('[data-a-btn]'),
    typing: card.querySelector('[data-step="typing"]'),
    stepQ: [...card.querySelectorAll('[data-step="q"]')],
    stepA: [...card.querySelectorAll('[data-step="a"]')],
  };
  card.querySelector('.chat__avatar--bot + .chat__meta .chat__name').textContent = ASSISTANT_NAME;

  function fillVoice(d) {
    if (d.photo) {
      voiceEl.photo.src = d.photo;
      voiceEl.photo.hidden = false;
      voiceEl.initials.hidden = true;
    } else {
      voiceEl.photo.hidden = true;
      voiceEl.initials.hidden = false;
      voiceEl.initials.textContent = d.initials;
    }
    voiceEl.name.textContent = d.name;
    voiceEl.q.textContent = d.q;
    voiceEl.aSub.firstChild.textContent = `To ${d.name} `;
    voiceEl.aText.textContent = d.a;
    voiceEl.btn.textContent = d.btn;
  }

  // плавный рост высоты карточки: меряем «до», показываем новые блоки, меряем «после».
  // Фабрика, а не одна функция — так же используется и во 2-й карточке (сцена handoff).
  function makeGrow(cardEl) {
    return function grow(show, { hide = [], dur = 0.45 } = {}) {
      const h0 = cardEl.offsetHeight;
      hide.forEach((n) => (n.hidden = true));
      show.forEach((n) => (n.hidden = false));
      gsap.set(show, { autoAlpha: 0, y: 8 });
      cardEl.style.height = 'auto';
      const h1 = cardEl.offsetHeight;
      cardEl.style.height = h0 + 'px';

      master.fromTo(cardEl, { height: h0 }, { height: h1, duration: dur, ease: 'power3.inOut' }, now());
      master.to(show, { autoAlpha: 1, y: 0, duration: 0.4, stagger: 0.07, ease: 'power2.out' }, now() + dur * 0.4);
      master.call(() => { cardEl.style.height = 'auto'; }, null, now() + dur);
      return dur * 0.4 + 0.4 + 0.07 * (show.length - 1);
    };
  }
  const grow = makeGrow(card);

  function resetVoice() {
    [...voiceEl.stepQ, voiceEl.typing, ...voiceEl.stepA].forEach((n) => { n.hidden = true; });
    gsap.set([...voiceEl.stepQ, voiceEl.typing, ...voiceEl.stepA], { clearProps: 'opacity,visibility,transform' });
    card.style.height = 'auto';
    gsap.set(card, { autoAlpha: 0, y: 14, scale: 0.96 });
  }

  async function sceneVoice() {
    let i = 0;
    while (true) {
      fillVoice(DIALOGS[i++ % DIALOGS.length]);
      resetVoice();

      master.to(card, { autoAlpha: 1, y: 0, scale: 1, duration: 0.55, ease: 'back.out(1.4)' }, now());
      await wait(1.15);

      await wait(grow(voiceEl.stepQ) + 0.6);

      await wait(grow([voiceEl.typing], { dur: 0.3 }) + 0.9);

      const withoutBtn = voiceEl.stepA.filter((n) => n !== voiceEl.btn);
      const t = grow(withoutBtn.concat(voiceEl.btn), { hide: [voiceEl.typing], dur: 0.55 });
      master.fromTo(voiceEl.btn, { scale: 0.92 }, { scale: 1, duration: 0.5, ease: 'back.out(2)' }, now() + t);
      await wait(t + 0.5 + 2.4);

      master.to(card, { autoAlpha: 0, y: -28, duration: 0.6, ease: 'power2.in' }, now());
      await wait(0.75);
    }
  }

  /* ========================================================
     СЦЕНА 2 — Resolves 80% instantly
     ======================================================== */
  const queue = block.querySelector('[data-queue]');
  const queueRows = queue ? [...queue.querySelectorAll('[data-row]')] : [];
  // time — длительность ответа; clock/period — во сколько пришло сообщение,
  // специально вперемешку день/ночь в каждом наборе, чтобы наглядно
  // показать «day or night» из текста пункта, а не только словами
  const QUEUE_SETS = [
    [
      { text: "Where's my order #1043?", time: '1.8s', clock: '11:42 PM', period: 'night' },
      { text: 'Do you offer refunds?', time: '2.4s', clock: '9:15 AM', period: 'day' },
      { text: 'Is this still available?', time: '0.9s', clock: '3:07 AM', period: 'night' },
    ],
    [
      { text: 'When will my package arrive?', time: '1.2s', clock: '7:30 AM', period: 'day' },
      { text: 'Can I change my address?', time: '2.1s', clock: '10:52 PM', period: 'night' },
      { text: 'Do you ship internationally?', time: '1.6s', clock: '1:18 PM', period: 'day' },
    ],
    [
      { text: 'How do I reset my password?', time: '0.7s', clock: '4:44 AM', period: 'night' },
      { text: 'Is there a mobile app?', time: '1.4s', clock: '2:30 PM', period: 'day' },
      { text: 'Can I get an invoice copy?', time: '2.0s', clock: '8:05 PM', period: 'night' },
    ],
  ];
  // лёгкий разброс по наклону при приземлении — X и вертикальное чередование
  // уже заданы в CSS (align-self/margin), здесь только вращение под каждую строку
  const TICKET_TILT = [-1.3, 0.9, -0.7];

  function resetQueue() {
    queueRows.forEach((row) => {
      gsap.set(row, { autoAlpha: 0, y: -14, rotation: 0 });
      gsap.set(row.querySelector('.ticket__check'), { autoAlpha: 0, scale: 0 });
    });
  }

  async function sceneInstant() {
    let i = 0;
    if (!queueRows.length) return;
    while (true) {
      const rows = QUEUE_SETS[i++ % QUEUE_SETS.length];
      rows.forEach((r, n) => {
        queueRows[n].querySelector('[data-q-text]').textContent = r.text;
        queueRows[n].querySelector('[data-q-time]').textContent = r.time;
        queueRows[n].querySelector('[data-q-clock]').textContent = r.clock;
        queueRows[n].querySelector('[data-q-clock-wrap]').dataset.period = r.period;
      });
      resetQueue();

      for (let n = 0; n < queueRows.length; n++) {
        const row = queueRows[n];
        master.to(row, { autoAlpha: 1, y: 0, rotation: TICKET_TILT[n], duration: 0.45, ease: 'power2.out' }, now());
        await wait(0.45);

        const check = row.querySelector('.ticket__check');
        master.to(check, { autoAlpha: 1, scale: 1, duration: 0.3, ease: 'back.out(2.4)' }, now());
        master.to(row, { autoAlpha: 0.55, duration: 0.35, ease: 'power2.out' }, now() + 0.05);
        await wait(0.6);
      }

      await wait(1.0);
      master.to(queueRows, { autoAlpha: 0, y: -22, duration: 0.4, stagger: 0.06, ease: 'power2.in' }, now());
      await wait(0.75);
    }
  }

  /* ========================================================
     СЦЕНА 3 — Smooth handoff: два окна подряд.
     Окно A — глазами клиента: сообщение с двумя темами, бот
       выделяет их тегами, не справляется сам и честно
       предупреждает автоответом, что подключает специалиста.
     Окно B — глазами агента: открывается уже с пересказом
       вопроса и теми же тегами (видно, что информация доехала),
       и только потом — ответ агента, который отвечает сразу
       по существу, ничего не переспрашивая.
     ======================================================== */
  const hCardA = block.querySelector('[data-chat2a]');
  const hCardB = block.querySelector('[data-chat2b]');
  const growA = hCardA ? makeGrow(hCardA) : null;
  const growB = hCardB ? makeGrow(hCardB) : null;

  const HANDOFF_CASES = [
    // photo — необязательное поле, как и в сцене 1: путь к файлу в assets/photo/.
    // Нет фото — показываются initials на цветном кружке. Один и тот же клиент
    // получает одинаковое фото в обоих окнах (окно A и мини-аватар в окне B).
    { name: 'Taylor Brooks', initials: 'TB', photo: 'assets/photo/avatar/man2.jpg',
      q: "Hi, my order #4521 hasn't arrived and I never got a refund for the last one either.",
      tag1: 'Order #4521', tag2: 'Refund · last month',
      reply: "Hi! I can see both issues — let's start with your refund from last month." },
    { name: 'Priya Shah', initials: 'PS', photo: 'assets/photo/avatar/woman2.jpg',
      q: 'My subscription was charged twice this month, and I still haven\u2019t heard back about my downgrade request.',
      tag1: 'Double charge', tag2: 'Downgrade request',
      reply: "Hi Priya, I've found the duplicate charge and your downgrade note — refunding you now." },
    { name: 'Liam Carter', initials: 'LC', photo: 'assets/photo/avatar/man1.jpg',
      q: "I'm locked out of my account and I already reset my password twice today.",
      tag1: 'Account locked', tag2: '2 reset attempts',
      reply: 'Hi Liam, I can see the failed resets — let\u2019s get you back in securely.' },
  ];

  const hEl = hCardA && hCardB && {
    // окно A
    initials: hCardA.querySelector('[data-h-initials]'),
    photo: hCardA.querySelector('[data-h-photo]'),
    name: hCardA.querySelector('[data-h-name]'),
    q: hCardA.querySelector('[data-h-text]'),
    tag1: hCardA.querySelector('[data-h-tag1]'),
    tag2: hCardA.querySelector('[data-h-tag2]'),
    auto: hCardA.querySelector('[data-h-auto]'),
    tags: [...hCardA.querySelectorAll('[data-step="tags"]')],
    thinking: hCardA.querySelector('[data-step="thinking"]'),
    stepQ: [...hCardA.querySelectorAll('[data-step="q"]')],
    stepA: [...hCardA.querySelectorAll('[data-step="a"]')],
    // окно B
    initials2: hCardB.querySelector('[data-h-initials2]'),
    photo2: hCardB.querySelector('[data-h-photo2]'),
    name2: hCardB.querySelector('[data-h-name2]'),
    q2: hCardB.querySelector('[data-h-text2]'),
    tag1b: hCardB.querySelector('[data-h-tag1b]'),
    tag2b: hCardB.querySelector('[data-h-tag2b]'),
    agentSub: hCardB.querySelector('[data-h-agent-sub]'),
    reply: hCardB.querySelector('[data-h-reply]'),
    stepRecap: [...hCardB.querySelectorAll('[data-step="recap"]')],
    stepReply: [...hCardB.querySelectorAll('[data-step="reply"]')],
  };

  // показывает фото, если оно задано, иначе — initials на цветном кружке
  function setAvatar(initialsEl, photoEl, initials, photo) {
    if (photo) {
      photoEl.src = photo;
      photoEl.hidden = false;
      initialsEl.hidden = true;
    } else {
      photoEl.hidden = true;
      initialsEl.hidden = false;
      initialsEl.textContent = initials;
    }
  }

  function fillHandoff(d) {
    setAvatar(hEl.initials, hEl.photo, d.initials, d.photo);
    hEl.name.textContent = d.name;
    hEl.q.textContent = d.q;
    hEl.tag1.textContent = d.tag1;
    hEl.tag2.textContent = d.tag2;

    setAvatar(hEl.initials2, hEl.photo2, d.initials, d.photo);
    hEl.name2.textContent = d.name;
    hEl.q2.textContent = d.q;
    hEl.tag1b.textContent = d.tag1;
    hEl.tag2b.textContent = d.tag2;
    hEl.agentSub.firstChild.textContent = `To ${d.name} `;
    hEl.reply.textContent = d.reply;
  }

  function resetHandoffA() {
    [...hEl.stepQ, ...hEl.tags, hEl.thinking, ...hEl.stepA].forEach((n) => { n.hidden = true; });
    gsap.set([...hEl.stepQ, ...hEl.tags, hEl.thinking, ...hEl.stepA], { clearProps: 'opacity,visibility,transform' });
    hCardA.style.height = 'auto';
    hCardA.hidden = false;
    gsap.set(hCardA, { autoAlpha: 0, y: 14, scale: 0.96 });
  }

  function resetHandoffB() {
    [...hEl.stepRecap, ...hEl.stepReply].forEach((n) => { n.hidden = true; });
    gsap.set([...hEl.stepRecap, ...hEl.stepReply], { clearProps: 'opacity,visibility,transform' });
    hCardB.style.height = 'auto';
    hCardB.hidden = true;
    gsap.set(hCardB, { autoAlpha: 0, y: 14, scale: 0.96 });
  }

  async function sceneHandoff() {
    let i = 0;
    if (!hCardA || !hCardB) return;
    while (true) {
      fillHandoff(HANDOFF_CASES[i++ % HANDOFF_CASES.length]);
      resetHandoffA();
      resetHandoffB();

      /* ---------- Окно A: клиент ---------- */
      master.to(hCardA, { autoAlpha: 1, y: 0, scale: 1, duration: 0.55, ease: 'back.out(1.4)' }, now());
      await wait(1.0);

      await wait(growA(hEl.stepQ) + 0.5);

      // бот выцепляет главное — теги появляются по очереди
      await wait(growA(hEl.tags) + 0.6);

      // бот думает, потом честно предупреждает автоответом
      await wait(growA([hEl.thinking], { dur: 0.3 }) + 0.6);
      const tA = growA(hEl.stepA, { hide: [hEl.thinking], dur: 0.5 });
      await wait(tA + 1.6);

      // окно A уходит, окно B ещё не появилось — короткая пауза «переключения»
      master.to(hCardA, { autoAlpha: 0, y: -20, duration: 0.45, ease: 'power2.in' }, now());
      await wait(0.55);
      hCardA.hidden = true;

      /* ---------- Окно B: агент ---------- */
      hCardB.hidden = false;
      master.to(hCardB, { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.4)' }, now());
      await wait(0.5);

      // открывается уже с пересказом вопроса и теми же тегами — это и есть
      // «переданный контекст», видимый глазами, а не только на словах
      await wait(growB(hEl.stepRecap) + 0.7);

      // и только теперь ответ агента, который отвечает сразу по существу
      const tB = growB(hEl.stepReply);
      await wait(tB + 2.4);

      master.to(hCardB, { autoAlpha: 0, y: -20, duration: 0.5, ease: 'power2.in' }, now());
      await wait(0.7);
      hCardB.hidden = true;
    }
  }

  /* ------------------------------------------------------
     Без анимаций: сразу финальный кадр сцены 1
     ------------------------------------------------------ */
  if (reduce) {
    fillVoice(DIALOGS[0]);
    voiceEl.typing.hidden = true;
    [...voiceEl.stepQ, ...voiceEl.stepA].forEach((n) => { n.hidden = false; });
    return;
  }

  /* ------------------------------------------------------
     Переключение пунктов списка / видимой сцены
     ------------------------------------------------------ */
  const SCENES = { voice: sceneVoice, instant: sceneInstant, handoff: sceneHandoff };
  const sceneRoots = [...block.querySelectorAll('.svc-scene')];
  const items = [...block.querySelectorAll('.svc-item')];
  const started = new Set();
  const bars = AiCo.itemBars(items);   // полоска прогресса под активным пунктом
  const N = items.length;
  const idxOf = () => items.findIndex((b) => b.classList.contains('is-active'));

  items.forEach((btn) => { if (!SCENES[btn.dataset.scene]) btn.disabled = true; });

  function activate(btn) {
    const name = btn.dataset.scene;
    items.forEach((b) => {
      const on = b === btn;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    sceneRoots.forEach((r) => r.classList.toggle('is-visible', r.dataset.sceneEl === name));
    stage.dataset.active = name; // управляет направлением фоновых «клавиш» в CSS
    if (!started.has(name)) { started.add(name); SCENES[name](); }
  }

  // что делает клик по пункту, зависит от режима (ниже): на десктопе — доскроллить,
  // на мобильных — переключить сразу и перезапустить таймер
  let onItemClick = (i) => activate(items[i]);
  items.forEach((btn, i) => btn.addEventListener('click', () => onItemClick(i)));

  /* ------------------------------------------------------
     Старт при появлении, пауза вне экрана
     ------------------------------------------------------ */
  gsap.set(card, { autoAlpha: 0 });
  let entered = false;
  let inView = false;
  let autoTick = null; // таймер автопереключения (только мобильный режим)
  new IntersectionObserver(([e]) => {
    inView = e.isIntersecting;
    if (e.isIntersecting) {
      master.resume();
      if (autoTick) autoTick.play();
      if (!entered) { entered = true; activate(items.find((b) => b.classList.contains('is-active')) || items[0]); }
    } else {
      master.pause();
      if (autoTick) autoTick.pause();
    }
  }, { threshold: 0.25 }).observe(stage);

  /* ------------------------------------------------------
     Режимы переключения (gsap.matchMedia пересобирает их при смене ширины)

     Десктоп: блок «прилипает» к центру экрана (pin), и пока листаешь колесом,
     пункты сменяют друг друга; после последнего блок отпускает страницу.
     Полоска под активным пунктом — прогресс прокрутки внутри этого пункта.
     Клик по пункту — плавный доскролл к нужному отрезку.

     Мобильные: блок не закрепляется (список и сцена в колонку не влезли бы
     в экран), пункты идут по таймеру, как в остальных блоках; клик тоже работает.
     ------------------------------------------------------ */
  const mm = gsap.matchMedia();

  mm.add('(min-width: 901px)', () => {
    if (!window.ScrollTrigger) return;
    const perItem = () => Math.max(320, window.innerHeight * 0.55); // сколько прокрутки на один пункт
    let lock = false;                                               // блокируем onUpdate на время доскролла по клику

    function sync(p) {
      const idx = Math.min(N - 1, Math.floor(p * N));
      if (idx !== idxOf()) activate(items[idx]);
      items.forEach((_, i) => bars.set(i, i === idx ? p * N - idx : 0));
    }

    const st = ScrollTrigger.create({
      trigger: block,
      start: 'center center',
      end: () => `+=${Math.round(perItem() * N)}`,
      pin: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: (self) => { if (!lock) sync(self.progress); },
    });

    onItemClick = (i) => {
      activate(items[i]);            // сцена меняется сразу, не дожидаясь конца доскролла
      bars.clear();
      lock = true;                   // пока едем, промежуточные пункты не мелькают
      const y = st.start + ((i + 0.5) / N) * (st.end - st.start);
      const done = () => { lock = false; sync(st.progress); };
      if (AiCo.lenis) AiCo.lenis.scrollTo(y, { duration: 1, onComplete: done });
      else { window.scrollTo({ top: y, behavior: 'smooth' }); gsap.delayedCall(1, done); }
    };

    return () => { st.kill(); onItemClick = (i) => activate(items[i]); };
  });

  mm.add('(max-width: 900px)', () => {
    const t = { v: 0 };
    let cur = Math.max(0, idxOf());
    const go = (i) => { cur = i; activate(items[i]); bars.clear(); t.v = 0; autoTick.restart(); };
    autoTick = gsap.to(t, {
      v: 1, duration: 7, ease: 'none', paused: true,
      onUpdate: () => bars.set(cur, t.v),
      onComplete: () => go((cur + 1) % N),
    });
    onItemClick = go;
    if (inView) autoTick.play(); // режим включился при уже видимом блоке (например, при повороте экрана)
    return () => { autoTick.kill(); autoTick = null; onItemClick = (i) => activate(items[i]); };
  });

  /* лёгкое появление заголовка и списка */
  if (window.ScrollTrigger) {
    document.querySelectorAll('.svc [data-svc-reveal]').forEach((n) => {
      gsap.from(n, {
        opacity: 0, y: 20, duration: 0.8,
        scrollTrigger: { trigger: n, start: 'top 85%', once: true },
      });
    });
  }
})();

/* ==========================================================
   БЛОК 3 — Business Process Automation

   Как и в блоках 2 и 4: пункты списка переключают сцену справа.
   1) workflow — карта процесса: шаги зажигаются по цепочке, затем
                 появляются инструменты, к которым всё подключено
   2) trigger  — три способа запуска: по расписанию и по событиям;
                 каждый срабатывает сам (Waiting -> Running -> Done)
   3) runlog   — журнал запуска: строки появляются по очереди,
                 спиннер у каждой сменяется галочкой
   ========================================================== */
(function () {
  const stage = document.querySelector('[data-auto-stage]');
  if (!stage || !window.gsap) return;

  const reduce = window.AiCo && AiCo.reduce;
  const rootOf = (name) => stage.querySelector(`[data-scene-el="${name}"]`);

  /* ========================================================
     Сцена 1 — Built around your workflow
     ======================================================== */
  const workflow = (() => {
    const root = rootOf('workflow');
    const card = root.querySelector('[data-wf]');
    const steps = [...root.querySelectorAll('[data-wf-step]')];
    const links = [...root.querySelectorAll('[data-wf-link] i')];
    const tools = root.querySelector('[data-wf-tools]');
    const chips = [...root.querySelectorAll('[data-wf-chip]')];

    function next() {}
    function reset() {
      steps.forEach((s) => s.classList.remove('is-on'));
      gsap.set(card, { autoAlpha: 0, y: 14, scale: 0.96 });
      gsap.set(steps, { autoAlpha: 0, y: 8 });
      gsap.set(links, { scaleX: 0 });
      gsap.set(tools, { autoAlpha: 0, y: 8 });
      gsap.set(chips, { autoAlpha: 0, y: 6 });
    }
    function final() {
      steps.forEach((s) => s.classList.add('is-on'));
      gsap.set(card, { autoAlpha: 1, y: 0, scale: 1 });
      gsap.set(steps, { autoAlpha: 1, y: 0 });
      gsap.set(links, { scaleX: 1 });
      gsap.set(tools, { autoAlpha: 1, y: 0 });
      gsap.set(chips, { autoAlpha: 1, y: 0 });
    }
    function build() {
      const tl = gsap.timeline({ paused: true }); // один круг: дальше сцену сменяет переключатель
      tl.to(card, { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.4)' })
        .to(steps, { autoAlpha: 1, y: 0, duration: 0.35, ease: 'power2.out', stagger: 0.12 }, '+=0.15')
        .call(() => steps[0].classList.add('is-on'), null, '+=0.2');
      // цепочка зажигается слева направо: линия дорисовывается, затем включается следующий шаг
      links.forEach((l, i) => {
        tl.to(l, { scaleX: 1, duration: 0.5, ease: 'power2.inOut' }, '+=0.1')
          .call(() => steps[i + 1].classList.add('is-on'));
      });
      tl.to(tools, { autoAlpha: 1, y: 0, duration: 0.4 }, '+=0.3')
        .to(chips, { autoAlpha: 1, y: 0, duration: 0.3, stagger: 0.1 }, '<0.15')
        .to({}, { duration: 2.2 })
        .to(card, { autoAlpha: 0, y: -16, duration: 0.4, ease: 'power2.in' })
        .to({}, { duration: 0.4 });
      return tl;
    }
    return { root, reset, next, build, final };
  })();

  /* ========================================================
     Сцена 2 — Runs on schedule or trigger
     ======================================================== */
  const trigger = (() => {
    const root = rootOf('trigger');
    const card = root.querySelector('[data-tg]');
    const rows = [...root.querySelectorAll('[data-tg-row]')];
    const pills = rows.map((r) => r.querySelector('[data-tg-pill]'));
    const foot = root.querySelector('[data-tg-foot]');
    const WAIT = ['Scheduled', 'Listening', 'Listening'];
    const LABEL = { run: 'Running', done: 'Done' };

    const setPill = (i, state) => {
      pills[i].dataset.state = state;
      pills[i].textContent = state === 'wait' ? WAIT[i] : LABEL[state];
      rows[i].classList.toggle('is-run', state === 'run');
    };

    function next() {}
    function reset() {
      rows.forEach((_, i) => setPill(i, 'wait'));
      gsap.set(card, { autoAlpha: 0, y: 14, scale: 0.96 });
      gsap.set(rows, { autoAlpha: 0, x: -16 });
      gsap.set(foot, { autoAlpha: 0, y: 8 });
    }
    function final() {
      rows.forEach((_, i) => setPill(i, 'done'));
      gsap.set(card, { autoAlpha: 1, y: 0, scale: 1 });
      gsap.set(rows, { autoAlpha: 1, x: 0 });
      gsap.set(foot, { autoAlpha: 1, y: 0 });
    }
    function build() {
      const tl = gsap.timeline({ paused: true }); // один круг: дальше сцену сменяет переключатель
      tl.to(card, { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.4)' })
        .to(rows, { autoAlpha: 1, x: 0, duration: 0.4, ease: 'power2.out', stagger: 0.2 }, '+=0.2')
        .to(foot, { autoAlpha: 1, y: 0, duration: 0.35 }, '+=0.1');
      // триггеры срабатывают по очереди — без единого клика
      rows.forEach((_, i) => {
        tl.call(() => setPill(i, 'run'), null, '+=0.45')
          .call(() => setPill(i, 'done'), null, '+=0.9');
      });
      tl.to({}, { duration: 2 })
        .to(card, { autoAlpha: 0, y: -16, duration: 0.4, ease: 'power2.in' })
        .to({}, { duration: 0.4 });
      return tl;
    }
    return { root, reset, next, build, final };
  })();

  /* ========================================================
     Сцена 3 — Tracks every step
     ======================================================== */
  const runlog = (() => {
    const root = rootOf('runlog');
    const card = root.querySelector('[data-lg]');
    const rows = [...root.querySelectorAll('[data-lg-row]')];
    const pill = root.querySelector('[data-lg-pill]');
    const foot = root.querySelector('[data-lg-foot]');

    const setPill = (state) => {
      pill.dataset.state = state;
      pill.textContent = state === 'done' ? 'Success' : 'Running';
    };

    function next() {}
    function reset() {
      rows.forEach((r) => r.classList.remove('is-done'));
      setPill('run');
      gsap.set(card, { autoAlpha: 0, y: 14, scale: 0.96 });
      gsap.set(rows, { autoAlpha: 0, x: -12 });
      gsap.set(foot, { autoAlpha: 0, y: 8 });
    }
    function final() {
      rows.forEach((r) => r.classList.add('is-done'));
      setPill('done');
      gsap.set(card, { autoAlpha: 1, y: 0, scale: 1 });
      gsap.set(rows, { autoAlpha: 1, x: 0 });
      gsap.set(foot, { autoAlpha: 1, y: 0 });
    }
    function build() {
      const tl = gsap.timeline({ paused: true }); // один круг: дальше сцену сменяет переключатель
      tl.to(card, { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.4)' });
      // каждая строка появляется со спиннером и через мгновение получает галочку
      rows.forEach((r, i) => {
        tl.to(r, { autoAlpha: 1, x: 0, duration: 0.3, ease: 'power2.out' }, i === 0 ? '+=0.25' : '+=0.15')
          .call(() => r.classList.add('is-done'), null, '+=0.45');
      });
      tl.call(() => setPill('done'), null, '+=0.2')
        .to(foot, { autoAlpha: 1, y: 0, duration: 0.35 }, '<')
        .to({}, { duration: 2.2 })
        .to(card, { autoAlpha: 0, y: -16, duration: 0.4, ease: 'power2.in' })
        .to({}, { duration: 0.4 });
      return tl;
    }
    return { root, reset, next, build, final };
  })();

  AiCo.sceneSwitcher({ stage, scenes: { workflow, trigger, runlog }, reduce });
})();

/* ==========================================================
   БЛОК 4 — The Workflow Audit

   Как и в блоке 2: пункты списка переключают сцену справа.
   1) usage  — тепловая карта активности команды: клетки проявляются
               волной, растёт счётчик «analyzed», затем «горячая»
               строка перекрашивается в акцент
   2) ranked — полоски растут в случайном порядке, затем строки САМИ
               переезжают на свои места по убыванию, появляются номера
   3) plan   — три шага автоматизации по приоритету + итог экономии

   Данные общие для всех трёх сцен: одна «история» на круг (см.
   STORIES), поэтому проблемный процесс в карте, рейтинге и плане —
   один и тот же. История меняется, когда автопереключение проходит
   полный цикл (после «plan» снова «usage»).
   ========================================================== */
(function () {
  const stage = document.querySelector('[data-audit-stage]');
  if (!stage || !window.gsap) return;

  const reduce = window.AiCo && AiCo.reduce;
  const rootOf = (name) => stage.querySelector(`[data-scene-el="${name}"]`);
  const clamp01 = (x) => Math.min(1, Math.max(0, x));

  const STORIES = [
    {
      rank: [['Support', 4], ['Approvals', 15], ['Reporting', 6], ['Onboarding', 11], ['Billing', 8]],
      heat: {
        rows: ['Email', 'Spreadsheets', 'Approvals', 'Reporting'], hot: 2, count: 12480, chips: ['Email', 'CRM', 'Calendar', 'Docs'],
        data: [[3, 4, 3, 4, 3, 1, 0], [2, 3, 3, 2, 3, 0, 0], [4, 4, 4, 3, 4, 2, 1], [1, 2, 2, 3, 2, 0, 0]],
      },
      plan: [['Automate approval routing', 12, 'quick'], ['Auto-fill onboarding forms', 8, 'medium'], ['Sync invoices to billing', 6, 'medium']],
    },
    {
      rank: [['Onboarding', 6], ['Reporting', 5], ['Data entry', 13], ['Approvals', 9], ['Support', 7]],
      heat: {
        rows: ['Email', 'CRM', 'Data entry', 'Reporting'], hot: 2, count: 9860, chips: ['CRM', 'Email', 'Sheets', 'Docs'],
        data: [[3, 3, 4, 3, 3, 1, 0], [2, 3, 3, 4, 3, 0, 0], [4, 4, 3, 4, 4, 1, 0], [1, 1, 2, 2, 3, 0, 0]],
      },
      plan: [['Auto-capture data from emails', 10, 'quick'], ['Automate approval routing', 6, 'quick'], ['Auto-triage support tickets', 5, 'medium']],
    },
    {
      rank: [['Support', 8], ['Billing', 5], ['Reporting', 14], ['Onboarding', 7], ['Scheduling', 10]],
      heat: {
        rows: ['Email', 'Calendar', 'Reporting', 'Spreadsheets'], hot: 2, count: 15230, chips: ['Email', 'Calendar', 'Docs', 'Chat'],
        data: [[3, 4, 3, 3, 4, 1, 0], [2, 3, 4, 3, 2, 0, 0], [4, 3, 4, 4, 4, 2, 0], [2, 2, 3, 2, 3, 0, 0]],
      },
      plan: [['Auto-generate weekly reports', 11, 'quick'], ['Auto-schedule meetings', 8, 'quick'], ['Auto-triage support tickets', 6, 'medium']],
    },
  ];
  let epoch = 0; // общий счётчик историй: растёт, когда автопереключение вернулось с последнего пункта на первый
  const story = () => STORIES[epoch % STORIES.length];

  /* ========================================================
     Сцена 1 — Based on real usage: тепловая карта
     ======================================================== */
  const usage = (() => {
    const root = rootOf('usage');
    const card = root.querySelector('[data-hm]');
    const countEl = root.querySelector('[data-hm-count]');
    const prog = root.querySelector('[data-hm-prog]');
    const labels = [...root.querySelectorAll('[data-hm-label]')];
    const cells = [...root.querySelectorAll('[data-hm-cell]')]; // построчно, 4 x 7
    const chips = [...root.querySelectorAll('[data-hm-chip]')];
    const chipTexts = chips.map((c) => c.querySelector('[data-hm-chip-text]'));
    const p = { v: 0 };
    let s = STORIES[0];
    const fmtCount = (v) => Math.round(v * s.heat.count).toLocaleString('en-US');

    function markHot(on) {
      const r = s.heat.hot;
      cells.slice(r * 7, r * 7 + 7).forEach((c) => c.classList.toggle('is-hot', on));
      labels[r].classList.toggle('is-hot', on);
    }
    function next() {
      s = story();
      s.heat.rows.forEach((name, r) => { labels[r].textContent = name; });
      cells.forEach((c, i) => { c.dataset.level = s.heat.data[Math.floor(i / 7)][i % 7]; });
      s.heat.chips.forEach((name, i) => { chipTexts[i].textContent = name; });
    }
    function reset() {
      p.v = 0;
      countEl.textContent = '0';
      cells.forEach((c) => c.classList.remove('is-hot'));
      labels.forEach((l) => l.classList.remove('is-hot'));
      gsap.set(card, { autoAlpha: 0, y: 14, scale: 0.96 });
      gsap.set(cells, { autoAlpha: 0, scale: 0.4 });
      gsap.set(prog, { width: '0%' });
      gsap.set(chips, { autoAlpha: 0, y: 6 });
    }
    function final() {
      countEl.textContent = fmtCount(1);
      markHot(true);
      gsap.set(card, { autoAlpha: 1, y: 0, scale: 1 });
      gsap.set(cells, { autoAlpha: 1, scale: 1 });
      gsap.set(prog, { width: '100%' });
      gsap.set(chips, { autoAlpha: 1, y: 0 });
    }
    function build() {
      const tl = gsap.timeline({ paused: true }); // один круг: дальше сцену сменяет переключатель
      tl.to(card, { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.4)' })
        .addLabel('wave', '+=0.25')
        // клетки проявляются волной слева направо, строки чуть с запаздыванием
        .to(cells, {
          autoAlpha: 1, scale: 1, duration: 0.35, ease: 'back.out(1.6)',
          stagger: (i) => (i % 7) * 0.13 + Math.floor(i / 7) * 0.06,
        }, 'wave')
        .to(prog, { width: '100%', duration: 1.5, ease: 'power1.inOut' }, 'wave')
        .to(p, {
          v: 1, duration: 1.5, ease: 'power2.out',
          onUpdate: () => { countEl.textContent = fmtCount(p.v); },
        }, 'wave')
        // «горячая» строка перекрашивается в акцент (плавность даёт CSS-transition)
        .call(() => markHot(true), null, '+=0.35')
        .to(chips, { autoAlpha: 1, y: 0, duration: 0.35, stagger: 0.1 }, '+=0.3')
        .to({}, { duration: 2.2 })
        .to(card, { autoAlpha: 0, y: -16, duration: 0.4, ease: 'power2.in' })
        .to({}, { duration: 0.4 });
      return tl;
    }
    return { root, reset, next, build, final };
  })();

  /* ========================================================
     Сцена 2 — Bottlenecks, ranked: рейтинг, который сам сортируется
     ======================================================== */
  const ranked = (() => {
    const root = rootOf('ranked');
    const card = root.querySelector('[data-rk]');
    const rows = [...root.querySelectorAll('[data-rk-row]')];
    const ranks = rows.map((r) => r.querySelector('[data-rk-rank]'));
    const names = rows.map((r) => r.querySelector('[data-rk-name]'));
    const bars = rows.map((r) => r.querySelector('[data-rk-bar]'));
    const hrsEls = rows.map((r) => r.querySelector('[data-rk-hrs]'));
    const ps = { v: 0 };   // прогресс сортировки
    const pr = { v: 0 };   // прогресс появления номеров
    let order = [];        // order[i] — место строки i в отсортированном виде (0 = первое)
    let step = 0;          // расстояние между соседними строками в px

    function next() {
      const list = story().rank;
      const max = Math.max(...list.map((x) => x[1]));
      order = [];
      list.map((_, i) => i).sort((a, b) => list[b][1] - list[a][1]).forEach((rowIdx, rk) => { order[rowIdx] = rk; });
      rows.forEach((_, i) => {
        names[i].textContent = list[i][0];
        hrsEls[i].textContent = `${list[i][1]} h`;
        bars[i].style.width = `${(list[i][1] / max) * 100}%`;
        ranks[i].textContent = order[i] + 1;
      });
    }
    function reset() {
      ps.v = 0; pr.v = 0;
      rows.forEach((r) => r.classList.remove('is-top'));
      gsap.set(card, { autoAlpha: 0, y: 14, scale: 0.96 });
      gsap.set(rows, { autoAlpha: 0, y: 0 });
      gsap.set(bars, { scaleX: 0 });
      gsap.set(hrsEls, { autoAlpha: 0 });
      gsap.set(ranks, { autoAlpha: 0, scale: 0.6 });
    }
    function markTop() { rows.forEach((r, i) => r.classList.toggle('is-top', order[i] === 0)); }
    function applySort() { rows.forEach((r, i) => gsap.set(r, { y: (order[i] - i) * step * ps.v })); }
    function applyRanks() {
      const n = rows.length, lag = 0.15;
      ranks.forEach((el, i) => {
        const t = clamp01((pr.v - order[i] * lag) / (1 - (n - 1) * lag)); // номера появляются по порядку мест
        gsap.set(el, { autoAlpha: t, scale: 0.6 + 0.4 * t });
      });
    }
    function final() {
      markTop();
      ps.v = 1; pr.v = 1;
      step = rows.length > 1 ? rows[1].offsetTop - rows[0].offsetTop : 0;
      gsap.set(card, { autoAlpha: 1, y: 0, scale: 1 });
      gsap.set(rows, { autoAlpha: 1 });
      gsap.set(bars, { scaleX: 1 });
      gsap.set(hrsEls, { autoAlpha: 1 });
      applySort();
      applyRanks();
    }
    function build() {
      const tl = gsap.timeline({ paused: true }); // один круг: дальше сцену сменяет переключатель
      tl.to(card, { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.4)' })
        .addLabel('grow', '+=0.25')
        .to(rows, { autoAlpha: 1, duration: 0.3, stagger: 0.1 }, 'grow')
        .to(bars, { scaleX: 1, duration: 0.7, ease: 'power3.out', stagger: 0.1 }, 'grow+=0.1')
        .to(hrsEls, { autoAlpha: 1, duration: 0.3, stagger: 0.1 }, 'grow+=0.5')
        // шаг между строками меряем перед сортировкой — так работает при любой ширине экрана
        .call(() => { step = rows.length > 1 ? rows[1].offsetTop - rows[0].offsetTop : 0; }, null, '+=0.55')
        .to(ps, { v: 1, duration: 0.9, ease: 'power3.inOut', onUpdate: applySort })
        .call(markTop)
        .to(pr, { v: 1, duration: 0.7, ease: 'none', onUpdate: applyRanks }, '+=0.05')
        .to({}, { duration: 2.2 })
        .to(card, { autoAlpha: 0, y: -16, duration: 0.4, ease: 'power2.in' })
        .to({}, { duration: 0.4 });
      return tl;
    }
    return { root, reset, next, build, final };
  })();

  /* ========================================================
     Сцена 3 — A plan, not just a report: план автоматизации
     ======================================================== */
  const plan = (() => {
    const root = rootOf('plan');
    const card = root.querySelector('[data-pl]');
    const steps = [...root.querySelectorAll('[data-pl-step]')];
    const texts = steps.map((r) => r.querySelector('[data-pl-text]'));
    const tags = steps.map((r) => r.querySelector('[data-pl-tag]'));
    const saves = steps.map((r) => r.querySelector('[data-pl-save]'));
    const start = root.querySelector('[data-pl-start]');
    const foot = root.querySelector('[data-pl-foot]');
    const totalEl = root.querySelector('[data-pl-total]');
    const p = { v: 0 };
    let total = 0;
    const fmtTotal = (v) => `~${Math.round(v * total)} hrs/week`;

    function next() {
      const list = story().plan;
      total = list.reduce((sum, st) => sum + st[1], 0);
      list.forEach(([text, save, kind], i) => {
        texts[i].textContent = text;
        tags[i].textContent = kind === 'quick' ? 'Quick win' : 'Medium';
        tags[i].dataset.kind = kind;
        saves[i].textContent = `~${save} h/wk`;
      });
    }
    function reset() {
      p.v = 0;
      totalEl.textContent = '~0 hrs/week';
      steps.forEach((r) => r.classList.remove('is-first'));
      gsap.set(card, { autoAlpha: 0, y: 14, scale: 0.96 });
      gsap.set(steps, { autoAlpha: 0, x: -16 });
      gsap.set(foot, { autoAlpha: 0, y: 8 });
      gsap.set(start, { autoAlpha: 0, scale: 0.8 });
    }
    function final() {
      totalEl.textContent = fmtTotal(1);
      steps[0].classList.add('is-first');
      gsap.set(card, { autoAlpha: 1, y: 0, scale: 1 });
      gsap.set(steps, { autoAlpha: 1, x: 0 });
      gsap.set(foot, { autoAlpha: 1, y: 0 });
      gsap.set(start, { autoAlpha: 1, scale: 1 });
    }
    function build() {
      const tl = gsap.timeline({ paused: true }); // один круг: дальше сцену сменяет переключатель
      tl.to(card, { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.4)' })
        .to(steps, { autoAlpha: 1, x: 0, duration: 0.4, ease: 'power2.out', stagger: 0.28 }, '+=0.2')
        .to(foot, { autoAlpha: 1, y: 0, duration: 0.35 }, '+=0.15')
        .to(p, {
          v: 1, duration: 1.0, ease: 'power2.out',
          onUpdate: () => { totalEl.textContent = fmtTotal(p.v); },
        }, '<0.1')
        // первый шаг выделяется: «начни отсюда»
        .call(() => steps[0].classList.add('is-first'), null, '+=0.15')
        .to(start, { autoAlpha: 1, scale: 1, duration: 0.3, ease: 'back.out(2)' }, '<')
        .to({}, { duration: 2.2 })
        .to(card, { autoAlpha: 0, y: -16, duration: 0.4, ease: 'power2.in' })
        .to({}, { duration: 0.4 });
      return tl;
    }
    return { root, reset, next, build, final };
  })();

  AiCo.sceneSwitcher({ stage, scenes: { usage, ranked, plan }, reduce, onCycle: () => { epoch++; } });
})();

/* ==========================================================
   БЛОК 2 — Chat With Your Data

   Как и в 1-м блоке: пункты списка переключают сцену справа.
   1) files — файлы падают в базу знаний и сразу читаются
   2) cited — вопрос -> карточка ответа вырастает из-за строки,
              с источником (файл + место в нём)
   3) fresh — файл обновился -> тот же ответ пересчитался на месте

   Каждая сцена — фабрика: при активации собирается СВЕЖИЙ
   таймлайн одного круга (см. AiCo.sceneSwitcher выше), поэтому
   пункт всегда начинается с начала своей истории. Пункты
   переключаются сами по завершении круга (полоска под пунктом —
   прогресс круга), клик включает пункт сразу.
   ========================================================== */
(function () {
  const stage = document.querySelector('[data-chatdata-stage]');
  if (!stage || !window.gsap) return;

  const reduce = window.AiCo && AiCo.reduce;
  const rootOf = (name) => stage.querySelector(`[data-scene-el="${name}"]`);

  // цветные иконки форматов — генерические, не логотипы конкретных приложений
  const FILE_ICONS = {
    doc: { bg: '#2E6FE0', svg: '<svg viewBox="0 0 20 20" fill="none"><path d="M5.5 3.5h6.2L15 6.8V16a.6.6 0 0 1-.6.6H5.5a.6.6 0 0 1-.6-.6V4.1a.6.6 0 0 1 .6-.6Z" fill="#fff"/><path d="M6.6 9.5h6.8M6.6 11.8h6.8M6.6 14h4.2" stroke="#2E6FE0" stroke-width="1.1" stroke-linecap="round"/></svg>' },
    sheet: { bg: '#1E9E5A', svg: '<svg viewBox="0 0 20 20" fill="none"><rect x="4.5" y="3.5" width="11" height="13" rx=".8" fill="#fff"/><path d="M4.5 8h11M4.5 12h11M9.7 3.5v13" stroke="#1E9E5A" stroke-width="1.1"/></svg>' },
    pdf: { bg: '#DB4B3E', svg: '<svg viewBox="0 0 20 20" fill="none"><path d="M5.5 3.5h6.2L15 6.8V16a.6.6 0 0 1-.6.6H5.5a.6.6 0 0 1-.6-.6V4.1a.6.6 0 0 1 .6-.6Z" fill="#fff"/><path d="M6.8 12.6V9.4h1c.7 0 1.2.5 1.2 1.2v.8c0 .7-.5 1.2-1.2 1.2h-1Zm3.4 0V9.4h1.9M10.2 11h1.6M14 9.4v3.2M14 9.4h1.3" stroke="#DB4B3E" stroke-width=".9" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
    slides: { bg: '#E9A23B', svg: '<svg viewBox="0 0 20 20" fill="none"><rect x="3.5" y="4.5" width="13" height="8.5" rx="1" fill="#fff"/><path d="M10 13v3M7.5 16.5h5" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/><path d="M6.5 10.5l2-2.2 1.6 1.4 2.4-2.6" stroke="#E9A23B" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>' },
  };
  const setIcon = (el, type) => { el.style.background = FILE_ICONS[type].bg; el.innerHTML = FILE_ICONS[type].svg; };

  /* ========================================================
     Сцена 1 — Any format works
     ======================================================== */
  const files = (() => {
    const root = rootOf('files');
    const card = root.querySelector('[data-kb]');
    const count = root.querySelector('[data-kb-count]');
    const rows = [...root.querySelectorAll('[data-kb-row]')];
    const fileEls = rows.map((r) => r.querySelector('[data-kb-file]'));
    const ficons = rows.map((r) => r.querySelector('[data-kb-ficon]'));
    const fnames = rows.map((r) => r.querySelector('[data-kb-fname]'));
    const spins = rows.map((r) => r.querySelector('[data-kb-spin]'));
    const checks = rows.map((r) => r.querySelector('[data-kb-check]'));
    const badge = root.querySelector('[data-kb-badge]');

    const SETS = [
      [['doc', 'Onboarding_Guide.docx'], ['sheet', 'Q3_Refunds.xlsx'], ['pdf', 'Acme_Contract.pdf'], ['slides', 'Sales_Deck.pptx'], ['doc', 'Support_Playbook.docx']],
      [['pdf', 'Pricing_2024.pdf'], ['sheet', 'Customer_List.xlsx'], ['slides', 'Product_Roadmap.pptx'], ['doc', 'Meeting_Notes.docx'], ['pdf', 'Return_Policy.pdf']],
    ];
    let si = 0;
    const label = (n) => `${n} ${n === 1 ? 'file' : 'files'}`;

    function next() {
      SETS[si++ % SETS.length].forEach(([type, name], i) => { setIcon(ficons[i], type); fnames[i].textContent = name; });
    }
    function reset() {
      count.textContent = label(0);
      gsap.set(card, { autoAlpha: 0, y: 14, scale: 0.96 });
      gsap.set(fileEls, { autoAlpha: 0, y: -26 });
      gsap.set(spins, { autoAlpha: 1 });
      gsap.set(checks, { autoAlpha: 0, scale: 0 });
      gsap.set(badge, { autoAlpha: 0, y: 8, scale: 0.9 });
    }
    function final() {
      count.textContent = label(rows.length);
      gsap.set(card, { autoAlpha: 1, y: 0, scale: 1 });
      gsap.set(fileEls, { autoAlpha: 1, y: 0 });
      gsap.set(spins, { autoAlpha: 0 });
      gsap.set(checks, { autoAlpha: 1, scale: 1 });
      gsap.set(badge, { autoAlpha: 1, y: 0, scale: 1 });
    }
    function build() {
      const tl = gsap.timeline({ paused: true }); // один круг: дальше сцену сменяет переключатель
      tl.to(card, { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.4)' })
        .addLabel('drop', '+=0.3');
      rows.forEach((_, i) => {
        const t0 = i * 0.45;         // когда файл «падает» в слот
        const t1 = t0 + 0.75;        // когда он прочитан
        tl.to(fileEls[i], { autoAlpha: 1, y: 0, duration: 0.45, ease: 'back.out(1.7)' }, `drop+=${t0}`)
          .to(spins[i], { autoAlpha: 0, duration: 0.15 }, `drop+=${t1}`)
          .to(checks[i], { autoAlpha: 1, scale: 1, duration: 0.3, ease: 'back.out(2.4)' }, `drop+=${t1}`)
          .call(() => { count.textContent = label(i + 1); }, null, `drop+=${t1}`);
      });
      tl.to(badge, { autoAlpha: 1, y: 0, scale: 1, duration: 0.4, ease: 'back.out(2)' }, `drop+=${(rows.length - 1) * 0.45 + 1.1}`)
        .to({}, { duration: 2.2 })
        .to(card, { autoAlpha: 0, y: -16, duration: 0.4, ease: 'power2.in' })
        .to({}, { duration: 0.4 });
      return tl;
    }
    return { root, reset, next, build, final };
  })();

  /* ========================================================
     Сцена 2 — Cited answers
     ======================================================== */
  const cited = (() => {
    const root = rootOf('cited');
    const bar = root.querySelector('.ask__bar');
    const textEl = root.querySelector('[data-ask-text]');
    const cursor = root.querySelector('[data-ask-cursor]');
    const send = root.querySelector('[data-ask-send]');
    const result = root.querySelector('[data-ask-result]');
    const titleEl = root.querySelector('[data-ask-title]');
    const answerEl = root.querySelector('[data-ask-answer]');
    const sourceIcon = root.querySelector('[data-ask-source-icon]');
    const sourceName = root.querySelector('[data-ask-source-name]');

    // name — файл + место в нём: буллит про «точный файл и раздел»
    const QA = [
      { title: 'Notetaker', q: 'What concerns did Emily have?', a: 'Emily raised concerns about the Q3 timeline and the budget overrun.', file: 'doc', name: 'Client_Call_Notes.docx · p. 3' },
      { title: 'Sheets Assistant', q: 'What was our refund rate last quarter?', a: 'Your refund rate in Q3 was 4.2%, down from 5.1% in Q2.', file: 'sheet', name: 'Q3_Refunds.xlsx · Sheet 2' },
      { title: 'Contract Search', q: "Who's the point of contact for Acme Ltd?", a: 'The primary contact for Acme Ltd is Michael Reyes, VP of Operations.', file: 'pdf', name: 'Acme_Contract.pdf · §4.1' },
    ];
    let qi = 0;
    let q = QA[0];
    const p = { v: 0 };

    function fillResult() {
      titleEl.textContent = q.title;
      setIcon(sourceIcon, q.file);
      sourceName.textContent = q.name;
      answerEl.textContent = q.a;
    }
    function next() { q = QA[qi++ % QA.length]; }
    function reset() {
      p.v = 0;
      textEl.textContent = ''; titleEl.textContent = ''; answerEl.textContent = ''; sourceName.textContent = '';
      gsap.set(bar, { autoAlpha: 0, y: 14, scale: 0.96 });
      gsap.set(result, { autoAlpha: 0, xPercent: -50, y: 10, scaleY: 0.5 });
      gsap.set(cursor, { autoAlpha: 0 });
      gsap.set(send, { scale: 1, color: '#2B201B' });
    }
    function final() {
      textEl.textContent = q.q;
      fillResult();
      gsap.set(bar, { autoAlpha: 1, y: 8, scale: 1 });
      gsap.set(result, { autoAlpha: 1, xPercent: -50, y: 0, scaleY: 1 });
    }
    function build() {
      const tl = gsap.timeline({ paused: true }); // один круг: дальше сцену сменяет переключатель
      tl.to(bar, { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.4)' })
        .to(cursor, { autoAlpha: 1, duration: 0.2 })
        // вопрос печатается; прогресс 0..1 -> длина берётся из текущего вопроса при каждом кадре
        .to(p, {
          v: 1, duration: 1.9, ease: 'none',
          onUpdate: () => { textEl.textContent = q.q.slice(0, Math.round(p.v * q.q.length)); },
        })
        .to(cursor, { autoAlpha: 0, duration: 0.15 })
        // «отправка»: иконка коротко приседает и подсвечивается акцентом
        .to(send, { scale: 0.8, duration: 0.12, ease: 'power2.in' })
        .to(send, { scale: 1, color: '#7A5CD6', duration: 0.25, ease: 'back.out(3)' })
        .to(send, { color: '#2B201B', duration: 0.3 }, '+=0.2')
        .call(fillResult)
        // карточка вырастает из-за строки, строка синхронно чуть проседает
        .to(result, { autoAlpha: 1, y: 0, scaleY: 1, duration: 0.55, ease: 'back.out(1.6)' }, '+=0.1')
        .to(bar, { y: 8, duration: 0.55, ease: 'back.out(1.6)' }, '<')
        .to({}, { duration: 2.4 })
        .to([bar, result], { autoAlpha: 0, y: '-=18', duration: 0.45, ease: 'power2.in' })
        .to({}, { duration: 0.5 });
      return tl;
    }
    return { root, reset, next, build, final };
  })();

  /* ========================================================
     Сцена 3 — Always current
     ======================================================== */
  const fresh = (() => {
    const root = rootOf('fresh');
    const card = root.querySelector('[data-fresh-card]');
    const toast = root.querySelector('[data-fresh-toast]');
    const toastText = root.querySelector('[data-fresh-toast-text]');
    const icon = root.querySelector('[data-fresh-icon]');
    const fileEl = root.querySelector('[data-fresh-file]');
    const sync = root.querySelector('[data-fresh-sync]');
    const syncText = root.querySelector('[data-fresh-sync-text]');
    const labelEl = root.querySelector('[data-fresh-label]');
    const value = root.querySelector('[data-fresh-value]');
    const old = root.querySelector('[data-fresh-old]');
    const updated = root.querySelector('[data-fresh-updated]');
    const delta = root.querySelector('[data-fresh-delta]');

    const DATA = [
      { file: 'Q3_Refunds.xlsx', label: 'Refund rate, last quarter', from: 4.2, to: 3.8, dec: 1, pre: '', suf: '%', delta: '↓ from 5.1% the quarter before' },
      { file: 'Support_Tickets.xlsx', label: 'Open tickets today', from: 128, to: 94, dec: 0, pre: '', suf: '', delta: '↓ from 152 yesterday' },
      { file: 'Sales_Pipeline.xlsx', label: 'Pipeline value', from: 1.24, to: 1.31, dec: 2, pre: '$', suf: 'M', delta: '↑ from $1.1M last month' },
    ];
    const fmt = (d, v) => `${d.pre}${v.toFixed(d.dec)}${d.suf}`;
    let di = 0;
    let d = DATA[0];
    const p = { v: 0 };

    function setSync(state, text) {
      if (state) sync.dataset.state = state; else sync.removeAttribute('data-state');
      syncText.textContent = text;
    }
    function next() {
      d = DATA[di++ % DATA.length];
      setIcon(icon, 'sheet');
      fileEl.textContent = d.file;
      labelEl.textContent = d.label;
      delta.textContent = d.delta;
      value.textContent = fmt(d, d.from);
      old.textContent = fmt(d, d.from);
      toastText.textContent = `${d.file} updated`;
    }
    function reset() {
      p.v = 0;
      gsap.set(card, { autoAlpha: 0, y: 14, scale: 0.96 });
      gsap.set(toast, { autoAlpha: 0, xPercent: -50, y: -10 });
      gsap.set(old, { autoAlpha: 0 });
      gsap.set(updated, { autoAlpha: 0, scale: 0.8 });
      gsap.set(value, { scale: 1, color: '#111111' });
      setSync('', 'Synced 2 min ago');
    }
    function final() {
      value.textContent = fmt(d, d.to);
      setSync('fresh', 'Synced just now');
      gsap.set(card, { autoAlpha: 1, y: 0, scale: 1 });
      gsap.set(updated, { autoAlpha: 1, scale: 1 });
    }
    function build() {
      const tl = gsap.timeline({ paused: true }); // один круг: дальше сцену сменяет переключатель
      tl.to(card, { autoAlpha: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.4)' })
        .to({}, { duration: 1.1 }) // сначала виден «вчерашний» ответ
        // сверху съезжает уведомление: файл обновился
        .to(toast, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'back.out(1.8)' })
        .call(() => setSync('syncing', 'Syncing…'), null, '+=0.35')
        // старое значение остаётся зачёркнутым рядом — разница видна в одном кадре
        .to(old, { autoAlpha: 1, duration: 0.25 }, '+=0.45')
        .to(p, {
          v: 1, duration: 0.9, ease: 'power2.out',
          onUpdate: () => { value.textContent = fmt(d, d.from + (d.to - d.from) * p.v); },
        }, '<0.05')
        .to(value, { color: '#B85C38', duration: 0.25 }, '<')
        .to(value, { scale: 1.06, duration: 0.14, yoyo: true, repeat: 1, ease: 'power2.out' }, '-=0.2')
        .call(() => setSync('fresh', 'Synced just now'))
        .to(updated, { autoAlpha: 1, scale: 1, duration: 0.3, ease: 'back.out(2.2)' }, '<')
        .to(value, { color: '#111111', duration: 0.4 }, '+=0.5')
        .to(toast, { autoAlpha: 0, y: -10, duration: 0.35, ease: 'power2.in' }, '<')
        .to(old, { autoAlpha: 0, duration: 0.3 }, '<')
        .to({}, { duration: 1.6 })
        .to(card, { autoAlpha: 0, y: -16, duration: 0.4, ease: 'power2.in' })
        .to({}, { duration: 0.4 });
      return tl;
    }
    return { root, reset, next, build, final };
  })();

  AiCo.sceneSwitcher({ stage, scenes: { files, cited, fresh }, reduce });
})();