# Pildiraam - iCloud Shared Album Digital Photo Frame

A TypeScript Node.js web service that creates a beautiful digital photo frame slideshow from iCloud shared albums. Display your favorite memories on older devices (iPad Mini 1st gen with iOS 9) with a cache-first architecture for instant slideshow start.

## Features

- **Cache-First Architecture**: Instant display from disk cache, background refresh for updates
- **CORS Solution**: Server downloads and serves all images (no direct iCloud CDN access)
- **Progressive Loading**: Display starts immediately with first 20 images, loads more in background
- **Image Randomization**: Fisher-Yates shuffle with seeded random for consistent results
- **Advanced Overlays**: Optional clock and weather overlays
- **ES5 Compatible**: Works on iOS 9 Safari and all modern browsers
- **Performance Optimized**: <100ms response for cached albums, rolling window memory management
- **Security Hardened**: Rate limiting, token validation, security headers, non-root user in Docker
- **Production Ready**: Multi-stage Docker build, health checks, comprehensive logging

## Architecture

```
Browser → Express.js Server → Disk Cache
                   ↓
            iCloud API (background)

Cache-First Flow:
1. GET /album/:token → Serve HTML immediately
2. GET /api/album/:token/images → Return cached images instantly
3. If stale (>24h) → Background sync with iCloud
4. GET /api/album/:token/image/:filename → Serve from disk (1 year cache)
```

## Installation

### Prerequisites

- Node.js 20+ (for local development)
- Docker & Docker Compose (for containerized deployment)
- iCloud shared album token (15-character alphanumeric string)

### Local Development

```bash
# Clone repository
git clone https://github.com/yourusername/pildiraam.git
cd pildiraam

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Start development server
npm run dev
# Server runs on http://localhost:3000
```

### Using Docker

```bash
# Build image
docker build -t pildiraam:latest .

# Run container
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -v pildiraam-cache:/app/cache/images \
  pildiraam:latest

# Or use Docker Compose
docker-compose up -d
```

## Configuration

Create `.env` file with the following variables:

```bash
# Server
PORT=3000                              # Default: 3000
NODE_ENV=production                    # production | development

# Cache
IMAGE_CACHE_DIR=./cache/images         # Cache directory path
CACHE_CLEANUP_INTERVAL_MINUTES=1440    # Cleanup old albums after 24h

# Rate Limiting
RATE_LIMIT_WINDOW_MS=300000            # 5 minutes
RATE_LIMIT_MAX=100                     # 100 requests per window

# Optional
WEATHER_API_KEY=                       # For weather overlay (stub for now)
ALLOWED_IPS=                           # Comma-separated IP allowlist
```

## Usage

### Basic Slideshow

Visit: `http://localhost:3000/album/YOUR_ALBUM_TOKEN`

Replace `YOUR_ALBUM_TOKEN` with a valid 15-character iCloud shared album token.

### URL Parameters

```
?interval=15        # Slideshow interval in seconds (5-300, default: 15)
?fullscreen=true    # Start in fullscreen mode
?weather=true       # Enable weather overlay (top-right)
?clock=true         # Enable clock overlay (top-left)
```

Example: `http://localhost:3000/album/B0z5qAGN1JIFd3y?interval=10&clock=true&weather=true`

### Controls

- **Arrow Keys**: Navigate previous/next image
- **Space Bar**: Pause/resume slideshow
- **F Key**: Toggle fullscreen
- **ESC Key**: Exit fullscreen
- **Double Tap**: Toggle fullscreen (mobile)
- **Swipe Left/Right**: Navigate images (mobile)

## API Endpoints

### Album Interface
- `GET /album/:token` - Serve slideshow HTML interface

### API
- `GET /api/album/:token/metadata` - Get album metadata
- `GET /api/album/:token/images?page=0&limit=20` - Get paginated images
- `GET /api/album/:token/image/:filename` - Serve cached image
- `GET /api/album/:token/weather` - Get weather data
- `POST /api/album/:token/refresh` - Trigger manual refresh
- `GET /api/health` - Service health check

### Landing Page
- `GET /` - Landing page with instructions

## Testing

```bash
npm test              # Run all tests once
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Generate coverage report
```

Coverage: **78.08%** overall with modules at 87-100%

## Building

```bash
npm run build        # Compile TypeScript to dist/
npm run lint         # Type check without emitting
npm start            # Run compiled production build
```

## Performance

| Operation | First Visit | Cached Visit | Stale Cache |
|-----------|-------------|--------------|-------------|
| Album metadata | 2-5 seconds | <100ms | <100ms |
| Image download | 1-5 minutes (100 photos) | 0 seconds | Background |
| Display ready | After download | Immediate | Immediate |

## Deployment

### DigitalOcean Droplet ($5/month)

```bash
# SSH into droplet
ssh root@your-droplet-ip

# Install Docker
curl -fsSL https://get.docker.com | sh

# Deploy
git clone https://github.com/yourusername/pildiraam.git
cd pildiraam
docker-compose up -d
```

### Railway.app

1. Connect GitHub repository
2. Set environment variables (PORT=3000)
3. Build command: `npm run build`
4. Start command: `node dist/backend/index.js`

### Fly.io

```bash
flyctl launch
flyctl deploy
```

See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed deployment guides.

## Security

- **Rate Limiting**: 100 requests per 5 minutes per IP
- **Token Validation**: 15-character alphanumeric tokens only
- **Security Headers**: Helmet.js enabled
- **Non-Root User**: Docker runs as `pildiraam` user
- **CORS**: Properly configured for same-origin image serving
- **Error Messages**: System details hidden from users

## Troubleshooting

### Album shows "Loading..." forever

1. Check token format (15-character alphanumeric)
2. Verify iCloud album is public
3. Check server logs: `docker logs pildiraam`

### Images not loading

1. Check cache directory permissions
2. Verify disk space available
3. Check browser console for error messages

### High memory usage

Rolling window ensures only ~20 images in memory. If still high:
1. Check cache directory size: `du -sh cache/images/`
2. Manual cleanup: `rm -rf cache/images/*`
3. Restart container: `docker-compose restart`

## Architecture & Design

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed architecture information.

## API Documentation

See [API.md](docs/API.md) for comprehensive API endpoint documentation.

## Contributing

Contributions welcome! Please:

1. Fork repository
2. Create feature branch
3. Run tests: `npm test`
4. Submit pull request

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Built with TypeScript, Express.js, and Node.js
- Uses [icloud-shared-album](https://www.npmjs.com/package/icloud-shared-album) npm package
- Inspired by digital photo frame projects
- Optimized for low-resource cloud hosting

## Support

For issues and questions:
- Check [Troubleshooting](#troubleshooting) section
- Review [docs/](docs/) directory
- Open GitHub issue with details

---

**Last Updated**: October 2025
**Version**: 1.0.0
**Node Version**: 20+
