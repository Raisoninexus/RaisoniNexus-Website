const THEME_KEY = 'raisoni-nexus-theme';

function applyTheme(theme) {
  const body = document.body;
  const isDark = theme === 'dark';
  body.classList.toggle('dark-mode', isDark);
  const toggle = document.querySelector('[data-theme-toggle]');
  if (toggle) {
    toggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    toggle.textContent = isDark ? '☀️' : '🌙';
  }
  localStorage.setItem(THEME_KEY, theme);
}

function initializeTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY) || 'light';
  applyTheme(savedTheme);

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-theme-toggle]');
    if (!trigger) return;
    const nextTheme = document.body.classList.contains('dark-mode') ? 'light' : 'dark';
    applyTheme(nextTheme);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeTheme);
} else {
  initializeTheme();
}
