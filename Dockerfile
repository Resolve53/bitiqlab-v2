# Root Dockerfile for Railway - auto-detected
# This is the backend API
FROM node:18-alpine

WORKDIR /app

# Copy backend
COPY backend/ ./

# Install dependencies
RUN npm install

# Build
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["npm", "start"]
