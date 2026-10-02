/** Theme toggle for the logged-out pages. */
(() => {
  const b = document.getElementById('auth-theme');
  if (!b) return;
  const paint = () => { const dark = Theme.resolved === 'dark'; b.innerHTML = `${icon(dark ? 'sun' : 'moon', 18)}<span>${dark ? 'Light' : 'Dark'} mode</span>`; b.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode'); };
  b.addEventListener('click', () => Theme.toggle());
  document.addEventListener('msm:theme', paint);
  paint();
})();
