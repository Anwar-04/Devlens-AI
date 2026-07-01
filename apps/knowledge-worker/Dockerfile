FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/knowledge-worker/package.json apps/knowledge-worker/package.json
COPY apps/repository-worker/package.json apps/repository-worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build -w @devlens/shared
CMD ["npm", "run", "dev", "-w", "@devlens/knowledge-worker"]