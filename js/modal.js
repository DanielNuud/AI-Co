/* ==========================================================
   MODAL: открытие по кнопкам с [data-open-modal] (все CTA-кнопки),
   анимированное закрытие, блокировка скролла, возврат фокуса.
   Форма здесь — заглушка без бэкенда, как и в секции Contact.
   ========================================================== */
(function () {
  const dlg = document.getElementById('call-modal');
  if (!dlg || typeof dlg.showModal !== 'function') return; // без <dialog> кнопки просто ведут к #contact

  const reduce = window.AiCo && AiCo.reduce;
  const form = dlg.querySelector('[data-modal-form]');
  const formView = dlg.querySelector('[data-modal-form-view]');
  const doneView = dlg.querySelector('[data-modal-done-view]');
  const doneTitle = dlg.querySelector('[data-modal-done-title]');
  const CLOSE_MS = reduce ? 0 : 320;

  let lastFocus = null;
  let closing = false;

  function lockScroll(on) {
    document.documentElement.classList.toggle('has-modal', on);
    if (window.AiCo && AiCo.lenis) on ? AiCo.lenis.stop() : AiCo.lenis.start();
  }

  function open() {
    if (dlg.open) return;
    lastFocus = document.activeElement;
    formView.hidden = false;
    doneView.hidden = true;
    dlg.showModal();
    lockScroll(true);
    // два кадра: сначала браузер рисует закрытое состояние, потом включается переход
    requestAnimationFrame(() => requestAnimationFrame(() => dlg.classList.add('is-open')));
    const first = form.querySelector('input, textarea');
    if (first) first.focus({ preventScroll: true });
  }

  function close(after) {
    if (!dlg.open || closing) return;
    closing = true;
    dlg.classList.remove('is-open');
    setTimeout(() => {
      dlg.close();
      lockScroll(false);
      closing = false;
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
      if (after) after();
    }, CLOSE_MS);
  }

  // capture: срабатывает раньше общего обработчика якорей в base.js, который иначе просто прокрутил бы к #contact
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-open-modal]');
    if (!trigger) return;
    e.preventDefault();
    e.stopPropagation();
    open();
  }, true);

  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) close();                       // клик по затемнению
    else if (e.target.closest('[data-modal-close]')) close();
  });

  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); }); // Esc

  // «полная форма»: закрываем окно и плавно уезжаем к секции Contact
  dlg.querySelector('[data-modal-to-form]').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    close(() => {
      const target = document.getElementById('contact');
      if (!target) return;
      const header = document.querySelector('[data-header]');
      const offset = -(header ? header.offsetHeight : 0);
      if (window.AiCo && AiCo.lenis) AiCo.lenis.scrollTo(target, { offset });
      else target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
      history.pushState(null, '', '#contact');
    });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    form.reset();
    formView.hidden = true;
    doneView.hidden = false;
    doneTitle.focus({ preventScroll: true });
  });
})();
