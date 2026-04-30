# Stage 1: pack the scout-apm package from the pre-built dist
# Using npm pack ensures the installed package is copied (not symlinked)
# into node_modules, so require() resolution works correctly.
FROM node:20-alpine AS packer
WORKDIR /scout
COPY dist/ dist/
COPY package.json .
RUN npm pack && mv *.tgz /scout-apm.tgz

# Stage 2: app
FROM node:20-alpine
WORKDIR /app

# Install app dependencies; point scout-apm at the tarball from stage 1
COPY --from=packer /scout-apm.tgz .
COPY node_test_apps/express-v5/package.json .
RUN npm config set strict-ssl false && \
    sed -i 's|"file:/scout-agent"|"./scout-apm.tgz"|' package.json && \
    npm install

# App source
COPY node_test_apps/express-v5/app.js .
COPY node_test_apps/express-v5/capture-agent.js .
COPY node_test_apps/express-v5/store.js .
COPY node_test_apps/express-v5/healthcheck.js .
COPY node_test_apps/express-v5/views/ views/

ENV PORT=3001
ENV SCOUT_CORE_AGENT_DOWNLOAD=false
ENV SCOUT_CORE_AGENT_LAUNCH=false

EXPOSE 3001

HEALTHCHECK --interval=5s --timeout=3s --retries=5 \
  CMD node healthcheck.js

CMD ["node", "app.js"]
