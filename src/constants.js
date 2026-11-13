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
}
