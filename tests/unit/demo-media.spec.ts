import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEMO_DISH_IMAGES, DEMO_SLUGS, isReplaceableDemoImage } from '../../src/tools/demo-media-manifest';

describe('demo media import boundaries', () => {
  it('preserves merchant uploads and already imported images', () => {
    expect(isReplaceableDemoImage('https://example.com/api/v1/media/a.webp')).toBe(false);
    expect(isReplaceableDemoImage('https://images.unsplash.com.attacker.example/image')).toBe(false);
    expect(isReplaceableDemoImage('not-a-url')).toBe(false);
  });
  it('only replaces missing images or the previous demo provider', () => {
    expect(isReplaceableDemoImage(null)).toBe(true);
    expect(isReplaceableDemoImage('https://images.unsplash.com/photo-test')).toBe(true);
  });
  it('ships an image for every mapped dish and limits the restaurant list', () => {
    expect(new Set(DEMO_SLUGS).size).toBe(12);
    for (const name of ['maquis', ...Object.values(DEMO_DISH_IMAGES)]) {
      expect(existsSync(join(process.cwd(), 'assets/demo-media', name + '.webp'))).toBe(true);
    }
  });
});
