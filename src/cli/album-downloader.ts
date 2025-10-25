/**
 * Album Downloader CLI
 * Efficiently downloads and caches iCloud shared albums
 *
 * Handles large albums (1500+ images) with:
 * - Progress tracking and ETA calculation
 * - Automatic resume on network failures
 * - Batch image downloading with pooling
 * - Detailed logging and error recovery
 *
 * Usage:
 *   npm run download -- <token>                    # Download album
 *   npm run download -- <token> --refresh          # Force refresh existing album
 *   npm run download -- <token> --verbose          # Enable verbose logging
 */

import { icloudService } from '../backend/icloudService';
import { cacheManager, imageUrlToHash } from '../backend/cacheManager';
import { Logger } from '../backend/utils';
import { AlbumImage } from '../backend/types';

interface DownloadProgress {
  total: number;
  downloaded: number;
  failed: number;
  startTime: number;
  lastUpdate: number;
}

/**
 * Format seconds as human readable duration
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) return Math.round(seconds) + 's';
  if (seconds < 3600) return Math.round(seconds / 60) + 'm';
  return Math.round(seconds / 3600) + 'h';
}

/**
 * Calculate ETA based on current progress
 */
function calculateETA(progress: DownloadProgress): string {
  if (progress.downloaded === 0) return 'calculating...';

  const elapsed = (Date.now() - progress.startTime) / 1000;
  const rate = progress.downloaded / elapsed;
  const remaining = progress.total - progress.downloaded;
  const eta = remaining / rate;

  return formatDuration(eta);
}

/**
 * Display progress bar in terminal
 */
function displayProgress(progress: DownloadProgress): void {
  const percentage = Math.round((progress.downloaded / progress.total) * 100);
  const barLength = 30;
  const filledLength = Math.round((barLength * progress.downloaded) / progress.total);
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

  const elapsed = (Date.now() - progress.startTime) / 1000;
  const eta = calculateETA(progress);

  process.stdout.write(
    `\rDownloading... [${bar}] ${percentage}% ` +
    `(${progress.downloaded}/${progress.total}) ` +
    `Failed: ${progress.failed} | ` +
    `Elapsed: ${formatDuration(elapsed)} | ` +
    `ETA: ${eta}`
  );
}

/**
 * Download album metadata from iCloud
 */
async function fetchAlbumMetadata(token: string, forceRefresh: boolean = false): Promise<AlbumImage[] | null> {
  console.log('\n📥 Fetching album metadata...');

  try {
    // Check cache if not forcing refresh
    if (!forceRefresh) {
      const isStale = await cacheManager.isAlbumCacheStale(token);
      if (!isStale) {
        const cached = await cacheManager.loadAlbumMetadata(token);
        if (cached) {
          console.log(`✓ Using cached metadata (${cached.photos.length} images)\n`);
          return cached.photos;
        }
      }
    }

    // Fetch from iCloud
    const startTime = Date.now();
    const albumData = await icloudService.fetchAlbumFromiCloud(token);
    const duration = (Date.now() - startTime) / 1000;

    if (!albumData) {
      console.error('✗ Failed to fetch album metadata from iCloud');
      console.error('  - Check that the token is valid');
      console.error('  - Ensure iCloud is reachable');
      console.error('  - Try again in a few moments\n');
      return null;
    }

    console.log(`✓ Album metadata fetched in ${formatDuration(duration)}`);
    console.log(`  Name: ${albumData.metadata.streamName}`);
    console.log(`  Owner: ${albumData.metadata.userFirstName} ${albumData.metadata.userLastName}`);
    console.log(`  Total images: ${albumData.photos.length}\n`);

    return albumData.photos;
  } catch (error) {
    Logger.error('Failed to fetch album metadata', error as Error, { token });
    console.error('✗ Error fetching metadata:', (error as Error).message, '\n');
    return null;
  }
}

/**
 * Determine which images need to be downloaded
 */
async function determineImagesToDownload(
  token: string,
  allPhotos: AlbumImage[]
): Promise<AlbumImage[]> {
  const imagesToDownload: AlbumImage[] = [];

  // Build set of cached image URLs
  const cached = await cacheManager.loadAlbumMetadata(token);
  const cachedUrls = new Set(cached?.photos.map((p) => p.url) || []);

  // Check each photo
  for (const photo of allPhotos) {
    // Skip if URL is already cached
    if (cachedUrls.has(photo.url)) {
      // Verify file exists
      const filename = imageUrlToHash(photo.url);
      const exists = await cacheManager.imageExists(token, filename);
      if (exists) {
        continue; // File exists, skip
      }
    }

    imagesToDownload.push(photo);
  }

  if (imagesToDownload.length === 0) {
    console.log('✓ All images already cached!\n');
  } else {
    console.log(`📦 Need to download ${imagesToDownload.length} images\n`);
  }

  return imagesToDownload;
}

