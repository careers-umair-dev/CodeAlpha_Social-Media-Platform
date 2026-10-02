/* Runs synchronously in <head> so the correct theme is painted on first frame (no flash). */
(function () {
  try {
    var pref = localStorage.getItem('msm_theme') || 'system';
    var dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.themePref = pref;
  } catch (e) { document.documentElement.dataset.theme = 'light'; }
})();
