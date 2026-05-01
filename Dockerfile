FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/auth-store.js ./auth-store.js
COPY --from=builder /app/cv-content.js ./cv-content.js
COPY --from=builder /app/cv-pdf.js ./cv-pdf.js
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public
COPY --from=builder /app/cv.md ./cv.md
COPY --from=builder /app/cv-example.md ./cv-example.md

EXPOSE 3002

CMD ["npm", "start"]
