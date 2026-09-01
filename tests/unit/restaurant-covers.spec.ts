import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_COVER_IMAGES, DEMO_SLUGS } from '../../src/tools/demo-media-manifest';

describe('distinct restaurant covers', () => {
  const root = join(process.cwd(), 'assets/demo-media');
  const targets = JSON.parse(readFileSync(join(root, 'restaurant-covers-v1.json'), 'utf8')) as Array<{
    id: string;
    slug: string;
    image: string;
    sha256: string;
    previousUrl: string;
  }>;

  it('provides exactly one dedicated cover per demo restaurant', () => {
    expect(targets.map((item) => item.slug).sort()).toEqual([...DEMO_SLUGS].sort());
    expect(new Set(targets.map((item) => item.id)).size).toBe(12);
    expect(new Set(Object.values(DEMO_COVER_IMAGES)).size).toBe(12);
    for (const item of targets) {
      expect(DEMO_COVER_IMAGES[item.slug]).toBe(item.image);
      expect(item.previousUrl).toMatch(
        /^https:\/\/onmangeou-backend-api-production\.up\.railway\.app\/api\/v1\/media\/[a-f0-9-]+\.webp$/,
      );
    }
  });

  it('ships twelve distinct valid WebP files matching the approved hashes', () => {
    const hashes = targets.map((item) => {
      const bytes = readFileSync(join(root, item.image + '.webp'));
      expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
      expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');
      expect(bytes.length).toBeLessThan(250_000);
      const hash = createHash('sha256').update(bytes).digest('hex');
      expect(hash).toBe(item.sha256);
      return hash;
    });
    expect(new Set(hashes).size).toBe(12);
  });
});
