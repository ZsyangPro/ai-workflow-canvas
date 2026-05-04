module.exports = {
  apps: [
    {
      name: 'canvas-api',
      script: './dist/index.js',
      cwd: '/var/www/ai-canvas/server',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      // 自动重启配置
      max_memory_restart: '500M',
      // 日志
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      merge_logs: true,
    },
  ],
}
