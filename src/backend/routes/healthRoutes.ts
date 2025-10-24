/**
 * Health Routes for Pildiraam
 * System health check endpoints
 */

import { Router, Request, Response } from 'express';
import { Logger } from '../utils';
import { config } from '../config';
import { cacheManager } from '../cacheManager';
import * as fs from 'fs/promises';

const router = Router();

/**
 * GET /api/health - Service health check
 * Returns service status, uptime, and basic system info
 */
router.get('/health', async (_req: Request, res: Response): Promise<void> => {
  try {
    // Check if cache directory exists and is writable
    let cacheStatus = 'ok';
    try {
      await cacheManager.ensureCacheDir();
      // Try to write a test file
      const testPath = `${config.IMAGE_CACHE_DIR}/.health_check`;
      await fs.writeFile(testPath, 'test', 'utf-8');
      await fs.unlink(testPath);
    } catch (error) {
      Logger.error('Cache directory health check failed', error as Error);
      cacheStatus = 'error';
    }

    const healthData = {
      status: cacheStatus === 'ok' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      version: '1.0.0',
      environment: config.NODE_ENV,
      cache: {
        directory: config.IMAGE_CACHE_DIR,
        status: cacheStatus,
      },
    };

    Logger.debug('Health check performed', healthData);
    res.json(healthData);
  } catch (error) {
    Logger.error('Health check failed', error as Error);
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

export default router;
