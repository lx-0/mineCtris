// js/coop-avatar.js — Remote partner avatar rendering with smooth interpolation.
// Renders a teal capsule avatar with nameplate and look-direction beam.
// Requires: state.js (scene, camera, PLAYER_HEIGHT), THREE.js r128+,
//           optionally THREE.CSS2DRenderer / THREE.CSS2DObject for nameplates.
// Loaded before main.js.

const coopAvatar = (function () {
  // Scene objects
  let _group       = null;
  let _bodyMesh    = null;
  let _headMesh    = null;
  let _beamMesh    = null;
  let _nameLabel   = null; // THREE.CSS2DObject or null
  let _emoteLabel  = null; // THREE.CSS2DObject for emote icon, or null
  let _emoteHideHandle   = null; // setTimeout handle for hiding emote
  let _emoteFadeHandle   = null; // setTimeout handle for fade-out start

  // CSS2D renderer (created lazily; shared across avatar lifetime)
  let _css2dRenderer = null;

  // Interpolation: two most-recent position snapshots
  let _snap0 = null; // older
  let _snap1 = null; // newer

  let _lastUpdateTime = 0;
  let _partnerName    = 'Partner';
  let _isGhost        = false;
  let _disconnectToastShown = false;

  // Timeout handles
  let _ghostHandle = null;

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function _showToast(msg) {
    let el = document.getElementById('coop-partner-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'coop-partner-toast';
      el.style.cssText = [
        'position:fixed',
        'bottom:80px',
        'left:50%',
        'transform:translateX(-50%)',
        'background:rgba(0,0,0,0.78)',
        'color:#00ffff',
        'font-family:"Press Start 2P",monospace',
        'font-size:9px',
        'padding:7px 14px',
        'border-radius:4px',
        'z-index:9999',
        'pointer-events:none',
        'display:none',
      ].join(';');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(function () { el.style.display = 'none'; }, 3500);
  }

  function _initCss2dRenderer() {
    if (_css2dRenderer) return;
    if (typeof THREE.CSS2DRenderer === 'undefined') return;
    _css2dRenderer = new THREE.CSS2DRenderer();
    _css2dRenderer.setSize(window.innerWidth, window.innerHeight);
    _css2dRenderer.domElement.style.cssText = [
      'position:absolute',
      'top:0',
      'left:0',
      'pointer-events:none',
      'z-index:10',
    ].join(';');
    const container = document.getElementById('game-container') || document.body;
    container.appendChild(_css2dRenderer.domElement);
  }

  function _buildAvatar() {
    _group = new THREE.Group();

    // Teal/cyan material (emissive so it's visible in low light)
    const bodyMat = new THREE.MeshLambertMaterial({
      color:    new THREE.Color(0x00d4d4),
      emissive: new THREE.Color(0x003333),
    });

    // Capsule body: cylinder + two hemisphere caps (r128 has no CapsuleGeometry)
    const cylGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.0, 12);
    _bodyMesh = new THREE.Mesh(cylGeo, bodyMat);
    _group.add(_bodyMesh);

    const capGeo = new THREE.SphereGeometry(0.4, 12, 6);
    const capBot = new THREE.Mesh(capGeo, bodyMat);
    capBot.position.y = -0.5;
    _group.add(capBot);

    const capTop = new THREE.Mesh(capGeo, bodyMat.clone());
    capTop.position.y = 0.5;
    _group.add(capTop);

    // Head indicator: brighter sphere above capsule
    const headMat = new THREE.MeshLambertMaterial({
      color:    new THREE.Color(0x00ffff),
      emissive: new THREE.Color(0x005555),
    });
    const headGeo = new THREE.SphereGeometry(0.25, 12, 8);
    _headMesh = new THREE.Mesh(headGeo, headMat);
    _headMesh.position.y = 1.05; // just above top cap (0.5 + 0.4 radius + small gap)
    _group.add(_headMesh);

    // Look-direction beam: short cylinder pointing forward from head
    const beamMat = new THREE.MeshLambertMaterial({
      color:    new THREE.Color(0x00ffaa),
      emissive: new THREE.Color(0x002211),
    });
    const beamGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6);
    _beamMesh = new THREE.Mesh(beamGeo, beamMat);
    // Default orientation: cylinder along Y. Rotate to lie along -Z (forward).
    _beamMesh.rotation.x = Math.PI / 2;
    // Position: slightly in front of head and at head height
    _beamMesh.position.set(0, 1.05, -0.7);
    _group.add(_beamMesh);

    // Nameplate via CSS2DObject
    if (typeof THREE.CSS2DObject !== 'undefined') {
      const labelDiv = document.createElement('div');
      labelDiv.style.cssText = [
        'color:#00ffff',
        'font-family:"Press Start 2P",monospace',
        'font-size:8px',
        'background:rgba(0,0,0,0.65)',
        'padding:2px 7px',
        'border-radius:3px',
        'pointer-events:none',
        'white-space:nowrap',
        'display:inline-flex',
        'align-items:center',
        'gap:5px',
      ].join(';');

      const dot = document.createElement('span');
      dot.style.cssText = 'display:inline-block;width:6px;height:6px;border-radius:50%;background:#00ffff;flex-shrink:0';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'coop-avatar-name';
      nameSpan.textContent = _partnerName;

      labelDiv.appendChild(dot);
      labelDiv.appendChild(nameSpan);

      _nameLabel = new THREE.CSS2DObject(labelDiv);
      // Float 0.3 units above the head sphere (which is at y=1.05 + radius 0.25)
      _nameLabel.position.set(0, 0.3, 0);
      _headMesh.add(_nameLabel);
    }

    // Emote icon label (hidden until an emote is received)
    if (typeof THREE.CSS2DObject !== 'undefined') {
      const emoteDiv = document.createElement('div');
      emoteDiv.style.cssText = [
        'font-size:22px',
        'line-height:1',
        'pointer-events:none',
        'display:none',
        'transition:opacity 0.3s',
      ].join(';');
      _emoteLabel = new THREE.CSS2DObject(emoteDiv);
      // Position 0.75 units above head centre (nameplate is at 0.3)
      _emoteLabel.position.set(0, 0.75, 0);
      _headMesh.add(_emoteLabel);
    }

    // Start hidden; show on first position update
    _group.visible = false;
    scene.add(_group);
  }

  function _clearTimers() {
    if (_ghostHandle)      { clearTimeout(_ghostHandle);      _ghostHandle      = null; }
    if (_emoteHideHandle)  { clearTimeout(_emoteHideHandle);  _emoteHideHandle  = null; }
    if (_emoteFadeHandle)  { clearTimeout(_emoteFadeHandle);  _emoteFadeHandle  = null; }
  }

  function _scheduleGhostTimeout() {
    _clearTimers();
    _ghostHandle = setTimeout(function () {
      if (!_group) return;
      _isGhost = true;
      _group.traverse(function (obj) {
        if (obj.isMesh && obj.material) {
          obj.material = obj.material.clone();
          obj.material.transparent = true;
          obj.material.opacity     = 0.5;
        }
      });
      if (!_disconnectToastShown) {
        _disconnectToastShown = true;
        _showToast('Partner disconnected');
      }
    }, 3000);
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  return {
    /**
     * Call once when a co-op game begins to create the avatar.
     * @param {string} partnerName  Display name shown in nameplate
     */
    init: function (partnerName) {
      this.destroy();
      _partnerName          = partnerName || 'Partner';
      _disconnectToastShown = false;
      _isGhost              = false;
      _initCss2dRenderer();
      _buildAvatar();
    },

    /** Update the nameplate text (call if display name becomes known later). */
    setPartnerName: function (name) {
      _partnerName = name || 'Partner';
      if (_group) {
        _group.traverse(function (obj) {
          if (obj.element) {
            const span = obj.element.querySelector('.coop-avatar-name');
            if (span) span.textContent = _partnerName;
          }
        });
      }
    },

    /**
     * Feed an incoming position broadcast from the partner.
     * Called from coop.on('pos', …).
     */
    receivePosition: function (x, y, z, rotY, rotX) {
      const t = performance.now();
      // Roll snapshots: snap0 = previous snap1, snap1 = new
      _snap0 = _snap1 || { x: x, y: y, z: z, rotY: rotY, rotX: rotX, t: t };
      _snap1 = { x: x, y: y, z: z, rotY: rotY, rotX: rotX, t: t };
      _lastUpdateTime = t;

      // Un-ghost when updates resume
      if (_isGhost && _group) {
        _isGhost              = false;
        _disconnectToastShown = false;
        _group.traverse(function (obj) {
          if (obj.isMesh && obj.material) {
            obj.material.transparent = false;
            obj.material.opacity     = 1.0;
          }
        });
      }

      if (_group) _group.visible = true;
      _scheduleGhostTimeout();
    },

    /**
     * Advance interpolation and update avatar transform.
     * Call every render frame from animate().
     */
    tick: function () {
      if (!_group || !_snap1) return;

      const now = performance.now();

      // Freeze after 500 ms without an update
      if (now - _lastUpdateTime > 500) return;

      // Lerp between snap0 and snap1.
      // alpha = how far past snap1 we are relative to the snap interval.
      let alpha = 1;
      if (_snap0 && _snap1 && _snap1.t > _snap0.t) {
        const interval = _snap1.t - _snap0.t;
        alpha = Math.min(1, Math.max(0, (now - _snap1.t) / interval));
      }

      const px = _snap0.x + (_snap1.x - _snap0.x) * alpha;
      const py = _snap0.y + (_snap1.y - _snap0.y) * alpha;
      const pz = _snap0.z + (_snap1.z - _snap0.z) * alpha;
      const ry = _snap0.rotY + (_snap1.rotY - _snap0.rotY) * alpha;
      const rx = _snap0.rotX + (_snap1.rotX - _snap0.rotX) * alpha;

      // camera.position.y == PLAYER_HEIGHT (1.8) when standing.
      // Avatar body is centered at PLAYER_HEIGHT/2 above ground.
      const bodyY = py - PLAYER_HEIGHT / 2;
      _group.position.set(px, bodyY, pz);
      _group.rotation.y = ry;

      // Tilt beam to reflect partner's camera pitch (rotX)
      if (_beamMesh) {
        _beamMesh.rotation.x = Math.PI / 2 + rx;
      }
    },

    /**
     * Render the CSS2D label layer.
     * Must be called AFTER renderer.render() / composer.render() each frame.
     */
    renderLabels: function () {
      if (_css2dRenderer && scene && camera) {
        _css2dRenderer.render(scene, camera);
      }
    },

    /** Update CSS2DRenderer size on window resize. */
    onResize: function () {
      if (_css2dRenderer) {
        _css2dRenderer.setSize(window.innerWidth, window.innerHeight);
      }
    },

    /** Return the latest known partner position {x, y, z}, or null if unavailable. */
    getPosition: function () {
      if (!_snap1) return null;
      return { x: _snap1.x, y: _snap1.y, z: _snap1.z };
    },

    /**
     * Show an emote emoji above the avatar.
     * Stays 2 s then fades out over 0.3 s. Replaces any active emote.
     * @param {string} emoji  Unicode emoji string to display
     */
    showEmote: function (emoji) {
      if (!_emoteLabel) return;
      const el = _emoteLabel.element;
      // Cancel any in-flight hide/fade
      if (_emoteHideHandle) { clearTimeout(_emoteHideHandle); _emoteHideHandle = null; }
      if (_emoteFadeHandle) { clearTimeout(_emoteFadeHandle); _emoteFadeHandle = null; }
      // Show
      el.textContent = emoji;
      el.style.opacity = '1';
      el.style.display = 'block';
      // After 2 s start fade
      _emoteFadeHandle = setTimeout(function () {
        _emoteFadeHandle = null;
        el.style.opacity = '0';
        // After 0.3 s hide completely
        _emoteHideHandle = setTimeout(function () {
          _emoteHideHandle = null;
          el.style.display = 'none';
        }, 300);
      }, 2000);
    },

    /** Remove the avatar and clean up all resources. */
    destroy: function () {
      _clearTimers();
      if (_group) {
        scene.remove(_group);
        _group = null;
      }
      _bodyMesh    = null;
      _headMesh    = null;
      _beamMesh    = null;
      _nameLabel   = null;
      _emoteLabel  = null;
      _snap0       = null;
      _snap1       = null;
      _lastUpdateTime       = 0;
      _isGhost              = false;
      _disconnectToastShown = false;
    },
  };
})();
