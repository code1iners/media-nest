FROM node:20

WORKDIR /app

COPY package*.json ./

COPY . .

USER node

EXPOSE 3000

CMD [ "pnpm", "start" ]