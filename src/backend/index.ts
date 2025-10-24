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
import { Logger, createErrorResponse } from './utils';

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
 * Import Routes
 */
import albumRoutes from './routes/albumRoutes';
import healthRoutes from './routes/healthRoutes';

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
 * Mount API Routes
 */
app.use('/', albumRoutes);
app.use('/api', healthRoutes);

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
app.listen(config.PORT, () => {
  Logger.info('Pildiraam server started', {
    port: config.PORT,
    environment: config.NODE_ENV,
    cacheDir: config.IMAGE_CACHE_DIR,
  });
});

// Export app for testing
export default app;
