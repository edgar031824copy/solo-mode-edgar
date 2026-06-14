module.exports = {
  apps: [{
    name: "recruitment-api",
    script: "dist/index.js",
    instances: 1,
    autorestart: true,
    watch: false,
    env: {
      NODE_ENV: "production",
      PORT: 3000,
    },
  }],
};
