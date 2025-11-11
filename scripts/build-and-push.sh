#!/bin/bash

# Pildiraam - Build and Push to Docker Hub
# Manual build script for pushing to private Docker Hub repository
#
# Usage: ./scripts/build-and-push.sh [VERSION]
# Example: ./scripts/build-and-push.sh 1.0.0
# Default (no version): builds as 'latest'

set -e

# Configuration
DOCKER_USERNAME="${DOCKER_USERNAME:?Error: DOCKER_USERNAME environment variable not set}"
IMAGE_NAME="pildiraam"
REGISTRY="docker.io"
FULL_IMAGE="${REGISTRY}/${DOCKER_USERNAME}/${IMAGE_NAME}"

# Get version from argument or use 'latest'
VERSION=${1:-latest}

echo "=========================================="
echo "Pildiraam Docker Build & Push"
echo "=========================================="
echo "Registry: ${REGISTRY}"
echo "Image: ${FULL_IMAGE}"
echo "Version: ${VERSION}"
echo "=========================================="
echo ""

# Check if docker is running
if ! docker ps > /dev/null 2>&1; then
    echo "❌ Error: Docker daemon is not running"
    exit 1
fi

# Check if user is logged in to Docker Hub
if ! docker info | grep -q "Username"; then
    echo "⚠️  Warning: You may not be logged into Docker Hub"
    echo "Run: docker login"
    echo ""
fi

# Build the image
echo "📦 Building Docker image..."
docker buildx build --platform linux/amd64 -t "${FULL_IMAGE}:${VERSION}" -t "${FULL_IMAGE}:latest" .

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Build successful"
echo ""

# Push the image
echo "🚀 Pushing to Docker Hub..."
docker push "${FULL_IMAGE}:${VERSION}"

if [ $? -ne 0 ]; then
    echo "❌ Push failed"
    exit 1
fi

echo "✅ Pushed ${FULL_IMAGE}:${VERSION}"

# Also push latest tag if version is specified
if [ "${VERSION}" != "latest" ]; then
    docker push "${FULL_IMAGE}:latest"
    echo "✅ Pushed ${FULL_IMAGE}:latest"
fi

echo ""
echo "=========================================="
echo "✅ Build and push complete!"
echo "=========================================="
echo ""
echo "To deploy on Unraid:"
echo "  1. SSH into Unraid"
echo "  2. cd /mnt/user/appdata/pildiraam"
echo "  3. docker-compose pull"
echo "  4. docker-compose restart pildiraam"
echo ""
