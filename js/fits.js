/* ==========================================================
   AI FITS: 2 пакета непрерывно обходят по кругу всю сеть узлов
   (дороги и точки — из assets/ai_fits/composition.svg), заходя
   по очереди в finance -> it -> support -> data -> sales -> finance
   (в разные стороны, по разным «мостам» support<->data — так они
   не идут друг за другом по одной и той же дороге). Когда пакет
   проходит через узел — статус-дуга на нём зеленеет, спустя время
   «портится» обратно. Плашки-заполнители без маршрута «дышат»
   отдельным медленным случайным циклом.
   ========================================================== */
(function () {
  const roadsMount = document.querySelector('[data-fits-stage]');
  const nodesRoot = document.querySelector('.fits__nodes');
  if (!roadsMount || !nodesRoot) return;

  function reversed(segs) {
    return segs.slice().reverse().map((s) => ({ id: s.id, reverse: !s.reverse }));
  }

  // два круговых маршрута через одни и те же 5 узлов, в противоположных
  // направлениях; на участке support<->data каждый идёт своим «мостом»
  const LOOP_A = [
    { node: 'it', segs: [{ id: 'road-it-finance' }] },
    { node: 'support', segs: [{ id: 'Vector_5' }, { id: 'Vector_4' }] },
    { node: 'data', segs: [{ id: 'Vector_7' }, { id: 'Vector_6', reverse: true }, { id: 'Vector_8' }] },
    { node: 'sales', segs: reversed([{ id: 'Vector_13' }, { id: 'Vector_12', reverse: true }]) },
    { node: 'finance', segs: reversed([{ id: 'Vector_9' }, { id: 'Vector_11' }, { id: 'Vector_10' }]) },
  ];

  const LOOP_B = [
    { node: 'sales', segs: [{ id: 'Vector_9' }, { id: 'Vector_11' }, { id: 'Vector_10' }] },
    { node: 'data', segs: [{ id: 'Vector_13' }, { id: 'Vector_12', reverse: true }] },
    { node: 'support', segs: reversed([{ id: 'Vector_15' }, { id: 'Vector_16', reverse: true }]) },
    { node: 'it', segs: reversed([{ id: 'Vector_5' }, { id: 'Vector_4' }]) },
    { node: 'finance', segs: reversed([{ id: 'road-it-finance' }]) },
  ];

  // плашки-«заполнители», у которых нет своего маршрута — просто живут своим циклом
  const IDLE_NODES = ['it2', 'data2', 'sales2'];

  fetch('assets/ai_fits/composition.svg')
    .then((res) => res.text())
    .then((text) => {
      roadsMount.innerHTML = text;
      const svg = roadsMount.querySelector('svg');
      if (svg) setup(svg);
    })
    .catch(() => {});

  function setup(svg) {
    const NS = 'http://www.w3.org/2000/svg';
    const reduce = window.AiCo && window.AiCo.reduce;
    const canAnimate = !!(window.gsap && window.MotionPathPlugin) && !reduce;
    if (canAnimate) gsap.registerPlugin(MotionPathPlugin);

    const timers = {};
    const allNodeIds = ['finance', 'it', 'support', 'data', 'sales', ...IDLE_NODES];

    allNodeIds.forEach((id) => {
      const el = nodesRoot.querySelector('[data-node="' + id + '"]');
      if (el) el.dataset.status = reduce ? 'ok' : 'bad';
    });

    function setStatus(nodeId, status, holdMs) {
      const el = nodesRoot.querySelector('[data-node="' + nodeId + '"]');
      if (!el) return;
      el.dataset.status = status;

      clearTimeout(timers[nodeId]);
      if (status === 'ok') {
        timers[nodeId] = setTimeout(() => setStatus(nodeId, 'bad'), holdMs);

        // тост «Task completed» — всплывает на пару секунд и прячется
        el.dataset.flash = '1';
        clearTimeout(timers[nodeId + '-flash']);
        timers[nodeId + '-flash'] = setTimeout(() => {
          el.dataset.flash = '0';
        }, 2000);
      }
    }

    // плашки без маршрута — самостоятельно «чинятся»/«портятся» по кругу, медленно
    function idleCycle(nodeId) {
      const badFor = 6000 + Math.random() * 6000;
      const okFor = 12000 + Math.random() * 10000;
      setStatus(nodeId, 'ok', okFor);
      timers[nodeId + '-idle'] = setTimeout(() => idleCycle(nodeId), badFor + okFor);
    }

    if (!canAnimate) return;

    IDLE_NODES.forEach((id, i) => {
      timers[id + '-start'] = setTimeout(() => idleCycle(id), i * 3000);
    });

    function makePacket() {
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('r', '6');
      dot.setAttribute('class', 'fits-packet');
      dot.setAttribute('fill', '#B85C38');
      svg.appendChild(dot);
      return dot;
    }

    // один пакет непрерывно обходит весь маршрут по кругу, «чиня» каждый узел по пути
    function runLoop(legs, delay) {
      const dot = makePacket();
      const tl = gsap.timeline({ repeat: -1, delay, repeatDelay: 2.5 + Math.random() });

      tl.set(dot, { opacity: 0 });
      tl.to(dot, { opacity: 1, duration: 0.3 });

      legs.forEach((leg) => {
        leg.segs.forEach((seg) => {
          const path = svg.querySelector('#' + CSS.escape(seg.id));
          if (!path) return;
          const len = path.getTotalLength();
          tl.to(dot, {
            motionPath: {
              path: path,
              start: seg.reverse ? 1 : 0,
              end: seg.reverse ? 0 : 1,
            },
            // медленнее базовой скорости по умолчанию (было 220px/с)
            duration: Math.max(1.2, len / 80),
            ease: 'none',
          });
        });
        tl.call(() => setStatus(leg.node, 'ok', 9000 + Math.random() * 6000));
      });

      tl.to(dot, { opacity: 0, duration: 0.3 });
    }

    runLoop(LOOP_A, 0);
    runLoop(LOOP_B, 4);
  }
})();
