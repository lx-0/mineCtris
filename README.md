# MineCtris

**Tetris pieces fall from the sky. You're standing in the middle of them.**

MineCtris is a first-person 3D game where Tetris meets Minecraft. Tetrominos rain down and build the world around you in real time. Your pickaxe is the only thing standing between you and being buried alive.

Mine blocks. Fill gaps. Trigger line clears. Survive.

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

Tetris pieces fall continuously, building the landscape around you. Mine blocks to collect them in your inventory. When blocks stack too high, you lose — so keep mining and trigger line clears to buy yourself time.

## Features

- **First-person Tetris** — experience falling tetrominoes from inside the world they create
- **Mining and inventory** — break blocks with a pickaxe, collect up to 256 resources
- **Line clears** — fill a horizontal layer to clear it, just like classic Tetris
- **Ghost previews** — see where falling pieces will land
- **Scoring** — track your score, blocks mined, lines cleared, and survival time
- **Audio feedback** — mining sounds, break effects, and line-clear arpeggios
- **Game over and restart** — blocks reach the danger zone and it's over. Try again.
- **Zero setup** — pure HTML/CSS/JS. No build tools, no dependencies to install.

## Development

```bash
# Just open it
open index.html

# Or use any local server
npx serve .
```

The game is built with vanilla JavaScript, Three.js for 3D rendering, and Tone.js for audio. No build step required.

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
