/**
 * Isometric Shaded Villager Sprite Atlas Generator
 * ------------------------------------------------
 * Generates and caches offscreen-canvas sprite sheets for 2.5D RTS / God-game
 * units with 4 isometric directions (SE, SW, NE, NW), 5 animation states
 * (idle, walk, chop, build, attack), faction color tinting, 45-degree top-left
 * directional shading, and optional carried-resource rendering.
 *
 * Zero external assets or dependencies required.
 */

const STATES = {
  idle: { frames: 4, fps: 4, loop: true },
  walk: { frames: 8, fps: 12, loop: true },
  chop: { frames: 6, fps: 10, loop: true },
  build: { frames: 6, fps: 11, loop: true },
  attack: { frames: 6, fps: 12, loop: true },
};

const DIRECTIONS = ['SE', 'SW', 'NE', 'NW'];

/**
 * Adjusts a hex color's brightness by a signed percentage (-1 to +1).
 */
function shadeHex(hex, amount) {
  const clean = hex.replace('#', '');
  const num = parseInt(
    clean.length === 3
      ? clean.split('').map((c) => c + c).join('')
      : clean,
    16
  );
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + Math.round(255 * amount)));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + Math.round(255 * amount)));
  const b = Math.min(255, Math.max(0, (num & 0xff) + Math.round(255 * amount)));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Draws a rounded capsule limb between two points with 2-tone shading.
 */
function drawLimb(ctx, x1, y1, x2, y2, width, baseColor, highlightColor) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = baseColor;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Subtle top-left highlight ridge
  ctx.lineWidth = Math.max(1, width * 0.35);
  ctx.strokeStyle = highlightColor;
  ctx.beginPath();
  ctx.moveTo(x1 - 0.6, y1 - 0.6);
  ctx.lineTo(x2 - 0.6, y2 - 0.6);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws a held tool/weapon in the unit's hand.
 */
