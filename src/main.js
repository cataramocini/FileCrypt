import './input.css';
import { worker } from './core/workerBridge.js';
import { state } from './state.js';

// UI modules (import for side-effects: event listeners)
import './ui/theme.js';
import './ui/tabs.js';
import './ui/fileManager.js';
import './ui/password.js';
import './ui/strengthMeter.js';
import './ui/passwordGen.js';
import './ui/processButton.js';
import './ui/progress.js';
import './core/processor.js';

import { updateProgress, finishProcessing, failProcessing } from './ui/progress.js';
import { setMode } from './ui/tabs.js';

// Worker message handler for non-streaming operations
worker.onmessage = function(e) {
    if (state.isStreaming) return; // Streaming operations use their own listener
    const payload = e.data;
    if (payload.type === 'progress') {
        updateProgress(payload.percent, payload.label);
    } else if (payload.type === 'complete') {
        finishProcessing(payload.data, payload.filename, payload.mimeType);
    } else if (payload.type === 'error') {
        failProcessing(payload.message);
    }
};

worker.onerror = function(err) {
    failProcessing('Worker error: ' + err.message);
};

// Initialize UI
setMode('encrypt');
