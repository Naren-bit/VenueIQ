# VenueIQ Backend — Google Cloud Run Deployment
# Multi-stage build for optimized production image

# ---- Stage 1: Build ----
FROM node:18-alpine AS builder
WORKDIR /app

# Copy package files and install production dependencies only
COPY venueiq-backend/package*.json ./
RUN npm ci --only=production

# ---- Stage 2: Production ----
FROM node:18-alpine AS production
WORKDIR /app

# Security: run as non-root user
RUN addgroup -g 1001 venueiq && adduser -u 1001 -G venueiq -s /bin/sh -D venueiq

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application source
COPY venueiq-backend/package*.json ./
COPY venueiq-backend/src ./src

# Copy frontend static files
COPY public ../public

# Set environment
ENV NODE_ENV=production
ENV PORT=8080

# Expose Cloud Run port
EXPOSE 8080

# Switch to non-root user
USER venueiq

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Start server
CMD ["node", "src/server.js"]
