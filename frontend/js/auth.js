/** Login and registration pages. */
(() => {
  if (Store.token) location.replace(safeNext(new URLSearchParams(location.search).get('next')));
  const flash = Store.takeFlash(); if (flash) Toast.show(flash.message, flash.type);

  const scoreOf = (v) => [v.length >= 8, /[a-z]/i.test(v) && /\d/.test(v), v.length >= 12, /[^a-z0-9]/i.test(v) && /[A-Z]/.test(v)].filter(Boolean).length;
  const LABELS = ['Too short', 'Weak', 'Okay', 'Good', 'Strong'];

  // Show/hide password toggles
  $$('[data-toggle-pw]').forEach((btn) => {
    const input = document.getElementById(btn.dataset.togglePw);
    btn.innerHTML = icon('eye', 18);
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = icon(show ? 'eye-off' : 'eye', 18);
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      btn.setAttribute('aria-pressed', String(show));
    });
  });

  function setErr(form, name, msg) {
    const el = $(`[data-error-for="${name}"]`, form), input = form.elements[name];
    if (el) el.textContent = msg || '';
    if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  function formError(form, msg) { const el = $('.form-alert', form); el.textContent = msg || ''; el.classList.toggle('hidden', !msg); }
  const clear = (form) => { $$('[data-error-for]', form).forEach((e) => { e.textContent = ''; }); $$('[aria-invalid]', form).forEach((i) => i.setAttribute('aria-invalid', 'false')); formError(form, ''); };
  function busy(form, on, label) { const b = $('button[type=submit]', form); b.disabled = on; b.classList.toggle('loading', on); b.innerHTML = on ? `<span class="spinner"></span><span>${label}</span>` : `<span>${b.dataset.label}</span>`; }
  const afterAuth = (res) => { Store.setSession(res.token, res.user); location.replace(safeNext(new URLSearchParams(location.search).get('next'))); };

  const login = $('#login-form');
  if (login) {
    login.addEventListener('input', (e) => setErr(login, e.target.name, ''));
    login.addEventListener('submit', async (e) => {
      e.preventDefault(); clear(login);
      const id = login.elements.emailOrUsername.value.trim(), pw = login.elements.password.value;
      let bad = false;
      if (!id) { setErr(login, 'emailOrUsername', 'Enter your email or username.'); bad = true; }
      if (!pw) { setErr(login, 'password', 'Enter your password.'); bad = true; }
      if (bad) { (login.querySelector('[aria-invalid=true]') || {}).focus?.(); return; }
      busy(login, true, 'Logging in…');
      try { afterAuth(await Api.login({ emailOrUsername: id, password: pw })); }
      catch (ex) { formError(login, ex.message); Object.entries(ex.fields || {}).forEach(([k, v]) => setErr(login, k, v)); busy(login, false); }
    });
  }

  const reg = $('#register-form');
  if (reg) {
    const meter = $('.meter span', reg), label = $('#pw-label', reg);
    reg.addEventListener('input', (e) => {
      setErr(reg, e.target.name, '');
      if (e.target.name === 'password') { const s = scoreOf(e.target.value); meter.style.width = e.target.value ? `${Math.max(1, s) * 25}%` : '0'; meter.dataset.s = s; label.textContent = e.target.value ? LABELS[s] : ''; }
    });
    reg.addEventListener('submit', async (e) => {
      e.preventDefault(); clear(reg);
      const f = reg.elements, v = { name: f.name.value.trim(), username: f.username.value.trim(), email: f.email.value.trim(), password: f.password.value };
      const errs = {};
      if (!v.name) errs.name = 'Please enter your name.';
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(v.username)) errs.username = '3–30 characters: letters, numbers and underscores.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) errs.email = 'Enter a valid email address.';
      if (v.password.length < 8 || !/[a-z]/i.test(v.password) || !/\d/.test(v.password)) errs.password = 'Use at least 8 characters, with a letter and a number.';
      if (f.confirmPassword.value !== v.password) errs.confirmPassword = 'Passwords don’t match.';
      if (Object.keys(errs).length) { Object.entries(errs).forEach(([k, m]) => setErr(reg, k, m)); (reg.querySelector('[aria-invalid=true]') || {}).focus?.(); return; }
      busy(reg, true, 'Creating account…');
      try { afterAuth(await Api.register(v)); }
      catch (ex) { Object.entries(ex.fields || {}).forEach(([k, m]) => setErr(reg, k, m)); if (!ex.fields || !Object.keys(ex.fields).length) formError(reg, ex.message); busy(reg, false); }
    });
  }
})();
