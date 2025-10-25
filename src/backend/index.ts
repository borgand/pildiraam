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
 * GET / - Landing page with configuration form
 */
app.get('/', (_req: Request, res: Response) => {
  const indexPath = path.join(__dirname, '../../public/index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      Logger.error('Failed to serve landing page', err as Error);
      res.status(500).send('Failed to load landing page');
    }
  });
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
