import { els, formatBytes } from '../utils/dom.js';
import { state } from '../state.js';
import { canStream } from '../utils/files.js';
import { ICON_ENCRYPT, ICON_DECRYPT, MAX_TOTAL_SIZE, STREAM_THRESHOLD } from '../config.js';
import { resetUI } from './progress.js';

export function setMode(newMode) {
    state.mode = newMode;
    if (state.mode === 'encrypt') {
        els.tabEncrypt.classList.add('text-blue-600', 'dark:text-blue-400', 'border-blue-600', 'dark:border-blue-400', 'bg-blue-50/50', 'dark:bg-blue-900/20');
        els.tabEncrypt.classList.remove('text-gray-500', 'dark:text-gray-400', 'border-transparent');
        els.tabDecrypt.classList.remove('text-blue-600', 'dark:text-blue-400', 'border-blue-600', 'dark:border-blue-400', 'bg-blue-50/50', 'dark:bg-blue-900/20');
        els.tabDecrypt.classList.add('text-gray-500', 'dark:text-gray-400', 'border-transparent');
        els.confirmPasswordWrapper.classList.remove('hidden');
        els.processBtnText.textContent = 'Encrypt Files';
        els.dropZoneIcon.querySelector('path').setAttribute('d', ICON_ENCRYPT);
        els.dropZoneSubtext.textContent = `Any file types up to ${formatBytes(MAX_TOTAL_SIZE)}`;
        els.dropZoneHelper.textContent = 'Files larger than 256 MB are not supported on non-Chromium browsers.';
        els.passwordInput.placeholder = 'Enter a strong password...';
        els.strengthMeter.classList.remove('hidden');
        els.addFilesSection.classList.remove('hidden');
        els.fileInput.removeAttribute('accept');
        els.fileInput.setAttribute('multiple', '');
    } else {
        els.tabDecrypt.classList.add('text-blue-600', 'dark:text-blue-400', 'border-blue-600', 'dark:border-blue-400', 'bg-blue-50/50', 'dark:bg-blue-900/20');
        els.tabDecrypt.classList.remove('text-gray-500', 'dark:text-gray-400', 'border-transparent');
        els.tabEncrypt.classList.remove('text-blue-600', 'dark:text-blue-400', 'border-blue-600', 'dark:border-blue-400', 'bg-blue-50/50', 'dark:bg-blue-900/20');
        els.tabEncrypt.classList.add('text-gray-500', 'dark:text-gray-400', 'border-transparent');
        els.confirmPasswordWrapper.classList.add('hidden');
        els.processBtnText.textContent = 'Decrypt File';
        els.dropZoneIcon.querySelector('path').setAttribute('d', ICON_DECRYPT);
        els.dropZoneSubtext.textContent = 'Select your .enc file';
        els.dropZoneHelper.textContent = 'Files larger than 256 MB are not supported on non-Chromium browsers.';
        els.passwordInput.placeholder = 'Enter decryption password';
        els.strengthMeter.classList.add('hidden');
        els.addFilesSection.classList.add('hidden');
        els.fileInput.setAttribute('accept', '.enc');
        els.fileInput.removeAttribute('multiple');
    }
    resetUI();
}

els.tabEncrypt.addEventListener('click', () => setMode('encrypt'));
els.tabDecrypt.addEventListener('click', () => setMode('decrypt'));
