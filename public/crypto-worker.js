self.Module = self.Module || {};
self.Module.locateFile = function(filename) {
    if (filename === 'argon2.wasm') {
        return new URL('./argon2.wasm', self.location.href).href;
    }
    return filename;
};
importScripts(new URL('./argon2-bundled.min.js', self.location.href).href);

const MAGIC_STR = 'FILECRYPT1';
const MAGIC = new TextEncoder().encode(MAGIC_STR);
const VERSION = 1;
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const CHUNK_SIZE = 1024 * 1024; // 1 MB plaintext chunks
const MIN_CHUNK_SIZE = 64 * 1024; // 64 KB minimum to prevent algorithmic DoS
const MAX_FILE_SIZE = 64 * 1024 * 1024 * 1024; // 64 GB hard limit

// ---- Minimal ZIP Encoder (stored / uncompressed) ----
const CRC32_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    CRC32_TABLE[n] = c >>> 0;
}

function crc32(buf, crc = 0) {
    crc ^= 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createZipFromFiles(files) {
    // files: [{ name: string, data: Uint8Array }, ...]
    const enc = new TextEncoder();
    const chunks = [];
    let offset = 0;
    const centralDir = [];

    for (const f of files) {
        // Sanitize ZIP entry names to prevent ZipSlip path-traversal attacks.
        const safeZipName = (f.name || '')
            .replace(/\\/g, '/')
            .split('/')
            .filter(s => s && s !== '.' && s !== '..')
            .join('/');
        const nameBytes = enc.encode(safeZipName || 'file');
        if (nameBytes.length > 0xFFFF) {
            throw new Error('Filename too long for ZIP format.');
        }
        const nameLen = nameBytes.length;
        const uncompLen = f.data.length;
        const fileCrc = crc32(f.data);

        // Local File Header (30 bytes + filename)
        const lfh = new DataView(new ArrayBuffer(30));
        lfh.setUint32(0, 0x04034B50, true);   // signature
        lfh.setUint16(4, 20, true);            // version needed (2.0)
        lfh.setUint16(6, 0x0800, true);        // general purpose bit flag: UTF-8 names (bit 11)
        lfh.setUint16(8, 0, true);             // compression method: 0 = stored
        lfh.setUint16(10, 0, true);            // file last mod time
        lfh.setUint16(12, 0, true);            // file last mod date
        lfh.setUint32(14, fileCrc, true);      // CRC-32
        lfh.setUint32(18, uncompLen, true);    // compressed size
        lfh.setUint32(22, uncompLen, true);    // uncompressed size
        lfh.setUint16(26, nameLen, true);      // filename length
        lfh.setUint16(28, 0, true);            // extra field length
        chunks.push(new Uint8Array(lfh.buffer), nameBytes, f.data);

        centralDir.push({ nameBytes, nameLen, crc: fileCrc, uncompLen, offset });
        offset += 30 + nameLen + uncompLen;
    }

    const cdStart = offset;
    for (const cd of centralDir) {
        const cdfh = new DataView(new ArrayBuffer(46));
        cdfh.setUint32(0, 0x02014B50, true);   // signature
        cdfh.setUint16(4, 20, true);            // version made by
        cdfh.setUint16(6, 20, true);            // version needed
        cdfh.setUint16(8, 0x0800, true);        // general purpose bit flag (UTF-8)
        cdfh.setUint16(10, 0, true);            // compression method: stored
        cdfh.setUint16(12, 0, true);            // file last mod time
        cdfh.setUint16(14, 0, true);            // file last mod date
        cdfh.setUint32(16, cd.crc, true);
        cdfh.setUint32(20, cd.uncompLen, true);
        cdfh.setUint32(24, cd.uncompLen, true);
        cdfh.setUint16(28, cd.nameLen, true);
        cdfh.setUint16(30, 0, true);            // extra field length
        cdfh.setUint16(32, 0, true);            // comment length
        cdfh.setUint16(34, 0, true);            // disk number start
        cdfh.setUint16(36, 0, true);            // internal file attributes
        cdfh.setUint32(38, 0, true);            // external file attributes
        cdfh.setUint32(42, cd.offset, true);    // local header offset
        chunks.push(new Uint8Array(cdfh.buffer), cd.nameBytes);
        offset += 46 + cd.nameLen;
    }

    const cdSize = offset - cdStart;
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054B50, true);     // signature
    eocd.setUint16(4, 0, true);              // disk number
    eocd.setUint16(6, 0, true);              // disk with central dir
    eocd.setUint16(8, files.length, true);   // central dir records on disk
    eocd.setUint16(10, files.length, true);  // total central dir records
    eocd.setUint32(12, cdSize, true);        // central dir size
    eocd.setUint32(16, cdStart, true);       // central dir offset
    eocd.setUint16(20, 0, true);             // comment length
    chunks.push(new Uint8Array(eocd.buffer));

    const total = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let p = 0;
    for (const c of chunks) {
        out.set(c, p);
        p += c.length;
    }
    return out;
}

