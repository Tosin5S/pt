/**
 * Drop-in Isometric Graphics & Footpath Upgrade for https://github.com/Tosin5S/pt
 * -------------------------------------------------------------------------------
 * File target in your repo: src/isometric_upgrade.js
 *
 * Designed specifically for PrehistoricPlanetaryGame (src/simulation.js & src/renderer.js):
 * - Matches your camera transform: ctx.scale(this.cam.zoom, this.cam.zoom * this.cam.tiltScale)
 *   and un-flattens vertical sprites using `invTilt` (1 / this.cam.tiltScale).
 * - Maps your exact building types: 'town_hall', 'house', 'barracks', 'farm', 'tower',
 *   'lumber_camp', 'mining_camp', 'archery_range', 'stable', 'siege_workshop', plus
 *   hut/sawmill/forge/citadel aliases.
 * - Maps your exact villager & enemy fields: u.state ('idle', 'move', 'gather', 'chop',
 *   'mine', 'build', 'attack', 'fight', 'flee', 'wander'), u.vx, u.vy, u.color,
 *   u.gatherType, u.carryAmount, u.isT101s, u.hp, u.maxHp.
 * - Maps your resource nodes: node.type === 'tree' | 'stone' | 'gold', node.amount.
 * - Adds emergent worn dirt & cobblestone footpaths that wrap cleanly with wrapDX.
 */

function shadeHex(hex, amount) {
  if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return '#2e6fd9';
  const clean = hex.replace('#', '');
  const num = parseInt(
    clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean,
    16
  );
  if (Number.isNaN(num)) return hex;
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + Math.round(255 * amount)));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + Math.round(255 * amount)));
  const b = Math.min(255, Math.max(0, (num & 0xff) + Math.round(255 * amount)));
  return `rgb(${r}, ${g}, ${b})`;
}

function hash2D(x, y) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

/* ============================================================================
 * 1. VILLAGER & ENEMY OFFSCREEN SPRITE BANK
 * ========================================================================== */

const UNIT_STATES = {
  idle: { frames: 4, fps: 4 },
  walk: { frames: 8, fps: 12 },
  chop: { frames: 6, fps: 10 },
  build: { frames: 6, fps: 11 },
  attack: { frames: 6, fps: 12 },
};

const DIRECTIONS = ['SE', 'SW', 'NE', 'NW'];

function mapUnitStateToAnim(rawState, vx, vy) {
  switch (rawState) {
    case 'chop':
    case 'gather':
    case 'mine':
      return 'chop';
    case 'build':
      return 'build';
    case 'attack':
    case 'fight':
      return 'attack';
    case 'move':
    case 'flee':
    case 'wander':
      return 'walk';
    default:
      return Math.hypot(vx || 0, vy || 0) > 2 ? 'walk' : 'idle';
  }
}

function drawLimb(ctx, x1, y1, x2, y2, width, baseColor, highlightColor) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = baseColor;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.lineWidth = Math.max(1, width * 0.35);
  ctx.strokeStyle = highlightColor;
  ctx.beginPath();
  ctx.moveTo(x1 - 0.5, y1 - 0.5);
  ctx.lineTo(x2 - 0.5, y2 - 0.5);
  ctx.stroke();
  ctx.restore();
}

