/** Settings: account, appearance, security, danger zone. */
(async () => {
  const { main } = await App.boot({ page: 'settings', title: 'Settings', rail: false });
  const me = Store.user;
  const THEMES = [['light', 'Light', 'sun'], ['dark', 'Dark', 'moon'], ['system', 'System', 'monitor']];

  main.innerHTML = `<div class="page-head"><h1 class="page-title">Settings</h1><p class="page-sub">Manage your account, appearance and security.</p></div>
  <section class="card settings-card" aria-labelledby="s-account"><h2 id="s-account" class="section-title">Account</h2>
    <div class="account-row">${avatar(me, 'lg')}<div class="account-meta"><strong>${esc(me.name)}</strong><span class="muted">@${esc(me.username)}</span><span class="muted">${esc(me.email || '')}</span></div><a class="btn btn-soft btn-sm" href="profile.html?username=${enc(me.username)}&edit=1">Edit profile</a></div></section>

  <section class="card settings-card" aria-labelledby="s-appearance"><h2 id="s-appearance" class="section-title">Appearance</h2><p class="section-sub">Choose how MiniSocial looks. Your choice is saved on this device.</p>
    <div class="theme-grid" role="radiogroup" aria-label="Theme">${THEMES.map(([k, l, ic]) => `<button class="theme-opt" type="button" role="radio" data-theme-opt="${k}" aria-checked="${Theme.pref === k}"><span class="theme-prev tp-${k}"><span class="tp-bar"></span><span class="tp-line"></span><span class="tp-line short"></span></span><span class="theme-label">${icon(ic, 16)} ${l}</span></button>`).join('')}</div></section>

  <section class="card settings-card" aria-labelledby="s-security"><h2 id="s-security" class="section-title">Security</h2>
    <form class="form" id="pw-form" novalidate>
      <div class="field"><label for="pw-cur">Current password</label><input id="pw-cur" name="currentPassword" type="password" autocomplete="current-password"><p class="field-error" data-error-for="currentPassword" role="alert"></p></div>
      <div class="field"><label for="pw-new">New password</label><input id="pw-new" name="newPassword" type="password" autocomplete="new-password"><div class="meter" aria-hidden="true"><span></span></div><p class="hint" id="pw-hint">At least 8 characters with a letter and a number.</p><p class="field-error" data-error-for="newPassword" role="alert"></p></div>
      <div class="field"><label for="pw-conf">Confirm new password</label><input id="pw-conf" name="confirm" type="password" autocomplete="new-password"><p class="field-error" data-error-for="confirm" role="alert"></p></div>
      <div class="form-row"><button class="btn btn-primary" type="submit">Update password</button></div></form>
    <hr class="sep"><div class="setting-line"><div><strong>Log out of all devices</strong><p class="muted">Ends every active session, including this one.</p></div><button class="btn btn-soft" type="button" id="logout-all">Log out everywhere</button></div></section>

  <section class="card settings-card" aria-labelledby="s-session"><h2 id="s-session" class="section-title">Session</h2><div class="setting-line"><div><strong>Log out</strong><p class="muted">Sign out of MiniSocial on this device.</p></div><button class="btn btn-soft" type="button" id="logout-btn">${icon('logout', 18)}<span>Log out</span></button></div></section>

  <section class="card settings-card danger-zone" aria-labelledby="s-danger"><h2 id="s-danger" class="section-title">Delete account</h2><div class="setting-line"><div><strong>Permanently delete your account</strong><p class="muted">Removes your profile, posts, comments, likes and saved items. This can’t be undone.</p></div><button class="btn btn-danger" type="button" id="delete-btn">Delete account</button></div></section>`;

  /* theme */
  const opts = $$('[data-theme-opt]', main);
  opts.forEach((b) => b.addEventListener('click', () => { Theme.set(b.dataset.themeOpt); opts.forEach((o) => o.setAttribute('aria-checked', o === b)); }));
  $('.theme-grid', main).addEventListener('keydown', (e) => {
    const i = opts.findIndex((o) => o.getAttribute('aria-checked') === 'true');
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const n = opts[(i + (e.key === 'ArrowRight' ? 1 : opts.length - 1)) % opts.length]; n.click(); n.focus(); }
  });

  /* password */
  const pw = $('#pw-form', main), meter = $('.meter span', pw);
  const setErr = (k, m) => { const el = $(`[data-error-for="${k}"]`, pw); if (el) el.textContent = m || ''; };
  const score = (v) => [v.length >= 8, /[a-z]/i.test(v) && /\d/.test(v), v.length >= 12, /[^a-z0-9]/i.test(v) && /[A-Z]/.test(v)].filter(Boolean).length;
  $('#pw-new', pw).addEventListener('input', (e) => { meter.style.width = `${score(e.target.value) * 25}%`; meter.dataset.s = score(e.target.value); setErr('newPassword', ''); });
  pw.addEventListener('submit', async (e) => {
    e.preventDefault(); ['currentPassword', 'newPassword', 'confirm'].forEach((k) => setErr(k, ''));
    const f = pw.elements; let bad = false;
    if (!f.currentPassword.value) { setErr('currentPassword', 'Enter your current password.'); bad = true; }
    if (f.newPassword.value.length < 8 || !/[a-z]/i.test(f.newPassword.value) || !/\d/.test(f.newPassword.value)) { setErr('newPassword', 'Use at least 8 characters, with a letter and a number.'); bad = true; }
    if (f.confirm.value !== f.newPassword.value) { setErr('confirm', 'Passwords don’t match.'); bad = true; }
    if (bad) return;
    const btn = $('button[type=submit]', pw); btn.disabled = true; btn.textContent = 'Updating…';
    try {
      const res = await Api.changePassword({ currentPassword: f.currentPassword.value, newPassword: f.newPassword.value });
      Store.setSession(res.token, Store.user); pw.reset(); meter.style.width = '0';
      Toast.success('Password updated. Other devices were signed out.');
    } catch (ex) {
      Object.entries(ex.fields || {}).forEach(([k, v]) => setErr(k, v));
      if (!ex.fields || !Object.keys(ex.fields).length) Toast.error(ex.message);
    } finally { btn.disabled = false; btn.textContent = 'Update password'; }
  });

  $('#logout-btn', main).onclick = logout;
  $('#logout-all', main).onclick = async () => {
    if (!(await confirmDialog({ title: 'Log out everywhere?', message: 'Every device, including this one, will be signed out.', confirmText: 'Log out everywhere' }))) return;
    try { await Api.logoutAll(); } catch (e) { return Toast.error(e.message); }
    Store.clear(); Store.flash('You were logged out of all devices.', 'info'); location.replace('login.html');
  };

  $('#delete-btn', main).onclick = () => {
    const form = html(`<form class="form" novalidate><p>This permanently deletes <strong>@${esc(me.username)}</strong> and everything you’ve posted. Enter your password to confirm.</p><div class="field"><label for="del-pw">Password</label><input id="del-pw" name="password" type="password" autocomplete="current-password" autofocus><p class="field-error" data-error-for="password" role="alert"></p></div><div class="modal-actions"><button class="btn btn-ghost" type="button" data-close>Cancel</button><button class="btn btn-danger" type="submit">Delete my account</button></div></form>`);
    const m = Modal.open({ title: 'Delete account?', content: form, size: 'sm' });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('.field-error', form), btn = $('button[type=submit]', form);
      if (!form.elements.password.value) { err.textContent = 'Enter your password.'; return; }
      btn.disabled = true; btn.textContent = 'Deleting…';
      try { await Api.deleteAccount(form.elements.password.value); m.close(); Store.clear(); Store.flash('Your account has been deleted.', 'info'); location.replace('login.html'); }
      catch (ex) { err.textContent = (ex.fields && ex.fields.password) || ex.message; btn.disabled = false; btn.textContent = 'Delete my account'; }
    });
  };
})();
