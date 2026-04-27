FROM node:18-alpine

WORKDIR /app

# Copy backend files
COPY backend/package.json backend/package-lock.json ./
COPY backend/src ./src
COPY backend/public ./public

# Install dependencies
RUN npm ci

# Build
RUN npm run build

# Set environment
ENV NODE_ENV=production
ENV PORT=3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3001/api/health || exit 1

# Start application
CMD ["npm", "start"]
