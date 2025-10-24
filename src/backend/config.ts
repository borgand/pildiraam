/**
 * Configuration module for Pildiraam application
 * Loads and validates environment variables
 */

import * as dotenv from 'dotenv';
import { Config } from './types';

// Load environment variables from .env file
dotenv.config();

/**
 * Application configuration object
 */
export const config: Config = {
  // Server configuration
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',

  // Cache configuration
  IMAGE_CACHE_DIR: process.env.IMAGE_CACHE_DIR || './cache/images',
  CACHE_CLEANUP_INTERVAL_MINUTES: parseInt(
    process.env.CACHE_CLEANUP_INTERVAL_MINUTES || '1440',
    10
  ),

  // Optional services
  WEATHER_API_KEY: process.env.WEATHER_API_KEY,
  ALLOWED_IPS: process.env.ALLOWED_IPS,

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: parseInt(
    process.env.RATE_LIMIT_WINDOW_MS || '300000', // 5 minutes default
    10
  ),
  RATE_LIMIT_MAX: parseInt(
    process.env.RATE_LIMIT_MAX || '100',
    10
  ),
};

/**
 * Validates album token format (15-character alphanumeric)
 * @param token - The album token to validate
 * @returns True if token is valid, false otherwise
 */
export function isValidTokenFormat(token: string): boolean {
  const tokenRegex = /^[a-zA-Z0-9]{15}$/;
  return tokenRegex.test(token);
}

/**
 * Validates required configuration values
 * @throws Error if required configuration is missing or invalid
 */
export function validateConfig(): void {
  if (!config.PORT || config.PORT < 1 || config.PORT > 65535) {
    throw new Error('Invalid PORT configuration');
  }

  if (!config.NODE_ENV) {
    throw new Error('NODE_ENV is required');
  }

  if (!config.IMAGE_CACHE_DIR) {
    throw new Error('IMAGE_CACHE_DIR is required');
  }

  if (config.CACHE_CLEANUP_INTERVAL_MINUTES < 1) {
    throw new Error('CACHE_CLEANUP_INTERVAL_MINUTES must be positive');
  }

  if (config.RATE_LIMIT_WINDOW_MS < 1000) {
    throw new Error('RATE_LIMIT_WINDOW_MS must be at least 1000ms');
  }

  if (config.RATE_LIMIT_MAX < 1) {
    throw new Error('RATE_LIMIT_MAX must be positive');
  }
}

// Validate configuration on load
validateConfig();
