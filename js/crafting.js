// Crafting panel — recipe display, ingredient validation, and crafting execution.
// Requires: state.js (inventory, pickaxeTier), config.js (RECIPES, PLANK_COLOR),
//           inventory.js (addToInventory, updateInventoryHUD)

let craftingPanelOpen = false;
let craftingBannerTimer = 0;

function toggleCraftingPanel() {
  if (craftingPanelOpen) {
    closeCraftingPanel();
  } else {
    openCraftingPanel();
  }
}

function openCraftingPanel() {
  // No Iron Week: crafting is disabled
  if (typeof weeklyNoIron !== "undefined" && weeklyNoIron) return;
  craftingPanelOpen = true;
  // Notify tutorial that crafting panel was opened
  if (typeof tutorialNotify === "function") tutorialNotify("craftingOpen");
  // Release pointer lock so the mouse cursor is visible and can click buttons
  if (typeof controls !== "undefined" && controls && controls.isLocked) {
    controls.unlock();
  }
  const panel = document.getElementById("crafting-panel");
  if (panel) {
    panel.style.display = "flex";
    renderCraftingPanel();
  }
}

function closeCraftingPanel() {
  craftingPanelOpen = false;
  const panel = document.getElementById("crafting-panel");
  if (panel) panel.style.display = "none";
  // Re-engage pointer lock to return to FPV mode (requires user gesture — satisfied
  // by the click or keypress that triggered the close)
  if (typeof controls !== "undefined" && controls && !controls.isLocked &&
      typeof isGameOver !== "undefined" && !isGameOver) {
    controls.lock();
  }
}

function canCraftRecipe(recipe) {
  return recipe.inputs.every(({ cssColor, count }) =>
    (inventory[cssColor] || 0) >= count
  );
}

function renderCraftingPanel() {
  const recipesEl = document.getElementById("crafting-recipes");
  const tierEl = document.getElementById("crafting-pickaxe-tier");
  if (!recipesEl) return;

  // Pickaxe tier indicator — shows current tier and next upgrade hint
  if (tierEl) {
    const tierLabels = {
      none:    "Default Pickaxe",
      stone:   "Stone Pickaxe (max 2 hits)",
      iron:    "Iron Pickaxe (1-hit)",
      diamond: "Diamond Pickaxe (1-hit + AOE)",
    };
    const tierColors = {
      none:    "rgba(255,255,255,0.4)",
      stone:   "#aaaaaa",
      iron:    "#88ccff",
      diamond: "#7986cb",
    };
    let tierText = "Mining Tier: " + (tierLabels[pickaxeTier] || "Default Pickaxe");
    if (pickaxeTier === "iron" && hasCraftingBench) {
      tierText += " → [Craft Diamond?]";
    } else if (pickaxeTier === "iron" && !hasCraftingBench) {
      tierText += " → [Need Crafting Bench for Diamond]";
    }
    tierEl.textContent = tierText;
    tierEl.style.color = tierColors[pickaxeTier] || "rgba(255,255,255,0.4)";
  }

  // Consumable status line
  let consumableStatusEl = document.getElementById("crafting-consumables");
  if (!consumableStatusEl) {
    consumableStatusEl = document.createElement("div");
    consumableStatusEl.id = "crafting-consumables";
    consumableStatusEl.style.cssText = "font-size:0.8em;color:#ccc;padding:4px 0 6px;";
    const header = document.getElementById("crafting-header");
    if (header && header.parentNode) {
      header.parentNode.insertBefore(consumableStatusEl, recipesEl);
    }
  }
  const flaskCount  = consumables.lava_flask  || 0;
  const bridgeCount = consumables.ice_bridge  || 0;
  const rowBombCount = powerUps.row_bomb  || 0;
  const slowDownCount = powerUps.slow_down || 0;
  const shieldCount  = powerUps.shield    || 0;
  const magnetCount  = powerUps.magnet    || 0;
  const parts = [];
  if (flaskCount  > 0) parts.push("Lava Flask x" + flaskCount  + " [F]");
  if (bridgeCount > 0) parts.push("Ice Bridge x" + bridgeCount + " [G]");
  if (rowBombCount > 0) parts.push("Row Bomb x" + rowBombCount);
  if (slowDownCount > 0) parts.push("Slow Down x" + slowDownCount);
  if (shieldCount  > 0) parts.push("Shield x" + shieldCount);
  if (magnetCount  > 0) parts.push("Magnet x" + magnetCount);
  if (parts.length > 0) {
    consumableStatusEl.textContent = "Inventory: " + parts.join("  |  ");
  } else {
    consumableStatusEl.textContent = "";
  }

  recipesEl.innerHTML = "";
  const tierRank = { none: 0, stone: 1, iron: 2, diamond: 3, obsidian: 4 };

  RECIPES.forEach((recipe) => {
    // Skip bench recipe if already built
    if (recipe.outputType === "bench" && hasCraftingBench) return;
    // Skip pickaxe recipes already met or exceeded by current tier
    if (recipe.outputType === "tool" && tierRank[pickaxeTier] >= tierRank[recipe.toolTier]) return;
    // Skip advanced recipes gated behind Crafting Bench if bench not built
    if (recipe.requiresBench && !hasCraftingBench) return;
    // Skip power-up recipes in puzzle mode (Row Bomb and Magnet trivially solve puzzles)
    if (recipe.outputType === "powerup" && typeof isPuzzleMode !== "undefined" && isPuzzleMode) return;

    const canCraft = canCraftRecipe(recipe);
    const row = document.createElement("div");
    row.className = "craft-row" + (canCraft ? " craft-row-ready" : "");

    // Name
    const nameEl = document.createElement("div");
    nameEl.className = "craft-name";
    nameEl.textContent = recipe.name;

    // Description
    const descEl = document.createElement("div");
    descEl.className = "craft-desc";
    descEl.textContent = recipe.description;

    // Ingredients
    const ingredientsEl = document.createElement("div");
    ingredientsEl.className = "craft-ingredients";
    recipe.inputs.forEach(({ cssColor, label, count }) => {
      const have = inventory[cssColor] || 0;
      const chip = document.createElement("div");
      chip.className = "craft-chip";

      const swatch = document.createElement("span");
      swatch.className = "craft-swatch";
      swatch.style.backgroundColor = cssColor;

      const lbl = document.createElement("span");
      lbl.className = "craft-chip-label";
      lbl.textContent = label + " " + have + "/" + count;
      lbl.style.color = have >= count ? "#0f0" : "#f66";

      chip.appendChild(swatch);
      chip.appendChild(lbl);
      ingredientsEl.appendChild(chip);
    });

    // Output preview
    const outputEl = document.createElement("div");
    outputEl.className = "craft-output";
    if (recipe.outputType === "block") {
      const swatch = document.createElement("span");
      swatch.className = "craft-swatch";
      swatch.style.backgroundColor = recipe.outputCssColor;
      outputEl.appendChild(document.createTextNode("\u2192 "));
      outputEl.appendChild(swatch);
      outputEl.appendChild(document.createTextNode(" \xd7" + recipe.outputCount));
    } else if (recipe.outputType === "consumable") {
      const existing = consumables[recipe.consumableType] || 0;
      outputEl.textContent = "\u2192 " + recipe.name + (existing > 0 ? " (have " + existing + ")" : "");
    } else if (recipe.outputType === "powerup") {
      const existing = powerUps[recipe.powerUpType] || 0;
      outputEl.textContent = "\u2192 " + recipe.name + (existing > 0 ? " (have " + existing + ")" : "");
    } else {
      outputEl.textContent = "\u2192 " + recipe.name;
    }

    // Craft button
    const btn = document.createElement("button");
    btn.className = "craft-btn";
    btn.textContent = "Craft";
    btn.disabled = !canCraft;
    btn.addEventListener("click", () => {
      if (craftRecipe(recipe)) {
        renderCraftingPanel();
      }
    });

    row.appendChild(nameEl);
    row.appendChild(descEl);
    row.appendChild(ingredientsEl);
    row.appendChild(outputEl);
    row.appendChild(btn);
    recipesEl.appendChild(row);
  });

  // If bench not built yet, show a note about advanced recipes being locked
  if (!hasCraftingBench) {
    const gateNote = document.createElement("div");
    gateNote.className = "craft-empty";
    gateNote.style.cssText = "color:#aaa;font-size:0.8em;margin-top:6px;";
    gateNote.textContent = "Craft a Crafting Bench to unlock Diamond Pickaxe, Obsidian Pickaxe, Lava Flask, Ice Bridge, and Power-ups.";
    recipesEl.appendChild(gateNote);
  }

  // Empty state (no craftable or available recipes)
  if (!recipesEl.children.length) {
    const empty = document.createElement("div");
    empty.className = "craft-empty";
    empty.textContent = "All recipes crafted!";
    recipesEl.appendChild(empty);
  }
}

