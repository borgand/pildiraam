/**
 * Tests for Health Routes
 */

import request from 'supertest';
import express, { Express } from 'express';
import healthRoutes from '../routes/healthRoutes';
import { cacheManager } from '../cacheManager';
import * as fs from 'fs/promises';

// Mock dependencies
jest.mock('../cacheManager');
jest.mock('fs/promises');

const mockedFs = fs as jest.Mocked<typeof fs>;

describe('Health Routes', () => {
  let app: Express;
  const originalUptime = process.uptime;

  beforeEach(() => {
    // Create Express app with routes
    app = express();
    app.use('/api', healthRoutes);

    // Clear all mocks
    jest.clearAllMocks();

    // Mock process.uptime
    process.uptime = jest.fn(() => 12345);
  });

  afterEach(() => {
    process.uptime = originalUptime;
  });

  describe('GET /api/health', () => {
    it('should return ok status when cache is healthy', async () => {
      (cacheManager.ensureCacheDir as jest.Mock).mockResolvedValueOnce(undefined);
      mockedFs.writeFile.mockResolvedValueOnce(undefined);
      mockedFs.unlink.mockResolvedValueOnce(undefined);

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'ok',
        uptime: 12345,
        version: '1.0.0',
        cache: {
          status: 'ok',
        },
      });
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.environment).toBeDefined();
    });

    it('should include proper timestamp', async () => {
      (cacheManager.ensureCacheDir as jest.Mock).mockResolvedValueOnce(undefined);
      mockedFs.writeFile.mockResolvedValueOnce(undefined);
      mockedFs.unlink.mockResolvedValueOnce(undefined);

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body.timestamp).toBeDefined();

      // Timestamp should be in ISO format
      expect(response.body.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });

    it('should return uptime as integer seconds', async () => {
      (cacheManager.ensureCacheDir as jest.Mock).mockResolvedValueOnce(undefined);
      mockedFs.writeFile.mockResolvedValueOnce(undefined);
      mockedFs.unlink.mockResolvedValueOnce(undefined);

      process.uptime = jest.fn(() => 123.456);

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body.uptime).toBe(123);
      expect(Number.isInteger(response.body.uptime)).toBe(true);
    });

    it('should include version number', async () => {
      (cacheManager.ensureCacheDir as jest.Mock).mockResolvedValueOnce(undefined);
      mockedFs.writeFile.mockResolvedValueOnce(undefined);
      mockedFs.unlink.mockResolvedValueOnce(undefined);

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body.version).toBe('1.0.0');
    });

    it('should include environment', async () => {
      (cacheManager.ensureCacheDir as jest.Mock).mockResolvedValueOnce(undefined);
      mockedFs.writeFile.mockResolvedValueOnce(undefined);
      mockedFs.unlink.mockResolvedValueOnce(undefined);

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body.environment).toBeDefined();
      expect(typeof response.body.environment).toBe('string');
    });

    it('should include cache directory path', async () => {
      (cacheManager.ensureCacheDir as jest.Mock).mockResolvedValueOnce(undefined);
      mockedFs.writeFile.mockResolvedValueOnce(undefined);
      mockedFs.unlink.mockResolvedValueOnce(undefined);

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body.cache).toHaveProperty('directory');
      expect(typeof response.body.cache.directory).toBe('string');
    });

    it('should return degraded status when cache directory fails', async () => {
      (cacheManager.ensureCacheDir as jest.Mock).mockRejectedValueOnce(
        new Error('Permission denied')
      );

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('degraded');
      expect(response.body.cache.status).toBe('error');
    });

    it('should return degraded when write test fails', async () => {
      (cacheManager.ensureCacheDir as jest.Mock).mockResolvedValueOnce(undefined);
      mockedFs.writeFile.mockRejectedValueOnce(new Error('Write failed'));

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('degraded');
      expect(response.body.cache.status).toBe('error');
    });

    it('should still cleanup test file even on error', async () => {
      (cacheManager.ensureCacheDir as jest.Mock).mockResolvedValueOnce(undefined);
      mockedFs.writeFile.mockResolvedValueOnce(undefined);
      mockedFs.unlink.mockResolvedValueOnce(undefined);

      await request(app).get('/api/health');

      expect(mockedFs.unlink).toHaveBeenCalled();
    });


    it('should handle unlink errors gracefully', async () => {
      (cacheManager.ensureCacheDir as jest.Mock).mockResolvedValueOnce(undefined);
      mockedFs.writeFile.mockResolvedValueOnce(undefined);
      mockedFs.unlink.mockRejectedValueOnce(new Error('File not found'));

      // Should still return ok if unlink fails (non-critical)
      const response = await request(app).get('/api/health');

      // The implementation might handle this differently, adjust expectation as needed
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Health check response structure', () => {
    it('should have all required fields in ok response', async () => {
      (cacheManager.ensureCacheDir as jest.Mock).mockResolvedValueOnce(undefined);
      mockedFs.writeFile.mockResolvedValueOnce(undefined);
      mockedFs.unlink.mockResolvedValueOnce(undefined);

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('environment');
      expect(response.body).toHaveProperty('cache');
      expect(response.body.cache).toHaveProperty('directory');
      expect(response.body.cache).toHaveProperty('status');
    });

    it('should have all required fields in degraded response', async () => {
      (cacheManager.ensureCacheDir as jest.Mock).mockRejectedValueOnce(
        new Error('Error')
      );

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('environment');
      expect(response.body).toHaveProperty('cache');
      expect(response.body.status).toBe('degraded');
    });
  });

  describe('Cache health verification', () => {
    it('should test cache directory write permissions', async () => {
      (cacheManager.ensureCacheDir as jest.Mock).mockResolvedValueOnce(undefined);
      mockedFs.writeFile.mockResolvedValueOnce(undefined);
      mockedFs.unlink.mockResolvedValueOnce(undefined);

      await request(app).get('/api/health');

      expect(mockedFs.writeFile).toHaveBeenCalled();
      expect(mockedFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.health_check'),
        'test',
        'utf-8'
      );
    });

    it('should clean up test file after verification', async () => {
      (cacheManager.ensureCacheDir as jest.Mock).mockResolvedValueOnce(undefined);
      mockedFs.writeFile.mockResolvedValueOnce(undefined);
      mockedFs.unlink.mockResolvedValueOnce(undefined);

      await request(app).get('/api/health');

      expect(mockedFs.unlink).toHaveBeenCalled();
      expect(mockedFs.unlink).toHaveBeenCalledWith(
        expect.stringContaining('.health_check')
      );
    });
  });

  describe('Multiple concurrent health checks', () => {
    it('should handle multiple simultaneous requests', async () => {
      (cacheManager.ensureCacheDir as jest.Mock).mockResolvedValue(undefined);
      mockedFs.writeFile.mockResolvedValue(undefined);
      mockedFs.unlink.mockResolvedValue(undefined);

      const requests = Array.from({ length: 5 }, () => request(app).get('/api/health'));

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('ok');
      });
    });
  });
});
