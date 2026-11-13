export const WORLD_W = 576000;
export const WORLD_H = 96000;
export const RIVER_Y = 2020;

export const CONTINENTS = [
    { id: 0, name: 'Cradle of Aethelgard', biome: 'temperate', xStart: 0,      xEnd: 96000,  color: '#2e4f27', grass: '#3b6e33', cliff: '#57534e' },
    { id: 1, name: 'Gondwana Savanna',     biome: 'savanna',   xStart: 96000,  xEnd: 192000, color: '#6b5322', grass: '#85682a', cliff: '#78552b' },
    { id: 2, name: 'Obsidian Ashlands',    biome: 'volcanic',  xStart: 192000, xEnd: 288000, color: '#272024', grass: '#3f2e36', cliff: '#451a1c' },
    { id: 3, name: 'Jade Lotus Highlands', biome: 'bamboo',    xStart: 288000, xEnd: 384000, color: '#1b4d3e', grass: '#226b54', cliff: '#334155' },
    { id: 4, name: 'Boreal Frost Tundra',  biome: 'tundra',    xStart: 384000, xEnd: 480000, color: '#334e68', grass: '#486581', cliff: '#64748b' },
    { id: 5, name: 'Sovereign Ring Lands', biome: 'imperial',  xStart: 480000, xEnd: 576000, color: '#3b1d2e', grass: '#592642', cliff: '#4c1d95' }
];

export const AGE_EPOCHS = [
    { level: 0, title: 'AGE I: STONE',    costGold: 0,   roofColor: '#92400e', wallColor: '#78716c', trimColor: '#d6d3d1' },
    { level: 1, title: 'AGE II: TOOL',    costGold: 120, roofColor: '#b45309', wallColor: '#a8a29e', trimColor: '#fde047' },
    { level: 2, title: 'AGE III: BRONZE', costGold: 240, roofColor: '#0f766e', wallColor: '#cbd5e1', trimColor: '#f59e0b' },
    { level: 3, title: 'AGE IV: IMPERIAL',costGold: 400, roofColor: '#7e22ce', wallColor: '#f8fafc', trimColor: '#facc15' }
];

export const FIGHTING_STYLES = {
    onering:    { name: 'One Ring Sovereign', icon: '💍', range: 240, speed: 158, color: '#f43f5e' },
    berserker:  { name: 'Twin-Fang Berserker',icon: '🗡️', range: 52,  speed: 118, color: '#fb7185' },
    phalanx:    { name: 'Phalanx Shield-Wall',icon: '🛡️', range: 58,  speed: 104, color: '#38bdf8' },
    kungfu:     { name: 'Crane & Mantis Kung-Fu', icon: '🥋', range: 64, speed: 132, color: '#4ade80' },
    archery:    { name: 'Sky-Volley Bowman',  icon: '🏹', range: 295, speed: 108, color: '#facc15' },
    juggernaut: { name: 'Mammoth-Maul Titan', icon: '🔨', range: 56,  speed: 96,  color: '#fb923c' }
};

export const BENDING_SPECS = {
    fire:   { name: 'Firebender',  icon: '🔥', color: '#f97316', subName: '⚡ Blue Lightning' },
    water:  { name: 'Waterbender', icon: '💧', color: '#38bdf8', subName: '❄️ Cryo-Prison' },
    earth:  { name: 'Earthbender', icon: '🪨', color: '#a3e635', subName: '🌋 Lavabending' },
    air:    { name: 'Airbender',   icon: '🌪️', color: '#e2e8f0', subName: '🔊 Sonic-Boom' },
    avatar: { name: 'Avatar Master',icon: '🌟', color: '#fde047', subName: '🌌 Cosmic Elements' }
};

export const ARMY_FORMATIONS = [
    { id: 'ring_guard', name: 'Ring Honor Guard', icon: '💍' },
    { id: 'testudo',    name: 'Testudo Tortoise', icon: '🐢' },
    { id: 'wedge',      name: 'Cavalry Wedge',    icon: '🔺' },
    { id: 'crescent',   name: 'Crescent Volley',  icon: '🌙' }
];

