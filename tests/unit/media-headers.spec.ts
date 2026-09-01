import 'reflect-metadata';
import { Controller, Get, VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import helmet from 'helmet';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ResponseEnvelopeInterceptor } from '../../src/common/http/response-envelope.interceptor';
import { MediaController } from '../../src/infrastructure/media/media.controller';
import { MediaService } from '../../src/infrastructure/media/media.service';

@Controller({ path: 'header-fixtures', version: '1' })
class ResponseFixtureController {
  @Get('json')
  json() {
    return { name: 'OnMangeOu' };
  }

  @Get('page')
  page() {
    return { items: [{ id: 'example' }], nextCursor: 'next-page' };
  }
}

describe('public media response headers', () => {
  let app: NestExpressApplication;
  const bytes = Buffer.from('test-image');

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [MediaController, ResponseFixtureController],
      providers: [
        {
          provide: MediaService,
          useValue: { read: vi.fn().mockResolvedValue({ bytes, contentType: 'image/webp' }) },
        },
      ],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.use(helmet());
    app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('allows public images to be embedded across origins while retaining security headers', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/media/example.webp')
      .set('Origin', 'https://web.example.com')
      .expect(200);
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(response.headers['content-type']).toContain('image/webp');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(response.body).toEqual(bytes);
  });

  it('keeps Helmet same-origin protection outside the public image route', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/not-a-media-route').expect(404);
    expect(response.headers['cross-origin-resource-policy']).toBe('same-origin');
  });

  it('preserves the JSON envelope and same-origin policy for normal API responses', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/header-fixtures/json').expect(200);
    expect(response.body).toEqual({ data: { name: 'OnMangeOu' }, meta: { nextCursor: null } });
    expect(response.headers['cross-origin-resource-policy']).toBe('same-origin');
  });

  it('preserves the paginated API envelope', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/header-fixtures/page').expect(200);
    expect(response.body).toEqual({ data: [{ id: 'example' }], meta: { nextCursor: 'next-page' } });
  });
});
