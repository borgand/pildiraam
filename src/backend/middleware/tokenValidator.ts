/**
 * Token Validator Middleware for Pildiraam
 * Validates album token format before processing requests
 */

import { Request, Response, NextFunction } from 'express';
import { isValidToken, createErrorResponse, Logger, maskToken } from '../utils';

/**
 * Express middleware that validates album token parameter
 * Checks token format (15-character alphanumeric)
 * Returns 404 if token is invalid
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export function validateToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { token } = req.params;

  if (!token) {
    Logger.warn('Missing token parameter', {
      path: req.path,
      ip: req.ip,
    });
    res.status(404).json(createErrorResponse('Album not found', 404));
    return;
  }

  if (!isValidToken(token)) {
    Logger.warn('Invalid token format', {
      token: maskToken(token),
      path: req.path,
      ip: req.ip,
    });
    res.status(404).json(createErrorResponse('Album not found', 404));
    return;
  }

  // Token is valid, proceed to route handler
  Logger.debug('Token validated successfully', { token: maskToken(token) });
  next();
}
