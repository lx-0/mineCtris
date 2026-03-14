// Inventory system — item collection and HUD rendering.
// Requires: state.js (inventory, controls), config.js (INV_MAX_PER_TYPE, INV_MAX_TOTAL)

function inventoryTotal() {
  return Object.values(inventory).reduce((sum, n) => sum + n, 0);
}

/** Add one block of the given CSS hex color to inventory.
 *  Returns true if added, false if caps were reached. */
function addToInventory(cssColor) {
  if (inventoryTotal() >= INV_MAX_TOTAL) return false;
  const current = inventory[cssColor] || 0;
  if (current >= INV_MAX_PER_TYPE) return false;
  inventory[cssColor] = current + 1;
  updateInventoryHUD();
  return true;
}

/** Re-render the bottom inventory bar from current inventory state. */
function updateInventoryHUD() {
  const hud = document.getElementById("inventory-hud");
  const slotsEl = document.getElementById("inventory-slots");
  const totalEl = document.getElementById("inventory-total");

  const total = inventoryTotal();
  const entries = Object.entries(inventory).filter(([, n]) => n > 0);

  if (entries.length === 0) {
    hud.style.display = "none";
    return;
  }

  // Only show during active play
  if (controls && controls.isLocked) {
    hud.style.display = "flex";
  }
  totalEl.textContent = "Inventar: " + total + "/" + INV_MAX_TOTAL;

  slotsEl.innerHTML = "";
  entries.forEach(([color, count]) => {
    const slot = document.createElement("div");
    slot.className = "inv-slot";

    const swatch = document.createElement("div");
    swatch.className = "inv-slot-color";
    swatch.style.backgroundColor = color;

    const countEl = document.createElement("div");
    countEl.className = "inv-slot-count";
    countEl.textContent = count;

    slot.appendChild(swatch);
    slot.appendChild(countEl);
    slotsEl.appendChild(slot);
  });
}

/** Convert a THREE.Color to a CSS hex color string. */
function threeColorToCss(threeColor) {
  return "#" + threeColor.getHexString();
}
