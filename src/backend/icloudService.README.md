# iCloudService Module

## Overview

The `iCloudService` module is a comprehensive service for interacting with iCloud Shared Albums. It implements a **cache-first architecture** to provide instant album display while automatically keeping data fresh.

## Features

### ✅ Implemented Features

1. **Album Fetching**
   - ✓ Fetch album metadata from iCloud Shared Albums
   - ✓ Parse album name, owner, photo count
   - ✓ Extract photo list with all metadata
   - ✓ Handle different image derivatives (resolutions)
   - ✓ 15-second timeout for album fetch
   - ✓ Graceful error handling

2. **Image Downloading**
   - ✓ Download images from iCloud CDN
   - ✓ Return images as Buffer objects
   - ✓ 10-second timeout per download
   - ✓ 3 retry attempts with exponential backoff (1s, 2s, 4s)
   - ✓ Handle rate limiting (429) and service unavailable (503)
   - ✓ Custom User-Agent header
   - ✓ Network error handling

3. **Album Synchronization**
   - ✓ Cache-first strategy (instant display)
   - ✓ Check cache staleness (default 24 hours)
   - ✓ Serve from cache immediately if fresh
   - ✓ Fetch from iCloud only when stale/missing
   - ✓ Smart image download (only new/missing images)
   - ✓ Update lastSynced and lastAccessed timestamps
   - ✓ Partial failure handling (continue on errors)
   - ✓ Return stale cache if iCloud fetch fails

4. **Error Handling**
   - ✓ Structured logging with Logger
   - ✓ Don't expose internal errors to frontend
   - ✓ Graceful network timeout handling
   - ✓ Return null on critical errors
   - ✓ Log all failures with context

5. **Rate Limiting**
   - ✓ 1-second delay between image downloads
   - ✓ Respect iCloud CDN rate limits
   - ✓ Exponential backoff on 429/503 responses
   - ✓ Extra backoff for rate limit errors

6. **Configuration**
   - ✓ Configurable timeouts
   - ✓ Configurable retry attempts
   - ✓ Configurable backoff delays
   - ✓ Configurable download delay
   - ✓ Customizable User-Agent
   - ✓ Factory function for custom instances

7. **Type Safety**
   - ✓ Full TypeScript implementation
   - ✓ Uses interfaces from types.ts
   - ✓ Proper typing for icloud-shared-album package
   - ✓ JSDoc for all functions
   - ✓ Compiles without errors

8. **Integration with CacheManager**
   - ✓ Use cacheManager.loadAlbumMetadata()
   - ✓ Use cacheManager.cacheImage()
   - ✓ Use cacheManager.saveAlbumMetadata()
   - ✓ Use cacheManager.isAlbumCacheStale()
   - ✓ Use cacheManager.imageExists()
   - ✓ Use cacheManager.updateAlbumAccessTime()

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      iCloudService                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  syncAlbumWithCache(token)                                   │
│  ├─ Check cache staleness                                    │
│  ├─ If fresh: Return cached data (instant)                   │
│  └─ If stale/missing:                                        │
│     ├─ fetchAlbumFromiCloud(token)                          │
│     │  ├─ Call icloud-shared-album.getImages()             │
│     │  ├─ Parse response into AlbumData                     │
│     │  └─ Return with metadata + photos                     │
│     ├─ determineImagesToDownload()                          │
│     │  ├─ Compare with cached photos                        │
│     │  └─ Return list of new/missing images                 │
│     ├─ downloadAndCacheImages()                             │
│     │  ├─ For each image:                                   │
│     │  │  ├─ downloadImage(url)                            │
│     │  │  │  ├─ HTTP GET with axios                        │
│     │  │  │  ├─ Retry 3 times with backoff                 │
│     │  │  │  └─ Return Buffer or null                      │
│     │  │  └─ cacheManager.cacheImage()                     │
│     │  └─ Log success/fail counts                          │
│     └─ cacheManager.saveAlbumMetadata()                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Usage Examples

### Basic Usage
```typescript
import { icloudService } from './icloudService';

const albumData = await icloudService.syncAlbumWithCache('B0z5qAGN1JIFd3y');

if (albumData) {
  console.log(`Album: ${albumData.metadata.streamName}`);
  console.log(`Photos: ${albumData.photos.length}`);
}
```

### Custom Configuration
```typescript
import { createiCloudService } from './icloudService';

const customService = createiCloudService({
  imageDownloadTimeout: 5000,
  retryAttempts: 2,
  downloadDelay: 500,
});

const albumData = await customService.syncAlbumWithCache(token);
```

### Error Handling
```typescript
const albumData = await icloudService.syncAlbumWithCache(token);

if (!albumData) {
  // Check if stale cache exists
  const cached = await cacheManager.loadAlbumMetadata(token);
  if (cached) {
    console.log('Using stale cache');
  } else {
    console.error('No data available');
  }
}
```

