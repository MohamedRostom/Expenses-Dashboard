import { passwordHasher } from '../../src/adapters/password.js';

describe('passwordHasher', () => {
  it('hash verifies with the same password', async () => {
    const hash = await passwordHasher.hash('correct horse battery staple');
    expect(await passwordHasher.verify('correct horse battery staple', hash)).toBe(true);
  });

  it('wrong password fails', async () => {
    const hash = await passwordHasher.hash('correct horse battery staple');
    expect(await passwordHasher.verify('wrong password', hash)).toBe(false);
  });

  it('needsRehash is false for a hash produced with current params', async () => {
    const hash = await passwordHasher.hash('correct horse battery staple');
    expect(passwordHasher.needsRehash(hash)).toBe(false);
  });

  it('needsRehash is true for a hash with different params', () => {
    // Same format, m/t/p differ from the current PARAMS (19456,2,1).
    const oldHash = '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$c29tZWhhc2g';
    expect(passwordHasher.needsRehash(oldHash)).toBe(true);
  });
});
