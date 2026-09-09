# ── Stage 1: Build the React App ──
#
# --platform=$BUILDPLATFORM pins this stage to the NATIVE architecture
# of the build runner (linux/amd64 on standard GitHub Actions runners).
# The previous omission caused buildx to spin up an arm64 emulator via
# QEMU for the arm64 leg of the multi-arch build, which crashed with
#   qemu: uncaught target signal 4 (Illegal instruction) - core dumped
# during `npm ci` (the V8 / native-module path uses CPU instructions
# QEMU's user-mode emulator doesn't implement). Build times also bled
# into 30-50 min because QEMU emulation is glacially slow.
#
# This is safe because the build output is platform-agnostic — Vite
# produces static JS/CSS/HTML that runs in any browser. Only the
# nginx-based runtime stage below needs to be per-arch.
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder

WORKDIR /app

# Copy package configuration and install dependencies
COPY package.json package-lock.json ./
RUN apk add --no-cache git
RUN npm ci

# Copy application source code
COPY . .

# THE COMMIT THIS IMAGE WAS BUILT FROM, baked in — never injected by the chart.
#
# The mesh services take the same ARG for the same reason: a runtime-injected sha reports what
# the deployment BELIEVES it is running, which is the exact claim under suspicion when somebody
# asks whether what they are looking at is what was pushed. Absent is absent — vite.config.ts
# falls back to asking git, and emits null rather than a placeholder if there is no checkout.
ARG GIT_SHA=""
ENV GIT_SHA=$GIT_SHA

# Build the static Vite bundle (outputs to /app/dist)
RUN npm run build

# ── Stage 2: Serve with Nginx ──
FROM nginx:1.25-alpine

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Replace the default nginx.conf with our custom configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Set up the runtime environment injection script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose port (Nginx will listen on this port)
ENV PORT=8080
EXPOSE 8080

# Use our script to inject env vars before starting nginx
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
