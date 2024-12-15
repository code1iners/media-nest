FROM node:20

WORKDIR /app

COPY package*.json ./

RUN npm ci 

COPY . .

USER node

EXPOSE 3000

CMD [ "npm", "start" ]