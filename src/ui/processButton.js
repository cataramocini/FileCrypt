import { els } from '../utils/dom.js';
import { state } from '../state.js';

export function updateProcessButton() {
    const hasFile = state.currentFiles.length > 0;
    const hasPwd = els.passwordInput.value.length > 0;
    const minLengthOk = state.mode === 'decrypt' || els.passwordInput.value.length >= 8;
    const hasConfirm = state.mode === 'decrypt' || els.confirmPasswordInput.value.length > 0;
    const match = state.mode === 'decrypt' || els.passwordInput.value === els.confirmPasswordInput.value;
    els.processBtn.disabled = !hasFile || !hasPwd || !minLengthOk || !hasConfirm || !match || state.isProcessing;
}

els.passwordInput.addEventListener('input', updateProcessButton);
els.confirmPasswordInput.addEventListener('input', updateProcessButton);
