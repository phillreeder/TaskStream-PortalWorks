import { describe, expect, it } from 'vitest';
import { createZipArchive } from '../zip.js';

describe('RuntimeScaffold ZIP evidence writer', () => {
  it('emits a store-only ZIP containing every named entry', () => {
    const archive = createZipArchive([
      { name: 'page.jpg', content: Buffer.from([1, 2, 3]) },
      { name: 'manifest.json', content: Buffer.from('{"ok":true}\n') },
    ]);

    expect(archive.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(archive.includes(Buffer.from('page.jpg'))).toBe(true);
    expect(archive.includes(Buffer.from('manifest.json'))).toBe(true);
    expect(archive.subarray(-22, -18).toString('hex')).toBe('504b0506');
  });
});
