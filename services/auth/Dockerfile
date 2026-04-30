FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY src ./src

EXPOSE 3005

CMD ["npm", "start"]


