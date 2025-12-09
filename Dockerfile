FROM node:22-alpine AS builder

ARG VITE_API_BASE
ENV VITE_API_BASE=$VITE_API_BASE
# set workdir
WORKDIR /app

# Copy package files for frontend and stream-server to leverage layer caching
# Copy package files for caching
COPY frontend/package*.json ./frontend/
COPY stream-server/package*.json ./stream-server/

# Copy full stream-server sources early so server files (index.js) are present
COPY stream-server/ ./stream-server/

# Copy full frontend sources, install deps, and build
COPY frontend/ ./frontend/
WORKDIR /app/frontend
# Use npm ci when a lockfile exists, otherwise fall back to npm install
# Install build tools on Alpine for native modules (removed in final image)
RUN apk add --no-cache python3 make build-base linux-headers
RUN if [ -f package-lock.json ] || [ -f npm-shrinkwrap.json ]; then npm ci; else npm install; fi
RUN npm run build

# Copy stream-server sources and install production deps
COPY stream-server/ ./stream-server/
WORKDIR /app/stream-server
# Install production deps (use npm install --production to respect package.json even if lockfile is stale)
RUN npm install --production

# Final runtime image
FROM node:22-alpine AS runtime
WORKDIR /app/stream-server

# Copy server files + node_modules from builder
COPY --from=builder /app/stream-server /app/stream-server

# Copy built frontend into `/app/frontend/dist` so the server can serve it from
# `path.join(__dirname, '..', 'frontend', 'dist')` at runtime.
RUN mkdir -p /app/frontend
COPY --from=builder /app/frontend/dist /app/frontend/dist

ENV NODE_ENV=production
EXPOSE 4021

# Use npm start (ensure package.json has a start script); adjust to ["node","index.js"] if needed
CMD ["npm", "run", "start"]