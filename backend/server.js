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

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  }).listen(port, host, () => {
    console.log(`> Server listening at http://${host}:${port} as ${dev ? 'development' : 'production'}`);
    console.log('> Press CTRL-C to stop\n');
  });
}).catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
