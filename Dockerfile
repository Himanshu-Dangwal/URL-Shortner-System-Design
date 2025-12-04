FROM node:20-alpine

WORKDIR /app

# Copy package.json first for caching install layers
COPY package*.json ./

# Install production dependencies
RUN npm install --only=production

# Copy entire project
COPY . .

# Default command — overridden by docker-compose for each service
CMD ["node", "services/api/index.js"]
