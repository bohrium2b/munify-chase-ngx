FROM oven/bun:1-slim AS base

FROM base AS dependencies
WORKDIR /build/dependencies
COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile

FROM base AS runtime-dependencies
WORKDIR /build/dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM base AS builder
WORKDIR /build/staging

ARG VERSION
ENV PUBLIC_VERSION=$VERSION
ARG SHA
ENV PUBLIC_SHA=$SHA

COPY --from=dependencies /build/dependencies .
COPY . .
# the build command generates a few things, such as i18n outputs
# therefore we need to run the build command BEFORE we check for correctness
RUN bun run build

FROM ubuntu:22.04 AS typst
RUN apt-get update && apt-get install wget tar 
WORKDIR /tmp

RUN wget https://github.com/typst/typst/releases/download/v0.15.1/typst-x86_64-unknown-linux-musl.tar.xz

# Extract Typst
RUN tar -xf typst-x86_64-unknown-linux-musl.tar.xz
# Move to bin
RUN mv typst /usr/local/bin/

FROM node:lts-slim AS release
WORKDIR /app/release

# Patch OS packages in the base image to pick up security fixes
# (e.g. glibc, libcap2, systemd CVEs flagged by Trivy)
RUN apt-get update \
	&& apt-get upgrade -y --no-install-recommends \
	&& apt-get clean \
	&& rm -rf /var/lib/apt/lists/*

ARG VERSION
ENV PUBLIC_VERSION=$VERSION
ARG SHA
ENV PUBLIC_SHA=$SHA
COPY --from=builder /build/staging/build .
COPY ./drizzle ./drizzle/
COPY ./drizzle.config.ts .
COPY ./src/api/db/schema.ts ./src/api/db/schema.ts
COPY --from=runtime-dependencies /build/dependencies .
COPY ./src/server.js ./server.js

COPY --from=typst /usr/local/bin/typst /usr/local/bin/typst

RUN chown -R node:node .
USER node
ENV NODE_ENV=production
EXPOSE 3000/tcp
# TODO
# HEALTHCHECK --interval=15s --timeout=10s --retries=3 CMD curl -f http://0.0.0.0:3000/api/health/ready || exit 1
CMD ["sh", "-c", "./node_modules/.bin/drizzle-kit migrate && node ./server.js"]
