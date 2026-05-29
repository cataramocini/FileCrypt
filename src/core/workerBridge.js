import { state } from '../state.js';

export const worker = new Worker('./crypto-worker.js');

export function workerCall(msg, transfer) {
    return new Promise((resolve, reject) => {
        function handler(e) {
            const payload = e.data;
            worker.removeEventListener('message', handler);
            if (payload.type === 'streamError' || payload.type === 'error') {
                reject(new Error(payload.message));
            } else {
                resolve(payload);
            }
        }
        worker.addEventListener('message', handler);
        worker.postMessage(msg, transfer || []);
    });
}

worker.onerror = function(err) {
    // This will be overridden in main.js after progress module loads,
    // but provide a basic fallback here.
    console.error('Worker error:', err);
};

// Warn users if they try to leave the page during an active streaming operation
window.addEventListener('beforeunload', (e) => {
    if (state.isStreaming && state.isProcessing) {
        e.preventDefault();
        e.returnValue = '';
    }
});