export const BUILDING_SPECS = {
    town_center: { name: 'Town Center',      icon: '🏛️', costWood: 120, costStone: 120, hp: 1800, radius: 52 },
    hut:         { name: 'Fur Hut / Villa',  icon: '🛖', costWood: 30,  costStone: 0,   hp: 460,  radius: 28 },
    sawmill:     { name: 'Timber Sawmill',   icon: '🪚', costWood: 45,  costStone: 15,  hp: 560,  radius: 34 },
    quarry:      { name: 'Megalith Quarry',  icon: '⛏️', costWood: 45,  costStone: 20,  hp: 620,  radius: 36 },
    kitchen:     { name: 'Sabre-Rib Kitchen',icon: '🍖', costWood: 50,  costStone: 20,  hp: 580,  radius: 34 },
    forge:       { name: 'Bronze Forge',     icon: '⚒️', costWood: 40,  costStone: 60,  hp: 720,  radius: 36 },
    barracks:    { name: 'War Citadel',      icon: '⚔️', costWood: 50,  costStone: 75,  hp: 960,  radius: 44 },
    shrine:      { name: 'Bender Shrine',    icon: '🌀', costWood: 45,  costStone: 80,  hp: 860,  radius: 40 },
    tower:       { name: 'Watchtower',       icon: '🏹', costWood: 35,  costStone: 55,  hp: 780,  radius: 28 },
    wall:        { name: 'Megalith Wall',    icon: '🧱', costWood: 0,   costStone: 25,  hp: 1100, radius: 22 },
    gatehouse:   { name: 'Portcullis Gate',  icon: '⛩️', costWood: 20,  costStone: 40,  hp: 1250, radius: 34 },
    shipyard:    { name: 'River Shipyard',   icon: '⚓', costWood: 70,  costStone: 30,  hp: 740,  radius: 38 },
    stables:     { name: 'Beast Stables',    icon: '🦣', costWood: 70,  costStone: 35,  hp: 780,  radius: 38 },
    market:      { name: 'Caravan Market',   icon: '⚖️', costWood: 65,  costStone: 30,  hp: 680,  radius: 38 },
    wonder:      { name: 'Sovereign Wonder', icon: '🌟', costWood: 120, costStone: 180, hp: 3200, radius: 62 }
};

export function wrapX(x) {
    return ((x % WORLD_W) + WORLD_W) % WORLD_W;
}
export function wrapDX(fromX, toX) {
    let dx = toX - fromX;
    if (dx > WORLD_W * 0.5) dx -= WORLD_W;
    if (dx < -WORLD_W * 0.5) dx += WORLD_W;
    return dx;
}
export function wrappedDist(x1, y1, x2, y2) {
    return Math.hypot(wrapDX(x1, x2), y2 - y1);
}

