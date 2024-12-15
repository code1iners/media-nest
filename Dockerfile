# Step 1: Build stage.
FROM node:20

# Set workspace directory.
WORKDIR /app

# Copy package.json and package-lock.json.
COPY package*.json ./

# Install dependencies 
RUN npm install

# Copy source code.
COPY . .

# Build application.
RUN npm run build

# NestJS 앱 실행
CMD ["node", "dist/main"]