FROM node:24-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy and install Node dependencies
COPY package*.json ./
COPY zones.json ./
RUN npm install

# Copy everything else
COPY . .


# Expose backend port
EXPOSE 3000

# Start your Node backend
CMD ["npm", "start"]