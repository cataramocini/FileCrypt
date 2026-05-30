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

// ---- ZIP64 Constants ----
const ZIP64_VERSION = 45;
const ZIP64_EXTRA_FIELD_TAG = 0x0001;
const ZIP64_MAX_UINT32 = 0xFFFFFFFF;

// ---- ZIP Header Builders ----

function sanitizeZipName(name) {
    return (name || '')
        .replace(/\\/g, '/')
        .split('/')
        .filter(s => s && s !== '.' && s !== '..')
        .join('/');
}

function buildZip64ExtraField(uncompLen, compLen, offset, diskNum) {
    const needsSize = uncompLen >= ZIP64_MAX_UINT32;
    const needsOffset = offset >= ZIP64_MAX_UINT32;
    const needsDisk = diskNum >= 0xFFFF;

    let dataSize = 0;
    if (needsSize) dataSize += 16; // original + compressed size
    if (needsOffset) dataSize += 8;
    if (needsDisk) dataSize += 4;

    const buf = new DataView(new ArrayBuffer(4 + dataSize));
    buf.setUint16(0, ZIP64_EXTRA_FIELD_TAG, true);
    buf.setUint16(2, dataSize, true);

    let pos = 4;
    if (needsSize) {
        buf.setBigUint64(pos, BigInt(uncompLen), true);
        pos += 8;
        buf.setBigUint64(pos, BigInt(compLen), true);
        pos += 8;
    }
    if (needsOffset) {
        buf.setBigUint64(pos, BigInt(offset), true);
        pos += 8;
    }
    if (needsDisk) {
        buf.setUint32(pos, diskNum, true);
        pos += 4;
    }

    return new Uint8Array(buf.buffer);
}

export function buildLocalFileHeader(nameBytes, fileSize = 0, useZip64 = false) {
    const nameLen = nameBytes.length;
    let extraFieldLen = 0;
    let extraField = null;

    if (useZip64) {
        extraField = buildZip64ExtraField(fileSize, fileSize, 0, 0);
        extraFieldLen = extraField.length;
    }

    const lfh = new DataView(new ArrayBuffer(30));
    lfh.setUint32(0, 0x04034B50, true);   // signature
    lfh.setUint16(4, useZip64 ? ZIP64_VERSION : 20, true); // version needed
    lfh.setUint16(6, 0x0808, true);        // general purpose bit flag (data descriptor + UTF-8)
    lfh.setUint16(8, 0, true);             // compression method: stored
    lfh.setUint16(10, 0, true);            // file last mod time
    lfh.setUint16(12, 0, true);            // file last mod date
    lfh.setUint32(14, 0, true);            // CRC-32 (placeholder)
    lfh.setUint32(18, useZip64 ? ZIP64_MAX_UINT32 : 0, true); // compressed size
    lfh.setUint32(22, useZip64 ? ZIP64_MAX_UINT32 : 0, true); // uncompressed size
    lfh.setUint16(26, nameLen, true);      // filename length
    lfh.setUint16(28, extraFieldLen, true); // extra field length

    const out = new Uint8Array(30 + nameLen + extraFieldLen);
    out.set(new Uint8Array(lfh.buffer), 0);
    out.set(nameBytes, 30);
    if (extraField) {
        out.set(extraField, 30 + nameLen);
    }
    return out;
}

export function buildDataDescriptor(fileCrc, uncompLen, useZip64 = false) {
    if (useZip64) {
        const dd = new DataView(new ArrayBuffer(24));
        dd.setUint32(0, 0x08074B50, true);     // optional signature
        dd.setUint32(4, fileCrc, true);        // CRC-32
        dd.setBigUint64(8, BigInt(uncompLen), true);  // compressed size
        dd.setBigUint64(16, BigInt(uncompLen), true); // uncompressed size
        return new Uint8Array(dd.buffer);
    }

    const dd = new DataView(new ArrayBuffer(16));
    dd.setUint32(0, 0x08074B50, true);     // optional signature
    dd.setUint32(4, fileCrc, true);        // CRC-32
    dd.setUint32(8, uncompLen, true);      // compressed size
    dd.setUint32(12, uncompLen, true);     // uncompressed size
    return new Uint8Array(dd.buffer);
}

export function buildCentralDirectoryHeader(nameBytes, uncompLen, fileCrc, offset, useZip64 = false) {
    const nameLen = nameBytes.length;
    let extraFieldLen = 0;
    let extraField = null;

    if (useZip64) {
        extraField = buildZip64ExtraField(uncompLen, uncompLen, offset, 0);
        extraFieldLen = extraField.length;
    }

    const cdfh = new DataView(new ArrayBuffer(46));
    cdfh.setUint32(0, 0x02014B50, true);   // signature
    cdfh.setUint16(4, useZip64 ? ZIP64_VERSION : 20, true); // version made by
    cdfh.setUint16(6, useZip64 ? ZIP64_VERSION : 20, true); // version needed
    cdfh.setUint16(8, 0x0808, true);        // general purpose bit flag
    cdfh.setUint16(10, 0, true);            // compression method: stored
    cdfh.setUint16(12, 0, true);            // file last mod time
    cdfh.setUint16(14, 0, true);            // file last mod date
    cdfh.setUint32(16, fileCrc, true);      // CRC-32
    cdfh.setUint32(20, useZip64 ? ZIP64_MAX_UINT32 : uncompLen, true); // compressed size
    cdfh.setUint32(24, useZip64 ? ZIP64_MAX_UINT32 : uncompLen, true); // uncompressed size
    cdfh.setUint16(28, nameLen, true);      // filename length
    cdfh.setUint16(30, extraFieldLen, true); // extra field length
    cdfh.setUint16(32, 0, true);            // comment length
    cdfh.setUint16(34, 0, true);            // disk number start
    cdfh.setUint16(36, 0, true);            // internal file attributes
    cdfh.setUint32(38, 0, true);            // external file attributes
    cdfh.setUint32(42, useZip64 ? ZIP64_MAX_UINT32 : offset, true); // local header relative offset

    const out = new Uint8Array(46 + nameLen + extraFieldLen);
    out.set(new Uint8Array(cdfh.buffer), 0);
    out.set(nameBytes, 46);
    if (extraField) {
        out.set(extraField, 46 + nameLen);
    }
    return out;
}

