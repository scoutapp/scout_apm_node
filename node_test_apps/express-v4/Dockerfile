FROM node:20-alpine

WORKDIR /app

# Build context is the repo root.
# Copy the built scout-apm package into /scout-agent so npm can install it
# via the absolute file: path declared in package.json.
COPY dist/ /scout-agent/dist/
COPY package.json /scout-agent/package.json
COPY index.d.ts /scout-agent/index.d.ts

# Install app dependencies (resolves /scout-agent from above)
COPY node_test_apps/express-v4/package.json .
RUN npm install

# App source
COPY node_test_apps/express-v4/app.js .
COPY node_test_apps/express-v4/capture-agent.js .
COPY node_test_apps/express-v4/store.js .
COPY node_test_apps/express-v4/healthcheck.js .
COPY node_test_apps/express-v4/views/ views/

ENV PORT=3000
ENV SCOUT_CORE_AGENT_DOWNLOAD=false
ENV SCOUT_CORE_AGENT_LAUNCH=false

EXPOSE 3000

HEALTHCHECK --interval=5s --timeout=3s --retries=5 \
  CMD node healthcheck.js

CMD ["node", "app.js"]
