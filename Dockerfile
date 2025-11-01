FROM node:24-alpine

# Install Python + pip + netcat
RUN apk add --no-cache python3 py3-pip netcat-openbsd

# Set working directory
WORKDIR /usr/src/app

# Copy and install Node dependencies
COPY package*.json ./
RUN npm install

# Copy everything else
COPY . .

# Install Python dependencies (for fake_server)
RUN pip install --no-cache-dir --break-system-packages -r temp/requirements.txt

# Expose ports
EXPOSE 80 8765

# Copy and enable startup script
COPY start.sh .
RUN chmod +x start.sh

CMD ["./start.sh"]
