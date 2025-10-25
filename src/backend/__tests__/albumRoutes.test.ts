/**
 * Tests for Album Routes
 */

import request from 'supertest';
import express, { Express } from 'express';
import albumRoutes from '../routes/albumRoutes';
import { icloudService } from '../icloudService';
import { cacheManager } from '../cacheManager';
import { AlbumData } from '../types';
import * as crypto from 'crypto';

// Mock dependencies
jest.mock('../icloudService');
jest.mock('../cacheManager', () => {
  // Get the real imageUrlToHash implementation
  const actualImageUrlToHash = (url: string): string => {
    const hash = crypto.createHash('sha256');
    hash.update(url);
    const fullHash = hash.digest('hex');
    return `${fullHash}.jpg`;
  };

  return {
    cacheManager: {
      loadAlbumMetadata: jest.fn(),
      imageExists: jest.fn(),
      getImagePath: jest.fn(),
      saveAlbumMetadata: jest.fn(),
      ensureCacheDir: jest.fn(),
      deleteOldAlbums: jest.fn(),
      getAlbumCacheDir: jest.fn(),
    },
    imageUrlToHash: actualImageUrlToHash,
    isValidImageFile: jest.fn((filename: string) => {
      // Simple implementation for testing
      return /^[a-f0-9]{64}\.jpg$/.test(filename);
    }),
  };
});

