#!/bin/bash
set -e

# ============================================================
# AI画布 部署脚本
# 用法: ./scripts/deploy.sh
# 前提: SSH key 已配置到跳板机 (163.61.202.173:10026)
#       跳板机 ~/.ssh/jump_to_app 可免密登录应用服务器
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

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

echo -e "${BLUE}[1/7] 构建前端...${NC}"
cd "$PROJECT_ROOT/ai-workflow-canvas-vue"
npx vite build --outDir dist 2>&1 | tail -3

echo -e "${BLUE}[2/7] 打包前端 dist...${NC}"
tar czf /tmp/frontend_dist_deploy.tar.gz dist/

echo -e "${BLUE}[3/7] 传输到应用服务器...${NC}"
scp -o StrictHostKeyChecking=no -i "$SSH_KEY" -P "$JUMP_PORT" /tmp/frontend_dist_deploy.tar.gz "root@$JUMP_HOST:/tmp/"
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" -p "$JUMP_PORT" "root@$JUMP_HOST" \
  "scp -o StrictHostKeyChecking=no -i ~/.ssh/jump_to_app -P '$APP_PORT' /tmp/frontend_dist_deploy.tar.gz 'root@$APP_HOST:/tmp/'"

echo -e "${BLUE}[4/7] 部署前端...${NC}"
remote_cmd "
  rm -rf $APP_DIR/frontend/*
  cd /tmp && tar xzf frontend_dist_deploy.tar.gz
  cp -r dist/* $APP_DIR/frontend/
  echo 'Frontend deployed'
"

echo -e "${BLUE}[5/7] 构建并重启后端...${NC}"
remote_cmd "
  export PATH=\"$NODE_BIN:$PSQL_BIN:/usr/local/bin:/usr/bin:/bin\"
  cd $APP_DIR/server/server && npm run build && systemctl restart canvas-api && sleep 2
  systemctl status canvas-api --no-pager | head -5
"

echo -e "${BLUE}[6/7] 同步模型配置...${NC}"

# 从本地数据库读取 AiModel，生成 UPSERT SQL
cd "$PROJECT_ROOT"
LOCAL_DB_URL="postgresql://zsyang@localhost:5432/ai_canvas" npx tsx scripts/sync-models.ts 2>/dev/null > /tmp/model_sync.sql

# 传输 SQL 到应用服务器
scp -o StrictHostKeyChecking=no -i "$SSH_KEY" -P "$JUMP_PORT" /tmp/model_sync.sql "root@$JUMP_HOST:/tmp/"
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" -p "$JUMP_PORT" "root@$JUMP_HOST" \
  "scp -o StrictHostKeyChecking=no -i ~/.ssh/jump_to_app -P '$APP_PORT' /tmp/model_sync.sql 'root@$APP_HOST:/tmp/'"

# 执行 SQL
remote_cmd "
  export PATH=\"$PSQL_BIN:\$PATH\"
  psql -U postgres -d ai_canvas -f /tmp/model_sync.sql && rm /tmp/model_sync.sql
"
echo "模型配置已同步"

echo -e "${BLUE}[7/7] 验证...${NC}"
sleep 1
remote_cmd "curl -s http://127.0.0.1:3000/api/health"
echo ""

echo -e "${GREEN}=== 部署完成 ===${NC}"
echo "应用服务器: http://$APP_HOST:5179"
echo "负载均衡入口: http://163.61.202.138:18080"
