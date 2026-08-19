FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

# Зависимости ставим отдельным слоем, чтобы правки кода не пересобирали npm ci
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

USER node
EXPOSE 3000
CMD ["node", "server.js"]
