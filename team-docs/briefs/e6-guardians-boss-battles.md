# E6 Brief — Boss Battles: "Guardians of the Storm" (epic myth-battle competition mode)

Context: EliteKids platform (/var/www/html/elite-kids). Supervisor asks for a God-of-War-style epic boss-battle competition for kids. We take the GENRE — mythological bosses, health bars, combo chains, rage meter, power-ups, term-end mega event — NOT Sony's IP.

⚠️ IP RULE (hard): NEVER use or reference Sony's God of War characters/items/names (Kratos, Atreus, Leviathan Axe, Blades of Chaos, Mimir, Ragnarök as a product name). Original characters only. RECOMMENDED SKIN: Nigerian/African mythology originals — more resonant for our kids than a Norse copy:
  - Ṣàngó, Guardian of Thunder (rage meter = ⚡ Thunder Fury)
  - Anansi the Web-Trickster (riddle/word bosses)
  - Queen Amina's Fortress Gate (math siege)
  - The Great Baobab Spirit (nature/science guardian)
Kid-safety framing: bosses are ancient GUARDIANS OF KNOWLEDGE you outwit — never kill. No gore, no death. Wrong answers drain your shield; at zero you "retreat and regroup" with encouragement copy, then retry. Boss victory animation = guardian bows and shares its wisdom (a lesson takeaway line).

## STEPS

1. **STEP 1 — Engine: 'boss' game mode.**
   Reuse existing config pipeline (kids_game_configs). New mode `boss` accepted wherever learning/practice/test modes flow (GamePlay validUrlMode family + backend mode validation list {learning,practice,test} stays UNTOUCHED for progress gating — boss is an EVENT layer on top of published configs, it does NOT satisfy the practice+test gate E3f).
   Config fields (additive JSON): boss_theme (slug→character art/sfx pack), boss_hp = questions × dmg_per_correct, dmg_per_correct default 1, rage_questions 3.
   CHECKPOINT appended to team-docs/reports/e6-progress.md.

2. **STEP 2 — Battle mechanics frontend (GamePlay boss skin).**
   Boss sprite top w/ HP bar draining per correct answer (strike animation + screen shake-lite). Combo counter: consecutive correct ×N shown as 🔥 chain. RAGE METER fills every 3-in-a-row → next 3 questions deal DOUBLE damage, meter burns with ⚡ animation + drum-hit SFX.
   Power-ups banked from PRACTICE performance (ties modes together: great practice earns arsenal): 🪤 Hint Charm (=50/50 remove two wrong options), ⚔️ Double Strike (next question worth 2 hits), 🛡️ Amina's Shield (absorbs one wrong answer). Bank stored client-side per child (localStorage) v1; server-side later if abused.
   Wrong answer: boss counterattacks, shield energy −1; zero → "Retreat & Regroup" screen w/ one-tap retry (no shame copy).
   tsc clean; build ✓. Backups .bak-e6.
   CHECKPOINT appended.

3. **STEP 3 — Runs table + raid aggregation.**
   elite_content: `kids_boss_runs` (id PK BIGINT, child_admission_no, school_id, class_code, lesson_id, config_id, score TINYINT, combo_max SMALLINT, victories SMALLINT DEFAULT 0, rage_used TINYINT, duration_s INT, created_at).
   CLASS RAID: staff can flag a config as raid_boss=1 for a window — all participants' damage sums into ONE boss HP bar on StudentHome ("The class fights Ṣàngó together!") — async contribution, pairs perfectly with E5 group mode. GET /kids/boss/raid-state endpoint.
   CHECKPOINT appended.

4. **STEP 4 — Term-end Festival of Guardians (Ragnarök-slot, original name).**
   Last academic week: staff schedules a Festival — series-wide mega raid + individual leaderboard snapshot; podium (E5 tournaments type='trophy') mints exclusive 🌟 Guardian badges into kids_badges. Badge names: "Voice of Ṣàngó", "Anansi's Riddle-Master", "Amina's Shield-Bearer".
   CHECKPOINT appended.

5. **STEP 5 — Tests + smoke.**
   Jest: boss run insert on complete; raid aggregation math; badge mint idempotent; boss mode does NOT mark lesson complete (gate integrity!). Phone smoke: open boss-configured game → HP bar present → submit correct → HP drops (DOM assert). Report → team-docs/reports/e6-report.md.
   CHECKPOINT appended.

## FREEBUFF TASKS (C7 — content/docs/QA ONLY — this brief is mostly YOURS)
- Character bible: 6+ Guardians w/ kid-safe lore (2 lines each), strengths mapped to subjects (Ṣàngó=Math? Anansi=English phonics riddles? Amina=Number sieges?) — propose mapping, supervisor approves.
- Copy pass: strike lines, retreat-encouragement lines (10 variants, zero shame), victory wisdom quotes (one real lesson takeaway per boss).
- SFX/art direction doc: drum hits, thunder rumble, no scary screams; asset sourcing list (open-license).
- QA checklist: full boss loop incl. rage trigger, power-up spend, raid contribution visible.
- Teacher guide: "How to schedule a Class Raid / Festival of Guardians".

## GATES
- Zero Sony IP strings anywhere (`grep -ri "kratos\|leviathan\|blades of chaos" frontend/src backend/src` → clean).
- Lesson-completion gate untouched: boss runs never satisfy practice+test rule (test proves it).
- No admission_no in raid state payloads; class-scoped only. Zero NEW jest failures vs baseline.

## RULES
- Work only under /var/www/html/elite-kids. Never print secrets/tokens/.env values. No git commit/push. Additive-only schema.
- Boss is celebration layer — core learn→practice→test ladder (E3f) remains the spine.
- If any gate fails twice, STOP → team-docs/reports/e6-obstacles.md.
