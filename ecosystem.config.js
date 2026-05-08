module.exports = {
  apps: [{
    name: 'tesseraflow',
    script: 'backend/server.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '500M',
    watch: false,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
};
