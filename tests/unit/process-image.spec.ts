import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { processImage } from '../../src/infrastructure/media/process-image';

describe('traitement des images publiques', () => {
  it('retire les métadonnées et produit deux tailles WebP', async () => {
    const input = await sharp({ create: { width: 1800, height: 900, channels: 3, background: 'red' } })
      .jpeg()
      .withMetadata({ orientation: 1 })
      .toBuffer();
    const output = await processImage(input);
    const main = await sharp(output.bytes).metadata();
    const small = await sharp(output.thumbnail).metadata();
    expect(main.format).toBe('webp');
    expect(main.width).toBe(1600);
    expect(main.exif).toBeUndefined();
    expect(small.width).toBe(400);
    expect(small.exif).toBeUndefined();
  });
  it('refuse un fichier tronqué malgré une signature JPEG', async () => {
    await expect(processImage(Buffer.from([255, 216, 255, 0]))).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});
