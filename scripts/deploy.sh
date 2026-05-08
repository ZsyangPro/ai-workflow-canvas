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

GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

remote_cmd() {
  # Escape ' → '\'' so the command survives wrapping in '$1' single quotes
  local esc="'\''"
  local cmd="${1//\'/$esc}"
  ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" -p "$JUMP_PORT" "root@$JUMP_HOST" \
    "ssh -o StrictHostKeyChecking=no -i ~/.ssh/jump_to_app -p '$APP_PORT' 'root@$APP_HOST' '$cmd'"
}

# ====== 前端：画布应用 ======

echo -e "${BLUE}[1/10] 构建前端（画布）...${NC}"
cd "$PROJECT_ROOT/ai-workflow-canvas-vue"
npx vite build --outDir dist 2>&1 | tail -3

echo -e "${BLUE}[2/10] 构建前端（管理端）...${NC}"
cd "$PROJECT_ROOT/admin-app"
npx vite build --outDir dist 2>&1 | tail -3

echo -e "${BLUE}[3/10] 打包 + 传输前端...${NC}"
tar czf /tmp/frontend_dist_deploy.tar.gz -C "$PROJECT_ROOT/ai-workflow-canvas-vue" dist/
tar czf /tmp/admin_dist_deploy.tar.gz -C "$PROJECT_ROOT/admin-app" dist/

scp -o StrictHostKeyChecking=no -i "$SSH_KEY" -P "$JUMP_PORT" /tmp/frontend_dist_deploy.tar.gz /tmp/admin_dist_deploy.tar.gz "root@$JUMP_HOST:/tmp/"
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" -p "$JUMP_PORT" "root@$JUMP_HOST" \
  "scp -o StrictHostKeyChecking=no -i ~/.ssh/jump_to_app -P '$APP_PORT' /tmp/frontend_dist_deploy.tar.gz /tmp/admin_dist_deploy.tar.gz 'root@$APP_HOST:/tmp/'"

