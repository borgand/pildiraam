/**
 * Demo script for iCloudService
 * Shows how to use the iCloud service to fetch and cache albums
 */

import { icloudService, cacheManager } from '../src/backend/icloudService';
import { Logger } from '../src/backend/utils';

/**
 * Main demo function
 */
async function demo() {
  console.log('=== iCloud Service Demo ===\n');

  // Example album token - replace with a real one for testing
  const DEMO_TOKEN = 'B0z5qAGN1JIFd3y'; // Replace with your iCloud shared album token

  console.log('1. Checking cache status...');
  const isStale = await cacheManager.isAlbumCacheStale(DEMO_TOKEN);
  console.log(`   Cache is ${isStale ? 'stale/missing' : 'fresh'}\n`);

  console.log('2. Syncing album with cache...');
  console.log('   (This will be instant if cached, slow if first time)\n');

  const startTime = Date.now();
  const albumData = await icloudService.syncAlbumWithCache(DEMO_TOKEN);
  const duration = Date.now() - startTime;

  if (!albumData) {
    console.error('   ❌ Failed to sync album');
    console.error('   This is expected if the token is invalid or iCloud is unreachable\n');
    return;
  }

  console.log(`   ✓ Album synced successfully in ${duration}ms\n`);

  console.log('3. Album Information:');
  console.log(`   Name: ${albumData.metadata.streamName}`);
  console.log(`   Owner: ${albumData.metadata.userFirstName} ${albumData.metadata.userLastName}`);
  console.log(`   Photos: ${albumData.photos.length}`);
  console.log(`   Last Synced: ${albumData.lastSynced.toISOString()}\n`);

  console.log('4. Sample Photos:');
  const samplePhotos = albumData.photos.slice(0, 3);
  for (const photo of samplePhotos) {
    console.log(`   - Photo ID: ${photo.id}`);
    console.log(`     Date: ${photo.dateCreated || 'N/A'}`);
    console.log(`     Caption: ${photo.caption || 'N/A'}`);
    console.log(`     URL: ${photo.url.substring(0, 60)}...`);
    console.log(`     Derivatives: ${Object.keys(photo.derivatives).length} resolutions`);
    console.log('');
  }

  console.log('5. Cache Information:');
  const albumDir = cacheManager.getAlbumCacheDir(DEMO_TOKEN);
  console.log(`   Cache Directory: ${albumDir}`);

  // Check if first photo is cached
  if (albumData.photos.length > 0) {
    const firstPhoto = albumData.photos[0];
    const filename = require('../src/backend/cacheManager').imageUrlToHash(firstPhoto.url);
    const exists = await cacheManager.imageExists(DEMO_TOKEN, filename);
    console.log(`   First image cached: ${exists ? 'Yes' : 'No'}`);
  }
  console.log('');

  console.log('6. Testing cache-first behavior...');
  console.log('   Re-fetching album (should be instant from cache)...\n');

  const startTime2 = Date.now();
  const albumData2 = await icloudService.syncAlbumWithCache(DEMO_TOKEN);
  const duration2 = Date.now() - startTime2;

  if (albumData2) {
    console.log(`   ✓ Album fetched from cache in ${duration2}ms`);
    console.log(`   Cache hit: ${duration2 < 1000 ? 'YES' : 'NO (might be refreshing)'}\n`);
  }

  console.log('7. Cache Management:');
  const allAlbums = await cacheManager.getAllCachedAlbums();
  console.log(`   Cached albums: ${allAlbums.length}`);
  console.log('');

  console.log('=== Demo Complete ===\n');
  console.log('Key Takeaways:');
  console.log('  • First sync is slow (downloads all images)');
  console.log('  • Subsequent syncs are instant (served from cache)');
  console.log('  • Cache automatically refreshes when stale (>24 hours)');
  console.log('  • Failed downloads don\'t block the entire sync');
  console.log('  • All images served from server cache (no CORS issues)');
}

/**
 * Run demo with error handling
 */
async function main() {
  try {
    await demo();
  } catch (error) {
    Logger.error('Demo failed', error as Error);
    console.error('\nDemo failed:', (error as Error).message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { demo };
