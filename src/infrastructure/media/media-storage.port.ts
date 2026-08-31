export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');

export interface StoredMedia {
  key: string;
  publicUrl: string;
}

export interface MediaStorage {
  put(input: { bytes: Buffer; contentType: string }): Promise<StoredMedia>;
  read(key: string): Promise<{ bytes: Buffer; contentType: string }>;
  delete(key: string): Promise<void>;
}
