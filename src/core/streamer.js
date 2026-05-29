import { readFileChunk } from '../utils/files.js';
import { workerCall } from './workerBridge.js';
import { state } from '../state.js';
import { zeroBuffer, sanitizeFilename } from '../utils/security.js';
import { updateProgress, finishStreaming, failProcessing, setFinalizingAnimation } from '../ui/progress.js';
import { clearFiles } from '../ui/fileManager.js';
import { showToast } from '../ui/toast.js';

export async function streamEncrypt(file, passwordBytes) {
    state.isStreaming = true;
    let writable = null;

    try {
        const fileHandle = await window.showSaveFilePicker({
            suggestedName: sanitizeFilename(file.name, 'encrypted') + '.enc',
            types: [{ description: 'Encrypted file', accept: { 'application/octet-stream': ['.enc'] } }]
        });
        writable = await fileHandle.createWritable();

        const initResult = await workerCall({
            action: 'initEncrypt',
            password: passwordBytes,
            filename: file.name,
            type: file.type,
            size: file.size
        });

        const header = initResult.data;
        const chunkSize = initResult.chunkSize;
        await writable.write(new Uint8Array(header));

        const numChunks = Math.ceil(file.size / chunkSize);
        let lastPercent = -1;

        for (let i = 0; i < numChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, file.size);
            const chunkData = await readFileChunk(file, start, end);

            let chunkResult = await workerCall({
                action: 'encryptChunk',
                chunkIndex: i,
                data: chunkData
            }, [chunkData]);

            let outU8 = new Uint8Array(chunkResult.data);
            await writable.write(outU8);
            zeroBuffer(outU8);
            outU8 = null;
            chunkResult = null;

            const percent = Math.round(((i + 1) / numChunks) * 100);
            if (percent !== lastPercent) {
                updateProgress(percent, 'Encrypting...');
                lastPercent = percent;
            }
        }

        updateProgress(100, 'Finalizing and securing file...');
        setFinalizingAnimation(true);
        await new Promise(resolve => setTimeout(resolve, 0));

        await workerCall({ action: 'resetSession' });
        await writable.close();

        finishStreaming(sanitizeFilename(file.name, 'encrypted') + '.enc');
        showToast('File encrypted and saved successfully!', 'success');
    } catch (err) {
        if (writable) {
            try { await writable.abort(); } catch (e) {}
        }
        try { await workerCall({ action: 'resetSession' }); } catch (e) {}
        const msg = err.name === 'AbortError'
            ? 'Save cancelled by user.'
            : 'Encryption failed. A partial file may remain on disk.';
        failProcessing(msg);
    } finally {
        state.isStreaming = false;
        zeroBuffer(passwordBytes);
        clearFiles();
    }
}

export async function streamDecrypt(file, passwordBytes) {
    state.isStreaming = true;
    let writable = null;

    try {
        const headerBytes = await readFileChunk(file, 0, 2048);

        const meta = await workerCall({
            action: 'initDecrypt',
            password: passwordBytes,
            header: headerBytes
        }, [headerBytes]);

        const fileHandle = await window.showSaveFilePicker({
            suggestedName: sanitizeFilename(meta.filename, 'decrypted'),
            types: [{ description: 'Decrypted file', accept: { [meta.type || 'application/octet-stream']: [] } }]
        });
        writable = await fileHandle.createWritable();

        const { chunkSize, totalSize, headerLen } = meta;
        const numChunks = Math.ceil(totalSize / chunkSize);
        let fileOffset = headerLen;

        let lastPercent = -1;
        for (let i = 0; i < numChunks; i++) {
            const expectedPt = Math.min(chunkSize, totalSize - (i * chunkSize));
            const cipherLen = expectedPt + 16; // TAG_LEN = 16

            const chunkData = await readFileChunk(file, fileOffset, fileOffset + cipherLen);
            fileOffset += cipherLen;

            let chunkResult = await workerCall({
                action: 'decryptChunk',
                chunkIndex: i,
                data: chunkData
            }, [chunkData]);

            let ptU8 = new Uint8Array(chunkResult.data);
            await writable.write(ptU8);
            zeroBuffer(ptU8);
            ptU8 = null;
            chunkResult = null;

            const percent = Math.round(((i + 1) / numChunks) * 100);
            if (percent !== lastPercent) {
                updateProgress(percent, 'Decrypting...');
                lastPercent = percent;
            }
        }

        updateProgress(100, 'Finalizing and securing file...');
        setFinalizingAnimation(true);
        await new Promise(resolve => setTimeout(resolve, 0));

        await workerCall({ action: 'resetSession' });
        await writable.close();

        finishStreaming(sanitizeFilename(meta.filename, 'decrypted'));
        showToast('File decrypted and saved successfully!', 'success');
    } catch (err) {
        if (writable) {
            try { await writable.abort(); } catch (e) {}
        }
        try { await workerCall({ action: 'resetSession' }); } catch (e) {}
        const msg = err.name === 'AbortError'
            ? 'Save cancelled by user.'
            : 'Decryption failed. A partial file may remain on disk.';
        failProcessing(msg);
    } finally {
        state.isStreaming = false;
        zeroBuffer(passwordBytes);
        clearFiles();
    }
}
