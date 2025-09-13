# Multi-stage Docker build for Symposium Demo with auto-provisioning

# Stage 1: Build stage
FROM denoland/deno:2.0.0 AS builder

# Set working directory
WORKDIR /app

# Copy dependency files
COPY deno.json deno.lock ./

# Copy source code
COPY src/ src/
COPY main.ts .
COPY isolate-sandbox/ isolate-sandbox/
COPY static/ static/

# Cache dependencies
RUN deno cache main.ts

# Stage 2: Runtime stage
FROM denoland/deno:2.0.0 AS runtime

# Install system dependencies for GCP operations
RUN apt-get update && apt-get install -y \
    curl \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash symposium
USER symposium

# Set working directory
WORKDIR /home/symposium/app

# Copy built application from builder stage
COPY --from=builder --chown=symposium:symposium /app .

# Create directories for local storage
RUN mkdir -p storage logs

# Environment variables with defaults
ENV PORT=8080
ENV ENVIRONMENT=production
ENV PROVISIONING_MODE=auto
ENV COST_LIMIT=100

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT}/api/health || exit 1

# Expose port
EXPOSE ${PORT}

# Start the application
CMD ["deno", "run", "--allow-all", "--unstable-kv", "main.ts"]
