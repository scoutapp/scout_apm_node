# Stage 1: pack the scout-apm package from the pre-built dist
FROM node:24-alpine AS packer
WORKDIR /scout
COPY dist/ dist/
COPY package.json .
RUN npm pack && mv *.tgz /scout-apm.tgz

# Stage 2: install deps, compile TypeScript, run app
FROM node:24-alpine
WORKDIR /app

COPY --from=packer /scout-apm.tgz .
COPY node_test_apps/node_24/nest/package.json .
COPY node_test_apps/node_24/nest/tsconfig.json .
RUN npm config set strict-ssl false && \
    sed -i 's|"file:/scout-agent"|"./scout-apm.tgz"|' package.json && \
    npm install

COPY node_test_apps/node_24/nest/src/ src/
RUN npx tsc

COPY node_test_apps/node_24/nest/views/ views/
COPY node_test_apps/node_24/nest/capture-agent.js .
COPY node_test_apps/node_24/nest/store.js .
COPY node_test_apps/node_24/nest/healthcheck.js .

ENV PORT=3003
ENV SCOUT_CORE_AGENT_DOWNLOAD=false
ENV SCOUT_CORE_AGENT_LAUNCH=false

EXPOSE 3003

HEALTHCHECK --interval=5s --timeout=3s --retries=10 \
  CMD node healthcheck.js

CMD ["node", "dist/main"]
