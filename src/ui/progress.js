import { els } from '../utils/dom.js';
import { state } from '../state.js';
import { zeroBuffer, sanitizeFilename } from '../utils/security.js';
import { showToast } from './toast.js';
import { clearFiles } from './fileManager.js';
import { updateProcessButton } from './processButton.js';
import { updateStrength } from './strengthMeter.js';

export function revokeActiveObjectUrl() {
    if (state.activeObjectUrl) {
        URL.revokeObjectURL(state.activeObjectUrl);
        state.activeObjectUrl = null;
    }
}

export function updateProgress(percent, label) {
    els.progressBar.style.width = percent + '%';
    els.progressText.textContent = percent + '%';
    els.progressLabel.textContent = label || (state.mode === 'encrypt' ? 'Encrypting...' : 'Decrypting...');
}

export function finishProcessing(buffer, filename, mimeType) {
    state.isProcessing = false;
    updateProcessButton();
    els.processBtnText.textContent = state.mode === 'encrypt' ? 'Encrypt Files' : 'Decrypt File';
    updateProgress(100, state.mode === 'encrypt' ? 'Encryption Successful!' : 'Decryption Successful!');
    els.passwordInput.value = '';
    els.confirmPasswordInput.value = '';
    updateStrength();

    const blob = new Blob([buffer], {type: mimeType || 'application/octet-stream'});
    const url = URL.createObjectURL(blob);
    revokeActiveObjectUrl();
    state.activeObjectUrl = url;

    let safeFilename = sanitizeFilename(filename, state.mode === 'encrypt' ? 'encrypted.enc' : 'decrypted');
    // Ensure .enc extension is preserved for encrypted files after sanitization/truncation
    if (state.mode === 'encrypt' && !safeFilename.endsWith('.enc')) {
        safeFilename = safeFilename.slice(0, 196) + '.enc';
    }
    els.downloadLink.href = url;
    els.downloadLink.download = safeFilename;

    const lastDot = safeFilename.lastIndexOf('.');
    let baseName = safeFilename;
    let extName = '';
    if (lastDot > 0) {
        baseName = safeFilename.slice(0, lastDot);
        extName = safeFilename.slice(lastDot);
    }
    document.getElementById('downloadFilenameBase').textContent = baseName;
    document.getElementById('downloadFilenameExt').textContent = extName;

    els.downloadContainer.classList.remove('hidden');

    // Cleanup object URL after a delay (allow time for click)
    setTimeout(() => {
        if (state.activeObjectUrl === url) {
            URL.revokeObjectURL(url);
            state.activeObjectUrl = null;
        }
    }, 120000); // 2 minutes

    // Memory safety: clear plaintext buffer before dereferencing
    zeroBuffer(new Uint8Array(buffer));
    buffer = null;
    clearFiles();

    showToast(state.mode === 'encrypt' ? 'Files encrypted successfully!' : 'File decrypted successfully!', 'success');
}

export function failProcessing(message) {
    state.isProcessing = false;
    updateProcessButton();
    els.processBtnText.textContent = state.mode === 'encrypt' ? 'Encrypt Files' : 'Decrypt File';
    els.progressContainer.classList.add('hidden');
    els.passwordInput.value = '';
    els.confirmPasswordInput.value = '';
    updateStrength();
    showToast(message, 'error');
}

export function finishStreaming(filename) {
    state.isProcessing = false;
    updateProcessButton();
    els.processBtnText.textContent = state.mode === 'encrypt' ? 'Encrypt Files' : 'Decrypt File';
    updateProgress(100, state.mode === 'encrypt' ? 'Encryption Successful!' : 'Decryption Successful!');
    els.progressContainer.classList.add('hidden');
    els.downloadContainer.classList.add('hidden');
    els.passwordInput.value = '';
    els.confirmPasswordInput.value = '';
    updateStrength();
}

export function resetUI() {
    if (state.isProcessing) return;
    clearFiles();
    els.passwordInput.value = '';
    els.confirmPasswordInput.value = '';
    els.progressContainer.classList.add('hidden');
    els.downloadContainer.classList.add('hidden');
    revokeActiveObjectUrl();
    updateStrength();
    updateProcessButton();
}
