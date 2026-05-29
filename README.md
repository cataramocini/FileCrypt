# FileCrypt

A fully client-side file encryption tool. No server, no uploads, zero external runtime dependencies. All cryptographic operations happen locally in your browser using the Web Crypto API and Argon2id WebAssembly.

## Usage

1. Open the deployed app in any modern browser (Chrome, Edge, Firefox, Safari) over `https://` or `localhost`. The app enforces a secure context to access the Web Crypto API.
2. **Encrypt**: Choose one or more files, enter a strong password (or generate one), confirm it, and download the `.enc` protected file.
3. **Decrypt**: Select your `.enc` file, enter the password, and recover the original file.

## Development

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev

# Build for production
npm run build

# Preview the production build locally
npm run preview
```

## Deploy to GitHub Pages

```bash
npm run deploy
```

This builds the project and pushes the `dist/` folder to the `gh-pages` branch.

## Features

- **AES-256-GCM** authenticated encryption
- **Argon2id** key derivation via WebAssembly in a dedicated Web Worker
- **Streaming encryption/decryption** for large files (via File System Access API on supported browsers)
- **Password strength meter** with entropy estimation
- **Password generator** with automatic clipboard copy and rejection sampling (no modulo bias)
- **Dark mode** support (respects system preference)
- **Drag & drop** file selection with multi-file support for encryption
- **Real-time progress** bar during encryption/decryption
- **Chunked processing** (1 MB plaintext chunks) to handle files up to 64 GB without freezing the UI
- **Memory-hardened**: sensitive Uint8Arrays are explicitly zeroed after use; streaming path avoids loading entire files into RAM

## Technical Stack

| Parameter | Value |
|-----------|-------|
| **Algorithm** | AES-256-GCM (Authenticated Encryption) |
| **Key Derivation** | Argon2id (m=65536 KiB, t=3, p=1) via WebAssembly in a dedicated Web Worker |
| **Salt** | 16 bytes (cryptographically secure random, unique per file) |
| **IV / Nonce** | 12 bytes per chunk (8 bytes random base + 4 bytes big-endian chunk index, unique per file) |
| **Auth Tag** | 128-bit GCM tag per chunk |
| **Chunk Size** | 1 MB plaintext per chunk |
| **Memory Safety** | Transferable Objects (`ArrayBuffer`) to avoid copies; explicit `.fill(0)` on sensitive buffers; WASM heap scrubbing after Argon2id execution |

## File Format (.enc)

| Offset | Size | Description |
|--------|------|-------------|
| 0 | 10 | Magic `FILECRYPT1` |
| 10 | 1 | Version (1) |
| 11 | 16 | Argon2id Salt |
| 27 | 12 | Metadata IV |
| 39 | 4 | Metadata ciphertext length (uint32 big-endian) |
| 43 | N | Encrypted metadata JSON (filename, MIME type, original size) |
| 43+N | 12 | Chunk base IV |
| 55+N | 4 | Chunk size (uint32 big-endian) |
| 59+N | M | Chunk 0 ciphertext + 16-byte GCM tag |
| ... | ... | Remaining chunks |

### Metadata Schema

The metadata JSON is encrypted with AES-256-GCM using a separate IV and contains:

```json
{
  "filename": "original-file-name.ext",
  "type": "application/octet-stream",
  "size": 12345678
}
```

All metadata fields are validated against a strict schema before memory allocation to prevent corrupted or malicious headers from causing out-of-bounds reads or excessive memory consumption.

## Architecture

The project is organized into focused ES modules under `src/`:

### Main Thread (`src/`)

| Module | Responsibility |
|--------|---------------|
| `src/main.js` | Bootstrap: imports CSS, all modules, and wires up the global worker message handler |
| `src/config.js` | App constants (size limits, streaming threshold, SVG icons) |
| `src/state.js` | Shared mutable state (mode, file list, processing flags) |
| `src/utils/security.js` | `zeroBuffer`, `sanitizeFilename` |
| `src/utils/dom.js` | DOM element cache, `escapeHtml`, `formatBytes` |
| `src/utils/files.js` | `canStream`, `readFileChunk` |
| `src/ui/theme.js` | Dark/light mode toggle |
| `src/ui/tabs.js` | Encrypt/Decrypt tab switching |
| `src/ui/fileManager.js` | File upload, drag & drop, file list rendering |
| `src/ui/password.js` | Password visibility toggles |
| `src/ui/strengthMeter.js` | Password strength calculation and bar UI |
| `src/ui/passwordGen.js` | Strong password generator + suggestion popover |
| `src/ui/processButton.js` | Encrypt/Decrypt button state logic |
| `src/ui/progress.js` | Progress bar, finish/fail handlers, download link |
| `src/ui/toast.js` | Toast notification system |
| `src/core/workerBridge.js` | Web Worker instance and `workerCall` helper |
| `src/core/streamer.js` | Streaming encrypt/decrypt for large files |
| `src/core/processor.js` | `startProcess`: workflow orchestration and password capture |

### Worker Thread (`public/`)

| Module | Responsibility |
|--------|---------------|
| `public/crypto-worker.js` | Isolated Web Worker managing Argon2id hashing, ZIP archive creation, chunk-by-chunk stream processing, and AES-GCM execution. Performs memory zeroing and WASM heap scrubbing. |
| `public/argon2-bundled.min.js` + `public/argon2.wasm` | Local Argon2id WebAssembly runtime |

### Assets (`public/`)

| File | Purpose |
|------|---------|
| `index.html` | Semantic HTML layout, strict Content Security Policy, and UI structure |
| `public/enforce-secure.js` | HTTPS/localhost enforcement (loaded before the module bundle to satisfy CSP) |
| `public/theme-head.js` | Pre-load dark mode class to prevent FOUC |
| `src/input.css` | Tailwind directives + custom animations |
| `styles.css` | **Generated** Tailwind CSS build artifact (produced by Vite at build time) |

## Testing

```bash
# Install browser binaries (one-time)
npx playwright install chromium

