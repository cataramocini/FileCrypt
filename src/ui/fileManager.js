import { els, escapeHtml, formatBytes } from '../utils/dom.js';
import { state } from '../state.js';
import { MAX_TOTAL_SIZE, STREAM_THRESHOLD } from '../config.js';
import { sanitizeFilename } from '../utils/security.js';
import { canStream } from '../utils/files.js';
import { showToast } from './toast.js';
import { updateProcessButton } from './processButton.js';

export function handleFiles(fileList) {
    if (!fileList || fileList.length === 0) return;

    if (state.mode === 'decrypt') {
        // Decrypt mode: only process the first .enc file
        const file = fileList[0];
        if (!file.name.endsWith('.enc')) {
            showToast(
                'Invalid file format. The selected file is not a .enc file. Please select a valid encrypted file to decrypt.',
                'error'
            );
            els.fileInput.value = '';
            return;
        }
        state.currentFiles = [file];
        renderFileList();
        els.fileInfo.classList.remove('hidden');
        els.dropZone.classList.add('hidden');
        updateProcessButton();
        return;
    }

    // Encrypt mode: accept multiple files, skip .enc files
    const newFiles = [];
    let skippedEnc = false;
    for (const file of fileList) {
        if (file.name.endsWith('.enc')) {
            skippedEnc = true;
        } else {
            newFiles.push(file);
        }
    }
    if (skippedEnc) {
        showToast('Skipped already-encrypted .enc files.', 'warning');
    }
    if (newFiles.length === 0) {
        els.fileInput.value = '';
        return;
    }

    // Check total size
    const projectedTotal = state.currentFiles.reduce((s, f) => s + f.size, 0) + newFiles.reduce((s, f) => s + f.size, 0);

    // Gate 1: Universal hard cap (64 GB)
    if (projectedTotal > MAX_TOTAL_SIZE) {
        showToast(`Total size exceeds ${formatBytes(MAX_TOTAL_SIZE)}. Please select a smaller file.`, 'error');
        els.fileInput.value = '';
        return;
    }

    // Gate 2: Non-streaming browsers cannot handle files over 256 MB in memory
    if (!canStream() && projectedTotal > STREAM_THRESHOLD) {
        showToast(`Files over ${formatBytes(STREAM_THRESHOLD)} are not supported in this browser. Please use Chrome or Edge.`, 'error');
        els.fileInput.value = '';
        return;
    }

    state.currentFiles.push(...newFiles);
    renderFileList();
    els.fileInfo.classList.remove('hidden');
    els.dropZone.classList.add('hidden');
    updateProcessButton();
}

export function removeFile(index) {
    state.currentFiles.splice(index, 1);
    if (state.currentFiles.length === 0) {
        clearFiles();
    } else {
        renderFileList();
        updateProcessButton();
    }
}

export function clearFiles() {
    state.currentFiles = [];
    els.fileInput.value = '';
    els.fileInfo.classList.add('hidden');
    els.dropZone.classList.remove('hidden');
    updateProcessButton();
}

export function renderFileList() {
    els.fileList.innerHTML = '';
    let totalSize = 0;
    state.currentFiles.forEach((file, index) => {
        totalSize += file.size;
        const item = document.createElement('div');
        item.className = 'group flex items-center justify-between bg-gray-50 dark:bg-gray-800/40 rounded-lg px-3 py-2 border border-gray-100 dark:border-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-800/70 transition-colors';
        const safeName = escapeHtml(sanitizeFilename(file.name, 'file'));
        item.innerHTML = `
            <div class="flex items-center gap-2 min-w-0">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span class="text-sm truncate text-gray-700 dark:text-gray-200">${safeName}</span>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0 ml-3">
                <span class="text-xs text-gray-400 dark:text-gray-500">${formatBytes(file.size)}</span>
                <button class="remove-file-btn p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-gray-200 dark:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-red-400 transition-all" data-index="${index}" title="Remove file">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        `;
        item.querySelector('.remove-file-btn').addEventListener('click', () => removeFile(index));
        els.fileList.appendChild(item);
    });
    els.fileCountText.textContent = `${state.currentFiles.length} file${state.currentFiles.length !== 1 ? 's' : ''} selected`;
    els.fileTotalSize.textContent = `${formatBytes(totalSize)} total`;
}

els.fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
els.addFilesBtn.addEventListener('click', () => els.fileInput.click());
els.clearFileBtn.addEventListener('click', clearFiles);

// Drag & Drop
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    els.dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
    }, false);
});
['dragenter', 'dragover'].forEach(eventName => {
    els.dropZone.addEventListener(eventName, () => els.dropZone.classList.add('drag-active'), false);
});
['dragleave', 'drop'].forEach(eventName => {
    els.dropZone.addEventListener(eventName, () => els.dropZone.classList.remove('drag-active'), false);
});
els.dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt.files.length) handleFiles(dt.files);
}, false);
