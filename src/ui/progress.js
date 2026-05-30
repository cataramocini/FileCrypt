import { els } from '../utils/dom.js';
import { state } from '../state.js';
import { zeroBuffer, sanitizeFilename, secureClearPasswordInputs } from '../utils/security.js';
import { showToast } from './toast.js';
import { clearFiles } from './fileManager.js';
import { updateProcessButton } from './processButton.js';
import { updateStrength } from './strengthMeter.js';

// ── Module-level timer references for the download lifecycle ──
let countdownInterval = null;
let expirationTimeout = null;
let postClickTimeout = null;
let activeClickHandler = null;

function clearDownloadTimers() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    if (expirationTimeout) {
        clearTimeout(expirationTimeout);
        expirationTimeout = null;
    }
    if (postClickTimeout) {
        clearTimeout(postClickTimeout);
        postClickTimeout = null;
    }
}

function removeActiveClickHandler() {
    if (activeClickHandler) {
        els.downloadLink.removeEventListener('click', activeClickHandler);
        activeClickHandler = null;
    }
}

function resetDownloadButtonStyles() {
    els.downloadLink.style.backgroundColor = '';
    els.downloadLink.style.cursor = '';
    els.downloadLink.style.pointerEvents = '';
    els.downloadLink.removeAttribute('data-disabled');
    els.downloadLink.disabled = false;
    els.downloadLink.href = '#';
    els.downloadLinkText.textContent = 'Download';
    els.downloadLink.classList.add('bg-emerald-600', 'hover:bg-emerald-700');
}

export function revokeActiveObjectUrl() {
    if (state.activeObjectUrl) {
        URL.revokeObjectURL(state.activeObjectUrl);
        state.activeObjectUrl = null;
    }
    clearDownloadTimers();
    removeActiveClickHandler();
    resetDownloadButtonStyles();
}

function setDownloadExpiredState() {
    if (state.activeObjectUrl) {
        URL.revokeObjectURL(state.activeObjectUrl);
        state.activeObjectUrl = null;
    }

    removeActiveClickHandler();

    els.downloadLink.removeAttribute('href');
    els.downloadLink.setAttribute('data-disabled', 'true');
    els.downloadLink.disabled = true;
    els.downloadLink.style.backgroundColor = '#2d3748';
    els.downloadLink.style.cursor = 'not-allowed';
    els.downloadLink.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
    els.downloadLinkText.textContent = 'Download link expired';

    els.downloadWarning.textContent = 'This link has expired for your security. Please re-encrypt the file.';
    els.downloadWarning.classList.remove('text-amber-600', 'dark:text-amber-400');
    els.downloadWarning.classList.add('text-red-600', 'dark:text-red-400');
}

function setDownloadCleanedState() {
    if (state.activeObjectUrl) {
        URL.revokeObjectURL(state.activeObjectUrl);
        state.activeObjectUrl = null;
    }

    removeActiveClickHandler();

    els.downloadLink.removeAttribute('href');
    els.downloadLink.setAttribute('data-disabled', 'true');
    els.downloadLink.disabled = true;
    els.downloadLink.style.backgroundColor = '#2d3748';
    els.downloadLink.style.cursor = 'not-allowed';
    els.downloadLink.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
    els.downloadLinkText.textContent = 'Downloaded & Cleaned from memory';
}

