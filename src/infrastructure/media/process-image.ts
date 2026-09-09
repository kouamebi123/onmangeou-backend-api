import sharp from 'sharp';
import { validationFailed } from '../../common/errors/domain.error';

/** Decode before storing: signatures alone do not establish that an image is safe. */
export async function processImage(buffer: Buffer) {
  try {
    const image = sharp(buffer, { limitInputPixels: 25_000_000, animated: false }).rotate();
    const bytes = await image
      .clone()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    const thumbnail = await image
      .clone()
      .resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer();
    return { bytes, thumbnail };
  } catch {
    throw validationFailed([
      { field: 'image', code: 'INVALID', message: 'Cette image est illisible ou trop grande.' },
    ]);
  }
}