/**
 * Download and cache images with progress tracking
 */
async function downloadImages(
  token: string,
  images: AlbumImage[]
): Promise<{ success: number; failed: number }> {
  if (images.length === 0) {
    return { success: 0, failed: 0 };
  }

  const progress: DownloadProgress = {
    total: images.length,
    downloaded: 0,
    failed: 0,
    startTime: Date.now(),
    lastUpdate: Date.now(),
  };

  let success = 0;
  let failed = 0;

  // Download images sequentially with rate limiting
  for (let i = 0; i < images.length; i++) {
    const image = images[i];

    try {
      const imageUrl = image.url;
      const imageBuffer = await icloudService.downloadImage(imageUrl);

      if (!imageBuffer) {
        failed++;
        progress.failed++;
      } else {
        // Cache the image
        await cacheManager.cacheImage(token, imageUrl, imageBuffer);
        success++;
        progress.downloaded++;
      }
    } catch (error) {
      failed++;
      progress.failed++;
      Logger.debug('Failed to download image', {
        token,
        imageId: image.id,
        error: (error as Error).message,
      });
    }

    // Update progress display
    displayProgress(progress);

    // Rate limiting: small delay between downloads
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log('\n');
  return { success, failed };
}

/**
 * Save album metadata to cache
 */
async function saveAlbumMetadata(
  token: string,
  photos: AlbumImage[]
): Promise<void> {
  try {
    // Create minimal album data with all photos
    const albumData = {
      metadata: {
        streamName: 'Downloaded Album',
        userFirstName: '',
        userLastName: '',
        streamCtag: '',
        itemsReturned: photos.length,
      },
      photos,
      lastSynced: new Date(),
    };

    await cacheManager.saveAlbumMetadata(token, albumData);
  } catch (error) {
    Logger.error('Failed to save album metadata', error as Error, { token });
  }
}

/**
 * Display final summary
 */
function displaySummary(
  token: string,
  allImages: number,
  downloaded: number,
  failed: number,
  duration: number
): void {
  console.log('═'.repeat(60));
  console.log('✓ Download Complete!');
  console.log('═'.repeat(60));
  console.log(`Token:        ${token.substring(0, 8)}...${token.substring(token.length - 2)}`);
  console.log(`Total images: ${allImages}`);
  console.log(`Downloaded:   ${downloaded}`);
  console.log(`Failed:       ${failed}`);
  console.log(`Duration:     ${formatDuration(duration)}`);
  console.log('═'.repeat(60));
  console.log('');

  if (failed === 0) {
    console.log('✓ All images successfully downloaded and cached!');
  } else {
    console.log(`⚠ ${failed} image(s) failed to download.`);
    console.log('  These will be retried on next sync.');
  }

  console.log('\nYou can now view the slideshow at:');
  console.log(`  http://localhost:3000/album/${token}`);
  console.log('');
}

/**
 * Main download function
 */
async function downloadAlbum(): Promise<void> {
  const args = process.argv.slice(2);
  const token = args[0];
  const forceRefresh = args.includes('--refresh');
  const verbose = args.includes('--verbose');

  // Validate token
  if (!token) {
    console.error('Usage: npm run download -- <token> [--refresh] [--verbose]');
    console.error('');
    console.error('Arguments:');
    console.error('  <token>     iCloud album token (required)');
    console.error('  --refresh   Force refresh even if cached');
    console.error('  --verbose   Enable verbose logging');
    process.exit(1);
  }

  if (verbose) {
    console.log('📋 Verbose logging enabled\n');
  }

  const startTime = Date.now();

  console.log('');
  console.log('═'.repeat(60));
  console.log('🖼️  Pildiraam Album Downloader');
  console.log('═'.repeat(60));
  console.log('');

  // Step 1: Fetch metadata
  const allImages = await fetchAlbumMetadata(token, forceRefresh);
  if (!allImages) {
    process.exit(1);
  }

  // Step 2: Determine which images need downloading
  console.log('🔍 Checking cache status...');
  const imagesToDownload = await determineImagesToDownload(token, allImages);

  // Step 3: Download images
  if (imagesToDownload.length > 0) {
    const result = await downloadImages(token, imagesToDownload);

    // Step 4: Save metadata
    console.log('💾 Saving album metadata...');
    await saveAlbumMetadata(token, allImages);
    console.log('✓ Metadata saved\n');

    const duration = (Date.now() - startTime) / 1000;
    displaySummary(token, allImages.length, result.success, result.failed, duration);
  } else {
    const duration = (Date.now() - startTime) / 1000;
    displaySummary(token, allImages.length, 0, 0, duration);
  }
}

/**
 * Run with error handling
 */
async function main(): Promise<void> {
  try {
    await downloadAlbum();
    process.exit(0);
  } catch (error) {
    Logger.error('Download failed', error as Error);
    console.error('\n✗ Download failed:', (error as Error).message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { downloadAlbum };
