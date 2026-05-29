import { els } from '../utils/dom.js';

let toastTimeout;

export function showToast(message, type) {
    clearTimeout(toastTimeout);
    els.toastMsg.textContent = message;
    const colors = {
        error: 'bg-red-600 text-white',
        success: 'bg-emerald-600 text-white',
        warning: 'bg-amber-500 text-white',
        info: 'bg-blue-600 text-white'
    };
    els.toast.className = 'fixed bottom-6 right-6 transform transition-all duration-300 z-50 px-5 py-3 rounded-xl shadow-2xl text-sm font-medium max-w-xs pointer-events-auto ' + (colors[type] || colors.info);
    requestAnimationFrame(() => {
        els.toast.classList.remove('translate-y-24', 'opacity-0');
    });
    toastTimeout = setTimeout(() => {
        els.toast.classList.add('translate-y-24', 'opacity-0');
    }, 4000);
}
