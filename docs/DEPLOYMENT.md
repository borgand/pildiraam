# Deployment Guide

Complete step-by-step guide for deploying Pildiraam to production environments.

## Target Platforms

Pildiraam is optimized for cost-effective cloud hosting:
- **DigitalOcean Droplets** ($4-5/month)
- **Railway.app** ($5/month)
- **Fly.io** (free tier + $0.30/month for persistent volume)
- **AWS Lightsail** ($3.50/month)

## Prerequisites

- Docker & Docker Compose installed
- Domain name (optional, use IP initially)
- SSH access to server
- 256MB RAM minimum, 0.25 CPU minimum

## DigitalOcean Droplet Deployment

### 1. Create Droplet

```bash
# Via CLI (requires doctl installed)
doctl compute droplet create pildiraam \
  --region sfo3 \
  --size s-1vcpu-512mb-10gb \
  --image ubuntu-22-04-x64

# Or via web console:
# - Size: $4/month (512MB RAM, 10GB SSD)
# - OS: Ubuntu 22.04 LTS
# - Region: Closest to your location
```

### 2. Connect & Setup

```bash
# SSH into droplet
ssh root@YOUR_DROPLET_IP

# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
```

### 3. Deploy Application

```bash
# Clone repository
cd /opt
git clone https://github.com/yourusername/pildiraam.git
cd pildiraam

# Create production environment file
cat > .env << 'ENVEOF'
PORT=3000
NODE_ENV=production
IMAGE_CACHE_DIR=/opt/pildiraam/cache/images
CACHE_CLEANUP_INTERVAL_MINUTES=1440
RATE_LIMIT_MAX=100
ENVEOF

# Create cache directory
mkdir -p cache/images
chown 1001:1001 cache/images

# Build and start
docker-compose up -d

# Check logs
docker-compose logs -f pildiraam
```

### 4. Configure Reverse Proxy (Nginx)

```bash
# Install Nginx
apt install -y nginx

# Create config
cat > /etc/nginx/sites-available/pildiraam << 'NGINXEOF'
server {
    listen 80;
    server_name _;
    client_max_body_size 100M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINXEOF

# Enable site
ln -s /etc/nginx/sites-available/pildiraam /etc/nginx/sites-enabled/

# Test and start
nginx -t
systemctl start nginx
systemctl enable nginx
```

### 5. Setup SSL with Let's Encrypt

```bash
# Install Certbot
apt install -y certbot python3-certbot-nginx

# Generate certificate (replace with your domain)
certbot certonly --standalone \
  -d pildiraam.example.com \
  -n --agree-tos --email admin@example.com

# Update Nginx config to use HTTPS
cat > /etc/nginx/sites-available/pildiraam << 'NGINXEOF'
server {
    listen 80;
    server_name pildiraam.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name pildiraam.example.com;

    ssl_certificate /etc/letsencrypt/live/pildiraam.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pildiraam.example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINXEOF

# Reload Nginx
systemctl reload nginx

# Setup auto-renewal
systemctl enable certbot.timer
```

## Railway.app Deployment

### 1. Connect GitHub

1. Log in to Railway.app
2. Connect GitHub account
3. Select pildiraam repository
4. Grant necessary permissions

### 2. Configure Environment

Railway → Settings → Environment:

```
PORT=3000
NODE_ENV=production
IMAGE_CACHE_DIR=/app/cache/images
CACHE_CLEANUP_INTERVAL_MINUTES=1440
```

### 3. Configure Build

Railway → Build:
- Build command: `npm run build`
- Start command: `node dist/backend/index.js`

### 4. Configure Volumes

Railway → Volumes:
- Mount path: `/app/cache/images`
- Creates persistent volume for cache

### 5. Deploy

Push to main branch or click Deploy in Railway console.

## Fly.io Deployment

### 1. Install Fly CLI

```bash
curl -L https://fly.io/install.sh | sh
```

### 2. Create App

```bash
cd pildiraam
fly launch

# Select:
# - Region: closest to users
# - Keep Dockerfile as is
# - Create Postgres: No (not needed)
```

### 3. Add Persistent Volume

```bash
fly volumes create pildiraam_cache --size 10

# Update fly.toml:
[[mounts]]
source = "pildiraam_cache"
destination = "/app/cache/images"
```

### 4. Deploy

```bash
fly deploy
```

## Monitoring & Maintenance

### Health Checks

```bash
# Monitor health endpoint
watch -n 30 'curl -s https://pildiraam.example.com/api/health | jq'

# Setup uptime monitoring with:
# - Uptime Robot (free)
# - Datadog
# - New Relic
# - AWS CloudWatch
```

### Logs