## API Reference

### Class: `iCloudService`

#### Constructor
```typescript
constructor(config?: Partial<iCloudServiceConfig>, cacheManager?: CacheManager)
```

#### Methods

##### `fetchAlbumFromiCloud(token: string): Promise<AlbumData | null>`
Fetch album metadata and photos directly from iCloud.

**Parameters:**
- `token` - 15-character alphanumeric album token

**Returns:**
- `AlbumData` object with metadata and photos
- `null` if fetch fails or timeout occurs

**Throws:** Never - errors are logged and null is returned

##### `downloadImage(imageUrl: string): Promise<Buffer | null>`
Download image from iCloud CDN with retry logic.

**Parameters:**
- `imageUrl` - Full URL to the image

**Returns:**
- `Buffer` with image data
- `null` if download fails after all retries

**Retry Logic:**
- 3 attempts with exponential backoff (1s, 2s, 4s)
- Extra backoff for rate limiting (429/503)

##### `syncAlbumWithCache(token: string): Promise<AlbumData | null>`
Main orchestration function - cache-first synchronization.

**Parameters:**
- `token` - 15-character alphanumeric album token

**Returns:**
- `AlbumData` object from cache or iCloud
- `null` if both cache and iCloud fetch fail

**Flow:**
1. Check cache staleness (24 hours default)
2. Return cache immediately if fresh
3. Fetch from iCloud if stale/missing
4. Download only new/missing images
5. Update cache and return data

## Configuration

```typescript
interface iCloudServiceConfig {
  imageDownloadTimeout: number;  // 10000ms default
  retryAttempts: number;         // 3 default
  retryBackoff: number[];        // [1000, 2000, 4000] default
  albumFetchTimeout: number;     // 15000ms default
  downloadDelay: number;         // 1000ms default
  userAgent: string;             // Chrome UA default
}
```

## Integration Points

### With Cache Manager
```typescript
// Load metadata
const cachedData = await cacheManager.loadAlbumMetadata(token);

// Check staleness
const isStale = await cacheManager.isAlbumCacheStale(token);

// Cache image
await cacheManager.cacheImage(token, imageUrl, buffer);

// Save metadata
await cacheManager.saveAlbumMetadata(token, albumData);
```

### With API Routes
```typescript
router.get('/api/album/:token/images', async (req, res) => {
  const albumData = await icloudService.syncAlbumWithCache(req.params.token);

  if (!albumData) {
    return res.status(404).json({ error: 'Album not found' });
  }

  return res.json({
    images: albumData.photos,
    metadata: albumData.metadata,
  });
});
```

## Performance

| Operation | First Visit | Cached Visit | Stale Cache |
|-----------|-------------|--------------|-------------|
| Album fetch | 2-5 seconds | <100ms | <100ms |
| Image download | 1-5 minutes | 0 seconds | Background |
| API response | Slow | Instant | Instant |

## Error Codes & Messages

All errors are logged with structured context:

```typescript
// Network timeout
Logger.error('Failed to download image after all retries', error, {
  imageUrl,
  retries: 3,
});

// Album fetch failure
Logger.error('Failed to fetch album from iCloud', error, { token });

// Cache write failure
Logger.error('Failed to save album metadata', error, { token });
```

## Testing

Run tests:
```bash
npm test
```

View test file:
```
src/backend/__tests__/icloudService.test.ts
```

Run demo:
```bash
ts-node examples/icloud-service-demo.ts
```

## Dependencies

- `axios` - HTTP client for downloads
- `icloud-shared-album` - iCloud API integration
- `fs/promises` - File system operations (via CacheManager)
- `crypto` - Hashing for filenames (via CacheManager)

## Export Structure

```typescript
// Singleton instance (recommended)
import { icloudService } from './icloudService';

// Factory function
import { createiCloudService } from './icloudService';

// Class (for advanced use)
import { iCloudService } from './icloudService';

// Cache manager
import { cacheManager } from './cacheManager';
```

## Logging

All operations are logged with structured context:

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "INFO",
  "message": "Album synced successfully",
  "token": "B0z5qAGN1JIFd3y",
  "photoCount": 42,
  "downloadedImages": 5
}
```

## Troubleshooting

### Album fetch returns null
- Verify token is valid 15-character format
- Check iCloud servers are accessible
- Review logs for specific error messages

### Images fail to download
- Check iCloud CDN URLs are accessible
- Increase timeout if network is slow
- Review rate limiting configuration

### Cache not working
- Verify cache directory exists and is writable
- Check staleness threshold configuration
- Review cache manager logs

## Next Steps

See [docs/icloud-service-usage.md](../../docs/icloud-service-usage.md) for comprehensive usage guide.
