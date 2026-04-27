FROM node:18-alpine

WORKDIR /app

# Copy backend files
COPY backend/package.json backend/package-lock.json ./
COPY backend/src ./src
COPY backend/public ./public
COPY backend/next.config.js ./
COPY backend/tsconfig.json ./

# Install dependencies
RUN npm ci

# Build Next.js
RUN npm run build

# Set environment
ENV NODE_ENV=production
ENV PORT=3001

# Start application
CMD ["npm", "start"]
