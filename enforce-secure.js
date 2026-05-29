(function enforceSecureContext() {
    const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    const isSecure = location.protocol === 'https:' || isLocalhost;
    if (!isSecure) {
        document.body.innerHTML = `
            <div class="max-w-xl mx-auto mt-24 p-10 text-center">
                <h1 class="text-red-600 text-2xl font-bold mb-4">🔒 Secure Connection Required</h1>
                <p class="mb-2">FileCrypt must be served over HTTPS or localhost to protect your files and passwords.</p>
                <p>Please access this application via a secure connection.</p>
            </div>
        `;
        throw new Error('Insecure context: FileCrypt requires HTTPS or localhost.');
    }
})();
