FROM node:20-alpine

WORKDIR /app

# Copy the scout agent source so we can install it from local path
COPY ../../dist /scout-agent/dist
COPY ../../package.json /scout-agent/
COPY ../../index.d.ts /scout-agent/

COPY package.json .
RUN npm install

COPY app.js .
COPY healthcheck.js .

ENV PORT=3000
ENV SCOUT_CORE_AGENT_DOWNLOAD=false
ENV SCOUT_CORE_AGENT_LAUNCH=false

EXPOSE 3000

HEALTHCHECK --interval=5s --timeout=3s --retries=3 \
  CMD node healthcheck.js

CMD ["node", "app.js"]