echo -e "${BLUE}[4/10] 部署前端...${NC}"
remote_cmd "
  rm -rf $APP_DIR/frontend/*
  cd /tmp && tar xzf frontend_dist_deploy.tar.gz && cp -r dist/* $APP_DIR/frontend/ && rm -rf /tmp/frontend_dist_deploy.tar.gz /tmp/dist
  mkdir -p $APP_DIR/admin
  rm -rf $APP_DIR/admin/*
  cd /tmp && tar xzf admin_dist_deploy.tar.gz && cp -r dist/* $APP_DIR/admin/ && rm -rf /tmp/admin_dist_deploy.tar.gz /tmp/dist
  echo 'Frontend + Admin deployed'
"

# ====== 后端 ======

echo -e "${BLUE}[5/10] 打包后端并构建...${NC}"

cd "$PROJECT_ROOT/server"
npx prisma generate 2>&1 | tail -2
tar czf /tmp/server_bundle.tar.gz src/ package.json package-lock.json tsconfig.json prisma/ 2>&1
cd node_modules && tar czf /tmp/prisma_client.tar.gz ./.prisma/client ./@prisma/client 2>&1

scp -o StrictHostKeyChecking=no -i "$SSH_KEY" -P "$JUMP_PORT" /tmp/server_bundle.tar.gz "root@$JUMP_HOST:/tmp/"
scp -o StrictHostKeyChecking=no -i "$SSH_KEY" -P "$JUMP_PORT" /tmp/prisma_client.tar.gz "root@$JUMP_HOST:/tmp/"
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" -p "$JUMP_PORT" "root@$JUMP_HOST" \
  "scp -o StrictHostKeyChecking=no -i ~/.ssh/jump_to_app -P '$APP_PORT' /tmp/server_bundle.tar.gz 'root@$APP_HOST:/tmp/' && scp -o StrictHostKeyChecking=no -i ~/.ssh/jump_to_app -P '$APP_PORT' /tmp/prisma_client.tar.gz 'root@$APP_HOST:/tmp/'"

remote_cmd "
  export PATH=\"$NODE_BIN:$PSQL_BIN:/usr/local/bin:/usr/bin:/bin\"
  cd $APP_DIR/server/server && tar xzf /tmp/server_bundle.tar.gz && rm /tmp/server_bundle.tar.gz
  cd $APP_DIR/server/server/node_modules && rm -rf .prisma/client @prisma/client && tar xzf /tmp/prisma_client.tar.gz && rm /tmp/prisma_client.tar.gz
  cd $APP_DIR/server/server && npm run build && systemctl restart canvas-api && sleep 2
  systemctl status canvas-api --no-pager | head -5
"

# ====== 数据库迁移 ======

echo -e "${BLUE}[6/10] 运行数据库迁移...${NC}"

MIGRATION_DIR="$PROJECT_ROOT/server/prisma/migrations"
tar czf /tmp/migrations_deploy.tar.gz -C "$MIGRATION_DIR" . 2>/dev/null

scp -o StrictHostKeyChecking=no -i "$SSH_KEY" -P "$JUMP_PORT" /tmp/migrations_deploy.tar.gz "root@$JUMP_HOST:/tmp/"
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" -p "$JUMP_PORT" "root@$JUMP_HOST" \
  "scp -o StrictHostKeyChecking=no -i ~/.ssh/jump_to_app -P '$APP_PORT' /tmp/migrations_deploy.tar.gz 'root@$APP_HOST:/tmp/'"

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
  echo 'Schema migration done'
"

echo -e "${BLUE}[7/10] 数据迁移（ADMIN → SUPER_ADMIN）...${NC}"

echo "UPDATE \"User\" SET \"role\" = 'SUPER_ADMIN' WHERE \"role\" = 'ADMIN';" > /tmp/role_migrate.sql

scp -o StrictHostKeyChecking=no -i "$SSH_KEY" -P "$JUMP_PORT" /tmp/role_migrate.sql "root@$JUMP_HOST:/tmp/"
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" -p "$JUMP_PORT" "root@$JUMP_HOST" \
  "scp -o StrictHostKeyChecking=no -i ~/.ssh/jump_to_app -P '$APP_PORT' /tmp/role_migrate.sql 'root@$APP_HOST:/tmp/'"

remote_cmd "
  export PATH=\"$PSQL_BIN:\$PATH\"
  psql -U postgres -d ai_canvas -f /tmp/role_migrate.sql && rm /tmp/role_migrate.sql
  echo 'Role migration done'
"

# ====== 模型同步 ======

echo -e "${BLUE}[8/10] 同步模型配置...${NC}"

cd "$PROJECT_ROOT"
LOCAL_DB_URL="postgresql://zsyang@localhost:5432/ai_canvas" npx tsx scripts/sync-models.ts 2>/dev/null > /tmp/model_sync.sql

scp -o StrictHostKeyChecking=no -i "$SSH_KEY" -P "$JUMP_PORT" /tmp/model_sync.sql "root@$JUMP_HOST:/tmp/"
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" -p "$JUMP_PORT" "root@$JUMP_HOST" \
  "scp -o StrictHostKeyChecking=no -i ~/.ssh/jump_to_app -P '$APP_PORT' /tmp/model_sync.sql 'root@$APP_HOST:/tmp/'"

remote_cmd "
  export PATH=\"$PSQL_BIN:\$PATH\"
  psql -U postgres -d ai_canvas -f /tmp/model_sync.sql && rm /tmp/model_sync.sql
"
echo "模型配置已同步"

# ====== Nginx 配置 ======

echo -e "${BLUE}[9/10] 更新 Nginx 配置...${NC}"

cat > /tmp/nginx_admin_block << 'NGINX_BLOCK'

    location /admin {
        alias /var/www/ai-canvas/admin;
        try_files $uri $uri/ /admin/index.html;
    }
NGINX_BLOCK

scp -o StrictHostKeyChecking=no -i "$SSH_KEY" -P "$JUMP_PORT" /tmp/nginx_admin_block "root@$JUMP_HOST:/tmp/"
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" -p "$JUMP_PORT" "root@$JUMP_HOST" \
  "scp -o StrictHostKeyChecking=no -i ~/.ssh/jump_to_app -P '$APP_PORT' /tmp/nginx_admin_block 'root@$APP_HOST:/tmp/'"

remote_cmd "
  if grep -q /admin /etc/nginx/conf.d/ai-canvas.conf 2>/dev/null; then
    echo /admin-already-configured
  else
    cat /tmp/nginx_admin_block >> /etc/nginx/conf.d/ai-canvas.conf
    rm /tmp/nginx_admin_block
    systemctl reload nginx
    echo /admin-added-nginx-reloaded
  fi
"

# ====== 验证 ======

echo -e "${BLUE}[10/10] 验证...${NC}"
sleep 1
remote_cmd "curl -s http://127.0.0.1:3000/api/health"
echo ""

echo -e "${GREEN}=== 部署完成 ===${NC}"
echo "画布应用:   http://$APP_HOST:5179"
echo "管理端:     http://$APP_HOST:5179/admin"
echo "负载均衡:   http://163.61.202.138:18080"
echo "管理端(LB): http://163.61.202.138:18080/admin"
echo ""
echo -e "${BLUE}⚠ 第一次部署需要手动操作：${NC}"
echo "1. nginx 添加 /admin 路径配置后 reload"
echo "2. 用 admin / 111111 登录管理端"
