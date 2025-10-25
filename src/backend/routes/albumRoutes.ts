/**
 * Album Routes for Pildiraam
 * Handles all album-related endpoints: metadata, images, serving, weather
 */

import { Router, Request, Response } from 'express';
import * as path from 'path';
import { Logger, createErrorResponse, maskToken } from '../utils';
import { config } from '../config';
import { icloudService } from '../icloudService';
import { cacheManager, imageUrlToHash, isValidImageFile } from '../cacheManager';
import { validateToken } from '../middleware/tokenValidator';
import { AlbumMetadataResponse } from '../types';

const router = Router();

/**
 * GET /album/:token - Serve slideshow HTML interface
 * Immediately serves the HTML without waiting for any data
 */
router.get('/album/:token', validateToken, (req: Request, res: Response): void => {
  const { token } = req.params;

  Logger.info('Serving slideshow interface', { token: maskToken(token) });

  // Serve slideshow HTML from public directory
  const slideshowPath = path.join(__dirname, '../../../public/slideshow.html');
  res.sendFile(slideshowPath, (err) => {
    if (err) {
      Logger.error('Failed to serve slideshow HTML', err as Error, { token: maskToken(token) });
      res.status(500).send('Failed to load slideshow interface');
    }
  });
});

/**
 * GET /api/album/:token/metadata - Get album metadata (quick response)
 * Returns cached metadata if available, or loading state if not
 * No blocking on iCloud fetch
 */
router.get(
  '/api/album/:token/metadata',
  validateToken,
  async (req: Request, res: Response): Promise<void> => {
    const { token } = req.params;

    try {
      Logger.debug('Fetching album metadata', { token: maskToken(token) });

      // Load from cache (non-blocking)
      const cachedData = await cacheManager.loadAlbumMetadata(token);

      if (!cachedData) {
        // No cache available - return loading state
        Logger.info('No cached metadata available', { token: maskToken(token) });
        res.json({
          status: 'loading',
          message: 'Album is being loaded from iCloud',
        });
        return;
      }

      // Return cached metadata (excluding sensitive iCloud URLs)
      const response: AlbumMetadataResponse = {
        metadata: {
          streamName: cachedData.metadata.streamName,
          userFirstName: cachedData.metadata.userFirstName,
          userLastName: cachedData.metadata.userLastName,
          streamCtag: cachedData.metadata.streamCtag,
          itemsReturned: cachedData.metadata.itemsReturned,
        },
        lastSynced: cachedData.lastSynced,
      };

      Logger.debug('Album metadata served', {
        token: maskToken(token),
        albumName: cachedData.metadata.streamName,
        photoCount: cachedData.metadata.itemsReturned,
      });

      res.json(response);
    } catch (error) {
      Logger.error('Failed to fetch album metadata', error as Error, { token: maskToken(token) });
      res.status(500).json(createErrorResponse('Failed to load album metadata', 500));
    }
  }
);

/**
 * GET /api/album/:token/images - Get paginated album images
 * Calls syncAlbumWithCache to ensure cache is fresh
 * Returns paginated list with server URLs
 *
 * Query params:
 * - page: Page number (default: 0)
 * - limit: Images per page (default: 20, max: 100)
 */
router.get(
  '/api/album/:token/images',
  validateToken,
  async (req: Request, res: Response): Promise<void> => {
    const { token } = req.params;
    const page = parseInt(req.query.page as string) || 0;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    try {
      Logger.info('Fetching album images', { token: maskToken(token), page, limit });

      // Sync album with cache (cache-first, then iCloud if stale)
      const albumData = await icloudService.syncAlbumWithCache(token);

      if (!albumData) {
        Logger.warn('Failed to sync album', { token: maskToken(token) });
        res.status(404).json(createErrorResponse('Album not found or unavailable', 404));
        return;
      }

      // Sort photos by dateCreated (newest first) for deterministic pagination
      const sortedPhotos = [...albumData.photos].sort((a, b) => {
        const dateA = a.dateCreated ? new Date(a.dateCreated).getTime() : 0;
        const dateB = b.dateCreated ? new Date(b.dateCreated).getTime() : 0;
        return dateB - dateA; // Descending order
      });

      // Calculate pagination
      const total = sortedPhotos.length;
      const startIndex = page * limit;
      const endIndex = Math.min(startIndex + limit, total);
      const hasMore = endIndex < total;

      // Get page of photos
      const pagePhotos = sortedPhotos.slice(startIndex, endIndex);

      // Map iCloud URLs to server URLs
      const imagesWithServerUrls = pagePhotos.map((photo) => {
        const filename = imageUrlToHash(photo.url);
        return {
          id: photo.id,
          url: `/api/album/${token}/image/${filename}`,
          filename: filename,
          dateCreated: photo.dateCreated,
          caption: photo.caption || null,
          title: photo.title || null,
        };
      });

      // Check if cache was served or fresh iCloud fetch happened
      const cacheAge = Date.now() - albumData.lastSynced.getTime();
      const servedFromDiskCache = cacheAge < 60000; // < 1 minute means it was already cached
      const needsBackgroundRefresh = cacheAge > 3600000; // > 1 hour

      const response = {
        images: imagesWithServerUrls,
        metadata: {
          total,
          page,
          limit,
          hasMore,
          servedFromDiskCache,
          needsBackgroundRefresh,
          streamName: albumData.metadata.streamName,
          userFirstName: albumData.metadata.userFirstName,
          userLastName: albumData.metadata.userLastName,
          itemsReturned: albumData.metadata.itemsReturned,
        },
        lastSynced: albumData.lastSynced.toISOString(),
      };

      Logger.info('Album images served', {
        token: maskToken(token),
        page,
        returned: imagesWithServerUrls.length,
        total,
        servedFromCache: servedFromDiskCache,
      });

      res.json(response);
    } catch (error) {
      Logger.error('Failed to fetch album images', error as Error, { token: maskToken(token), page });
      res.status(500).json(createErrorResponse('Failed to load album images', 500));
    }
  }
);

