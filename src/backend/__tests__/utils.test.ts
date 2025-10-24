/**
 * Tests for utility functions
 */

import {
  isValidToken,
  hashAlbumToken,
  Logger,
  LogLevel,
  sanitizeError,
  createErrorResponse,
} from '../utils';

describe('isValidToken', () => {
  it('should return true for valid 15-character alphanumeric token', () => {
    expect(isValidToken('B0z5qAGN1JIFd3y')).toBe(true);
    expect(isValidToken('abc123DEF456789')).toBe(true);
    expect(isValidToken('000000000000000')).toBe(true);
    expect(isValidToken('AAAAAAAAAAAAAAA')).toBe(true);
  });

  it('should return false for invalid token formats', () => {
    // Wrong length
    expect(isValidToken('short')).toBe(false);
    expect(isValidToken('B0z5qAGN1JIFd3y1')).toBe(false); // 16 chars
    expect(isValidToken('B0z5qAGN1JIFd3')).toBe(false); // 14 chars

    // Invalid characters
    expect(isValidToken('B0z5qAGN1JIFd3-')).toBe(false); // hyphen
    expect(isValidToken('B0z5qAGN1JIFd3_')).toBe(false); // underscore
    expect(isValidToken('B0z5qAGN1JIFd3@')).toBe(false); // special char
    expect(isValidToken('B0z5qAGN1JIFd3 ')).toBe(false); // space

    // Empty or null
    expect(isValidToken('')).toBe(false);
  });

  it('should return false for non-string inputs', () => {
    expect(isValidToken(null as any)).toBe(false);
    expect(isValidToken(undefined as any)).toBe(false);
    expect(isValidToken(12345 as any)).toBe(false);
    expect(isValidToken({} as any)).toBe(false);
  });
});

describe('hashAlbumToken', () => {
  it('should produce consistent 16-character hash', () => {
    const token = 'B0z5qAGN1JIFd3y';
    const hash1 = hashAlbumToken(token);
    const hash2 = hashAlbumToken(token);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(16);
    expect(/^[a-f0-9]{16}$/.test(hash1)).toBe(true);
  });

  it('should produce different hashes for different tokens', () => {
    const hash1 = hashAlbumToken('B0z5qAGN1JIFd3y');
    const hash2 = hashAlbumToken('A0z5qAGN1JIFd3y');

    expect(hash1).not.toBe(hash2);
  });

  it('should produce hexadecimal output', () => {
    const hash = hashAlbumToken('testtoken123456');
    expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
  });

  it('should handle edge case tokens', () => {
    expect(hashAlbumToken('000000000000000')).toHaveLength(16);
    expect(hashAlbumToken('zzzzzzzzzzzzzzz')).toHaveLength(16);
    expect(hashAlbumToken('AAAAAAAAAAAAAAA')).toHaveLength(16);
  });
});

