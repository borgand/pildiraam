# Pildiraam - Quick Start Guide

## Installation & Development

```bash
# Clone and setup
cd pildiraam2
npm install

# Development
npm run dev              # Start with live reload
npm test                # Run tests
npm run test:coverage   # Show coverage report
npm run build           # Build for production
npm start               # Run production build
```

## Using Docker

```bash
# Build image
docker build -t pildiraam:latest .

# Run container
docker run -p 3000:3000 pildiraam:latest

# Or use Docker Compose
docker-compose up -d
docker logs -f pildiraam
docker-compose down
```

## Access the Service

**Development**: `http://localhost:3000/album/ALBUM_TOKEN`

Replace `ALBUM_TOKEN` with a valid 15-character iCloud shared album token.

### URL Parameters

```
?interval=15        # Slideshow interval (5-300 seconds)
?clock=true        # Show clock overlay
?weather=true      # Show weather overlay  
?fullscreen=true   # Start in fullscreen
```

Example:
```
http://localhost:3000/album/B0z5qAGN1JIFd3y?interval=10&clock=true
```

## API Endpoints

```bash
# Health check
curl http://localhost:3000/api/health | jq

# Album metadata
curl http://localhost:3000/api/album/TOKEN/metadata | jq

# Images list (paginated)
curl http://localhost:3000/api/album/TOKEN/images?page=0 | jq

# Trigger refresh
curl -X POST http://localhost:3000/api/album/TOKEN/refresh | jq
```

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report

# Specific test file
npm test -- utils.test.ts
npm test -- --testNamePattern="token validation"
```

## Building for Production

```bash
npm run build         # Compile TypeScript
npm start            # Run compiled code
npm run lint         # Type check
```

## Deployment

### DigitalOcean (5 min setup)
```bash
# SSH into droplet
ssh root@YOUR_IP

# Install Docker
curl -fsSL https://get.docker.com | sh

# Clone and deploy
git clone <repo> && cd pildiraam2
docker-compose up -d
```

See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for complete guides.

## Configuration

Create `.env` file:

```
PORT=3000
NODE_ENV=production
IMAGE_CACHE_DIR=./cache/images
CACHE_CLEANUP_INTERVAL_MINUTES=1440
RATE_LIMIT_MAX=100
```

See [README.md](README.md) for all options.

## Troubleshooting

### "Album not found" or "Loading..." forever
1. Verify token is 15 alphanumeric characters
2. Check iCloud album is public
3. Check server logs: `npm run dev` or `docker logs pildiraam`

### High memory usage
- Check cache size: `du -sh cache/images/`
- Restart: `docker-compose restart pildiraam`
- Clear cache: `rm -rf cache/images/*`

### Server won't start
1. Check port not in use: `lsof -i :3000`
2. Check permissions: `ls -la cache/`
3. Check .env file is valid

## Useful Commands

```bash
# Clean up
rm -rf node_modules dist coverage
npm install
npm run build

# Monitoring
docker ps                           # List containers
docker logs -f pildiraam          # Watch logs
docker exec pildiraam npm test    # Run tests in container

# Git
git log --oneline | head -20      # Recent commits
git status                         # Current status
git diff                          # Changes

# Docker
docker build --no-cache .         # Rebuild image
docker image ls                   # List images
docker system prune              # Clean up
```

## Documentation

- [README.md](README.md) - Project overview
- [API.md](docs/API.md) - API documentation
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - Design decisions
- [DEPLOYMENT.md](docs/DEPLOYMENT.md) - Deployment guides
- [SECURITY.md](docs/SECURITY.md) - Security checklist
- [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) - Complete summary

## Key Files

- `src/backend/index.ts` - Express.js server
- `src/backend/icloudService.ts` - iCloud integration
- `src/backend/cacheManager.ts` - Disk cache
- `public/slideshow.js` - Frontend slideshow (927 lines)
- `public/slideshow.html` - HTML template
- `Dockerfile` - Production container
- `docker-compose.yml` - Container orchestration

## Performance Tips

1. **Use Docker Compose** for local testing
2. **Monitor cache size**: `du -sh cache/images/`
3. **Check response times**: `curl -w "@curl-format.txt" http://localhost:3000/api/health`
4. **Watch logs**: `npm run dev` or `docker logs -f`

## Support

- GitHub Issues: Report bugs
- Review docs for troubleshooting
- Check test cases for usage examples
- See security.md for security concerns

---

**Status**: Production Ready ✅
**Version**: 1.0.0
**Last Updated**: October 2025