function writeUint32(buf, offset, value) {
    new DataView(buf.buffer, buf.byteOffset, buf.byteLength).setUint32(offset, value, false);
}
function readUint32(buf, offset) {
    return new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(offset, false);
}

function zeroBuffer(buf) {
    if (buf && buf.fill) buf.fill(0);
}

// Defense-in-depth: scrub the Emscripten WASM heap for any copies of the
// password that the Argon2 module may have left in its linear memory.
// Emscripten's dlmalloc does NOT zero freed blocks, so password material
// can persist indefinitely in the WASM heap unless we overwrite it.
function scrubWasmHeap(target) {
    try {
        const heap = self.Module && self.Module.HEAPU8;
        if (!heap || !target || target.length === 0) return;
        const first = target[0];
        for (let i = 0; i <= heap.length - target.length; i++) {
            if (heap[i] === first) {
                let match = true;
                for (let j = 1; j < target.length; j++) {
                    if (heap[i + j] !== target[j]) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    heap.fill(0, i, i + target.length);
                    i += target.length - 1;
                }
            }
        }
    } catch (_) {
        // If the WASM heap is not accessible, fall back to JS-only zeroing.
    }
}

async function deriveKey(password, salt) {
    // Defense-in-depth: ensure salt is binary data, not a coerced string.
    // If the Argon2 library implicitly stringifies a Uint8Array, entropy is
    // destroyed and the effective salt becomes predictable.
    if (!(salt instanceof Uint8Array)) {
        throw new TypeError('Argon2id salt must be a Uint8Array to prevent implicit string coercion.');
    }
    try {
        const result = await argon2.hash({
            pass: password,
            salt: salt,
            time: 3,
            mem: 65536,
            parallelism: 1,
            type: argon2.ArgonType.Argon2id,
            hashLen: 32
        });
        // result.hash is a Uint8Array (32 bytes)
        const hash = result.hash;
        // Scrub the WASM heap to remove any lingering password copies.
        scrubWasmHeap(password);
        return hash;
    } finally {
        // Zero password bytes from worker memory as soon as key material is derived.
        zeroBuffer(password);
    }
}

