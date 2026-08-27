# E5 Freebuff Deliverables — Competition Engine

> C7 docs/QA/content only. No app code modified.
> Date: 2026-08-24

---

## 1. QA Checklist — Tug-of-War + Tournaments

### 1.1 Tug-of-War Happy Path

| # | Step | Assertion | Pass/Fail |
|---|---|---|---|
| 1 | Staff creates tug match → title "Science Week Pull!", class P2-A, start now | POST /kids/tug-matches returns 200; status = "active" | |
| 2 | Staff opens match → auto-assigns 2 teams | 8 students assigned to Team Red, 7 to Team Blue (auto-balance) | |
| 3 | Amara (Team Red) plays a game → completes | +15 pts → tug event inserted for Team Red; rope moves toward Red | |
| 4 | Chidi (Team Blue) plays a game → completes | +12 pts → tug event inserted for Team Blue; rope recalculated | |
| 5 | GET /kids/competition/state (Amara) | `my_team: "A"`, `rope_pct` reflects (Red − Blue) balance, `my_match_contribution: 15` | |
| 6 | GET /kids/competition/state (Chidi) | `my_team: "B"`, same rope_pct, `my_match_contribution: 12` | |
| 7 | Staff clicks "End Match" | `winner_team` set to correct winner based on sum of events; status → "ended" | |
| 8 | Student views ended match | Shows "Team Red wins! 🏆" with final score | |
| 9 | Staff starts a new match for same class | New match appears; old one archived | |

### 1.2 Rubber-Band (Anti-Blout) Verification

| # | Step | Assertion | Pass/Fail |
|---|---|---|---|
| 10 | Team A is ahead by 200 pts → Team B scores 10 pts | Team B's event stores 10 × 1.15 = 12 pts (rounded) | |
| 11 | Team A is ahead by 400 pts → Team B scores 10 pts | Team B's event stores 10 × 1.15 = 12 pts (rubber-band still active) | |
| 12 | Teams are even → Team A scores 10 pts | No multiplier — stores 10 pts flat | |
| 13 | Team B is ahead → Team A scores 10 pts | Team A gets the ×1.15 boost instead | |
| 14 | Rope math: teams at 250 vs 100 pts, swing_cap=500 | `rope_pct = clamp(50 + (250−100)/(2×500) × 100, 0, 100) = 65%` | |

### 1.3 Individual Tournaments

| # | Step | Assertion | Pass/Fail |
|---|---|---|---|
| 15 | Staff creates tournament: "Math Champion Week", type=individual, 1 week | POST /kids/tournaments returns 200 | |
| 16 | 3 students play games during the week | scores accumulate in tournament window | |
| 17 | Tournament ends (lazy rollover or manual end) | standings computed; podium_json = {first, second, third} | |
| 18 | Badges minted | kids_badges has 🥇🥈🥉 rows for top 3 with tournament title | |
| 19 | Re-run end (idempotency) | No duplicate badges minted; same podium returned | |
| 20 | Student sees podium in Trophy Board tab | Shows 🥇 Amara K. — 150 pts, 🥈 Chidi N. — 130 pts, 🥉 Fatima O. — 115 pts | |

### 1.4 Privacy & Scope

| # | Step | Assertion | Pass/Fail |
|---|---|---|---|
| 21 | Student from School A queries competition state | Returns only School A matches; no School B data | |
| 22 | Student queries state with no active match | Returns `active_tournament: null`, `rope_pct: null` | |
| 23 | grep "admission_no" in GET /kids/competition/state response | NOT PRESENT — only first_name + last_initial in entries | |
| 24 | Staff from School A tries to end School B's match | 403 or 404 | |
| 25 | Unauthenticated GET /kids/competition/state | 401 | |

### 1.5 Edge Cases

