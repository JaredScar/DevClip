FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
EXPOSE 8787
ENV PORT=8787
CMD ["node", "src/index.mjs"]
