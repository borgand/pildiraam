# Pildiraam API Documentation

Complete API reference for Pildiraam digital photo frame service.

## Base URL

```
http://localhost:3000     (development)
https://pildiraam.example.com  (production)
```

## Authentication

No API key required. Token-based access via URL path:
```
/album/:token
/api/album/:token/*
```

Token format: 15-character alphanumeric string (e.g., `B0z5qAGN1JIFd3y`)

Invalid tokens return `404 Not Found`.

## Response Format

All API responses are JSON:

```json
{
  "data": { /* response data */ },
  "error": null,
  "status": 200
}
```

Error responses:
```json
{
  "error": "Album not found",
  "status": 404
}
```

## Endpoints

### Landing Page

#### GET /

Get landing page with configuration form.

**Response**: HTML page with instructions

### Album Interface

#### GET /album/:token

Serve slideshow HTML interface.

**Parameters**:
- `:token` - Album token (required)

**Query Parameters**:
- `interval` - Slideshow interval in seconds (5-300, default: 15)
- `fullscreen` - Start in fullscreen mode (true/false)
- `weather` - Show weather overlay (true/false)
- `clock` - Show clock overlay (true/false)

**Response**: HTML5 page with embedded JavaScript config

**Example**:
```bash
curl http://localhost:3000/album/B0z5qAGN1JIFd3y?interval=10&clock=true
```

### Album Metadata

#### GET /api/album/:token/metadata

Get album metadata (stream name, owner, photo count).

**Parameters**:
- `:token` - Album token (required)

**Response**:
```json
{
  "metadata": {
    "streamName": "Vacation 2025",
    "userFirstName": "John",
    "userLastName": "Doe",
    "streamCtag": "abc123",
    "itemsReturned": 42
  },
  "lastSynced": "2025-10-24T14:30:00Z"
}
```

**Status Codes**:
- `200` - Success
- `404` - Album not found
- `500` - Server error

**Example**:
```bash
curl http://localhost:3000/api/album/B0z5qAGN1JIFd3y/metadata
```

### Album Images (Paginated)

#### GET /api/album/:token/images

Get paginated list of album images.

**Parameters**:
- `:token` - Album token (required)

**Query Parameters**:
- `page` - Page number (default: 0, first page)
- `limit` - Items per page (default: 20, max: 100)

**Response**:
```json
{
  "images": [
    {
      "id": "image-123",
      "url": "/api/album/B0z5qAGN1JIFd3y/image/abc123def456.jpg",
      "filename": "abc123def456.jpg",
      "dateCreated": "2025-10-20T10:30:00Z",
      "caption": "Beautiful sunset"
    },
    {
      "id": "image-124",
      "url": "/api/album/B0z5qAGN1JIFd3y/image/xyz789uvw456.jpg",
      "filename": "xyz789uvw456.jpg",
      "dateCreated": "2025-10-20T11:00:00Z",
      "caption": null
    }
  ],
  "metadata": {
    "total": 42,
    "page": 0,
    "limit": 20,
    "hasMore": true,
    "servedFromDiskCache": true,
    "needsBackgroundRefresh": false
  },
  "lastSynced": "2025-10-24T14:30:00Z"
}
```

**Cache Behavior**:
- `servedFromDiskCache: true` - Served from cached data (instant)
- `needsBackgroundRefresh: true` - Cache is stale, background refresh triggered
- First visit (cache miss) may take 2-5 minutes while images download
- Subsequent visits return instantly

**Status Codes**:
- `200` - Success
- `404` - Album not found
- `500` - Server error

**Example**:
```bash
# First page (20 images)
curl http://localhost:3000/api/album/B0z5qAGN1JIFd3y/images?page=0

# Second page
curl http://localhost:3000/api/album/B0z5qAGN1JIFd3y/images?page=1&limit=50
```

### Serve Cached Image

#### GET /api/album/:token/image/:filename

Serve image from disk cache.

**Parameters**:
- `:token` - Album token (required)
- `:filename` - Image filename hash (required)

**Response Headers**:
```
Content-Type: image/jpeg
Cache-Control: public, max-age=31536000, immutable
Content-Length: 52341
```

**Note**: Image filenames are content-addressed (SHA-256 hash), enabling 1-year browser caching.

**Status Codes**:
- `200` - Success
- `404` - Image not found
- `304` - Not modified (browser cache)

**Example**:
```bash
curl -i http://localhost:3000/api/album/B0z5qAGN1JIFd3y/image/abc123def456789xyz.jpg
```

### Weather Overlay

#### GET /api/album/:token/weather

Get weather data for overlay display.

**Parameters**:
- `:token` - Album token (required)

**Response**:
```json
{
  "temp": 22,
  "condition": "Partly Cloudy",
  "icon": "☁️",
  "location": "London, UK",
  "humidity": 65,
  "windSpeed": 12
}
```

