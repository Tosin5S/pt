import {
    WORLD_W, WORLD_H, RIVER_Y, CONTINENTS, AGE_EPOCHS,
    FIGHTING_STYLES, BENDING_SPECS, ARMY_FORMATIONS, BUILDING_SPECS,
    wrapX, wrapDX, wrappedDist, SpatialGrid
} from './constants.js';
import { TribalAudioEngine } from './audio.js';
import { uiMethods } from './ui.js';
import { rendererMethods } from './renderer.js';

export class PrehistoricPlanetaryGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.minimapCanvas = document.getElementById('minimapCanvas');
        this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;
        this.sfx = new TribalAudioEngine();
        this.spatialGrid = new SpatialGrid(260);

        this.resources = { food: 520, wood: 460, stone: 380, gold: 320, weapons: 28 };
        this.housedRelics = 1;
        this.empirePopBillions = 1.45;
        this.ageLevel = 0;

        this.maxBrowserAgents = 500;
        this.taxRate = 0.20;
        this.totalTaxesCollected = 0;
        this.globalTaxTimer = 8.0;
        this.globalFreeWill = true;
        this.freeBuildMode = false;
        this.simSpeed = 1;
        this.blueprints = [
            { id: 'bp_treehouse', category: 'house', name: 'Treehouse Sanctuary', icon: '🌳', color: '#4ade80', components: ['timber', 'crystal'], builtCount: 0 },
            { id: 'bp_obelisk', category: 'structure', name: 'Crystal Obelisk', icon: '🔮', color: '#38bdf8', components: ['stone', 'crystal', 'gold'], builtCount: 0 },
            { id: 'bp_sunblade', category: 'tool', name: 'Obsidian Sunblade', icon: '🗡️', color: '#f59e0b', components: ['metal', 'crystal'], builtCount: 0 },
            { id: 'bp_phoenix', category: 'magic', name: 'Phoenix Nova', icon: '🔥', color: '#f43f5e', components: ['crystal', 'gold'], builtCount: 0 }
        ];
        try {
            const savedBps = localStorage.getItem('prehistoric_tribes_blueprints_v1');
            if (savedBps) {
                const parsed = JSON.parse(savedBps);
                if (Array.isArray(parsed) && parsed.length > 0) this.blueprints = parsed;
            }
        } catch (e) {}
        this.keysDown = new Set();
        this.musicEnabled = false;
        this.musicBeatTimer = 0;

        this.cam = {
            x: 820,
            y: 2310,
            zoom: 1.04,
            targetX: 820,
            targetY: 2310,
            targetZoom: 1.04,
            minZoom: 0.08,
            maxZoom: 3.80,
            zoomPresetIndex: 1,
            followSelected: false,
            tiltScale: 0.82,
            tiltMode: 0,
            shakeTimer: 0,
            shakeIntensity: 0
        };
        this.globeMode = false;
        this.globeYaw = -0.6;
        this.globePitch = 0.22;
        this.duelCamActive = false;

        this.lightingMode = 0;
        this.hd2dEnabled = true;
        this.greatCometTimer = 0;
        this.globalTimeSlowTimer = 0;

        this.boxSelectMode = false;
        this.lassoRect = null;
        this.weatherMode = 0;
        this.weatherParticles = [];
        this.generationalBirthTimer = 11.0;
        this.totalTribesFounded = 0;
        this.totalTribeMigrations = 0;
        this.totemMonuments = [];
        this.worldYear = 1;
        this.oneRing = {
            bearerId: null,
            x: 780,
            y: 2320,
            dropped: false,
            history: []
        };
        this.chronicles = {
            ring: [],
            heroes: [],
            empires: []
        };
        this.activeChronicleBook = 'ring';

        this.ringControlSpareMode = true;
        this.heroTeleportOnTap = true;
        this.squadSelectActive = false;
        this.formationIndex = 0;
        this.selectedIds = [];
        this.selectedBuildingId = null;
        this.nextId = 1;

        this.heroArtifacts = {
            wraithCrown: true,
            twinRingBlades: true,
            shadowDrakeWings: true,
            eyeOfDominion: false
        };
        this.researchedTechs = {
            repeatingBows: false,
            mithrilPhalanx: false,
            subElemental: true,
            imperialTaxCarts: false
        };

        this.buildings = [];
        this.resourcesNodes = [];
        this.villagers = [];
        this.enemies = [];
        this.worldBosses = [];
        this.siegeEngines = [];
        this.warGalleys = [];
        this.aiPlayers = [];
        this.mithrilCaverns = [];
        this.stoneBridges = [];
        this.cliffRamps = [];
        this.biomeFeatures = [];

        this.projectiles = [];
        this.embeddedArrows = [];
        this.slashRibbons = [];
        this.clashSparks = [];
        this.afterimages = [];
        this.parryRings = [];
        this.sonicRings = [];
        this.fallingMeteors = [];
        this.blackHoles = [];
        this.floatTexts = [];
        this.riverFish = [];

        this.time = 0;
        this.fps = 60;
        this._fpsFrames = 0;
        this._fpsAccum = 0;

        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.initFreshPlanet();
        this.bindInputEvents();
        this.updateHUD();
        this.updateInspector();
        this.updateZoomHUD();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    getContinentAt(x) {
        const wx = wrapX(x);
        for (let i = 0; i < CONTINENTS.length; i++) {
            if (wx >= CONTINENTS[i].xStart && wx < CONTINENTS[i].xEnd) return CONTINENTS[i];
        }
        return CONTINENTS[0];
    }

    getTerrainElevation(x, y) {
        if (y < 1680) return 32;
        for (let i = 0; i < this.stoneBridges.length; i++) {
            const br = this.stoneBridges[i];
            if (Math.abs(wrapDX(br.x, x)) < 50 && Math.abs(y - RIVER_Y) < 62) return 10;
        }
        return 0;
    }

    createVillager(x, y, name, isT101s = false) {
        const styles = ['berserker', 'phalanx', 'kungfu', 'archery', 'juggernaut'];
        const professions = [
            { title: 'Timber Lumberjack', wage: 6, icon: '🪓' },
            { title: 'Megalith Miner',    wage: 7, icon: '⛏️' },
            { title: 'Gold Prospector',   wage: 10,icon: '🪙' },
            { title: 'Sabre-Rib Hunter',  wage: 6, icon: '🍖' },
            { title: 'Master Blacksmith', wage: 9, icon: '⚒️' },
            { title: 'Caravan Merchant',  wage: 11,icon: '⚖️' },
            { title: 'Imperial Guard',    wage: 8, icon: '🛡️' }
        ];
        const archetypes = [
            { id: 'defender', name: '🦁 Valiant Defender' },
            { id: 'tycoon',   name: '💎 Merchant Tycoon' },
            { id: 'explorer', name: '🧭 Curious Explorer' },
            { id: 'social',   name: '🤝 Social Harmonizer' },
            { id: 'artisan',  name: '🔨 Master Artisan' },
            { id: 'zealot',   name: '🔥 Martial Zealot' }
        ];
        const prof = isT101s
            ? { title: 'Sovereign Ring-Lord', wage: 45, icon: '💍' }
            : professions[Math.floor(Math.random() * professions.length)];
        const arch = isT101s
            ? { id: 'sovereign', name: '👑 Ring Sovereign' }
            : archetypes[Math.floor(Math.random() * archetypes.length)];

        return {
            id: this.nextId++,
            name: name || `Citizen-${this.nextId}`,
            x: wrapX(x),
            y: Math.max(1320, Math.min(WORLD_H - 180, y)),
            vx: 0,
            vy: 0,
            facing: 1,
            isT101s,
            isWraith: false,
            isShadowClone: false,
            cloneLife: 0,
            hp: isT101s ? 280 : 210,
            maxHp: isT101s ? 280 : 210,
            attack: isT101s ? 30 : 24,
            fightingStyle: isT101s ? 'berserker' : styles[Math.floor(Math.random() * styles.length)],
            bender: isT101s ? 'fire' : (Math.random() < 0.28 ? ['fire', 'water', 'earth', 'air'][Math.floor(Math.random() * 4)] : null),
            skySoar: false,
            invincible: false,
            lightningSpeed: false,
            mountType: null,
            age: isT101s ? 26 : (18 + Math.floor(Math.random() * 14)),
            maxAge: isT101s ? 115 : (72 + Math.floor(Math.random() * 24)),
            kills: 0,
            hasOneRing: false,
            childScale: 1.0,
            profession: prof.title,
            wage: prof.wage,
            profIcon: prof.icon,
            walletGold: isT101s ? 500 : Math.floor(25 + Math.random() * 55),
            taxPaidTotal: 0,
            gearLevel: isT101s ? 5 : 1,
            econTimer: 2 + Math.random() * 4,
            archetype: arch,
            mindDesire: isT101s ? '👑 Expanding Ring Dominion' : `${prof.icon} Working as ${prof.title}`,
            thoughtBubble: isT101s ? '💍 One Ring Eternal!' : `${prof.icon} Ready!`,
            thoughtTimer: 3.5,
            hunger: Math.random() * 35,
            socialNeed: Math.random() * 40,
            joy: isT101s ? 100 : Math.floor(68 + Math.random() * 28),
            anger: isT101s ? 0 : Math.floor(Math.random() * 18),
            loyalty: isT101s ? 100 : Math.floor(72 + Math.random() * 26),
            ambition: isT101s ? 100 : Math.floor(35 + Math.random() * 62),
            fear: 0,
            emotionIcon: isT101s ? '👑' : '😄',
            emotionLabel: isT101s ? 'Sovereign' : 'Joyful',
            tribeId: 'player',
            tribeName: 'Aethelgard Empire',
            tribeColor: '#0f766e',
            partnerName: null,
            directOrderTimer: 0,
            mindTimer: 1.5 + Math.random() * 3.5,
            targetX: null,
            targetY: null,
            targetEntity: null,
            attackCooldown: 0,
            comboStep: 0,
            swingAnim: 0,
            dodgeAnim: 0,
            dodgeType: 'backflip',
            blockAnim: 0,
            walkPhase: Math.random() * 10
        };
    }

    createEnemyRaider(x, y, name, isBoss = false, aiOwnerId = null) {
        const styles = ['berserker', 'phalanx', 'kungfu', 'archery', 'juggernaut'];
        return {
            id: this.nextId++,
            name: name || 'Ashland Raider',
            x: wrapX(x),
            y,
            facing: -1,
            isBoss,
            aiOwnerId,
            age: isBoss ? 48 : (20 + Math.floor(Math.random() * 16)),
            maxAge: isBoss ? 140 : (70 + Math.floor(Math.random() * 20)),
            kills: 0,
            hasOneRing: false,
            childScale: 1.0,
            hp: isBoss ? 1650 : 190,
            maxHp: isBoss ? 1650 : 190,
            attack: isBoss ? 52 : 19,
            fightingStyle: styles[Math.floor(Math.random() * styles.length)],
            bender: Math.random() < 0.35 ? ['fire', 'earth', 'water', 'air'][Math.floor(Math.random() * 4)] : null,
            controlledByRing: false,
            walkPhase: Math.random() * 10,
            attackCooldown: 0,
            swingAnim: 0,
            hitFlash: 0
        };
    }

    initFreshPlanet() {
        // Player Home Buildings
        const homeBuildings = [
            { type: 'town_center', x: 780,  y: 2320 },
            { type: 'hut',         x: 640,  y: 2240 },
            { type: 'hut',         x: 690,  y: 2420 },
            { type: 'sawmill',     x: 560,  y: 2330 },
            { type: 'quarry',      x: 520,  y: 2190 },
            { type: 'kitchen',     x: 880,  y: 2410 },
            { type: 'forge',       x: 920,  y: 2250 },
            { type: 'barracks',    x: 990,  y: 2340 },
            { type: 'shrine',      x: 770,  y: 2170 },
            { type: 'tower',       x: 1090, y: 2260 },
            { type: 'tower',       x: 1090, y: 2410 },
            { type: 'gatehouse',   x: 1140, y: 2335 },
            { type: 'shipyard',    x: 820,  y: 2065 },
            { type: 'market',      x: 680,  y: 2330 }
        ];
        homeBuildings.forEach(b => {
            const spec = BUILDING_SPECS[b.type];
            this.buildings.push({
                id: this.nextId++,
                type: b.type,
                name: spec.name,
                icon: spec.icon,
                x: b.x,
                y: b.y,
                hp: spec.hp,
                maxHp: spec.hp,
                radius: spec.radius,
                owner: 'player',
                shootTimer: 0
            });
        });

        // Bridges, Cliff Ramps & Mithril Caverns across all 6 Ultra-Massive Continents (576,000 x 96,000)
        for (let c = 0; c < CONTINENTS.length; c++) {
            const base = CONTINENTS[c].xStart;
            for (let b = 0; b < 12; b++) {
                this.stoneBridges.push({ x: base + 1200 + b * 8000, y: RIVER_Y });
            }
            for (let r = 0; r < 10; r++) {
                this.cliffRamps.push({ x: base + 1500 + r * 9500, y: 1680 });
            }
            this.mithrilCaverns.push({
                id: this.nextId++,
                name: `${CONTINENTS[c].name} Mithril Cavern`,
                x: base + 1400,
                y: 1540,
                mithrilReserve: 450
            });
            this.biomeFeatures.push({
                x: base + 3200,
                y: 3600,
                biome: CONTINENTS[c].biome
            });

            // Starter resource cluster near each continent's capital
            for (let s = 0; s < 16; s++) {
                const rType = s % 3 === 0 ? 'gold' : (s % 2 === 0 ? 'stone' : 'tree');
                this.resourcesNodes.push({
                    id: this.nextId++,
                    type: rType,
                    x: base + 320 + (s * 137) % 1600,
                    y: 2120 + (s * 193) % 900,
                    amount: 350
                });
            }

            // Wilderness Forests, Stone & Gold Veins across the 96,000 x 94,000 continent
            for (let n = 0; n < 104; n++) {
                const rType = n % 3 === 0 ? 'gold' : (n % 2 === 0 ? 'stone' : 'tree');
                this.resourcesNodes.push({
                    id: this.nextId++,
                    type: rType,
                    x: base + 400 + (n * 7919) % 95000,
                    y: 1460 + (n * 12497) % 90000,
                    amount: 350
                });
            }
        }

        // Hero t101s + 119 Autonomous Citizens (120 Total Starting Population)
        const hero = this.createVillager(840, 2330, 't101s', true);
        this.villagers.push(hero);
        this.selectedIds = [hero.id];
        this.equipOneRing(hero, 'Forged & claimed at the dawn of Aethelgard', true);
        this.addChronicle('heroes', 'Rise of Sovereign t101s', 't101s rose in the Cradle of Aethelgard, bearing the One Ring. Yet even heroes are mortal — should t101s fall, a new legend will begin.');
        this.addChronicle('empires', 'Founding of Aethelgard Empire', 'The Aethelgard Empire united 120 pioneers along the Sacred River, surrounded by rival tribes across 6 continents.');

        const firstNames = [
            'Ayla', 'Torak', 'Kael', 'Zuko', 'Korra', 'Toph', 'Sokka', 'Katara',
            'Bolin', 'Mako', 'Lin', 'Suyin', 'Kyoshi', 'Roku', 'Aang', 'Tenzin',
            'arok', 'Bryn', 'Vael', 'Dax', 'Nia', 'Orin', 'Sora', 'Kira'
        ];
        for (let i = 1; i < 120; i++) {
            const homeCluster = i < 72;
            const vx = homeCluster
                ? 540 + (i * 37) % 620
                : ((i * 193) % WORLD_W);
            const vy = homeCluster
                ? 2140 + (i * 53) % 440
                : 1520 + (i * 89) % 1280;
            const nm = `${firstNames[i % firstNames.length]}-${i}`;
            const v = this.createVillager(vx, vy, nm, false);
            if (i % 7 === 0) v.partnerName = `${firstNames[(i + 1) % firstNames.length]}-${i + 1}`;
            this.villagers.push(v);
        }

        // Siege Engines & Naval War Galleys
        this.siegeEngines.push({
            id: this.nextId++,
            type: 'trebuchet',
            name: 'Counterweight Trebuchet',
            x: 1035,
            y: 2300,
            shootTimer: 0
        });
        this.siegeEngines.push({
            id: this.nextId++,
            type: 'ram',
            name: 'Mammoth-Skull Battering Ram',
            x: 1055,
            y: 2375,
            shootTimer: 0
        });
        this.warGalleys.push({
            id: this.nextId++,
            name: 'Dragon-Fire War Galley I',
            x: 840,
            y: RIVER_Y,
            vx: 38,
            shootTimer: 0
        });
        this.warGalleys.push({
            id: this.nextId++,
            name: 'Dragon-Fire War Galley II',
            x: 2450,
            y: RIVER_Y,
            vx: -34,
            shootTimer: 0
        });

        // River Fish & Weather Particles
        for (let f = 0; f < 40; f++) {
            this.riverFish.push({
                x: Math.random() * WORLD_W,
                y: RIVER_Y + (Math.random() - 0.5) * 48,
                speed: 22 + Math.random() * 28
            });
        }
        for (let wp = 0; wp < 95; wp++) {
            this.weatherParticles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                speedX: -60 - Math.random() * 40,
                speedY: 260 + Math.random() * 140,
                size: 1.5 + Math.random() * 2.5
            });
        }

        // 5 Autonomous AI Players Across Continents 1-5
        const aiSpecs = [
            { id: 1, name: 'Emperor Sundiata', tribe: 'Sun-Spear Dynasty',   cont: 1, stance: 'neutral', color: '#facc15', icon: '☀️' },
            { id: 2, name: 'Fire-Lord Ozaius', tribe: 'Ashland Fire Nation', cont: 2, stance: 'hostile', color: '#f97316', icon: '🔥' },
            { id: 3, name: 'Grandmaster Mei',  tribe: 'Jade Lotus Order',    cont: 3, stance: 'allied',  color: '#34d399', icon: '🥋' },
            { id: 4, name: 'Chieftain Ymir',   tribe: 'Frost-Tusk Clan',     cont: 4, stance: 'neutral', color: '#38bdf8', icon: '❄️' },
            { id: 5, name: 'Warlord Skarr',    tribe: 'Crimson Skull Horde', cont: 5, stance: 'hostile', color: '#f43f5e', icon: '💀' }
        ];
        aiSpecs.forEach(ai => {
            const capX = CONTINENTS[ai.cont].xStart + 820;
            const capY = 2320;
            this.aiPlayers.push({
                ...ai,
                x: capX,
                y: capY,
                ageLevel: 1,
                gold: 260,
                tributeTimer: 12
            });
            this.buildings.push({
                id: this.nextId++,
                type: 'town_center',
                name: `${ai.tribe} Capital`,
                icon: ai.icon,
                x: capX,
                y: capY,
                hp: 2100,
                maxHp: 2100,
                radius: 52,
                owner: ai.id,
                shootTimer: 0
            });
            for (let r = 0; r < 5; r++) {
                this.enemies.push(this.createEnemyRaider(
                    capX + (r - 2) * 45,
                    capY + 75,
                    `${ai.tribe} Guard`,
                    false,
                    ai.id
                ));
            }
        });

        // Immediate Ashland Vanguard Raiders near Player Watchtower for instant action
        for (let r = 0; r < 6; r++) {
            this.enemies.push(this.createEnemyRaider(
                1240 + r * 36,
                2290 + (r % 3) * 44,
                `Ashland Vanguard #${r + 1}`,
                false,
                2
            ));
        }

        // 4 Colossal Prehistoric World Bosses
        const bossSpecs = [
            { name: '🦖 Elder Titan Mammoth',     x: 125000, y: 18000 },
            { name: '🌋 Ashland Magma Behemoth',  x: 242000, y: 32000 },
            { name: '🐉 Abyssal River Leviathan', x: 348000, y: RIVER_Y },
            { name: '🦅 Celestial Thunder-Roc',   x: 464000, y: 1620 }
        ];
        bossSpecs.forEach(b => {
            const boss = this.createEnemyRaider(b.x, b.y, b.name, true, null);
            this.worldBosses.push(boss);
            this.enemies.push(boss);
        });
    }


    cycleWeather() {
        this.weatherMode = (this.weatherMode + 1) % 5;
        const names = ['Clear Sky', 'Monsoon Rain', 'Volcanic Ash', 'Boreal Blizzard', 'Ring Eclipse'];
        const descs = [
            '☀️ Clear Skies across the 6 Continents!',
            '🌧️ Monsoon Rainstorm! Waterbenders gain +35% Attack & Crops flourish!',
            '🌋 Volcanic Ash-Storm! Firebenders gain +35% Attack!',
            '❄️ Boreal Blizzard! Enemy Raiders slowed by 20%!',
            '🌑 Crimson One Ring Eclipse! Hero t101s & Bloodbending deal +50% Sovereign Damage!'
        ];
        const el = document.getElementById('weatherBtnText');
        if (el) el.textContent = names[this.weatherMode];
        this.showBanner('🌦️', descs[this.weatherMode]);
    }

    toggleMountForSelected() {
        const mounts = [null, 'mammoth', 'sabre', 'drake'];
        const labels = ['On Foot', '🦣 War-Mammoth', '🐅 Armored Sabre-Cat', '🐉 Crimson Sky-Drake'];
        let changed = 0;
        const targets = this.selectedIds.length > 0
            ? this.villagers.filter(v => this.selectedIds.includes(v.id))
            : [this.getSelectedUnit()].filter(Boolean);
        let nextMount = 'mammoth';
        targets.forEach((u, idx) => {
            if (idx === 0) {
                const curIdx = mounts.indexOf(u.mountType || null);
                nextMount = mounts[(curIdx + 1) % mounts.length];
            }
            u.mountType = nextMount;
            if (nextMount === 'drake') u.skySoar = true;
            changed++;
        });
        const labelName = labels[mounts.indexOf(nextMount)];
        this.sfx.play('horn');
        this.updateInspector();
        this.showBanner('🦣', `Equipped ${changed} Unit(s) with Mount: ${labelName}!`);
    }

    issueCitizenStimulus() {
        if (this.resources.gold < 60) {
            this.showBanner('⚠️', 'Need 60🪙 Imperial Gold to fund a Citizen Stimulus Grant!');
            return;
        }
        this.resources.gold -= 60;
        this.villagers.forEach(u => {
            u.walletGold = (u.walletGold || 0) + 15;
            u.thoughtBubble = '🏦 +15🪙 Stimulus!';
            u.thoughtTimer = 3.2;
        });
        this.sfx.play('ring');
        this.updateHUD();
        this.renderEconomyPanel();
        this.showBanner('🏦', 'Imperial Sovereign Bank distributed +15🪙 Gold to every Citizen Wallet!');
    }


    executeTeleportJump(u, destX, destY, label = '🌀 TELEPORT!') {
        const startX = u.x;
        const startY = u.y;
        for (let s = 0; s <= 5; s++) {
            const t = s / 5;
            this.afterimages.push({
                x: wrapX(startX + wrapDX(startX, destX) * t),
                y: startY + (destY - startY) * t,
                color: u.isT101s ? '#f43f5e' : '#38bdf8',
                alpha: 0.75,
                life: 0.45
            });
        }
        this.parryRings.push({ x: startX, y: startY, radius: 8, maxRadius: 52, color: '#facc15', life: 0.35 });
        u.x = wrapX(destX);
        u.y = Math.max(1320, Math.min(WORLD_H - 180, destY));
        this.parryRings.push({ x: u.x, y: u.y, radius: 10, maxRadius: 64, color: '#f43f5e', life: 0.45 });
        this.spawnFloatText(u.x, u.y - 36, label, '#fde047');
        this.sfx.play('ring');
    }

    getSelectedUnit() {
        return this.villagers.find(v => this.selectedIds.includes(v.id)) || this.villagers[0];
    }

    getFriendlyRingBearer() {
        const bearer = this.getRingBearer();
        if (bearer && this.villagers.includes(bearer)) return bearer;
        return null;
    }

    requireRingBearer(actionName = 'Ring power') {
        const bearer = this.getFriendlyRingBearer();
        if (!bearer) {
            this.showBanner('💍', `No human wears the One Ring! Reclaim & equip the Ring to use ${actionName}.`);
            return null;
        }
        return bearer;
    }

    focusHeroT101s() {
        const bearer = this.getRingBearer() || this.villagers.find(v => v.isT101s);
        this.globeMode = false;
        if (bearer) {
            if (this.villagers.includes(bearer)) this.selectedIds = [bearer.id];
            this.cam.targetX = bearer.x;
            this.cam.targetY = bearer.y;
            this.updateInspector();
            this.showBanner('💍', `Camera centered on Ring-Bearer ${bearer.name}!`);
        } else if (this.oneRing.dropped) {
            this.cam.targetX = this.oneRing.x;
            this.cam.targetY = this.oneRing.y;
            this.showBanner('💍', 'Camera centered on the unclaimed One Ring!');
        }
    }

    toggleSquadSelection() {
        const hero = this.getFriendlyRingBearer() || this.villagers.find(v => v.isT101s) || this.villagers[0];
        if (!hero) return;
        if (!this.squadSelectActive) {
            this.squadSelectActive = true;
            const nearby = this.villagers
                .filter(v => wrappedDist(v.x, v.y, hero.x, hero.y) < 520)
                .slice(0, 18)
                .map(v => v.id);
            this.selectedIds = nearby.length ? nearby : [hero.id];
            this.showBanner('🔲', `Selected Strike Squad (${this.selectedIds.length} Warriors) around ${hero.name}!`);
        } else {
            this.squadSelectActive = false;
            this.selectedIds = [hero.id];
            this.showBanner('💍', `Focused Selection on ${hero.name}.`);
        }
        const el = document.getElementById('squadBtnLabel');
        if (el) el.textContent = `Squad (${this.selectedIds.length})`;
        this.updateInspector();
    }

    toggleGlobalFreeWill() {
        this.globalFreeWill = !this.globalFreeWill;
        const el = document.getElementById('freeWillBtnLabel');
        if (el) el.textContent = `Free Will: ${this.globalFreeWill ? 'ON' : 'OFF'}`;
        this.showBanner('🧠', this.globalFreeWill
            ? 'Autonomous Free Will ON: All citizens think, work, socialize, train & build homes on their own!'
            : 'Direct Command Mode: Citizens await your direct tactical orders.');
    }

    toggleHeroTeleport() {
        this.heroTeleportOnTap = !this.heroTeleportOnTap;
        const el = document.getElementById('teleportBtnText');
        if (el) el.textContent = `Teleport: ${this.heroTeleportOnTap ? 'ON' : 'OFF'}`;
    }

    triggerHeroTeleport() {
        const hero = this.requireRingBearer('Flash Teleport');
        if (!hero) return;
        this.heroTeleportOnTap = !this.heroTeleportOnTap;
        const el = document.getElementById('teleportBtnText');
        if (el) el.textContent = `Teleport: ${this.heroTeleportOnTap ? 'ON' : 'OFF'}`;
        let nearest = null;
        let bestD = 999999;
        for (let i = 0; i < this.enemies.length; i++) {
            const e = this.enemies[i];
            if (e.controlledByRing) continue;
            const d = wrappedDist(hero.x, hero.y, e.x, e.y);
            if (d < bestD) {
                bestD = d;
                nearest = e;
            }
        }
        if (nearest && bestD < 950) {
            this.executeTeleportJump(hero, nearest.x - 32, nearest.y, '⚡ FLASH TELEPORT AMBUSH!');
            this.performUnitAttack(hero, nearest);
        }
        this.updateInspector();
    }

    toggleHeroInvincibility() {
        const hero = this.requireRingBearer('Ring Invincibility');
        if (!hero) return;
        hero.invincible = !hero.invincible;
        if (hero.invincible) hero.hp = hero.maxHp;
        const el = document.getElementById('invincibleBtnText');
        if (el) el.textContent = `Invincible: ${hero.invincible ? 'ON' : 'OFF'}`;
        this.spawnFloatText(hero.x, hero.y - 38, hero.invincible ? '🛡️ ONE RING INVINCIBLE!' : '🛡️ MORTAL STANCE', '#fde047');
        this.updateInspector();
    }

    toggleHeroLightningSpeed() {
        const hero = this.requireRingBearer('Lightning Speed');
        if (!hero) return;
        hero.lightningSpeed = !hero.lightningSpeed;
        const el = document.getElementById('lightningSpdBtnText');
        if (el) el.textContent = `Lightning Spd: ${hero.lightningSpeed ? 'ON' : 'OFF'}`;
        this.spawnFloatText(hero.x, hero.y - 38, hero.lightningSpeed ? '⚡ HYPER-LIGHTNING SPEED!' : '⚡ NORMAL SPEED', '#38bdf8');
        this.updateInspector();
    }

    triggerOneRingTimeDome() {
        const hero = this.requireRingBearer('Time-Dilation');
        if (!hero) return;
        this.globalTimeSlowTimer = 14.0;
        this.parryRings.push({ x: hero.x, y: hero.y, radius: 15, maxRadius: 260, color: '#c084fc', life: 0.9 });
        this.spawnFloatText(hero.x, hero.y - 42, '⏳ WORLD TIME SLOWED (12% SPEED)!', '#e879f9');
        this.sfx.play('ring');
        this.showBanner('⏳', `${hero.name} unleashed One Ring Time-Dilation: enemies slowed to 12% speed for 14s!`);
    }

    triggerShadowCloneLegion() {
        const hero = this.requireRingBearer('Shadow-Clones');
        if (!hero) return;
        for (let c = 0; c < 6; c++) {
            const ang = (c / 6) * Math.PI * 2;
            const clone = this.createVillager(
                hero.x + Math.cos(ang) * 65,
                hero.y + Math.sin(ang) * 45,
                `${hero.name} Shadow-Clone #${c + 1}`,
                false
            );
            clone.isShadowClone = true;
            clone.cloneLife = 18.0;
            clone.fightingStyle = 'onering';
            clone.bender = 'avatar';
            clone.lightningSpeed = true;
            clone.invincible = true;
            clone.attack = 46;
            this.villagers.push(clone);
        }
        this.sfx.play('ring');
        this.showBanner('👥', `${hero.name} split into 6 Hyper-Speed Lightning Shadow-Clones for 18s!`);
    }

    triggerBlackHoleSingularity() {
        const hero = this.requireRingBearer('Black Hole Singularity');
        if (!hero) return;
        this.blackHoles.push({
            x: wrapX(hero.x + hero.facing * 140),
            y: hero.y,
            radius: 175,
            life: 6.5
        });
        this.sfx.play('ring');
        this.showBanner('🕳️', `${hero.name} unleashed a Gravitational Black Hole Singularity!`);
    }

    summonRingWraiths() {
        const hero = this.requireRingBearer('Ring-Wraiths');
        if (!hero) return;
        for (let w = 0; w < 3; w++) {
            const wraith = this.createVillager(
                hero.x + (w - 1) * 55,
                hero.y - 35,
                `Ring-Wraith Fellbeast #${w + 1}`,
                false
            );
            wraith.isWraith = true;
            wraith.skySoar = true;
            wraith.lightningSpeed = true;
            wraith.fightingStyle = 'berserker';
            wraith.attack = 48;
            wraith.maxHp = 460;
            wraith.hp = 460;
            this.villagers.push(wraith);
        }
        this.sfx.play('horn');
        this.updateHUD();
        this.showBanner('🐉', 'Summoned 3 Flying Ring-Wraith Fellbeast Knights!');
    }

    toggleHeroSkySoar() {
        const u = this.requireRingBearer('Sky-Soar');
        if (!u) return;
        u.skySoar = !u.skySoar;
        const el = document.getElementById('soarBtnText');
        if (el) el.textContent = u.skySoar ? 'Soaring' : 'Grounded';
        this.spawnFloatText(u.x, u.y - 34, u.skySoar ? '🪽 SKY-SOARING!' : '🦶 GROUNDED', '#fde047');
        this.updateInspector();
    }

    toggleRingControlMode() {
        this.ringControlSpareMode = !this.ringControlSpareMode;
        const el = document.getElementById('controlModeBtnText');
        if (el) el.textContent = this.ringControlSpareMode ? 'Control: Spare' : 'Control: Slay';
        this.showBanner('👑', this.ringControlSpareMode
            ? 'Non-Lethal Bloodbending Active: t101s spares & puppets enemy humans instead of killing them!'
            : 'Lethal Bloodbending Active: t101s crushes enemies with full force.');
    }

    triggerOneRingDominion() {
        const hero = this.requireRingBearer('One Ring Dominion');
        if (!hero) return;
        this.parryRings.push({ x: hero.x, y: hero.y, radius: 12, maxRadius: 280, color: '#f43f5e', life: 0.75 });
        let captured = 0;
        this.enemies.forEach(e => {
            if (wrappedDist(hero.x, hero.y, e.x, e.y) < 340) {
                if (this.ringControlSpareMode && !e.isBoss) {
                    e.controlledByRing = true;
                    e.hp = e.maxHp;
                    captured++;
                } else {
                    e.hp -= 140;
                    e.hitFlash = 0.25;
                }
            }
        });
        this.sfx.play('ring');
        this.updateInspector();
        this.showBanner('🩸', captured > 0
            ? `One Ring Dominion captured ${captured} enemy warriors as Blood-Puppets! Click "🤝 Recruit" to convert them.`
            : 'Unleashed Crimson One Ring Dominion Shockwave!');
    }

    recruitControlledPuppets() {
        const puppets = this.enemies.filter(e => e.controlledByRing);
        if (puppets.length === 0) {
            this.showBanner('👑', 'Use t101s Bloodbending or "🩸 Dominion" on enemy raiders first to capture puppets!');
            return;
        }
        puppets.forEach(p => {
            if (this.villagers.length < this.maxBrowserAgents) {
                const v = this.createVillager(p.x, p.y, `Recruited ${p.name}`, false);
                v.fightingStyle = p.fightingStyle;
                v.bender = p.bender;
                v.thoughtBubble = '👑 Loyal to t101s!';
                v.thoughtTimer = 4.0;
                this.villagers.push(v);
            }
        });
        this.enemies = this.enemies.filter(e => !e.controlledByRing);
        this.sfx.play('horn');
        this.updateHUD();
        this.updateInspector();
        this.showBanner('🤝', `Permanently recruited ${puppets.length} Blood-Controlled Warriors as tax-paying Citizens!`);
    }

    triggerMeteorDrop() {
        const u = this.getSelectedUnit();
        if (!u) return;
        const tx = wrapX(u.x + u.facing * 180);
        const ty = u.y;
        this.fallingMeteors.push({
            x: tx - 140,
            y: ty - 380,
            targetX: tx,
            targetY: ty,
            progress: 0
        });
        this.sfx.play('horn');
        this.showBanner('☄️', 'Pulled a Blazing Prehistoric Asteroid from Orbit!');
    }

    cycleSelectedFightingStyle() {
        const keys = Object.keys(FIGHTING_STYLES);
        const u = this.getSelectedUnit();
        if (!u) return;
        const idx = (keys.indexOf(u.fightingStyle) + 1) % keys.length;
        u.fightingStyle = keys[idx];
        this.spawnFloatText(u.x, u.y - 30, `${FIGHTING_STYLES[u.fightingStyle].icon} ${FIGHTING_STYLES[u.fightingStyle].name}`, '#38bdf8');
        this.updateInspector();
    }

    awakenSelectedBender() {
        const types = ['fire', 'water', 'earth', 'air', 'avatar'];
        const u = this.getSelectedUnit();
        if (!u) return;
        const cur = types.indexOf(u.bender);
        u.bender = types[(cur + 1) % types.length];
        const spec = BENDING_SPECS[u.bender];
        this.spawnFloatText(u.x, u.y - 34, `${spec.icon} ${spec.name}!`, spec.color);
        this.updateInspector();
    }

    triggerSkyVolley() {
        const archers = this.villagers.filter(v => v.fightingStyle === 'archery' || v.isT101s).slice(0, 18);
        archers.forEach((u, idx) => {
            const targetX = wrapX(u.x + u.facing * (240 + (idx % 5) * 32));
            const targetY = u.y + ((idx % 3) - 1) * 28;
            this.spawnParabolicArrow(u, targetX, targetY, idx % 2 === 0 ? 'phoenix' : 'gale');
        });
        this.sfx.play('bow');
        this.showBanner('🏹', `Synchronized Sky-Volley loosed ${archers.length} Parabolic Feathered Arrows!`);
    }

    spawnParabolicArrow(shooter, targetX, targetY, arrowKind = 'broadhead', targetEntity = null) {
        const dist = Math.max(60, wrappedDist(shooter.x, shooter.y, targetX, targetY));
        this.projectiles.push({
            isArrow: true,
            arrowKind,
            owner: 'player',
            startX: shooter.x,
            startY: shooter.y,
            x: shooter.x,
            y: shooter.y,
            z: 18,
            targetX: wrapX(targetX),
            targetY,
            targetEntity,
            progress: 0,
            speed: Math.max(0.55, Math.min(1.45, 310 / dist)),
            arcHeight: Math.min(165, Math.max(48, dist * 0.34)),
            damage: shooter.attack * (arrowKind === 'phoenix' ? 1.45 : 1.15),
            angle: 0,
            trail: []
        });
    }

    triggerMartialFlightShowcase() {
        const dodges = ['backflip', 'roll', 'sidestep', 'matrix_lean', 'air_spin'];
        this.villagers.slice(0, 24).forEach((u, i) => {
            u.dodgeType = dodges[i % dodges.length];
            u.dodgeAnim = 0.65;
            u.swingAnim = 0.6;
        });
        this.sfx.play('sword');
        this.showBanner('🥋', 'Tribe Martial Arts, 360° Backflips & Supersonic Flight Kata Showcase!');
    }

    cycleArmyFormation() {
        this.formationIndex = (this.formationIndex + 1) % ARMY_FORMATIONS.length;
        const f = ARMY_FORMATIONS[this.formationIndex];
        const el = document.getElementById('formationBtnLabel');
        if (el) el.textContent = `${f.icon} ${f.name}`;
        this.showBanner(f.icon, `Army Tactical Formation set to ${f.name}!`);
    }

    focusMithrilCavern() {
        if (this.mithrilCaverns.length === 0) return;
        this._cavIdx = ((this._cavIdx || 0) + 1) % this.mithrilCaverns.length;
        const cav = this.mithrilCaverns[this._cavIdx];
        this.globeMode = false;
        this.cam.targetX = cav.x;
        this.cam.targetY = cav.y;
        this.showBanner('💎', `Viewing ${cav.name} — Tap the glowing crystal portal to delve with t101s!`);
    }

    focusWorldBoss() {
        const alive = this.worldBosses.filter(b => b.hp > 0);
        if (alive.length === 0) {
            this.showBanner('🏆', 'All 4 Colossal Prehistoric World Bosses have been conquered!');
            return;
        }
        this._bossIdx = ((this._bossIdx || 0) + 1) % alive.length;
        const b = alive[this._bossIdx];
        this.globeMode = false;
        this.cam.targetX = b.x;
        this.cam.targetY = b.y;
        this.showBanner('🦖', `Targeted World Boss: ${b.name} (${Math.ceil(b.hp)} HP)!`);
    }

    triggerGreatComet() {
        this.greatCometTimer = 18.0;
        this.sfx.play('horn');
        this.showBanner('☄️', 'The Great Comet blazes across the planet! Firebending & One Ring Damage +250% for 18s!');
    }

    advanceAge() {
        if (this.ageLevel >= AGE_EPOCHS.length - 1) {
            this.showBanner('👑', 'Your Planetary Empire has reached the pinnacle: AGE IV IMPERIAL!');
            return;
        }
        const next = AGE_EPOCHS[this.ageLevel + 1];
        if (this.resources.gold < next.costGold) {
            this.showBanner('⚠️', `Need ${next.costGold}🪙 Imperial Gold to advance to ${next.title}! Collect taxes or mine gold.`);
            return;
        }
        this.resources.gold -= next.costGold;
        this.ageLevel++;
        this.sfx.play('horn');
        this.updateHUD();
        this.showBanner('🏛️', `Advanced to ${next.title}! All settlement architecture upgraded!`);
    }

    constructBuilding(type) {
        const spec = BUILDING_SPECS[type];
        if (!spec) return;
        if (!this.freeBuildMode) {
            if (this.resources.wood < spec.costWood || this.resources.stone < spec.costStone) {
                this.showBanner('⚠️', `Need ${spec.costWood}🪵 Wood & ${spec.costStone}🪨 Stone to build ${spec.name}!`);
                return;
            }
            this.resources.wood -= spec.costWood;
            this.resources.stone -= spec.costStone;
        }
        const u = this.getSelectedUnit();
        const bx = wrapX((u ? u.x : this.cam.x) + (Math.random() - 0.5) * 140);
        const by = Math.max(1450, Math.min(WORLD_H - 220, (u ? u.y : this.cam.y) + (Math.random() - 0.5) * 110));
        this.buildings.push({
            id: this.nextId++,
            type,
            name: spec.name,
            icon: spec.icon,
            x: bx,
            y: by,
            hp: spec.hp,
            maxHp: spec.hp,
            radius: spec.radius,
            owner: 'player',
            shootTimer: 0
        });
        if (type === 'shipyard') {
            this.warGalleys.push({
                id: this.nextId++,
                name: `Dragon-Fire Galley #${this.warGalleys.length + 1}`,
                x: bx,
                y: RIVER_Y,
                vx: 36,
                shootTimer: 0
            });
        }
        this.sfx.play('kalimba');
        this.updateHUD();
        this.showBanner('🏗️', `Constructed ${spec.icon} ${spec.name}!`);
    }

    trainSiegeEngine() {
        if (!this.freeBuildMode) {
            if (this.resources.wood < 60) {
                this.showBanner('⚠️', 'Need 60🪵 Hardwood Timber to construct a Siege Engine!');
                return;
            }
            this.resources.wood -= 60;
        }
        const u = this.getSelectedUnit();
        const isTreb = this.siegeEngines.length % 2 === 0;
        this.siegeEngines.push({
            id: this.nextId++,
            type: isTreb ? 'trebuchet' : 'ram',
            name: isTreb ? 'Counterweight Trebuchet' : 'Mammoth Battering Ram',
            x: wrapX((u ? u.x : 880) + 45),
            y: u ? u.y : 2330,
            shootTimer: 0
        });
        this.updateHUD();
        this.showBanner('🪨', `Deployed 2.5D ${isTreb ? 'Counterweight Trebuchet' : 'Mammoth-Skull Battering Ram'}!`);
    }

    designBlueprint({ category = 'house', name = 'Custom Blueprint', icon = '✨', color = '#38bdf8', components = ['timber'] } = {}) {
        const cleanComps = [...new Set((components && components.length) ? components : ['timber'])];
        const existing = this.blueprints.find(b => b.name.toLowerCase() === name.toLowerCase() && b.category === category);
        if (existing) {
            existing.icon = icon;
            existing.color = color;
            existing.components = cleanComps;
            try { localStorage.setItem('prehistoric_tribes_blueprints_v1', JSON.stringify(this.blueprints)); } catch (e) {}
            return existing;
        }
        const bp = {
            id: `bp_${Date.now()}_${Math.floor(Math.random() * 999)}`,
            category,
            name,
            icon,
            color,
            components: cleanComps,
            builtCount: 0
        };
        this.blueprints.unshift(bp);
        if (this.blueprints.length > 24) this.blueprints.length = 24;
        try { localStorage.setItem('prehistoric_tribes_blueprints_v1', JSON.stringify(this.blueprints)); } catch (e) {}
        return bp;
    }

    buildFromBlueprint(bpId, builderUnit = null) {
        const bp = this.blueprints.find(b => b.id === bpId);
        if (!bp) return;
        const comps = bp.components || ['timber'];
        const hasStone = comps.includes('stone');
        const hasMetal = comps.includes('metal');
        const hasGold = comps.includes('gold');
        const hasCrystal = comps.includes('crystal');
        const hasGears = comps.includes('gears');

        const u = builderUnit || this.getSelectedUnit();
        const tx = u ? u.x : this.cam.x;
        const ty = Math.max(1450, Math.min(WORLD_H - 220, u ? u.y : this.cam.y));

        if (bp.category === 'house' || bp.category === 'structure') {
            const bx = wrapX(tx + (Math.random() - 0.5) * 90);
            const by = Math.max(1450, Math.min(WORLD_H - 220, ty + (Math.random() - 0.5) * 70));
            const isStruct = bp.category === 'structure';
            const hpTotal = (isStruct ? 1200 : 580) + (hasStone ? 350 : 0) + (hasMetal ? 450 : 0);
            this.buildings.push({
                id: this.nextId++,
                type: isStruct ? 'wonder' : 'hut',
                name: bp.name,
                icon: bp.icon,
                x: bx,
                y: by,
                hp: hpTotal,
                maxHp: hpTotal,
                radius: isStruct ? 36 : 28,
                owner: (u && u.tribeId) ? u.tribeId : 'player',
                customColor: bp.color,
                auraColor: (hasCrystal || hasGold) ? bp.color : null,
                components: comps,
                blueprintId: bp.id,
                progress: this.freeBuildMode ? 1.0 : 0.15,
                shootTimer: 0
            });
            this.parryRings.push({ x: bx, y: by, radius: 10, maxRadius: 85, color: bp.color, life: 0.55 });
            this.spawnFloatText(bx, by - 42, `${bp.icon} ${bp.name}!`, bp.color);
            if (!builderUnit) {
                this.sfx.play('kalimba');
                this.showBanner(bp.icon, `Started Blueprint ${bp.name} (${comps.join(' + ')})!`);
            }
        } else if (bp.category === 'tool') {
            const targets = builderUnit
                ? [builderUnit]
                : (this.selectedIds.length > 0 ? this.villagers.filter(v => this.selectedIds.includes(v.id)) : [u].filter(Boolean));
            const atkBonus = 12 + (hasMetal ? 14 : 0) + (hasCrystal ? 12 : 0) + (hasGears ? 8 : 0);
            targets.forEach(unit => {
                unit.customTool = { name: bp.name, icon: bp.icon, color: bp.color, components: comps };
                unit.personalGearLevel = (unit.personalGearLevel || 1) + 1;
                unit.atk = (unit.atk || 20) + atkBonus;
                unit.thoughtBubble = `${bp.icon} Crafted ${bp.name}!`;
                unit.thoughtTimer = 3.5;
                this.spawnFloatText(unit.x, unit.y - 34, `${bp.icon} ${bp.name}`, bp.color);
            });
            if (!builderUnit) {
                this.sfx.play('ring');
                this.updateInspector();
                this.showBanner(bp.icon, `Crafted Blueprint Tool "${bp.name}" (+${atkBonus} ATK) for ${targets.length} human(s)!`);
            }
        } else if (bp.category === 'magic') {
            const targets = builderUnit
                ? [builderUnit]
                : (this.selectedIds.length > 0 ? this.villagers.filter(v => this.selectedIds.includes(v.id)) : [u].filter(Boolean));
            const magicDmg = 100 + (hasCrystal ? 80 : 0) + (hasGold ? 45 : 0);
            targets.forEach(unit => {
                unit.customMagic = { name: bp.name, icon: bp.icon, color: bp.color, components: comps };
                unit.bender = unit.bender || 'energy';
                unit.thoughtBubble = `${bp.icon} ${bp.name}!`;
                unit.thoughtTimer = 3.6;
            });
            this.parryRings.push({ x: tx, y: ty, radius: 14, maxRadius: 175, color: bp.color, life: 0.75 });
            for (let i = 0; i < 16; i++) {
                const ang = (i / 16) * Math.PI * 2;
                this.clashSparks.push({
                    x: wrapX(tx + Math.cos(ang) * 24),
                    y: ty + Math.sin(ang) * 18,
                    vx: Math.cos(ang) * 140,
                    vy: Math.sin(ang) * 100,
                    color: bp.color,
                    life: 0.55
                });
            }
            this.enemies.forEach(e => {
                if (!e.controlledByRing && wrappedDist(tx, ty, e.x, e.y) < 195) {
                    e.hp -= magicDmg;
                    e.hitFlash = 0.25;
                }
            });
            this.villagers.forEach(v => {
                if (wrappedDist(tx, ty, v.x, v.y) < 195) {
                    v.hp = Math.min(v.maxHp, v.hp + 120);
                    v.joy = Math.min(100, v.joy + 15);
                }
            });
            this.spawnFloatText(tx, ty - 48, `${bp.icon} ${bp.name.toUpperCase()}!`, bp.color);
            if (!builderUnit) {
                this.sfx.play('ring');
                this.updateInspector();
                this.showBanner(bp.icon, `Cast Blueprint Magic "${bp.name}" (${magicDmg} DMG)!`);
            }
        } else if (bp.category === 'machine') {
            this.siegeEngines.push({
                id: this.nextId++,
                type: hasGears ? 'trebuchet' : 'ram',
                name: bp.name,
                icon: bp.icon,
                customColor: bp.color,
                x: wrapX(tx + 42),
                y: ty,
                shootTimer: 0
            });
            this.parryRings.push({ x: tx + 42, y: ty, radius: 10, maxRadius: 75, color: bp.color, life: 0.5 });
            this.spawnFloatText(tx + 42, ty - 34, `${bp.icon} ${bp.name}!`, bp.color);
            if (!builderUnit) {
                this.sfx.play('horn');
                this.showBanner(bp.icon, `Assembled Blueprint Machine: ${bp.name}!`);
            }
        }

        bp.builtCount = (bp.builtCount || 0) + 1;
        if (!builderUnit) {
            this.updateHUD();
            if (typeof this.renderBlueprintLibrary === 'function') this.renderBlueprintLibrary();
        }
    }

    createCustomEntity({ category = 'house', name = 'Custom Creation', icon = '✨', color = '#38bdf8', components = ['timber', 'stone'] } = {}) {
        const bp = this.designBlueprint({ category, name, icon, color, components });
        this.buildFromBlueprint(bp.id);
    }

    terraformingAction() {
        const u = this.getSelectedUnit();
        const tx = u ? u.x : this.cam.x;
        this.stoneBridges.push({ x: tx, y: RIVER_Y });
        this.cliffRamps.push({ x: tx, y: 1680 });
        this.sfx.play('horn');
        this.showBanner('🪨', 'Earthbending Terraforming raised a Stone River Causeway & Highland Staircase Ramp!');
    }

    // ECONOMY, PERSONAL WALLETS & TAXATION METHODS

    updateCharacterEmotionState(u) {
        if (u.isT101s) {
            u.emotionIcon = '👑';
            u.emotionLabel = 'Sovereign';
            return;
        }
        if (u.fear > 60) {
            u.emotionIcon = '😨';
            u.emotionLabel = 'Terrified';
        } else if (u.anger > 68 || u.loyalty < 28) {
            u.emotionIcon = '😡';
            u.emotionLabel = 'Rebellious';
        } else if (u.ambition > 82 && u.walletGold >= 50) {
            u.emotionIcon = '🤩';
            u.emotionLabel = 'Visionary';
        } else if (u.joy > 75) {
            u.emotionIcon = '😄';
            u.emotionLabel = 'Joyful';
        } else if (u.joy < 38 || u.hunger > 75) {
            u.emotionIcon = '😤';
            u.emotionLabel = 'Frustrated';
        } else if (u.partnerName) {
            u.emotionIcon = '❤️';
            u.emotionLabel = 'Devoted';
        } else {
            u.emotionIcon = '😌';
            u.emotionLabel = 'Content';
        }
    }

    hostGrandFestival() {
        if (this.resources.food < 50) {
            this.showBanner('⚠️', 'Need 50🍖 Sabre-Rib Food to host a Grand Tribal Festival!');
            return;
        }
        this.resources.food -= 50;
        this.villagers.forEach(u => {
            u.joy = Math.min(100, (u.joy || 70) + 32);
            u.loyalty = Math.min(100, (u.loyalty || 70) + 28);
            u.anger = Math.max(0, (u.anger || 0) - 35);
            u.hunger = 0;
            u.dodgeType = 'backflip';
            u.dodgeAnim = 0.6;
            u.thoughtBubble = '🎉 Grand Festival Joy!';
            u.thoughtTimer = 3.8;
            this.updateCharacterEmotionState(u);
        });
        this.sfx.play('horn');
        this.updateHUD();
        this.renderEmotionsPanel();
        this.showBanner('🎉', 'Hosted a Grand Tribal Festival! All citizens danced, feasted & gained +30% Joy and Loyalty!');
    }

    citizenFoundsNewTribe(founder) {
        if (!founder || founder.isT101s) {
            const candidate = this.villagers.find(v => !v.isT101s);
            if (!candidate) return;
            founder = candidate;
        }
        const clanAdjectives = ['Star-Fang', 'Golden-Sun', 'Emerald-Peak', 'Thunder-Tusk', 'Shadow-Lotus', 'Sky-Spear', 'Obsidian-Crown', 'Wild-River'];
        const clanNouns = ['Free Clan', 'Republic', 'Order', 'Brotherhood', 'Tribe', 'Dominion', 'Covenant'];
        const palette = ['#ec4899', '#8b5cf6', '#06b6d4', '#10b981', '#eab308', '#f97316'];
        const icons = ['🏕️', '🦅', '🐺', '🌟', '⚡', '🌺'];

        const newId = 100 + this.aiPlayers.length + 1;
        const adj = clanAdjectives[Math.floor(Math.random() * clanAdjectives.length)];
        const noun = clanNouns[Math.floor(Math.random() * clanNouns.length)];
        const tribeName = `${adj} ${noun}`;
        const color = palette[this.aiPlayers.length % palette.length];
        const icon = icons[this.aiPlayers.length % icons.length];

        const founderX = wrapX(founder.x + (Math.random() > 0.5 ? 280 : -280));
        const founderY = Math.max(1520, Math.min(2580, founder.y + (Math.random() - 0.5) * 180));

        const newTribe = {
            id: newId,
            name: `Chieftain ${founder.name.split('-')[0]}`,
            tribe: tribeName,
            cont: this.getContinentAt(founderX).id,
            stance: founder.anger > 65 ? 'hostile' : 'allied',
            color,
            icon,
            x: founderX,
            y: founderY,
            ageLevel: this.ageLevel,
            gold: Math.max(80, Math.round(founder.walletGold || 60)),
            tributeTimer: 12,
            isCitizenFounded: true
        };
        this.aiPlayers.push(newTribe);
        this.totalTribesFounded++;
        this.addChronicle('empires', `Rise of ${tribeName}`, `${founder.name} departed and founded ${tribeName} at (${Math.round(founderX)}, ${Math.round(founderY)}) in Year ${this.worldYear}.`);

        // Build the new Tribe's Capital Town Center & Watchtower
        this.buildings.push({
            id: this.nextId++,
            type: 'town_center',
            name: `${tribeName} Capital`,
            icon,
            x: founderX,
            y: founderY,
            hp: 1850,
            maxHp: 1850,
            radius: 50,
            owner: newId,
            customColor: color,
            shootTimer: 0
        });
        this.buildings.push({
            id: this.nextId++,
            type: 'hut',
            name: `${tribeName} Lodge`,
            icon: '🛖',
            x: wrapX(founderX + 68),
            y: founderY + 24,
            hp: 520,
            maxHp: 520,
            radius: 28,
            owner: newId,
            customColor: color,
            shootTimer: 0
        });

        founder.tribeId = newId;
        founder.tribeName = tribeName;
        founder.tribeColor = color;
        founder.x = founderX;
        founder.y = founderY + 38;
        founder.joy = 98;
        founder.ambition = 100;
        founder.anger = 0;
        founder.mindDesire = `👑 Founder Chieftain of ${tribeName}`;
        founder.thoughtBubble = `🏕️ I founded ${tribeName}!`;
        founder.thoughtTimer = 5.0;
        this.updateCharacterEmotionState(founder);

        // Invite 1-2 friends or spouse to join the newly founded tribe
        const followers = this.villagers
            .filter(v => !v.isT101s && v.id !== founder.id && (v.partnerName === founder.name || wrappedDist(v.x, v.y, founder.x, founder.y) < 260))
            .slice(0, 2);
        followers.forEach((f, idx) => {
            f.tribeId = newId;
            f.tribeName = tribeName;
            f.tribeColor = color;
            f.targetX = wrapX(founderX + (idx === 0 ? -42 : 42));
            f.targetY = founderY + 40;
            f.mindDesire = `${icon} Joined ${tribeName}`;
            f.thoughtBubble = `🏕️ Joining ${founder.name}'s Tribe!`;
            f.thoughtTimer = 4.2;
        });

        this.parryRings.push({ x: founderX, y: founderY, radius: 12, maxRadius: 140, color, life: 0.75 });
        this.spawnFloatText(founderX, founderY - 48, `🏕️ NEW TRIBE: ${tribeName.toUpperCase()}!`, color);
        this.sfx.play('horn');
        this.updateHUD();
        this.renderEmotionsPanel();
        this.renderDiplomacyPanel();
        this.showBanner('🏕️', `${founder.name} exercised Free Will and founded a brand-new civilization: ${icon} ${tribeName}!`);
    }

    citizenJoinsAnotherTribe(u, targetTribe = null) {
        if (!u || u.isT101s || this.aiPlayers.length === 0) return;
        const chosen = targetTribe || this.aiPlayers[Math.floor(Math.random() * this.aiPlayers.length)];
        if (!chosen) return;

        u.tribeId = chosen.id;
        u.tribeName = chosen.tribe;
        u.tribeColor = chosen.color;
        u.targetX = wrapX(chosen.x + (Math.random() - 0.5) * 90);
        u.targetY = chosen.y + 45;
        u.joy = Math.min(100, (u.joy || 60) + 25);
        u.anger = Math.max(0, (u.anger || 0) - 30);
        u.loyalty = 80;
        u.mindDesire = `🚶 Migrated to ${chosen.icon} ${chosen.tribe}`;
        u.thoughtBubble = `🚶 Joining ${chosen.tribe}!`;
        u.thoughtTimer = 4.5;
        this.totalTribeMigrations++;
        this.updateCharacterEmotionState(u);
        this.spawnFloatText(u.x, u.y - 36, `🚶 JOINED ${chosen.tribe.toUpperCase()}!`, chosen.color);
        this.updateHUD();
        this.renderEmotionsPanel();
        this.showBanner('🚶', `${u.name} decided to join ${chosen.icon} ${chosen.tribe} (${u.emotionLabel})!`);
    }

    commandSelectedToFoundTribe() {
        let u = this.getSelectedUnit();
        if (!u || u.isT101s) {
            u = this.villagers.find(v => !v.isT101s);
        }
        if (u) this.citizenFoundsNewTribe(u);
    }

    commandSelectedToJoinAnotherTribe() {
        let u = this.getSelectedUnit();
        if (!u || u.isT101s) {
            u = this.villagers.find(v => !v.isT101s);
        }
        if (u) this.citizenJoinsAnotherTribe(u);
    }

    triggerRandomFreeWillAction() {
        const candidates = this.villagers.filter(v => !v.isT101s);
        if (candidates.length === 0) return;
        const u = candidates[Math.floor(Math.random() * candidates.length)];
        const roll = Math.random();
        if (roll < 0.34) {
            this.citizenFoundsNewTribe(u);
        } else if (roll < 0.65) {
            this.citizenJoinsAnotherTribe(u);
        } else {
            this.totemMonuments.push({
                x: wrapX(u.x + 24),
                y: u.y,
                creator: u.name,
                color: u.tribeColor || '#facc15'
            });
            u.thoughtBubble = '🗿 Carved Spirit Totem!';
            u.thoughtTimer = 4.0;
            u.mindDesire = '🗿 Sculpted a Prehistoric Totem Monument';
            this.cam.targetX = u.x;
            this.cam.targetY = u.y;
            this.showBanner('🗿', `${u.name} spontaneously sculpted a Spirit Totem Monument!`);
        }
        this.renderEmotionsPanel();
    }


    saveEmpireState() {
        try {
            const data = {
                resources: this.resources,
                ageLevel: this.ageLevel,
                taxRate: this.taxRate,
                totalTaxesCollected: this.totalTaxesCollected,
                empirePopBillions: this.empirePopBillions
            };
            localStorage.setItem('prehistoric_tribes_save_v1', JSON.stringify(data));
            this.showBanner('💾', 'Saved Planetary Empire, Treasury & Citizen Economy!');
        } catch (e) {}
    }

    loadEmpireState() {
        try {
            const raw = localStorage.getItem('prehistoric_tribes_save_v1');
            if (!raw) {
                this.showBanner('📂', 'No saved Empire found yet — click 💾 Save anytime!');
                return;
            }
            const data = JSON.parse(raw);
            if (data.resources) this.resources = data.resources;
            if (typeof data.ageLevel === 'number') this.ageLevel = data.ageLevel;
            if (typeof data.taxRate === 'number') this.taxRate = data.taxRate;
            if (typeof data.totalTaxesCollected === 'number') this.totalTaxesCollected = data.totalTaxesCollected;
            if (typeof data.empirePopBillions === 'number') this.empirePopBillions = data.empirePopBillions;
            const lbl = document.getElementById('taxRateBtnLabel');
            if (lbl) lbl.textContent = Math.round(this.taxRate * 100) + '%';
            this.updateHUD();
            this.renderEconomyPanel();
            this.showBanner('📂', 'Restored Planetary Empire State!');
        } catch (e) {}
    }


    evaluateAutonomousMind(u) {
        if (!this.globalFreeWill || u.directOrderTimer > 0) return;

        // Update Emotional Drivers based on Taxes, Hunger, Friends & Wealth
        if (!u.isT101s) {
            if (this.taxRate >= 0.35) {
                u.anger = Math.min(100, (u.anger || 0) + 6);
                u.loyalty = Math.max(5, (u.loyalty || 75) - 5);
                u.joy = Math.max(10, (u.joy || 70) - 4);
            } else if (this.taxRate <= 0.10) {
                u.joy = Math.min(100, (u.joy || 70) + 4);
                u.loyalty = Math.min(100, (u.loyalty || 75) + 3);
                u.anger = Math.max(0, (u.anger || 0) - 4);
            }
            if (u.hunger > 70) {
                u.joy = Math.max(5, (u.joy || 70) - 5);
                u.anger = Math.min(100, (u.anger || 0) + 4);
            }
            u.ambition = Math.min(100, (u.ambition || 50) + (Math.random() * 3 - 0.8));
            this.updateCharacterEmotionState(u);

            // EMERGENT FREE WILL 1: Start a Brand-New Tribe if Visionary/Ambitious or Rebellious
            if (((u.ambition > 86 && u.walletGold >= 65) || (u.anger > 78 && u.loyalty < 30)) && this.aiPlayers.length < 14 && Math.random() < 0.08) {
                this.citizenFoundsNewTribe(u);
                return;
            }

            // EMERGENT FREE WILL 2: Join Another Tribe if frustrated, curious, or drawn to another culture
            if (((u.loyalty < 42 && u.anger > 52) || (u.archetype?.id === 'explorer' && Math.random() < 0.09)) && Math.random() < 0.12) {
                this.citizenJoinsAnotherTribe(u);
                return;
            }

            // EMERGENT FREE WILL 3: Do Anything Sandbox (Build Private Hut, Carve Totem, Play Music, Caravan Trade)
            if (Math.random() < 0.14) {
                const sandboxChoice = Math.random();
                if (sandboxChoice < 0.25 && u.walletGold >= 55 && this.buildings.length < 75) {
                    u.walletGold -= 30;
                    const hx = wrapX(u.x + (Math.random() - 0.5) * 80);
                    const hy = Math.max(1450, Math.min(2620, u.y + (Math.random() - 0.5) * 65));
                    this.buildings.push({
                        id: this.nextId++,
                        type: 'hut',
                        name: `${u.name.split('-')[0]}'s Villa`,
                        icon: '🏡',
                        x: hx,
                        y: hy,
                        hp: 520,
                        maxHp: 520,
                        radius: 28,
                        owner: u.tribeId || 'player',
                        customColor: u.tribeColor,
                        shootTimer: 0
                    });
                    u.joy = Math.min(100, u.joy + 20);
                    u.mindDesire = '🏡 Built a Private Homestead Villa';
                    u.thoughtBubble = '🏡 Built My Own Home!';
                    u.thoughtTimer = 3.5;
                    return;
                } else if (sandboxChoice < 0.50 && this.totemMonuments.length < 36) {
                    this.totemMonuments.push({
                        x: wrapX(u.x + (Math.random() - 0.5) * 30),
                        y: u.y,
                        creator: u.name,
                        color: u.tribeColor || '#facc15'
                    });
                    u.joy = Math.min(100, u.joy + 14);
                    u.mindDesire = '🗿 Carved a Tribal Spirit Totem';
                    u.thoughtBubble = '🎨 Created Tribal Art!';
                    u.thoughtTimer = 3.2;
                    return;
                } else if (sandboxChoice < 0.72 && this.blueprints && this.blueprints.length > 0) {
                    const bp = this.blueprints[Math.floor(Math.random() * this.blueprints.length)];
                    if ((bp.category === 'house' || bp.category === 'structure') && this.buildings.length >= 160) return;
                    if (bp.category === 'machine' && this.siegeEngines.length >= 24) return;
                    this.buildFromBlueprint(bp.id, u);
                    u.joy = Math.min(100, u.joy + 16);
                    u.mindDesire = `${bp.icon} Building Blueprint: ${bp.name}`;
                    u.thoughtBubble = `${bp.icon} ${bp.name}!`;
                    u.thoughtTimer = 3.2;
                    return;
                } else if (sandboxChoice < 0.85) {
                    u.joy = Math.min(100, u.joy + 18);
                    u.dodgeType = 'backflip';
                    u.dodgeAnim = 0.55;
                    u.mindDesire = '🎶 Playing Tribal Flute & Dancing';
                    u.thoughtBubble = '🎶 Music & Dance!';
                    u.thoughtTimer = 3.0;
                    return;
                } else if (this.aiPlayers.length > 0) {
                    const tradePartner = this.aiPlayers[Math.floor(Math.random() * this.aiPlayers.length)];
                    u.targetX = tradePartner.x;
                    u.targetY = tradePartner.y + 35;
                    u.walletGold += 14;
                    u.mindDesire = `⚖️ Trading Caravan to ${tradePartner.tribe}`;
                    u.thoughtBubble = `⚖️ Trading with ${tradePartner.tribe}!`;
                    u.thoughtTimer = 3.4;
                    return;
                }
            }
        }

        // 1. Check nearby hostile raiders first
        let nearEnemy = null;
        let bestD = 320;
        for (let i = 0; i < this.enemies.length; i++) {
            const e = this.enemies[i];
            if (e.controlledByRing) continue;
            const d = wrappedDist(u.x, u.y, e.x, e.y);
            if (d < bestD) {
                bestD = d;
                nearEnemy = e;
            }
        }
        if (nearEnemy) {
            u.targetEntity = nearEnemy;
            u.mindDesire = `⚔️ Defending against ${nearEnemy.name}`;
            u.thoughtBubble = '⚔️ For the Tribe!';
            u.thoughtTimer = 2.0;
            return;
        }

        // 2. Hungry -> visit Sabre-Rib Kitchen
        if (u.hunger > 68) {
            const kitchen = this.buildings.find(b => b.type === 'kitchen');
            if (kitchen) {
                u.targetX = kitchen.x + (Math.random() - 0.5) * 35;
                u.targetY = kitchen.y + 22;
                u.hunger = 10;
                u.hp = Math.min(u.maxHp, u.hp + 35);
                u.mindDesire = '🍖 Feasting at Sabre-Rib Kitchen';
                u.thoughtBubble = '🍖 Tasty Sabre-Ribs!';
                u.thoughtTimer = 2.5;
                return;
            }
        }

        // 3. Wealthy Citizen (>85 Gold) -> Upgrade Personal Gear or Build Villa
        if (u.walletGold >= 85 && u.gearLevel < 5) {
            u.walletGold -= 40;
            u.gearLevel++;
            u.attack += 6;
            u.maxHp += 25;
            u.hp = u.maxHp;
            u.mindDesire = `⚒️ Forged Personal Gear Lv.${u.gearLevel}`;
            u.thoughtBubble = `⚒️ Upgraded Gear Lv.${u.gearLevel}!`;
            u.thoughtTimer = 3.0;
            return;
        }

        // 4. Socializing & Martial Sparring
        if (u.socialNeed > 65) {
            const friend = this.villagers[Math.floor(Math.random() * this.villagers.length)];
            if (friend && friend.id !== u.id) {
                u.targetX = friend.x + 22;
                u.targetY = friend.y;
                u.socialNeed = 10;
                if (!u.partnerName && Math.random() < 0.25) {
                    u.partnerName = friend.name;
                    u.mindDesire = `❤️ Bonded with ${friend.name}`;
                    u.thoughtBubble = `❤️ Family with ${friend.name}!`;
                } else {
                    u.mindDesire = `🥋 Sparring & Chatting with ${friend.name}`;
                    u.thoughtBubble = `🤝 Hail ${friend.name}!`;
                }
                u.thoughtTimer = 2.6;
                return;
            }
        }

        // 5. Default Autonomous Profession & Resource Gathering
        if (this.resourcesNodes.length > 0) {
            const node = this.resourcesNodes[Math.floor(Math.random() * this.resourcesNodes.length)];
            if (wrappedDist(u.x, u.y, node.x, node.y) < 520) {
                u.targetX = node.x + (Math.random() - 0.5) * 24;
                u.targetY = node.y + (Math.random() - 0.5) * 18;
                u.mindDesire = `${u.profIcon} Working as ${u.profession}`;
                return;
            }
        }
        u.targetX = wrapX(u.x + (Math.random() - 0.5) * 190);
        u.targetY = Math.max(1420, Math.min(2680, u.y + (Math.random() - 0.5) * 140));
    }

    performUnitAttack(u, target) {
        if (!target || target.hp <= 0) return;
        u.attackCooldown = u.lightningSpeed ? 0.24 : 0.68;
        u.comboStep = ((u.comboStep || 0) + 1) % 3;
        u.swingAnim = 0.45;
        u.facing = wrapDX(u.x, target.x) >= 0 ? 1 : -1;

        const highGroundBonus = this.getTerrainElevation(u.x, u.y) > this.getTerrainElevation(target.x, target.y) ? 1.25 : 1.0;
        const cometMult = this.greatCometTimer > 0 && (u.hasOneRing || u.bender === 'fire' || u.bender === 'avatar') ? 2.5 : 1.0;
        let weatherMult = 1.0;
        if (this.weatherMode === 1 && u.bender === 'water') weatherMult = 1.35;
        if (this.weatherMode === 2 && u.bender === 'fire') weatherMult = 1.35;
        if (this.weatherMode === 4 && u.hasOneRing) weatherMult = 1.5;

        const dmg = u.attack * highGroundBonus * cometMult * weatherMult * (u.comboStep === 2 ? 1.45 : 1.0);

        if (u.fightingStyle === 'archery') {
            const kind = u.comboStep === 2 ? 'phoenix' : (u.comboStep === 1 ? 'gale' : 'broadhead');
            this.spawnParabolicArrow(u, target.x, target.y, kind, target);
            this.sfx.play('bow');
            return;
        }

        // Crescent Slash Ribbon & Clash Sparks
        this.slashRibbons.push({
            x: u.x + u.facing * 18,
            y: u.y - 12,
            facing: u.facing,
            color: u.hasOneRing ? '#f43f5e' : (FIGHTING_STYLES[u.fightingStyle]?.color || '#fbbf24'),
            life: 0.26
        });
        for (let s = 0; s < 5; s++) {
            this.clashSparks.push({
                x: target.x,
                y: target.y - 14,
                vx: (Math.random() - 0.5) * 140,
                vy: -40 - Math.random() * 90,
                color: '#fde047',
                life: 0.32
            });
        }

        // Non-Lethal Bloodbending Control for the Ring-Bearer
        if (u.hasOneRing && this.ringControlSpareMode && !target.isBoss && target.hp - dmg <= 35) {
            target.controlledByRing = true;
            target.hp = target.maxHp;
            this.spawnFloatText(target.x, target.y - 34, '👑 BLOOD-CONTROLLED PUPPET!', '#fde047');
            this.sfx.play('ring');
            this.updateInspector();
            return;
        }

        target.hp -= dmg;
        target.hitFlash = 0.18;
        const kbForce = (u.hasOneRing || u.isT101s ? 240 : 145) * (u.comboStep === 2 ? 1.4 : 1.0);
        this.applyKnockback(target, u.x, u.y, kbForce);

        if (target.hp <= 0) {
            u.kills = (u.kills || 0) + 1;
            const bounty = target.isBoss ? 180 : 16;
            u.walletGold = (u.walletGold || 0) + bounty;
            this.resources.gold += Math.round(bounty * 0.5);
            if (target.isBoss) {
                this.housedRelics++;
                this.showBanner('🏆', `${u.name} slew ${target.name} & claimed an Ancient Relic (+${bounty}🪙)!`);
                this.addChronicle('heroes', `${u.name} Slew ${target.name}`, `At age ${Math.floor(u.age || 20)}, ${u.name} vanquished the mighty ${target.name} in single combat (Total kills: ${u.kills}).`);
            } else if (u.kills === 5 || u.kills === 15) {
                this.addChronicle('heroes', `Legend of ${u.name}`, `${u.name} (${u.tribeName || 'Aethelgard'}) has felled ${u.kills} foes in battle, earning renown across the continents.`);
            }
            this.handleUnitDeath(target, `Slain by ${u.name}`, u, true);
            this.updateHUD();
        }
    }

    addChronicle(bookKey, title, story) {
        if (!this.chronicles[bookKey]) this.chronicles[bookKey] = [];
        this.chronicles[bookKey].unshift({
            year: this.worldYear || 1,
            title,
            story
        });
        if (this.chronicles[bookKey].length > 80) {
            this.chronicles[bookKey].length = 80;
        }
    }

    getRingBearer() {
        if (!this.oneRing || this.oneRing.bearerId === null) return null;
        return this.villagers.find(v => v.id === this.oneRing.bearerId)
            || this.enemies.find(e => e.id === this.oneRing.bearerId)
            || null;
    }

    equipOneRing(unit, reason = 'Claimed the One Ring', silent = false) {
        if (!unit || unit.hp <= 0) return;
        const prev = this.getRingBearer();
        if (prev && prev.id !== unit.id) {
            this.removeOneRing(`Passed to ${unit.name}`, true);
        }
        if (!unit._preRingStats) {
            unit._preRingStats = {
                attack: unit.attack || 20,
                maxHp: unit.maxHp || 200,
                fightingStyle: unit.fightingStyle || 'berserker',
                bender: unit.bender || null,
                lightningSpeed: false,
                skySoar: false
            };
        }
        unit.hasOneRing = true;
        unit.maxHp = Math.round(unit._preRingStats.maxHp * 2.8);
        unit.hp = Math.min(unit.maxHp, unit.hp + Math.round(unit.maxHp * 0.45));
        unit.attack = Math.round(unit._preRingStats.attack * 2.8);
        unit.fightingStyle = 'onering';
        unit.bender = 'avatar';
        unit.lightningSpeed = true;
        unit.skySoar = true;
        this.oneRing.bearerId = unit.id;
        this.oneRing.dropped = false;
        this.oneRing.x = unit.x;
        this.oneRing.y = unit.y;
        this.oneRing.history.unshift({ year: this.worldYear, text: `${unit.name}: ${reason}` });
        this.addChronicle('ring', `${unit.name} Claims the One Ring`, `In Year ${this.worldYear}, ${unit.name} (${unit.tribeName || (unit.isBoss ? 'World Boss' : 'Rival Raider')}) placed the One Ring upon their hand (${reason}).`);
        if (!silent) {
            this.parryRings.push({ x: unit.x, y: unit.y, radius: 12, maxRadius: 110, color: '#facc15', life: 0.55 });
            this.spawnFloatText(unit.x, unit.y - 36, `💍 ${unit.name} CLAIMS THE ONE RING!`, '#fde047');
            this.showBanner('💍', `${unit.name} now wields the One Ring! (${reason})`);
            this.sfx.play('ring');
        }
        this.updateInspector();
    }

    removeOneRing(reason = 'Removed from hand', silent = false) {
        const bearer = this.getRingBearer();
        if (!bearer) return;
        if (bearer._preRingStats) {
            bearer.maxHp = bearer._preRingStats.maxHp;
            bearer.hp = Math.min(bearer.hp, bearer.maxHp);
            bearer.attack = bearer._preRingStats.attack;
            bearer.fightingStyle = bearer._preRingStats.fightingStyle;
            bearer.bender = bearer._preRingStats.bender;
            bearer.lightningSpeed = false;
            bearer.skySoar = false;
        }
        bearer.invincible = false;
        bearer.hasOneRing = false;
        this.oneRing.bearerId = null;
        this.oneRing.dropped = true;
        this.oneRing.x = bearer.x;
        this.oneRing.y = bearer.y;
        this.addChronicle('ring', `Ring Removed from ${bearer.name}`, `In Year ${this.worldYear}, the One Ring left ${bearer.name}'s hand (${reason}) and fell at (${Math.round(bearer.x)}, ${Math.round(bearer.y)}).`);
        if (!silent) {
            this.spawnFloatText(bearer.x, bearer.y - 30, '💍 Ring Dropped!', '#facc15');
            this.showBanner('💍', `The One Ring was removed from ${bearer.name} (${reason})!`);
        }
        this.updateInspector();
    }

    toggleRingOnSelected() {
        const u = this.getSelectedUnit();
        if (!u) {
            this.showBanner('💍', 'Select a living unit first to equip or remove the One Ring!');
            return;
        }
        if (u.hasOneRing) {
            this.removeOneRing('Voluntarily removed by Sovereign command');
        } else {
            this.equipOneRing(u, 'Bestowed upon a chosen bearer');
        }
    }

    handleUnitDeath(u, cause = 'Fell in battle', killer = null, isEnemy = false) {
        if (!u || u._deadHandled) return;
        u._deadHandled = true;
        if (u.hasOneRing) {
            this.removeOneRing(cause, true);
            this.parryRings.push({ x: u.x, y: u.y, radius: 14, maxRadius: 130, color: '#facc15', life: 0.7 });
            this.showBanner('💀', `${u.name} fell (${cause}) — the One Ring lies unclaimed on the ground!`);
        }
        const ageStr = `${Math.floor(u.age || 20)} years`;
        if (u.isT101s) {
            this.addChronicle('heroes', `Fall of Hero t101s`, `After ${ageStr}, Sovereign t101s died (${cause}) with ${u.kills || 0} victories. Thus the true story of the Ring-Wars begins!`);
            this.showBanner('💀', `HERO FALLEN: t101s died (${cause})! The One Ring is up for grabs — a new legend begins!`);
        } else if (u.hasOneRing || (u.kills || 0) >= 3 || u.isBoss) {
            this.addChronicle('heroes', `Death of ${u.name}`, `${u.name} (${isEnemy ? 'Foe' : (u.tribeName || 'Aethelgard')}) perished at age ${ageStr} (${cause}) with ${u.kills || 0} kills.`);
        }
        if (!isEnemy && u.tribeId && u.tribeId !== 'player') {
            const remaining = this.villagers.filter(v => !v._deadHandled && v.tribeId === u.tribeId).length;
            if (remaining === 0) {
                this.addChronicle('empires', `Fall of ${u.tribeName}`, `The last citizen of ${u.tribeName} perished in Year ${this.worldYear}, passing into history.`);
            }
        }
    }

    applyKnockback(entity, fromX, fromY, force) {
        if (!entity) return;
        let dx = wrapDX(fromX, entity.x);
        let dy = entity.y - fromY;
        let d = Math.hypot(dx, dy);
        if (d < 1) {
            dx = 1;
            dy = 0;
            d = 1;
        }
        const scale = force / (entity.isBoss ? 2.4 : 1.0);
        entity.kx = (entity.kx || 0) + (dx / d) * scale;
        entity.ky = (entity.ky || 0) + (dy / d) * scale;
    }

    resolveUnitPhysics(u, dt, isEnemy = false) {
        if (u.kx || u.ky) {
            u.x = wrapX(u.x + (u.kx || 0) * dt);
            u.y = Math.max(1320, Math.min(WORLD_H - 160, u.y + (u.ky || 0) * dt));
            const damp = Math.max(0, 1 - dt * 8);
            u.kx = Math.abs((u.kx || 0) * damp) < 1 ? 0 : u.kx * damp;
            u.ky = Math.abs((u.ky || 0) * damp) < 1 ? 0 : u.ky * damp;
        }

        const nearby = this.spatialGrid.query(u.x, u.y, 90);
        for (let j = 0; j < nearby.length; j++) {
            const other = nearby[j];
            if (other === u) continue;
            if (other._isBuilding) {
                if (u.skySoar) continue;
                const bRadius = (other.radius || 32) * 0.72;
                const dx = wrapDX(other.x, u.x);
                const dy = u.y - other.y;
                const d = Math.hypot(dx, dy);
                if (d < bRadius) {
                    if (d < 0.01) {
                        u.y = Math.max(1320, Math.min(WORLD_H - 160, u.y + bRadius));
                    } else {
                        u.x = wrapX(other.x + (dx / d) * bRadius);
                        u.y = Math.max(1320, Math.min(WORLD_H - 160, other.y + (dy / d) * bRadius));
                    }
                }
            } else {
                const minDist = (u.isBoss || other.isBoss) ? 28 : 18;
                const dx = wrapDX(other.x, u.x);
                const dy = u.y - other.y;
                const d = Math.hypot(dx, dy);
                if (d > 0.01 && d < minDist) {
                    const push = (minDist - d) * 0.45;
                    u.x = wrapX(u.x + (dx / d) * push);
                    u.y = Math.max(1320, Math.min(WORLD_H - 160, u.y + (dy / d) * push));
                } else if (d <= 0.01) {
                    u.x = wrapX(u.x + (isEnemy ? -2 : 2));
                }
            }
        }
    }

    update(dt) {
        // Smooth WASD / Arrow camera panning (active even when simulation is paused)
        if (this.keysDown && this.keysDown.size > 0) {
            let panX = 0;
            let panY = 0;
            if (this.keysDown.has('a') || this.keysDown.has('arrowleft')) panX -= 1;
            if (this.keysDown.has('d') || this.keysDown.has('arrowright')) panX += 1;
            if (this.keysDown.has('w') || this.keysDown.has('arrowup')) panY -= 1;
            if (this.keysDown.has('s') || this.keysDown.has('arrowdown')) panY += 1;
            if (panX !== 0 || panY !== 0) {
                const boost = this.keysDown.has('shift') ? 2.0 : 1.0;
                if (this.globeMode) {
                    this.globeYaw -= panX * dt * 1.4 * boost;
                    this.globePitch = Math.max(-0.9, Math.min(0.9, this.globePitch + panY * dt * 1.1 * boost));
                } else {
                    if (this.cam.followSelected) {
                        this.cam.followSelected = false;
                        this.updateZoomHUD();
                    }
                    const spd = (680 / Math.max(0.25, this.cam.zoom)) * boost;
                    this.cam.targetX = wrapX(this.cam.targetX + panX * spd * dt);
                    this.cam.targetY = Math.max(1220, Math.min(WORLD_H - 180, this.cam.targetY + panY * spd * dt));
                }
            }
        }

        // Keep camera & globe interpolation responsive even while paused
        if (this.simSpeed === 0) {
            this.cam.zoom += (this.cam.targetZoom - this.cam.zoom) * Math.min(1, dt * 10);
            this.cam.x = wrapX(this.cam.x + wrappedDeltaX(this.cam.x, this.cam.targetX) * Math.min(1, dt * 10));
            this.cam.y += (this.cam.targetY - this.cam.y) * Math.min(1, dt * 10);
            return;
        }

        dt = Math.min(0.08, dt * this.simSpeed);
        this.time += dt;
        this.worldYear = Math.floor(1 + this.time / 12);

        // Advance 3-stage construction progress for any blueprints under construction
        for (let i = 0; i < this.buildings.length; i++) {
            const b = this.buildings[i];
            if (b.progress !== undefined && b.progress < 1.0) {
                b.progress = Math.min(1.0, b.progress + dt * 0.22);
                if (b.progress >= 1.0 && !b._completedBanner) {
                    b._completedBanner = true;
                    this.spawnFloatText(b.x, b.y - 45, `${b.icon} ${b.name} Complete!`, '#4ade80');
                }
            }
        }
        if (this.greatCometTimer > 0) this.greatCometTimer = Math.max(0, this.greatCometTimer - dt);
        if (this.globalTimeSlowTimer > 0) this.globalTimeSlowTimer = Math.max(0, this.globalTimeSlowTimer - dt);
        const enemyTimeScale = this.globalTimeSlowTimer > 0 ? 0.12 : 1.0;

        // Populate SpatialGrid for O(N) unit separation & building push-out
        this.spatialGrid.clear();
        for (let i = 0; i < this.villagers.length; i++) this.spatialGrid.insert(this.villagers[i]);
        for (let i = 0; i < this.enemies.length; i++) this.spatialGrid.insert(this.enemies[i]);
        for (let i = 0; i < this.buildings.length; i++) {
            const b = this.buildings[i];
            b._isBuilding = true;
            this.spatialGrid.insert(b);
        }

        // Procedural Kalimba & War-Drum Beat
        if (this.musicEnabled) {
            this.musicBeatTimer -= dt;
            if (this.musicBeatTimer <= 0) {
                this.musicBeatTimer = 0.55;
                this.sfx.play('kalimba');
            }
        }

        // Periodic Imperial Tax Collection Every 8 Seconds
        this.globalTaxTimer -= dt;
        if (this.globalTaxTimer <= 0) {
            this.globalTaxTimer = 8.0;
            if (this.taxRate > 0) {
                let cycleTax = 0;
                for (let i = 0; i < this.villagers.length; i++) {
                    const u = this.villagers[i];
                    if ((u.walletGold || 0) > 4) {
                        const t = Math.max(1, Math.round(u.walletGold * this.taxRate * 0.35));
                        u.walletGold -= t;
                        u.taxPaidTotal = (u.taxPaidTotal || 0) + t;
                        cycleTax += t;
                    }
                }
                if (cycleTax > 0) {
                    this.resources.gold += cycleTax;
                    this.totalTaxesCollected += cycleTax;
                    this.updateHUD();
                }
            }
        }

        // Generational Dynasty Births: Married Citizen Couples Welcome Apprentice Heirs
        this.generationalBirthTimer -= dt;
        if (this.generationalBirthTimer <= 0) {
            this.generationalBirthTimer = 14.0;
            if (this.villagers.length < this.maxBrowserAgents) {
                const parent = this.villagers.find(v => !v.isT101s && v.partnerName && (v.walletGold || 0) >= 36);
                if (parent) {
                    parent.walletGold -= 14;
                    const heir = this.createVillager(parent.x + 16, parent.y + 12, `${parent.name.split('-')[0]} Jr`, false);
                    heir.fightingStyle = parent.fightingStyle;
                    heir.bender = parent.bender;
                    heir.walletGold = 25;
                    heir.age = 0;
                    heir.childScale = 0.55;
                    heir.mindDesire = `👶 Apprentice Heir of ${parent.name}`;
                    heir.thoughtBubble = '👶 Born to the Tribe!';
                    heir.thoughtTimer = 4.0;
                    this.villagers.push(heir);
                    this.empirePopBillions = +(this.empirePopBillions + 0.04).toFixed(2);
                    this.updateHUD();
                }
            }
        }

        // Smooth Camera Follow & Interpolation
        const followedUnit = this.getSelectedUnit();
        if ((this.cam.followSelected || this.duelCamActive) && followedUnit && !this.globeMode) {
            this.cam.targetX = followedUnit.x;
            this.cam.targetY = followedUnit.y;
        }
        const dxCam = wrapDX(this.cam.x, this.cam.targetX);
        this.cam.x = wrapX(this.cam.x + dxCam * Math.min(1, dt * 8));
        this.cam.y += (this.cam.targetY - this.cam.y) * Math.min(1, dt * 8);
        this.cam.zoom += (this.cam.targetZoom - this.cam.zoom) * Math.min(1, dt * 8);

        // Update Citizens & Hero t101s
        for (let i = this.villagers.length - 1; i >= 0; i--) {
            const u = this.villagers[i];
            if (u.isShadowClone) {
                u.cloneLife -= dt;
                if (u.cloneLife <= 0) {
                    this.villagers.splice(i, 1);
                    continue;
                }
            }

            if (u.directOrderTimer > 0) u.directOrderTimer = Math.max(0, u.directOrderTimer - dt);
            if (u.thoughtTimer > 0) u.thoughtTimer = Math.max(0, u.thoughtTimer - dt);
            if (u.attackCooldown > 0) u.attackCooldown = Math.max(0, u.attackCooldown - dt);
            if (u.swingAnim > 0) u.swingAnim = Math.max(0, u.swingAnim - dt * 2.2);
            if (u.dodgeAnim > 0) u.dodgeAnim = Math.max(0, u.dodgeAnim - dt * 1.8);
            if (u.blockAnim > 0) u.blockAnim = Math.max(0, u.blockAnim - dt * 2.0);

            // Personal Needs, Aging, Child Growth & Natural/Combat Death
            u.age = (u.age ?? 20) + (dt / 12) * (u.hasOneRing ? 0.25 : 1.0);
            if (u.age < 18) {
                u.childScale = 0.55 + 0.45 * (u.age / 18);
            } else {
                u.childScale = 1.0;
            }
            if ((u.hp <= 0 && !u.invincible) || (!u.invincible && u.age >= (u.maxAge || 90))) {
                const cause = u.hp <= 0 ? 'Fell in battle' : 'Passed away peacefully of old age';
                this.handleUnitDeath(u, cause, null, false);
                this.villagers.splice(i, 1);
                continue;
            }
            if (this.oneRing.dropped && u.age >= 12) {
                const ringDist = wrappedDist(u.x, u.y, this.oneRing.x, this.oneRing.y);
                if (ringDist < 28) {
                    this.equipOneRing(u, 'Recovered from the battlefield');
                } else if (ringDist < 420 && !u.targetEntity && u.directOrderTimer <= 0) {
                    u.targetX = this.oneRing.x;
                    u.targetY = this.oneRing.y;
                    u.mindDesire = '💍 Rushing to claim the One Ring!';
                }
            }
            u.hunger = Math.min(100, (u.hunger || 0) + dt * 0.8);
            u.socialNeed = Math.min(100, (u.socialNeed || 0) + dt * 0.9);
            u.econTimer = (u.econTimer || 3.0) - dt;
            if (u.econTimer <= 0) {
                u.econTimer = 4.5;
                const wageMult = this.researchedTechs.imperialTaxCarts ? 1.3 : 1.0;
                const earned = Math.round((u.wage || 6) * wageMult);
                u.walletGold = (u.walletGold || 0) + earned;
                this.resources.food += 0.4;
                this.resources.wood += 0.35;
                this.resources.stone += 0.25;
            }

            // Autonomous Mind Decision
            u.mindTimer -= dt;
            if (u.mindTimer <= 0) {
                u.mindTimer = 2.4 + Math.random() * 2.5;
                this.evaluateAutonomousMind(u);
            }

            // Combat Engagement
            if (u.targetEntity && u.targetEntity.hp <= 0) u.targetEntity = null;
            if (u.targetEntity) {
                const styleSpec = FIGHTING_STYLES[u.fightingStyle] || FIGHTING_STYLES.berserker;
                const d = wrappedDist(u.x, u.y, u.targetEntity.x, u.targetEntity.y);
                if (d <= styleSpec.range) {
                    if (u.attackCooldown <= 0) this.performUnitAttack(u, u.targetEntity);
                } else {
                    u.targetX = u.targetEntity.x;
                    u.targetY = u.targetEntity.y;
                }
            }

            // Movement & Speedster Afterimages
            if (u.targetX !== null && u.targetY !== null) {
                const dx = wrapDX(u.x, u.targetX);
                const dy = u.targetY - u.y;
                const dist = Math.hypot(dx, dy);
                if (dist > 8) {
                    const baseSpd = FIGHTING_STYLES[u.fightingStyle]?.speed || 110;
                    const mountMult = u.mountType ? 1.32 : 1.0;
                    const spd = baseSpd * (u.lightningSpeed ? 3.2 : 1.0) * (u.skySoar ? 1.25 : 1.0) * mountMult;
                    u.vx = (dx / dist) * spd;
                    u.vy = (dy / dist) * spd;
                    u.x = wrapX(u.x + u.vx * dt);
                    u.y = Math.max(1320, Math.min(WORLD_H - 160, u.y + u.vy * dt));
                    u.facing = u.vx >= 0 ? 1 : -1;
                    u.walkPhase += dt * (u.lightningSpeed ? 22 : 9);
                    if (u.lightningSpeed && Math.random() < 0.45) {
                        this.afterimages.push({
                            x: u.x,
                            y: u.y,
                            color: u.hasOneRing ? '#f43f5e' : '#38bdf8',
                            alpha: 0.55,
                            life: 0.25
                        });
                    }
                    } else {
                        u.targetX = null;
                        u.targetY = null;
                    }
                }
            this.resolveUnitPhysics(u, dt, false);
        }

        // Update Hostile Raiders & Bosses
        const ringBearer = this.getRingBearer();
        const friendlyRingBearer = ringBearer && this.villagers.includes(ringBearer) ? ringBearer : null;
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            e.age = (e.age ?? 24) + (dt * enemyTimeScale / 12) * (e.hasOneRing ? 0.25 : 1.0);
            if (e.hp <= 0 || e.age >= (e.maxAge || 85)) {
                this.handleUnitDeath(e, e.hp <= 0 ? 'Slain in combat' : 'Died of old age', null, true);
                this.enemies.splice(i, 1);
                continue;
            }
            if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
            if (e.attackCooldown > 0) e.attackCooldown = Math.max(0, e.attackCooldown - dt * enemyTimeScale);
            if (this.oneRing.dropped && !e.controlledByRing) {
                const rd = wrappedDist(e.x, e.y, this.oneRing.x, this.oneRing.y);
                if (rd < 28) {
                    this.equipOneRing(e, 'Seized by a hostile warrior!');
                } else if (rd < 520) {
                    const dx = wrapDX(e.x, this.oneRing.x);
                    const dy = this.oneRing.y - e.y;
                    const spd = (e.speed || 90) * enemyTimeScale;
                    e.facing = dx >= 0 ? 1 : -1;
                    e.x = wrapX(e.x + (dx / rd) * spd * dt);
                    e.y = Math.max(1320, Math.min(WORLD_H - 160, e.y + (dy / rd) * spd * dt));
                    this.resolveUnitPhysics(e, dt * enemyTimeScale, true);
                    continue;
                }
            }
            if (!e.controlledByRing && this.villagers.length > 0) {
                let nearest = null;
                let bestD = 360;
                if (friendlyRingBearer && wrappedDist(e.x, e.y, friendlyRingBearer.x, friendlyRingBearer.y) < 650) {
                    nearest = friendlyRingBearer;
                    bestD = wrappedDist(e.x, e.y, friendlyRingBearer.x, friendlyRingBearer.y);
                } else {
                    for (let j = 0; j < this.villagers.length; j++) {
                        const v = this.villagers[j];
                        const d = wrappedDist(e.x, e.y, v.x, v.y);
                        if (d < bestD) { bestD = d; nearest = v; }
                    }
                }
                if (nearest) {
                    const dx = wrapDX(e.x, nearest.x);
                    const dy = nearest.y - e.y;
                    e.facing = dx >= 0 ? 1 : -1;
                    if (bestD > 34) {
                        const spd = ((e.hasOneRing ? 145 : (e.speed || 85))) * enemyTimeScale;
                        e.x = wrapX(e.x + (dx / bestD) * spd * dt);
                        e.y = Math.max(1320, Math.min(WORLD_H - 160, e.y + (dy / bestD) * spd * dt));
                    } else if ((e.attackCooldown || 0) <= 0) {
                        e.attackCooldown = e.hasOneRing ? 0.65 : 1.1;
                        const edmg = e.attack || 12;
                        if (!nearest.invincible) {
                            nearest.hp -= edmg;
                            nearest.hitFlash = 0.18;
                            if (nearest.hp <= 0) {
                                e.kills = (e.kills || 0) + 1;
                                this.handleUnitDeath(nearest, `Slain by ${e.name}`, e, false);
                            }
                        }
                        this.applyKnockback(nearest, e.x, e.y, e.isBoss || e.hasOneRing ? 220 : 120);
                    }
                }
            }
            this.resolveUnitPhysics(e, dt * enemyTimeScale, true);
        }

        // Update Watchtowers, Town Centers, Siege Engines & Naval War Galleys
        for (let i = 0; i < this.buildings.length; i++) {
            const b = this.buildings[i];
            if (b.owner === 'player' && (b.type === 'tower' || b.type === 'town_center' || b.type === 'gatehouse')) {
                b.shootTimer = (b.shootTimer || 0) - dt;
                if (b.shootTimer <= 0) {
                    const target = this.enemies.find(e => !e.controlledByRing && wrappedDist(b.x, b.y, e.x, e.y) < 340);
                    if (target) {
                        b.shootTimer = 1.65;
                        this.spawnParabolicArrow({ x: b.x, y: b.y - 24, attack: 22 }, target.x, target.y, 'broadhead', target);
                    }
                }
            }
        }

        for (let i = 0; i < this.siegeEngines.length; i++) {
            const s = this.siegeEngines[i];
            s.shootTimer = (s.shootTimer || 0) - dt;
            if (s.shootTimer <= 0) {
                const target = this.enemies.find(e => !e.controlledByRing && wrappedDist(s.x, s.y, e.x, e.y) < 420);
                if (target) {
                    s.shootTimer = 3.2;
                    this.spawnParabolicArrow({ x: s.x, y: s.y - 18, attack: 55 }, target.x, target.y, 'phoenix', target);
                }
            }
        }

        for (let i = 0; i < this.warGalleys.length; i++) {
            const g = this.warGalleys[i];
            g.x = wrapX(g.x + g.vx * dt);
            g.shootTimer = (g.shootTimer || 0) - dt;
            if (g.shootTimer <= 0) {
                const target = this.enemies.find(e => !e.controlledByRing && wrappedDist(g.x, g.y, e.x, e.y) < 360);
                if (target) {
                    g.shootTimer = 2.4;
                    this.spawnParabolicArrow({ x: g.x, y: g.y - 12, attack: 38 }, target.x, target.y, 'phoenix', target);
                }
            }
        }

        // AI Vassal Tribute & Periodic Raider Respawn
        for (let i = 0; i < this.aiPlayers.length; i++) {
            const ai = this.aiPlayers[i];
            ai.tributeTimer = (ai.tributeTimer || 12) - dt;
            if (ai.tributeTimer <= 0) {
                ai.tributeTimer = 14;
                if (ai.stance === 'vassal') {
                    this.resources.gold += 25;
                    this.updateHUD();
                } else if (ai.stance === 'hostile' && this.enemies.length < 36) {
                    this.enemies.push(this.createEnemyRaider(ai.x + (Math.random() - 0.5) * 90, ai.y + 60, `${ai.tribe} Raider`, false, ai.id));
                }
                // Rival tribe warriors can also defect & join your tribe if your tax rate is welcoming!
                if (this.taxRate <= 0.20 && this.villagers.length < this.maxBrowserAgents && Math.random() < 0.28) {
                    const defector = this.createVillager(ai.x + 30, ai.y + 30, `${ai.tribe.split(' ')[0]} Defector-${this.nextId}`, false);
                    defector.joy = 92;
                    defector.loyalty = 88;
                    defector.targetX = 820 + (Math.random() - 0.5) * 140;
                    defector.targetY = 2320 + (Math.random() - 0.5) * 90;
                    defector.mindDesire = `🤝 Defected from ${ai.tribe} to join Aethelgard!`;
                    defector.thoughtBubble = '🤝 Joining t101s Empire!';
                    defector.thoughtTimer = 4.5;
                    this.villagers.push(defector);
                    this.totalTribeMigrations++;
                    this.updateHUD();
                }
            }
        }

        // Update Parabolic Arrows & Projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            const prevX = p.x;
            const prevY = p.y - p.z;
            p.progress += p.speed * dt;
            const t = Math.min(1, p.progress);
            p.x = wrapX(p.startX + wrapDX(p.startX, p.targetX) * t);
            p.y = p.startY + (p.targetY - p.startY) * t;
            p.z = 4 * p.arcHeight * t * (1 - t) + (1 - t) * 16;
            const screenY = p.y - p.z;
            p.angle = Math.atan2(screenY - prevY, wrapDX(prevX, p.x));
            p.trail.push({ x: p.x, y: p.y, z: p.z });
            if (p.trail.length > 14) p.trail.shift();

            if (p.progress >= 1) {
                const isSplash = p.kind === 'phoenix';
                const hitRadius = isSplash ? 95 : 42;
                if (isSplash) {
                    this.parryRings.push({ x: p.targetX, y: p.targetY, radius: 10, maxRadius: 95, color: '#fb923c', life: 0.35 });
                    for (let j = 0; j < this.enemies.length; j++) {
                        const e = this.enemies[j];
                        if (e.hp > 0 && wrappedDist(p.targetX, p.targetY, e.x, e.y) <= hitRadius) {
                            e.hp -= p.damage;
                            e.hitFlash = 0.18;
                            this.applyKnockback(e, p.targetX, p.targetY, 170);
                        }
                    }
                } else if (p.targetEntity && p.targetEntity.hp > 0 && wrappedDist(p.targetX, p.targetY, p.targetEntity.x, p.targetEntity.y) <= hitRadius) {
                    p.targetEntity.hp -= p.damage;
                    p.targetEntity.hitFlash = 0.18;
                    this.applyKnockback(p.targetEntity, p.startX, p.startY, 95);
                }
                this.embeddedArrows.push({
                    x: p.targetX,
                    y: p.targetY,
                    angle: p.angle,
                    life: 5.5
                });
                this.projectiles.splice(i, 1);
            }
        }

        // Update Falling Meteors
        for (let i = this.fallingMeteors.length - 1; i >= 0; i--) {
            const m = this.fallingMeteors[i];
            m.progress += dt * 1.35;
            if (m.progress >= 1) {
                this.parryRings.push({ x: m.targetX, y: m.targetY, radius: 14, maxRadius: 185, color: '#f97316', life: 0.65 });
                this.enemies.forEach(e => {
                    if (!e.controlledByRing && wrappedDist(e.x, e.y, m.targetX, m.targetY) < 185) {
                        e.hp -= 240;
                        e.hitFlash = 0.25;
                        this.applyKnockback(e, m.targetX, m.targetY, 340);
                    }
                });
                this.fallingMeteors.splice(i, 1);
            }
        }

        // Decay VFX Lists
        this.embeddedArrows = this.embeddedArrows.filter(a => (a.life -= dt) > 0);
        this.slashRibbons = this.slashRibbons.filter(s => (s.life -= dt) > 0);
        this.afterimages = this.afterimages.filter(a => (a.life -= dt) > 0);
        this.parryRings = this.parryRings.filter(r => (r.life -= dt) > 0);
        this.floatTexts = this.floatTexts.filter(f => {
            f.y -= 24 * dt;
            return (f.life -= dt) > 0;
        });
        for (let i = this.clashSparks.length - 1; i >= 0; i--) {
            const s = this.clashSparks[i];
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.vy += 220 * dt;
            if ((s.life -= dt) <= 0) this.clashSparks.splice(i, 1);
        }

        for (let i = 0; i < this.riverFish.length; i++) {
            this.riverFish[i].x = wrapX(this.riverFish[i].x + this.riverFish[i].speed * dt);
        }
    }

}

Object.assign(PrehistoricPlanetaryGame.prototype, uiMethods, rendererMethods);
