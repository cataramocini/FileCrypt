import { els } from '../utils/dom.js';

els.togglePasswordBtn.addEventListener('click', () => {
    const isHidden = els.passwordInput.type === 'password';
    els.passwordInput.type = isHidden ? 'text' : 'password';
    els.eyeOpen.classList.toggle('hidden');
    els.eyeClosed.classList.toggle('hidden');
});

els.toggleConfirmPasswordBtn.addEventListener('click', () => {
    const isHidden = els.confirmPasswordInput.type === 'password';
    els.confirmPasswordInput.type = isHidden ? 'text' : 'password';
    els.eyeOpenConfirm.classList.toggle('hidden');
    els.eyeClosedConfirm.classList.toggle('hidden');
});
