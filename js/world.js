// World helpers — grid occupancy tracking and block mesh creation.
// Requires: state.js (gridOccupancy), config.js (BLOCK_SIZE)

function snapGrid(v) {
  return Math.round(v);
}

/** Register a landed block in the grid occupancy map. */
function registerBlock(block) {
  const wp = new THREE.Vector3();
  block.getWorldPosition(wp);
  const gx = snapGrid(wp.x);
  const gy = snapGrid(wp.y);
  const gz = snapGrid(wp.z);
  block.userData.gridPos = { x: gx, y: gy, z: gz };
  if (!gridOccupancy.has(gy)) gridOccupancy.set(gy, new Set());
  gridOccupancy.get(gy).add(gx + "," + gz);
}

/** Remove a block from the grid occupancy map (mining or line-clear). */
function unregisterBlock(block) {
  const gp = block.userData.gridPos;
  if (!gp) return;
  const layer = gridOccupancy.get(gp.y);
  if (layer) {
    layer.delete(gp.x + "," + gp.z);
    if (!layer.size) gridOccupancy.delete(gp.y);
  }
  block.userData.gridPos = null;
}

/** Create a single block mesh with edge overlay. */
function createBlockMesh(color) {
  const geometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  const edges = new THREE.EdgesGeometry(geometry);
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0x000000,
    linewidth: 2,
  });
  const edgesMesh = new THREE.LineSegments(edges, lineMaterial);
  const material = new THREE.MeshLambertMaterial({ color: color });
  const cube = new THREE.Mesh(geometry, material);
  cube.add(edgesMesh);
  cube.userData.isBlock = true;
  cube.userData.originalColor = material.color.clone();
  return cube;
}