function drawTool(ctx, tool, handX, handY, angle, facingRight) {
  if (!tool) return;
  ctx.save();
  ctx.translate(handX, handY);
  ctx.rotate(angle);

  if (tool === 'axe') {
    // Wooden haft
    ctx.strokeStyle = '#6d4c2f';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 2);
    ctx.lineTo(0, -14);
    ctx.stroke();

    // Iron axe head
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
    // Hilt & crossguard
    ctx.strokeStyle = '#c89b3c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-3.5, -2);
    ctx.lineTo(3.5, -2);
    ctx.stroke();

    // Shaded steel blade
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

/**
 * Renders a single shaded isometric villager frame into the target cell.
 */
function renderVillagerFrame(ctx, cx, groundY, opts) {
  const { state, frameIndex, frameCount, dir, palette } = opts;
  const t = frameIndex / frameCount; // Normalized 0..1 cycle
  const tau = Math.PI * 2;
  const facingRight = dir === 'SE' || dir === 'NE';
  const facingBack = dir === 'NE' || dir === 'NW';
  const sideSign = facingRight ? 1 : -1;

  // Animation pose parameters
  let bobY = 0;
  let leanX = 0;
  let leftLeg = 0;
  let rightLeg = 0;
  let frontArmAngle = 0.25 * sideSign;
  let backArmAngle = -0.2 * sideSign;
  let tool = null;
  let toolAngle = 0;
  let slashAlpha = 0;

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
    // Wind up (0..0.45), fast strike (0.45..0.7), recover (0.7..1)
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
    if (t >= 0.48 && t <= 0.68) slashAlpha = 0.55;
  }

  // 1. Grounded isometric contact shadow
  ctx.save();
  ctx.fillStyle = 'rgba(10, 14, 18, 0.34)';
  ctx.beginPath();
  ctx.ellipse(cx + 1.5, groundY, 10.5, 4.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const hipY = groundY - 9 + bobY;
  const shoulderY = hipY - 11;
  const headY = shoulderY - 6.5;

  // 2. Back arm (drawn behind torso)
  const backShoulderX = cx - 4 * sideSign + leanX * 0.6;
  const backHandX = backShoulderX + Math.sin(backArmAngle) * 8.5;
  const backHandY = shoulderY + 2 + Math.cos(backArmAngle) * 8.5;
  drawLimb(
    ctx,
    backShoulderX,
    shoulderY + 2,
    backHandX,
    backHandY,
    3.6,
    palette.tunicDark,
    palette.tunic
  );

  // 3. Legs & boots
  drawLimb(
    ctx,
    cx - 2.6 * sideSign,
    hipY,
    cx - 2.8 * sideSign + leftLeg,
    groundY - 1.5,
    4.0,
    '#3b2f26',
    '#5c4a3c'
  );
  drawLimb(
    ctx,
    cx + 2.6 * sideSign,
    hipY,
    cx + 2.8 * sideSign + rightLeg,
    groundY - 1.0,
    4.0,
    '#4a3b30',
    '#6d5848'
  );

  // 4. Shaded isometric tunic / torso
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

  // Leather belt & faction sash
  ctx.fillStyle = '#3b281c';
  ctx.fillRect(cx - 6.2 + leanX * 0.35, hipY - 2.2, 12.4, 2.4);
  ctx.fillStyle = '#d4af37';
  ctx.fillRect(cx + 1.5 * sideSign + leanX * 0.35, hipY - 2.2, 2.2, 2.4);
  ctx.restore();

  // 5. Head & hair/hood
  ctx.save();
  const headX = cx + leanX;
  const skinGrad = ctx.createRadialGradient(
    headX - 1.8,
    headY - 2,
    1,
    headX,
    headY,
    6.2
  );
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

  // Hair / hood cap (covers more when facing away)
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

  // Subtle eyes when facing camera
  if (!facingBack) {
    ctx.fillStyle = '#1f1916';
    ctx.fillRect(headX + 1.2 * sideSign, headY - 0.4, 1.3, 1.4);
    ctx.fillRect(headX + 3.4 * sideSign, headY - 0.4, 1.2, 1.3);
  }
  ctx.restore();

  // 6. Front arm + tool
  const frontShoulderX = cx + 4.2 * sideSign + leanX * 0.7;
  const frontHandX = frontShoulderX + Math.sin(frontArmAngle) * 8.8;
  const frontHandY = shoulderY + 2 + Math.cos(frontArmAngle) * 8.8;

  drawTool(ctx, tool, frontHandX, frontHandY, toolAngle, facingRight);

  drawLimb(
    ctx,
    frontShoulderX,
    shoulderY + 2,
    frontHandX,
    frontHandY,
    3.8,
    palette.tunic,
    palette.tunicLight
  );

  // Hand
  ctx.fillStyle = '#e4b796';
  ctx.beginPath();
  ctx.arc(frontHandX, frontHandY, 2.0, 0, Math.PI * 2);
  ctx.fill();

  // Optional sword slash arc on attack peak
  if (slashAlpha > 0) {
    ctx.save();
    ctx.strokeStyle = `rgba(235, 245, 255, ${slashAlpha})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(
      cx + 8 * sideSign,
      shoulderY + 2,
      14,
      facingRight ? -0.9 : Math.PI - 0.4,
      facingRight ? 0.4 : Math.PI + 0.9
    );
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Draws a small carried resource bundle (The Settlers style) in front of the unit.
 */
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
    ctx.fillStyle = '#c89b6e';
    ctx.beginPath();
    ctx.arc(5, 0, 2.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (carryItem === 'stone') {
    ctx.fillStyle = '#9aa3ab';
    ctx.strokeStyle = '#49525a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-4, 2);
    ctx.lineTo(-2, -4);
    ctx.lineTo(3, -3);
    ctx.lineTo(5, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (carryItem === 'gold') {
    ctx.fillStyle = '#f2c144';
    ctx.strokeStyle = '#8b6412';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Sprite bank that pre-renders and caches one offscreen atlas per faction color.
 */
export class VillagerSpriteBank {
  constructor({ cellWidth = 48, cellHeight = 56 } = {}) {
    this.cellWidth = cellWidth;
    this.cellHeight = cellHeight;
    this.cache = new Map();

    // Precompute row layout: each (state, dir) pair gets one row
    this.rows = [];
    this.rowIndex = new Map();
    this.maxFrames = 0;

    for (const [stateName, cfg] of Object.entries(STATES)) {
      this.maxFrames = Math.max(this.maxFrames, cfg.frames);
      for (const dir of DIRECTIONS) {
        const key = `${stateName}:${dir}`;
        this.rowIndex.set(key, this.rows.length);
        this.rows.push({ state: stateName, dir, frames: cfg.frames });
      }
    }
  }

  /**
   * Builds or returns a cached offscreen canvas atlas for a faction hex color.
   */
  getAtlas(factionColor = '#2e6fd9') {
    const key = factionColor.toLowerCase();
    if (this.cache.has(key)) return this.cache.get(key);

    const canvas =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(
            this.maxFrames * this.cellWidth,
            this.rows.length * this.cellHeight
          )
        : Object.assign(document.createElement('canvas'), {
            width: this.maxFrames * this.cellWidth,
            height: this.rows.length * this.cellHeight,
          });

    const ctx = canvas.getContext('2d');
    const palette = {
      tunic: factionColor,
      tunicLight: shadeHex(factionColor, 0.16),
      tunicDark: shadeHex(factionColor, -0.2),
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

  /**
   * Maps a movement vector (vx, vy) to one of the 4 isometric directions.
   */
  static vectorToDirection(vx, vy, fallback = 'SE') {
    if (Math.abs(vx) < 0.01 && Math.abs(vy) < 0.01) return fallback;
    if (vy >= 0) return vx >= 0 ? 'SE' : 'SW';
    return vx >= 0 ? 'NE' : 'NW';
  }

  /**
   * Blits the appropriate sprite frame onto your main game canvas.
   */
  drawVillager(ctx, unit) {
    const {
      x,
      y,
      factionColor = '#2e6fd9',
      state = 'idle',
      dir = 'SE',
      animTime = 0, // seconds
      scale = 1,
      carryItem = null,
    } = unit;

    const cfg = STATES[state] || STATES.idle;
    const frameIndex = Math.floor(animTime * cfg.fps) % cfg.frames;
    const row = this.rowIndex.get(`${state}:${dir}`) ?? 0;
    const atlas = this.getAtlas(factionColor);

    const sx = frameIndex * this.cellWidth;
    const sy = row * this.cellHeight;
    const dw = this.cellWidth * scale;
    const dh = this.cellHeight * scale;

    // Anchor bottom-center of sprite at (x, y)
    const dx = Math.round(x - dw * 0.5);
    const dy = Math.round(y - dh + 8 * scale);

    ctx.drawImage(
      atlas,
      sx,
      sy,
      this.cellWidth,
      this.cellHeight,
      dx,
      dy,
      dw,
      dh
    );

    if (carryItem && (state === 'walk' || state === 'idle')) {
      drawCarriedResource(ctx, x, y, carryItem, dir === 'SE' || dir === 'NE');
    }
  }
}