#!/bin/bash
set -e

# ============================================================
# AI画布 部署脚本
# 用法: ./scripts/deploy.sh
# 前提: SSH key 已配置到跳板机 (163.61.202.173:10026)
#       跳板机 ~/.ssh/jump_to_app 可免密登录应用服务器
# ============================================================

JUMP_HOST="163.61.202.173"
JUMP_PORT="10026"
APP_HOST="176.2.0.15"
APP_PORT="10026"
SSH_KEY="/tmp/ningxia_deploy"
APP_DIR="/var/www/ai-canvas"
NODE_BIN="/usr/local/node-v20.20.2-linux-x64-glibc-217/bin/node"
PSQL_BIN="/usr/local/pgsql-16/bin/psql"

# 颜色输出
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

remote_cmd() {
  ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" -p "$JUMP_PORT" "root@$JUMP_HOST" \
    "ssh -o StrictHostKeyChecking=no -i ~/.ssh/jump_to_app -p '$APP_PORT' 'root@$APP_HOST' '$1'"
}

echo -e "${BLUE}[1/6] 构建前端...${NC}"
cd "$(dirname "$0")/../ai-workflow-canvas-vue"
npx vite build --outDir dist 2>&1 | tail -3

echo -e "${BLUE}[2/6] 打包前端 dist...${NC}"
tar czf /tmp/frontend_dist_deploy.tar.gz dist/

echo -e "${BLUE}[3/6] 传输到应用服务器...${NC}"
scp -o StrictHostKeyChecking=no -i "$SSH_KEY" -P "$JUMP_PORT" /tmp/frontend_dist_deploy.tar.gz "root@$JUMP_HOST:/tmp/"
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" -p "$JUMP_PORT" "root@$JUMP_HOST" \
  "scp -o StrictHostKeyChecking=no -i ~/.ssh/jump_to_app -P '$APP_PORT' /tmp/frontend_dist_deploy.tar.gz 'root@$APP_HOST:/tmp/'"

echo -e "${BLUE}[4/6] 部署前端...${NC}"
remote_cmd "
  rm -rf $APP_DIR/frontend/*
  cd /tmp && tar xzf frontend_dist_deploy.tar.gz
  cp -r dist/* $APP_DIR/frontend/
  echo 'Frontend deployed'
"

echo -e "${BLUE}[5/6] 构建并重启后端...${NC}"
remote_cmd "
  export PATH=\"$NODE_BIN:$PSQL_BIN:/usr/local/bin:/usr/bin:/bin\"
  cd $APP_DIR/server/server && npm run build && systemctl restart canvas-api && sleep 2
  systemctl status canvas-api --no-pager | head -5
"

echo -e "${BLUE}[6/6] 验证...${NC}"
sleep 1
remote_cmd "curl -s http://127.0.0.1:3000/api/health"
echo ""

echo -e "${GREEN}=== 部署完成 ===${NC}"
echo "应用服务器: http://$APP_HOST:5179"
echo "负载均衡入口: http://163.61.202.138:18080"
