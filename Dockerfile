FROM node:22-alpine

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY package*.json ./
COPY frontend/package*.json ./frontend/

RUN npm install

COPY . .

RUN npm run contract:emit
RUN npm run build

EXPOSE 3000

ENV PORT=3000

CMD ["node", "dist/index.js"]
