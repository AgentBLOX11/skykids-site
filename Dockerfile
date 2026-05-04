FROM node:22-bookworm
WORKDIR /app

# Install Python and build tools for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
RUN npm install
COPY backend/ .
EXPOSE 10000
CMD ["node", "server.js"]