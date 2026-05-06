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
SSH_KEY="$HOME/.ssh/ningxia_deploy"
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

echo -e "${BLUE}[1/8] 构建前端...${NC}"
cd "$PROJECT_ROOT/ai-workflow-canvas-vue"
npx vite build --outDir dist 2>&1 | tail -3

echo -e "${BLUE}[2/8] 打包前端 dist...${NC}"
tar czf /tmp/frontend_dist_deploy.tar.gz dist/

echo -e "${BLUE}[3/8] 传输到应用服务器...${NC}"
scp -o StrictHostKeyChecking=no -i "$SSH_KEY" -P "$JUMP_PORT" /tmp/frontend_dist_deploy.tar.gz "root@$JUMP_HOST:/tmp/"
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" -p "$JUMP_PORT" "root@$JUMP_HOST" \
  "scp -o StrictHostKeyChecking=no -i ~/.ssh/jump_to_app -P '$APP_PORT' /tmp/frontend_dist_deploy.tar.gz 'root@$APP_HOST:/tmp/'"

echo -e "${BLUE}[4/8] 部署前端...${NC}"
remote_cmd "
  rm -rf $APP_DIR/frontend/*
  cd /tmp && tar xzf frontend_dist_deploy.tar.gz
  cp -r dist/* $APP_DIR/frontend/
  echo 'Frontend deployed'
"

echo -e "${BLUE}[5/8] 打包后端并构建...${NC}"

# 本地：生成 Prisma 客户端 + 打包服务端源码和客户端
cd "$PROJECT_ROOT/server"
npx prisma generate 2>&1 | tail -2
tar czf /tmp/server_bundle.tar.gz src/ package.json package-lock.json tsconfig.json prisma/ 2>&1
cd node_modules && tar czf /tmp/prisma_client.tar.gz ./.prisma/client ./@prisma/client 2>&1

# 传输到应用服务器
scp -o StrictHostKeyChecking=no -i "$SSH_KEY" -P "$JUMP_PORT" /tmp/server_bundle.tar.gz "root@$JUMP_HOST:/tmp/"
scp -o StrictHostKeyChecking=no -i "$SSH_KEY" -P "$JUMP_PORT" /tmp/prisma_client.tar.gz "root@$JUMP_HOST:/tmp/"
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" -p "$JUMP_PORT" "root@$JUMP_HOST" \
  "scp -o StrictHostKeyChecking=no -i ~/.ssh/jump_to_app -P '$APP_PORT' /tmp/server_bundle.tar.gz 'root@$APP_HOST:/tmp/' && scp -o StrictHostKeyChecking=no -i ~/.ssh/jump_to_app -P '$APP_PORT' /tmp/prisma_client.tar.gz 'root@$APP_HOST:/tmp/'"

# 服务器端：更新源码 + Prisma 客户端 + 编译 + 重启
remote_cmd "
  export PATH=\"$NODE_BIN:$PSQL_BIN:/usr/local/bin:/usr/bin:/bin\"
  cd $APP_DIR/server/server && tar xzf /tmp/server_bundle.tar.gz && rm /tmp/server_bundle.tar.gz
  cd $APP_DIR/server/server/node_modules && rm -rf .prisma/client @prisma/client && tar xzf /tmp/prisma_client.tar.gz && rm /tmp/prisma_client.tar.gz
  cd $APP_DIR/server/server && npm run build && systemctl restart canvas-api && sleep 2
  systemctl status canvas-api --no-pager | head -5
"

echo -e "${BLUE}[6/8] 运行数据库迁移...${NC}"

# 打包本地 migration SQL 文件
MIGRATION_DIR="$PROJECT_ROOT/server/prisma/migrations"
tar czf /tmp/migrations_deploy.tar.gz -C "$MIGRATION_DIR" . 2>/dev/null

# 传输到应用服务器
scp -o StrictHostKeyChecking=no -i "$SSH_KEY" -P "$JUMP_PORT" /tmp/migrations_deploy.tar.gz "root@$JUMP_HOST:/tmp/"
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" -p "$JUMP_PORT" "root@$JUMP_HOST" \
  "scp -o StrictHostKeyChecking=no -i ~/.ssh/jump_to_app -P '$APP_PORT' /tmp/migrations_deploy.tar.gz 'root@$APP_HOST:/tmp/'"

# 按序执行迁移 SQL（ON_ERROR_STOP=0 使已应用的迁移跳过不报错）
remote_cmd "
  export PATH=\"$PSQL_BIN:\$PATH\"
  MIG_TMP=/tmp/migrations_deploy
  mkdir -p \$MIG_TMP && tar xzf /tmp/migrations_deploy.tar.gz -C \$MIG_TMP 2>/dev/null
  for dir in \$MIG_TMP/*/; do
    [ -d \"\$dir\" ] || continue
    sql_file=\"\$dir/migration.sql\"
    [ -f \"\$sql_file\" ] || continue
    mig_name=\$(basename \"\$(dirname \"\$sql_file\")\")
    echo \"  ? \$mig_name\"
    psql -U postgres -v ON_ERROR_STOP=0 -d ai_canvas -f \"\$sql_file\" 2>&1 | tail -1
  done
  rm -rf \$MIG_TMP /tmp/migrations_deploy.tar.gz
  echo '迁移完成'
"

echo -e "${BLUE}[7/8] 同步模型配置...${NC}"

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

echo -e "${BLUE}[8/8] 验证...${NC}"
sleep 1
remote_cmd "curl -s http://127.0.0.1:3000/api/health"
echo ""

echo -e "${GREEN}=== 部署完成 ===${NC}"
echo "应用服务器: http://$APP_HOST:5179"
echo "负载均衡入口: http://163.61.202.138:18080"
