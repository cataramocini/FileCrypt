import { els } from '../utils/dom.js';
import { state } from '../state.js';

export function calculateStrength(password) {
    let pool = 0;
    if (/[a-z]/.test(password)) pool += 26;
    if (/[A-Z]/.test(password)) pool += 26;
    if (/[0-9]/.test(password)) pool += 10;
    if (/[^a-zA-Z0-9]/.test(password)) pool += 32;

    if (pool === 0) {
        return { score: 0, entropy: 0, label: 'Enter password to see strength', color: null };
    }

    if (password.length > 0 && password.length < 8) {
        return { score: 1, entropy: 0, label: 'Too short (min 8 chars)', color: '#D32F2F' };
    }

    const entropy = password.length * Math.log2(pool);
    let score, label, color;

    if (entropy >= 80) {
        score = 4; label = 'Strong'; color = '#388E3C';
    } else if (entropy >= 50) {
        score = 3; label = 'Medium'; color = '#F57C00';
    } else if (entropy >= 30) {
        score = 2; label = 'Weak'; color = '#D32F2F';
    } else {
        score = 1; label = 'Weak'; color = '#D32F2F';
    }

    return { score, entropy: Math.round(entropy), label, color };
}

export function updateMinLengthValidation() {
    if (state.mode !== 'encrypt') {
        els.passwordMinLengthText.classList.add('hidden');
        return;
    }
    const pwd = els.passwordInput.value;
    if (pwd.length > 0 && pwd.length < 8) {
        els.passwordMinLengthText.classList.remove('hidden');
    } else {
        els.passwordMinLengthText.classList.add('hidden');
    }
}

export function updateStrength() {
    const pwd = els.passwordInput.value;
    const info = calculateStrength(pwd);

    els.entropyText.textContent = (pwd.length > 0 && info.entropy > 0) ? info.entropy + ' bits' : '';
    els.strengthText.textContent = info.label;

    if (info.score === 0) {
        els.strengthText.style.color = '';
    } else {
        els.strengthText.style.color = info.color;
    }

    els.bars.forEach((bar, idx) => {
        if (idx < info.score) {
            bar.style.backgroundColor = info.color;
        } else {
            bar.style.backgroundColor = '';
        }
    });

    updateMinLengthValidation();
}

export function bindStrengthMeterListeners() {
    els.passwordInput.addEventListener('input', updateStrength);
}

bindStrengthMeterListeners();