# Run the integration test suite
npm test
```

Tests run inside a real Chromium browser via Vitest Browser Mode. They exercise the actual Web Worker + Argon2id WASM stack to verify:

- **Roundtrip integrity**: A file encrypted and then decrypted with the same password returns byte-for-byte identical content.
- **Authentication failure**: Decrypting with a wrong password is cryptographically rejected (AES-GCM tag verification fails).

## Security Notes

- **Zero-knowledge architecture**: Your password, files, and keys never leave your device. There is no server component.
- **Password persistence**: Your password is never stored. It is encoded to a `Uint8Array` as soon as possible, and the original string is dereferenced and cleared from input fields to become eligible for garbage collection.
- **Memory zeroing**: After key derivation, encryption, or decryption, all sensitive `Uint8Array` buffers (password, key material, plaintext chunks) are explicitly overwritten with zeros via `.fill(0)`.
- **WASM heap scrubbing**: After Argon2id hashing, the worker scans the Emscripten WASM linear memory for any lingering copies of the password and overwrites them with zeros. Emscripten's default allocator does not zero freed memory, so this step is essential.
- **Metadata confidentiality**: The original file name and MIME type are encrypted in the header; no plaintext metadata leaks.
- **No backdoor**: If you lose your password, the file cannot be recovered. There is no key escrow or recovery mechanism.
- **CSP hardened**: A strict Content Security Policy is enforced via `<meta>` tag (`default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; worker-src 'self'; frame-ancestors 'none';`).

## Browser Compatibility

| Feature | Chrome/Edge | Firefox | Safari |
|---------|-------------|---------|--------|
| Encryption/Decryption | ✅ | ✅ | ✅ |
| Large file streaming (up to 64 GB) | ✅ (File System Access API) | ❌ (falls back to in-memory, 256 MB max) | ❌ (falls back to in-memory, 256 MB max) |
| Password generator | ✅ | ✅ | ✅ |
| Drag & drop | ✅ | ✅ | ✅ |

## License

This project is provided as-is for secure client-side file encryption. Use at your own risk. Always verify backups of important data before encryption.