/**
 * GET /api/album/:token/image/:filename - Serve cached image
 * Serves image directly from disk cache with aggressive caching headers
 */
router.get(
  '/api/album/:token/image/:filename',
  validateToken,
  async (req: Request, res: Response): Promise<void> => {
    const { token, filename } = req.params;

    try {
      // Validate filename format
      if (!isValidImageFile(filename)) {
        Logger.warn('Invalid image filename format', { token: maskToken(token), filename });
        res.status(404).send('Not found');
        return;
      }

      // Check if image exists in cache
      const imageExists = await cacheManager.imageExists(token, filename);

      if (!imageExists) {
        Logger.warn('Image not found in cache', { token: maskToken(token), filename });
        res.status(404).send('Not found');
        return;
      }

      // Get image path
      const imagePath = cacheManager.getImagePath(token, filename);

      // Set aggressive cache headers (1 year)
      res.set({
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'ETag': filename.split('.')[0], // Use hash as ETag
      });

      Logger.debug('Serving cached image', { token: maskToken(token), filename });

      // Serve image using sendFile for efficient streaming
      res.sendFile(imagePath, (err) => {
        if (err) {
          Logger.error('Failed to serve image', err as Error, {
            token: maskToken(token),
            filename,
          });
          if (!res.headersSent) {
            res.status(500).send('Failed to serve image');
          }
        }
      });
    } catch (error) {
      Logger.error('Error serving image', error as Error, { token: maskToken(token), filename });
      if (!res.headersSent) {
        res.status(500).send('Internal server error');
      }
    }
  }
);

/**
 * GET /api/album/:token/weather - Get weather overlay data
 * Stub implementation returning mock data
 * TODO: Integrate with actual weather API when WEATHER_API_KEY is set
 */
router.get(
  '/api/album/:token/weather',
  validateToken,
  (req: Request, res: Response): void => {
    const { token } = req.params;

    // Check if weather API is configured
    if (!config.WEATHER_API_KEY) {
      Logger.debug('Weather API not configured', { token: maskToken(token) });
      res.status(503).json(createErrorResponse('Weather service not configured', 503));
      return;
    }

    // TODO: Integrate with actual weather API
    // For now, return mock data (London weather)
    const mockWeather = {
      temp: 15,
      condition: 'Partly Cloudy',
      icon: 'partly-cloudy',
      location: 'London',
      lastUpdated: new Date().toISOString(),
    };

    Logger.debug('Weather data served (mock)', { token: maskToken(token) });
    res.json(mockWeather);
  }
);

/**
 * POST /api/album/:token/refresh - Force manual album refresh
 * Triggers immediate sync with iCloud, bypassing cache staleness check
 */
router.post(
  '/api/album/:token/refresh',
  validateToken,
  async (req: Request, res: Response): Promise<void> => {
    const { token } = req.params;

    try {
      Logger.info('Manual refresh requested', { token: maskToken(token) });

      // Trigger sync in background (don't await)
      icloudService.syncAlbumWithCache(token).then(
        (result) => {
          if (result) {
            Logger.info('Manual refresh completed', {
              token: maskToken(token),
              photoCount: result.photos.length,
            });
          } else {
            Logger.error('Manual refresh failed', undefined, { token: maskToken(token) });
          }
        },
        (error) => {
          Logger.error('Manual refresh error', error as Error, { token: maskToken(token) });
        }
      );

      // Return immediately
      res.status(202).json({
        status: 'accepted',
        message: 'Album refresh started',
        token,
      });
    } catch (error) {
      Logger.error('Failed to trigger manual refresh', error as Error, {
        token,
      });
      res.status(500).json(createErrorResponse('Failed to start refresh', 500));
    }
  }
);

export default router;
