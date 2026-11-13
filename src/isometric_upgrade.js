/**
 * Drop-in Isometric Graphics, Earth Biome, Combat, Bending & 2.5D Physics Engine
 * for https://github.com/Tosin5S/pt
 * ------------------------------------------------------------------------------
 * File target in your repo: src/isometric_upgrade.js
 *
 * New in this version — High-End 2.5D Rigid-Body, Vertical Z-Gravity & Environmental Physics (`SovereignPhysicsEngine`):
 * 1. Vertical Z-Axis Ballistics, Gravity & Multi-Bounce Restitution (`u.z`, `u.vz`):
 *    - Every unit now has true 3D vertical altitude (`u.z`) and vertical velocity (`u.vz`).
 *    - Heavy impacts (`applyKnockback`), Juggernaut hammer slams, Earthbending seismic tremors,
 *      Airbending cyclones, and Meteor shockwaves launch units into the air along a realistic
 *      parabolic arc (`g = -580 px/s^2`), bouncing on landing (`restitution = 0.34`) and spawning
 *      expanding ground dust-impact rings.
 * 2. Mass-Weighted Elastic Unit & Building Collisions (`resolveUnitPhysics` + `spatialGrid`):
 *    - Assigns realistic physical mass by unit class: Child (`0.6`), Villager (`1.0`), Phalanx
 *      Shield-Wall (`1.9`), Juggernaut Titan (`2.4`), Ring-Wraith (`2.8`), Hero `t101s` (`3.5`),
 *      and World Boss (`10.0`).
 *    - Uses `this.spatialGrid.query(u.x, u.y, 44)` to resolve unit-to-unit overlap with momentum
 *      transfer (heavy units plow through light units) and smooth tangential sliding around
 *      building footprints (`b._isBuilding`).
 * 3. Terrain Slope, River Current & Biome Surface Friction:
 *    - River hydrodynamics: Units wading in the river (`Math.abs(u.y - RIVER_Y) < 42`) outside of
 *      stone bridges (`this.stoneBridges`) experience downstream water current drift, viscous
 *      water drag, and animated concentric water-wake ripples (unless Waterbending surfing).
 *    - Cliff ledge & ramp physics: Enforces the `y = 1680` continental cliff wall so grounded
 *      units must use `this.cliffRamps` (or `skySoar` / airborne jump `u.z > 22`) to cross, while
 *      units descending ramps gain downhill momentum.
 *    - Biome friction: Ice/Tundra reduces traction (longer momentum slide), Desert sand adds mild
 *      footing resistance, and Cobblestone footpaths (`footpaths.getWearAt`) grant a +18% road
 *      speed boost.
 * 4. Relativistic Vortex & Shockwave Physics:
 *    - `blackHoles`: Adds tangential orbital swirl + inverse-distance gravitational pull + upward
 *      spaghettification lift (`u.vz`) near the event horizon.
 *    - `fallingMeteors` & `applyKnockback`: Adds camera screen-shake impulse (`this._physCamShake`),
 *      radial shockwave launch (`u.vz`), and secondary debris particles.
 */

import {
  WORLD_W,
  WORLD_H,
  RIVER_Y,
  CONTINENTS,
  EARTH_SURFACE_STATS,
  getEarthTerrainAt,
  wrapX,
  wrapDX,
} from './constants.js';

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
 * 1. VILLAGER, HERO & WARRIOR OFFSCREEN SPRITE BANK
 * ========================================================================== */

const UNIT_STATES = {
  idle: { frames: 4, fps: 4 },
  walk: { frames: 8, fps: 12 },
  chop: { frames: 6, fps: 10 },
  build: { frames: 6, fps: 11 },
  attack: { frames: 6, fps: 14 },
};

const DIRECTIONS = ['SE', 'SW', 'NE', 'NW'];

