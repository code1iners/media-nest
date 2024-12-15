FROM node:20

WORKDIR /app

COPY package*.json ./

RUN npm ci 

ENV NODE_ENV production

COPY . .

USER node

EXPOSE 3000

CMD [ "npm", "start" ]