/* ==========================================================
   PROBLEM: карточки-сообщения падают и оседают на дне карточки
   (Matter.js). Геометрия и оформление карточек берутся из
   assets/problem/cards1.svg — каждая group id="card-N" становится
   отдельным физическим телом. Карточки в исходнике не повёрнуты
   (rotation сброшен в Figma), поэтому bbox группы уже совпадает
   с реальным размером карточки — угол наклона при падении и
   раскладке целиком отдан физике.
   ========================================================== */
(function () {
  const stage = document.querySelector('[data-problem-stage]');
  if (!stage) return;

  const CARD_COUNT = 18;
  const CARD_SCALE = 0.8; // карточки меньше секции — пропорционально уменьшаем
  const SVG_NS = 'http://www.w3.org/2000/svg';

  fetch('assets/problem/cards1.svg')
    .then((res) => res.text())
    .then((text) => {
      const parsed = parseCards(text);
      mountDefs(parsed.defs);
      buildCards(parsed);
    })
    .catch(() => {});

  /* --- парсим исходник: bbox каждой карточки (уже нерастянутый, т.к. без поворота) ---
     Карточки ссылаются на общий <defs> файла (аватары как pattern+image,
     иногда общий <style> для шрифтов). Если просто скопировать outerHTML
     одной группы, эти ссылки (url(#...), class="...") ведут в никуда —
     отсюда серые кружки вместо фото и шрифт браузера вместо JetBrains Mono.
     Поэтому <defs> не выбрасываем, а переносим в основной документ один раз:
     id ищется по всему документу, так что все карточки смогут на него сослаться. */
  function parseCards(svgText) {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const root = doc.documentElement;
    const [, , designW, designH] = (root.getAttribute('viewBox') || '').split(/\s+/).map(Number);

    const loader = document.createElementNS(SVG_NS, 'svg');
    loader.setAttribute('viewBox', `0 0 ${designW} ${designH}`);
    loader.style.cssText = `position:fixed; left:-99999px; top:0; width:${designW}px; height:${designH}px;`;
    Array.from(root.childNodes).forEach((n) => loader.appendChild(document.importNode(n, true)));
    document.body.appendChild(loader);

    const cards = [];
    for (let i = 1; i <= CARD_COUNT; i++) {
      const g = loader.querySelector('#card-' + i);
      if (!g) continue;
      const bbox = g.getBBox();
      cards.push({ id: 'card-' + i, bbox, markup: g.outerHTML });
    }

    // забираем все <defs> (их может быть несколько), достаём из loader перед удалением
    const defs = Array.from(loader.querySelectorAll('defs')).map((d) => d.cloneNode(true));

    loader.remove();
    return { cards, designW, defs };
  }

  /* кладём defs в документ один раз, невидимо (0×0), но «на месте» —
     карточки, которые появятся позже, найдут нужные id по всему документу */
  function mountDefs(defs) {
    if (!defs.length) return;
    const host = document.createElementNS(SVG_NS, 'svg');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:absolute; width:0; height:0; overflow:hidden;';
    defs.forEach((d) => host.appendChild(d));
    document.body.appendChild(host);
  }

  /* --- строим DOM-карточки и физику --- */
  function buildCards({ cards, designW }) {
    if (!cards.length) return;

    const rect = stage.getBoundingClientRect();
    const scale = (rect.width / designW) * CARD_SCALE;
    const stageW = rect.width;
    const stageH = rect.height;
    // карточки уже, чем сцена, — центрируем весь разброс по горизонтали
    const offsetX = (stageW - designW * scale) / 2;

    const reduce = window.AiCo && window.AiCo.reduce;
    const useMatter = !!window.Matter && !reduce;

    const chips = cards.map((card, i) => {
      const w = card.bbox.width * scale;
      const h = card.bbox.height * scale;
      const el = document.createElement('div');
      el.className = 'card-chip';
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      // fill="none" на корне — иначе обводки без своего fill унаследуют чёрный по умолчанию
      el.innerHTML = `<svg viewBox="${card.bbox.x} ${card.bbox.y} ${card.bbox.width} ${card.bbox.height}" fill="none">${card.markup}</svg>`;
      const originX = offsetX + card.bbox.x * scale + w / 2;
      const spawnX = Math.min(Math.max(originX + (Math.random() * 40 - 20), w / 2), stageW - w / 2);
      // старт над секцией, за текстом — карточки ждут падения за кадром, а не в углу
      const spawnY = -(60 + Math.random() * 160 + i * 26);
      el.style.transform = `translate(${spawnX - w / 2}px, ${spawnY - h / 2}px)`;
      stage.appendChild(el);
      return { el, w, h, originX, spawnX, spawnY };
    });

    if (!useMatter) {
      // no-JS-физика / reduced-motion: сразу в исходной (дизайнерской) раскладке
      cards.forEach((card, i) => {
        chips[i].el.style.transform = `translate(${offsetX + card.bbox.x * scale}px, ${card.bbox.y * scale}px)`;
      });
      return;
    }

    dropCards(chips, stageW, stageH);
  }

  function dropCards(chips, stageW, stageH) {
    const { Engine, World, Bodies } = window.Matter;

    const engine = Engine.create();
    engine.gravity.y = 1;

    // пол ровно на нижней границе секции — без отступа
    const ground = Bodies.rectangle(stageW / 2, stageH + 10, stageW * 2, 20, { isStatic: true });
    const wallL = Bodies.rectangle(-10, stageH / 2, 20, stageH * 4, { isStatic: true });
    const wallR = Bodies.rectangle(stageW + 10, stageH / 2, 20, stageH * 4, { isStatic: true });
    World.add(engine.world, [ground, wallL, wallR]);

    chips.forEach((chip) => {
      chip.body = Bodies.rectangle(chip.spawnX, chip.spawnY, chip.w, chip.h, {
        restitution: 0.12,
        friction: 0.55,
        frictionAir: 0.018,
        chamfer: { radius: Math.min(chip.w, chip.h) * 0.16 },
        angle: (Math.random() - 0.5) * 0.35,
      });
    });

    let started = false;

    function startDrop() {
      if (started) return;
      started = true;

      chips.forEach((chip, i) => {
        setTimeout(() => World.add(engine.world, chip.body), i * 70);
      });

      let last = performance.now();
      function tick(now) {
        const delta = Math.min(now - last, 33);
        last = now;
        Engine.update(engine, delta);

        chips.forEach((chip) => {
          if (!chip.body) return;
          const { x, y } = chip.body.position;
          chip.el.style.transform =
            `translate(${x - chip.w / 2}px, ${y - chip.h / 2}px) rotate(${chip.body.angle}rad)`;
        });

        const allAsleep = chips.every((c) => c.body && c.body.isSleeping);
        if (allAsleep) return;
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            startDrop();
            io.disconnect();
          }
        });
      }, { threshold: 0.15 });
      io.observe(stage);
    } else {
      startDrop();
    }
  }
})();