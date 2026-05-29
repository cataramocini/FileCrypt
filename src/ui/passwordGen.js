import { els } from '../utils/dom.js';
import { state } from '../state.js';
import { showToast } from './toast.js';
import { updateStrength } from './strengthMeter.js';
import { updateProcessButton } from './processButton.js';

export async function generateAndFillPassword() {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    const len = 24;
    const charsetLen = charset.length;
    // Calculate max valid byte: largest multiple of charsetLen <= 255
    const maxValid = 256 - (256 % charsetLen);

    let password = '';
    let attempts = 0;
    const maxAttempts = len * 10; // Safety cap

    while (password.length < len && attempts < maxAttempts) {
        const arr = new Uint8Array(len - password.length);
        crypto.getRandomValues(arr);
        for (let i = 0; i < arr.length && password.length < len; i++) {
            if (arr[i] < maxValid) {
                password += charset[arr[i] % charsetLen];
            }
            attempts++;
        }
    }

    // Fallback (extremely unlikely) if entropy exhausted
    if (password.length < len) {
        showToast('Password generation failed. Try again.', 'error');
        return;
    }

    els.passwordInput.value = password;
    els.passwordInput.type = 'text';
    els.eyeOpen.classList.remove('hidden');
    els.eyeClosed.classList.add('hidden');
    updateStrength();
    updateProcessButton();
    try {
        await navigator.clipboard.writeText(password);
        showToast('Strong password generated and copied to clipboard!', 'success');
    } catch (e) {
        showToast('Strong password generated (copy manually).', 'success');
    }
}

let popoverBlurTimeout;

function showPopoverIfEmpty() {
    if (state.mode === 'encrypt' && !els.passwordInput.value && document.activeElement === els.passwordInput) {
        els.passwordSuggestionPopover.classList.remove('hidden');
    }
}

function hidePopover() {
    els.passwordSuggestionPopover.classList.add('hidden');
}

els.passwordInput.addEventListener('focus', showPopoverIfEmpty);

els.passwordInput.addEventListener('blur', () => {
    popoverBlurTimeout = setTimeout(hidePopover, 150);
});

els.passwordInput.addEventListener('input', () => {
    if (els.passwordInput.value) {
        hidePopover();
    } else {
        showPopoverIfEmpty();
    }
});

els.passwordSuggestionPopover.addEventListener('click', () => {
    clearTimeout(popoverBlurTimeout);
    generateAndFillPassword();
    hidePopover();
    els.passwordInput.focus();
});
