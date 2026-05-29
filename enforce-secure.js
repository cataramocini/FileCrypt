(function enforceSecureContext() {
    const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    const isSecure = location.protocol === 'https:' || isLocalhost;
    if (!isSecure) {
        document.body.innerHTML = `
            <div style="max-width:600px;margin:100px auto;padding:40px;font-family:sans-serif;text-align:center;">
                <h1 style="color:#dc2626;">🔒 Secure Connection Required</h1>
                <p>FileCrypt must be served over HTTPS or localhost to protect your files and passwords.</p>
                <p>Please access this application via a secure connection.</p>
            </div>
        `;
        throw new Error('Insecure context: FileCrypt requires HTTPS or localhost.');
    }
})();