| # | Scenario | Expected | Pass/Fail |
|---|---|---|---|
| 26 | Match already ended → game-complete fires | tugHook finds no active match → no event inserted (graceful no-op) | |
| 27 | No students in class when match created | Match created; auto-assign does nothing; rope at 50% | |
| 28 | Student plays while not assigned to any team | Auto-assign on first game-complete (alternating or by trailing avg) | |
| 29 | Two matches active for same class | Only latest active match gets events (or error — depends on impl) | |
| 30 | Swing cap reached (rope at 0% or 100%) | Clamp holds; no blowout beyond bounds | |

---

## 2. Copy Pass — Match Titles, Empty-States, Rubber-Band Explainer

### 2.1 Match / Tournament Titles

| Context | Title suggestion |
|---|---|
| Staff creating a tug match | "Science Week Pull!", "Literacy Battle", "Math Mayhem", "Phonics Tug", "Numbers Knockout" |
| Staff creating an individual tournament | "Math Champion 🏅", "Spelling Bee Champion", "Reading Star of the Week", "Phonics Master 🎯" |
| Student sees active match on Home | "🪢 Class Tug-of-War: {title}" |
| Student sees active tournament on Trophy Board | "🏆 {title} — Ends {date}" |

### 2.2 Empty-State Copy

| Screen | Primary copy | Subcopy |
|---|---|---|
| Student Home — no active tug match | 🪢 No tug happening right now | Ask your teacher to start a new match! Every game you play helps pull the rope for your team. |
| Student Home — no active tournament | 🏆 No tournament yet | Your teacher can start a competition anytime. Keep practicing — you might be the champion! |
| Staff — no matches created | 🪢 Start a Tug-of-War! | Split your class into two teams and let them compete. Every game pulls the rope — the winning team celebrates together! |
| Staff — no tournaments created | 🏆 Create a Tournament | Set up an individual competition. Students compete for 1st, 2nd, and 3rd place on the podium. |
| Student Home — match ended, no new one | 🪢 Match finished! | Great job, everyone! Check back soon for the next tug-of-war. |
| Student — not on any team | You're not on a team yet! | Play any game in this class and you'll be auto-assigned to a team. |

### 2.3 Rubber-Band Explainer (for Teacher Guide)

> **🪢 The "Little Wind" Rule — Keeping It Fair**
>
> Have you noticed the trailing team sometimes scores extra points? That's the **rubber-band rule** — like a little wind behind the team that's falling behind.
>
> **How it works:** When a team is behind, each point they earn gets a small bonus (×1.15). This means:
> - A kid on the trailing team who scores 10 points actually contributes **12 points** to their team.
> - The leading team scores at normal rate — no penalty.
> - Once the teams are even, the bonus stops.
>
> **Why?** Research shows kids disengage when their team is "already losing." The rubber band keeps everyone in the game and teaches that effort always matters — especially when things are tough.
>
> **Can it flip the result?** Only if the trailing team genuinely plays more. The bonus is small enough that a truly dominant team still wins — but it keeps the match exciting until the end.

### 2.4 In-Game Toast / Feedback Copy

| Event | Toast for student |
|---|---|
| Game complete (team A) | +{pts} pts for {Team Red/Blue}! 🪢 |
| Game complete (team B) | +{pts} pts for {Team Red/Blue}! 🪢 |
| Rubber-band active | 🌬️ Bonus! +{boosted_pts} for {trailing team} (trailing team bonus!) |
| Match ended | 🏆 Match over! {Winner team} wins with {score} pts! |
| Tournament ended | 🏆 Tournament over! Check the podium on the Trophy Board! |
| Tournament podium | 🥇 {first}, 🥈 {second}, 🥉 {third} — well done! |

---

## 3. Teacher Guide Section — Group vs Individual Mode

### When to Use Group Tug-of-War 🪢

**Choose Tug-of-War when:**
- You want to build **teamwork and class spirit** — kids root for each other.
- The lesson is something everyone can do (review, practice, warm-up).
- You want **every child to feel they contributed**, even if they're not the fastest.
- You're running a **low-stakes fun activity** — Friday afternoons, review sessions.
- You want to **mix ability levels** — auto-assign balances teams so stronger kids don't all end up together.

