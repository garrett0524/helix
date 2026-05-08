#!/bin/bash
echo "Deploying TesseraFlow..."

# Pull latest code
git pull origin main

# Install dependencies
cd backend && npm install --production
cd ../frontend && npm install && npm run build
cd ..

# Run database seed (safe to run multiple times)
node backend/database/seed.js

# Restart app
pm2 restart tesseraflow || pm2 start ecosystem.config.js

echo "Deployment complete!"
