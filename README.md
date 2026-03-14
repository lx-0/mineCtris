# MineCtris

**Tetris pieces fall from the sky. You're standing in the middle of them.**

MineCtris drops you inside a Tetris board — first-person, ground level, fully three-dimensional. Tetrominoes rain down around you in real time. They stack. They pile. They bury.

Your pickaxe is the only thing keeping you alive.

Mine blocks. Fill rows. Trigger line clears. Don't get buried.

<!-- TODO: Add a screenshot or GIF of gameplay here -->
<!-- ![MineCtris gameplay](screenshot.png) -->

## Play Now

**[Play MineCtris](https://lx-0.github.io/mineCtris)** — runs in any browser, no install needed.

## How to Play

| Control | Action |
|:--------|:-------|
| **WASD** | Move |
| **Space** | Jump |
| **Mouse** | Look around |
| **Left Click** | Mine blocks (3 hits to break) |

Pieces fall constantly. The world builds itself around you, random, chaotic, beautiful — and lethal. Mine blocks to clear space and collect them. When a full horizontal layer forms, it vanishes in a cascade of points. When the blocks reach the danger zone, it's over.

Stay low. Keep mining. Fill the gaps.

## Features

- **First-person Tetris** — not watching the board from above. *Inside* it. At ground level. Looking up.
- **Mining and inventory** — swing your pickaxe, break blocks, collect up to 256 resources
- **Line clears** — fill a complete layer and watch it disappear, just like classic Tetris — except you're inside when it happens
- **Ghost previews** — translucent shadows show you where falling pieces will land, so you can plan your escape
- **Scoring** — blocks mined, lines cleared, survival time, all tracked
- **Audio feedback** — every hit, every break, every line clear has a sound. The arpeggios on a line clear are *chef's kiss.*
- **Game over and restart** — get buried, hit restart, try again. You'll do better this time.
- **Zero setup** — pure HTML/CSS/JS. No build tools, no install, no nonsense.

## Development

```bash
# Just open it
open index.html

# Or use any local server
npx serve .
```

Vanilla JavaScript, Three.js for 3D rendering, Tone.js for audio. No build step. No dependencies to install. You can read the whole codebase in an afternoon.

### Project Structure

```
index.html          # Entry point
css/style.css       # All styles
js/
  config.js         # Game constants and piece definitions
  state.js          # Global game state
  audio.js          # Sound effects (Tone.js)
  inventory.js      # Block inventory system
  world.js          # 3D world and block management
  gamestate.js      # Game lifecycle (start, over, restart)
  lineclear.js      # Line-clear detection and animation
  shadows.js        # Ghost piece preview
  pieces.js         # Tetromino spawning and physics
  mining.js         # Block breaking mechanics
  player.js         # First-person controls and movement
  main.js           # Initialization and game loop
```

## Roadmap

MineCtris is under active development. Current focus: closing the gameplay loop with block placement and balanced line clears.

See [ROADMAP.md](docs/ROADMAP.md) for the full vision.

## License

[MIT](LICENSE)
