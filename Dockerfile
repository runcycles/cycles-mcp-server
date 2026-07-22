# Build stage: full dev toolchain, then prune to production deps.
FROM node:20-alpine AS build
WORKDIR /app
# npm 10.8 (bundled with node:20) hits the "Exit handler never called" bug and
# silently half-installs; npm 11 is the same pin the CI publish job uses.
RUN npm install -g npm@11
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsup.config.ts ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# Runtime: production deps + dist + docs (the cycles://docs/* resources
# resolve ../docs relative to dist/index.js).
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY docs ./docs
COPY package.json server.json LICENSE README.md ./
USER node
# stdio transport by default; pass --transport http (and expose PORT) for HTTP.
ENTRYPOINT ["node", "dist/index.js"]
