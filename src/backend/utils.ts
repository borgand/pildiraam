/**
 * Utility functions for Pildiraam application
 */

import * as crypto from 'crypto';

/**
 * Validates album token format (15-character alphanumeric)
 * @param token - The album token to validate
 * @returns True if token is valid, false otherwise
 */
export function isValidToken(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }
  const tokenRegex = /^[a-zA-Z0-9]{15}$/;
  return tokenRegex.test(token);
}

/**
 * Hashes album token to create directory name using SHA-256
 * Returns first 16 characters of the hash for filesystem compatibility
 * @param token - The album token to hash
 * @returns 16-character hash string
 */
export function hashAlbumToken(token: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(token);
  const fullHash = hash.digest('hex');
  return fullHash.substring(0, 16);
}

/**
 * Logger levels
 */
export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG',
}

/**
 * Structured logger with timestamp
 */
export class Logger {
  /**
   * Logs an info message
   * @param message - The message to log
   * @param meta - Optional metadata object
   */
  static info(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, meta);
  }

  /**
   * Logs a warning message
   * @param message - The message to log
   * @param meta - Optional metadata object
   */
  static warn(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, meta);
  }

  /**
   * Logs an error message
   * @param message - The message to log
   * @param error - Optional error object
   * @param meta - Optional metadata object
   */
  static error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    const errorMeta = error
      ? {
          ...meta,
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
          },
        }
      : meta;
    this.log(LogLevel.ERROR, message, errorMeta);
  }

  /**
   * Logs a debug message
   * @param message - The message to log
   * @param meta - Optional metadata object
   */
  static debug(message: string, meta?: Record<string, unknown>): void {
    if (process.env.NODE_ENV === 'development') {
      this.log(LogLevel.DEBUG, message, meta);
    }
  }

  /**
   * Core logging function
   * @param level - Log level
   * @param message - The message to log
   * @param meta - Optional metadata object
   */
  private static log(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>
  ): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...meta,
    };

    const output = JSON.stringify(logEntry);

    switch (level) {
      case LogLevel.ERROR:
        console.error(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      case LogLevel.DEBUG:
      case LogLevel.INFO:
      default:
        console.log(output);
        break;
    }
  }
}

/**
 * Sanitizes error messages for public consumption
 * Removes sensitive system information
 * @param error - The error to sanitize
 * @returns Sanitized error message
 */
export function sanitizeError(error: Error): string {
  // Don't expose internal paths, stack traces, or system details
  const message = error.message || 'An unexpected error occurred';

  // Remove file paths
  const sanitized = message.replace(/\/[\w\/.-]+/g, '[path]');

  return sanitized;
}

/**
 * Creates a safe error response object
 * @param message - User-friendly error message
 * @param statusCode - HTTP status code
 * @returns Error response object
 */
export function createErrorResponse(
  message: string,
  statusCode: number = 500
): { error: string; status: number } {
  return {
    error: message,
    status: statusCode,
  };
}