export function hash2D(x, y) {
    let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

export function solve2BoneIK(rootX, rootY, targetX, targetY, len1, len2, bendDir = 1) {
    const dx = targetX - rootX;
    const dy = targetY - rootY;
    const dist = Math.max(0.001, Math.min(len1 + len2 - 0.01, Math.hypot(dx, dy)));
    const baseAngle = Math.atan2(dy, dx);
    const cosAngle1 = Math.max(-1, Math.min(1, (len1 * len1 + dist * dist - len2 * len2) / (2 * len1 * dist)));
    const angle1 = baseAngle + bendDir * Math.acos(cosAngle1);
    const midX = rootX + Math.cos(angle1) * len1;
    const midY = rootY + Math.sin(angle1) * len1;
    const endAngle = Math.atan2(targetY - midY, targetX - midX);
    return {
        midX,
        midY,
        endX: midX + Math.cos(endAngle) * len2,
        endY: midY + Math.sin(endAngle) * len2
    };
}

export class SpatialGrid {
    constructor(cellSize = 260) {
        this.cellSize = cellSize;
        this.cells = new Map();
    }
    clear() {
        this.cells.clear();
    }
    insert(entity) {
        const cx = Math.floor(wrapX(entity.x) / this.cellSize);
        const cy = Math.floor(entity.y / this.cellSize);
        const k = `${cx},${cy}`;
        let bucket = this.cells.get(k);
        if (!bucket) {
            bucket = [];
            this.cells.set(k, bucket);
        }
        bucket.push(entity);
    }
    query(x, y, radius) {
        const rCells = Math.ceil(radius / this.cellSize);
        const cx0 = Math.floor(wrapX(x) / this.cellSize);
        const cy0 = Math.floor(y / this.cellSize);
        const maxCols = Math.ceil(WORLD_W / this.cellSize);
        const results = [];
        for (let dx = -rCells; dx <= rCells; dx++) {
            const cx = ((cx0 + dx) % maxCols + maxCols) % maxCols;
            for (let dy = -rCells; dy <= rCells; dy++) {
                const bucket = this.cells.get(`${cx},${cy0 + dy}`);
                if (bucket) {
                    for (let i = 0; i < bucket.length; i++) {
                        results.push(bucket[i]);
                    }
                }
            }
        }
        return results;
    }
}

export const EARTH_SURFACE_STATS = {
    oceansShare: 0.71,
    landShare: 0.29,
    landBreakdown: {
        forest:    { label: 'Forests & Woodlands',    landShare: 0.31, earthShare: 0.090, color: '#1e5631', accent: '#2e7d32', icon: '🌲' },
        grassland: { label: 'Grasslands & Savannas',  landShare: 0.26, earthShare: 0.075, color: '#6b8e23', accent: '#9acd32', icon: '🌾' },
        desert:    { label: 'Deserts & Barren Land',  landShare: 0.19, earthShare: 0.055, color: '#c2a26b', accent: '#d9b982', icon: '🏜️' },
        agriUrban: { label: 'Agricultural & Urban',   landShare: 0.14, earthShare: 0.041, color: '#84a942', accent: '#f59e0b', icon: '🏘️' },
        iceTundra: { label: 'Ice, Glaciers & Tundra', landShare: 0.10, earthShare: 0.029, color: '#cbd5e1', accent: '#f8fafc', icon: '❄️' }
    },
    mountainLandShare: 0.24
};

function smoothNoise2D(x, y, scale, seedOffset = 0) {
    const gx = x / scale;
    const gy = y / scale;
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const fx = gx - ix;
    const fy = gy - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const wrapCol = Math.max(1, Math.round(WORLD_W / scale));
    const c0 = ((ix % wrapCol) + wrapCol) % wrapCol;
    const c1 = (c0 + 1) % wrapCol;
    const n00 = hash2D(c0 + seedOffset, iy);
    const n10 = hash2D(c1 + seedOffset, iy);
    const n01 = hash2D(c0 + seedOffset, iy + 1);
    const n11 = hash2D(c1 + seedOffset, iy + 1);
    const nx0 = n00 + (n10 - n00) * ux;
    const nx1 = n01 + (n11 - n01) * ux;
    return nx0 + (nx1 - nx0) * uy;
}

export function getEarthTerrainAt(x, y) {
    const wx = wrapX(x);
    const lat = Math.abs((y / WORLD_H) - 0.5) * 2; // 0 = equator, 1 = poles

    // Multi-octave elevation for 71% Ocean / 29% Land
    let elev = smoothNoise2D(wx, y, 16000, 11) * 0.62
        + smoothNoise2D(wx, y, 4800, 47) * 0.28
        + smoothNoise2D(wx, y, 1400, 91) * 0.10;

    // Guarantee dry land around the Cradle of Aethelgard & continental capital bands
    const contOffset = wx % 96000;
    const isCapitalBand = contOffset < 2800 && y > 1300 && y < 3200;
    if (isCapitalBand) elev = Math.max(elev, 0.66);

    // 71% Ocean threshold (elev <= 0.583 is ocean/sea, > 0.583 is land)
    if (elev <= 0.583) {
        const isShallow = elev > 0.533;
        return {
            isOcean: true,
            isMountain: false,
            type: 'ocean',
            label: isShallow ? 'Coastal Sea' : 'Deep Ocean',
            icon: '🌊',
            color: isShallow ? '#0369a1' : '#0c4a6e',
            elevation: 0
        };
    }

    const moisture = smoothNoise2D(wx, y, 12000, 173) * 0.7 + smoothNoise2D(wx, y, 3200, 211) * 0.3;
    const ridge = smoothNoise2D(wx, y, 5600, 307) * 0.65 + smoothNoise2D(wx, y, 1800, 409) * 0.35;
    // ~24% of land is mountainous (ridge > 0.665 or high elev > 0.78)
    const isMountain = ridge > 0.665 || elev > 0.78;
    const terrainElev = isMountain ? Math.round(18 + (ridge - 0.5) * 48) : 0;

    // 10% Ice, Glaciers & Tundra (polar latitudes or highest frozen peaks)
    if (lat > 0.90 || (lat > 0.78 && isMountain)) {
        return { isOcean: false, isMountain, type: 'iceTundra', ...EARTH_SURFACE_STATS.landBreakdown.iceTundra, elevation: terrainElev };
    }
    // 14% Agricultural & Urban (fertile river valleys & capital heartlands)
    if (isCapitalBand || (Math.abs(y - RIVER_Y) < 420 && moisture > 0.42) || (elev < 0.648 && moisture > 0.53)) {
        return { isOcean: false, isMountain, type: 'agriUrban', ...EARTH_SURFACE_STATS.landBreakdown.agriUrban, elevation: terrainElev };
    }
    // 19% Deserts & Barren Land (dry subtropical belts)
    if (moisture < 0.34 || (lat < 0.32 && moisture < 0.41)) {
        return { isOcean: false, isMountain, type: 'desert', ...EARTH_SURFACE_STATS.landBreakdown.desert, elevation: terrainElev };
    }
    // 31% Forests & Woodlands (high moisture)
    if (moisture > 0.50) {
        return { isOcean: false, isMountain, type: 'forest', ...EARTH_SURFACE_STATS.landBreakdown.forest, elevation: terrainElev };
    }
    // 26% Grasslands & Savannas (moderate moisture)
    return { isOcean: false, isMountain, type: 'grassland', ...EARTH_SURFACE_STATS.landBreakdown.grassland, elevation: terrainElev };
}
