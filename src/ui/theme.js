import { els } from '../utils/dom.js';

function initTheme() {
    let saved = null;
    try {
        saved = localStorage.getItem('theme');
    } catch (e) {
        // localStorage may be blocked in private browsing
    }
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (saved === 'dark' || (!saved && prefersDark)) {
        els.html.classList.add('dark');
    } else {
        els.html.classList.remove('dark');
    }
}
initTheme();

els.themeToggle.addEventListener('click', () => {
    els.html.classList.toggle('dark');
    try {
        localStorage.setItem('theme', els.html.classList.contains('dark') ? 'dark' : 'light');
    } catch (e) {
        // Silently ignore if storage is unavailable
    }
});
