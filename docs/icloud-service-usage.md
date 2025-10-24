# iCloud Service Usage Guide

## Overview

The `iCloudService` module handles all interactions with iCloud Shared Albums, including:
- Fetching album metadata and photo lists from iCloud
- Downloading images from iCloud CDN
- Cache-first synchronization strategy
- Retry logic with exponential backoff
- Rate limiting and error handling

## Architecture

The service implements a **cache-first architecture** to ensure instant display:

1. **Check cache first** - Always check disk cache before fetching from iCloud
2. **Serve immediately** - Return cached data instantly if available
3. **Background refresh** - Update stale cache in background without blocking
4. **Smart downloading** - Only download new/missing images, skip existing ones
5. **Graceful degradation** - Return stale cache if iCloud fetch fails

## Basic Usage

### Using the Singleton Instance

```typescript
import { icloudService } from './icloudService';

// Synchronize album with cache (cache-first)
const albumData = await icloudService.syncAlbumWithCache('B0z5qAGN1JIFd3y');

if (albumData) {
  console.log(`Album: ${albumData.metadata.streamName}`);
  console.log(`Photos: ${albumData.photos.length}`);
  console.log(`Last synced: ${albumData.lastSynced}`);
}
```

### Creating Custom Instance

```typescript
import { createiCloudService } from './icloudService';

const customService = createiCloudService({
  imageDownloadTimeout: 5000,    // 5 second timeout
  retryAttempts: 2,               // 2 retry attempts
  downloadDelay: 500,             // 500ms between downloads
});

const albumData = await customService.syncAlbumWithCache(token);
```

## API Methods

### `syncAlbumWithCache(token: string): Promise<AlbumData | null>`

**Main orchestration function** - Implements cache-first strategy.

**Flow:**
1. Check if cache is stale (default: 24 hours)
2. If fresh cache exists, return immediately
3. If stale/missing, fetch from iCloud
4. Determine which images need downloading
5. Download only new/missing images
6. Update cache with new data
7. Return complete album data

**Example:**
```typescript
const albumData = await icloudService.syncAlbumWithCache('B0z5qAGN1JIFd3y');

if (!albumData) {
  console.error('Failed to sync album');
  return;
}

// Access metadata
console.log(albumData.metadata.streamName);
console.log(albumData.metadata.itemsReturned);

// Access photos
for (const photo of albumData.photos) {
  console.log(`Photo ID: ${photo.id}`);
  console.log(`URL: ${photo.url}`);
  console.log(`Date: ${photo.dateCreated}`);
}
```

### `fetchAlbumFromiCloud(token: string): Promise<AlbumData | null>`

**Fetch album directly from iCloud** - Bypasses cache.

**Returns:**
- `AlbumData` object with metadata and photos
- `null` if fetch fails or timeout occurs

**Example:**
```typescript
const albumData = await icloudService.fetchAlbumFromiCloud('B0z5qAGN1JIFd3y');

if (albumData) {
  console.log(`Fetched ${albumData.photos.length} photos`);
}
```

### `downloadImage(imageUrl: string): Promise<Buffer | null>`

**Download image from iCloud CDN** - With retry and backoff.

**Features:**
- 3 retry attempts with exponential backoff (1s, 2s, 4s)
- 10-second timeout per attempt
- Handles rate limiting (429) and service unavailable (503)
- Returns image as Buffer

**Example:**
```typescript
const imageBuffer = await icloudService.downloadImage(
  'https://cvws.icloud-content.com/...'
);

if (imageBuffer) {
  console.log(`Downloaded ${imageBuffer.length} bytes`);
  // Use imageBuffer with cacheManager.cacheImage()
}
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `imageDownloadTimeout` | number | 10000 | Timeout for image downloads (ms) |
| `retryAttempts` | number | 3 | Number of retry attempts |
| `retryBackoff` | number[] | [1000, 2000, 4000] | Backoff delays (ms) |
| `albumFetchTimeout` | number | 15000 | Timeout for album fetch (ms) |
| `downloadDelay` | number | 1000 | Delay between downloads (ms) |
| `userAgent` | string | Chrome UA | User-Agent header |

## Error Handling

The service handles errors gracefully:

### Network Errors
```typescript
const albumData = await icloudService.syncAlbumWithCache(token);

if (!albumData) {
  // Check if cached data exists (even if stale)
  const cached = await cacheManager.loadAlbumMetadata(token);
  if (cached) {
    console.log('Using stale cache due to network error');
    // Use cached data
  } else {
    console.error('No data available - first sync failed');
  }
}
```

### Partial Download Failures
The service continues even if some images fail:

```typescript
// If 10/100 images fail to download, you still get the 90 that succeeded
const albumData = await icloudService.syncAlbumWithCache(token);

// Check logs for details on failed downloads
// Service logs success/fail counts
```

### Timeout Handling
```typescript
// Album fetch timeout (15 seconds)
const albumData = await icloudService.fetchAlbumFromiCloud(token);

