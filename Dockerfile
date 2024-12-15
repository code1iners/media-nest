FROM node:16-buster

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY . .

USER node

EXPOSE 3000

CMD [ "pnpm", "start" ]