/* ==========================================================
   FAQ: раскрыт только один пункт одновременно, высота и текст
   анимируются (нативный <details> мгновенный). Состояние «открыт»
   для CSS — класс .is-open, он меняется сразу; атрибут open
   снимается только после конца анимации закрытия.
   ========================================================== */
(function () {
  const items = [...document.querySelectorAll('.faq__item')];
  if (!items.length) return;

  const reduce = window.AiCo ? AiCo.reduce : matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const DUR = reduce ? 0 : 420;

  items.forEach((item) => item.classList.toggle('is-open', item.open));

  function setOpen(item, open) {
    if (item.classList.contains('is-open') === open) return;

    const summary = item.querySelector('.faq__q');
    const answer = item.querySelector('.faq__a');
    if (item._anim) item._anim.cancel();

    const from = item.offsetHeight;
    item.classList.toggle('is-open', open);
    if (open) item.open = true;
    const to = open ? item.offsetHeight : summary.offsetHeight;

    item.style.overflow = 'hidden';
    const anim = item.animate({ height: [`${from}px`, `${to}px`] }, { duration: DUR, easing: EASE });
    item._anim = anim;

    // текст чуть запаздывает при открытии и уходит быстрее при закрытии
    if (!reduce) {
      answer.animate(
        { opacity: open ? [0, 1] : [1, 0], transform: open ? ['translateY(-8px)', 'none'] : ['none', 'translateY(-8px)'] },
        { duration: open ? DUR * 0.7 : DUR * 0.4, delay: open ? DUR * 0.2 : 0, easing: EASE, fill: 'both' }
      );
    }

    const done = () => {
      if (item._anim !== anim) return;
      item._anim = null;
      item.style.overflow = '';
      if (!open) item.open = false;
      answer.getAnimations().forEach((a) => a.cancel());
    };
    anim.onfinish = done;
    anim.oncancel = () => { if (item._anim === anim) item.style.overflow = ''; };
  }

  items.forEach((item) => {
    item.querySelector('.faq__q').addEventListener('click', (e) => {
      e.preventDefault();
      const willOpen = !item.classList.contains('is-open');
      setOpen(item, willOpen);
      if (willOpen) items.forEach((other) => { if (other !== item) setOpen(other, false); });
    });
  });
})();
