# Node 24 runs the TypeScript sources directly, so there is no build stage.
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src
USER node
CMD ["node", "src/index.ts"]