function mapUnitStateToAnim(rawState, vx, vy, swingAnim = 0) {
  if ((swingAnim || 0) > 0.05) return 'attack';
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

function drawUnitCombatAndBendingFX(ctx, unit, facingRight, scale, gameTime) {
  const f = facingRight ? 1 : -1;
  const phase = gameTime * 4.5 + (unit.id || 0) * 0.9;
  const swing = unit.swingAnim || 0;
  const kata = unit.kataTimer || 0;

  if (unit.isT101s || unit.isWraith || unit.skySoar) {
    const flap = Math.sin(gameTime * 7 + (unit.id || 0)) * 5;
    if (unit.isWraith || unit.skySoar) {
      ctx.save();
      ctx.fillStyle = unit.isWraith ? 'rgba(30, 27, 75, 0.78)' : 'rgba(251, 191, 36, 0.38)';
      ctx.strokeStyle = unit.isWraith ? '#818cf8' : '#fde047';
      ctx.lineWidth = 1.3;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, -22 * scale);
        ctx.quadraticCurveTo(
          side * 22 * scale,
          (-38 + flap) * scale,
          side * 30 * scale,
          (-18 + flap * 1.3) * scale
        );
        ctx.quadraticCurveTo(side * 16 * scale, -14 * scale, 0, -14 * scale);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    if (unit.isT101s) {
      const capeWave = Math.sin(gameTime * 6) * 3;
      ctx.fillStyle = '#991b1b';
      ctx.beginPath();
      ctx.moveTo(-4 * f * scale, -24 * scale);
      ctx.lineTo(-14 * f * scale, (-6 + capeWave) * scale);
      ctx.lineTo(-4 * f * scale, -7 * scale);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#fbbf24';
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-5 * scale, -34 * scale);
      ctx.lineTo(-4 * scale, -39 * scale);
      ctx.lineTo(0, -36 * scale);
      ctx.lineTo(0, -40 * scale);
      ctx.lineTo(4 * scale, -39 * scale);
      ctx.lineTo(5 * scale, -34 * scale);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  const style = unit.fightingStyle;
  if (style === 'phalanx') {
    const thrust = swing > 0.05 ? Math.sin(swing * Math.PI) * 10 * f : 0;
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-8 * f + thrust, -16);
    ctx.lineTo(20 * f + thrust, -20);
    ctx.stroke();

    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(20 * f + thrust, -22);
    ctx.lineTo(26 * f + thrust, -20);
    ctx.lineTo(20 * f + thrust, -18);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#d97706';
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(5 * f, -14, 5.5, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (style === 'archery') {
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(6 * f, -16, 9, f > 0 ? -1.1 : Math.PI - 1.1, f > 0 ? 1.1 : Math.PI + 1.1);
    ctx.stroke();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(6 * f, -24);
    ctx.lineTo(6 * f, -8);
    ctx.stroke();
  } else if (style === 'juggernaut') {
    const smash = swing > 0.05 ? Math.sin(swing * Math.PI) * 1.1 : -0.35;
    ctx.save();
    ctx.translate(6 * f, -16);
    ctx.rotate(smash * f);
    ctx.strokeStyle = '#5c2d0c';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.lineTo(0, -18);
    ctx.stroke();
    ctx.fillStyle = '#57534e';
    ctx.strokeStyle = '#fb923c';
    ctx.lineWidth = 1.2;
    ctx.fillRect(-6, -23, 12, 7);
    ctx.strokeRect(-6, -23, 12, 7);
    ctx.restore();
  } else if (style === 'berserker') {
    ctx.strokeStyle = '#fb7185';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(7 * f, -14);
    ctx.lineTo(15 * f, -21);
    ctx.moveTo(-5 * f, -13);
    ctx.lineTo(-12 * f, -19);
    ctx.stroke();
  } else if (style === 'onering' || unit.hasOneRing) {
    ctx.save();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -42 * scale, 8, 3.2, Math.sin(gameTime * 3) * 0.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (kata > 0) {
    ctx.save();
    const kataSpin = gameTime * 16;
    for (let k = 0; k < 2; k++) {
      const a = kataSpin + k * Math.PI;
      ctx.strokeStyle = k === 0 ? 'rgba(251, 191, 36, 0.88)' : 'rgba(56, 189, 248, 0.82)';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.arc(0, -18 * scale, 22 * scale, a, a + 1.9);
      ctx.stroke();
    }
    const ringR = 14 + ((gameTime * 28) % 22);
    ctx.strokeStyle = 'rgba(253, 224, 71, 0.55)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.ellipse(0, 2, ringR, ringR * 0.45, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const bender = unit.bender;
  if (bender) {
    ctx.save();
    if (bender === 'fire') {
      for (let i = 0; i < 3; i++) {
        const a = phase + (i * Math.PI * 2) / 3;
        const ox = Math.cos(a) * 16 * scale;
        const oy = -16 * scale + Math.sin(a) * 7 * scale;
        const grad = ctx.createRadialGradient(ox, oy, 0.5, ox, oy, 5.5);
        grad.addColorStop(0, '#fef08a');
        grad.addColorStop(0.5, '#f97316');
        grad.addColorStop(1, 'rgba(220, 38, 38, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ox, oy, 5.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (unit.subElement || swing > 0.08) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        let lx = 6 * f;
        let ly = -18 * scale;
        ctx.moveTo(lx, ly);
        for (let s = 0; s < 4; s++) {
          lx += f * 6;
          ly += (Math.sin(gameTime * 45 + s * 3) - 0.3) * 6;
          ctx.lineTo(lx, ly);
        }
        ctx.stroke();
      }
    } else if (bender === 'water') {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.78)';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      for (let i = 0; i <= 16; i++) {
        const t = (i / 16) * Math.PI * 2;
        const wx = Math.cos(t + phase * 0.7) * 17 * scale;
        const wy = -16 * scale + Math.sin(t * 2 + phase) * 6 * scale;
        if (i === 0) ctx.moveTo(wx, wy);
        else ctx.lineTo(wx, wy);
      }
      ctx.stroke();

      if (unit.subElement) {
        ctx.fillStyle = 'rgba(186, 230, 253, 0.85)';
        for (let i = 0; i < 3; i++) {
          const ia = -phase + (i * Math.PI * 2) / 3;
          const ix = Math.cos(ia) * 19 * scale;
          const iy = -18 * scale + Math.sin(ia) * 7 * scale;
          ctx.beginPath();
          ctx.moveTo(ix, iy - 5);
          ctx.lineTo(ix + 3, iy);
          ctx.lineTo(ix, iy + 5);
          ctx.lineTo(ix - 3, iy);
          ctx.closePath();
          ctx.fill();
        }
      }
    } else if (bender === 'earth') {
      for (let i = 0; i < 3; i++) {
        const a = phase * 0.8 + (i * Math.PI * 2) / 3;
        const rx = Math.cos(a) * 18 * scale;
        const ry = -14 * scale + Math.sin(a) * 7 * scale;
        ctx.fillStyle = '#78716c';
        ctx.strokeStyle = unit.subElement ? '#f97316' : '#44403c';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(rx, ry, 4.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else if (bender === 'air') {
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.75)';
      ctx.lineWidth = 2;
      for (let r = 0; r < 2; r++) {
        const startA = phase * 1.6 + r * Math.PI;
        ctx.beginPath();
        ctx.ellipse(0, (-6 - r * 8) * scale, (14 + r * 4) * scale, 5 * scale, 0, startA, startA + 2.1);
        ctx.stroke();
      }
    } else if (bender === 'avatar') {
      const ringColors = ['#f97316', '#38bdf8', '#a3e635', '#f8fafc'];
      for (let r = 0; r < 4; r++) {
        ctx.save();
        ctx.translate(0, -18 * scale);
        ctx.rotate((r * Math.PI) / 4 + Math.sin(gameTime * 1.5 + r) * 0.35);
        ctx.strokeStyle = ringColors[r];
        ctx.lineWidth = 2.0;
        const startA = (gameTime * (3.5 + r * 0.6)) % (Math.PI * 2);
        ctx.beginPath();
        ctx.ellipse(0, 0, 22 * scale, 7.5 * scale, 0, startA, startA + 4.4);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  if (unit.invincible && !unit.isShadowClone) {
    ctx.save();
    const pulse = 0.45 + Math.sin(gameTime * 6) * 0.15;
    ctx.strokeStyle = `rgba(250, 204, 21, ${pulse.toFixed(3)})`;
    ctx.fillStyle = `rgba(250, 204, 21, ${(pulse * 0.18).toFixed(3)})`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = gameTime * 1.5 + (i * Math.PI) / 3;
      const hx = Math.cos(a) * 19 * scale;
      const hy = -18 * scale + Math.sin(a) * 21 * scale;
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  if (unit.lightningSpeed) {
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.4;
    for (let b = 0; b < 2; b++) {
      const seed = Math.floor(gameTime * 24) + b * 7 + (unit.id || 0);
      const sx = (hash2D(seed, 1) - 0.5) * 18 * scale;
      const sy = (-6 - hash2D(seed, 2) * 24) * scale;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (hash2D(seed, 3) - 0.5) * 12, sy - 6);
      ctx.lineTo(sx + (hash2D(seed, 4) - 0.5) * 12, sy - 12);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (swing > 0.05) {
    ctx.save();
    const swingColor =
      bender === 'fire'
        ? '#f97316'
        : bender === 'water'
        ? '#38bdf8'
        : bender === 'earth'
        ? '#a3e635'
        : bender === 'avatar'
        ? '#fde047'
        : unit.isT101s
        ? '#f43f5e'
        : '#f8fafc';

    ctx.globalAlpha = Math.min(1, swing * 1.6);
    const arcCenterY = -16 * scale;
    const startA = f > 0 ? -1.15 : Math.PI - 0.75;
    const endA = f > 0 ? 0.75 : Math.PI + 1.15;

    ctx.strokeStyle = swingColor;
    ctx.lineWidth = 5.0 * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(f * 7 * scale, arcCenterY, 17 * scale, startA, endA);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.0 * scale;
    ctx.beginPath();
    ctx.arc(f * 7 * scale, arcCenterY, 16.5 * scale, startA + 0.15, endA - 0.15);
    ctx.stroke();
    ctx.restore();
  }
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

  drawGameUnit(ctx, unit, dx, sy, invTilt = 1, isEnemy = false, gameTime = 0, showBadges = true) {
    const factionColor = unit.isWraith
      ? '#312e81'
      : unit.isShadowClone
      ? '#7c3aed'
      : isEnemy
      ? '#c93b2b'
      : unit.isT101s
      ? '#d97706'
      : unit.color || unit.tribeColor || '#2e6fd9';

    const animState = mapUnitStateToAnim(unit.state, unit.vx, unit.vy, unit.swingAnim);
    const dir = VillagerSpriteBank.vectorToDirection(unit.vx, unit.vy, unit._lastIsoDir || 'SE');
    unit._lastIsoDir = dir;
    const facingRight = dir === 'SE' || dir === 'NE';

    const animTime = (unit.animTime ?? gameTime) + (unit.id || 0) * 0.17;
    const baseScale = unit.isT101s ? 1.32 : unit.isWraith ? 1.22 : unit.childScale || 1.0;
    const cfg = UNIT_STATES[animState] || UNIT_STATES.idle;
    const frameIndex = Math.floor(animTime * cfg.fps) % cfg.frames;
    const row = this.rowIndex.get(`${animState}:${dir}`) ?? 0;
    const atlas = this.getAtlas(factionColor);

    // Combine physical 3D vertical altitude (`unit.z`) with levitation/kata hover
    const physZ = Math.max(0, unit.z || 0);
    const hoverOffset =
      -physZ +
      (unit.skySoar || unit.isWraith
        ? -18 + Math.sin(gameTime * 4 + (unit.id || 0)) * 4
        : (unit.kataTimer || 0) > 0
        ? -Math.abs(Math.sin(gameTime * 10)) * 16
        : 0);

    ctx.save();
    ctx.translate(dx, sy);
    ctx.scale(1, invTilt);

    if (unit.isShadowClone) {
      ctx.globalAlpha = 0.68 + Math.sin(gameTime * 12 + (unit.id || 0)) * 0.15;
    }

    // Water wading ripples when in river
    if (unit._inRiverWater && physZ < 4) {
      const rippleR = 11 + Math.sin(gameTime * 6 + (unit.id || 0)) * 2.5;
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.55)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(0, 1, rippleR, rippleR * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Ground contact shadow shrinks as physical altitude `physZ` increases
    if (hoverOffset < -2) {
      const shadowShrink = Math.max(0.35, 1 - Math.abs(hoverOffset) / 95);
      ctx.fillStyle = `rgba(10, 14, 18, ${(0.28 * shadowShrink).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(0, 2, 12 * baseScale * shadowShrink, 5 * baseScale * shadowShrink, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.translate(0, hoverOffset);

    if (unit.isT101s) {
      ctx.save();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(0, 1, 16, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (unit.controlledByRing) {
      ctx.save();
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.85)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(0, 1, 14, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const dw = this.cellWidth * baseScale;
    const dh = this.cellHeight * baseScale;

    if ((unit.kataTimer || 0) > 0) {
      ctx.save();
      ctx.translate(0, -dh * 0.45);
      ctx.rotate(gameTime * 14 * (facingRight ? 1 : -1));
      ctx.drawImage(
        atlas,
        frameIndex * this.cellWidth,
        row * this.cellHeight,
        this.cellWidth,
        this.cellHeight,
        Math.round(-dw * 0.5),
        Math.round(-dh * 0.55 + 8 * baseScale),
        dw,
        dh
      );
      ctx.restore();
    } else {
      ctx.drawImage(
        atlas,
        frameIndex * this.cellWidth,
        row * this.cellHeight,
        this.cellWidth,
        this.cellHeight,
        Math.round(-dw * 0.5),
        Math.round(-dh + 8 * baseScale),
        dw,
        dh
      );
    }

    if ((unit.carryAmount || 0) > 0 && unit.gatherType) {
      drawCarriedResource(ctx, 0, 0, unit.gatherType, facingRight);
    }

    drawUnitCombatAndBendingFX(ctx, unit, facingRight, baseScale, gameTime);

    if (unit.hp < unit.maxHp || unit.isT101s) {
      const hpRatio = Math.max(0, Math.min(1, (unit.hp || 1) / (unit.maxHp || 1)));
      const bw = unit.isT101s ? 30 : 24;
      const by = -dh + 2;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(-bw * 0.5, by, bw, 4.5);
      ctx.fillStyle = isEnemy ? '#ef4444' : unit.isT101s ? '#fbbf24' : '#22c55e';
      ctx.fillRect(-bw * 0.5 + 0.5, by + 0.5, (bw - 1) * hpRatio, 3.5);
    }

    if (showBadges && (unit.isT101s || unit.isWraith) && unit.name) {
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = unit.isWraith ? '#c7d2fe' : '#fde68a';
      ctx.fillText(unit.name, 0, -dh - 6);
    }

    ctx.restore();
  }
}

/* ============================================================================
 * 2. 2.5D RIGID-BODY, VERTICAL Z-GRAVITY & ENVIRONMENTAL PHYSICS ENGINE
 * ========================================================================== */

export class SovereignPhysicsEngine {
  constructor() {
    this.gravity = 580; // Vertical downward acceleration (px/s^2)
    this.restitution = 0.34; // Ground bounce elasticity
    this.camShakeX = 0;
    this.camShakeY = 0;
    this.camShakeIntensity = 0;
    this.dustRings = []; // Landing & shockwave dust rings
  }

  /**
   * Computes realistic physical mass for momentum conservation during collisions & knockbacks.
   */
  getUnitMass(u) {
    if (!u) return 1.0;
    if (u.isBoss) return 10.0;
    if (u.isT101s) return 3.5;
    if (u.isWraith) return 2.8;
    if (u.fightingStyle === 'juggernaut') return 2.4;
    if (u.fightingStyle === 'phalanx') return 1.9;
    if (u.childScale && u.childScale < 0.85) return 0.6;
    return 1.0;
  }

  addCameraShake(amount = 6) {
    this.camShakeIntensity = Math.min(18, this.camShakeIntensity + amount);
  }

  spawnLandingDust(x, y, strength = 1.0, color = 'rgba(214, 195, 165, 0.55)') {
    if (this.dustRings.length > 48) this.dustRings.shift();
    this.dustRings.push({
      x,
      y,
      radius: 4,
      maxRadius: Math.min(48, 12 + strength * 16),
      life: 0.42,
      maxLife: 0.42,
      color,
    });
  }

  /**
   * Steps 3D vertical ballistics (`z`, `vz`), river hydrodynamics, cliff ledges,
   * black hole orbital swirl, and mass-weighted rigid-body collisions.
   */
  stepWorldPhysics(game, dt, footpaths) {
    const clampedDt = Math.min(0.05, Math.max(0.001, dt));

    // 1. Decay camera shake
    if (this.camShakeIntensity > 0.1) {
      this.camShakeIntensity *= Math.exp(-clampedDt * 12);
      const angle = Math.random() * Math.PI * 2;
      this.camShakeX = Math.cos(angle) * this.camShakeIntensity;
      this.camShakeY = Math.sin(angle) * this.camShakeIntensity;
    } else {
      this.camShakeIntensity = 0;
      this.camShakeX = 0;
      this.camShakeY = 0;
    }

    // 2. Update expanding landing dust rings
    for (let i = this.dustRings.length - 1; i >= 0; i--) {
      const r = this.dustRings[i];
      r.life -= clampedDt;
      if (r.life <= 0) {
        this.dustRings.splice(i, 1);
      } else {
        const t = 1 - r.life / r.maxLife;
        r.radius = 4 + (r.maxRadius - 4) * t;
      }
    }

    // 3. Relativistic Black Hole Tangential Swirl + Vertical Lift
    if (Array.isArray(game.blackHoles) && game.blackHoles.length > 0 && game.spatialGrid) {
      for (const bh of game.blackHoles) {
        const pullR = (bh.radius || 52) * 3.6;
        const nearby = game.spatialGrid.query(bh.x, bh.y, pullR);
        for (const entity of nearby) {
          if (!entity || entity._isBuilding || entity.invincible) continue;
          const dx = wrapDX(entity.x, bh.x);
          const dy = bh.y - entity.y;
          const dist = Math.max(12, Math.hypot(dx, dy));
          if (dist > pullR) continue;

          const normX = dx / dist;
          const normY = dy / dist;
          // Tangential swirl vector (-normY, normX)
          const falloff = 1 - dist / pullR;
          const swirlForce = 210 * falloff;
          const inwardForce = 180 * falloff * falloff;

          entity.kx = (entity.kx || 0) + (normX * inwardForce - normY * swirlForce) * clampedDt * 8;
          entity.ky = (entity.ky || 0) + (normY * inwardForce + normX * swirlForce) * clampedDt * 8;

          // Lift units off the ground as they spiral into the singularity
          if (dist < (bh.radius || 52) * 1.4) {
            entity.vz = Math.max(entity.vz || 0, 85 * falloff);
          }
        }
      }
    }

    // 4. Step unit vertical ballistics, environmental forces & rigid-body collisions
    const allUnits = [];
    if (Array.isArray(game.villagers)) {
      for (const u of game.villagers) allUnits.push(u);
    }
    if (Array.isArray(game.enemies)) {
      for (const e of game.enemies) allUnits.push(e);
    }

    for (let i = 0; i < allUnits.length; i++) {
      const u = allUnits[i];
      if (!u) continue;

      if (typeof u.z !== 'number') u.z = 0;
      if (typeof u.vz !== 'number') u.vz = 0;

      // Vertical Z-Gravity & Multi-Bounce Restitution
      if (u.z > 0 || u.vz !== 0) {
        u.vz -= this.gravity * clampedDt;
        u.z += u.vz * clampedDt;

        if (u.z <= 0) {
          u.z = 0;
          if (u.vz < -95) {
            const impactSpeed = Math.abs(u.vz);
            u.vz = impactSpeed * this.restitution;
            this.spawnLandingDust(u.x, u.y, impactSpeed / 220);
          } else {
            u.vz = 0;
          }
        }
      }

      // River Hydrodynamics (Downstream Current Drift & Viscous Drag unless on a Stone Bridge)
      const inRiverBand = Math.abs(u.y - RIVER_Y) < 42;
      let onBridge = false;
      if (inRiverBand && Array.isArray(game.stoneBridges)) {
        for (const br of game.stoneBridges) {
          if (Math.abs(wrapDX(u.x, br.x)) < 46) {
            onBridge = true;
            break;
          }
        }
      }

      u._inRiverWater = inRiverBand && !onBridge && !u.skySoar && u.z < 4;
      if (u._inRiverWater) {
        if (u.bender === 'water') {
          // Waterbenders surf swiftly across the current
          u.x = wrapX(u.x + u.vx * 0.25 * clampedDt, WORLD_W);
        } else {
          // Downstream current drift (+26 px/s) & wading drag
          u.x = wrapX(u.x + 26 * clampedDt - u.vx * 0.22 * clampedDt, WORLD_W);
          u.y -= u.vy * 0.22 * clampedDt;
        }
      }

      // Cobblestone Road Speed Boost (+18% movement speed on established footpaths)
      if (footpaths && !u._inRiverWater && u.z === 0) {
        const wear = footpaths.getWearAt(u.x, u.y);
        if (wear >= 0.45) {
          const boost = wear >= 0.68 ? 0.18 : 0.10;
          u.x = wrapX(u.x + (u.vx || 0) * boost * clampedDt, WORLD_W);
          u.y += (u.vy || 0) * boost * clampedDt;
        }
      }

      // Highland Cliff Wall Ledge Physics (y = 1680..1714) unless on a cliffRamp or airborne
      if (!u.skySoar && u.z < 20 && u.y > 1672 && u.y < 1720) {
        let onRamp = false;
        if (Array.isArray(game.cliffRamps)) {
          for (const ramp of game.cliffRamps) {
            if (Math.abs(wrapDX(u.x, ramp.x)) < 54) {
              onRamp = true;
              break;
            }
          }
        }
        if (!onRamp) {
          // Push unit cleanly off the sheer cliff face
          if (u.y < 1696) u.y = 1672;
          else u.y = 1720;
          u.ky = -(u.ky || 0) * 0.4;
        }
      }
    }
  }

  /**
   * Mass-weighted unit-to-unit elastic separation + smooth tangential sliding
   * around buildings.
   */
  resolveMassCollisions(game, u, dt) {
    if (!game.spatialGrid || !u) return;
    const neighbors = game.spatialGrid.query(u.x, u.y, 48);
    const massA = this.getUnitMass(u);
    const radA = u.radius || (u.isT101s ? 14 : 10);

    for (let i = 0; i < neighbors.length; i++) {
      const other = neighbors[i];
      if (!other || other === u) continue;

      const dx = wrapDX(other.x, u.x);
      const dy = u.y - other.y;
      const dist = Math.hypot(dx, dy);

      if (other._isBuilding) {
        // Building collision with smooth tangential slide
        const minSep = radA + (other.radius || 32);
        if (dist < minSep && dist > 0.001) {
          const overlap = minSep - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          u.x = wrapX(u.x + nx * overlap, WORLD_W);
          u.y += ny * overlap;

          // Project velocity onto tangent so units glide smoothly around building corners
          const vn = (u.vx || 0) * nx + (u.vy || 0) * ny;
          if (vn < 0) {
            u.vx -= vn * nx * 0.85;
            u.vy -= vn * ny * 0.85;
          }
        }
      } else {
        // Unit-to-unit mass-weighted separation
        if (Math.abs((u.z || 0) - (other.z || 0)) > 24) continue;
        const radB = other.radius || (other.isT101s ? 14 : 10);
        const minSep = radA + radB;
        if (dist < minSep && dist > 0.001) {
          const overlap = minSep - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          const massB = this.getUnitMass(other);
          const totalMass = massA + massB;
          const shareA = massB / totalMass;
          const shareB = massA / totalMass;

          u.x = wrapX(u.x + nx * overlap * shareA * 0.55, WORLD_W);
          u.y += ny * overlap * shareA * 0.55;
          other.x = wrapX(other.x - nx * overlap * shareB * 0.55, WORLD_W);
          other.y -= ny * overlap * shareB * 0.55;
        }
      }
    }
  }

  drawPhysicsVFX(ctx, game, invTilt = 1) {
    if (this.dustRings.length === 0) return;
    const viewHalfW = (game.canvas.width * 0.65) / game.cam.zoom;

    ctx.save();
    for (const r of this.dustRings) {
      const sx = wrapDX(game.cam.x, r.x);
      if (Math.abs(sx) > viewHalfW + 80) continue;
      const sy = r.y - game.cam.y;
      const alpha = Math.max(0, (r.life / r.maxLife) * 0.55);

      ctx.strokeStyle = `rgba(214, 195, 165, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(sx, sy, r.radius, r.radius * 0.45 * invTilt, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/* ============================================================================
 * 3. SOVEREIGN POWERS & COMBAT VFX OVERLAY (`renderCombatAndArrowVFX` Upgrade)
 * ========================================================================== */

export class CombatAndPowersVFXRenderer {
  drawEnhancedCombatVFX(ctx, game, invTilt = 1) {
    const timeSec = game.time || 0;
    const viewHalfW = (game.canvas.width * 0.65) / game.cam.zoom;
    const hero = Array.isArray(game.villagers) ? game.villagers.find((u) => u.isT101s) : null;

    if ((game.globalTimeSlowTimer || 0) > 0 && hero) {
      const hx = wrapDX(game.cam.x, hero.x);
      const hy = hero.y - game.cam.y;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.scale(1, invTilt);

      const domeR = 260 + Math.sin(timeSec * 3) * 10;
      const grad = ctx.createRadialGradient(0, 0, domeR * 0.2, 0, 0, domeR);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0.0)');
      grad.addColorStop(0.75, 'rgba(56, 189, 248, 0.10)');
      grad.addColorStop(1, 'rgba(250, 204, 21, 0.32)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, domeR, domeR * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(253, 224, 71, 0.55)';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 12; i++) {
        const a = timeSec * 0.4 + (i * Math.PI) / 6;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (domeR - 12), Math.sin(a) * (domeR - 12) * 0.6);
        ctx.lineTo(Math.cos(a) * domeR, Math.sin(a) * domeR * 0.6);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (hero && (hero.bloodbendTarget || game.bloodbendActive)) {
      const hx = wrapDX(game.cam.x, hero.x);
      const hy = hero.y - game.cam.y;
      const targets = [];
      if (hero.bloodbendTarget && typeof hero.bloodbendTarget === 'object') {
        targets.push(hero.bloodbendTarget);
      } else if (Array.isArray(game.enemies)) {
        for (const e of game.enemies) {
          if (Math.abs(wrapDX(hero.x, e.x)) < 260 && Math.abs(hero.y - e.y) < 220) {
            targets.push(e);
            if (targets.length >= 4) break;
          }
        }
      }

      ctx.save();
      for (const t of targets) {
        const tx = wrapDX(game.cam.x, t.x);
        const ty = t.y - game.cam.y;
        ctx.strokeStyle = 'rgba(225, 29, 72, 0.82)';
        ctx.lineWidth = 1.8;
        for (let strand = -1; strand <= 1; strand++) {
          ctx.beginPath();
          ctx.moveTo(hx, hy - 22 * invTilt);
          ctx.quadraticCurveTo(
            (hx + tx) * 0.5 + strand * 18,
            Math.min(hy, ty) - (42 + Math.sin(timeSec * 8 + strand) * 8) * invTilt,
            tx + strand * 5,
            ty - 16 * invTilt
          );
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.75)';
        ctx.beginPath();
        ctx.ellipse(tx, ty, 16, 7 * invTilt, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (Array.isArray(game.blackHoles)) {
      for (const bh of game.blackHoles) {
        const bx = wrapDX(game.cam.x, bh.x);
        if (Math.abs(bx) > viewHalfW + 180) continue;
        const by = bh.y - game.cam.y;
        const r = bh.radius || 52;

        ctx.save();
        ctx.translate(bx, by);
        ctx.scale(1, invTilt);

        const halo = ctx.createRadialGradient(0, 0, r * 0.25, 0, 0, r * 1.65);
        halo.addColorStop(0, 'rgba(0, 0, 0, 0.98)');
        halo.addColorStop(0.38, 'rgba(88, 28, 135, 0.85)');
        halo.addColorStop(0.68, 'rgba(217, 70, 239, 0.45)');
        halo.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.65, 0, Math.PI * 2);
        ctx.fill();

        for (let arm = 0; arm < 4; arm++) {
          const startA = -timeSec * 5.5 + (arm * Math.PI) / 2;
          ctx.strokeStyle = arm % 2 === 0 ? 'rgba(244, 114, 182, 0.78)' : 'rgba(56, 189, 248, 0.72)';
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.ellipse(0, 0, r * 1.15, r * 0.58, 0.25, startA, startA + 1.85);
          ctx.stroke();
        }

        ctx.fillStyle = '#020617';
        ctx.strokeStyle = '#f0abfc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
      }
    }

    if (Array.isArray(game.fallingMeteors)) {
      for (const m of game.fallingMeteors) {
        const tx = wrapDX(game.cam.x, m.targetX ?? m.x);
        if (Math.abs(tx) > viewHalfW + 240) continue;
        const ty = (m.targetY ?? m.y) - game.cam.y;
        const prog = Math.max(0, Math.min(1, m.progress ?? 0.5));

        ctx.save();
        ctx.strokeStyle = `rgba(249, 115, 22, ${(0.35 + prog * 0.55).toFixed(3)})`;
        ctx.fillStyle = `rgba(220, 38, 38, ${(0.12 + prog * 0.22).toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(tx, ty, 38 * (0.4 + prog * 0.6), 18 * (0.4 + prog * 0.6), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        const mx = wrapDX(game.cam.x, m.x);
        const my = m.y - game.cam.y;

        const tailGrad = ctx.createLinearGradient(mx, my, mx - 55, my - 95 * invTilt);
        tailGrad.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
        tailGrad.addColorStop(0.4, 'rgba(249, 115, 22, 0.75)');
        tailGrad.addColorStop(1, 'rgba(124, 45, 18, 0.0)');
        ctx.strokeStyle = tailGrad;
        ctx.lineWidth = 18;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(mx - 55, my - 95 * invTilt);
        ctx.stroke();

        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(mx, my, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ea580c';
        ctx.beginPath();
        ctx.arc(mx - 2, my - 2, 8.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    if (Array.isArray(game.slashRibbons)) {
      for (const s of game.slashRibbons) {
        const sx = wrapDX(game.cam.x, s.x);
        if (Math.abs(sx) > viewHalfW + 80) continue;
        const sy = s.y - game.cam.y;
        const f = s.facing || 1;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(1, invTilt);

        ctx.strokeStyle = s.color || '#38bdf8';
        ctx.lineWidth = 4.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(f * 6, -15, 19, f > 0 ? -1.05 : Math.PI - 0.85, f > 0 ? 0.85 : Math.PI + 1.05);
        ctx.stroke();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(f * 6, -15, 18.5, f > 0 ? -0.85 : Math.PI - 0.65, f > 0 ? 0.65 : Math.PI + 0.85);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
}

/* ============================================================================
 * 4. EARTH SURFACE BIOME & 24% MOUNTAIN RENDERER (71% Ocean / 29% Land)
 * ========================================================================== */

export class EarthBiomeRenderer {
  constructor() {
    this.peakCache = new Map();
  }

  getMountainPeakCanvas(biomeType = 'grassland') {
    if (this.peakCache.has(biomeType)) return this.peakCache.get(biomeType);

    const w = 140;
    const h = 110;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    const cx = w * 0.5;
    const baseY = h - 14;

    ctx.fillStyle = 'rgba(10, 14, 20, 0.26)';
    ctx.beginPath();
    ctx.ellipse(cx + 12, baseY + 2, 54, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    const palettes = {
      iceTundra: { left: '#cbd5e1', right: '#64748b', cap: '#f8fafc', ridge: '#e2e8f0' },
      desert: { left: '#d6a868', right: '#8c5e2a', cap: '#e7cba0', ridge: '#b47d3c' },
      forest: { left: '#57534e', right: '#292524', cap: '#cbd5e1', ridge: '#78716c' },
      agriUrban: { left: '#78716c', right: '#44403c', cap: '#e2e8f0', ridge: '#a8a29e' },
      grassland: { left: '#64748b', right: '#334155', cap: '#f1f5f9', ridge: '#94a3b8' },
    };
    const pal = palettes[biomeType] || palettes.grassland;

    ctx.fillStyle = pal.left;
    ctx.beginPath();
    ctx.moveTo(cx, 14);
    ctx.lineTo(cx - 54, baseY);
    ctx.lineTo(cx - 4, baseY + 6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = pal.right;
    ctx.beginPath();
    ctx.moveTo(cx, 14);
    ctx.lineTo(cx - 4, baseY + 6);
    ctx.lineTo(cx + 56, baseY - 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = pal.cap;
    ctx.beginPath();
    ctx.moveTo(cx, 14);
    ctx.lineTo(cx - 21, 46);
    ctx.lineTo(cx - 8, 42);
    ctx.lineTo(cx - 2, 49);
    ctx.lineTo(cx + 9, 43);
    ctx.lineTo(cx + 22, 46);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = pal.left;
    ctx.beginPath();
    ctx.moveTo(cx + 28, 38);
    ctx.lineTo(cx + 4, baseY + 4);
    ctx.lineTo(cx + 26, baseY + 6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = pal.right;
    ctx.beginPath();
    ctx.moveTo(cx + 28, 38);
    ctx.lineTo(cx + 26, baseY + 6);
    ctx.lineTo(cx + 62, baseY);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = pal.ridge;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx, 14);
    ctx.lineTo(cx - 4, 52);
    ctx.lineTo(cx - 4, baseY + 6);
    ctx.stroke();

    this.peakCache.set(biomeType, c);
    return c;
  }

  drawEarthBiomesInViewport(ctx, cam, canvasWidth, canvasHeight, invTilt = 1, timeSec = 0) {
    if (typeof getEarthTerrainAt !== 'function') return;

    const viewHalfW = (canvasWidth * 0.65) / cam.zoom;
    const viewHalfH = (canvasHeight * 0.65) / (cam.zoom * (cam.tiltScale || 1));
    const tCell = cam.zoom < 0.22 ? 1200 : cam.zoom < 0.65 ? 520 : 260;

    const minCol = Math.floor((cam.x - viewHalfW - tCell) / tCell);
    const maxCol = Math.ceil((cam.x + viewHalfW + tCell) / tCell);
    const minRow = Math.floor(Math.max(1714, cam.y - viewHalfH - tCell) / tCell);
    const maxRow = Math.ceil(Math.min(WORLD_H - 120, cam.y + viewHalfH + tCell) / tCell);

    ctx.save();

    for (let tr = minRow; tr <= maxRow; tr++) {
      const wy = tr * tCell + tCell * 0.5;
      if (Math.abs(wy - RIVER_Y) < 115) continue;
      const ty = tr * tCell - cam.y;

      for (let tc = minCol; tc <= maxCol; tc++) {
        const wx = wrapX(tc * tCell + tCell * 0.5, WORLD_W);
        const terr = getEarthTerrainAt(wx, wy);
        if (!terr) continue;

        const tx = wrapDX(cam.x, tc * tCell);
        const cx = tx + tCell * 0.5;
        const cy = ty + tCell * 0.5;
        const h = hash2D(tc, tr);

        if (terr.isOcean) {
          const radius = tCell * 0.78;
          const oceanGrad = ctx.createRadialGradient(cx, cy, radius * 0.15, cx, cy, radius);
          if (terr.label === 'Coastal Sea') {
            oceanGrad.addColorStop(0, 'rgba(3, 105, 161, 0.88)');
            oceanGrad.addColorStop(0.7, 'rgba(2, 132, 199, 0.68)');
            oceanGrad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
          } else {
            oceanGrad.addColorStop(0, 'rgba(12, 74, 110, 0.94)');
            oceanGrad.addColorStop(0.75, 'rgba(3, 105, 161, 0.75)');
            oceanGrad.addColorStop(1, 'rgba(3, 105, 161, 0.0)');
          }
          ctx.fillStyle = oceanGrad;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fill();

          if (cam.zoom >= 0.25 && h > 0.35) {
            const waveOffset = Math.sin(timeSec * 2.0 + tc * 0.7 + tr * 0.5) * 6;
            ctx.strokeStyle =
              terr.label === 'Coastal Sea'
                ? 'rgba(186, 230, 253, 0.42)'
                : 'rgba(125, 211, 252, 0.25)';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(cx - 24 + waveOffset, cy);
            ctx.quadraticCurveTo(cx + waveOffset, cy - 5, cx + 24 + waveOffset, cy);
            ctx.stroke();
          }
          continue;
        }

        const radius = tCell * 0.82;
        const biomePalette = {
          forest: ['rgba(20, 62, 32, 0.58)', 'rgba(30, 86, 49, 0.28)', 'rgba(30, 86, 49, 0.0)'],
          grassland: ['rgba(107, 142, 35, 0.45)', 'rgba(132, 169, 66, 0.20)', 'rgba(132, 169, 66, 0.0)'],
          desert: ['rgba(212, 163, 106, 0.72)', 'rgba(194, 162, 107, 0.38)', 'rgba(194, 162, 107, 0.0)'],
          agriUrban: ['rgba(132, 169, 66, 0.38)', 'rgba(180, 148, 72, 0.18)', 'rgba(180, 148, 72, 0.0)'],
          iceTundra: ['rgba(226, 232, 240, 0.82)', 'rgba(203, 213, 225, 0.45)', 'rgba(203, 213, 225, 0.0)'],
        };
        const stops = biomePalette[terr.type] || biomePalette.grassland;
        const landGrad = ctx.createRadialGradient(cx, cy, radius * 0.12, cx, cy, radius);
        landGrad.addColorStop(0, stops[0]);
        landGrad.addColorStop(0.65, stops[1]);
        landGrad.addColorStop(1, stops[2]);

        ctx.fillStyle = landGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        if (cam.zoom >= 0.32) {
          if (terr.type === 'agriUrban' && h > 0.35) {
            ctx.strokeStyle = 'rgba(217, 169, 56, 0.26)';
            ctx.lineWidth = 1.4;
            for (let f = -18; f <= 18; f += 9) {
              ctx.beginPath();
              ctx.moveTo(cx - 24, cy + f);
              ctx.lineTo(cx + 24, cy + f - 6);
              ctx.stroke();
            }
          } else if (terr.type === 'desert' && h > 0.3) {
            ctx.strokeStyle = 'rgba(161, 98, 7, 0.32)';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(cx, cy + 8, 22, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
          } else if (terr.type === 'forest' && h > 0.3) {
            ctx.fillStyle = 'rgba(22, 101, 52, 0.32)';
            ctx.beginPath();
            ctx.ellipse(cx - 12, cy + 4, 16, 8, 0, 0, Math.PI * 2);
            ctx.ellipse(cx + 14, cy - 6, 14, 7, 0, 0, Math.PI * 2);
            ctx.fill();
          } else if (terr.type === 'iceTundra' && h > 0.35) {
            ctx.strokeStyle = 'rgba(248, 250, 252, 0.55)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(cx - 18, cy - 4);
            ctx.lineTo(cx + 18, cy + 6);
            ctx.stroke();
          }
        }

        if (terr.isMountain && cam.zoom >= 0.2) {
          const peakCanvas = this.getMountainPeakCanvas(terr.type);
          const scale = tCell / 260;
          const pw = peakCanvas.width * scale;
          const ph = peakCanvas.height * scale * invTilt;
          ctx.drawImage(peakCanvas, cx - pw * 0.5, cy - ph * 0.72, pw, ph);
        }
      }
    }

    ctx.restore();
  }

  drawGlobeEarthBreakdownHUD(ctx, canvasWidth, canvasHeight) {
    const cardW = 310;
    const cardH = 212;
    const x = 18;
    const y = Math.max(84, canvasHeight - cardH - 86);

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, cardH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('🌍 EARTH SURFACE BREAKDOWN (71% WATER / 29% LAND)', x + 12, y + 20);

    const barX = x + 12;
    const barY = y + 28;
    const barW = cardW - 24;
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(barX, barY, Math.round(barW * 0.71), 10);
    ctx.fillStyle = '#4d7c0f';
    ctx.fillRect(barX + Math.round(barW * 0.71), barY, Math.round(barW * 0.29), 10);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 9.5px Inter, sans-serif';
    ctx.fillText('🌊 Oceans & Seas: 71%', barX + 4, barY + 21);
    ctx.fillText('⛰️ Land: 29% (24% Mountains)', barX + 148, barY + 21);

    const rows = [
      { icon: '🌲', name: 'Forests & Woodlands', land: '31%', earth: '9.0%', color: '#2e7d32' },
      { icon: '🌾', name: 'Grasslands & Savannas', land: '26%', earth: '7.5%', color: '#84cc16' },
      { icon: '🏜️', name: 'Deserts & Barren Land', land: '19%', earth: '5.5%', color: '#d97706' },
      { icon: '🏠', name: 'Agricultural & Urban', land: '14%', earth: '4.1%', color: '#eab308' },
      { icon: '❄️', name: 'Ice, Glaciers & Tundra', land: '10%', earth: '2.9%', color: '#cbd5e1' },
    ];

    let ry = barY + 38;
    for (const r of rows) {
      ctx.fillStyle = r.color;
      ctx.fillRect(barX, ry - 7, 8, 8);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '500 10px Inter, sans-serif';
      ctx.fillText(`${r.icon} ${r.name}`, barX + 13, ry);
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'right';
      ctx.fillText(`${r.land} land (${r.earth} Earth)`, x + cardW - 12, ry);
      ctx.textAlign = 'left';
      ry += 22;
    }

    ctx.restore();
  }
}

/* ============================================================================
 * 5. ENVIRONMENT SPRITE BANK (Buildings, Trees, Bridges, Siege, War Galleys)
 * ========================================================================== */

const BUILDING_SPECS = {
  town_hall: { halfW: 44, halfH: 22, wallH: 36, roofH: 22, chimney: true, banner: true, isStone: true },
  citadel: { halfW: 44, halfH: 22, wallH: 36, roofH: 22, chimney: true, banner: true, isStone: true },
  house: { halfW: 26, halfH: 13, wallH: 20, roofH: 17, chimney: true, banner: false, isStone: false },
  hut: { halfW: 26, halfH: 13, wallH: 20, roofH: 17, chimney: false, banner: false, isStone: false },
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
  town_center: { halfW: 44, halfH: 22, wallH: 36, roofH: 22, chimney: true, banner: true, isStone: true },
  quarry: { halfW: 32, halfH: 16, wallH: 21, roofH: 14, chimney: true, banner: false, isStone: true },
  kitchen: { halfW: 28, halfH: 14, wallH: 20, roofH: 16, chimney: true, banner: false, isStone: false },
  shrine: { halfW: 30, halfH: 15, wallH: 28, roofH: 22, chimney: false, banner: true, isStone: true },
  wonder: { halfW: 46, halfH: 23, wallH: 40, roofH: 26, chimney: false, banner: true, isStone: true },
  stables: { halfW: 36, halfH: 18, wallH: 22, roofH: 16, chimney: false, banner: true, isStone: false },
  market: { halfW: 34, halfH: 17, wallH: 20, roofH: 16, chimney: false, banner: true, isStone: false },
  shipyard: { halfW: 36, halfH: 18, wallH: 20, roofH: 15, chimney: false, banner: true, isStone: false },
  gatehouse: { halfW: 34, halfH: 17, wallH: 28, roofH: 14, chimney: false, banner: true, isStone: true },
  wall: { halfW: 22, halfH: 11, wallH: 24, roofH: 4, chimney: false, banner: false, isStone: true },
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
  traceIsoDiamond(ctx, cx + (stage === 0 ? 2 : 9), baseY + (stage === 0 ? 1 : 4), halfW * shadowScale, halfH * shadowScale);
  ctx.fill();
  ctx.restore();

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
      [cx - halfW + 2, baseY + 1],
      [cx, baseY + halfH + 2],
      [cx + halfW + 2, baseY + 1],
      [cx, baseY - halfH - 1],
    ];
    for (const [px, py] of poles) {
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, py - wallH - 4);
      ctx.stroke();
    }
    return;
  }

  const wallColors = isStone
    ? { left: '#a4a098', right: '#7d7a73', top: '#bebbb3' }
    : { left: '#ab8b62', right: '#826543', top: '#c2a176' };

  drawIsoBox(ctx, cx, baseY, halfW, halfH, wallH, wallColors);

  if (spec.banner && factionColor) {
    ctx.save();
    ctx.fillStyle = factionColor;
    ctx.beginPath();
    ctx.moveTo(cx - halfW * 0.65, baseY - wallH * 0.55);
    ctx.lineTo(cx, baseY + halfH * 0.35 - wallH * 0.55);
    ctx.lineTo(cx, baseY + halfH * 0.35 - wallH * 0.32);
    ctx.lineTo(cx - halfW * 0.65, baseY - wallH * 0.32);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = '#3a2514';
  const doorW = 8;
  const doorH = 14;
  ctx.beginPath();
  ctx.moveTo(cx - halfW * 0.4, baseY - halfH * 0.2);
  ctx.lineTo(cx - halfW * 0.4 + doorW, baseY - halfH * 0.2 + doorW * 0.5);
  ctx.lineTo(cx - halfW * 0.4 + doorW, baseY - halfH * 0.2 + doorW * 0.5 - doorH);
  ctx.lineTo(cx - halfW * 0.4, baseY - halfH * 0.2 - doorH);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const wallTopY = baseY - wallH;
  const roofColors = isStone
    ? { left: '#4a5b6e', right: '#334252', top: '#63778d' }
    : { left: '#9e3b2b', right: '#78281c', top: '#ba4836' };

  drawIsoRoof(ctx, cx, wallTopY, halfW, halfH, roofH, roofColors);

  if (spec.chimney) {
    const chX = cx + halfW * 0.35;
    const chY = wallTopY - roofH * 0.4;
    drawIsoBox(ctx, chX, chY, 5, 3, 11, {
      left: '#615d58',
      right: '#474440',
      top: '#78746e',
    });
  }

  if (type === 'town_hall' || type === 'citadel' || type === 'town_center' || type === 'wonder') {
    const topBaseY = wallTopY - roofH + 4;
    drawIsoBox(ctx, cx, topBaseY, halfW * 0.45, halfH * 0.45, 16, {
      left: '#b0ab9f',
      right: '#858075',
      top: '#c7c2b5',
    });
    drawIsoRoof(ctx, cx, topBaseY - 16, halfW * 0.45, halfH * 0.45, 12, {
      left: '#ba4836',
      right: '#802b1d',
      top: '#d45642',
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

  drawIsometricBridge(ctx, bx, rY, invTilt = 1, timeSec = 0) {
    ctx.save();
    ctx.translate(bx, rY);

    const halfW = 44;
    const halfH = 64;

    ctx.fillStyle = 'rgba(8, 15, 26, 0.38)';
    ctx.fillRect(-halfW - 6, -halfH + 4, (halfW + 6) * 2, halfH * 2);

    const pierYs = [-halfH + 8, -18, 18, halfH - 12];
    for (const py of pierYs) {
      const ripple = Math.sin(timeSec * 2.6 + py * 0.1) * 2;
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(-halfW - 2, py + 4, 8 + ripple, 4, 0, 0, Math.PI * 2);
      ctx.ellipse(halfW + 2, py + 4, 8 + ripple, 4, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.fillRect(-halfW - 6, py - 4, 8, 10);
      ctx.strokeRect(-halfW - 6, py - 4, 8, 10);
      ctx.fillRect(halfW - 2, py - 4, 8, 10);
      ctx.strokeRect(halfW - 2, py - 4, 8, 10);
    }

    const rampGradN = ctx.createLinearGradient(0, -halfH - 10, 0, -halfH + 14);
    rampGradN.addColorStop(0, '#78716c');
    rampGradN.addColorStop(1, '#57534e');
    ctx.fillStyle = rampGradN;
    ctx.beginPath();
    ctx.moveTo(-halfW + 4, -halfH - 8);
    ctx.lineTo(halfW - 4, -halfH - 8);
    ctx.lineTo(halfW, -halfH + 12);
    ctx.lineTo(-halfW, -halfH + 12);
    ctx.closePath();
    ctx.fill();

    const rampGradS = ctx.createLinearGradient(0, halfH - 12, 0, halfH + 10);
    rampGradS.addColorStop(0, '#57534e');
    rampGradS.addColorStop(1, '#78716c');
    ctx.fillStyle = rampGradS;
    ctx.beginPath();
    ctx.moveTo(-halfW, halfH - 12);
    ctx.lineTo(halfW, halfH - 12);
    ctx.lineTo(halfW - 4, halfH + 8);
    ctx.lineTo(-halfW + 4, halfH + 8);
    ctx.closePath();
    ctx.fill();

    const deckGrad = ctx.createLinearGradient(-halfW, 0, halfW, 0);
    deckGrad.addColorStop(0, '#854d0e');
    deckGrad.addColorStop(0.5, '#a16207');
    deckGrad.addColorStop(1, '#713f12');
    ctx.fillStyle = deckGrad;
    ctx.strokeStyle = '#422006';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-halfW, -halfH + 8, halfW * 2, (halfH - 8) * 2);
    ctx.strokeRect(-halfW, -halfH + 8, halfW * 2, (halfH - 8) * 2);

    ctx.strokeStyle = 'rgba(42, 20, 5, 0.55)';
    ctx.lineWidth = 1;
    for (let py = -halfH + 13; py <= halfH - 10; py += 6) {
      ctx.beginPath();
      ctx.moveTo(-halfW + 2, py);
      ctx.lineTo(halfW - 2, py);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(120, 113, 108, 0.28)';
    ctx.fillRect(-16, -halfH + 8, 32, (halfH - 8) * 2);

    const postHeight = 10 * invTilt;
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 2.4;

    ctx.beginPath();
    ctx.moveTo(-halfW + 2, -halfH + 8 - postHeight);
    ctx.lineTo(-halfW + 2, halfH - 8 - postHeight);
    ctx.moveTo(halfW - 2, -halfH + 8 - postHeight);
    ctx.lineTo(halfW - 2, halfH - 8 - postHeight);
    ctx.stroke();

    for (let py = -halfH + 10; py <= halfH - 10; py += 22) {
      ctx.fillStyle = '#5c2d0c';
      ctx.fillRect(-halfW, py - postHeight, 4, postHeight + 2);
      ctx.fillRect(halfW - 4, py - postHeight, 4, postHeight + 2);

      if (Math.abs(py) > 35) {
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(-halfW + 2, py - postHeight - 2, 2.5, 0, Math.PI * 2);
        ctx.arc(halfW - 2, py - postHeight - 2, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  drawIsometricWarGalley(ctx, g, gx, gy, invTilt = 1, timeSec = 0, showBadges = true) {
    ctx.save();
    ctx.translate(gx, gy);
    ctx.scale(1, invTilt);

    const dir = (g.vx || 0) < 0 ? -1 : 1;
    const speed = Math.abs(g.vx || 30);
    const phase = timeSec * 4.5 + (g.id || 0) * 1.3;
    const bob = Math.sin(phase * 0.7) * 1.6;

    ctx.save();
    for (let i = 0; i < 4; i++) {
      const wakeT = (timeSec * 1.4 + i * 0.25) % 1;
      const wx = -dir * (26 + wakeT * 36);
      const spread = 6 + wakeT * 12;
      const alpha = (1 - wakeT) * 0.42;
      ctx.strokeStyle = `rgba(186, 230, 253, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(wx, 6, 8 + wakeT * 10, spread * 0.45, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(224, 242, 254, 0.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(dir * 34, 5 + bob * 0.4, 7, dir > 0 ? -0.8 : Math.PI - 0.8, dir > 0 ? 0.8 : Math.PI + 0.8);
    ctx.stroke();
    ctx.restore();

    ctx.translate(0, bob);

    ctx.fillStyle = 'rgba(7, 16, 30, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 8, 38, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    const oarCount = 5;
    const oarSwing = Math.sin(phase * (speed > 2 ? 1.4 : 0.4)) * 6 * dir;
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < oarCount; i++) {
      const ox = -18 + i * 9;
      ctx.beginPath();
      ctx.moveTo(ox, -2);
      ctx.lineTo(ox - oarSwing, -9);
      ctx.stroke();
    }

    const hullGrad = ctx.createLinearGradient(0, -10, 0, 12);
    hullGrad.addColorStop(0, '#92400e');
    hullGrad.addColorStop(0.55, '#78350f');
    hullGrad.addColorStop(1, '#451a03');

    ctx.fillStyle = hullGrad;
    ctx.strokeStyle = '#271203';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-36 * dir, -6);
    ctx.lineTo(-28 * dir, -2);
    ctx.lineTo(28 * dir, -2);
    ctx.lineTo(38 * dir, -7);
    ctx.lineTo(29 * dir, 9);
    ctx.lineTo(-29 * dir, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-34 * dir, -4);
    ctx.lineTo(35 * dir, -5);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(40, 18, 4, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-30 * dir, 3);
    ctx.lineTo(31 * dir, 3);
    ctx.stroke();

    for (let i = 0; i < 6; i++) {
      const sx = -20 + i * 8;
      ctx.fillStyle = i % 2 === 0 ? '#b91c1c' : '#d97706';
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sx, -1, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    for (let i = 0; i < oarCount; i++) {
      const ox = -18 + i * 9;
      const bladeX = ox + oarSwing;
      const bladeY = 13 + Math.cos(phase) * 1.8;

      ctx.strokeStyle = '#a16207';
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      ctx.moveTo(ox, 1);
      ctx.lineTo(bladeX, bladeY);
      ctx.stroke();

      ctx.fillStyle = 'rgba(224, 242, 254, 0.7)';
      ctx.beginPath();
      ctx.ellipse(bladeX, bladeY + 1, 3.2, 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const prowX = 38 * dir;
    ctx.fillStyle = '#d97706';
    ctx.beginPath();
    ctx.moveTo(29 * dir, 5);
    ctx.lineTo(43 * dir, 7);
    ctx.lineTo(29 * dir, 9);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#b45309';
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(33 * dir, -5);
    ctx.quadraticCurveTo(39 * dir, -16, 44 * dir, -14);
    ctx.lineTo(41 * dir, -9);
    ctx.lineTo(36 * dir, -2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(40 * dir, -13, 1.3, 0, Math.PI * 2);
    ctx.fill();

    const fireCycle = (timeSec * 0.9 + (g.id || 0) * 0.37) % 1;
    if ((g.shootTimer && g.shootTimer > 0) || fireCycle < 0.28) {
      for (let f = 0; f < 4; f++) {
        const fx = prowX + dir * (6 + f * 4.5 + fireCycle * 8);
        const fy = -12 + Math.sin(timeSec * 18 + f) * 2.5;
        ctx.fillStyle = f % 2 === 0 ? 'rgba(249, 115, 22, 0.85)' : 'rgba(253, 224, 71, 0.85)';
        ctx.beginPath();
        ctx.arc(fx, fy, 4.2 - f * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.lineTo(0, -44);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(214, 211, 209, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-28 * dir, -3);
    ctx.lineTo(0, -40);
    ctx.lineTo(28 * dir, -4);
    ctx.stroke();

    const billow = (7 + Math.sin(phase * 0.8) * 2.2) * dir;
    const sailGrad = ctx.createLinearGradient(-16, -38, 16, -12);
    sailGrad.addColorStop(0, '#dc2626');
    sailGrad.addColorStop(0.5, '#991b1b');
    sailGrad.addColorStop(1, '#7f1d1d');

    ctx.fillStyle = sailGrad;
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-16, -38);
    ctx.quadraticCurveTo(0, -39, 16, -38);
    ctx.quadraticCurveTo(16 + billow, -24, 15, -11);
    ctx.quadraticCurveTo(0, -10, -15, -11);
    ctx.quadraticCurveTo(-16 + billow * 0.75, -24, -16, -38);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(billow * 0.45, -24, 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#991b1b';
    ctx.beginPath();
    ctx.arc(billow * 0.45 + 1.5 * dir, -25, 3.2, 0, Math.PI * 2);
    ctx.fill();

    const wave = Math.sin(timeSec * 6 + (g.id || 0)) * 2.5;
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(0, -44);
    ctx.quadraticCurveTo(8 * dir, -43 + wave, 16 * dir, -41 - wave * 0.5);
    ctx.lineTo(0, -39);
    ctx.closePath();
    ctx.fill();

    if (showBadges) {
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 8.5px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(g.name || '🐉 WAR GALLEY', 0, -49);
    }

    ctx.restore();
  }

  drawGameSiegeEngine(ctx, s, sx, sy, invTilt = 1, timeSec = 0, showBadges = true) {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1, invTilt);

    const name = (s.name || s.type || '').toLowerCase();
    const isRam = name.includes('ram') || name.includes('mammoth') || s.type === 'battering_ram';
    const facing = (s.vx || 0) < -0.05 ? -1 : 1;

    ctx.fillStyle = 'rgba(10, 14, 18, 0.36)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 28, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    const drawWheel = (wx, wy, r = 7.5) => {
      const spin = ((s.x || 0) + (s.y || 0)) * 0.08;
      ctx.save();
      ctx.translate(wx, wy);
      ctx.fillStyle = '#451a03';
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, r + 0.6, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#92400e';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 4; i++) {
        const a = spin + (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * -r, Math.sin(a) * -r);
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.stroke();
      }
      ctx.restore();
    };

    if (isRam) {
      drawWheel(-15, -4, 7);
      drawWheel(15, -4, 7);

      drawIsoBox(ctx, 0, -2, 24, 11, 6, {
        left: '#78350f',
        right: '#451a03',
        top: '#92400e',
      });

      const swing = Math.sin(timeSec * 5 + (s.id || 0)) * 3.5 * facing;
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-10, -24);
      ctx.lineTo(-8 + swing, -12);
      ctx.moveTo(10, -24);
      ctx.lineTo(8 + swing, -12);
      ctx.stroke();

      ctx.fillStyle = '#5c2d0c';
      ctx.strokeStyle = '#271203';
      ctx.lineWidth = 1.2;
      ctx.fillRect(-18 + swing, -15, 36, 6);
      ctx.strokeRect(-18 + swing, -15, 36, 6);

      drawIsoRoof(ctx, 0, -18, 22, 10, 12, {
        left: '#a16207',
        right: '#713f12',
        outline: '#422006',
      });

      const skullX = (19 + swing) * facing;
      ctx.fillStyle = '#e7e5e4';
      ctx.strokeStyle = '#57534e';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(skullX, -12, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#fef3c7';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(skullX, -10);
      ctx.quadraticCurveTo(skullX + 9 * facing, -8, skullX + 12 * facing, -16);
      ctx.stroke();
    } else {
      drawWheel(-16, -3, 6.5);
      drawWheel(16, -3, 6.5);

      drawIsoBox(ctx, 0, -2, 24, 11, 5, {
        left: '#92400e',
        right: '#5c2d0c',
        top: '#b45309',
      });

      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-14, -6);
      ctx.lineTo(0, -34);
      ctx.lineTo(14, -6);
      ctx.stroke();

      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-9, -16);
      ctx.lineTo(9, -16);
      ctx.stroke();

      const cooldown = s.attackCooldown || 0;
      const armAngle =
        cooldown > 0.5
          ? -0.55 * facing
          : (-0.25 + Math.sin(timeSec * 2.2 + (s.id || 0)) * 0.18) * facing;

      ctx.save();
      ctx.translate(0, -32);
      ctx.rotate(armAngle);

      ctx.strokeStyle = '#a16207';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(-12 * facing, 0);
      ctx.lineTo(26 * facing, 0);
      ctx.stroke();

      ctx.fillStyle = '#475569';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-16 * facing, 0);
      ctx.lineTo(-8 * facing, 0);
      ctx.lineTo(-9 * facing, 11);
      ctx.lineTo(-15 * facing, 11);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#d6d3d1';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(26 * facing, 0);
      ctx.lineTo(29 * facing, 10);
      ctx.stroke();

      ctx.fillStyle = '#78716c';
      ctx.beginPath();
      ctx.arc(29 * facing, 11, 3.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(0, -32, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (s.hp < s.maxHp) {
      const hpRatio = Math.max(0, Math.min(1, (s.hp || 1) / (s.maxHp || 1)));
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(-20, -48, 40, 4.5);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(-19, -47, Math.round(38 * hpRatio), 2.5);
    }

    if (showBadges && s.name) {
      ctx.fillStyle = '#fde68a';
      ctx.font = 'bold 8.5px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(s.name, 0, -52);
    }

    ctx.restore();
  }
}

/* ============================================================================
 * 6. CONSTANT-ALPHA OFFSCREEN FOOTPATH COMPOSITOR (Zero Overlapping Circles)
 * ========================================================================== */

export class PlanetaryFootpathOverlay {
  constructor({ cellSize = 28 } = {}) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  getWearAt(x, y) {
    const col = Math.floor(wrapX(x, WORLD_W) / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    return this.cells.get(`${col}:${row}`) || 0;
  }

  updateTraffic(villagers, dt = 1 / 60) {
    if (!villagers) return;
    const gain = 0.045 * dt * 10;
    for (let i = 0; i < villagers.length; i++) {
      const u = villagers[i];
      if (Math.hypot(u.vx || 0, u.vy || 0) < 2) continue;
      const col = Math.floor(wrapX(u.x, WORLD_W) / this.cellSize);
      const row = Math.floor(u.y / this.cellSize);
      const key = `${col}:${row}`;
      const prev = this.cells.get(key) || 0;
      if (prev < 1) {
        this.cells.set(key, Math.min(1, prev + gain));
      }
    }
  }

  stampBuilding(x, y, radius = 44) {
    if (typeof y !== 'number') return;
    const c0 = Math.floor(wrapX(x, WORLD_W) / this.cellSize);
    const r0 = Math.floor(y / this.cellSize);
    const rad = Math.ceil(radius / this.cellSize);
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        const d = Math.hypot(dc, dr) / Math.max(1, rad);
        if (d <= 1) {
          const key = `${c0 + dc}:${r0 + dr}`;
          const val = 0.55 * (1 - d * 0.45);
          if (val > (this.cells.get(key) || 0)) {
            this.cells.set(key, val);
          }
        }
      }
    }
  }

  drawVisiblePaths(ctx, cam, canvasWidth, canvasHeight) {
    if (!ctx || !cam) return;
    const halfW = (canvasWidth * 0.65) / cam.zoom;
    const halfH = (canvasHeight * 0.65) / (cam.zoom * (cam.tiltScale || 1));
    const minCol = Math.floor((cam.x - halfW) / this.cellSize);
    const maxCol = Math.ceil((cam.x + halfW) / this.cellSize);
    const minRow = Math.floor((cam.y - halfH) / this.cellSize);
    const maxRow = Math.ceil((cam.y + halfH) / this.cellSize);
    const totalCols = Math.ceil(WORLD_W / this.cellSize);

    const dirtPath = new Path2D();
    const cobblePath = new Path2D();
    let hasDirt = false;
    let hasCobble = false;

    const neighbors = [
      [1, 0],
      [0, 1],
      [1, 1],
      [-1, 1],
    ];

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const wrappedC = ((c % totalCols) + totalCols) % totalCols;
        const wear = this.cells.get(`${wrappedC}:${r}`);
        if (!wear || wear < 0.14) continue;

        const wx = (c + 0.5) * this.cellSize - cam.x;
        const wy = (r + 0.5) * this.cellSize - cam.y;

        for (const [dc, dr] of neighbors) {
          const nc = (((c + dc) % totalCols) + totalCols) % totalCols;
          const nw = this.cells.get(`${nc}:${r + dr}`);
          if (nw && nw >= 0.14) {
            const nx = wx + dc * this.cellSize;
            const ny = wy + dr * this.cellSize;
            dirtPath.moveTo(wx, wy);
            dirtPath.lineTo(nx, ny);
            hasDirt = true;

            if (wear >= 0.68 && nw >= 0.68) {
              cobblePath.moveTo(wx, wy);
              cobblePath.lineTo(nx, ny);
              hasCobble = true;
            }
          }
        }
      }
    }

    if (!hasDirt && !hasCobble) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (hasDirt) {
      ctx.strokeStyle = 'rgba(139, 108, 74, 0.34)';
      ctx.lineWidth = this.cellSize * 0.95;
      ctx.stroke(dirtPath);
    }

    if (hasCobble) {
      ctx.strokeStyle = 'rgba(168, 162, 158, 0.36)';
      ctx.lineWidth = this.cellSize * 0.55;
      ctx.stroke(cobblePath);
    }

    ctx.restore();
  }
}

/* ============================================================================
 * 7. ONE-LINE INSTALLER FOR PrehistoricPlanetaryGame
 * ========================================================================== */

export function installIsometricGraphicsUpgrade(targetClassOrInstance) {
  const proto =
    typeof targetClassOrInstance === 'function'
      ? targetClassOrInstance.prototype
      : Object.getPrototypeOf(targetClassOrInstance);

  const villagerBank = new VillagerSpriteBank();
  const envBank = new EnvironmentSpriteBank();
  const biomeRenderer = new EarthBiomeRenderer();
  const footpaths = new PlanetaryFootpathOverlay({ cellSize: 28 });
  const combatVFX = new CombatAndPowersVFXRenderer();
  const physicsEngine = new SovereignPhysicsEngine();

  // 1. Hook into update(dt) to step 2.5D rigid-body, Z-gravity & environmental physics + footsteps
  const origUpdate = proto.update;
  if (typeof origUpdate === 'function') {
    proto.update = function (dt) {
      origUpdate.call(this, dt);
      footpaths.updateTraffic(this.villagers, dt);
      physicsEngine.stepWorldPhysics(this, dt, footpaths);
    };
  }

  // 1b. Hook into resolveUnitPhysics for mass-weighted unit separation & smooth building sliding
  const origResolvePhysics = proto.resolveUnitPhysics;
  if (typeof origResolvePhysics === 'function') {
    proto.resolveUnitPhysics = function (u, dt, isEnemy) {
      origResolvePhysics.call(this, u, dt, isEnemy);
      physicsEngine.resolveMassCollisions(this, u, dt);
    };
  }

  // 1c. Hook into applyKnockback to add mass scaling, vertical 3D launch (`u.vz`), and camera shake
  const origApplyKnockback = proto.applyKnockback;
  if (typeof origApplyKnockback === 'function') {
    proto.applyKnockback = function (target, fromX, fromY, force = 160) {
      const mass = physicsEngine.getUnitMass(target);
      const scaledForce = force / Math.pow(mass, 0.65);
      origApplyKnockback.call(this, target, fromX, fromY, scaledForce);

      if (target && !target.invincible) {
        // Launch knocked-back units into a 3D vertical arc proportional to impact force
        const lift = Math.min(280, Math.max(65, scaledForce * 0.72));
        target.vz = Math.max(target.vz || 0, lift);
        if (force >= 220) {
          physicsEngine.addCameraShake(Math.min(10, force / 45));
        }
      }
    };
  }

  // 2. Hook into renderContinentsAndRiver to render smooth Earth biomes, footpaths, 2.5D bridges & War Galleys
  const origRenderTerrain = proto.renderContinentsAndRiver;
  if (typeof origRenderTerrain === 'function') {
    proto.renderContinentsAndRiver = function (ctx, invTilt) {
      if (physicsEngine.camShakeIntensity > 0.1) {
        ctx.translate(physicsEngine.camShakeX, physicsEngine.camShakeY);
      }

      const savedGalleys = this.warGalleys;
      const savedBridges = this.stoneBridges;
      const origFillRect = ctx.fillRect;

      this.warGalleys = [];
      this.stoneBridges = [];
      ctx.fillRect = function (x, y, w, h) {
        if ((w === 241 && h === 241) || (w === 521 && h === 521) || (w === 1201 && h === 1201)) {
          return;
        }
        return origFillRect.call(this, x, y, w, h);
      };

      try {
        origRenderTerrain.call(this, ctx, invTilt);
      } finally {
        ctx.fillRect = origFillRect;
        this.warGalleys = savedGalleys;
        this.stoneBridges = savedBridges;
      }

      const timeSec = this.time || 0;

      biomeRenderer.drawEarthBiomesInViewport(
        ctx,
        this.cam,
        this.canvas.width,
        this.canvas.height,
        invTilt,
        timeSec
      );

      footpaths.drawVisiblePaths(ctx, this.cam, this.canvas.width, this.canvas.height);

      const viewHalfW = (this.canvas.width * 0.65) / this.cam.zoom;
      const rY = RIVER_Y - this.cam.y;

      if (Array.isArray(this.warGalleys)) {
        for (const g of this.warGalleys) {
          const gx = wrapDX(this.cam.x, g.x);
          if (Math.abs(gx) <= viewHalfW + 120) {
            const gy = g.y - this.cam.y;
            const nearBridge =
              Array.isArray(this.stoneBridges) &&
              this.stoneBridges.some((br) => Math.abs(wrapDX(g.x, br.x)) < 58);

            envBank.drawIsometricWarGalley(
              ctx,
              g,
              gx,
              gy,
              invTilt,
              timeSec,
              this.showFloatingBadges !== false && !nearBridge
            );
          }
        }
      }

      if (Array.isArray(this.stoneBridges)) {
        for (const br of this.stoneBridges) {
          const bx = wrapDX(this.cam.x, br.x);
          if (Math.abs(bx) <= viewHalfW + 120) {
            envBank.drawIsometricBridge(ctx, bx, rY, invTilt, timeSec);
          }
        }
      }
    };
  }

  // 3. Hook into render3DPlanetaryGlobe to display the Earth 71% Ocean / 29% Land Breakdown HUD
  const origRenderGlobe = proto.render3DPlanetaryGlobe;
  if (typeof origRenderGlobe === 'function') {
    proto.render3DPlanetaryGlobe = function (ctx) {
      origRenderGlobe.call(this, ctx);
      biomeRenderer.drawGlobeEarthBreakdownHUD(ctx, this.canvas.width, this.canvas.height);
    };
  }

  // 4. Upgraded Villager, Hero t101s, Ring-Wraith & Bender Renderer
  const origDrawHuman = proto.drawArticulatedHuman;
  proto.drawArticulatedHuman = function (ctx, unit, dx, sy, invTilt, isEnemy) {
    if (unit.isBoss || unit.mountType || (this.cam && this.cam.zoom < 0.45)) {
      if (typeof origDrawHuman === 'function') {
        origDrawHuman.call(this, ctx, unit, dx, sy, invTilt, isEnemy);
      }
      return;
    }

    if (this.selectedIds && this.selectedIds.includes(unit.id)) {
      ctx.save();
      ctx.translate(dx, sy);
      ctx.scale(1, invTilt);
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 3, 15, 6.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

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

    if (unit.customTool || unit.customMagic) {
      ctx.save();
      ctx.translate(dx, sy);
      ctx.scale(1, invTilt);
      if (unit.customTool) {
        ctx.fillStyle = unit.customTool.color || '#fbbf24';
        ctx.beginPath();
        ctx.arc((unit.facing || 1) * 10, -14, 3.8, 0, Math.PI * 2);
        ctx.fill();
      }
      if (unit.customMagic) {
        ctx.strokeStyle = unit.customMagic.color || '#c084fc';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(0, -16, 17 + Math.sin((this.time || 0) * 4 + (unit.id || 0)) * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }
  };

  // 5. Hook into renderCombatAndArrowVFX for Black Holes, Meteors, Bloodbending, Time-Slow & Physics Landing Dust
  const origRenderCombatVFX = proto.renderCombatAndArrowVFX;
  if (typeof origRenderCombatVFX === 'function') {
    proto.renderCombatAndArrowVFX = function (ctx, invTilt) {
      physicsEngine.drawPhysicsVFX(ctx, this, invTilt);
      origRenderCombatVFX.call(this, ctx, invTilt);
      combatVFX.drawEnhancedCombatVFX(ctx, this, invTilt);
    };
  }

  // 6. Buildings
  proto.drawBuilding = function (ctx, building, dx, sy, invTilt) {
    if (!building._footprintStamped) {
      building._footprintStamped = true;
      footpaths.stampBuilding(building.x, building.y, building.radius || 44);
    }
    if (building.auraColor) {
      ctx.save();
      ctx.translate(dx, sy);
      ctx.scale(1, invTilt);
      ctx.globalAlpha = 0.28 + 0.1 * Math.sin((this.time || 0) * 3 + (building.id || 0));
      ctx.strokeStyle = building.auraColor;
      ctx.lineWidth = 2.5;
      const r = building.radius || 28;
      ctx.beginPath();
      ctx.ellipse(0, 4, r * 1.35, r * 0.58, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
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

  // 7. Trees & Ore Nodes
  proto.drawResourceNode = function (ctx, node, dx, sy, invTilt) {
    envBank.drawGameResourceNode(ctx, node, dx, sy, invTilt, this.time || 0);
  };

  // 8. Siege Engines
  proto.drawSiegeEngine = function (ctx, s, sx, sy, invTilt) {
    envBank.drawGameSiegeEngine(
      ctx,
      s,
      sx,
      sy,
      invTilt,
      this.time || 0,
      this.showFloatingBadges !== false
    );
  };
}