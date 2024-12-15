FROM node:16-buster

RUN npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

USER node

EXPOSE 3000

CMD [ "pnpm", "start" ]