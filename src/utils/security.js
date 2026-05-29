export function zeroBuffer(buf) {
    if (buf && buf.fill) {
        buf.fill(0);
    } else if (buf && ArrayBuffer.isView(buf)) {
        new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength).fill(0);
    }
}

export function sanitizeFilename(name, fallback) {
    if (typeof name !== 'string' || name.length === 0) {
        return fallback;
    }
    // Extract basename (remove any path components)
    const basename = name.replace(/^[a-zA-Z]:/, '')     // Remove Windows drive letter
                         .replace(/\\/g, '/')           // Normalize backslashes
                         .split('/').pop();             // Get last component
    // Remove control characters, bidirectional override characters, and restrict length.
    // Bidi overrides (e.g., U+202E) can spoof file extensions (e.g., exe appearing as jpg).
    const clean = basename
        .replace(/[\x00-\x1f\x7f]/g, '')
        .replace(/[\u202A-\u202E\u2066-\u2069\u200E\u200F]/g, '')
        .trim();
    if (clean.length === 0 || clean === '.' || clean === '..') {
        return fallback;
    }
    // Limit length to prevent UI issues and OS limits
    return clean.length > 200 ? clean.slice(0, 200) : clean;
}