async function encryptFile(fileData, password, filename, mimeType) {
    // Cryptographically secure random values.
    // SECURITY: A unique random salt is generated per-file, ensuring the AES key
    // is never reused across encryptions. Therefore, the 64-bit random prefix
    // of the chunk IVs cannot collide under the same key, preventing
    // AES-GCM nonce reuse catastrophes.
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
    const metaIV = crypto.getRandomValues(new Uint8Array(IV_LEN));
    const contentBaseIV = crypto.getRandomValues(new Uint8Array(IV_LEN));

    const keyMaterial = await deriveKey(password, salt);
    const cryptoKey = await crypto.subtle.importKey('raw', keyMaterial, {name: 'AES-GCM'}, false, ['encrypt']);

    // Encrypt metadata so zero plaintext metadata leaks
    const metadataObj = {filename, type: mimeType || 'application/octet-stream', size: fileData.byteLength};
    const metaPlain = new TextEncoder().encode(JSON.stringify(metadataObj));
    const metaCipher = await crypto.subtle.encrypt({name: 'AES-GCM', iv: metaIV}, cryptoKey, metaPlain);
    zeroBuffer(metaPlain);

    const pt = new Uint8Array(fileData);
    const numChunks = Math.ceil(pt.length / CHUNK_SIZE);

    // Pre-calculate output size
    let totalCipherSize = 0;
    for (let i = 0; i < numChunks; i++) {
        totalCipherSize += Math.min(CHUNK_SIZE, pt.length - i * CHUNK_SIZE) + TAG_LEN;
    }

    const headerLen = MAGIC.length + 1 + SALT_LEN + IV_LEN + 4 + metaCipher.byteLength + IV_LEN + 4;
    const out = new Uint8Array(headerLen + totalCipherSize);
    let off = 0;

    out.set(MAGIC, off); off += MAGIC.length;
    out[off++] = VERSION;
    out.set(salt, off); off += SALT_LEN;
    out.set(metaIV, off); off += IV_LEN;
    writeUint32(out, off, metaCipher.byteLength); off += 4;
    out.set(new Uint8Array(metaCipher), off); off += metaCipher.byteLength;
    out.set(contentBaseIV, off); off += IV_LEN;
    writeUint32(out, off, CHUNK_SIZE); off += 4;

    // Memory safety: clear raw key material immediately after import
    zeroBuffer(keyMaterial);

    for (let i = 0; i < numChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, pt.length);
        const chunk = pt.slice(start, end);

        // Derive unique IV per chunk: first 8 bytes random, last 4 bytes = big-endian chunk index.
        // Safe because contentBaseIV is unique per-file and the key is unique per-file via random salt.
        const iv = new Uint8Array(IV_LEN);
        iv.set(contentBaseIV.slice(0, 8));
        writeUint32(iv, 8, i);

        const cipherChunk = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, cryptoKey, chunk);
        out.set(new Uint8Array(cipherChunk), off);
        off += cipherChunk.byteLength;

        if (i % 5 === 0 || i === numChunks - 1) {
            self.postMessage({type: 'progress', percent: Math.round(((i + 1) / numChunks) * 100)});
        }
    }

    // Memory safety: clear plaintext reference in worker
    zeroBuffer(pt);
    return out;
}

