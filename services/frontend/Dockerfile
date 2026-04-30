FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src
COPY public ./public

EXPOSE 3000

CMD ["npm", "start"]