function startDownloadCountdown() {
    let secondsLeft = 30;

    // Reset warning styling to amber in case it was previously red
    els.downloadWarning.classList.remove('text-red-600', 'dark:text-red-400');
    els.downloadWarning.classList.add('text-amber-600', 'dark:text-amber-400');

    const updateWarningText = () => {
        els.downloadWarning.textContent =
            `This secure download link expires in ${secondsLeft} second${secondsLeft !== 1 ? 's' : ''}.`;
    };

    updateWarningText();

    countdownInterval = setInterval(() => {
        secondsLeft--;
        if (secondsLeft > 0) {
            updateWarningText();
        } else {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    }, 1000);

    expirationTimeout = setTimeout(() => {
        clearDownloadTimers();
        setDownloadExpiredState();
    }, 30000);
}

export function updateProgress(percent, label) {
    els.progressBar.style.width = percent + '%';
    els.progressText.textContent = percent + '%';
    els.progressLabel.textContent = label || (state.mode === 'encrypt' ? 'Encrypting...' : 'Decrypting...');
}

export function setFinalizingAnimation(active) {
    if (active) {
        els.progressBar.classList.add('animate-pulse');
        els.progressLabel.classList.add('animate-pulse');
    } else {
        els.progressBar.classList.remove('animate-pulse');
        els.progressLabel.classList.remove('animate-pulse');
    }
}

export function finishProcessing(buffer, filename, mimeType) {
    setFinalizingAnimation(false);
    state.isProcessing = false;
    updateProcessButton();
    els.processBtnText.textContent = state.mode === 'encrypt' ? 'Encrypt Files' : 'Decrypt File';
    updateProgress(100, state.mode === 'encrypt' ? 'Encryption Successful!' : 'Decryption Successful!');
    secureClearPasswordInputs();
    updateStrength();

    const blob = new Blob([buffer], { type: mimeType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);

    // Clean up any previous download state before assigning the new one
    revokeActiveObjectUrl();
    state.activeObjectUrl = url;

    let safeFilename = sanitizeFilename(filename, state.mode === 'encrypt' ? 'encrypted.enc' : 'decrypted');
    if (state.mode === 'encrypt' && !safeFilename.endsWith('.enc')) {
        safeFilename = safeFilename.slice(0, 196) + '.enc';
    }

    els.downloadLink.href = url;
    els.downloadLink.download = safeFilename;
    resetDownloadButtonStyles();

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
    els.downloadWarning.classList.remove('hidden');

    // Click handler: immediately cancels the 30-second countdown and
    // schedules the 2-second post-download cleanup.
    activeClickHandler = () => {
        clearDownloadTimers();

        postClickTimeout = setTimeout(() => {
            setDownloadCleanedState();
            postClickTimeout = null;
        }, 2000);
    };
    els.downloadLink.addEventListener('click', activeClickHandler, { once: true });

    // Start the 30-second hard-expiration countdown
    startDownloadCountdown();

    // Memory safety: clear plaintext buffer before dereferencing
    zeroBuffer(new Uint8Array(buffer));
    buffer = null;
    clearFiles();

    showToast(state.mode === 'encrypt' ? 'Files encrypted successfully!' : 'File decrypted successfully!', 'success');
}

export function failProcessing(message) {
    setFinalizingAnimation(false);
    state.isProcessing = false;
    updateProcessButton();
    els.processBtnText.textContent = state.mode === 'encrypt' ? 'Encrypt Files' : 'Decrypt File';
    els.progressContainer.classList.add('hidden');
    els.downloadWarning.classList.add('hidden');
    secureClearPasswordInputs();
    updateStrength();
    showToast(message, 'error');
}

export function finishStreaming(filename) {
    setFinalizingAnimation(false);
    state.isProcessing = false;
    updateProcessButton();
    els.processBtnText.textContent = state.mode === 'encrypt' ? 'Encrypt Files' : 'Decrypt File';
    updateProgress(100, state.mode === 'encrypt' ? 'Encryption Successful!' : 'Decryption Successful!');
    els.progressContainer.classList.add('hidden');
    els.downloadContainer.classList.add('hidden');
    els.downloadWarning.classList.add('hidden');
    revokeActiveObjectUrl();
    secureClearPasswordInputs();
    updateStrength();
}

export function resetUI() {
    if (state.isProcessing) return;
    clearFiles();
    secureClearPasswordInputs();
    els.progressContainer.classList.add('hidden');
    els.downloadContainer.classList.add('hidden');
    els.downloadWarning.classList.add('hidden');
    revokeActiveObjectUrl();
    updateStrength();
    updateProcessButton();
}