async function decryptFile(fileData, password) {
    const data = new Uint8Array(fileData);
    let off = 0;

    if (data.length < MAGIC.length + 1) {
        throw new Error('File is too small to be a valid encrypted file.');
    }

    const magic = new TextDecoder().decode(data.slice(off, off + MAGIC.length));
    if (magic !== MAGIC_STR) {
        throw new Error('Invalid file format. Please select a valid .enc file.');
    }
    off += MAGIC.length;

    const version = data[off++];
    if (version !== VERSION) {
        throw new Error('Unsupported file version.');
    }

    const salt = data.slice(off, off + SALT_LEN); off += SALT_LEN;
    const metaIV = data.slice(off, off + IV_LEN); off += IV_LEN;
    const metaLen = readUint32(data, off); off += 4;
    if (!Number.isSafeInteger(metaLen) || metaLen < 0 || off + metaLen > data.length) {
        throw new Error('Corrupted file: metadata length out of bounds.');
    }

    const metaCipher = data.slice(off, off + metaLen); off += metaLen;
    const contentBaseIV = data.slice(off, off + IV_LEN); off += IV_LEN;
    const chunkSize = readUint32(data, off); off += 4;
    if (chunkSize < MIN_CHUNK_SIZE || chunkSize > MAX_FILE_SIZE) {
        throw new Error('Corrupted file: invalid chunk size.');
    }

    const keyMaterial = await deriveKey(password, salt);
    const cryptoKey = await crypto.subtle.importKey('raw', keyMaterial, {name: 'AES-GCM'}, false, ['decrypt']);
    zeroBuffer(keyMaterial);

    let metaPlain;
    try {
        metaPlain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: metaIV}, cryptoKey, metaCipher);
    } catch (e) {
        throw new Error('Incorrect password or corrupted metadata.');
    }
    const metadata = JSON.parse(new TextDecoder().decode(metaPlain));
    Object.setPrototypeOf(metadata, null);
    zeroBuffer(new Uint8Array(metaPlain));

    // Validate metadata schema and size before memory allocation
    if (
        typeof metadata !== 'object' ||
        metadata === null ||
        typeof metadata.size !== 'number' ||
        !Number.isFinite(metadata.size) ||
        !Number.isSafeInteger(metadata.size) ||
        metadata.size < 0 ||
        metadata.size > MAX_FILE_SIZE ||
        typeof metadata.filename !== 'string' ||
        typeof metadata.type !== 'string'
    ) {
        throw new Error('Corrupted file: invalid metadata.');
    }

    const totalSize = metadata.size;
    const numChunks = Math.ceil(totalSize / chunkSize);

    // Defensive: ensure declared plaintext size matches actual ciphertext bounds
    let expectedCipherSize = 0;
    for (let i = 0; i < numChunks; i++) {
        const expectedPt = Math.min(chunkSize, totalSize - (i * chunkSize));
        expectedCipherSize += expectedPt + TAG_LEN;
    }
    const headerLen = MAGIC.length + 1 + SALT_LEN + IV_LEN + 4 + metaCipher.byteLength + IV_LEN + 4;
    if (headerLen + expectedCipherSize !== data.length) {
        throw new Error('Corrupted file: size mismatch between metadata and ciphertext.');
    }

    const out = new Uint8Array(totalSize);
    let outOff = 0;

    for (let i = 0; i < numChunks; i++) {
        const expectedPt = Math.min(chunkSize, totalSize - (i * chunkSize));
        const cipherLen = expectedPt + TAG_LEN;
        if (off + cipherLen > data.length) throw new Error('Corrupted file: incomplete chunk data.');

        const cipherChunk = data.slice(off, off + cipherLen); off += cipherLen;

        const iv = new Uint8Array(IV_LEN);
        iv.set(contentBaseIV.slice(0, 8));
        writeUint32(iv, 8, i);

        try {
            const ptChunk = await crypto.subtle.decrypt({name: 'AES-GCM', iv}, cryptoKey, cipherChunk);
            out.set(new Uint8Array(ptChunk), outOff);
            outOff += ptChunk.byteLength;
        } catch (e) {
            throw new Error('Incorrect password or corrupted file data.');
        }

        if (i % 5 === 0 || i === numChunks - 1) {
            self.postMessage({type: 'progress', percent: Math.round(((i + 1) / numChunks) * 100)});
        }
    }

    return {buffer: out.buffer, filename: metadata.filename, type: metadata.type};
}

// ---- Streaming Session State ----
let session = null;

async function initEncryptSession(password, filename, mimeType, size) {
    session = null;

    const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
    const metaIV = crypto.getRandomValues(new Uint8Array(IV_LEN));
    const contentBaseIV = crypto.getRandomValues(new Uint8Array(IV_LEN));

    const keyMaterial = await deriveKey(password, salt);
    const cryptoKey = await crypto.subtle.importKey('raw', keyMaterial, {name: 'AES-GCM'}, false, ['encrypt']);
    zeroBuffer(keyMaterial);

    const metadataObj = {filename, type: mimeType || 'application/octet-stream', size};
    const metaPlain = new TextEncoder().encode(JSON.stringify(metadataObj));
    const metaCipher = await crypto.subtle.encrypt({name: 'AES-GCM', iv: metaIV}, cryptoKey, metaPlain);
    zeroBuffer(metaPlain);

    const headerLen = MAGIC.length + 1 + SALT_LEN + IV_LEN + 4 + metaCipher.byteLength + IV_LEN + 4;
    const header = new Uint8Array(headerLen);
    let off = 0;

    header.set(MAGIC, off); off += MAGIC.length;
    header[off++] = VERSION;
    header.set(salt, off); off += SALT_LEN;
    header.set(metaIV, off); off += IV_LEN;
    writeUint32(header, off, metaCipher.byteLength); off += 4;
    header.set(new Uint8Array(metaCipher), off); off += metaCipher.byteLength;
    header.set(contentBaseIV, off); off += IV_LEN;
    writeUint32(header, off, CHUNK_SIZE); off += 4;

    session = {
        type: 'encrypt',
        cryptoKey,
        contentBaseIV
    };

    return { header: header.buffer, headerLen, chunkSize: CHUNK_SIZE };
}