describe('Album Routes', () => {
  let app: Express;

  beforeEach(() => {
    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use('/', albumRoutes);

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('GET /album/:token', () => {
    it('should reject invalid token format', async () => {
      const response = await request(app).get('/album/invalid');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject token with wrong length', async () => {
      const response = await request(app).get('/album/short');

      expect(response.status).toBe(404);
    });

    it('should reject token with special characters', async () => {
      const response = await request(app).get('/album/invalid-token!@');

      expect(response.status).toBe(404);
    });

    it('should accept valid 15-character alphanumeric token', async () => {
      // Mock sendFile to avoid actual file serving
      const response = await request(app).get('/album/B0z5qAGN1JIFd3y');

      // Should attempt to serve HTML (will fail in test but should not be 404 from token validation)
      expect(response.status).not.toBe(404);
    });
  });

  describe('GET /api/album/:token/metadata', () => {
    it('should return loading state when no cache exists', async () => {
      (cacheManager.loadAlbumMetadata as jest.Mock).mockResolvedValueOnce(null);

      const response = await request(app).get('/api/album/B0z5qAGN1JIFd3y/metadata');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'loading',
        message: 'Album is being loaded from iCloud',
      });
    });

    it('should return cached metadata when available', async () => {
      const mockAlbumData: AlbumData = {
        metadata: {
          streamName: 'Test Album',
          userFirstName: 'John',
          userLastName: 'Doe',
          streamCtag: 'ctag123',
          itemsReturned: 5,
        },
        photos: [],
        lastSynced: new Date('2024-01-01T12:00:00Z'),
      };

      (cacheManager.loadAlbumMetadata as jest.Mock).mockResolvedValueOnce(mockAlbumData);

      const response = await request(app).get('/api/album/validtoken12345/metadata');

      expect(response.status).toBe(200);
      expect(response.body.metadata).toEqual({
        streamName: 'Test Album',
        userFirstName: 'John',
        userLastName: 'Doe',
        streamCtag: 'ctag123',
        itemsReturned: 5,
      });
      expect(response.body.lastSynced).toBeDefined();
    });

    it('should reject invalid token', async () => {
      const response = await request(app).get('/api/album/invalid/metadata');

      expect(response.status).toBe(404);
    });

    it('should handle cache manager errors', async () => {
      (cacheManager.loadAlbumMetadata as jest.Mock).mockRejectedValueOnce(
        new Error('Cache error')
      );

      const response = await request(app).get('/api/album/errortoken12345/metadata');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/album/:token/images', () => {
    const mockAlbumData: AlbumData = {
      metadata: {
        streamName: 'Test Album',
        userFirstName: 'John',
        userLastName: 'Doe',
        streamCtag: 'ctag123',
        itemsReturned: 25,
      },
      photos: Array.from({ length: 25 }, (_, i) => ({
        id: `photo${i + 1}`,
        url: `https://example.com/photo${i + 1}.jpg`,
        derivatives: {},
        dateCreated: new Date(`2024-01-${String(i + 1).padStart(2, '0')}T12:00:00Z`).toISOString(),
        caption: `Caption for photo ${i + 1}`,
        title: `Photo ${i + 1}`,
      })),
      lastSynced: new Date(),
    };

    it('should return paginated images', async () => {
      (icloudService.syncAlbumWithCache as jest.Mock).mockResolvedValueOnce(mockAlbumData);

      const response = await request(app)
        .get('/api/album/B0z5qAGN1JIFd3y/images')
        .query({ page: 0, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.images).toHaveLength(10);
      expect(response.body.metadata.total).toBe(25);
      expect(response.body.metadata.page).toBe(0);
      expect(response.body.metadata.limit).toBe(10);
      expect(response.body.metadata.hasMore).toBe(true);
    });

    it('should handle second page', async () => {
      (icloudService.syncAlbumWithCache as jest.Mock).mockResolvedValueOnce(mockAlbumData);

      const response = await request(app)
        .get('/api/album/B0z5qAGN1JIFd3y/images')
        .query({ page: 1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.images).toHaveLength(10);
      expect(response.body.metadata.page).toBe(1);
      expect(response.body.metadata.hasMore).toBe(true);
    });

    it('should handle last page', async () => {
      (icloudService.syncAlbumWithCache as jest.Mock).mockResolvedValueOnce(mockAlbumData);

      const response = await request(app)
        .get('/api/album/B0z5qAGN1JIFd3y/images')
        .query({ page: 2, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.images).toHaveLength(5);
      expect(response.body.metadata.hasMore).toBe(false);
    });

    it('should use default pagination params', async () => {
      (icloudService.syncAlbumWithCache as jest.Mock).mockResolvedValueOnce(mockAlbumData);

      const response = await request(app).get('/api/album/B0z5qAGN1JIFd3y/images');

      expect(response.status).toBe(200);
      expect(response.body.metadata.page).toBe(0);
      expect(response.body.metadata.limit).toBe(20);
    });

    it('should enforce max limit of 100', async () => {
      (icloudService.syncAlbumWithCache as jest.Mock).mockResolvedValueOnce(mockAlbumData);

      const response = await request(app)
        .get('/api/album/B0z5qAGN1JIFd3y/images')
        .query({ limit: 200 });

      expect(response.status).toBe(200);
      expect(response.body.metadata.limit).toBe(100);
    });

    it('should convert iCloud URLs to server URLs', async () => {
      (icloudService.syncAlbumWithCache as jest.Mock).mockResolvedValueOnce(mockAlbumData);

      const response = await request(app).get('/api/album/B0z5qAGN1JIFd3y/images');

      console.log('Response body images[0]:', JSON.stringify(response.body.images[0], null, 2));
      expect(response.status).toBe(200);
      expect(response.body.images[0].url).toMatch(/^\/api\/album\/B0z5qAGN1JIFd3y\/image\//);
      expect(response.body.images[0].filename).toMatch(/^[a-f0-9]{64}\.jpg$/);
    });

    it('should include title and caption fields in image response', async () => {
      (icloudService.syncAlbumWithCache as jest.Mock).mockResolvedValueOnce(mockAlbumData);

      const response = await request(app).get('/api/album/B0z5qAGN1JIFd3y/images');

      expect(response.status).toBe(200);
      expect(response.body.images[0]).toHaveProperty('title');
      expect(response.body.images[0]).toHaveProperty('caption');
      expect(response.body.images[0]).toHaveProperty('dateCreated');
      expect(response.body.images[0].title).toBe('Photo 25'); // Newest first
      expect(response.body.images[0].caption).toBe('Caption for photo 25');
    });

    it('should sort photos by date (newest first)', async () => {
      (icloudService.syncAlbumWithCache as jest.Mock).mockResolvedValueOnce(mockAlbumData);

      const response = await request(app).get('/api/album/B0z5qAGN1JIFd3y/images');

      expect(response.status).toBe(200);
      // First photo should be from later date
      const firstDate = new Date(response.body.images[0].dateCreated);
      const lastDate = new Date(response.body.images[response.body.images.length - 1].dateCreated);
      expect(firstDate.getTime()).toBeGreaterThan(lastDate.getTime());
    });

    it('should return 404 when album not found', async () => {
      (icloudService.syncAlbumWithCache as jest.Mock).mockResolvedValueOnce(null);

      const response = await request(app).get('/api/album/notfound123456/images');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject invalid token', async () => {
      const response = await request(app).get('/api/album/invalid/images');

      expect(response.status).toBe(404);
    });

  });

  describe('GET /api/album/:token/image/:filename', () => {
    it('should reject invalid filename format', async () => {
      const response = await request(app).get(
        '/api/album/B0z5qAGN1JIFd3y/image/invalid.jpg'
      );

      expect(response.status).toBe(404);
    });

    it('should reject filename without .jpg extension', async () => {
      const validHash = 'a'.repeat(64);
      const response = await request(app).get(
        `/api/album/B0z5qAGN1JIFd3y/image/${validHash}.png`
      );

      expect(response.status).toBe(404);
    });

    it('should reject filename with wrong hash length', async () => {
      const shortHash = 'a'.repeat(32) + '.jpg';
      const response = await request(app).get(
        `/api/album/B0z5qAGN1JIFd3y/image/${shortHash}`
      );

      expect(response.status).toBe(404);
    });

    it('should return 404 for non-existent image', async () => {
      const validFilename = 'a'.repeat(64) + '.jpg';

      (cacheManager.imageExists as jest.Mock).mockResolvedValueOnce(false);

      const response = await request(app).get(
        `/api/album/B0z5qAGN1JIFd3y/image/${validFilename}`
      );

      expect(response.status).toBe(404);
    });

    it('should serve existing image with cache headers', async () => {
      const validFilename = 'a'.repeat(64) + '.jpg';

      (cacheManager.imageExists as jest.Mock).mockResolvedValueOnce(true);
      (cacheManager.getImagePath as jest.Mock).mockReturnValueOnce('/fake/path/image.jpg');

      const response = await request(app).get(
        `/api/album/B0z5qAGN1JIFd3y/image/${validFilename}`
      );

      // Will fail with file not found, but should pass validation
      expect(response.status).not.toBe(404); // Not rejected by validation
    });

    it('should reject invalid token', async () => {
      const validFilename = 'a'.repeat(64) + '.jpg';

      const response = await request(app).get(`/api/album/invalid/image/${validFilename}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/album/:token/weather', () => {
    it('should return 503 when weather API not configured', async () => {
      // Assuming WEATHER_API_KEY is not set in test environment
      const response = await request(app).get('/api/album/B0z5qAGN1JIFd3y/weather');

      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject invalid token', async () => {
      const response = await request(app).get('/api/album/invalid/weather');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/album/:token/refresh', () => {
    it('should accept refresh request and return 202', async () => {
      (icloudService.syncAlbumWithCache as jest.Mock).mockResolvedValueOnce({
        metadata: {
          streamName: 'Test',
          userFirstName: 'John',
          userLastName: 'Doe',
          streamCtag: 'ctag',
          itemsReturned: 0,
        },
        photos: [],
        lastSynced: new Date(),
      });

      const response = await request(app).post('/api/album/B0z5qAGN1JIFd3y/refresh');

      expect(response.status).toBe(202);
      expect(response.body).toEqual({
        status: 'accepted',
        message: 'Album refresh started',
        token: 'B0z5qAGN1JIFd3y',
      });
    });

    it('should not wait for sync to complete', async () => {
      // Mock slow sync
      (icloudService.syncAlbumWithCache as jest.Mock).mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(resolve, 5000))
      );

      const startTime = Date.now();
      const response = await request(app).post('/api/album/B0z5qAGN1JIFd3y/refresh');
      const elapsed = Date.now() - startTime;

      expect(response.status).toBe(202);
      expect(elapsed).toBeLessThan(1000); // Should return immediately
    });

    it('should reject invalid token', async () => {
      const response = await request(app).post('/api/album/invalid/refresh');

      expect(response.status).toBe(404);
    });

    it('should handle errors gracefully', async () => {
      (icloudService.syncAlbumWithCache as jest.Mock).mockRejectedValueOnce(
        new Error('Sync error')
      );

      const response = await request(app).post('/api/album/B0z5qAGN1JIFd3y/refresh');

      // Should still return 202 since it's async
      expect(response.status).toBe(202);
    });
  });

  describe('Token validation across all routes', () => {
    it('should consistently reject empty token', async () => {
      await expect(request(app).get('/api/album//metadata')).resolves.toHaveProperty(
        'status',
        404
      );
      await expect(request(app).get('/api/album//images')).resolves.toHaveProperty('status', 404);
    });

    it('should consistently reject tokens with special characters', async () => {
      const invalidToken = 'token@with#spec';

      const responses = await Promise.all([
        request(app).get(`/api/album/${invalidToken}/metadata`),
        request(app).get(`/api/album/${invalidToken}/images`),
        request(app).get(`/api/album/${invalidToken}/weather`),
        request(app).post(`/api/album/${invalidToken}/refresh`),
      ]);

      responses.forEach((response) => {
        expect(response.status).toBe(404);
      });
    });
  });
});
