# minetris Roadmap

**Design Thesis:** *"Tetrominos build the world; you mine the world to survive and shape it."*
**Vision:** The first game where Tetris pieces are not puzzles to solve — they're the living, breathing landscape you inhabit, mine, and reshape to survive.
**Source:** <https://github.com/lx-0/minetris>

---

## The North Star

Imagine a game where every session tells a different story. The world is generated in real time by falling Tetris pieces — random, chaotic, beautiful. You're inside it, at ground level, watching mountains of colored blocks grow around you. Your pickaxe is the one thing standing between you and being buried alive.

The more you play, the faster the world builds itself. Your only tools: your pickaxe, your wits, and the blocks you've mined. Mine strategically. Fill the gaps. Trigger line-clears to buy yourself time. Survive longer. Score higher.

That's minetris at v1.0.

---

## Milestone Overview

| # | Milestone | Name | Status | Target | What It Unlocks |
|:--|:----------|:-----|:-------|:-------|:----------------|
| 1 | v0.2 | **Core Game Loop** | ✅ Done | — | An actual game with stakes, objectives, and payoff |
| 2 | v0.3 | **The Loop Closes** | 🔄 Active | — | Full resource cycle: mine → carry → place → clear |
| 3 | v0.4 | **Flow & Feel** | Planned | — | Difficulty curve, juice, and UX that make you want to play again |
| 4 | v0.5 | **Truly Beautiful** | Planned | — | Shaders, bloom, glow trails, sky, explosions — random, chaotic, *beautiful* |
| 5 | v0.6 | **Strategic Depth** | Planned | — | Piece influence, tool tiers, block types — skill ceiling rises |
| 6 | v0.7 | **The Meta** | Planned | — | Cross-session goals, unlockables, daily challenge — reason to return |
| 7 | v1.0 | **Launch** | Planned | — | Polished, shareable, leaderboard-ready — the complete minetris experience |

---

## Milestone 1: Core Game Loop (v0.2) ✅ Done

**Theme:** From tech demo to actual game.

All four foundational features now exist: inventory, line-clear, lose condition, scoring. A player can start a session, mine blocks, accumulate score, lose, and restart. The loop turns.

**Delivered:**
- ✅ Inventory system (mined blocks → HUD; 256 total cap)
- ✅ Line-clear detection, flash animation, score, level drop
- ✅ Game over at height 20 with danger warning at 17
- ✅ Score HUD (score, blocks mined, lines cleared, survival time)
- ✅ Mining feedback: 3-stage crack color, shake, dust particles
- ✅ Piece landing ghost/shadow preview
- ✅ Audio: mining, breaking, line-clear arpeggio
- ✅ Code modularized (12 JS modules)

---

## Milestone 2: The Loop Closes (v0.3) 🔄 Active

**Theme:** The two halves of minetris finally talk to each other.

Right now, mining and Tetris are parallel tracks. When block placement exists and line-clear thresholds are realistic, a player can think strategically for the first time: *"If I fill that hole with this block, I complete the row."* That's the moment the game's thesis becomes real.

**The critical fix:**

> **Line-clear threshold bug (P0):** `LINE_CLEAR_CELLS_NEEDED = 100` in a 50×50 world means line-clears never trigger. The threshold must match a realistic active play area. Recommended: constrain piece spawn to a 10×10 corridor centered on the player, set `LINE_CLEAR_CELLS_NEEDED` to 10–20. This makes line-clears achievable and turns the mechanic from broken-but-present to the heartbeat of every session.

| Feature | Priority | Description |
|:--------|:---------|:------------|
| Fix line-clear threshold | P0 | Match threshold to achievable fill rate; possibly constrain spawn corridor |
| Block placement | P1 | Right-click to place block from inventory onto any surface in reach. Closes the full Minecraft loop. |
| English UI / rename | P1 | Replace all German strings. "KI Welt Baumeister" → "minetris." "Inventar" → "Inventory." Full English first. |
| Player landing push | P1 | Eject player laterally when a piece lands within 1 block. Prevents trapping without removing challenge. |
| Mineable trees | P2 | Trees yield "wood" blocks (2 hits). Creates a visual resource distinction and early-game material. |

**Done when:** A player can mine blocks, use them to fill line-clear gaps, trigger clears, and recover from near-game-over situations through smart resource use.

---

## Milestone 3: Flow & Feel (v0.4) Planned

**Theme:** The mechanics are right. Now make them feel *amazing*.

Every action should have weight. Every second of play should ramp the tension. By the end of this milestone, the game should feel like it has a pulse — and you feel it accelerating.

