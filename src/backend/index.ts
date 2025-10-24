/**
 * Pildiraam - iCloud Shared Album Digital Photo Frame
 * Main Express server application
 */

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { config } from './config';
import { Logger, isValidToken, createErrorResponse } from './utils';

// Initialize Express app
const app = express();

/**
 * Security Middleware
 */

// Helmet for security headers
app.use(
  helmet({
    contentSecurityPolicy: false, // We'll configure CSP later for the frontend
    hidePoweredBy: true, // Hide X-Powered-By header
  })
);

// CORS configuration
app.use(
  cors({
    origin: true, // Allow all origins for now, can be restricted later
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

/**
 * Body Parsing Middleware
 */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * Request Logging Middleware
 */
app.use((req: Request, _res: Response, next: NextFunction) => {
  Logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  next();
});

/**
 * Static File Serving
 */
const publicPath = path.join(__dirname, '../../public');
app.use(express.static(publicPath));

/**
 * Routes
 */

/**
 * GET / - Landing page with instructions
 */
app.get('/', (_req: Request, res: Response) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Pildiraam - Digital Photo Frame</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          max-width: 800px;
          margin: 50px auto;
          padding: 20px;
          line-height: 1.6;
        }
        h1 { color: #333; }
        code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
        .instructions { background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <h1>Pildiraam - Digital Photo Frame</h1>
      <div class="instructions">
        <h2>Getting Started</h2>
        <p>To view your iCloud shared album as a slideshow, use the following URL format:</p>
        <p><code>/album/YOUR_ALBUM_TOKEN</code></p>
        <p>Example: <code>/album/B0z5qAGN1JIFd3y</code></p>
        <h3>Configuration Options</h3>
        <p>Add URL parameters to customize the slideshow:</p>
        <ul>
          <li><code>?interval=15</code> - Set slide duration in seconds (5-300)</li>
          <li><code>?fullscreen=true</code> - Start in fullscreen mode</li>
          <li><code>?weather=true</code> - Show weather overlay</li>
          <li><code>?clock=true</code> - Show clock overlay</li>
        </ul>
      </div>
      <p><small>Pildiraam v1.0.0 - Running in ${config.NODE_ENV} mode</small></p>
    </body>
    </html>
  `);
});

/**
 * GET /album/:token - Serve slideshow HTML interface
 */
app.get('/album/:token', (req: Request, res: Response): void => {
  const { token } = req.params;

  if (!isValidToken(token)) {
    Logger.warn('Invalid token format', { token });
    res.status(404).send('Album not found');
    return;
  }

  // TODO: Serve slideshow HTML from public directory
  res.send('Slideshow interface will be implemented here');
});

/**
 * GET /api/album/:token/metadata - Get album metadata
 */
app.get('/api/album/:token/metadata', (req: Request, res: Response): void => {
  const { token } = req.params;

  if (!isValidToken(token)) {
    res.status(404).json(createErrorResponse('Album not found', 404));
    return;
  }

  // TODO: Implement metadata retrieval
  res.json({ message: 'Metadata endpoint - to be implemented' });
});

/**
 * GET /api/album/:token/images - Get paginated album images
 */
app.get('/api/album/:token/images', (req: Request, res: Response): void => {
  const { token } = req.params;

  if (!isValidToken(token)) {
    res.status(404).json(createErrorResponse('Album not found', 404));
    return;
  }

  // TODO: Implement image list retrieval with pagination
  res.json({ message: 'Images endpoint - to be implemented' });
});

/**
 * GET /api/album/:token/image/:filename - Serve cached image
 */
app.get('/api/album/:token/image/:filename', (req: Request, res: Response): void => {
  const { token } = req.params;

  if (!isValidToken(token)) {
    res.status(404).send('Not found');
    return;
  }

  // TODO: Implement image serving from disk cache
  res.status(501).send('Image serving - to be implemented');
});

/**
 * GET /api/album/:token/weather - Get weather overlay data
 */
app.get('/api/album/:token/weather', (req: Request, res: Response): void => {
  const { token } = req.params;

  if (!isValidToken(token)) {
    res.status(404).json(createErrorResponse('Album not found', 404));
    return;
  }

  if (!config.WEATHER_API_KEY) {
    res.status(503).json(createErrorResponse('Weather service not configured', 503));
    return;
  }

  // TODO: Implement weather API integration
  res.json({ message: 'Weather endpoint - to be implemented' });
});

/**
 * POST /api/album/:token/refresh - Force manual album refresh
 */
app.post('/api/album/:token/refresh', (req: Request, res: Response): void => {
  const { token } = req.params;

  if (!isValidToken(token)) {
    res.status(404).json(createErrorResponse('Album not found', 404));
    return;
  }

  // TODO: Implement manual refresh trigger
  res.json({ message: 'Refresh endpoint - to be implemented' });
});

/**
 * GET /api/health - Health check endpoint
 */
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.NODE_ENV,
  });
});

/**
 * 404 Handler
 */
app.use((req: Request, res: Response) => {
  Logger.warn('404 Not Found', { path: req.path });
  res.status(404).json(createErrorResponse('Not found', 404));
});

/**
 * Error Handler
 */
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  Logger.error('Unhandled error', err, {
    method: req.method,
    path: req.path,
  });

  res.status(500).json(createErrorResponse('Internal server error', 500));
});

/**
 * Start Server
 */
if (require.main === module) {
  app.listen(config.PORT, () => {
    Logger.info('Pildiraam server started', {
      port: config.PORT,
      environment: config.NODE_ENV,
      cacheDir: config.IMAGE_CACHE_DIR,
    });
  });
}

// Export app for testing
export default app;
