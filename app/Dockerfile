# syntax=docker/dockerfile:1

FROM node:24-alpine

# Prisma query engines require a compatible OpenSSL on Alpine.
RUN apk add --no-cache openssl

WORKDIR /usr/src/app

# Install dependencies first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci

# Generate the Prisma Client from the schema.
COPY prisma ./prisma
RUN ./node_modules/.bin/prisma generate

# Copy the application source and static assets.
COPY src ./src
COPY public ./public

# Run as the unprivileged "node" user. The uploads directory is created here
# because user attachments are persisted through a volume at runtime.
RUN mkdir -p uploads && chown -R node:node /usr/src/app
USER node

ENV NODE_ENV=production \
    PORT=3000

EXPOSE 3000

# Apply pending migrations, then start the server.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node src/server/server.js"]
