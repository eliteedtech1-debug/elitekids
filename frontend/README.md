# elite-kids (frontend)

Vite + React + TS SPA for EliteKids. **Reference implementation: `elite-cbt`**
(which itself ports elite-core's Helper.tsx). Served at `<school>.elitekids.com.ng`;
subdomain → school auto-detection → shared-JWT login → parent/teacher dashboards →
Phaser playground.

## Run

```bash
cp .env.example .env   # VITE_API_URL=http://localhost:34600
npm install
npm run dev            # http://localhost:34601
```

## Layout (skeleton)

```
src/lib/utils/constants.ts   API config, storage keys (@@auth_token), routes
src/lib/utils/school.ts      getSubdomain / getSchoolContext / createAuthHeaders / hasKidsAccess
src/lib/api/client.ts        axios + auth/tenant interceptors, 401 → login
src/lib/api/endpoints.ts     matches 02-ELITE-INTEGRATION/03-API-CONTRACT.md
src/pages/Login/Login.tsx    elite login shell (Teacher/Parent toggle, school crest, module gate)
src/components/GameEngine/   Phaser 3 wrapper (README inside)
```

## Not yet implemented (Sprint targets)

- Dashboards (parent stars/badges, teacher engagement, approvals queue)
- Play view + Phaser scenes (Sprint 3)
- Redux/zustand auth store + route guards
- Tailwind theme with the family palette (06-BRANDING-AND-UIUX.md)
