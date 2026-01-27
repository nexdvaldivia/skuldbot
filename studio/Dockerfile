# Multi-stage build for production-ready SkuldBot Studio
FROM rust:1.75-slim as builder

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests
COPY Cargo.toml Cargo.lock ./

# Copy source
COPY src ./src

# Build release binary
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    libsqlite3-0 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 skuldbot && \
    mkdir -p /app/data /app/logs /app/config && \
    chown -R skuldbot:skuldbot /app

# Copy binary from builder
COPY --from=builder /app/target/release/skuldbot-studio /app/skuldbot-studio

# Copy default configuration
COPY config.yaml /app/config/default.yaml

USER skuldbot

# Expose ports
# 9090 - Prometheus metrics
EXPOSE 9090

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:9090/health/ready || exit 1

# Set environment variables
ENV RUST_LOG=info
ENV SKULDBOT__SERVER__ENVIRONMENT=production
ENV SKULDBOT__DATABASE__URL=sqlite:///app/data/skuldbot.db

# Run the application
CMD ["/app/skuldbot-studio"]

