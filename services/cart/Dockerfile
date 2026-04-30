FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY node_modules ./node_modules
COPY src ./src

EXPOSE 3002

CMD ["npm", "start"]