```bash
# Docker Compose
docker-compose logs -f --tail=100

# Systemd journal
journalctl -u docker -f

# Docker logs
docker logs -f pildiraam
```

### Cache Management

```bash
# Check cache size
du -sh cache/images/

# Manual cleanup (if needed)
docker exec pildiraam rm -rf cache/images/*

# Automated cleanup via cron
# Runs daily at 2 AM
0 2 * * * cd /opt/pildiraam && docker-compose exec pildiraam node -e "require('./dist/backend/cacheManager').cacheManager.deleteOldAlbums(1440)"
```

### Database Backups

Cache is stored on disk - backup entire `/opt/pildiraam/cache/images` directory:

```bash
# Weekly backup to S3
0 3 * * 0 aws s3 sync /opt/pildiraam/cache/images s3://my-bucket/pildiraam-cache/
```

## Scaling

### Single Server (Current)
- Suitable for: < 500 active albums, < 100K monthly requests
- Resource: 512MB RAM, 0.25 CPU, 10GB disk

### Load Balancing

For multiple instances:

```yaml
# docker-compose.yml with load balancer
services:
  pildiraam-1:
    build: .
    volumes:
      - shared-cache:/app/cache/images
  
  pildiraam-2:
    build: .
    volumes:
      - shared-cache:/app/cache/images

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf

volumes:
  shared-cache:
    driver: local
```

### Use S3 for Images (Large Scale)

1. Install AWS SDK in icloudService
2. Instead of disk cache, upload images to S3
3. Serve from S3 via CDN (CloudFront)
4. Cache metadata in Redis

## Troubleshooting

### High Memory Usage

```bash
# Check process memory
docker stats pildiraam

# Restart to clear memory
docker-compose restart pildiraam

# Increase limit in docker-compose.yml
# See rolling window in slides how.js
```

### Disk Space Issues

```bash
# Check disk usage
df -h

# Clean old albums
docker exec pildiraam node -e "
const { cacheManager } = require('./dist/backend/cacheManager');
cacheManager.deleteOldAlbums(1440).then(deleted => {
  console.log('Deleted albums:', deleted);
});
"

# Or manually
rm -rf cache/images/*
```

### Album Not Loading

1. Verify token format (15-char alphanumeric)
2. Check iCloud album is public
3. Review server logs: `docker-compose logs`
4. Test with curl: `curl http://localhost:3000/api/health`

### Slow Image Loading (First Visit)

This is expected:
- First visit downloads all images from iCloud (2-5 minutes for 100 photos)
- Subsequent visits instant (<100ms)
- Use background refresh for updates

## Performance Tuning

### Nginx Caching

```nginx
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=pildiraam:10m;

location ~* ^/api/album/.*/image/ {
    proxy_cache pildiraam;
    proxy_cache_valid 200 365d;
    add_header X-Cache-Status $upstream_cache_status;
}
```

### Enable Compression

```nginx
gzip on;
gzip_types text/plain application/json;
gzip_min_length 1000;
```

### CDN Integration

Point domain to Cloudflare:
1. Add domain to Cloudflare
2. Update nameservers
3. Cloudflare → Cache Rules: Cache everything
4. Cloudflare → Page Rules: Cache Level = Cache Everything

## Disaster Recovery

### Backup Cache

```bash
# Daily backup to USB/S3
0 2 * * * tar czf /backup/pildiraam-$(date +%Y%m%d).tar.gz cache/images/
```

### Restore Cache

```bash
# Extract backup
tar xzf /backup/pildiraam-20251024.tar.gz -C /opt/pildiraam/
docker-compose restart pildiraam
```

### Rebuild from Scratch

```bash
# Remove old container
docker-compose down -v

# Rebuild image
docker-compose build --no-cache

# Start fresh
docker-compose up -d
```

## Cost Optimization

### Reduce Compute
- Use 256MB RAM tier (minimum)
- Monitor CPU - may be able to downsize

### Reduce Storage
- Set aggressive cleanup interval: `CACHE_CLEANUP_INTERVAL_MINUTES=480` (8 hours)
- Delete albums automatically

### Reduce Bandwidth
- Use CDN for static files
- Enable gzip compression
- Add caching headers

## References

- [Docker Deployment Best Practices](https://docs.docker.com/build/building/best-practices/)
- [Nginx Reverse Proxy Setup](https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/)
- [Let's Encrypt SSL Setup](https://certbot.eff.org/)
- [DigitalOcean App Platform](https://www.digitalocean.com/products/app-platform/)
- [Railway Deployments](https://docs.railway.app/deploy/railwayfile)
- [Fly.io Documentation](https://fly.io/docs/)