if (!albumData) {
  console.error('Album fetch timed out or failed');
}
```

## Integration with Cache Manager

The iCloud service integrates tightly with the cache manager:

```typescript
import { icloudService, cacheManager } from './backend';

// Sync album (downloads new images automatically)
const albumData = await icloudService.syncAlbumWithCache(token);

// Access cached image
const imagePath = cacheManager.getImagePath(token, filename);

// Check if cache is stale
const isStale = await cacheManager.isAlbumCacheStale(token);

// Update access time
await cacheManager.updateAlbumAccessTime(token);
```

## Best Practices

### 1. Always use `syncAlbumWithCache()` for normal operations
```typescript
// Good - cache-first, instant display
const albumData = await icloudService.syncAlbumWithCache(token);

// Avoid - bypasses cache, slow
const albumData = await icloudService.fetchAlbumFromiCloud(token);
```

### 2. Handle null returns gracefully
```typescript
const albumData = await icloudService.syncAlbumWithCache(token);

if (!albumData) {
  // Return 404 or error response
  return res.status(404).json({ error: 'Album not found' });
}
```

### 3. Use background refresh for stale cache
```typescript
// Check staleness
const isStale = await cacheManager.isAlbumCacheStale(token, 1440); // 24 hours

if (isStale) {
  // Trigger background refresh (don't await)
  icloudService.syncAlbumWithCache(token).catch(err => {
    Logger.error('Background refresh failed', err);
  });
}

// Return cached data immediately
const cachedData = await cacheManager.loadAlbumMetadata(token);
return cachedData;
```

### 4. Monitor failed downloads
```typescript
// Service logs success/fail counts
// Check logs for patterns:
// - "Image download batch complete" shows success/failed counts
// - Failed downloads don't block the entire sync
```

## Example: Full Integration in API Route

```typescript
import { Router } from 'express';
import { icloudService, cacheManager } from './backend';

const router = Router();

router.get('/api/album/:token/images', async (req, res) => {
  const { token } = req.params;

  try {
    // Sync album with cache (instant if cached, slow if first time)
    const albumData = await icloudService.syncAlbumWithCache(token);

    if (!albumData) {
      return res.status(404).json({ error: 'Album not found' });
    }

    // Check if we served from cache
    const isStale = await cacheManager.isAlbumCacheStale(token);

    // Return image list with server URLs
    const images = albumData.photos.map(photo => ({
      id: photo.id,
      url: `/api/album/${token}/image/${imageUrlToHash(photo.url)}`,
      dateCreated: photo.dateCreated,
      caption: photo.caption,
    }));

    return res.json({
      images,
      metadata: {
        servedFromDiskCache: true,
        needsBackgroundRefresh: isStale,
        streamName: albumData.metadata.streamName,
        itemsReturned: albumData.metadata.itemsReturned,
      },
      lastSynced: albumData.lastSynced,
    });
  } catch (error) {
    Logger.error('Failed to get album images', error as Error, { token });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

## Logging

The service provides structured logging at all levels:

```json
// Info - successful operations
{"timestamp":"2024-01-15T10:30:00Z","level":"INFO","message":"Album fetched successfully from iCloud","token":"B0z5qAGN1JIFd3y","photoCount":42,"albumName":"Family Photos"}

// Debug - detailed operations (development only)
{"timestamp":"2024-01-15T10:30:01Z","level":"DEBUG","message":"Downloading image","imageUrl":"https://cvws.icloud-content.com/...","attempt":0}

// Warn - non-critical issues
{"timestamp":"2024-01-15T10:30:02Z","level":"WARN","message":"Failed to download image","imageId":"abc123","url":"https://..."}

// Error - critical failures
{"timestamp":"2024-01-15T10:30:03Z","level":"ERROR","message":"Album synchronization failed","token":"B0z5qAGN1JIFd3y","error":{"name":"Error","message":"Network timeout"}}
```

## Performance Characteristics

| Operation | First Visit | Cached Visit | Stale Cache |
|-----------|-------------|--------------|-------------|
| Metadata fetch | ~2-5s | <100ms | <100ms + background |
| Image download | ~1-5min (100 photos) | 0s | 0s + background |
| API response | Slow (first time) | Instant | Instant |
| Display ready | After download | Immediate | Immediate |

## Troubleshooting

### Album fetch always returns null
- Verify token is valid 15-character alphanumeric
- Check network connectivity to iCloud servers
- Review logs for specific error messages

### Images fail to download
- Check iCloud CDN URLs are accessible
- Verify rate limiting is not too aggressive
- Increase timeout values if network is slow

### Cache not being used
- Verify cache directory exists and is writable
- Check `isAlbumCacheStale()` return value
- Review staleness threshold (default 24 hours)

### Background refresh not working
- Ensure cache staleness check is implemented
- Verify background sync is not awaited (should be fire-and-forget)
- Check logs for background sync errors