function drawTool(ctx, tool, handX, handY, angle, facingRight) {
  if (!tool) return;
  ctx.save();
  ctx.translate(handX, handY);
  ctx.rotate(angle);

  if (tool === 'axe') {
    ctx.strokeStyle = '#6d4c2f';
    ctx.lineWidth = 2.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(0, -14);
    ctx.stroke();

    const dir = facingRight ? 1 : -1;
    ctx.fillStyle = '#aeb9c4';
    ctx.strokeStyle = '#4a5562';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.quadraticCurveTo(7 * dir, -15, 7 * dir, -9);
    ctx.quadraticCurveTo(4 * dir, -8, 0, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (tool === 'hammer') {
    ctx.strokeStyle = '#6d4c2f';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(0, -12);
    ctx.stroke();

    ctx.fillStyle = '#7f8c98';
    ctx.strokeStyle = '#3c4650';
    ctx.lineWidth = 1;
    ctx.fillRect(-4.5, -15, 9, 4.5);
    ctx.strokeRect(-4.5, -15, 9, 4.5);
  } else if (tool === 'sword') {
    ctx.strokeStyle = '#c89b3c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-3.5, -2);
    ctx.lineTo(3.5, -2);
    ctx.stroke();

    ctx.fillStyle = '#dce5ee';
    ctx.strokeStyle = '#5d6b78';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-1.8, -2);
    ctx.lineTo(0, -18);
    ctx.lineTo(1.8, -2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function renderVillagerFrame(ctx, cx, groundY, opts) {
  const { state, frameIndex, frameCount, dir, palette } = opts;
  const t = frameIndex / frameCount;
  const tau = Math.PI * 2;
  const facingRight = dir === 'SE' || dir === 'NE';
  const facingBack = dir === 'NE' || dir === 'NW';
  const sideSign = facingRight ? 1 : -1;

  let bobY = 0;
  let leanX = 0;
  let leftLeg = 0;
  let rightLeg = 0;
  let frontArmAngle = 0.25 * sideSign;
  let backArmAngle = -0.2 * sideSign;
  let tool = null;
  let toolAngle = 0;

  if (state === 'idle') {
    bobY = Math.sin(t * tau) * 0.9;
    frontArmAngle = (0.18 + Math.sin(t * tau) * 0.05) * sideSign;
    backArmAngle = (-0.18 - Math.sin(t * tau) * 0.05) * sideSign;
  } else if (state === 'walk') {
    const stride = Math.sin(t * tau);
    bobY = -Math.abs(stride) * 2.1;
    leanX = 1.2 * sideSign;
    leftLeg = stride * 5.2;
    rightLeg = -stride * 5.2;
    frontArmAngle = (-stride * 0.65 + 0.15) * sideSign;
    backArmAngle = (stride * 0.65 - 0.15) * sideSign;
  } else if (state === 'chop') {
    tool = 'axe';
    const swing =
      t < 0.45
        ? -1.25 * (t / 0.45)
        : t < 0.7
        ? -1.25 + 2.35 * ((t - 0.45) / 0.25)
        : 1.1 * (1 - (t - 0.7) / 0.3);
    bobY = t >= 0.6 && t <= 0.78 ? 1.5 : -0.5;
    leanX = (t >= 0.55 && t <= 0.75 ? 2.5 : -0.8) * sideSign;
    frontArmAngle = swing * sideSign;
    backArmAngle = (swing * 0.7 - 0.2) * sideSign;
    toolAngle = (swing + 0.35) * sideSign;
  } else if (state === 'build') {
    tool = 'hammer';
    const strike = Math.sin(t * tau);
    bobY = strike > 0.5 ? 1.0 : 0;
    leanX = 1.4 * sideSign;
    frontArmAngle = (-0.65 + strike * 0.85) * sideSign;
    backArmAngle = -0.35 * sideSign;
    toolAngle = (-0.5 + strike * 1.1) * sideSign;
  } else if (state === 'attack') {
    tool = 'sword';
    const lunge =
      t < 0.35
        ? -t / 0.35
        : t < 0.65
        ? -1 + 2.2 * ((t - 0.35) / 0.3)
        : 1.2 * (1 - (t - 0.65) / 0.35);
    leanX = (t >= 0.45 && t <= 0.7 ? 3.4 : -0.8) * sideSign;
    bobY = t >= 0.45 && t <= 0.7 ? 1.2 : -0.8;
    leftLeg = t >= 0.45 && t <= 0.7 ? 3.5 * sideSign : -1.5 * sideSign;
    rightLeg = -leftLeg * 0.6;
    frontArmAngle = lunge * 0.95 * sideSign;
    backArmAngle = -0.55 * sideSign;
    toolAngle = (lunge * 1.15 + 0.4) * sideSign;
  }

  // Contact shadow
  ctx.save();
  ctx.fillStyle = 'rgba(10, 14, 18, 0.34)';
  ctx.beginPath();
  ctx.ellipse(cx + 1.5, groundY, 10.5, 4.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const hipY = groundY - 9 + bobY;
  const shoulderY = hipY - 11;
  const headY = shoulderY - 6.5;

  const backShoulderX = cx - 4 * sideSign + leanX * 0.6;
  const backHandX = backShoulderX + Math.sin(backArmAngle) * 8.5;
  const backHandY = shoulderY + 2 + Math.cos(backArmAngle) * 8.5;
  drawLimb(ctx, backShoulderX, shoulderY + 2, backHandX, backHandY, 3.6, palette.tunicDark, palette.tunic);

  drawLimb(ctx, cx - 2.6 * sideSign, hipY, cx - 2.8 * sideSign + leftLeg, groundY - 1.5, 4.0, '#3b2f26', '#5c4a3c');
  drawLimb(ctx, cx + 2.6 * sideSign, hipY, cx + 2.8 * sideSign + rightLeg, groundY - 1.0, 4.0, '#4a3b30', '#6d5848');

  ctx.save();
  const torsoGrad = ctx.createLinearGradient(cx - 8, shoulderY, cx + 8, hipY + 3);
  torsoGrad.addColorStop(0, palette.tunicLight);
  torsoGrad.addColorStop(0.55, palette.tunic);
  torsoGrad.addColorStop(1, palette.tunicDark);
  ctx.fillStyle = torsoGrad;
  ctx.strokeStyle = '#1e1b18';
  ctx.lineWidth = 1.1;

  ctx.beginPath();
  ctx.moveTo(cx - 5.5 + leanX * 0.7, shoulderY);
  ctx.lineTo(cx + 5.5 + leanX * 0.7, shoulderY);
  ctx.lineTo(cx + 6.8 + leanX * 0.2, hipY + 2);
  ctx.quadraticCurveTo(cx + leanX * 0.2, hipY + 4.5, cx - 6.8 + leanX * 0.2, hipY + 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#3b281c';
  ctx.fillRect(cx - 6.2 + leanX * 0.35, hipY - 2.2, 12.4, 2.4);
  ctx.fillStyle = '#d4af37';
  ctx.fillRect(cx + 1.5 * sideSign + leanX * 0.35, hipY - 2.2, 2.2, 2.4);
  ctx.restore();

  ctx.save();
  const headX = cx + leanX;
  const skinGrad = ctx.createRadialGradient(headX - 1.8, headY - 2, 1, headX, headY, 6.2);
  skinGrad.addColorStop(0, '#f3cfb3');
  skinGrad.addColorStop(0.7, '#d9a784');
  skinGrad.addColorStop(1, '#a97454');

  ctx.fillStyle = skinGrad;
  ctx.strokeStyle = '#2b1e16';
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.arc(headX, headY, 5.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = palette.hair;
  ctx.beginPath();
  if (facingBack) {
    ctx.arc(headX, headY - 0.5, 5.7, Math.PI * 0.85, Math.PI * 2.15);
    ctx.lineTo(headX + 4.5, headY + 3.5);
    ctx.lineTo(headX - 4.5, headY + 3.5);
  } else {
    ctx.arc(headX - 0.4 * sideSign, headY - 1.2, 5.5, Math.PI * 0.95, Math.PI * 2.05);
  }
  ctx.closePath();
  ctx.fill();

  if (!facingBack) {
    ctx.fillStyle = '#1f1916';
    ctx.fillRect(headX + 1.2 * sideSign, headY - 0.4, 1.3, 1.4);
    ctx.fillRect(headX + 3.4 * sideSign, headY - 0.4, 1.2, 1.3);
  }
  ctx.restore();

  const frontShoulderX = cx + 4.2 * sideSign + leanX * 0.7;
  const frontHandX = frontShoulderX + Math.sin(frontArmAngle) * 8.8;
  const frontHandY = shoulderY + 2 + Math.cos(frontArmAngle) * 8.8;

  drawTool(ctx, tool, frontHandX, frontHandY, toolAngle, facingRight);
  drawLimb(ctx, frontShoulderX, shoulderY + 2, frontHandX, frontHandY, 3.8, palette.tunic, palette.tunicLight);

  ctx.fillStyle = '#e4b796';
  ctx.beginPath();
  ctx.arc(frontHandX, frontHandY, 2.0, 0, Math.PI * 2);
  ctx.fill();
}

function drawCarriedResource(ctx, x, y, carryItem, facingRight) {
  if (!carryItem) return;
  const offset = facingRight ? 6 : -6;
  ctx.save();
  ctx.translate(x + offset, y - 14);
  if (carryItem === 'wood') {
    ctx.fillStyle = '#7a5230';
    ctx.strokeStyle = '#3b2412';
    ctx.lineWidth = 1;
    ctx.fillRect(-5, -2.5, 10, 5);
    ctx.strokeRect(-5, -2.5, 10, 5);
  } else if (carryItem === 'stone') {
    ctx.fillStyle = '#9aa3ab';
    ctx.strokeStyle = '#49525a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 3.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (carryItem === 'gold' || carryItem === 'food') {
    ctx.fillStyle = carryItem === 'gold' ? '#f2c144' : '#e0533c';
    ctx.strokeStyle = '#6e4f10';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export class VillagerSpriteBank {
  constructor({ cellWidth = 48, cellHeight = 56 } = {}) {
    this.cellWidth = cellWidth;
    this.cellHeight = cellHeight;
    this.cache = new Map();
    this.rows = [];
    this.rowIndex = new Map();
    this.maxFrames = 0;

    for (const [stateName, cfg] of Object.entries(UNIT_STATES)) {
      this.maxFrames = Math.max(this.maxFrames, cfg.frames);
      for (const dir of DIRECTIONS) {
        const key = `${stateName}:${dir}`;
        this.rowIndex.set(key, this.rows.length);
        this.rows.push({ state: stateName, dir, frames: cfg.frames });
      }
    }
  }

  getAtlas(factionColor = '#2e6fd9') {
    const key = (factionColor || '#2e6fd9').toLowerCase();
    if (this.cache.has(key)) return this.cache.get(key);

    const canvas = document.createElement('canvas');
    canvas.width = this.maxFrames * this.cellWidth;
    canvas.height = this.rows.length * this.cellHeight;
    const ctx = canvas.getContext('2d');

    const palette = {
      tunic: key,
      tunicLight: shadeHex(key, 0.16),
      tunicDark: shadeHex(key, -0.2),
      hair: '#3a281d',
    };

    for (let r = 0; r < this.rows.length; r++) {
      const { state, dir, frames } = this.rows[r];
      for (let f = 0; f < frames; f++) {
        const cx = f * this.cellWidth + this.cellWidth * 0.5;
        const groundY = (r + 1) * this.cellHeight - 8;
        renderVillagerFrame(ctx, cx, groundY, {
          state,
          frameIndex: f,
          frameCount: frames,
          dir,
          palette,
        });
      }
    }
    this.cache.set(key, canvas);
    return canvas;
  }

  static vectorToDirection(vx, vy, fallback = 'SE') {
    if (Math.abs(vx || 0) < 0.05 && Math.abs(vy || 0) < 0.05) return fallback;
    if (vy >= 0) return vx >= 0 ? 'SE' : 'SW';
    return vx >= 0 ? 'NE' : 'NW';
  }

  /**
   * Drop-in replacement for PrehistoricPlanetaryGame.prototype.drawArticulatedHuman
   */
  drawGameUnit(ctx, unit, dx, sy, invTilt = 1, isEnemy = false, gameTime = 0, showBadges = true) {
    const factionColor = isEnemy ? '#c93b2b' : unit.isT101s ? '#f59e0b' : unit.color || '#2e6fd9';
    const animState = mapUnitStateToAnim(unit.state, unit.vx, unit.vy);
    const dir = VillagerSpriteBank.vectorToDirection(unit.vx, unit.vy, unit._lastIsoDir || 'SE');
    unit._lastIsoDir = dir;

    const animTime = (unit.animTime ?? gameTime) + (unit.id || 0) * 0.17;
    const scale = unit.isT101s ? 1.28 : 1.0;
    const cfg = UNIT_STATES[animState] || UNIT_STATES.idle;
    const frameIndex = Math.floor(animTime * cfg.fps) % cfg.frames;
    const row = this.rowIndex.get(`${animState}:${dir}`) ?? 0;
    const atlas = this.getAtlas(factionColor);

    ctx.save();
    ctx.translate(dx, sy);
    ctx.scale(1, invTilt); // Un-flatten vertical aspect inside tilted camera

    // Golden sovereign aura for hero t101s
    if (unit.isT101s) {
      ctx.save();
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 6.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const dw = this.cellWidth * scale;
    const dh = this.cellHeight * scale;
    ctx.drawImage(
      atlas,
      frameIndex * this.cellWidth,
      row * this.cellHeight,
      this.cellWidth,
      this.cellHeight,
      Math.round(-dw * 0.5),
      Math.round(-dh + 8 * scale),
      dw,
      dh
    );

    if ((unit.carryAmount || 0) > 0 && unit.gatherType) {
      drawCarriedResource(ctx, 0, 0, unit.gatherType, dir === 'SE' || dir === 'NE');
    }

    // Health bar when damaged or hero
    if (unit.hp < unit.maxHp || unit.isT101s) {
      const hpRatio = Math.max(0, Math.min(1, (unit.hp || 1) / (unit.maxHp || 1)));
      const bw = 24;
      const by = -dh + 2;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.fillRect(-bw * 0.5, by, bw, 4);
      ctx.fillStyle = isEnemy ? '#ef4444' : '#22c55e';
      ctx.fillRect(-bw * 0.5 + 0.5, by + 0.5, (bw - 1) * hpRatio, 3);
    }

    if (showBadges && unit.isT101s && unit.name) {
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fde68a';
      ctx.fillText(unit.name, 0, -dh - 4);
    }

    ctx.restore();
  }
}

/* ============================================================================
 * 2. ENVIRONMENT SPRITE BANK (3-Stage Buildings, Smoke, Trees, Ore Nodes)
 * ========================================================================== */

// Maps all building types in src/simulation.js & src/constants.js
const BUILDING_SPECS = {
  town_hall: { halfW: 44, halfH: 22, wallH: 36, roofH: 22, chimney: true, banner: true, isStone: true },
  citadel: { halfW: 44, halfH: 22, wallH: 36, roofH: 22, chimney: true, banner: true, isStone: true },
  house: { halfW: 26, halfH: 13, wallH: 20, roofH: 17, chimney: true, banner: false, isStone: false },
  hut: { halfW: 26, halfH: 13, wallH: 20, roofH: 17, chimney: true, banner: false, isStone: false },
  barracks: { halfW: 36, halfH: 18, wallH: 25, roofH: 16, chimney: false, banner: true, isStone: true },
  archery_range: { halfW: 34, halfH: 17, wallH: 22, roofH: 15, chimney: false, banner: true, isStone: false },
  stable: { halfW: 36, halfH: 18, wallH: 22, roofH: 16, chimney: false, banner: true, isStone: false },
  siege_workshop: { halfW: 38, halfH: 19, wallH: 26, roofH: 15, chimney: true, banner: true, isStone: true },
  forge: { halfW: 32, halfH: 16, wallH: 24, roofH: 14, chimney: true, banner: true, isStone: true },
  lumber_camp: { halfW: 32, halfH: 16, wallH: 20, roofH: 15, chimney: false, banner: true, isStone: false },
  sawmill: { halfW: 32, halfH: 16, wallH: 20, roofH: 15, chimney: false, banner: true, isStone: false },
  mining_camp: { halfW: 32, halfH: 16, wallH: 21, roofH: 14, chimney: true, banner: false, isStone: true },
  tower: { halfW: 20, halfH: 10, wallH: 42, roofH: 16, chimney: false, banner: true, isStone: true },
  farm: { halfW: 34, halfH: 17, wallH: 6, roofH: 4, chimney: false, banner: false, isStone: false },
};

function traceIsoDiamond(ctx, cx, cy, halfW, halfH) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - halfH);
  ctx.lineTo(cx + halfW, cy);
  ctx.lineTo(cx, cy + halfH);
  ctx.lineTo(cx - halfW, cy);
  ctx.closePath();
}

function drawIsoBox(ctx, cx, baseY, halfW, halfH, height, colors) {
  ctx.fillStyle = colors.left;
  ctx.beginPath();
  ctx.moveTo(cx - halfW, baseY);
  ctx.lineTo(cx, baseY + halfH);
  ctx.lineTo(cx, baseY + halfH - height);
  ctx.lineTo(cx - halfW, baseY - height);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = colors.outline || 'rgba(20, 16, 12, 0.55)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = colors.right;
  ctx.beginPath();
  ctx.moveTo(cx, baseY + halfH);
  ctx.lineTo(cx + halfW, baseY);
  ctx.lineTo(cx + halfW, baseY - height);
  ctx.lineTo(cx, baseY + halfH - height);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (colors.top) {
    ctx.fillStyle = colors.top;
    traceIsoDiamond(ctx, cx, baseY - height, halfW, halfH);
    ctx.fill();
    ctx.stroke();
  }
}

function drawIsoRoof(ctx, cx, wallTopY, halfW, halfH, ridgeHeight, colors) {
  const overhang = 4;
  const hw = halfW + overhang;
  const hh = halfH + overhang * 0.5;
  const ridgeY = wallTopY - ridgeHeight;

  ctx.fillStyle = colors.left;
  ctx.strokeStyle = colors.outline || 'rgba(25, 16, 10, 0.65)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(cx - hw, wallTopY);
  ctx.lineTo(cx, wallTopY + hh);
  ctx.lineTo(cx + halfW * 0.35, ridgeY);
  ctx.lineTo(cx - halfW * 0.35, ridgeY - halfH * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = colors.right;
  ctx.beginPath();
  ctx.moveTo(cx, wallTopY + hh);
  ctx.lineTo(cx + hw, wallTopY);
  ctx.lineTo(cx + halfW * 0.35, ridgeY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function renderBuildingStage(ctx, cx, baseY, type, stage, factionColor) {
  const spec = BUILDING_SPECS[type] || BUILDING_SPECS.house;
  const { halfW, halfH, wallH, roofH, isStone } = spec;

  ctx.save();
  ctx.fillStyle = 'rgba(10, 14, 18, 0.30)';
  const shadowScale = stage === 0 ? 1.0 : stage === 1 ? 1.12 : 1.22;
  traceIsoDiamond(cx + (stage === 0 ? 2 : 9), baseY + (stage === 0 ? 1 : 4), halfW * shadowScale, halfH * shadowScale);
  ctx.fill();
  ctx.restore();

  // Golden tilled crop rows for farms
  if (type === 'farm' && stage === 2) {
    ctx.save();
    ctx.fillStyle = '#6e5233';
    ctx.strokeStyle = '#47331d';
    traceIsoDiamond(ctx, cx, baseY, halfW + 4, halfH + 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#d4a937';
    ctx.lineWidth = 2;
    for (let i = -halfW + 6; i < halfW - 4; i += 6) {
      ctx.beginPath();
      ctx.moveTo(cx + i * 0.5, baseY - halfH * 0.5 + i * 0.25);
      ctx.lineTo(cx + i * 0.5 - 10, baseY + i * 0.25 + 5);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.fillStyle = isStone ? '#7b7872' : '#7a6348';
  ctx.strokeStyle = 'rgba(38, 28, 18, 0.5)';
  ctx.lineWidth = 1;
  traceIsoDiamond(ctx, cx, baseY, halfW + 4, halfH + 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  if (stage === 0) {
    ctx.strokeStyle = '#5c3f26';
    ctx.lineWidth = 2;
    const corners = [
      [cx, baseY - halfH],
      [cx + halfW, baseY],
      [cx, baseY + halfH],
      [cx - halfW, baseY],
    ];
    for (const [px, py] of corners) {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, py - 9);
      ctx.stroke();
    }
    ctx.strokeStyle = '#cbb38a';
    ctx.lineWidth = 1;
    traceIsoDiamond(ctx, cx, baseY - 6, halfW, halfH);
    ctx.stroke();
    return;
  }

  if (stage === 1) {
    drawIsoBox(ctx, cx, baseY, halfW, halfH, wallH * 0.58, {
      left: '#b89f7d',
      right: '#8c7456',
      top: '#d4be9c',
    });

    ctx.strokeStyle = '#684729';
    ctx.lineWidth = 2.2;
    const poles = [
      [cx - halfW - 2, baseY + 1],
      [cx, baseY + halfH + 2],
      [cx + halfW + 2, baseY + 1],
      [cx, baseY - halfH - 1],
    ];
    for (const [px, py] of poles) {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, py - wallH - 6);
      ctx.stroke();
    }
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx - halfW - 2, baseY - wallH * 0.5);
    ctx.lineTo(cx, baseY + halfH - wallH * 0.9);
    ctx.lineTo(cx + halfW + 2, baseY - wallH * 0.5);
    ctx.stroke();
    return;
  }

  drawIsoBox(ctx, cx, baseY, halfW, halfH, wallH, {
    left: isStone ? '#b9b5ad' : '#d5c1a0',
    right: isStone ? '#848078' : '#9c8669',
  });

  // Doorway
  ctx.fillStyle = '#3b2616';
  ctx.beginPath();
  ctx.moveTo(cx - halfW * 0.45, baseY + halfH * 0.55);
  ctx.lineTo(cx - halfW * 0.25, baseY + halfH * 0.75);
  ctx.lineTo(cx - halfW * 0.25, baseY + halfH * 0.75 - 12);
  ctx.lineTo(cx - halfW * 0.45, baseY + halfH * 0.55 - 12);
  ctx.closePath();
  ctx.fill();

  if (type === 'town_hall' || type === 'citadel') {
    drawIsoBox(ctx, cx, baseY - wallH, halfW + 2, halfH + 1, 7, {
      left: '#a29e95',
      right: '#716d65',
      top: '#c4bfb6',
    });
    drawIsoBox(ctx, cx, baseY - wallH - 7, halfW * 0.45, halfH * 0.45, 16, {
      left: '#c5c0b6',
      right: '#8f8a80',
    });
    drawIsoRoof(ctx, cx, baseY - wallH - 23, halfW * 0.45, halfH * 0.45, roofH * 0.75, {
      left: shadeHex(factionColor, 0.08),
      right: shadeHex(factionColor, -0.22),
    });
  } else {
    drawIsoRoof(ctx, cx, baseY - wallH, halfW, halfH, roofH, {
      left: isStone ? shadeHex(factionColor, 0.05) : '#a85a3a',
      right: isStone ? shadeHex(factionColor, -0.22) : '#743a24',
    });
  }

  if (spec.chimney) {
    drawIsoBox(ctx, cx + halfW * 0.25, baseY - wallH - roofH * 0.45, 5, 2.5, 11, {
      left: '#8c857d',
      right: '#5c5650',
      top: '#443f3a',
    });
  }
}

function renderTree(ctx, cx, baseY, variant) {
  ctx.save();
  ctx.fillStyle = 'rgba(10, 14, 18, 0.30)';
  ctx.beginPath();
  ctx.ellipse(cx + 9, baseY + 2, 16, 7.5, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const trunkGrad = ctx.createLinearGradient(cx - 4, baseY - 24, cx + 4, baseY);
  trunkGrad.addColorStop(0, '#785436');
  trunkGrad.addColorStop(1, '#432c19');
  ctx.fillStyle = trunkGrad;
  ctx.beginPath();
  ctx.moveTo(cx - 4.5, baseY + 1);
  ctx.lineTo(cx - 2.5, baseY - 24);
  ctx.lineTo(cx + 2.5, baseY - 24);
  ctx.lineTo(cx + 5, baseY + 1);
  ctx.closePath();
  ctx.fill();

  if (variant === 'pine') {
    const tiers = [
      { y: baseY - 16, w: 18, h: 18 },
      { y: baseY - 28, w: 14, h: 16 },
      { y: baseY - 39, w: 10, h: 14 },
    ];
    for (const tier of tiers) {
      ctx.fillStyle = '#3b7341';
      ctx.beginPath();
      ctx.moveTo(cx, tier.y - tier.h);
      ctx.lineTo(cx - tier.w, tier.y);
      ctx.lineTo(cx, tier.y + 4);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#234a28';
      ctx.beginPath();
      ctx.moveTo(cx, tier.y - tier.h);
      ctx.lineTo(cx + tier.w, tier.y);
      ctx.lineTo(cx, tier.y + 4);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    const puffs = [
      { dx: 5, dy: -26, r: 12, c: '#29542d' },
      { dx: -6, dy: -25, r: 12, c: '#3d783d' },
      { dx: 0, dy: -35, r: 13, c: '#488c44' },
      { dx: -4, dy: -38, r: 8, c: '#65ab57' },
    ];
    for (const p of puffs) {
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(cx + p.dx, baseY + p.dy, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export class EnvironmentSpriteBank {
  constructor() {
    this.buildingCache = new Map();
    this.treeCache = new Map();
  }

  getBuildingCanvas(type = 'house', stage = 2, factionColor = '#2e6fd9') {
    const key = `${type}:${stage}:${factionColor.toLowerCase()}`;
    if (this.buildingCache.has(key)) return this.buildingCache.get(key);

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    renderBuildingStage(ctx, 64, 98, type, stage, factionColor);

    this.buildingCache.set(key, canvas);
    return canvas;
  }

  getTreeCanvas(variant = 'oak') {
    if (this.treeCache.has(variant)) return this.treeCache.get(variant);

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 76;
    const ctx = canvas.getContext('2d');
    renderTree(ctx, 29, 64, variant);

    this.treeCache.set(variant, canvas);
    return canvas;
  }

  /**
   * Drop-in replacement for PrehistoricPlanetaryGame.prototype.drawBuilding
   */
  drawGameBuilding(ctx, building, dx, sy, invTilt = 1, timeSec = 0, showBadges = false) {
    const type = building.type || 'house';
    const progress = building.progress ?? 1.0;
    const factionColor = building.owner === 'enemy' ? '#c93b2b' : building.color || '#2e6fd9';
    const stage = progress < 0.35 ? 0 : progress < 1.0 ? 1 : 2;
    const sprite = this.getBuildingCanvas(type, stage, factionColor);

    ctx.save();
    ctx.translate(dx, sy);
    ctx.scale(1, invTilt);

    ctx.drawImage(sprite, -64, -102, 128, 120);

    const spec = BUILDING_SPECS[type] || BUILDING_SPECS.house;

    if (stage < 2) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.fillRect(-24, -52, 48, 6);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(-23, -51, Math.round(46 * progress), 4);
    } else {
      // Chimney smoke
      if (spec.chimney) {
        const chimX = spec.halfW * 0.25;
        const chimY = -(spec.wallH + spec.roofH * 0.45 + 12);
        for (let i = 0; i < 4; i++) {
          const life = (timeSec * 0.45 + i * 0.25) % 1;
          const px = chimX + Math.sin(life * 5 + i) * 4 + life * 6;
          const py = chimY - life * 24;
          const radius = 2.5 + life * 5.5;
          ctx.fillStyle = `rgba(225, 225, 230, ${(1 - life) * 0.38})`;
          ctx.beginPath();
          ctx.arc(px, py, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Waving faction banner
      if (spec.banner) {
        const poleX = -spec.halfW * 0.35;
        const poleTopY = -(spec.wallH + spec.roofH + (type === 'town_hall' || type === 'citadel' ? 24 : 6));
        ctx.strokeStyle = '#4a3520';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(poleX, poleTopY + 14);
        ctx.lineTo(poleX, poleTopY);
        ctx.stroke();

        const wave = Math.sin(timeSec * 5 + (building.x || 0) * 0.05) * 2.5;
        ctx.fillStyle = factionColor;
        ctx.beginPath();
        ctx.moveTo(poleX, poleTopY);
        ctx.quadraticCurveTo(poleX + 7, poleTopY + 2 + wave, poleX + 13, poleTopY + 4 - wave * 0.5);
        ctx.lineTo(poleX, poleTopY + 8);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Health bar when damaged
    if (building.hp < building.maxHp) {
      const hpRatio = Math.max(0, Math.min(1, (building.hp || 1) / (building.maxHp || 1)));
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(-26, -spec.wallH - spec.roofH - 18, 52, 5);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(-25, -spec.wallH - spec.roofH - 17, Math.round(50 * hpRatio), 3);
    }

    if (showBadges && building.name) {
      ctx.font = '600 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(building.name, 0, -spec.wallH - spec.roofH - 22);
    }

    ctx.restore();
  }

  /**
   * Drop-in replacement for PrehistoricPlanetaryGame.prototype.drawResourceNode
   */
  drawGameResourceNode(ctx, node, dx, sy, invTilt = 1, timeSec = 0) {
    ctx.save();
    ctx.translate(dx, sy);
    ctx.scale(1, invTilt);

    if (node.type === 'tree') {
      const variant = (node.id || Math.round(node.x)) % 3 === 0 ? 'pine' : 'oak';
      const sprite = this.getTreeCanvas(variant);
      const sway = Math.sin(timeSec * 1.8 + node.x * 0.03 + node.y * 0.02) * 0.022;
      ctx.transform(1, 0, sway, 1, 0, 0);
      ctx.drawImage(sprite, -29, -64, 64, 76);
    } else {
      // Shaded isometric stone / gold deposit boulders
      const isGold = node.type === 'gold';
      ctx.fillStyle = 'rgba(10, 14, 18, 0.28)';
      ctx.beginPath();
      ctx.ellipse(2, 2, 16, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = isGold ? '#d4a024' : '#7d858c';
      ctx.strokeStyle = isGold ? '#6b4c0b' : '#3d4347';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-14, 2);
      ctx.lineTo(-9, -12);
      ctx.lineTo(3, -15);
      ctx.lineTo(13, -5);
      ctx.lineTo(11, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Sunlit facet
      ctx.fillStyle = isGold ? '#f7d35c' : '#a6b0b8';
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(-8, -11);
      ctx.lineTo(2, -13);
      ctx.lineTo(-2, 1);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }
}

/* ============================================================================
 * 3. SPARSE HASHED FOOTPATH OVERLAY (Supports planetary wrapDX coordinates)
 * ========================================================================== */

export class PlanetaryFootpathOverlay {
  constructor({ cellSize = 28 } = {}) {
    this.cellSize = cellSize;
    this.cells = new Map(); // key "col:row" -> wear (0..1)
  }

  updateTraffic(villagers, dt = 1 / 60) {
    if (!villagers) return;
    const gain = 0.065 * dt * 12;
    for (let i = 0; i < villagers.length; i++) {
      const u = villagers[i];
      if (Math.hypot(u.vx || 0, u.vy || 0) < 2) continue;
      const col = Math.floor(u.x / this.cellSize);
      const row = Math.floor(u.y / this.cellSize);
      const key = `${col}:${row}`;
      const prev = this.cells.get(key) || 0;
      if (prev < 1) {
        this.cells.set(key, Math.min(1, prev + gain));
      }
    }
  }

  stampBuilding(x, y, radius = 44) {
    const c0 = Math.floor(x / this.cellSize);
    const r0 = Math.floor(y / this.cellSize);
    const rad = Math.ceil(radius / this.cellSize);
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        const d = Math.hypot(dc, dr) / Math.max(1, rad);
        if (d <= 1) {
          const key = `${c0 + dc}:${r0 + dr}`;
          const val = 0.62 * (1 - d * 0.4);
          if (val > (this.cells.get(key) || 0)) {
            this.cells.set(key, val);
          }
        }
      }
    }
  }

  drawVisiblePaths(ctx, cam, canvasWidth, canvasHeight) {
    const halfW = (canvasWidth * 0.65) / cam.zoom;
    const halfH = (canvasHeight * 0.65) / (cam.zoom * (cam.tiltScale || 1));
    const minCol = Math.floor((cam.x - halfW) / this.cellSize);
    const maxCol = Math.ceil((cam.x + halfW) / this.cellSize);
    const minRow = Math.floor((cam.y - halfH) / this.cellSize);
    const maxRow = Math.ceil((cam.y + halfH) / this.cellSize);

    ctx.save();
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const wear = this.cells.get(`${c}:${r}`);
        if (!wear || wear < 0.08) continue;

        const wx = (c + 0.5) * this.cellSize - cam.x;
        const wy = (r + 0.5) * this.cellSize - cam.y;

        if (wear >= 0.72) {
          ctx.fillStyle = `rgba(128, 122, 114, ${Math.min(0.82, wear * 0.85)})`;
        } else {
          ctx.fillStyle = `rgba(139, 108, 76, ${Math.min(0.68, wear * 0.85)})`;
        }
        ctx.beginPath();
        ctx.arc(wx, wy, this.cellSize * (0.35 + wear * 0.25), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

/* ============================================================================
 * 4. ONE-LINE INSTALLER FOR PrehistoricPlanetaryGame
 * ========================================================================== */

/**
 * Call `installIsometricGraphicsUpgrade(PrehistoricPlanetaryGame)` in `src/main.js`
 * right before `new PrehistoricPlanetaryGame(...)` (or pass the `window.game` instance).
 */
export function installIsometricGraphicsUpgrade(targetClassOrInstance) {
  const proto =
    typeof targetClassOrInstance === 'function'
      ? targetClassOrInstance.prototype
      : Object.getPrototypeOf(targetClassOrInstance);

  const villagerBank = new VillagerSpriteBank();
  const envBank = new EnvironmentSpriteBank();
  const footpaths = new PlanetaryFootpathOverlay({ cellSize: 28 });

  // 1. Hook into update(dt) to record villager footsteps
  const origUpdate = proto.update;
  if (typeof origUpdate === 'function') {
    proto.update = function (dt) {
      origUpdate.call(this, dt);
      footpaths.updateTraffic(this.villagers, dt);
    };
  }

  // 2. Hook into renderContinentsAndRiver to draw worn footpaths over terrain
  const origRenderTerrain = proto.renderContinentsAndRiver;
  if (typeof origRenderTerrain === 'function') {
    proto.renderContinentsAndRiver = function (ctx, invTilt) {
      origRenderTerrain.call(this, ctx, invTilt);
      footpaths.drawVisiblePaths(ctx, this.cam, this.canvas.width, this.canvas.height);
    };
  }

  // 3. Replace stick-figure villagers & enemies with shaded isometric sprites
  proto.drawArticulatedHuman = function (ctx, unit, dx, sy, invTilt, isEnemy) {
    villagerBank.drawGameUnit(
      ctx,
      unit,
      dx,
      sy,
      invTilt,
      isEnemy,
      this.time || 0,
      this.showFloatingBadges !== false
    );
  };

  // 4. Replace buildings with 3-stage construction, chimney smoke, and banners
  proto.drawBuilding = function (ctx, building, dx, sy, invTilt) {
    if (!building._footprintStamped) {
      building._footprintStamped = true;
      footpaths.stampBuilding(building.x, building.y, building.radius || 44);
    }
    envBank.drawGameBuilding(
      ctx,
      building,
      dx,
      sy,
      invTilt,
      this.time || 0,
      Boolean(this.showFloatingBadges)
    );
  };

  // 5. Replace trees & ore nodes with shaded isometric trees and boulders
  proto.drawResourceNode = function (ctx, node, dx, sy, invTilt) {
    envBank.drawGameResourceNode(ctx, node, dx, sy, invTilt, this.time || 0);
  };
}