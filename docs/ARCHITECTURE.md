# Pildiraam Architecture & Design

## Overview

Pildiraam is a cache-first digital photo frame service that solves the CORS problem by storing all images server-side. This document explains the architecture, design decisions, and performance optimizations.

## Problem Statement

### CORS Restriction
Web browsers cannot load images directly from iCloud CDN due to CORS (Cross-Origin Resource Sharing) restrictions. The iCloud CDN doesn't include `Access-Control-Allow-Origin` headers needed for cross-origin requests.

### Solution: Server-Side Caching
Instead of fetching images directly from iCloud CDN in the browser, the server downloads and caches all images. The frontend then loads images from the same origin (the Pildiraam server).

## Cache-First Architecture

### Request Flow Diagram

```
User Visit:
├─ GET /album/:token
│  └─ Return HTML immediately (no wait)
│
├─ GET /api/album/:token/images?page=0
│  ├─ Check disk cache
│  │  ├─ Cache Hit (fresh) → Return cached images instantly
│  │  └─ Cache Miss/Stale → Fetch from iCloud (slow)
│  │
│  └─ Response includes:
│     ├─ Image list
│     ├─ servedFromDiskCache: boolean
│     └─ needsBackgroundRefresh: boolean
│
└─ GET /api/album/:token/image/:filename
   └─ Serve from disk cache (ultra-fast, 1 year browser cache)

Background (if needed):
├─ Check iCloud for new images
├─ Download new images to cache
└─ Update metadata.json
```

## Component Architecture

### Backend Components

```
Express Server
├── Routes
│  ├── albumRoutes.ts (slideshow HTML, images, refresh)
│  └── healthRoutes.ts (health check)
├── Middleware
│  └── tokenValidator.ts (token format validation)
├── Services
│  ├── icloudService.ts (fetch, download, sync)
│  └── cacheManager.ts (disk cache operations)
├── Utilities
│  ├── config.ts (environment config)
│  └── utils.ts (logging, hashing, validation)
└── Data Models (types.ts)
```

### Frontend Components

```
slideshow.html
├── Configuration (from server-rendered script tag)
├── Loading UI
├── Image container
├── Control panel (prev/next/pause/fullscreen)
└── Overlays
   ├── Clock
   ├── Weather
   └── Notifications

slideshow.js
├── API integration (fetch images from server)
├── Image preloading (rolling window)
├── Slideshow logic (auto-advance, navigation)
├── Gesture handling (touch, keyboard)
├── Fullscreen management
└── Periodic refresh check
```

## Disk Cache Structure

```
cache/
└── images/
    └── {album_hash}/              (16-char SHA-256 of token)
        ├── metadata.json          (album info + photo list)
        ├── {image_hash}.jpg       (64-char SHA-256 filename)
        ├── {image_hash}.jpg
        └── ...
```

### metadata.json Format

```json
{
  "metadata": {
    "streamName": "Vacation 2025",
    "userFirstName": "John",
    "userLastName": "Doe",
    "streamCtag": "abc123",
    "itemsReturned": 42
  },
  "photos": [
    {
      "id": "image-123",
      "url": "https://...(iCloud CDN URL)...",
      "derivatives": { ... },
      "dateCreated": "2025-10-20T10:30:00Z",
      "caption": "Beautiful sunset"
    }
  ],
  "lastSynced": "2025-10-24T14:30:00Z",
  "lastAccessed": "2025-10-24T15:00:00Z"
}
```

## Performance Optimizations

### 1. Cache-First Strategy
- **Instant Display**: Cached albums display in <100ms
- **No Blocking**: HTML response immediate, images from cache
- **Background Refresh**: Updates happen without blocking user

### 2. Rolling Window Image Preloading
- Frontend preloads 20 images total
- Loads 5 images before current + current + next 14 images
- Removes images >5 positions away to free memory
- Automatic pagination when approaching end of batch

### 3. Content-Addressed Image Files
- Image filenames are SHA-256 hashes of URL
- Same image across albums maps to same filename (deduplication)
- Enables 1-year browser caching (immutable content)

### 4. Pagination
- Images served in pages of 20 (configurable)
- Deterministic ordering (by dateCreated)
- Frontend requests paginated data
- Reduces initial response size

### 5. Compression
- Docker image optimized with multi-stage build
- Production dependencies only (no dev deps)
- Alpine Linux base image (5MB vs 200MB+)
- Final image: ~150MB with Node.js runtime

## Caching Strategy Details

### Cache Freshness Check
```typescript
// Check if cache needs refresh
if (lastSynced > 24h ago) {
  needsBackgroundRefresh = true
}
```

