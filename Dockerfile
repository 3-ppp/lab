FROM node:22-alpine
RUN apk add --no-cache git && mkdir -p /data && chown node:node /data
WORKDIR /app
COPY server.js package.json ./
COPY public ./public
USER node
ENV HOME=/tmp NODE_ENV=production PORT=3000 REPO_DIR=/data/repo GIT_PULL=1
EXPOSE 3000
CMD ["node", "server.js"]