| Feature | Priority | Description |
|:--------|:---------|:------------|
| Difficulty scaling | P0 | Fall speed increases 10% every 60s, up to 3× starting rate. Spawn rate increases in parallel. The game must end in urgency, not boredom. |
| Next-piece preview | P1 | Top-right panel showing next 1–3 pieces. Enables planning. Transforms reactive panic into readable challenge. |
| Camera shake on landing | P1 | Scale shake to piece mass (I-piece = big, O-piece = subtle). 100–200ms. One of the highest fun/effort ratios in game dev. |
| Block break particles | P1 | 6–8 colored cubes on break (match block color), 0.15 size, arc outward, gravity fall, 0.4s lifetime. Current particles are too small. |
| Line-clear screen flash | P2 | Full-screen white flash for 80ms on any line-clear. Classic arcade feedback. |
| Level indicator | P2 | Small UI counter showing current speed level. Players need to *see* the pressure building. |
| Sound for block landing | P2 | Thud/impact sound when a piece lands (scaled to piece size). Currently silent — a missed dramatic beat. |
| Block edge outlines | P3 | Subtle dark EdgesGeometry overlay on all landed blocks. Improves spatial readability at a distance. |

**Done when:** A session feels like a rising thriller. The game starts calm and ends in frantic urgency. Players feel the difficulty curve without being told about it.

---

## Milestone 4: Truly Beautiful (v0.5) Planned

**Theme:** Random, chaotic, *beautiful.*

The world of minetris is already visually interesting. This milestone makes it genuinely stunning — the kind of thing you screenshot and share before you even think about it. Every visual system gets elevated: lighting, shaders, particle explosions, post-processing. When this milestone is done, minetris should look like it was made by a studio, not a weekend prototype.

| Feature | Issue | Priority | Description |
|:--------|:------|:---------|:------------|
| Dynamic sky, fog & day/night lighting | [MINAA-19](/MINAA/issues/MINAA-19) | High | Animated gradient sky, directional sunlight tracking a day/night cycle, atmospheric fog that thickens as danger rises |
| Block shaders: ambient occlusion & surface depth | [MINAA-20](/MINAA/issues/MINAA-20) | High | Per-face brightness variation, SSAO contact shadows, procedural surface texture, specular highlights on gold/ice blocks |
| Falling piece glow trails | [MINAA-21](/MINAA/issues/MINAA-21) | Medium | Color-matched luminous trails behind falling pieces, glow pulse that intensifies near landing — like meteors |
| Post-processing: bloom & cinematic color grading | [MINAA-22](/MINAA/issues/MINAA-22) | Medium | UnrealBloom on emissive blocks, emotional color grading per game state (calm → dread → euphoria → finality), vignette |
| Line-clear visual explosion & shockwave | [MINAA-23](/MINAA/issues/MINAA-23) | Medium | 4-phase clear: anticipation vibration → block detonation with fragments → expanding shockwave ring → spring drop aftermath |

**Done when:** You can record a 10-second clip of minetris, post it with no context, and people ask "what game is this?" because it looks extraordinary.

---

## Milestone 5: Strategic Depth (v0.6) Planned

**Theme:** Raise the skill ceiling. Give experts something to master.

minetris has a promising skill depth that's currently locked away: if you could influence where pieces land, the game becomes a spatial strategy puzzle. This milestone introduces the mechanics that let skilled players outperform casual ones.

| Feature | Priority | Description |
|:--------|:---------|:------------|
| Piece directional influence | P0 | **The big unlock.** When a piece is within 10 blocks of the ground, the player can push it left/right/forward/back (QEZC or arrow keys) by 1 block per press. Not full Tetris control — subtle nudge mechanics. Preserves chaos while introducing agency. |
| Tool tiers | P1 | **Fists** (5 hits, no inventory gain) → **Stone Pickaxe** (3 hits, inventory gain) → **Iron Pickaxe** (1 hit, inventory gain + bonus drops). Iron pickaxe requires 4 stone blocks to craft. Adds progression within a session. |
| Block type properties | P1 | Different tetromino colors = different block types. Brown = dirt (3 hits, low value). Gray = stone (3 hits, medium value). Yellow = gold (2 hits, high value). Cyan = ice (1 hit, slippery floor). Adds material strategy. |
| Crafting (basic) | P2 | Place 3 stone blocks to create a stone pickaxe. Place 2 wood + 1 stone to create a basic tool. Simple 2D crafting grid accessible from inventory. |
| Combo multiplier | P2 | Multi-line clears in quick succession (within 3s) multiply score: 1.5× on second, 2.0× on third, 3.0× on fourth+. Rewards aggressive play. |
| Achievements (local) | P3 | "First Tetris," "5 Minutes Survived," "50 Blocks Mined," "Combo Master" — shown on game over screen. Gives players short-term goals beyond score. |

