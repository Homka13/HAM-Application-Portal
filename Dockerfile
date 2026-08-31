FROM node:22-alpine

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run contract:emit
RUN npm run build

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db update --yes && npm run start"]
