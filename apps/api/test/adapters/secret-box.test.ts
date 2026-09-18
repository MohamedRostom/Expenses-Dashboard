import { createSecretBox } from '../../src/adapters/secret-box.js';

const KEY = Buffer.from('0'.repeat(32)).toString('base64'); // 32 raw bytes

describe('SecretBox', () => {
  it('seals and opens back to the original plaintext', async () => {
    const box = createSecretBox(KEY);
    const sealed = await box.seal('hello world');
    expect(await box.open(sealed)).toBe('hello world');
  });

  it('produces different ciphertext each time (random IV)', async () => {
    const box = createSecretBox(KEY);
    const a = await box.seal('same input');
    const b = await box.seal('same input');
    expect(a).not.toBe(b);
  });

  it('throws when the ciphertext is tampered with', async () => {
    const box = createSecretBox(KEY);
    const sealed = await box.seal('secret value');
    const bytes = Buffer.from(sealed, 'base64');
    bytes[bytes.length - 1]! ^= 0xff; // flip a bit in the auth tag
    const tampered = bytes.toString('base64');
    await expect(box.open(tampered)).rejects.toThrow();
  });

  it('rejects a key that does not decode to 32 bytes', async () => {
    const box = createSecretBox(Buffer.from('short').toString('base64'));
    await expect(box.seal('x')).rejects.toThrow(RangeError);
  });
});
