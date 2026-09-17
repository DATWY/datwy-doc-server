# Use official Node.js runtime as base image
FROM node:20-bullseye-slim

# Install latest Chrome and required Linux graphic/font/Xvfb/xauth libraries
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    xvfb \
    xauth \
    dbus-x11 \
    fonts-liberation \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    --no-install-recommends \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg \
    && sh -c 'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces runs as UID 1000 (non-root)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH
WORKDIR $HOME/app

# Copy package files and install dependencies
COPY --chown=user:user package*.json ./
RUN npm install --production

# Copy all source files
COPY --chown=user:user . .

# Set environment variables
ENV NODE_ENV=production
ENV PORT=7860
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
ENV CHROME_PATH=/usr/bin/google-chrome-stable
ENV DISPLAY=:99

# Expose server port (Hugging Face default: 7860)
EXPOSE 7860

# Start Express server with Xvfb virtual display
CMD ["xvfb-run", "-a", "--server-args=-screen 0 1920x1080x24", "node", "index.js"]