**Best practices:**
- Rotate teams every match so kids work with different classmates.
- Celebrate the whole team, not just the top scorer.
- Use the "little wind" rule to explain resilience: "Even when you're behind, your effort counts double!"
- Great for Phonics review, Math speed rounds, and Science quizzes.

### When to Use Individual Tournaments 🏆

**Choose Tournaments when:**
- You want to identify **individual strengths** — who's fastest at Math? Who's the best speller?
- You're preparing for **term-end awards** or need merit-list data.
- Students are **self-motivated** and respond to personal competition.
- You want **podium recognition** — kids love seeing their name on 1st/2nd/3rd.
- The content is **differentiated** — each child works at their own level.

**Best practices:**
- Set a clear start/end window (1 week is ideal).
- Announce the tournament in advance so kids are motivated to practice.
- Use the podium badges as a real reward — kids can show them on their profile.
- Pair with the Leaderboard tab so students can track their progress.
- Great for Math challenge weeks, spelling bees, and reading goals.

### Side-by-Side Comparison

| Feature | Tug-of-War 🪢 | Tournament 🏆 |
|---|---|---|
| **Competition type** | Team vs Team | Individual |
| **How points count** | All team members' points combine | Each child's points are their own |
| **Winner** | One team (Red or Blue) | Top 3 individuals |
| **Awards** | Team victory celebration | 🥇🥈🥉 badges + podium |
| **Best for** | Review, warm-ups, team spirit | Assessments, challenges, motivation |
| **Rubber-band bonus** | Yes (trailing team gets boost) | No |
| **Can run simultaneously** | One active match per class | One active tournament per class |
| **Recommended duration** | 1–3 days | 1 week |

---

## 4. Mascot / Team Name Suggestions

### For Tug-of-War Team Pickers (Kid-Safe, Nigerian-Flavored)

These names are designed to be fun, culturally resonant, and easy for young children to remember. Each pair is balanced so neither team sounds "weaker."

#### Pair Set 1 — Animals (most universal)

| Team A | Team B |
|---|---|
| 🦁 Lions | 🐘 Elephants |
| 🐓 Roosters | 🐐 Goats |
| 🦅 Eagles | 🐢 Tortoises |
| 🐆 Leopards | 🦬 Buffaloes |
| 🐒 Monkeys | 🦜 Parrots |

#### Pair Set 2 — Nature & Weather

| Team A | Team B |
|---|---|
| ⚡ Thunder | 🌧️ Rain |
| ☀️ Sun | 🌙 Moon |
| 🌳 Baobab | 🌿 Grassland |
| 🔥 Fire | 💧 Water |
| ⛰️ Mountain | 🌊 River |

#### Pair Set 3 — Nigerian Flavour

| Team A | Team B |
|---|---|
| 🌅 Lagos Stars | 🏔️ Abuja Cubs |
| 🥁 Drummers | 🪘 Dancers |
| 🛡️ Warriors | 🎨 Artists |
| 📚 Scholars | 🎵 Singers |
| 🌾 Farmers | 🐟 Fishers |

#### Pair Set 4 — Fun / Abstract

| Team A | Team B |
|---|---|
| 🔴 Red Rockets | 🔵 Blue Blasters |
| 🟡 Gold Sparks | 🟢 Green Giants |
| ⭐ Starfish | 🌈 Rainbows |
| 🎯 Sharpshooter | 🧩 Puzzle Masters |
| 🚀 Rockets | 🎈 Balloons |

### Usage in UI

- When staff creates a tug match, offer **4 random pair sets** to choose from (or "Custom Names" for teacher input).
- Kids see their team name + mascot emoji on the rope meter card.
- Default if no selection: auto-pick random pair.

---

*E5 Freebuff deliverables — C7 docs/QA/content only. No app code modified.*
