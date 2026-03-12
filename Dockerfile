FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN mkdir -p /app/outputs

ENV NODE_TLS_REJECT_UNAUTHORIZED=0

EXPOSE 3000

CMD ["npx", "tsx", "src/index.ts"]
