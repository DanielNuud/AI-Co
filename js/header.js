/* ==========================================================
   HEADER: состояние при скролле, мобильное меню, выбор языка
   ========================================================== */
(function () {
  const header = document.querySelector('[data-header]');
  if (!header) return;

  const burger = header.querySelector('.burger');
  const nav = header.querySelector('.nav');
  const lang = header.querySelector('[data-lang]');
  const langBtn = lang.querySelector('.lang__btn');
  const langMenu = lang.querySelector('.lang__menu');

  /* --- скролл: фон + прячем вниз / показываем вверх; после hero — карточка, всегда на виду --- */
  const hero = document.querySelector('[data-hero]');
  let lastY = window.scrollY;
  function onScroll() {
    const y = window.scrollY;
    header.classList.toggle('is-scrolled', y > 8);

    const isCard = !!hero && hero.getBoundingClientRect().bottom <= header.offsetHeight;
    header.classList.toggle('is-card', isCard);

    const locked = header.classList.contains('is-menu-open');
    if (isCard) header.classList.remove('is-hidden');
    else if (!locked && y > lastY && y > 240) header.classList.add('is-hidden');
    else if (y < lastY) header.classList.remove('is-hidden');

    lastY = y;
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* --- мобильное меню --- */
  function setMenu(open) {
    header.classList.toggle('is-menu-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  burger.addEventListener('click', () => {
    setMenu(!header.classList.contains('is-menu-open'));
    setLang(false);
  });
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });

  /* --- язык --- */
  function setLang(open) {
    langBtn.setAttribute('aria-expanded', String(open));
    langMenu.hidden = !open;
  }
  langBtn.addEventListener('click', () => setLang(langMenu.hidden));
  langMenu.addEventListener('click', (e) => {
    const opt = e.target.closest('.lang__option');
    if (!opt) return;
    langMenu.querySelectorAll('.lang__option').forEach((o) => o.removeAttribute('aria-current'));
    opt.setAttribute('aria-current', 'true');
    // TODO: подключить реальное переключение языка
    setLang(false);
  });

  /* --- закрытие по клику снаружи и Esc --- */
  document.addEventListener('click', (e) => {
    if (!lang.contains(e.target)) setLang(false);
    if (!header.contains(e.target)) setMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    setLang(false);
    setMenu(false);
  });

  /* --- при переходе на десктоп сбрасываем меню --- */
  window.matchMedia('(min-width: 861px)').addEventListener('change', (e) => {
    if (e.matches) setMenu(false);
  });
})();