export function buildEocd(numFiles, cdSize, cdOffset, useZip64 = false) {
    if (!useZip64) {
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

    // EOCD64 record (56 bytes)
    const eocd64Size = 56 - 12; // size of remaining fields after the 'size' field
    const eocd64 = new DataView(new ArrayBuffer(56));
    eocd64.setUint32(0, 0x06064B50, true);    // signature
    eocd64.setBigUint64(4, BigInt(eocd64Size), true); // size of this record minus 12
    eocd64.setUint16(12, ZIP64_VERSION, true); // version made by
    eocd64.setUint16(14, ZIP64_VERSION, true); // version needed
    eocd64.setUint32(16, 0, true);             // disk number
    eocd64.setUint32(20, 0, true);             // disk with CD
    eocd64.setBigUint64(24, BigInt(numFiles), true);  // CD records on this disk
    eocd64.setBigUint64(32, BigInt(numFiles), true);  // total CD records
    eocd64.setBigUint64(40, BigInt(cdSize), true);    // CD size
    eocd64.setBigUint64(48, BigInt(cdOffset), true);  // CD offset

    // EOCD64 locator (20 bytes)
    const locator = new DataView(new ArrayBuffer(20));
    locator.setUint32(0, 0x07064B50, true);    // signature
    locator.setUint32(4, 0, true);             // disk number with EOCD64
    locator.setBigUint64(8, BigInt(cdOffset + cdSize), true); // offset of EOCD64 record
    locator.setUint32(16, 1, true);            // total number of disks

    // Standard EOCD with max values (22 bytes)
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054B50, true);       // signature
    eocd.setUint16(4, 0, true);                // disk number
    eocd.setUint16(6, 0, true);                // disk with central dir
    eocd.setUint16(8, 0xFFFF, true);           // central dir records on disk
    eocd.setUint16(10, 0xFFFF, true);          // total central dir records
    eocd.setUint32(12, 0xFFFFFFFF, true);      // central dir size
    eocd.setUint32(16, 0xFFFFFFFF, true);      // central dir offset
    eocd.setUint16(20, 0, true);               // comment length

    const total = new Uint8Array(56 + 20 + 22);
    total.set(new Uint8Array(eocd64.buffer), 0);
    total.set(new Uint8Array(locator.buffer), 56);
    total.set(new Uint8Array(eocd.buffer), 56 + 20);
    return total;
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
        const useZip64 = file.size >= ZIP64_MAX_UINT32;
        const headerLen = 30 + nameBytes.length + (useZip64 ? 20 : 0);
        const ddLen = useZip64 ? 24 : 16;
        entries.push({ nameBytes, headerLen, fileSize: file.size, ddLen, offset, useZip64 });
        offset += headerLen + file.size + ddLen;
    }

    const cdStart = offset;
    for (const entry of entries) {
        const cdUseZip64 = entry.fileSize >= ZIP64_MAX_UINT32 || entry.offset >= ZIP64_MAX_UINT32;
        let cdExtraLen = 0;
        if (cdUseZip64) {
            if (entry.fileSize >= ZIP64_MAX_UINT32) cdExtraLen += 16;
            if (entry.offset >= ZIP64_MAX_UINT32) cdExtraLen += 8;
            cdExtraLen += 4; // tag + size header
        }
        offset += 46 + entry.nameBytes.length + cdExtraLen;
    }

    const cdSize = offset - cdStart;
    const eocdUseZip64 = cdSize >= ZIP64_MAX_UINT32 || cdStart >= ZIP64_MAX_UINT32 || files.length >= 0xFFFF;
    const eocdLen = eocdUseZip64 ? (56 + 20 + 22) : 22;
    const totalSize = offset + eocdLen;

    return { entries, cdStart, cdSize, totalSize, eocdUseZip64 };
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
        addBytes(buildLocalFileHeader(entry.nameBytes, entry.fileSize, entry.useZip64));
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
        addBytes(buildDataDescriptor(crcs[i], file.size, entry.useZip64));
        yield* yieldFullChunks();
    }

    // Phase 2: central directory + EOCD
    for (let i = 0; i < files.length; i++) {
        const entry = layout.entries[i];
        const cdUseZip64 = entry.fileSize >= ZIP64_MAX_UINT32 || entry.offset >= ZIP64_MAX_UINT32;
        addBytes(buildCentralDirectoryHeader(
            entry.nameBytes,
            entry.fileSize,
            crcs[i],
            entry.offset,
            cdUseZip64
        ));
        yield* yieldFullChunks();
    }

    addBytes(buildEocd(files.length, layout.cdSize, layout.cdStart, layout.eocdUseZip64));
    yield* yieldFullChunks();

    yield* flushFinal();
}
