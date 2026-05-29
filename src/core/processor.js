import { els } from '../utils/dom.js';
import { state } from '../state.js';
import { STREAM_THRESHOLD, MAX_TOTAL_SIZE } from '../config.js';
import { zeroBuffer } from '../utils/security.js';
import { formatBytes } from '../utils/dom.js';
import { updateProgress, revokeActiveObjectUrl, failProcessing } from '../ui/progress.js';
import { showToast } from '../ui/toast.js';
import { streamEncrypt, streamDecrypt } from './streamer.js';
import { worker } from './workerBridge.js';
import { updateProcessButton } from '../ui/processButton.js';
import { updateStrength } from '../ui/strengthMeter.js';

export async function startProcess() {
    if (state.currentFiles.length === 0 || state.isProcessing) return;
    
    // Capture password string and validate before any side effects
    const passwordStr = els.passwordInput.value;
    if (!passwordStr) return;

    if (state.mode === 'encrypt') {
        if (passwordStr !== els.confirmPasswordInput.value) {
            showToast('Passwords do not match.', 'error');
            return;
        }
    }

    // IMMEDIATELY encode to a zeroable typed array and purge the string from UI/RAM.
    // JavaScript strings are immutable and cannot be securely wiped; TypedArrays can.
    const passwordBytes = new TextEncoder().encode(passwordStr);
    
    // Dereference the string and clear inputs so the string is eligible for GC.
    els.passwordInput.value = '';
    els.confirmPasswordInput.value = '';
    // Notify other modules that password changed
    updateStrength();
    updateProcessButton();

    state.isProcessing = true;
    updateProcessButton();
    els.processBtnText.textContent = state.mode === 'encrypt' ? 'Encrypting...' : 'Decrypting...';
    els.progressContainer.classList.remove('hidden');
    els.downloadContainer.classList.add('hidden');
    revokeActiveObjectUrl();
    updateProgress(0);

    try {
        const totalSize = state.currentFiles.reduce((s, f) => s + f.size, 0);
        const useStreaming = totalSize >= STREAM_THRESHOLD && 'showSaveFilePicker' in window;

        if (useStreaming) {
            if (state.mode === 'encrypt') {
                if (state.currentFiles.length > 1) {
                    throw new Error(`Multi-file uploads over ${formatBytes(STREAM_THRESHOLD)} are not supported. Please select a single file or reduce the total size.`);
                }
                await streamEncrypt(state.currentFiles[0], passwordBytes);
            } else {
                await streamDecrypt(state.currentFiles[0], passwordBytes);
            }
        } else {
            if (state.mode === 'encrypt') {
                const fileDataArray = await Promise.all(state.currentFiles.map(async (file) => ({
                    name: file.name,
                    type: file.type,
                    data: await file.arrayBuffer()
                })));
                const transfers = fileDataArray.map(f => f.data);
                worker.postMessage({
                    action: state.mode,
                    files: fileDataArray,
                    password: passwordBytes
                }, transfers);
            } else {
                const arrayBuffer = await state.currentFiles[0].arrayBuffer();
                worker.postMessage({
                    action: state.mode,
                    fileData: arrayBuffer,
                    password: passwordBytes,
                    filename: state.currentFiles[0].name,
                    type: state.currentFiles[0].type
                }, [arrayBuffer]);
            }
            zeroBuffer(passwordBytes);
        }
    } catch (err) {
        zeroBuffer(passwordBytes);
        failProcessing('Failed to read file: ' + err.message);
    }
}

els.processBtn.addEventListener('click', startProcess);