**Done when:** A 30-minute veteran plays clearly differently from a 2-minute newcomer. Piece-nudging is the key: it separates strategy from luck.

---

## Milestone 6: The Meta (v0.7) Planned

**Theme:** Give players a reason to return tomorrow.

A game you play once is a curiosity. A game you play every day is a habit. This milestone builds the cross-session hooks.

| Feature | Priority | Description |
|:--------|:---------|:------------|
| Local high score table | P0 | Top 10 scores with date and time survived. Shown on start screen. The first motivator for replay. |
| Daily Challenge seed | P1 | Same random piece sequence for all players every day. Competitive on equal footing. Share your daily score. |
| Challenge modes | P1 | **Speed Run:** fixed 5-minute session, highest score wins. **Piece Rain:** 2× spawn rate, half fall speed — buried in blocks but slowly. **Zen Mode:** no game over, no scoring — just build. |
| Unlockable skins | P2 | Complete 10 sessions → unlock "Neon" block color palette. Clear 100 lines total → unlock "Lava World" fire blocks. Cosmetic only — rewards persistence. |
| Share score card | P2 | Generate a shareable image of your final score, stats, and world snapshot (screenshot). Twitter/Discord card format. |
| Tutorial / onboarding | P2 | First-run guided experience: "A piece is falling — it will land HERE (shadow shown). Mine this block to make room." 60 seconds of guided play removes the learning curve. |

**Done when:** Players open the game on day 2, day 7, and day 30. The daily challenge is the engine for habit.

---

## Milestone 7: Launch (v1.0) Planned

**Theme:** The complete, polished, shareable minetris experience.

| Feature | Priority | Description |
|:--------|:---------|:------------|
| Online leaderboard | P1 | Global score submission (no account needed — just enter a name). Weekend competitions. |
| Biome seeds | P1 | At game start, choose a biome: Forest (wood-heavy pieces), Underground (stone/ore), Lava (fire blocks, higher score multiplier). Different environments, same core loop. |
| Mobile controls | P2 | Touch joystick + tap-to-mine. The zero-setup browser advantage extends to phones. |
| Soundtrack | P2 | Ambient Minecraft-style music (Tone.js generative, never loops identically). Volume controls. |
| Accessibility | P2 | Color-blind palette option, reduced motion mode (no shake/flash), scalable UI. |
| Performance target | P1 | Consistent 60fps with 500+ landed blocks on screen. Profile and optimize collision detection (currently O(n²)). |
| Open source release | P3 | Clean up, document, and release on GitHub with MIT license. Community mods start here. |

**Done when:** You can share a link, someone opens it on their phone, plays for 20 minutes, beats your score, and sends it back.

---

## Beyond v1.0: The Horizon

These are not on the roadmap yet but represent where minetris could go if it finds an audience.

**Co-op (2 players, same world):**
Two players in the same falling world. One focuses on mining (clears space). One focuses on building (sets up line-clears). Pieces fall twice as fast. Communication and coordination are the game.

**Procedural world events:**
Random events mid-session: "Piece Storm" (5 pieces spawn simultaneously), "Golden Block" (a special yellow piece worth 5× points if mined within 10 seconds), "Earthquake" (all blocks drop 1 level — instant line-clears everywhere).

**World persistence mode:**
Your world saves between sessions. Come back tomorrow and continue mining. Invite a friend to visit your world. The Minecraft meta-loop meets the Tetris urgency.

**User-created challenge maps:**
Pre-built starting worlds with specific piece sequences. "Solve this Tetris board in 60 seconds." Community-created puzzles.

---

## Technical Principles

- **Zero-setup is sacred.** The game runs in any browser. No install, no account, no friction. Preserve this at every milestone.
- **No premature infrastructure.** Add build tools (Vite, bundler) only when module management actually requires it. Don't over-engineer.
- **Performance-aware.** The current O(n²) collision detection will become a problem above ~300 landed blocks. Spatial partitioning (grid-indexed lookup) is the path when needed.
- **Single codebase.** No server required through v1.0. LocalStorage for persistence. External service (leaderboard) is optional.

---

## Inspiration Touchstones

| Game | What We're Borrowing |
|:-----|:--------------------|
| **Tetris** | Line-clear rhythm, piece preview, rising speed — the mechanical spine |
| **Minecraft** | First-person scale, mining satisfaction, resource economy |
| **Spelunky** | Emergent danger from environmental physics, feel of being "in" a generated world |
| **Downwell** | Survival against a world building against you, escalating chaos |
| **Raft** | Resource-from-chaos loop — the environment constantly delivers raw material |

---

## References

- Tech spec: `docs/tech-spec.md`
- Game design review (updated): `docs/game-design-review.md`
- Source repo: <https://github.com/lx-0/minetris>
