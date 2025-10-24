/**
 * iCloud Service for Pildiraam Digital Photo Frame
 * Handles fetching albums from iCloud Shared Albums and downloading images
 */

import axios, { AxiosError } from 'axios';
import getImages, { ICloud } from 'icloud-shared-album';
import { AlbumData, AlbumMetadata, AlbumImage } from './types';
import { Logger } from './utils';
import { cacheManager, CacheManager, imageUrlToHash } from './cacheManager';

/**
 * Configuration for iCloud service
 */
interface iCloudServiceConfig {
  imageDownloadTimeout: number; // Timeout for image downloads in ms
  retryAttempts: number; // Number of retry attempts for failed downloads
  retryBackoff: number[]; // Backoff delays in ms [1000, 2000, 4000]
  albumFetchTimeout: number; // Timeout for album fetch in ms
  downloadDelay: number; // Delay between downloads in ms (rate limiting)
  userAgent: string; // User-Agent header for requests
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: iCloudServiceConfig = {
  imageDownloadTimeout: 10000, // 10 seconds
  retryAttempts: 3,
  retryBackoff: [1000, 2000, 4000], // Exponential backoff
  albumFetchTimeout: 15000, // 15 seconds
  downloadDelay: 1000, // 1 second between downloads
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

/**
 * iCloud Service Class
 * Handles all interactions with iCloud Shared Albums API
 */
export class iCloudService {
  private config: iCloudServiceConfig;
  private cacheManager: CacheManager;

  /**
   * Initialize iCloud service with optional configuration
   * @param config - Optional configuration overrides
   * @param cacheManager - Optional cache manager instance
   */
  constructor(
    config?: Partial<iCloudServiceConfig>,
    cacheManager?: CacheManager
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cacheManager = cacheManager || new CacheManager();
  }

  /**
   * Fetch album metadata and photos from iCloud
   * @param token - Album token (15-character alphanumeric)
   * @returns AlbumData object or null on error
   */
  async fetchAlbumFromiCloud(token: string): Promise<AlbumData | null> {
    try {
      Logger.info('Fetching album from iCloud', { token });

      // Set timeout for album fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, this.config.albumFetchTimeout);

      try {
        // Use icloud-shared-album package to fetch album data
        const albumResponse: ICloud.Response = await getImages(token);

        clearTimeout(timeoutId);

        if (!albumResponse || !albumResponse.photos || !albumResponse.metadata) {
          Logger.warn('Invalid album response from iCloud', { token });
          return null;
        }

        // Parse metadata
        const metadata: AlbumMetadata = {
          streamName: albumResponse.metadata.streamName || 'Untitled Album',
          userFirstName: albumResponse.metadata.userFirstName || '',
          userLastName: albumResponse.metadata.userLastName || '',
          streamCtag: albumResponse.metadata.streamCtag || '',
          itemsReturned: albumResponse.metadata.itemsReturned || albumResponse.photos.length,
        };

        // Parse photos
        const photos: AlbumImage[] = albumResponse.photos.map(
          (photo: ICloud.Image): AlbumImage => {
            // Extract derivatives (different resolutions)
            const derivatives: { [height: string]: any } = {};
            if (photo.derivatives) {
              Object.keys(photo.derivatives).forEach((key) => {
                const derivative = photo.derivatives[key];
                derivatives[key] = {
                  checksum: derivative.checksum || '',
                  fileSize: derivative.fileSize || 0,
                  width: derivative.width || 0,
                  height: derivative.height || 0,
                  url: derivative.url || '',
                };
              });
            }

            // Select best URL from derivatives
            const bestUrl = this.selectBestUrlFromDerivatives(photo.derivatives);

            return {
              id: photo.photoGuid || '',
              url: bestUrl || '',
              derivatives,
              dateCreated: photo.dateCreated ? photo.dateCreated.toISOString() : undefined,
              caption: photo.caption || undefined,
            };
          }
        );

        const albumData: AlbumData = {
          metadata,
          photos,
          lastSynced: new Date(),
        };

        Logger.info('Album fetched successfully from iCloud', {
          token,
          photoCount: photos.length,
          albumName: metadata.streamName,
        });

        return albumData;
      } catch (error) {
        clearTimeout(timeoutId);

        if ((error as any).name === 'AbortError') {
          Logger.error('Album fetch timeout', error as Error, {
            token,
            timeout: this.config.albumFetchTimeout,
          });
          return null;
        }

        throw error;
      }
    } catch (error) {
      Logger.error('Failed to fetch album from iCloud', error as Error, {
        token,
      });
      return null;
    }
  }

  /**
   * Download image from iCloud CDN
   * @param imageUrl - Full URL to the image
   * @returns Buffer with image data or null on error
   */
  async downloadImage(imageUrl: string): Promise<Buffer | null> {
    let lastError: Error | null = null;

    // Retry with exponential backoff
    for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.config.retryBackoff[attempt - 1] || 4000;
          Logger.debug('Retrying image download', {
            imageUrl,
            attempt,
            delay,
          });
          await this.sleep(delay);
        }

        Logger.debug('Downloading image', { imageUrl, attempt });

        const response = await axios.get(imageUrl, {
          responseType: 'arraybuffer',
          timeout: this.config.imageDownloadTimeout,
          headers: {
            'User-Agent': this.config.userAgent,
          },
          maxRedirects: 5,
        });

        if (response.status === 200 && response.data) {
          const buffer = Buffer.from(response.data);
          Logger.debug('Image downloaded successfully', {
            imageUrl,
            size: buffer.length,
            attempt,
          });
          return buffer;
        }

        Logger.warn('Invalid response for image download', {
          imageUrl,
          status: response.status,
        });
        lastError = new Error(`Invalid response status: ${response.status}`);
      } catch (error) {
        const axiosError = error as AxiosError;

        // Handle rate limiting (429) and service unavailable (503)
        if (
          axiosError.response &&
          (axiosError.response.status === 429 ||
            axiosError.response.status === 503)
        ) {
          Logger.warn('Rate limit or service unavailable, backing off', {
            imageUrl,
            status: axiosError.response.status,
            attempt,
          });
          lastError = error as Error;
          // Apply extra backoff for rate limiting
          await this.sleep(5000 * (attempt + 1));
          continue;
        }

        Logger.debug('Image download attempt failed', {
          imageUrl,
          attempt,
          error: (error as Error).message,
        });
        lastError = error as Error;
      }
    }

