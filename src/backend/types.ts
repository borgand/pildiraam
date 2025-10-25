/**
 * TypeScript interfaces for Pildiraam digital photo frame application
 */

/**
 * Derivative image metadata with various resolutions
 */
export interface ImageDerivative {
  checksum: string;
  fileSize: number;
  width: number;
  height: number;
  url: string;
}

/**
 * Album image with all metadata and derivatives
 */
export interface AlbumImage {
  id: string;
  url: string;
  derivatives: {
    [height: string]: ImageDerivative;
  };
  dateCreated?: string;
  caption?: string;
  title?: string;
}

/**
 * Album metadata from iCloud shared album
 */
export interface AlbumMetadata {
  streamName: string;
  userFirstName: string;
  userLastName: string;
  streamCtag: string;
  itemsReturned: number;
}

/**
 * Complete album data with photos and metadata
 */
export interface AlbumData {
  metadata: AlbumMetadata;
  photos: AlbumImage[];
  lastSynced: Date;
}

/**
 * Cached album response for API endpoints
 */
export interface CachedAlbumResponse {
  images: AlbumImage[];
  metadata: {
    servedFromDiskCache: boolean;
    needsBackgroundRefresh: boolean;
    streamName?: string;
    userFirstName?: string;
    userLastName?: string;
    itemsReturned?: number;
  };
  lastSynced?: Date;
}

/**
 * Album metadata response (excluding sensitive iCloud URLs)
 */
export interface AlbumMetadataResponse {
  metadata: {
    streamName: string;
    userFirstName: string;
    userLastName: string;
    streamCtag: string;
    itemsReturned: number;
  };
  lastSynced?: Date;
}

/**
 * Configuration interface for environment variables
 */
export interface Config {
  PORT: number;
  NODE_ENV: string;
  IMAGE_CACHE_DIR: string;
  CACHE_CLEANUP_INTERVAL_MINUTES: number;
  WEATHER_API_KEY?: string;
  ALLOWED_IPS?: string;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX: number;
}
