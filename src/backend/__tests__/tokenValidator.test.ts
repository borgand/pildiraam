/**
 * Tests for Token Validator Middleware
 */

import { Request, Response, NextFunction } from 'express';
import { validateToken } from '../middleware/tokenValidator';
import { createErrorResponse } from '../utils';

describe('Token Validator Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let jsonSpy: jest.Mock;
  let statusSpy: jest.Mock;

  beforeEach(() => {
    // Create mock response object
    jsonSpy = jest.fn();
    statusSpy = jest.fn().mockReturnValue({ json: jsonSpy });

    mockRequest = {
      params: {},
      path: '/test/path',
    } as Partial<Request>;

    // Set ip separately since it's read-only
    Object.defineProperty(mockRequest, 'ip', {
      value: '127.0.0.1',
      writable: true,
      configurable: true,
    });

    mockResponse = {
      status: statusSpy,
      json: jsonSpy,
    };

    mockNext = jest.fn();
  });

  describe('Valid tokens', () => {
    it('should call next() for valid 15-character alphanumeric token', () => {
      mockRequest.params = { token: 'B0z5qAGN1JIFd3y' };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it('should call next() for all uppercase token', () => {
      mockRequest.params = { token: 'ABCDEFGHIJKLMNO' };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should call next() for all lowercase token', () => {
      mockRequest.params = { token: 'abcdefghijklmno' };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should call next() for all numeric token', () => {
      mockRequest.params = { token: '123456789012345' };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should call next() for mixed alphanumeric token', () => {
      mockRequest.params = { token: 'aB1cD2eF3gH4iJ5' };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });

  describe('Invalid tokens - format', () => {
    it('should return 404 for token with special characters', () => {
      mockRequest.params = { token: 'B0z5qAGN1JIFd3-' };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Album not found',
          status: 404,
        })
      );
    });

    it('should return 404 for token with spaces', () => {
      mockRequest.params = { token: 'B0z5qAGN1JIFd3 ' };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(404);
    });

    it('should return 404 for token with underscore', () => {
      mockRequest.params = { token: 'B0z5qAGN1JIFd3_' };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(404);
    });

    it('should return 404 for token with hyphen', () => {
      mockRequest.params = { token: 'B0z5-GAGN1JIFd3' };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(404);
    });

    it('should return 404 for token with dot', () => {
      mockRequest.params = { token: 'B0z5.GAGN1JIFd3' };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(404);
    });
  });

  describe('Invalid tokens - length', () => {
    it('should return 404 for token that is too short', () => {
      mockRequest.params = { token: 'B0z5qAGN1JI' }; // 11 characters

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(404);
    });

    it('should return 404 for token that is too long', () => {
      mockRequest.params = { token: 'B0z5qAGN1JIFd3y1' }; // 16 characters

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(404);
    });

    it('should return 404 for empty token', () => {
      mockRequest.params = { token: '' };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(404);
    });

    it('should return 404 for single character token', () => {
      mockRequest.params = { token: 'a' };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(404);
    });
  });

  describe('Missing token', () => {
    it('should return 404 when token parameter is missing', () => {
      mockRequest.params = {};

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(404);
    });

    it('should return 404 when token is undefined', () => {
      mockRequest.params = { token: undefined as any };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(404);
    });

    it('should return 404 when token is null', () => {
      mockRequest.params = { token: null as any };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(404);
    });
  });

  describe('Error response format', () => {
    it('should return proper error structure', () => {
      mockRequest.params = { token: 'invalid' };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String),
          status: 404,
        })
      );
    });

    it('should return "Album not found" message', () => {
      mockRequest.params = { token: 'invalid' };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Album not found',
        })
      );
    });

    it('should use createErrorResponse format', () => {
      mockRequest.params = { token: 'invalid' };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      const expectedResponse = createErrorResponse('Album not found', 404);
      expect(jsonSpy).toHaveBeenCalledWith(expectedResponse);
    });
  });

  describe('Request context', () => {
    it('should not modify request object on valid token', () => {
      const originalParams = { token: 'B0z5qAGN1JIFd3y' };
      mockRequest.params = { ...originalParams };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.params).toEqual(originalParams);
    });

    it('should handle requests with IP address', () => {
      mockRequest.params = { token: 'B0z5qAGN1JIFd3y' };
      Object.defineProperty(mockRequest, 'ip', { value: '192.168.1.1', configurable: true });

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle requests without IP address', () => {
      mockRequest.params = { token: 'B0z5qAGN1JIFd3y' };
      Object.defineProperty(mockRequest, 'ip', { value: undefined, configurable: true });

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    it('should reject token with leading whitespace', () => {
      mockRequest.params = { token: ' B0z5qAGN1JIFd3y' };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(404);
    });

    it('should reject token with trailing whitespace', () => {
      mockRequest.params = { token: 'B0z5qAGN1JIFd3y ' };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(404);
    });

    it('should reject token with URL encoding', () => {
      mockRequest.params = { token: 'B0z5qAGN1JIFd%20' };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(404);
    });

    it('should reject token with unicode characters', () => {
      mockRequest.params = { token: 'B0z5qAGN1JIFd3ü' };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(404);
    });

    it('should handle token as number (type coercion)', () => {
      mockRequest.params = { token: 123456789012345 as any };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(404);
    });

    it('should handle token as object', () => {
      mockRequest.params = { token: { toString: () => 'B0z5qAGN1JIFd3y' } as any };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(404);
    });
  });

  describe('Middleware execution flow', () => {
    it('should call next() exactly once for valid token', () => {
      mockRequest.params = { token: 'validtoken12345' };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockNext).toHaveBeenCalledWith(); // Called with no arguments
    });

    it('should not call next() for invalid token', () => {
      mockRequest.params = { token: 'invalid' };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should set status before calling json', () => {
      mockRequest.params = { token: 'invalid' };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      // Verify both were called
      expect(statusSpy).toHaveBeenCalled();
      expect(jsonSpy).toHaveBeenCalled();
    });

    it('should call res.status().json() chain correctly', () => {
      const chainedJson = jest.fn();
      statusSpy.mockReturnValue({ json: chainedJson });

      mockRequest.params = { token: 'invalid' };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(chainedJson).toHaveBeenCalled();
    });
  });

  describe('Security considerations', () => {
    it('should not leak system information in error message', () => {
      mockRequest.params = { token: 'invalid' };

      validateToken(mockRequest as Request, mockResponse as Response, mockNext);

      const errorMessage = jsonSpy.mock.calls[0][0].error;
      expect(errorMessage).not.toContain('token');
      expect(errorMessage).not.toContain('invalid');
      expect(errorMessage).not.toContain('validation');
      expect(errorMessage).toBe('Album not found');
    });

    it('should return same error message for different invalid tokens', () => {
      const invalidTokens = ['short', 'toolongtoken12345', 'invalid-token!', ''];

      const errorMessages = invalidTokens.map((token) => {
        jsonSpy.mockClear();
        statusSpy.mockClear();

        mockRequest.params = { token };
        validateToken(mockRequest as Request, mockResponse as Response, mockNext);

        return jsonSpy.mock.calls[0]?.[0]?.error;
      });

      // All error messages should be identical
      const uniqueMessages = new Set(errorMessages);
      expect(uniqueMessages.size).toBe(1);
      expect(Array.from(uniqueMessages)[0]).toBe('Album not found');
    });
  });

  describe('Multiple middleware calls', () => {
    it('should work correctly on repeated calls', () => {
      const tokens = [
        'validtoken12345',
        'invalid',
        'anothervalid123',
        'short',
        'B0z5qAGN1JIFd3y',
      ];

      tokens.forEach((token) => {
        jest.clearAllMocks();
        mockRequest.params = { token };

        validateToken(mockRequest as Request, mockResponse as Response, mockNext);

        if (token.length === 15 && /^[a-zA-Z0-9]{15}$/.test(token)) {
          expect(mockNext).toHaveBeenCalled();
        } else {
          expect(statusSpy).toHaveBeenCalledWith(404);
        }
      });
    });
  });
});
