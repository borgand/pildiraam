/**
 * Tests for iCloudService
 */

import { iCloudService, createiCloudService } from '../icloudService';
import { CacheManager } from '../cacheManager';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('iCloudService', () => {
  let service: iCloudService;
  let testCacheDir: string;
  let cacheManager: CacheManager;

  beforeEach(() => {
    // Use a test cache directory
    testCacheDir = path.join(__dirname, '../../..', '.test-cache');
    cacheManager = new CacheManager(testCacheDir);
    service = createiCloudService(undefined, cacheManager);
  });

  afterEach(async () => {
    // Clean up test cache directory
    try {
      await fs.rm(testCacheDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors during cleanup
    }
  });

  describe('Constructor', () => {
    it('should create service with default configuration', () => {
      const defaultService = new iCloudService();
      expect(defaultService).toBeDefined();
    });

    it('should create service with custom configuration', () => {
      const customService = createiCloudService({
        imageDownloadTimeout: 5000,
        retryAttempts: 2,
      });
      expect(customService).toBeDefined();
    });
  });

  describe('fetchAlbumFromiCloud', () => {
    it('should return null for invalid token', async () => {
      const result = await service.fetchAlbumFromiCloud('invalid_token_123');
      expect(result).toBeNull();
    });

    // Note: Real integration tests would require a valid iCloud shared album token
    // For now, we're testing error handling
  });

  describe('downloadImage', () => {
    it('should return null for invalid URL', async () => {
      const result = await service.downloadImage('https://invalid-url-that-does-not-exist.com/image.jpg');
      expect(result).toBeNull();
    });

    it('should handle network timeout gracefully', async () => {
      const result = await service.downloadImage('https://httpbin.org/delay/20');
      expect(result).toBeNull();
    });
  });

  describe('syncAlbumWithCache', () => {
    it('should return null for invalid token', async () => {
      const result = await service.syncAlbumWithCache('invalid_token_123');
      expect(result).toBeNull();
    });

    // Additional tests would require mocking the iCloud API
  });

  describe('Service integration', () => {
    it('should handle cache miss correctly', async () => {
      // This will fail to fetch from iCloud but should handle it gracefully
      const result = await service.syncAlbumWithCache('testtoken123456');
      expect(result).toBeNull();
    });
  });
});
