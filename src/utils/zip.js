import { readFileChunk } from './files.js';

// ---- CRC32 ----
const CRC32_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    CRC32_TABLE[n] = c >>> 0;
}

export function crc32(buf, crc = 0) {
    crc ^= 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ---- ZIP Header Builders ----

function sanitizeZipName(name) {
    return (name || '')
        .replace(/\\/g, '/')
        .split('/')
        .filter(s => s && s !== '.' && s !== '..')
        .join('/');
}

export function buildLocalFileHeader(nameBytes, flags = 0x0808) {
    const nameLen = nameBytes.length;
    const lfh = new DataView(new ArrayBuffer(30));
    lfh.setUint32(0, 0x04034B50, true);   // signature
    lfh.setUint16(4, 20, true);            // version needed (2.0)
    lfh.setUint16(6, flags, true);         // general purpose bit flag
    lfh.setUint16(8, 0, true);             // compression method: stored
    lfh.setUint16(10, 0, true);            // file last mod time
    lfh.setUint16(12, 0, true);            // file last mod date
    lfh.setUint32(14, 0, true);            // CRC-32 (placeholder)
    lfh.setUint32(18, 0, true);            // compressed size (placeholder)
    lfh.setUint32(22, 0, true);            // uncompressed size (placeholder)
    lfh.setUint16(26, nameLen, true);      // filename length
    lfh.setUint16(28, 0, true);            // extra field length

    const out = new Uint8Array(30 + nameLen);
    out.set(new Uint8Array(lfh.buffer), 0);
    out.set(nameBytes, 30);
    return out;
}

export function buildDataDescriptor(fileCrc, uncompLen) {
    const dd = new DataView(new ArrayBuffer(16));
    dd.setUint32(0, 0x08074B50, true);     // optional signature
    dd.setUint32(4, fileCrc, true);        // CRC-32
    dd.setUint32(8, uncompLen, true);      // compressed size
    dd.setUint32(12, uncompLen, true);     // uncompressed size
    return new Uint8Array(dd.buffer);
}

export function buildCentralDirectoryHeader(nameBytes, uncompLen, fileCrc, offset, flags = 0x0808) {
    const nameLen = nameBytes.length;
    const cdfh = new DataView(new ArrayBuffer(46));
    cdfh.setUint32(0, 0x02014B50, true);   // signature
    cdfh.setUint16(4, 20, true);            // version made by
    cdfh.setUint16(6, 20, true);            // version needed
    cdfh.setUint16(8, flags, true);         // general purpose bit flag
    cdfh.setUint16(10, 0, true);            // compression method: stored
    cdfh.setUint16(12, 0, true);            // file last mod time
    cdfh.setUint16(14, 0, true);            // file last mod date
    cdfh.setUint32(16, fileCrc, true);      // CRC-32
    cdfh.setUint32(20, uncompLen, true);    // compressed size
    cdfh.setUint32(24, uncompLen, true);    // uncompressed size
    cdfh.setUint16(28, nameLen, true);      // filename length
    cdfh.setUint16(30, 0, true);            // extra field length
    cdfh.setUint16(32, 0, true);            // comment length
    cdfh.setUint16(34, 0, true);            // disk number start
    cdfh.setUint16(36, 0, true);            // internal file attributes
    cdfh.setUint32(38, 0, true);            // external file attributes
    cdfh.setUint32(42, offset, true);       // local header relative offset

    const out = new Uint8Array(46 + nameLen);
    out.set(new Uint8Array(cdfh.buffer), 0);
    out.set(nameBytes, 46);
    return out;
}

export function buildEocd(numFiles, cdSize, cdOffset) {
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054B50, true);   // signature
    eocd.setUint16(4, 0, true);             // disk number
    eocd.setUint16(6, 0, true);             // disk with central dir
    eocd.setUint16(8, numFiles, true);      // central dir records on disk
    eocd.setUint16(10, numFiles, true);     // total central dir records
    eocd.setUint32(12, cdSize, true);       // central dir size
    eocd.setUint32(16, cdOffset, true);     // central dir offset
    eocd.setUint16(20, 0, true);            // comment length
    return new Uint8Array(eocd.buffer);
}

// ---- Layout & Chunk Generator ----

export function computeZipLayout(files) {
    const enc = new TextEncoder();
    let offset = 0;
    const entries = [];

    for (const file of files) {
        const safeName = sanitizeZipName(file.name);
        const nameBytes = enc.encode(safeName || 'file');
        if (nameBytes.length > 0xFFFF) {
            throw new Error('Filename too long for ZIP format.');
        }
        const headerLen = 30 + nameBytes.length;
        entries.push({ nameBytes, headerLen, fileSize: file.size, offset });
        offset += headerLen + file.size + 16; // +16 for data descriptor
    }

    const cdStart = offset;
    for (const entry of entries) {
        offset += 46 + entry.nameBytes.length;
    }
    const totalSize = offset + 22; // +22 for EOCD

    return { entries, cdStart, totalSize };
}

/**
 * Async generator that yields exactly `chunkSize` byte chunks of a ZIP archive
 * (last chunk may be smaller). Uses data descriptors so no pre-read is needed.
 */
export async function* generateZipChunks(files, layout, chunkSize) {
    const pending = []; // array of Uint8Arrays
    let pendingLen = 0;

    function addBytes(bytes) {
        pending.push(bytes);
        pendingLen += bytes.length;
    }

    function* yieldFullChunks() {
        while (pendingLen >= chunkSize) {
            const chunk = new Uint8Array(chunkSize);
            let written = 0;
            while (written < chunkSize) {
                const front = pending[0];
                const need = chunkSize - written;
                const take = Math.min(front.length, need);
                chunk.set(front.subarray(0, take), written);
                written += take;
                if (take === front.length) {
                    pending.shift();
                } else {
                    pending[0] = front.subarray(take);
                }
                pendingLen -= take;
            }
            yield chunk;
        }
    }

    function* flushFinal() {
        if (pendingLen === 0) return;
        const chunk = new Uint8Array(pendingLen);
        let written = 0;
        while (pending.length > 0) {
            const front = pending.shift();
            chunk.set(front, written);
            written += front.length;
        }
        pendingLen = 0;
        yield chunk;
    }

    const crcs = new Array(files.length);

    // Phase 1: local headers + file data + data descriptors
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const entry = layout.entries[i];

        // Local file header (with data descriptor flag)
        addBytes(buildLocalFileHeader(entry.nameBytes, 0x0808));
        yield* yieldFullChunks();

        // File data
        let fileOffset = 0;
        let fileCrc = 0;
        while (fileOffset < file.size) {
            const readSize = Math.min(file.size - fileOffset, 1024 * 1024);
            const data = await readFileChunk(file, fileOffset, fileOffset + readSize);
            const u8 = new Uint8Array(data);
            fileCrc = crc32(u8, fileCrc);
            addBytes(u8);
            fileOffset += readSize;
            yield* yieldFullChunks();
        }

        crcs[i] = fileCrc >>> 0;

        // Data descriptor
        addBytes(buildDataDescriptor(crcs[i], file.size));
        yield* yieldFullChunks();
    }

    // Phase 2: central directory + EOCD
    for (let i = 0; i < files.length; i++) {
        const entry = layout.entries[i];
        addBytes(buildCentralDirectoryHeader(
            entry.nameBytes,
            entry.fileSize,
            crcs[i],
            entry.offset,
            0x0808
        ));
        yield* yieldFullChunks();
    }

    addBytes(buildEocd(files.length, layout.totalSize - layout.cdStart - 22, layout.cdStart));
    yield* yieldFullChunks();

    yield* flushFinal();
}