async function encryptChunkSession(chunkData, chunkIndex) {
    if (!session || session.type !== 'encrypt') {
        throw new Error('No active encryption session.');
    }

    const chunk = new Uint8Array(chunkData);
    const iv = new Uint8Array(IV_LEN);
    iv.set(session.contentBaseIV.slice(0, 8));
    writeUint32(iv, 8, chunkIndex);

    const cipherChunk = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, session.cryptoKey, chunk);
    zeroBuffer(chunk);

    return cipherChunk;
}

async function initDecryptSession(password, headerBytes) {
    session = null;

    const data = new Uint8Array(headerBytes);
    let off = 0;

    if (data.length < MAGIC.length + 1) {
        throw new Error('File is too small to be a valid encrypted file.');
    }

    const magic = new TextDecoder().decode(data.slice(off, off + MAGIC.length));
    if (magic !== MAGIC_STR) {
        throw new Error('Invalid file format. Please select a valid .enc file.');
    }
    off += MAGIC.length;

    const version = data[off++];
    if (version !== VERSION) {
        throw new Error('Unsupported file version.');
    }

    const salt = data.slice(off, off + SALT_LEN); off += SALT_LEN;
    const metaIV = data.slice(off, off + IV_LEN); off += IV_LEN;
    const metaLen = readUint32(data, off); off += 4;
    if (!Number.isSafeInteger(metaLen) || metaLen < 0 || off + metaLen > data.length) {
        throw new Error('Corrupted file: metadata length out of bounds.');
    }

    const metaCipher = data.slice(off, off + metaLen); off += metaLen;
    const contentBaseIV = data.slice(off, off + IV_LEN); off += IV_LEN;
    const chunkSize = readUint32(data, off); off += 4;
    if (chunkSize < MIN_CHUNK_SIZE || chunkSize > MAX_FILE_SIZE) {
        throw new Error('Corrupted file: invalid chunk size.');
    }

    const keyMaterial = await deriveKey(password, salt);
    const cryptoKey = await crypto.subtle.importKey('raw', keyMaterial, {name: 'AES-GCM'}, false, ['decrypt']);
    zeroBuffer(keyMaterial);

    let metaPlain;
    try {
        metaPlain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: metaIV}, cryptoKey, metaCipher);
    } catch (e) {
        throw new Error('Incorrect password or corrupted metadata.');
    }
    const metadata = JSON.parse(new TextDecoder().decode(metaPlain));
    Object.setPrototypeOf(metadata, null);
    zeroBuffer(new Uint8Array(metaPlain));

    if (
        typeof metadata !== 'object' ||
        metadata === null ||
        typeof metadata.size !== 'number' ||
        !Number.isFinite(metadata.size) ||
        !Number.isSafeInteger(metadata.size) ||
        metadata.size < 0 ||
        metadata.size > MAX_FILE_SIZE ||
        typeof metadata.filename !== 'string' ||
        typeof metadata.type !== 'string'
    ) {
        throw new Error('Corrupted file: invalid metadata.');
    }

    session = {
        type: 'decrypt',
        cryptoKey,
        contentBaseIV,
        chunkSize,
        totalSize: metadata.size
    };

    return {
        filename: metadata.filename,
        type: metadata.type,
        chunkSize,
        totalSize: metadata.size,
        headerLen: off
    };
}

