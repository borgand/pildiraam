/**
 * Cache Manager for Pildiraam Digital Photo Frame
 * Handles disk-based caching of album metadata and images
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { AlbumData, AlbumMetadata, AlbumImage } from './types';
import { Logger } from './utils';
import { config } from './config';

/**
 * Cached album metadata structure stored in metadata.json
 */
interface CachedAlbumMetadata {
  metadata: AlbumMetadata;
  photos: AlbumImage[];
  lastSynced: string; // ISO date string
  lastAccessed: string; // ISO date string
}

/**
 * Cache Manager class for handling all disk cache operations
 */
export class CacheManager {
  private cacheDir: string;

  /**
   * Initialize cache manager with cache directory path
   * @param cacheDir - Base cache directory path (default from config)
   */
  constructor(cacheDir?: string) {
    // Resolve to absolute path to support both relative and absolute paths
    // path.resolve() converts relative paths to absolute based on cwd
    const rawCacheDir = cacheDir || config.IMAGE_CACHE_DIR;
    this.cacheDir = path.resolve(rawCacheDir);
  }

  /**
   * Ensure cache directory exists, create if necessary
   * @returns Promise that resolves when directory is ready
   */
  async ensureCacheDir(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      Logger.debug('Cache directory ensured', { path: this.cacheDir });
    } catch (error) {
      Logger.error('Failed to create cache directory', error as Error, {
        path: this.cacheDir,
      });
      throw error;
    }
  }

  /**
   * Get cache directory path for a specific album
   * @param token - Album token (15-character alphanumeric)
   * @returns Full path to album cache directory
   */
  getAlbumCacheDir(token: string): string {
    const albumHash = this.tokenToHash(token);
    return path.join(this.cacheDir, albumHash);
  }

  /**
   * Load album metadata from disk cache
   * @param token - Album token
   * @returns AlbumData object or null if not cached or error occurred
   */
  async loadAlbumMetadata(token: string): Promise<AlbumData | null> {
    try {
      const albumDir = this.getAlbumCacheDir(token);
      const metadataPath = path.join(albumDir, 'metadata.json');

      // Check if metadata file exists
      try {
        await fs.access(metadataPath);
      } catch {
        Logger.debug('Metadata file not found', { token, path: metadataPath });
        return null;
      }

      // Read and parse metadata
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      const cachedData: CachedAlbumMetadata = JSON.parse(metadataContent);

      // Convert ISO date strings back to Date objects
      const albumData: AlbumData = {
        metadata: cachedData.metadata,
        photos: cachedData.photos,
        lastSynced: new Date(cachedData.lastSynced),
      };

      Logger.debug('Album metadata loaded from cache', {
        token,
        photoCount: albumData.photos.length,
        lastSynced: albumData.lastSynced,
      });

      return albumData;
    } catch (error) {
      Logger.error('Failed to load album metadata', error as Error, { token });
      return null;
    }
  }

  /**
   * Save album metadata to disk cache
   * @param token - Album token
   * @param data - Album data to cache
   * @returns Promise that resolves when save is complete
   */
  async saveAlbumMetadata(token: string, data: AlbumData): Promise<void> {
    try {
      const albumDir = this.getAlbumCacheDir(token);

      // Ensure album directory exists
      await fs.mkdir(albumDir, { recursive: true });

      // Convert Date objects to ISO strings for JSON storage
      const cachedData: CachedAlbumMetadata = {
        metadata: data.metadata,
        photos: data.photos,
        lastSynced: data.lastSynced.toISOString(),
        lastAccessed: new Date().toISOString(),
      };

      const metadataPath = path.join(albumDir, 'metadata.json');
      await fs.writeFile(
        metadataPath,
        JSON.stringify(cachedData, null, 2),
        'utf-8'
      );

      Logger.info('Album metadata saved to cache', {
        token,
        photoCount: data.photos.length,
        path: albumDir,
      });
    } catch (error) {
      Logger.error('Failed to save album metadata', error as Error, { token });
      throw error;
    }
  }

  /**
   * Cache an image from URL to disk
   * @param token - Album token
   * @param imageUrl - Full URL to the image
   * @param imageBuffer - Image data as Buffer
   * @returns Filename of cached image (SHA-256 hash + .jpg)
   */
  async cacheImage(
    token: string,
    imageUrl: string,
    imageBuffer: Buffer
  ): Promise<string> {
    try {
      const albumDir = this.getAlbumCacheDir(token);
      await fs.mkdir(albumDir, { recursive: true });

      const filename = imageUrlToHash(imageUrl);
      const imagePath = path.join(albumDir, filename);

      // Check if image already exists to avoid redundant writes
      try {
        await fs.access(imagePath);
        Logger.debug('Image already cached, skipping write', {
          token,
          filename,
        });
        return filename;
      } catch {
        // Image doesn't exist, proceed with caching
      }

      await fs.writeFile(imagePath, imageBuffer);

      Logger.debug('Image cached successfully', {
        token,
        filename,
        size: imageBuffer.length,
      });

      return filename;
    } catch (error) {
      Logger.error('Failed to cache image', error as Error, {
        token,
        imageUrl,
      });
      throw error;
    }
  }

  /**
   * Get full filesystem path to a cached image
   * @param token - Album token
   * @param filename - Image filename (SHA-256 hash + .jpg)
   * @returns Full path to image file
   */
  getImagePath(token: string, filename: string): string {
    const albumDir = this.getAlbumCacheDir(token);
    return path.join(albumDir, filename);
  }

  /**
   * Check if an image exists in cache
   * @param token - Album token
   * @param filename - Image filename
   * @returns True if image exists, false otherwise
   */
  async imageExists(token: string, filename: string): Promise<boolean> {
    try {
      const imagePath = this.getImagePath(token, filename);
      await fs.access(imagePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if album cache is stale based on lastSynced timestamp
   * @param token - Album token
   * @param stalenessMinutes - Number of minutes after which cache is considered stale (default: 1440 = 24 hours)
   * @returns True if cache is stale or doesn't exist, false if fresh
   */
  async isAlbumCacheStale(
    token: string,
    stalenessMinutes: number = 1440
  ): Promise<boolean> {
    try {
      const albumData = await this.loadAlbumMetadata(token);

      if (!albumData) {
        return true; // No cache means stale
      }

      const now = new Date();
      const lastSynced = albumData.lastSynced;
      const ageMinutes =
        (now.getTime() - lastSynced.getTime()) / (1000 * 60);

      const isStale = ageMinutes > stalenessMinutes;

      Logger.debug('Cache staleness check', {
        token,
        ageMinutes: Math.round(ageMinutes),
        stalenessMinutes,
        isStale,
      });

      return isStale;
    } catch (error) {
      Logger.error('Failed to check cache staleness', error as Error, {
        token,
      });
      return true; // On error, consider stale to trigger refresh
    }
  }

  /**
   * Update lastAccessed timestamp for an album
   * @param token - Album token
   * @returns Promise that resolves when update is complete
   */
  async updateAlbumAccessTime(token: string): Promise<void> {
    try {
      const albumData = await this.loadAlbumMetadata(token);

      if (!albumData) {
        Logger.warn('Cannot update access time for non-cached album', {
          token,
        });
        return;
      }

      // Re-save metadata with updated lastAccessed timestamp
      await this.saveAlbumMetadata(token, albumData);

      Logger.debug('Album access time updated', { token });
    } catch (error) {
      Logger.error('Failed to update album access time', error as Error, {
        token,
      });
      // Don't throw - this is a non-critical operation
    }
  }

  /**
   * Delete albums that haven't been accessed within the specified time period
   * @param olderThanMinutes - Delete albums not accessed in this many minutes
   * @returns Promise that resolves to number of albums deleted
   */
  async deleteOldAlbums(olderThanMinutes: number): Promise<number> {
    try {
      await this.ensureCacheDir();

      const entries = await fs.readdir(this.cacheDir, { withFileTypes: true });
      const albumDirs = entries.filter((entry) => entry.isDirectory());

      let deletedCount = 0;
      const now = new Date();

      for (const albumDir of albumDirs) {
        const albumPath = path.join(this.cacheDir, albumDir.name);
        const metadataPath = path.join(albumPath, 'metadata.json');

        try {
          // Read metadata to check lastAccessed
          const metadataContent = await fs.readFile(metadataPath, 'utf-8');
          const cachedData: CachedAlbumMetadata = JSON.parse(metadataContent);

          const lastAccessed = new Date(cachedData.lastAccessed);
          const ageMinutes =
            (now.getTime() - lastAccessed.getTime()) / (1000 * 60);

          if (ageMinutes > olderThanMinutes) {
            // Delete entire album directory
            await fs.rm(albumPath, { recursive: true, force: true });
            deletedCount++;

            Logger.info('Deleted old album from cache', {
              albumDir: albumDir.name,
              ageMinutes: Math.round(ageMinutes),
            });
          }
        } catch (error) {
          Logger.warn('Failed to process album directory for cleanup', {
            albumDir: albumDir.name,
            error: (error as Error).message,
          });
          // Continue with next album
        }
      }

      Logger.info('Cache cleanup completed', {
        albumsDeleted: deletedCount,
        olderThanMinutes,
      });

      return deletedCount;
    } catch (error) {
      Logger.error('Failed to delete old albums', error as Error);
      return 0;
    }
  }

  /**
   * Get list of all cached album tokens
   * @returns Array of album tokens (unhashed from directory names)
   */
  async getAllCachedAlbums(): Promise<string[]> {
    try {
      await this.ensureCacheDir();

      const entries = await fs.readdir(this.cacheDir, { withFileTypes: true });
      const albumDirs = entries.filter((entry) => entry.isDirectory());

      // Album directory names are hashes, we can't reverse them to tokens
      // Instead, return the hash directory names for monitoring
      const albumHashes = albumDirs.map((dir) => dir.name);

      Logger.debug('Retrieved cached albums list', {
        count: albumHashes.length,
      });

      return albumHashes;
    } catch (error) {
      Logger.error('Failed to get cached albums list', error as Error);
      return [];
    }
  }

  /**
   * Hash album token to create directory name (16 characters)
   * @param token - Album token
   * @returns 16-character hash string
   */
  private tokenToHash(token: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(token);
    const fullHash = hash.digest('hex');
    return fullHash.substring(0, 16);
  }
}

/**
 * Generate SHA-256 hash for image URL to create filename
 * @param url - Image URL
 * @returns Filename as 64-character hash + .jpg extension
 */
export function imageUrlToHash(url: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(url);
  const fullHash = hash.digest('hex');
  return `${fullHash}.jpg`;
}

/**
 * Validate image filename format (64 hex characters + .jpg)
 * @param filename - Image filename to validate
 * @returns True if valid, false otherwise
 */
export function isValidImageFile(filename: string): boolean {
  // Must be 64 hex characters followed by .jpg
  const pattern = /^[a-f0-9]{64}\.jpg$/;
  return pattern.test(filename);
}

// Export singleton instance for convenience
export const cacheManager = new CacheManager();
