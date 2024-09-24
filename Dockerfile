FROM ghcr.io/puppeteer/puppeteer:19.7.2

USER root

USER node

ENV DISPLAY=:99

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

WORKDIR /usr/src/app

COPY package*.json ./
COPY . .

# Start xvfb and run the application
CMD xvfb-run --auto-servernum --server-args="-screen 0 1280x1024x24" npx nodemon app.js