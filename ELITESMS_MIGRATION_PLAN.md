# EliteSMS Unified Deployment — Migration Plan

## 🎯 Goal

Merge `elite-core` (frontend) and `elite-api` (backend) into a single repo structure like EliteFin:

```
elite-sms/                    # NEW unified repo
├── frontend/                 # React + Vite (from elite-core)
├── backend/                  # Node.js + Express (from elite-api)
├── .github/workflows/        # ONE workflow deploys both
├── ARCHITECTURE.md
├── README.md
└── AGENTS.md
```

**Benefits:**
- ✅ One repo = One deployment = One thing to manage
- ✅ Same pattern as EliteFin (proven approach)
- ✅ Single GitHub Actions workflow for both frontend + backend
- ✅ Easier to maintain and onboard new developers
- ✅ Atomic commits (frontend + backend changes together)

---

## 📋 Current State

| Component | Current Repo | Current Deployment |
|-----------|-------------|-------------------|
| Frontend | `elite-core` | go54 cPanel (elitecore.com.ng) |
| Backend | `elite-api` | VPS systemd (port 8383) |

---

## 🎯 Target State

| Component | New Location | New Deployment |
|-----------|-------------|----------------|
| Frontend | `elite-sms/frontend/` | VPS nginx (elitecore.com.ng) |
| Backend | `elite-sms/backend/` | VPS systemd (port 8383) |

**Key change:** Frontend moves from go54 cPanel to VPS behind nginx.

---

## 🔧 Migration Steps

### Phase 1: Create Unified Repo Structure

```bash
# Create new directory structure
mkdir -p elite-sms/frontend
mkdir -p elite-sms/backend

# Copy frontend (elite-core → elite-sms/frontend)
cp -r elite-core/src elite-sms/frontend/
cp elite-core/package.json elite-sms/frontend/
cp elite-core/vite.config.ts elite-sms/frontend/
cp elite-core/tsconfig.json elite-sms/frontend/
cp elite-core/index.html elite-sms/frontend/
cp elite-core/tailwind.config.ts elite-sms/frontend/
cp -r elite-core/public elite-sms/frontend/
cp -r elite-core/.github elite-sms/

# Copy backend (elite-api → elite-sms/backend)
cp -r elite-api/src elite-sms/backend/
cp elite-api/package.json elite-sms/backend/
cp elite-api/.babelrc elite-sms/backend/
cp elite-api/.env.example elite-sms/backend/
```

### Phase 2: Update Import Paths

Frontend imports that reference `elite-api` need updating:

```typescript
// OLD
import { server_url } from '../Utils/Helper';

// NEW (same pattern, but now within unified repo)
import { server_url } from '../Utils/Helper';
```

**Note:** Most imports are relative, so they should work without changes.

### Phase 3: Create Unified Deployment Workflow

```yaml
# .github/workflows/deploy-selfhosted.yml
name: Deploy EliteSMS to VPS

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: self-hosted
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      # ── Backend ──
      - name: Install backend deps
        run: cd backend && npm install --production

      - name: Run migrations
        run: cd backend && npm run migrate 2>&1 || echo "Migration skipped"

      - name: Deploy backend
        run: |
          rsync -av --delete \
            --exclude node_modules \
            --exclude .env \
            --exclude logs \
            backend/ /var/www/html/elite/elite-sms/backend/

      # ── Frontend ──
      - name: Install frontend deps
        run: cd frontend && npm install

      - name: Build frontend
        run: cd frontend && npm run build

      - name: Deploy frontend
        run: |
          rsync -av --delete \
            frontend/dist/ /var/www/html/elite/elite-sms/frontend/dist/

      # ── Services ──
      - name: Setup systemd service
        run: |
          sudo tee /etc/systemd/system/elite-sms.service > /dev/null << 'EOF'
          [Unit]
          Description=Elite SMS API Server
          After=network.target mysql.service

          [Service]
          Type=simple
          User=dev
          Group=dev
          WorkingDirectory=/var/www/html/elite/elite-sms/backend
          ExecStart=/usr/bin/node src/index.js
          Restart=on-failure
          RestartSec=10
          Environment=NODE_ENV=production
          Environment=PORT=8383
          LimitNOFILE=65536
          MemoryMax=512M

          [Install]
          WantedBy=multi-user.target
          EOF

      - name: Restart services
        run: |
          sudo systemctl daemon-reload
          sudo systemctl enable elite-sms
          sudo systemctl restart elite-sms
          sleep 3

      - name: Health check
        run: |
          if sudo systemctl is-active --quiet elite-sms; then
            echo "✓ elite-sms service running"
            curl -sf http://127.0.0.1:8383/health || echo "Health check failed"
          else
            echo "✗ elite-sms FAILED"
            sudo journalctl -u elite-sms -n 20 --no-pager
            exit 1
          fi
```

