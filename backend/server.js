#!/usr/bin/env node

/**
 * Custom Next.js server for Railway deployment
 * Handles PORT environment variable correctly for standalone builds
 */

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const port = parseInt(process.env.PORT || '3000', 10);
const host = '0.0.0.0';

// For standalone builds, NODE_ENV should be production
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev, hostname: host, port });
const handle = app.getRequestHandler();

console.log(`> Starting Next.js server on ${host}:${port}`);
console.log(`> Environment: ${process.env.NODE_ENV || 'production'}`);

app.prepare()
  .then(() => {
    createServer(async (req, res) => {
      try {
        const parsedUrl = parse(req.url, true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error('Error handling request:', err);
        res.statusCode = 500;
        res.end('Internal server error');
      }
    })
      .listen(port, host, (err) => {
        if (err) {
          console.error('Failed to start server:', err);
          process.exit(1);
        }
        console.log(`✓ Server ready at http://${host}:${port}`);
      });
  })
  .catch((err) => {
    console.error('Failed to prepare Next.js app:', err);
    process.exit(1);
  });
