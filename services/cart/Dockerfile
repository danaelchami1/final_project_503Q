FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src

EXPOSE 3002

CMD ["npm", "start"]