    // All retries exhausted
    Logger.error('Failed to download image after all retries', lastError!, {
      imageUrl,
      retries: this.config.retryAttempts,
    });
    return null;
  }

  /**
   * Synchronize album with cache
   * Main orchestration function that handles cache-first logic
   * @param token - Album token
   * @returns AlbumData object or null on error
   */
  async syncAlbumWithCache(token: string): Promise<AlbumData | null> {
    try {
      Logger.info('Starting album synchronization', { token });

      // Check if cache is stale (default 1440 minutes = 24 hours)
      const isStale = await this.cacheManager.isAlbumCacheStale(token);

      // Load existing cache
      const cachedData = await this.cacheManager.loadAlbumMetadata(token);

      // If cache is fresh, return it immediately
      if (!isStale && cachedData) {
        Logger.info('Serving from fresh cache', {
          token,
          photoCount: cachedData.photos.length,
          lastSynced: cachedData.lastSynced,
        });
        await this.cacheManager.updateAlbumAccessTime(token);
        return cachedData;
      }

      // Cache is stale or missing - fetch from iCloud
      Logger.info('Cache is stale or missing, fetching from iCloud', {
        token,
        isStale,
        hasCachedData: !!cachedData,
      });

      const albumData = await this.fetchAlbumFromiCloud(token);

      if (!albumData) {
        Logger.error('Failed to fetch album from iCloud', undefined, {
          token,
        });
        // Return cached data if available, even if stale
        if (cachedData) {
          Logger.warn('Returning stale cache due to iCloud fetch failure', {
            token,
          });
          return cachedData;
        }
        return null;
      }

      // Determine which images need to be downloaded
      const imagesToDownload = await this.determineImagesToDownload(
        token,
        albumData.photos,
        cachedData?.photos || []
      );

      Logger.info('Images to download determined', {
        token,
        totalImages: albumData.photos.length,
        toDownload: imagesToDownload.length,
        alreadyCached: albumData.photos.length - imagesToDownload.length,
      });

      // Download images that aren't already cached
      if (imagesToDownload.length > 0) {
        await this.downloadAndCacheImages(token, imagesToDownload);
      }

      // Save album metadata to cache
      await this.cacheManager.saveAlbumMetadata(token, albumData);

      Logger.info('Album synchronization complete', {
        token,
        photoCount: albumData.photos.length,
        downloadedImages: imagesToDownload.length,
      });

      return albumData;
    } catch (error) {
      Logger.error('Album synchronization failed', error as Error, { token });
      return null;
    }
  }

  /**
   * Determine which images need to be downloaded
   * Compares new photo list with cached photos to avoid re-downloading
   * @param token - Album token
   * @param newPhotos - New photo list from iCloud
   * @param cachedPhotos - Cached photo list
   * @returns Array of photos that need to be downloaded
   */
  private async determineImagesToDownload(
    token: string,
    newPhotos: AlbumImage[],
    cachedPhotos: AlbumImage[]
  ): Promise<AlbumImage[]> {
    const imagesToDownload: AlbumImage[] = [];

    // Build set of cached image URLs for fast lookup
    const cachedUrls = new Set(cachedPhotos.map((photo) => photo.url));

    // Check each new photo
    for (const photo of newPhotos) {
      // If photo URL is not in cache, add to download list
      if (!cachedUrls.has(photo.url)) {
        imagesToDownload.push(photo);
        continue;
      }

      // Check if image file actually exists on disk
      const filename = imageUrlToHash(photo.url);
      const exists = await this.cacheManager.imageExists(token, filename);

      if (!exists) {
        Logger.warn('Image in metadata but not on disk, re-downloading', {
          token,
          filename,
          url: photo.url,
        });
        imagesToDownload.push(photo);
      }
    }

    return imagesToDownload;
  }

  /**
   * Download and cache images with rate limiting and error handling
   * Continues even if some images fail to download
   * @param token - Album token
   * @param images - Array of images to download
   */
  private async downloadAndCacheImages(
    token: string,
    images: AlbumImage[]
  ): Promise<void> {
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < images.length; i++) {
      const image = images[i];

      try {
        // Select best quality image URL
        const imageUrl = this.selectBestImageUrl(image);

        if (!imageUrl) {
          Logger.warn('No valid image URL found', {
            token,
            imageId: image.id,
          });
          failCount++;
          continue;
        }

        // Download image
        const imageBuffer = await this.downloadImage(imageUrl);

        if (!imageBuffer) {
          Logger.warn('Failed to download image', {
            token,
            imageId: image.id,
            url: imageUrl,
          });
          failCount++;
          continue;
        }

        // Cache image
        await this.cacheManager.cacheImage(token, imageUrl, imageBuffer);
        successCount++;

        Logger.debug('Image cached successfully', {
          token,
          imageId: image.id,
          progress: `${i + 1}/${images.length}`,
        });

        // Rate limiting: wait between downloads
        if (i < images.length - 1) {
          await this.sleep(this.config.downloadDelay);
        }
      } catch (error) {
        Logger.error(
          'Error downloading/caching image',
          error as Error,
          {
            token,
            imageId: image.id,
            progress: `${i + 1}/${images.length}`,
          }
        );
        failCount++;
        // Continue with next image even if this one fails
      }
    }

    Logger.info('Image download batch complete', {
      token,
      total: images.length,
      success: successCount,
      failed: failCount,
    });
  }

  /**
   * Select best URL from derivatives during album fetch
   * Used when parsing iCloud response
   * @param derivatives - Derivatives from iCloud response
   * @returns Best image URL or null
   */
  private selectBestUrlFromDerivatives(
    derivatives: Record<string, ICloud.Derivative>
  ): string | null {
    if (!derivatives || Object.keys(derivatives).length === 0) {
      return null;
    }

    // Sort derivatives by resolution (height) in descending order
    const sortedDerivatives = Object.entries(derivatives)
      .map(([key, derivative]) => ({
        key,
        height: parseInt(key, 10) || derivative.height || 0,
        url: derivative.url,
      }))
      .filter((d) => d.url) // Only include derivatives with URLs
      .sort((a, b) => b.height - a.height);

    if (sortedDerivatives.length === 0) {
      return null;
    }

    return sortedDerivatives[0].url!;
  }

  /**
   * Select best quality image URL from AlbumImage
   * Prefers highest resolution available
   * @param image - Album image object
   * @returns Best image URL or null
   */
  private selectBestImageUrl(image: AlbumImage): string | null {
    // If main URL exists, prefer it
    if (image.url) {
      return image.url;
    }

    // Otherwise, select highest resolution derivative
    if (!image.derivatives || Object.keys(image.derivatives).length === 0) {
      return null;
    }

    // Sort derivatives by resolution (height) in descending order
    const sortedDerivatives = Object.entries(image.derivatives)
      .map(([key, derivative]) => ({
        key,
        height: parseInt(key, 10) || derivative.height || 0,
        url: derivative.url,
      }))
      .filter((d) => d.url) // Only include derivatives with URLs
      .sort((a, b) => b.height - a.height);

    if (sortedDerivatives.length === 0) {
      return null;
    }

    return sortedDerivatives[0].url;
  }

  /**
   * Sleep utility for delays and backoff
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Export singleton instance for convenience
 */
export const icloudService = new iCloudService(undefined, cacheManager);

/**
 * Factory function for creating iCloud service with custom configuration
 * @param config - Optional configuration overrides
 * @param cacheManager - Optional cache manager instance
 * @returns New iCloudService instance
 */
export function createiCloudService(
  config?: Partial<iCloudServiceConfig>,
  cacheManager?: CacheManager
): iCloudService {
  return new iCloudService(config, cacheManager);
}
