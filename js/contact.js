/* ==========================================================
   CONTACT: простая обработка отправки формы (без бэкенда)
   ========================================================== */
(function () {
  const form = document.querySelector('[data-contact-form]');
  if (!form) return;

  const success = form.querySelector('[data-contact-success]');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    success.hidden = false;
    form.reset();
  });
})();