function craftRecipe(recipe) {
  if (!canCraftRecipe(recipe)) return false;

  // Consume ingredients
  recipe.inputs.forEach(({ cssColor, count }) => {
    inventory[cssColor] = (inventory[cssColor] || 0) - count;
    if (inventory[cssColor] <= 0) delete inventory[cssColor];
  });

  // Apply output
  if (recipe.outputType === "block") {
    for (let i = 0; i < recipe.outputCount; i++) {
      addToInventory(recipe.outputCssColor);
    }
  } else if (recipe.outputType === "tool") {
    pickaxeTier = recipe.toolTier;
    if (recipe.toolTier === "obsidian") obsidianPickaxeActive = true;
    if (typeof achOnCraft === "function") achOnCraft(recipe.toolTier);
  } else if (recipe.outputType === "bench") {
    hasCraftingBench = true;
  } else if (recipe.outputType === "consumable") {
    consumables[recipe.consumableType] = (consumables[recipe.consumableType] || 0) + recipe.outputCount;
    sessionConsumableCrafts++;
    if (typeof achOnConsumableCraft === "function") achOnConsumableCraft(sessionConsumableCrafts);
  } else if (recipe.outputType === "powerup") {
    powerUps[recipe.powerUpType] = (powerUps[recipe.powerUpType] || 0) + recipe.outputCount;
    // Also persist to the cross-run power-up bank
    const _puBank = loadPowerUpBank();
    _puBank[recipe.powerUpType] = (_puBank[recipe.powerUpType] || 0) + recipe.outputCount;
    savePowerUpBank(_puBank);
    sessionConsumableCrafts++;
    if (typeof achOnConsumableCraft === "function") achOnConsumableCraft(sessionConsumableCrafts);
  }

  updateInventoryHUD();
  showCraftedBanner(recipe.name);
  closeCraftingPanel();
  sessionCrafts++;
  if (typeof onMissionItemCrafted === "function") onMissionItemCrafted(recipe.id);
  return true;
}

function showCraftedBanner(name) {
  const banner = document.getElementById("crafted-banner");
  if (!banner) return;
  banner.textContent = "Crafted! " + name;
  banner.style.display = "block";
  craftingBannerTimer = 1.8;
}

/** Call every frame (delta in seconds) to tick down the crafted banner. */
function updateCraftingBanner(delta) {
  if (craftingBannerTimer > 0) {
    craftingBannerTimer -= delta;
    if (craftingBannerTimer <= 0) {
      const banner = document.getElementById("crafted-banner");
      if (banner) banner.style.display = "none";
      craftingBannerTimer = 0;
    }
  }
}