### Phase 4: Update nginx Config

```nginx
# /etc/nginx/sites-available/elite-sms.conf

upstream elitesms_backend {
    server 127.0.0.1:8383;
    keepalive 32;
}

# Frontend
server {
    listen 443 ssl http2;
    server_name elitecore.com.ng elitesms.com.ng;

    ssl_certificate /etc/letsencrypt/live/elitecore.com.ng/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/elitecore.com.ng/privkey.pem;

    # Frontend static files
    location / {
        root /var/www/html/elite/elite-sms/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API proxy
    location /api/ {
        proxy_pass http://elitesms_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://elitesms_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```

### Phase 5: Migrate Git History (Optional)

If you want to preserve git history:

```bash
# Clone both repos
git clone https://github.com/bits-his/school-management-frontend.git elite-core-temp
git clone https://github.com/bits-his/elscholar-api.git elite-api-temp

# Create new repo with history
mkdir elite-sms
cd elite-sms
git init

# Add frontend history
git remote add frontend ../elite-core-temp
git fetch frontend
git merge frontend/main --allow-unrelated-histories

# Move files to subdirectory
mkdir -p frontend
git mv src/ frontend/
git mv package.json frontend/
# ... move other files

# Add backend
git remote add backend ../elite-api-temp
git fetch backend
git merge backend/main --allow-unrelated-histories

# Move backend files
mkdir -p backend
git mv backend-src/ backend/

# Commit
git add -A
git commit -m "refactor: unify elite-core and elite-api into elite-sms"
```

### Phase 6: Update DNS

Change DNS records:

| Domain | Old Target | New Target |
|--------|-----------|------------|
| `elitecore.com.ng` | go54 cPanel | VPS (62.72.0.209) |
| `elitesms.com.ng` | go54 cPanel | VPS (62.72.0.209) |

### Phase 7: Deploy and Verify

```bash
# On VPS
cd /var/www/html/elite
git clone <new-repo> elite-sms

# Install deps
cd elite-sms/backend && npm install --production
cd elite-sms/frontend && npm install && npm run build

# Setup systemd
sudo systemctl enable elite-sms
sudo systemctl start elite-sms

# Setup nginx
sudo cp bits/nginx/elite-sms.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/elite-sms.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Verify
curl -sf http://127.0.0.1:8383/health
curl -sf https://elitecore.com.ng
```

---

## ⚠️ Rollback Plan

If something goes wrong:

1. **DNS:** Point `elitecore.com.ng` back to go54 cPanel
2. **Backend:** `sudo systemctl restart elite-api` (old service)
3. **Frontend:** Re-deploy to go54 cPanel

---

## 📅 Timeline

| Phase | Duration | Risk |
|-------|----------|------|
| Phase 1: Create structure | 1 day | Low |
| Phase 2: Update imports | 1 day | Low |
| Phase 3: Create workflow | 1 day | Low |
| Phase 4: Update nginx | 1 day | Medium |
| Phase 5: Migrate history | 2 days | Medium |
| Phase 6: Update DNS | 1 hour | High |
| Phase 7: Deploy & verify | 1 day | Medium |

**Total:** ~1 week

---

## ✅ Success Criteria

- [ ] Frontend loads at `elitecore.com.ng`
- [ ] Backend health check passes at `api.elitecore.com.ng/health`
- [ ] Cross-app SSO works (EliteSMS → EliteFin → EliteCBT → EliteKids)
- [ ] RBAC menu loads correctly
- [ ] All user types can login (admin, teacher, parent, student)
- [ ] Single GitHub Actions workflow deploys both frontend + backend

---

*Migration plan by Buffy (Codebuff) — August 29, 2026*