### Background Refresh
1. Response returns immediately with `needsBackgroundRefresh: true`
2. Frontend receives flag, schedules refresh check
3. Server fetches new images in background
4. Only new/missing images downloaded (smart dedup)
5. Frontend reloads image list after refresh

### Cache Cleanup
- Albums not accessed for 24h deleted
- Removed during periodic cleanup (configurable)
- Updates lastAccessed on each request

## Security Considerations

### Token Validation
- 15-character alphanumeric format
- Validated on every request
- Invalid tokens return 404 (no info leakage)

### Rate Limiting
- 100 requests per 5 minutes per IP
- Prevents abuse and DOS attacks
- Configurable per environment

### Security Headers
- Helmet.js for XSS, clickjacking, etc.
- CORS properly configured
- X-Powered-By hidden

### File Permissions
- Images stored with restricted permissions
- Cache directory writable by application user
- Docker runs non-root user (pildiraam)

### Error Handling
- No system details in error messages
- Logging separate from user responses
- Stack traces not exposed to browser

## Scalability Considerations

### Horizontal Scaling
- Stateless server design (cache on disk)
- Multiple instances share cache volume
- Load balancer in front
- No session affinity required

### Resource Usage
- Memory: ~50MB base + ~10MB per 100 images in memory
- Disk: 1-2MB per 100 images (JPEG compressed)
- CPU: Minimal (mostly I/O bound)

### Optimization Tips
1. Use CDN for static files (styles, JS)
2. Implement Redis for cache metadata (optional)
3. Use S3-compatible storage for images (scale horizontally)
4. Add reverse proxy caching (nginx)

## Technology Choices

### Node.js + TypeScript
- **Why**: Single language (JS/TS), excellent async I/O
- **Trade-off**: Smaller default memory vs Python/Go

### Express.js
- **Why**: Lightweight, excellent middleware system
- **Trade-off**: Minimal framework vs Rails/Django (which are heavier)

### Vanilla JavaScript (Frontend)
- **Why**: Zero dependencies, iOS 9 compatible
- **Trade-off**: More code vs React (but smaller bundle)

### Alpine Docker
- **Why**: Minimal base image (~5MB)
- **Trade-off**: No package manager vs Ubuntu (~150MB base)

## Data Flow Examples

### First-Time Album Access
```
1. User visits /album/B0z5qAGN1JIFd3y
2. Server checks cache - MISS
3. Serve HTML immediately
4. Frontend requests /api/album/.../images
5. Server fetches from iCloud (SLOW - 2-5 min)
6. Server caches images to disk
7. Frontend receives images, displays slideshow
```

### Subsequent Album Access
```
1. User visits /album/B0z5qAGN1JIFd3y
2. Server checks cache - HIT
3. Serve HTML immediately
4. Frontend requests /api/album/.../images
5. Server returns cached images instantly (<100ms)
6. Frontend receives images, displays slideshow immediately
```

### Stale Cache Refresh
```
1. Cache is 25+ hours old
2. Frontend requests images
3. Server returns cached images immediately
4. Server marks needsBackgroundRefresh = true
5. Frontend receives flag, knows refresh needed
6. Server fetches new images in background
7. Frontend checks for updates in 24h
8. If new images found, page reloaded
```

## Testing Strategy

### Unit Tests
- Cache operations (save/load/delete)
- Token validation
- Utility functions
- Coverage: 78% overall

### Integration Tests
- Full request/response cycles
- API endpoints with mocked iCloud
- Cache behavior verification

### Manual Testing
- Real iCloud album token
- Network failure scenarios
- Edge cases (empty album, single image)

## Monitoring & Logging

### Health Check Endpoint
```
GET /api/health → {status, uptime, cache_status}
```

### Logging Levels
- INFO: Normal operations
- WARN: Potentially problematic
- ERROR: Failures requiring attention
- DEBUG: Development debugging

### Metrics to Monitor
- Request latency (should be <100ms for cached)
- Cache hit rate (should approach 100%)
- Error rate (should be <1%)
- Disk usage (grows with cached images)

## Future Enhancements

1. **Redis Caching**: Cache metadata in Redis for multi-instance deployments
2. **S3 Storage**: Store images in S3 for unlimited scalability
3. **CDN Integration**: Serve images through CloudFront/Cloudflare
4. **Weather API**: Integrate real weather data (currently mock)
5. **Analytics**: Track user engagement, popular albums
6. **Multi-Album Support**: Display multiple albums in rotation
7. **Admin Dashboard**: Monitor cache, clear albums, view stats

## References

- [Cache Busting Strategy](https://www.smashingmagazine.com/2015/12/clearing-assets-cache-tips-tricks/)
- [Content Addressing](https://en.wikipedia.org/wiki/Content-addressable_storage)
- [Rolling Window Algorithm](https://en.wikipedia.org/wiki/Sliding_window_protocol)