async function decryptChunkSession(chunkData, chunkIndex) {
    if (!session || session.type !== 'decrypt') {
        throw new Error('No active decryption session.');
    }

    const data = new Uint8Array(chunkData);
    const expectedPt = Math.min(session.chunkSize, session.totalSize - (chunkIndex * session.chunkSize));
    const cipherLen = expectedPt + TAG_LEN;

    if (data.length !== cipherLen) {
        throw new Error('Corrupted file: chunk size mismatch.');
    }

    const iv = new Uint8Array(IV_LEN);
    iv.set(session.contentBaseIV.slice(0, 8));
    writeUint32(iv, 8, chunkIndex);

    try {
        const ptChunk = await crypto.subtle.decrypt({name: 'AES-GCM', iv}, session.cryptoKey, data);
        return ptChunk;
    } catch (e) {
        throw new Error('Incorrect password or corrupted file data.');
    }
}

self.onmessage = async function(e) {
    try {
        const {action} = e.data;
        const password = e.data.password;
        if (action === 'encrypt') {
            let fileData, filename, type;
            if (e.data.files && Array.isArray(e.data.files) && e.data.files.length > 1) {
                self.postMessage({type: 'progress', percent: 0, label: 'Creating archive...'});
                const zipFiles = e.data.files.map(f => ({
                    name: f.name,
                    data: new Uint8Array(f.data)
                }));
                const zipBuffer = createZipFromFiles(zipFiles);
                fileData = zipBuffer.buffer;
                filename = 'archive.zip';
                type = 'application/zip';
            } else if (e.data.files && Array.isArray(e.data.files) && e.data.files.length === 1) {
                fileData = e.data.files[0].data;
                filename = e.data.files[0].name;
                type = e.data.files[0].type;
            } else {
                fileData = e.data.fileData;
                filename = e.data.filename;
                type = e.data.type;
            }
            const result = await encryptFile(fileData, password, filename, type);
            self.postMessage({type: 'complete', data: result.buffer, filename: filename + '.enc'}, [result.buffer]);
        } else if (action === 'decrypt') {
            const result = await decryptFile(e.data.fileData, password);
            self.postMessage({type: 'complete', data: result.buffer, filename: result.filename, mimeType: result.type}, [result.buffer]);
        } else if (action === 'initEncrypt') {
            const result = await initEncryptSession(e.data.password, e.data.filename, e.data.type, e.data.size);
            self.postMessage({type: 'header', data: result.header, chunkSize: result.chunkSize, headerLen: result.headerLen}, [result.header]);
        } else if (action === 'encryptChunk') {
            const result = await encryptChunkSession(e.data.data, e.data.chunkIndex);
            self.postMessage({type: 'chunk', data: result}, [result]);
        } else if (action === 'initDecrypt') {
            const result = await initDecryptSession(e.data.password, e.data.header);
            self.postMessage({type: 'metadata', ...result});
        } else if (action === 'decryptChunk') {
            const result = await decryptChunkSession(e.data.data, e.data.chunkIndex);
            self.postMessage({type: 'chunk', data: result}, [result]);
        } else if (action === 'resetSession') {
            if (session) {
                if (session.contentBaseIV) zeroBuffer(session.contentBaseIV);
                session = null;
            }
            self.postMessage({type: 'done'});
        }
    } catch (err) {
        // Use streamError for streaming operations so the main-thread global
        // handler doesn't intercept and call failProcessing while streaming.
        const isStreamingAction = e.data.action && /^(initEncrypt|encryptChunk|initDecrypt|decryptChunk|resetSession)$/.test(e.data.action);
        self.postMessage({type: isStreamingAction ? 'streamError' : 'error', message: err.message || 'An unknown error occurred.'});
    } finally {
        // Defense-in-depth: ensure password bytes are zeroed even if processing throws.
        if (e.data && e.data.password) {
            zeroBuffer(e.data.password);
        }
        if (e.data && e.data.fileData) {
            try { zeroBuffer(new Uint8Array(e.data.fileData)); } catch (_) {}
        }
        if (e.data && e.data.files && Array.isArray(e.data.files)) {
            for (const f of e.data.files) {
                if (f.data) {
                    try { zeroBuffer(new Uint8Array(f.data)); } catch (_) {}
                }
            }
        }
        if (e.data && e.data.data) {
            try { zeroBuffer(new Uint8Array(e.data.data)); } catch (_) {}
        }
    }
};