**Status Codes**:
- `200` - Success (mock data if no API key configured)
- `503` - Weather service unavailable
- `404` - Album not found

**Note**: Currently returns mock data. Set `WEATHER_API_KEY` to integrate with real weather API.

**Example**:
```bash
curl http://localhost:3000/api/album/B0z5qAGN1JIFd3y/weather
```

### Manual Refresh

#### POST /api/album/:token/refresh

Trigger immediate album refresh from iCloud.

**Parameters**:
- `:token` - Album token (required)

**Request Body**: Empty

**Response**:
```json
{
  "status": "accepted",
  "message": "Album refresh started",
  "token": "B0z5qAGN1JIFd3y"
}
```

**Notes**:
- Returns immediately with status 202 Accepted
- Refresh happens in background
- Does not block API response
- Bypass cache staleness check

**Status Codes**:
- `202` - Refresh accepted
- `404` - Album not found
- `500` - Server error

**Example**:
```bash
curl -X POST http://localhost:3000/api/album/B0z5qAGN1JIFd3y/refresh
```

### Health Check

#### GET /api/health

Service health check endpoint.

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2025-10-24T14:35:22.101Z",
  "uptime": 3600,
  "version": "1.0.0",
  "environment": "production",
  "cache": {
    "directory": "/app/cache/images",
    "status": "ok"
  }
}
```

**Status Codes**:
- `200` - Healthy
- `503` - Degraded (cache directory issues)

**Example**:
```bash
curl http://localhost:3000/api/health
```

## Rate Limiting

Rate limiting: **100 requests per 5 minutes per IP**

Response headers include:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1634987040
```

When limit exceeded:
```json
{
  "error": "Too many requests, please try again later.",
  "status": 429
}
```

## Error Responses

### 400 Bad Request

Invalid parameters or malformed request.

```json
{
  "error": "Invalid page number",
  "status": 400
}
```

### 404 Not Found

Album or resource not found.

```json
{
  "error": "Album not found",
  "status": 404
}
```

### 429 Too Many Requests

Rate limit exceeded.

```json
{
  "error": "Too many requests, please try again later.",
  "status": 429
}
```

### 500 Internal Server Error

Server error (no sensitive details exposed).

```json
{
  "error": "Internal server error",
  "status": 500
}
```

### 503 Service Unavailable

Service temporarily unavailable.

```json
{
  "error": "Service temporarily unavailable",
  "status": 503
}
```

## Cache Behavior

### First Visit (Cache Miss)
1. GET /album/:token returns HTML immediately
2. GET /api/album/:token/images triggers iCloud fetch
3. Images download from iCloud CDN (1-5 minutes for 100 images)
4. Images stored in disk cache
5. Response returns after cache complete

### Subsequent Visits (Cache Hit)
1. GET /album/:token returns HTML immediately
2. GET /api/album/:token/images returns cached images instantly (<100ms)
3. `servedFromDiskCache: true` indicates cached response
4. `needsBackgroundRefresh: false` if cache fresh (synced <24h ago)

### Cache Refresh
- Automatic refresh if `lastSynced > 24h`
- Manual refresh via POST /api/album/:token/refresh
- Background refresh doesn't block response
- Frontend notified via `needsBackgroundRefresh` flag

## Pagination Examples

### Get first 20 images
```bash
curl http://localhost:3000/api/album/B0z5qAGN1JIFd3y/images?page=0&limit=20
```

### Get next 20 images
```bash
curl http://localhost:3000/api/album/B0z5qAGN1JIFd3y/images?page=1&limit=20
```

### Get 50 images per page
```bash
curl http://localhost:3000/api/album/B0z5qAGN1JIFd3y/images?page=0&limit=50
```

## Common Use Cases

### Display slideshow in browser
```bash
# Navigate to URL
http://localhost:3000/album/B0z5qAGN1JIFd3y?interval=15&clock=true
```

### Fetch all images programmatically
```bash
# Get first page
curl http://localhost:3000/api/album/B0z5qAGN1JIFd3y/images?page=0

# If hasMore=true, fetch next pages
curl http://localhost:3000/api/album/B0z5qAGN1JIFd3y/images?page=1
curl http://localhost:3000/api/album/B0z5qAGN1JIFd3y/images?page=2
```

### Monitor service health
```bash
# Health check every 30 seconds
watch -n 30 'curl http://localhost:3000/api/health'
```

### Force refresh of stale album
```bash
curl -X POST http://localhost:3000/api/album/B0z5qAGN1JIFd3y/refresh
```

## Changelog

### v1.0.0 - October 2025
- Initial release
- Cache-first architecture
- Full API implementation
- Progressive image loading
- Docker support
- Comprehensive documentation
