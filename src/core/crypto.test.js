import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * Send a message to the crypto worker and await its response.
 * Ignores intermediate 'progress' messages and waits for 'complete',
 * 'header', 'chunk', 'metadata', or 'done'. Rejects on 'error' / 'streamError'.
 */
function workerCall(worker, msg) {
  return new Promise((resolve, reject) => {
    function handler(e) {
      const payload = e.data;
      if (payload.type === 'error' || payload.type === 'streamError') {
        worker.removeEventListener('message', handler);
        reject(new Error(payload.message));
      } else if (
        payload.type === 'complete' ||
        payload.type === 'header' ||
        payload.type === 'chunk' ||
        payload.type === 'metadata' ||
        payload.type === 'done'
      ) {
        worker.removeEventListener('message', handler);
        resolve(payload);
      }
      // 'progress' messages are intentionally ignored so we keep listening.
    }
    worker.addEventListener('message', handler);
    worker.postMessage(msg);
  });
}

describe('Crypto Roundtrip', () => {
  let worker;

  beforeAll(() => {
    // The classic worker is served from the public/ root by Vite.
    worker = new Worker('/crypto-worker.js');
  });

  afterAll(() => {
    worker.terminate();
  });

  it('encrypts and decrypts a file with identical output', async () => {
    const password = new TextEncoder().encode('correct-horse-battery-staple');
    const originalContent = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 255, 254, 253, 252]);
    const file = new File([originalContent], 'test-file.txt', { type: 'text/plain' });
    const fileData = await file.arrayBuffer();

    // Encrypt
    const encrypted = await workerCall(worker, {
      action: 'encrypt',
      fileData,
      password,
      filename: file.name,
      type: file.type,
    });

    expect(encrypted.type).toBe('complete');
    expect(encrypted.filename).toBe('test-file.txt.enc');
    expect(encrypted.data).toBeInstanceOf(ArrayBuffer);
    expect(encrypted.data.byteLength).toBeGreaterThan(0);

    // Decrypt
    const decrypted = await workerCall(worker, {
      action: 'decrypt',
      fileData: encrypted.data,
      password: new TextEncoder().encode('correct-horse-battery-staple'),
    });

    expect(decrypted.type).toBe('complete');
    expect(decrypted.filename).toBe('test-file.txt');
    expect(decrypted.mimeType).toBe('text/plain');

    const decryptedBytes = new Uint8Array(decrypted.data);
    expect(decryptedBytes).toEqual(originalContent);
  });

  it('rejects decryption with an incorrect password', async () => {
    const correctPassword = new TextEncoder().encode('the-real-password');
    const wrongPassword = new TextEncoder().encode('the-wrong-password');
    const originalContent = new Uint8Array([10, 20, 30, 40, 50]);
    const file = new File([originalContent], 'secret.bin', { type: 'application/octet-stream' });
    const fileData = await file.arrayBuffer();

    // Encrypt with the correct password
    const encrypted = await workerCall(worker, {
      action: 'encrypt',
      fileData,
      password: correctPassword,
      filename: file.name,
      type: file.type,
    });

    expect(encrypted.type).toBe('complete');

    // Attempt to decrypt with the wrong password — must throw
    await expect(
      workerCall(worker, {
        action: 'decrypt',
        fileData: encrypted.data,
        password: wrongPassword,
      })
    ).rejects.toThrow(/incorrect password|corrupted/i);
  });
});
