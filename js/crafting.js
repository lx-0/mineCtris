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
  craftingPanelOpen = true;
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

  // Pickaxe tier indicator
  if (tierEl) {
    const tierLabels = {
      none:  "Default Pickaxe",
      stone: "Stone Pickaxe (max 2 hits)",
      iron:  "Iron Pickaxe (1-hit)",
    };
    const tierColors = {
      none:  "rgba(255,255,255,0.4)",
      stone: "#aaaaaa",
      iron:  "#88ccff",
    };
    tierEl.textContent = "Current: " + (tierLabels[pickaxeTier] || "Default Pickaxe");
    tierEl.style.color = tierColors[pickaxeTier] || "rgba(255,255,255,0.4)";
  }

  recipesEl.innerHTML = "";
  const tierRank = { none: 0, stone: 1, iron: 2 };

  RECIPES.forEach((recipe) => {
    // Skip pickaxe recipes already met or exceeded by current tier
    if (recipe.outputType === "tool" && tierRank[pickaxeTier] >= tierRank[recipe.toolTier]) {
      return;
    }

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

  // Empty state
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
  }

  updateInventoryHUD();
  showCraftedBanner(recipe.name);
  closeCraftingPanel();
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
