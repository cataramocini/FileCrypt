export const els = {
    html: document.documentElement,
    themeToggle: document.getElementById('themeToggle'),
    tabEncrypt: document.getElementById('tabEncrypt'),
    tabDecrypt: document.getElementById('tabDecrypt'),
    dropZone: document.getElementById('dropZone'),
    dropZoneIcon: document.getElementById('dropZoneIcon'),
    dropZoneSubtext: document.getElementById('dropZoneSubtext'),
    dropZoneHelper: document.getElementById('dropZoneHelper'),
    fileInput: document.getElementById('fileInput'),
    fileInfo: document.getElementById('fileInfo'),
    fileList: document.getElementById('fileList'),
    fileCountText: document.getElementById('fileCountText'),
    fileTotalSize: document.getElementById('fileTotalSize'),
    addFilesSection: document.getElementById('addFilesSection'),
    addFilesBtn: document.getElementById('addFilesBtn'),
    clearFileBtn: document.getElementById('clearFileBtn'),
    passwordInput: document.getElementById('passwordInput'),
    confirmPasswordInput: document.getElementById('confirmPasswordInput'),
    confirmPasswordWrapper: document.getElementById('confirmPasswordWrapper'),
    togglePasswordBtn: document.getElementById('togglePasswordBtn'),
    eyeOpen: document.getElementById('eyeOpen'),
    eyeClosed: document.getElementById('eyeClosed'),
    toggleConfirmPasswordBtn: document.getElementById('toggleConfirmPasswordBtn'),
    eyeOpenConfirm: document.getElementById('eyeOpenConfirm'),
    eyeClosedConfirm: document.getElementById('eyeClosedConfirm'),
    passwordSuggestionPopover: document.getElementById('passwordSuggestionPopover'),
    bars: [document.getElementById('bar1'), document.getElementById('bar2'), document.getElementById('bar3'), document.getElementById('bar4')],
    strengthMeter: document.getElementById('strengthMeter'),
    strengthText: document.getElementById('strengthText'),
    entropyText: document.getElementById('entropyText'),
    passwordMinLengthText: document.getElementById('passwordMinLengthText'),
    progressContainer: document.getElementById('progressContainer'),
    progressBar: document.getElementById('progressBar'),
    progressText: document.getElementById('progressText'),
    progressLabel: document.getElementById('progressLabel'),
    processBtn: document.getElementById('processBtn'),
    processBtnIcon: document.getElementById('processBtnIcon'),
    processBtnText: document.getElementById('processBtnText'),
    downloadContainer: document.getElementById('downloadContainer'),
    downloadLink: document.getElementById('downloadLink'),
    downloadLinkText: document.getElementById('downloadLinkText'),
    downloadWarning: document.getElementById('downloadWarning'),
    toast: document.getElementById('toast'),
    toastMsg: document.getElementById('toastMsg')
};

export function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