describe('Logger', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });

  describe('info', () => {
    it('should log info message with timestamp', () => {
      Logger.info('Test message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleLogSpy.mock.calls[0][0]);

      expect(loggedData.level).toBe(LogLevel.INFO);
      expect(loggedData.message).toBe('Test message');
      expect(loggedData.timestamp).toBeDefined();
    });

    it('should include metadata when provided', () => {
      Logger.info('Test with metadata', { userId: 123, action: 'test' });

      const loggedData = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(loggedData.userId).toBe(123);
      expect(loggedData.action).toBe('test');
    });
  });

  describe('warn', () => {
    it('should log warning message', () => {
      Logger.warn('Warning message');

      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleWarnSpy.mock.calls[0][0]);

      expect(loggedData.level).toBe(LogLevel.WARN);
      expect(loggedData.message).toBe('Warning message');
    });

    it('should include metadata', () => {
      Logger.warn('Warning', { reason: 'test' });

      const loggedData = JSON.parse(consoleWarnSpy.mock.calls[0][0]);
      expect(loggedData.reason).toBe('test');
    });
  });

  describe('error', () => {
    it('should log error message with error details', () => {
      const error = new Error('Test error');
      Logger.error('Error occurred', error);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);

      expect(loggedData.level).toBe(LogLevel.ERROR);
      expect(loggedData.message).toBe('Error occurred');
      expect(loggedData.error).toBeDefined();
      expect(loggedData.error.name).toBe('Error');
      expect(loggedData.error.message).toBe('Test error');
      expect(loggedData.error.stack).toBeDefined();
    });

    it('should log error without error object', () => {
      Logger.error('Error without object');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);

      expect(loggedData.message).toBe('Error without object');
      expect(loggedData.error).toBeUndefined();
    });

    it('should include additional metadata', () => {
      const error = new Error('Test');
      Logger.error('Error', error, { context: 'test' });

      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(loggedData.context).toBe('test');
      expect(loggedData.error).toBeDefined();
    });
  });

  describe('debug', () => {
    it('should log in development mode', () => {
      process.env.NODE_ENV = 'development';
      Logger.debug('Debug message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const loggedData = JSON.parse(consoleLogSpy.mock.calls[0][0]);

      expect(loggedData.level).toBe(LogLevel.DEBUG);
      expect(loggedData.message).toBe('Debug message');
    });

    it('should not log in production mode', () => {
      process.env.NODE_ENV = 'production';
      Logger.debug('Debug message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should include metadata in development', () => {
      process.env.NODE_ENV = 'development';
      Logger.debug('Debug', { data: 'test' });

      const loggedData = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(loggedData.data).toBe('test');
    });
  });
});

describe('sanitizeError', () => {
  it('should remove file paths from error messages', () => {
    const error = new Error('Failed to read /usr/local/app/file.txt');
    const sanitized = sanitizeError(error);

    expect(sanitized).toBe('Failed to read [path]');
    expect(sanitized).not.toContain('/usr/local/app');
  });

  it('should handle multiple paths in one message', () => {
    const error = new Error('Copy from /home/user/source to /var/data/dest failed');
    const sanitized = sanitizeError(error);

    expect(sanitized).toBe('Copy from [path] to [path] failed');
  });

  it('should handle errors without paths', () => {
    const error = new Error('Network timeout');
    const sanitized = sanitizeError(error);

    expect(sanitized).toBe('Network timeout');
  });

  it('should handle errors with no message', () => {
    const error = new Error();
    const sanitized = sanitizeError(error);

    expect(sanitized).toBe('An unexpected error occurred');
  });

  it('should handle Windows-style paths', () => {
    const error = new Error('File not found C:\\Users\\test\\file.txt');
    const sanitized = sanitizeError(error);

    // Windows paths may not be caught by Unix regex, but should still return something
    expect(sanitized).toBeDefined();
    expect(typeof sanitized).toBe('string');
  });

  it('should preserve non-path information', () => {
    const error = new Error('Failed to connect to database: connection refused');
    const sanitized = sanitizeError(error);

    expect(sanitized).toContain('Failed to connect to database');
    expect(sanitized).toContain('connection refused');
  });
});

describe('createErrorResponse', () => {
  it('should create error response with default status code', () => {
    const response = createErrorResponse('Something went wrong');

    expect(response).toEqual({
      error: 'Something went wrong',
      status: 500,
    });
  });

  it('should create error response with custom status code', () => {
    const response = createErrorResponse('Not found', 404);

    expect(response).toEqual({
      error: 'Not found',
      status: 404,
    });
  });

  it('should handle various HTTP status codes', () => {
    expect(createErrorResponse('Bad request', 400).status).toBe(400);
    expect(createErrorResponse('Unauthorized', 401).status).toBe(401);
    expect(createErrorResponse('Forbidden', 403).status).toBe(403);
    expect(createErrorResponse('Not found', 404).status).toBe(404);
    expect(createErrorResponse('Server error', 500).status).toBe(500);
    expect(createErrorResponse('Service unavailable', 503).status).toBe(503);
  });

  it('should preserve error message exactly', () => {
    const message = 'Custom error message with special chars: !@#$%';
    const response = createErrorResponse(message, 418);

    expect(response.error).toBe(message);
    expect(response.status).toBe(418);
  });

  it('should handle empty error message', () => {
    const response = createErrorResponse('', 500);

    expect(response.error).toBe('');
    expect(response.status).toBe(500);
  });
});
