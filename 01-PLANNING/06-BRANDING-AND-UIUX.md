# Branding & UI/UX Design Spec — elitekids.com.ng

EliteKids is the fourth product in the Elite family (EliteCore, EliteCampus, EliteCBT,
EliteKids). It shares the ecosystem design system — **same color system and login
shell, differentiated by logo/mascot and tone** (EliteKids warmer/playful).

## Brand colors (shared across the Elite family)
| Role | Color | Hex | Use |
| --- | --- | --- | --- |
| Primary | Yale Blue | `#0F4D92` | Nav, primary buttons, headers, active states |
| Accent | Harvard Red | `#C90016` | CTAs, alerts, badges, reward highlights (sparingly) |
| Primary tint | Yale Blue 10% | `#E7EEF6` | Backgrounds, cards, hover states |
| Neutral dark | Charcoal | `#1E1E24` | Body text |
| Neutral light | Off-white | `#FAFAFA` | App background |
| Success | Green | `#2E7D32` | Correct answers, completion |
| Warning/soft accent | Gold | `#F2A900` | Stars/rewards (pairs with both brand colors) |

EliteKids extras (playful, child-friendly but still on-family):
- Soft pastel accents for age-level theming (per level: Creche/Nursery/KG1/KG2/Primary)
  used inside the *play* experience only — the login/app shell stays Yale Blue.
- Round, friendly corner radius (10–14px) on kid-facing cards; inputs/buttons keep the
  family's ~8–10px radius.

## Login page — EliteCore as-built reference (from the supplied screenshots)
- **Desktop:** split-screen ~50/50. Left = solid Yale-Blue gradient panel with the
  wordmark (red "e" + blue "lite CORE"), tagline "Empowering Education Through
  Innovative Technology", a school pill, a short feature list, and a "Powered by Elite
  Edu Tech Systems" footer. Right = white panel with the form.
- **Mobile:** stacks vertically — brand panel on top, form below, full width.
- **Form:** circular school crest at top, "Welcome to [School Name]" in Yale Blue bold,
  gray subtitle, segmented pill toggle (active tab filled Yale Blue, inactive
  outlined), icon-prefixed rounded inputs (building/person/lock icons), "Remember Me"
  + "Forgot Password?" in Harvard Red text, full-width Yale Blue "Sign In" button, OR
  divider, outlined secondary button, then a 2×2 grid of outlined quick-access role
  buttons (Admin / Teacher / Parent / Student), then an "Apply for Admission" button.
- Floating chat bubble bottom-right (support widget).

## EliteKids login adjustments (same family, warmer tone)
- Keep the split-screen desktop / stacked mobile layout, crest + welcome text +
  segmented toggle + icon-prefixed rounded inputs — identical structure.
- **Wordmark:** "Elite Kids" — Yale Blue base with a playful mascot/illustration on the
  brand panel instead of EliteCore's plain gradient + feature list (audience includes
  young children and parents).
- **Segmented toggle:** "Teacher / Parent" (instead of Login / Student Login). Children
  never log in — parents pick the child after login.
- **Harvard Red** exactly where EliteCore uses it: link text and attention actions only
  (`Forgot Password?`), never as a button fill.
- Keep the Quick Demo Access grid (Teacher / Parent / Admin) for pilot-school demos.
- Footer: "Powered by Elite Edu Tech Systems" — consistent with the family.

## School skinning (the addon branding approach — same as elite-cbt)
- Subdomain → school: `<school>.elitekids.com.ng` resolves via
  `school_setup.short_name` (`GET /schools/get-details`).
- The login page renders the school's crest (`badge_url`), school name, motto — and the
  school's `kids_stand_alone` gate: if the module is off, show the "Access Restricted"
  card (copy `elite-cbt`'s pattern).
- Per-school color overrides (if EliteCore later supports skin colors via `TenantSkin`,
  read them the same way; MVP uses the fixed family palette + crest).

## Consistency across the Elite ecosystem
All four products share: the same color system, the same login shell, the same
"Powered by Elite" footer, the same subdomain→school resolution. Differentiated only
by logo/mascot and tone. One design system, per-product skin.

## Assets needed (add before Sprint 3 frontend work)
- Elite Kids wordmark/logo (SVG + PNG), favicon, mascot character
- Font files (match family typography)
- Place in `frontend/src/assets/` (mirror elite-cbt's asset layout)
- Character rig + background library (licensed/commissioned — see
  10-VIDEO-ANIMATION-ARCHITECTURE-REVISION.md) under `game-engine/assets/`
