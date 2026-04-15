#!/usr/bin/env node

/**
 * Custom Next.js server for Railway deployment
 * Handles PORT environment variable correctly
 */

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();
const port = parseInt(process.env.PORT || '3000', 10);
const host = '0.0.0.0';

console.log(`Starting Next.js server...`);
console.log(`- Node environment: ${process.env.NODE_ENV || 'production'}`);
console.log(`- Listening on ${host}:${port}`);

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Request error:', err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  httpServer.listen(port, host, () => {
    console.log(`✓ Server running on http://${host}:${port}`);
  });

  httpServer.on('error', (err) => {
    console.error('Server error:', err);
    process.exit(1);
  });
}).catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
