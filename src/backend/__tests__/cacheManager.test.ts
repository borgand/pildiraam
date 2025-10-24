/**
 * Tests for CacheManager
 */

import { CacheManager, imageUrlToHash, isValidImageFile } from '../cacheManager';
import { AlbumData } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('CacheManager', () => {
  let cacheManager: CacheManager;
  let testCacheDir: string;

  beforeEach(async () => {
    // Create unique test cache directory for each test
    testCacheDir = path.join(__dirname, `../../..`, `.test-cache-${Date.now()}`);
    cacheManager = new CacheManager(testCacheDir);
  });

  afterEach(async () => {
    // Clean up test cache directory
    try {
      await fs.rm(testCacheDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('ensureCacheDir', () => {
    it('should create cache directory if it does not exist', async () => {
      await cacheManager.ensureCacheDir();

      const stats = await fs.stat(testCacheDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should not throw if directory already exists', async () => {
      await cacheManager.ensureCacheDir();
      await expect(cacheManager.ensureCacheDir()).resolves.not.toThrow();
    });

    it('should create nested directories', async () => {
      const nestedPath = path.join(testCacheDir, 'nested', 'deep');
      const nestedCacheManager = new CacheManager(nestedPath);

      await nestedCacheManager.ensureCacheDir();

      const stats = await fs.stat(nestedPath);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('getAlbumCacheDir', () => {
    it('should return hashed directory path for token', () => {
      const token = 'B0z5qAGN1JIFd3y';
      const albumDir = cacheManager.getAlbumCacheDir(token);

      expect(albumDir).toContain(testCacheDir);
      expect(albumDir.split(path.sep).pop()).toHaveLength(16); // Hash length
    });

    it('should return consistent path for same token', () => {
      const token = 'B0z5qAGN1JIFd3y';
      const dir1 = cacheManager.getAlbumCacheDir(token);
      const dir2 = cacheManager.getAlbumCacheDir(token);

      expect(dir1).toBe(dir2);
    });

    it('should return different paths for different tokens', () => {
      const dir1 = cacheManager.getAlbumCacheDir('token1234567890a');
      const dir2 = cacheManager.getAlbumCacheDir('token1234567890b');

      expect(dir1).not.toBe(dir2);
    });
  });

  describe('saveAlbumMetadata and loadAlbumMetadata', () => {
    const mockAlbumData: AlbumData = {
      metadata: {
        streamName: 'Test Album',
        userFirstName: 'John',
        userLastName: 'Doe',
        streamCtag: 'ctag123',
        itemsReturned: 5,
      },
      photos: [
        {
          id: 'photo1',
          url: 'https://example.com/photo1.jpg',
          derivatives: {
            '2048': {
              checksum: 'abc123',
              fileSize: 1024000,
              width: 2048,
              height: 1536,
              url: 'https://example.com/photo1-2048.jpg',
            },
          },
          dateCreated: '2024-01-01T00:00:00Z',
          caption: 'Test photo',
        },
      ],
      lastSynced: new Date('2024-01-01T12:00:00Z'),
    };

    it('should save and load album metadata', async () => {
      const token = 'savetoken123456';
      await cacheManager.saveAlbumMetadata(token, mockAlbumData);

      const loaded = await cacheManager.loadAlbumMetadata(token);

      expect(loaded).not.toBeNull();
      expect(loaded!.metadata.streamName).toBe('Test Album');
      expect(loaded!.photos.length).toBe(1);
      expect(loaded!.photos[0].id).toBe('photo1');
      expect(loaded!.lastSynced).toBeInstanceOf(Date);
    });

    it('should return null for non-existent metadata', async () => {
      const loaded = await cacheManager.loadAlbumMetadata('nonexistent12345');
      expect(loaded).toBeNull();
    });

    it('should preserve all photo properties', async () => {
      const token = 'phototoken12345';
      await cacheManager.saveAlbumMetadata(token, mockAlbumData);

      const loaded = await cacheManager.loadAlbumMetadata(token);
      const photo = loaded!.photos[0];

      expect(photo.url).toBe('https://example.com/photo1.jpg');
      expect(photo.dateCreated).toBe('2024-01-01T00:00:00Z');
      expect(photo.caption).toBe('Test photo');
      expect(photo.derivatives['2048']).toBeDefined();
      expect(photo.derivatives['2048'].width).toBe(2048);
    });

    it('should update lastAccessed timestamp on save', async () => {
      const token = 'accesstoken1234';
      const beforeSave = new Date();

      await cacheManager.saveAlbumMetadata(token, mockAlbumData);

      // Read metadata file directly to check lastAccessed
      const albumDir = cacheManager.getAlbumCacheDir(token);
      const metadataPath = path.join(albumDir, 'metadata.json');
      const content = await fs.readFile(metadataPath, 'utf-8');
      const cached = JSON.parse(content);

      const lastAccessed = new Date(cached.lastAccessed);
      expect(lastAccessed.getTime()).toBeGreaterThanOrEqual(beforeSave.getTime());
    });

    it('should handle albums with no photos', async () => {
      const emptyAlbumData: AlbumData = {
        metadata: mockAlbumData.metadata,
        photos: [],
        lastSynced: new Date(),
      };

      const token = 'emptyalbum12345';
      await cacheManager.saveAlbumMetadata(token, emptyAlbumData);

      const loaded = await cacheManager.loadAlbumMetadata(token);
      expect(loaded).not.toBeNull();
      expect(loaded!.photos).toEqual([]);
    });

    it('should handle corrupted metadata file', async () => {
      const token = 'corrupttoken123';
      const albumDir = cacheManager.getAlbumCacheDir(token);

      await fs.mkdir(albumDir, { recursive: true });
      await fs.writeFile(path.join(albumDir, 'metadata.json'), 'invalid json', 'utf-8');

      const loaded = await cacheManager.loadAlbumMetadata(token);
      expect(loaded).toBeNull();
    });
  });

  describe('cacheImage', () => {
    it('should cache image buffer with hashed filename', async () => {
      const token = 'imagetoken12345';
      const imageUrl = 'https://example.com/test.jpg';
      const imageBuffer = Buffer.from('fake image data');

      const filename = await cacheManager.cacheImage(token, imageUrl, imageBuffer);

      expect(filename).toMatch(/^[a-f0-9]{64}\.jpg$/);

      const imagePath = cacheManager.getImagePath(token, filename);
      const savedContent = await fs.readFile(imagePath);
      expect(savedContent.toString()).toBe('fake image data');
    });

    it('should not overwrite existing image', async () => {
      const token = 'imagetoken12345';
      const imageUrl = 'https://example.com/test.jpg';
      const buffer1 = Buffer.from('first data');
      const buffer2 = Buffer.from('second data');

      const filename1 = await cacheManager.cacheImage(token, imageUrl, buffer1);
      const filename2 = await cacheManager.cacheImage(token, imageUrl, buffer2);

      expect(filename1).toBe(filename2);

      // Should still have first data
      const imagePath = cacheManager.getImagePath(token, filename1);
      const content = await fs.readFile(imagePath);
      expect(content.toString()).toBe('first data');
    });

    it('should handle large image buffers', async () => {
      const token = 'largetoken12345';
      const imageUrl = 'https://example.com/large.jpg';
      const largeBuffer = Buffer.alloc(5 * 1024 * 1024); // 5MB

      const filename = await cacheManager.cacheImage(token, imageUrl, largeBuffer);

      const exists = await cacheManager.imageExists(token, filename);
      expect(exists).toBe(true);
    });
  });

  describe('imageExists', () => {
    it('should return true for existing image', async () => {
      const token = 'existstoken1234';
      const imageUrl = 'https://example.com/exists.jpg';
      const imageBuffer = Buffer.from('test');

      const filename = await cacheManager.cacheImage(token, imageUrl, imageBuffer);
      const exists = await cacheManager.imageExists(token, filename);

      expect(exists).toBe(true);
    });

    it('should return false for non-existent image', async () => {
      const exists = await cacheManager.imageExists('notoken123456', 'fake.jpg');
      expect(exists).toBe(false);
    });
  });

  describe('getImagePath', () => {
    it('should return correct filesystem path', () => {
      const token = 'pathtoken123456';
      const filename = 'abc123.jpg';

      const imagePath = cacheManager.getImagePath(token, filename);

      expect(imagePath).toContain(testCacheDir);
      expect(imagePath).toContain(filename);
    });
  });

  describe('isAlbumCacheStale', () => {
    it('should return true for non-existent cache', async () => {
      const isStale = await cacheManager.isAlbumCacheStale('notoken123456');
      expect(isStale).toBe(true);
    });

    it('should return false for fresh cache', async () => {
      const token = 'freshtoken12345';
      const albumData: AlbumData = {
        metadata: {
          streamName: 'Test',
          userFirstName: 'John',
          userLastName: 'Doe',
          streamCtag: 'ctag',
          itemsReturned: 0,
        },
        photos: [],
        lastSynced: new Date(), // Just now
      };

      await cacheManager.saveAlbumMetadata(token, albumData);

      const isStale = await cacheManager.isAlbumCacheStale(token, 1440); // 24 hours
      expect(isStale).toBe(false);
    });

    it('should return true for stale cache', async () => {
      const token = 'staletoken12345';
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 2); // 2 days ago

      const albumData: AlbumData = {
        metadata: {
          streamName: 'Test',
          userFirstName: 'John',
          userLastName: 'Doe',
          streamCtag: 'ctag',
          itemsReturned: 0,
        },
        photos: [],
        lastSynced: oldDate,
      };

      await cacheManager.saveAlbumMetadata(token, albumData);

      const isStale = await cacheManager.isAlbumCacheStale(token, 1440); // 24 hours
      expect(isStale).toBe(true);
    });

    it('should respect custom staleness threshold', async () => {
      const token = 'customtoken1234';
      const recentDate = new Date();
      recentDate.setMinutes(recentDate.getMinutes() - 10); // 10 minutes ago

      const albumData: AlbumData = {
        metadata: {
          streamName: 'Test',
          userFirstName: 'John',
          userLastName: 'Doe',
          streamCtag: 'ctag',
          itemsReturned: 0,
        },
        photos: [],
        lastSynced: recentDate,
      };

      await cacheManager.saveAlbumMetadata(token, albumData);

      // Should be fresh with 60 minute threshold
      expect(await cacheManager.isAlbumCacheStale(token, 60)).toBe(false);

      // Should be stale with 5 minute threshold
      expect(await cacheManager.isAlbumCacheStale(token, 5)).toBe(true);
    });
  });

  describe('updateAlbumAccessTime', () => {
    it('should update lastAccessed timestamp', async () => {
      const token = 'updatetoken1234';
      const oldDate = new Date('2024-01-01T00:00:00Z');

      const albumData: AlbumData = {
        metadata: {
          streamName: 'Test',
          userFirstName: 'John',
          userLastName: 'Doe',
          streamCtag: 'ctag',
          itemsReturned: 0,
        },
        photos: [],
        lastSynced: oldDate,
      };

      await cacheManager.saveAlbumMetadata(token, albumData);

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await cacheManager.updateAlbumAccessTime(token);

      // Read metadata file directly
      const albumDir = cacheManager.getAlbumCacheDir(token);
      const metadataPath = path.join(albumDir, 'metadata.json');
      const content = await fs.readFile(metadataPath, 'utf-8');
      const cached = JSON.parse(content);

      const lastAccessed = new Date(cached.lastAccessed);
      expect(lastAccessed.getTime()).toBeGreaterThan(oldDate.getTime());
    });

    it('should not throw for non-existent album', async () => {
      await expect(
        cacheManager.updateAlbumAccessTime('notoken123456')
      ).resolves.not.toThrow();
    });
  });

  describe('deleteOldAlbums', () => {
    it('should delete albums older than threshold', async () => {
      const oldToken = 'oldtoken1234567';
      const recentToken = 'newtoken1234567';

      // Create old album
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 3); // 3 days ago

      const oldAlbum: AlbumData = {
        metadata: {
          streamName: 'Old',
          userFirstName: 'John',
          userLastName: 'Doe',
          streamCtag: 'ctag',
          itemsReturned: 0,
        },
        photos: [],
        lastSynced: oldDate,
      };

      await cacheManager.saveAlbumMetadata(oldToken, oldAlbum);

      // Create recent album
      const recentAlbum: AlbumData = {
        metadata: {
          streamName: 'Recent',
          userFirstName: 'Jane',
          userLastName: 'Doe',
          streamCtag: 'ctag',
          itemsReturned: 0,
        },
        photos: [],
        lastSynced: new Date(),
      };

      await cacheManager.saveAlbumMetadata(recentToken, recentAlbum);

      // Delete albums older than 2 days (2880 minutes)
      const deletedCount = await cacheManager.deleteOldAlbums(2880);

      expect(deletedCount).toBe(1);

      // Old album should be deleted
      const oldAlbumData = await cacheManager.loadAlbumMetadata(oldToken);
      expect(oldAlbumData).toBeNull();

      // Recent album should still exist
      const recentAlbumData = await cacheManager.loadAlbumMetadata(recentToken);
      expect(recentAlbumData).not.toBeNull();
    });

    it('should return 0 if no albums to delete', async () => {
      const deletedCount = await cacheManager.deleteOldAlbums(1440);
      expect(deletedCount).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      // Create album directory without metadata
      const albumDir = cacheManager.getAlbumCacheDir('brokentoken1234');
      await fs.mkdir(albumDir, { recursive: true });

      // Should not throw even with broken directory
      const deletedCount = await cacheManager.deleteOldAlbums(1440);
      expect(deletedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getAllCachedAlbums', () => {
    it('should return empty array for empty cache', async () => {
      await cacheManager.ensureCacheDir();
      const albums = await cacheManager.getAllCachedAlbums();
      expect(albums).toEqual([]);
    });

    it('should return list of cached album hashes', async () => {
      const token1 = 'album1234567890';
      const token2 = 'album2345678901';

      const albumData: AlbumData = {
        metadata: {
          streamName: 'Test',
          userFirstName: 'John',
          userLastName: 'Doe',
          streamCtag: 'ctag',
          itemsReturned: 0,
        },
        photos: [],
        lastSynced: new Date(),
      };

      await cacheManager.saveAlbumMetadata(token1, albumData);
      await cacheManager.saveAlbumMetadata(token2, albumData);

      const albums = await cacheManager.getAllCachedAlbums();

      expect(albums.length).toBe(2);
      expect(albums.every((hash) => hash.length === 16)).toBe(true);
    });
  });
});

describe('imageUrlToHash', () => {
  it('should produce 64-character hash with .jpg extension', () => {
    const url = 'https://example.com/photo.jpg';
    const hash = imageUrlToHash(url);

    expect(hash).toMatch(/^[a-f0-9]{64}\.jpg$/);
  });

  it('should produce consistent hash for same URL', () => {
    const url = 'https://example.com/photo.jpg';
    const hash1 = imageUrlToHash(url);
    const hash2 = imageUrlToHash(url);

    expect(hash1).toBe(hash2);
  });

  it('should produce different hashes for different URLs', () => {
    const hash1 = imageUrlToHash('https://example.com/photo1.jpg');
    const hash2 = imageUrlToHash('https://example.com/photo2.jpg');

    expect(hash1).not.toBe(hash2);
  });
});

describe('isValidImageFile', () => {
  it('should return true for valid image filename', () => {
    const validHash = 'a'.repeat(64) + '.jpg';
    expect(isValidImageFile(validHash)).toBe(true);
  });

  it('should return false for invalid formats', () => {
    expect(isValidImageFile('short.jpg')).toBe(false);
    expect(isValidImageFile('a'.repeat(63) + '.jpg')).toBe(false); // 63 chars
    expect(isValidImageFile('a'.repeat(65) + '.jpg')).toBe(false); // 65 chars
    expect(isValidImageFile('a'.repeat(64) + '.png')).toBe(false); // Wrong extension
    expect(isValidImageFile('a'.repeat(64))).toBe(false); // No extension
    expect(isValidImageFile('AAAA'.repeat(16) + '.jpg')).toBe(false); // Uppercase
    expect(isValidImageFile('g'.repeat(64) + '.jpg')).toBe(false); // Invalid hex char
  });
});
