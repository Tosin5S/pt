import {
    WORLD_W, WORLD_H, CONTINENTS, AGE_EPOCHS, FIGHTING_STYLES,
    wrapX, wrapDX, wrappedDist
} from './constants.js';

export const uiMethods = {
    screenToWorld(sx, sy) {
        const cx = this.canvas.width * 0.5;
        const cy = this.canvas.height * 0.5;
        const wx = wrapX(this.cam.x + (sx - cx) / this.cam.zoom);
        const wy = this.cam.y + (sy - cy) / (this.cam.zoom * this.cam.tiltScale);
        return { x: wx, y: wy };
    },

    bindInputEvents() {
        let isDragging = false;
        let dragMoved = false;
        let lastX = 0;
        let lastY = 0;
        let pinchStartDist = 0;
        let pinchStartZoom = 1.04;
    
        this.canvas.addEventListener('mousedown', (e) => {
            isDragging = true;
            dragMoved = false;
            lastX = e.clientX;
            lastY = e.clientY;
            if ((this.boxSelectMode || e.shiftKey) && !this.globeMode) {
                this.lassoRect = { x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY };
            }
        });
    
        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            if (Math.hypot(dx, dy) > 5) dragMoved = true;
            lastX = e.clientX;
            lastY = e.clientY;
            if (this.lassoRect) {
                this.lassoRect.x2 = e.clientX;
                this.lassoRect.y2 = e.clientY;
                return;
            }
            if (this.globeMode) {
                this.globeYaw -= dx * 0.006;
                this.globePitch = Math.max(-0.9, Math.min(0.9, this.globePitch + dy * 0.005));
            } else {
                if (dragMoved && this.cam.followSelected) {
                    this.cam.followSelected = false;
                    this.updateZoomHUD();
                }
                this.cam.targetX = wrapX(this.cam.targetX - dx / this.cam.zoom);
                this.cam.targetY = Math.max(1220, Math.min(WORLD_H - 180, this.cam.targetY - dy / (this.cam.zoom * this.cam.tiltScale)));
            }
        });
    
        window.addEventListener('mouseup', (e) => {
            if (this.lassoRect) {
                const r = this.lassoRect;
                this.lassoRect = null;
                if (Math.hypot(r.x2 - r.x1, r.y2 - r.y1) > 12) {
                    this.completeBoxLassoSelection(r.x1, r.y1, r.x2, r.y2);
                    isDragging = false;
                    return;
                }
            }
            if (isDragging && !dragMoved) this.handleWorldTap(e.clientX, e.clientY, e.button === 2);
            isDragging = false;
        });
    
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    
        this.canvas.addEventListener('dblclick', (e) => {
            if (this.globeMode) {
                this.globeMode = false;
                this.cam.targetZoom = 1.15;
                this.updateZoomHUD();
                return;
            }
            const wp = this.screenToWorld(e.clientX, e.clientY);
            this.cam.targetX = wp.x;
            this.cam.targetY = Math.max(1220, Math.min(WORLD_H - 180, wp.y));
            this.cam.targetZoom = this.cam.targetZoom < 1.85 ? 2.15 : 1.04;
            this.updateZoomHUD();
        });
    
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const factor = e.deltaY > 0 ? 0.86 : 1.16;
            if (this.globeMode) {
                if (e.deltaY < 0) {
                    this.globeMode = false;
                    this.cam.zoom = 0.28;
                    this.cam.targetZoom = 0.52;
                    this.updateZoomHUD();
                    this.showBanner('🌍', 'Entered 2.5D Continental Surface View!');
                }
                return;
            }
            const nextZoom = this.cam.targetZoom * factor;
            if (nextZoom < this.cam.minZoom && e.deltaY > 0) {
                this.globeMode = true;
                this.updateZoomHUD();
                this.showBanner('🌐', 'Zoomed out to 3D Planetary Orbit! Tap any continent or scroll in to land.');
                return;
            }
            this.zoomAtScreenPoint( nextZoom, e.clientX, e.clientY );
        }, { passive: false });
    
        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                isDragging = true;
                dragMoved = false;
                lastX = e.touches[0].clientX;
                lastY = e.touches[0].clientY;
                if (this.boxSelectMode && !this.globeMode) {
                    this.lassoRect = { x1: lastX, y1: lastY, x2: lastX, y2: lastY };
                }
            } else if (e.touches.length === 2) {
                this.lassoRect = null;
                isDragging = false;
                dragMoved = true;
                pinchStartDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                pinchStartZoom = this.cam.targetZoom;
            }
        }, { passive: true });
    
        this.canvas.addEventListener('touchmove', (e) => {
            if (this.lassoRect && e.touches.length === 1) {
                this.lassoRect.x2 = e.touches[0].clientX;
                this.lassoRect.y2 = e.touches[0].clientY;
                dragMoved = true;
                return;
            }
            if (e.touches.length === 2 && pinchStartDist > 10) {
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                const midX = (e.touches[0].clientX + e.touches[1].clientX) * 0.5;
                const midY = (e.touches[0].clientY + e.touches[1].clientY) * 0.5;
                const scale = dist / pinchStartDist;
                this.zoomAtScreenPoint(pinchStartZoom * scale, midX, midY);
                return;
            }
            if (!isDragging || e.touches.length !== 1) return;
            const dx = e.touches[0].clientX - lastX;
            const dy = e.touches[0].clientY - lastY;
            if (Math.hypot(dx, dy) > 6) dragMoved = true;
            lastX = e.touches[0].clientX;
            lastY = e.touches[0].clientY;
            if (this.globeMode) {
                this.globeYaw -= dx * 0.006;
                this.globePitch = Math.max(-0.9, Math.min(0.9, this.globePitch + dy * 0.005));
            } else {
                if (dragMoved && this.cam.followSelected) {
                    this.cam.followSelected = false;
                    this.updateZoomHUD();
                }
                this.cam.targetX = wrapX(this.cam.targetX - dx / this.cam.zoom);
                this.cam.targetY = Math.max(1220, Math.min(WORLD_H - 180, this.cam.targetY - dy / (this.cam.zoom * this.cam.tiltScale)));
            }
        }, { passive: true });
    
        this.canvas.addEventListener('touchend', (e) => {
            if (this.lassoRect) {
                const r = this.lassoRect;
                this.lassoRect = null;
                if (Math.hypot(r.x2 - r.x1, r.y2 - r.y1) > 14) {
                    this.completeBoxLassoSelection(r.x1, r.y1, r.x2, r.y2);
                    isDragging = false;
                    return;
                }
            }
            if (isDragging && !dragMoved && e.changedTouches.length === 1) {
                this.handleWorldTap(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
            }
            if (e.touches.length < 2) pinchStartDist = 0;
            if (e.touches.length === 0) isDragging = false;
        }, { passive: true });
    
        if (this.minimapCanvas) {
            const jumpRadar = (ev) => {
                const rect = this.minimapCanvas.getBoundingClientRect();
                const ratioX = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
                this.globeMode = false;
                this.cam.targetX = ratioX * WORLD_W;
                this.cam.targetY = 2280;
            };
            this.minimapCanvas.addEventListener('mousedown', jumpRadar);
            this.minimapCanvas.addEventListener('mousemove', (ev) => {
                if (ev.buttons === 1) jumpRadar(ev);
            });
        }
    
        window.addEventListener('keydown', (e) => {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
            const k = e.key.toLowerCase();
            this.keysDown.add(k);
            if (k === 'h') this.focusHeroT101s();
            else if (k === 'p') this.togglePause();
            else if (k === 'g') this.toggleGlobeMode();
            else if (k === 'f') this.toggleCameraFollow();
            else if (k === 'l') this.toggleBoxSelectMode();
            else if (k === '=' || k === '+') this.zoomByStep(1.25);
            else if (k === '-') this.zoomByStep(0.8);
            else if (k === 'escape') {
                ['economyPanel', 'emotionsPanel', 'diplomacyPanel', 'techForgePanel', 'creatorPanel'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.classList.add('hidden');
                });
            } else if (k >= '1' && k <= '6') {
                const cont = CONTINENTS[parseInt(k, 10) - 1];
                if (cont) {
                    this.globeMode = false;
                    this.cam.followSelected = false;
                    this.cam.targetX = cont.xStart + 820;
                    this.cam.targetY = 2320;
                    this.updateZoomHUD();
                    this.showBanner('🗺️', `Jumped to ${cont.name}`);
                }
            }
        });
        window.addEventListener('keyup', (e) => {
            this.keysDown.delete(e.key.toLowerCase());
        });
        window.addEventListener('blur', () => this.keysDown.clear());
    },

    zoomAtScreenPoint(newZoom, sx, sy) {
        const clamped = Math.max(this.cam.minZoom, Math.min(this.cam.maxZoom, newZoom));
        const cx = this.canvas.width * 0.5;
        const cy = this.canvas.height * 0.5;
        const worldBeforeX = wrapX(this.cam.targetX + (sx - cx) / this.cam.targetZoom);
        const worldBeforeY = this.cam.targetY + (sy - cy) / (this.cam.targetZoom * this.cam.tiltScale);
        this.cam.targetZoom = clamped;
        this.cam.targetX = wrapX(worldBeforeX - (sx - cx) / clamped);
        this.cam.targetY = Math.max(1220, Math.min(WORLD_H - 180, worldBeforeY - (sy - cy) / (clamped * this.cam.tiltScale)));
        this.updateZoomHUD();
    },

    zoomByStep(multiplier) {
        if (this.globeMode) {
            if (multiplier > 1) {
                this.globeMode = false;
                this.cam.zoom = 0.32;
                this.cam.targetZoom = 0.65;
                this.updateZoomHUD();
            }
            return;
        }
        const next = this.cam.targetZoom * multiplier;
        if (next < this.cam.minZoom && multiplier < 1) {
            this.globeMode = true;
            this.updateZoomHUD();
            this.showBanner('🌐', 'Zoomed out to 3D Planetary Orbit!');
            return;
        }
        this.zoomAtScreenPoint(next, this.canvas.width * 0.5, this.canvas.height * 0.5);
    },

    cycleZoomPreset() {
        const presets = [
            { zoom: 0.35, label: '35% Map' },
            { zoom: 1.04, label: '104% RTS' },
            { zoom: 1.75, label: '175% Duel' },
            { zoom: 2.85, label: '285% Micro' }
        ];
        this.globeMode = false;
        this.cam.zoomPresetIndex = (this.cam.zoomPresetIndex + 1) % presets.length;
        const p = presets[this.cam.zoomPresetIndex];
        this.cam.targetZoom = p.zoom;
        const u = this.getSelectedUnit();
        if (u) {
            this.cam.targetX = u.x;
            this.cam.targetY = u.y;
        }
        this.updateZoomHUD();
        this.showBanner('🔍', `Camera Zoom Preset: ${p.label}`);
    },

    toggleCameraFollow() {
        this.cam.followSelected = !this.cam.followSelected;
        this.globeMode = false;
        const u = this.getSelectedUnit();
        if (this.cam.followSelected && u) {
            this.cam.targetX = u.x;
            this.cam.targetY = u.y;
            this.showBanner('🎯', `Camera Locked onto ${u.name}! Pan manually anytime to unlock.`);
        } else {
            this.showBanner('🎯', 'Free Camera Unlocked.');
        }
        this.updateZoomHUD();
    },

    setZoomFromSlider(val) {
        const numeric = parseFloat(val) || 104;
        this.globeMode = false;
        this.cam.targetZoom = Math.max(this.cam.minZoom, Math.min(this.cam.maxZoom, numeric / 100));
        this.updateZoomHUD();
    },

    toggleBoxSelectMode() {
        this.boxSelectMode = !this.boxSelectMode;
        const el = document.getElementById('boxSelectBtnText');
        if (el) el.textContent = `Lasso: ${this.boxSelectMode ? 'ON' : 'OFF'}`;
        this.showBanner('🔲', this.boxSelectMode
            ? 'Marquee Box-Lasso Mode ON: Drag across the screen to box-select multiple citizens & warriors!'
            : 'Marquee Box-Lasso Mode OFF: Dragging pans the camera (or hold Shift + Drag to box-select).');
    },

    completeBoxLassoSelection(sx1, sy1, sx2, sy2) {
        const minX = Math.min(sx1, sx2);
        const maxX = Math.max(sx1, sx2);
        const minY = Math.min(sy1, sy2);
        const maxY = Math.max(sy1, sy2);
        const cx = this.canvas.width * 0.5;
        const cy = this.canvas.height * 0.5;
        const picked = [];
    
        for (let i = 0; i < this.villagers.length; i++) {
            const u = this.villagers[i];
            const screenX = cx + wrapDX(this.cam.x, u.x) * this.cam.zoom;
            const screenY = cy + (u.y - this.cam.y) * this.cam.zoom * this.cam.tiltScale;
            if (screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY) {
                picked.push(u.id);
            }
        }
        if (picked.length > 0) {
            this.selectedIds = picked.slice(0, 45);
            this.boxSelectMode = false;
            const el = document.getElementById('boxSelectBtnText');
            if (el) el.textContent = 'Lasso: OFF';
            this.sfx.play('horn');
            this.updateHUD();
            this.updateInspector();
            this.showBanner('🔲', `Box-Selected ${this.selectedIds.length} Units into Strike Squad!`);
        }
    },

    updateZoomHUD() {
        const globeEl = document.getElementById('globeBtnText');
        if (globeEl) globeEl.textContent = this.globeMode ? '2.5D Map' : '3D Globe';
        const zoomEl = document.getElementById('zoomPresetBtnText');
        if (zoomEl) {
            if (this.globeMode) {
                zoomEl.textContent = 'Orbit';
            } else {
                const pct = Math.round(this.cam.targetZoom * 100);
                const tag = pct <= 50 ? 'Map' : pct >= 210 ? 'Micro' : pct >= 145 ? 'Duel' : 'RTS';
                zoomEl.textContent = `${pct}% ${tag}`;
            }
        }
        const slider = document.getElementById('zoomRangeSlider');
        if (slider && !this.globeMode) {
            slider.value = Math.round(this.cam.targetZoom * 100);
        }
        const followEl = document.getElementById('followCamBtnText');
        if (followEl) followEl.textContent = `Follow: ${this.cam.followSelected ? 'ON' : 'OFF'}`;
    },

    handleWorldTap(sx, sy, forceCommand = false) {
        if (this.globeMode) {
            const w = this.canvas.width;
            const h = this.canvas.height;
            const cx = w * 0.5;
            const cy = h * 0.5;
            const R = Math.min(w, h) * 0.34;
            let clickedCont = null;
            let bestDist = 999999;
            for (let c = 0; c < CONTINENTS.length; c++) {
                const lon = (c / 6) * Math.PI * 2 + this.globeYaw;
                const x3d = Math.sin(lon);
                const z3d = Math.cos(lon);
                if (z3d > -0.15) {
                    const contX = cx + x3d * R * 0.78;
                    const contY = cy + Math.sin(this.globePitch) * R * 0.25;
                    const d = Math.hypot(sx - contX, sy - contY);
                    if (d < bestDist && d < R * 0.42) {
                        bestDist = d;
                        clickedCont = CONTINENTS[c];
                    }
                }
            }
            this.globeMode = false;
            if (clickedCont) {
                const destX = clickedCont.xStart + 800;
                this.cam.targetX = destX;
                this.cam.targetY = 2310;
                const hero = this.villagers.find(v => v.isT101s);
                if (hero && this.selectedIds.includes(hero.id) && this.heroTeleportOnTap) {
                    this.executeTeleportJump(hero, destX, 2290, `🌍 ORBITAL DROP: ${clickedCont.name.toUpperCase()}!`);
                }
                this.updateZoomHUD();
                this.showBanner('🌍', `Orbital Drop into ${clickedCont.name}!`);
            } else {
                this.updateZoomHUD();
                this.showBanner('🌍', `Entered 2.5D Surface View at ${this.getContinentAt(this.cam.x).name}!`);
            }
            return;
        }
    
        const wp = this.screenToWorld(sx, sy);
    
        // 1. Check if tapping a friendly villager/hero to select (skipped on right-click move/attack order)
        if (!forceCommand) {
            for (let i = 0; i < this.villagers.length; i++) {
                const u = this.villagers[i];
                if (wrappedDist(wp.x, wp.y, u.x, u.y) < 30) {
                    this.selectedIds = [u.id];
                    this.selectedBuildingId = null;
                    this.sfx.play('kalimba');
                    this.updateInspector();
                    return;
                }
            }
        }
    
        // 2. Check if tapping an enemy raider or World Boss to attack
        let tappedEnemy = null;
        for (let i = 0; i < this.enemies.length; i++) {
            const e = this.enemies[i];
            if (wrappedDist(wp.x, wp.y, e.x, e.y) < (e.isBoss ? 52 : 34)) {
                tappedEnemy = e;
                break;
            }
        }
    
        // 3. Check if tapping a Mithril Cavern Portal
        for (let i = 0; i < this.mithrilCaverns.length; i++) {
            const cav = this.mithrilCaverns[i];
            if (wrappedDist(wp.x, wp.y, cav.x, cav.y) < 48) {
                const hero = this.villagers.find(v => v.isT101s);
                if (hero) {
                    this.executeTeleportJump(hero, cav.x, cav.y + 18, '💎 CAVERN DELVE!');
                    this.resources.gold += 45;
                    this.resources.weapons += 4;
                    hero.walletGold += 25;
                    this.updateHUD();
                    this.showBanner('💎', `t101s mined ${cav.name}: +45🪙 Imperial Gold & +4⚔️ Mithril Arms!`);
                }
                return;
            }
        }
    
        // 4. Issue Move / Teleport / Attack Order to Selected Squad & Controlled Puppets
        const selectedUnits = this.villagers.filter(v => this.selectedIds.includes(v.id));
        const hero = selectedUnits.find(v => v.isT101s);
    
        if (hero && this.heroTeleportOnTap) {
            const destX = tappedEnemy ? wrapX(tappedEnemy.x - hero.facing * 36) : wp.x;
            const destY = tappedEnemy ? tappedEnemy.y : wp.y;
            this.executeTeleportJump(hero, destX, destY, tappedEnemy ? '⚡ FLASH TELEPORT STRIKE!' : '🌀 BLINK!');
            if (tappedEnemy) {
                hero.targetEntity = tappedEnemy;
                this.performUnitAttack(hero, tappedEnemy);
            }
        }
    
        selectedUnits.forEach((u, idx) => {
            const angle = (idx / Math.max(1, selectedUnits.length)) * Math.PI * 2;
            const radius = idx === 0 ? 0 : 28 + (idx % 4) * 16;
            u.directOrderTimer = 14.0;
            u.thoughtBubble = tappedEnemy ? '⚔️ Charging!' : '🫡 Moving!';
            u.thoughtTimer = 2.5;
            if (tappedEnemy) {
                u.targetEntity = tappedEnemy;
                u.targetX = tappedEnemy.x;
                u.targetY = tappedEnemy.y;
            } else {
                u.targetEntity = null;
                u.targetX = wrapX(wp.x + Math.cos(angle) * radius);
                u.targetY = Math.max(1340, Math.min(WORLD_H - 180, wp.y + Math.sin(angle) * radius * 0.6));
            }
        });
    
        // Controlled Blood-Puppets obey t101s's orders
        if (hero) {
            this.enemies.filter(e => e.controlledByRing).forEach((p, idx) => {
                p.targetX = wrapX(wp.x + Math.cos(idx) * 42);
                p.targetY = wp.y + Math.sin(idx) * 28;
            });
        }
    },

    toggleEconomyPanel() {
        const panel = document.getElementById('economyPanel');
        if (!panel) return;
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) {
            document.getElementById('diplomacyPanel').classList.add('hidden');
            document.getElementById('techForgePanel').classList.add('hidden');
            const em = document.getElementById('emotionsPanel');
            if (em) em.classList.add('hidden');
            this.renderEconomyPanel();
        }
    },

    setTaxRate(rate) {
        this.taxRate = Math.max(0, Math.min(0.5, Number(rate) || 0));
        const pct = Math.round(this.taxRate * 100) + '%';
        const lbl = document.getElementById('taxRateBtnLabel');
        if (lbl) lbl.textContent = pct;
        this.renderEconomyPanel();
        this.showBanner('💰', `Imperial Tax Rate set to ${pct}! Citizens pay tax from their personal wallets every 8s.`);
    },

    collectTaxesNow() {
        if (this.taxRate <= 0) {
            this.showBanner('⚠️', 'Tax Rate is 0% (Haven) — select a higher tax rate to collect a levy!');
            return;
        }
        let collected = 0;
        let payers = 0;
        for (let i = 0; i < this.villagers.length; i++) {
            const u = this.villagers[i];
            if ((u.walletGold || 0) > 2) {
                const tax = Math.max(1, Math.round(u.walletGold * this.taxRate));
                u.walletGold = Math.max(0, u.walletGold - tax);
                u.taxPaidTotal = (u.taxPaidTotal || 0) + tax;
                collected += tax;
                payers++;
            }
        }
        this.resources.gold += collected;
        this.totalTaxesCollected += collected;
        this.sfx.play('ring');
        this.updateHUD();
        this.updateInspector();
        this.renderEconomyPanel();
        this.showBanner('🧺', `Collected +${collected}🪙 Gold in Imperial Taxes from ${payers} Individual Citizen Wallets!`);
    },

    spawnPopulationBoom(count = 40) {
        const room = Math.max(0, this.maxBrowserAgents - this.villagers.length);
        const toAdd = Math.min(count, room);
        if (toAdd <= 0) {
            this.showBanner('👥', `Browser Agent Cap (${this.maxBrowserAgents} Individual Characters) Reached!`);
            return;
        }
        const styles = ['berserker', 'phalanx', 'kungfu', 'archery', 'juggernaut'];
        for (let i = 0; i < toAdd; i++) {
            const c = i % 6;
            const vx = CONTINENTS[c].xStart + 600 + (i * 47) % 1200;
            const vy = 2160 + (i * 39) % 800;
            const u = this.createVillager(vx, vy, `Settler-${this.villagers.length + 1}`, false);
            u.fightingStyle = styles[i % styles.length];
            this.villagers.push(u);
        }
        this.empirePopBillions = +(this.empirePopBillions + 0.35).toFixed(2);
        this.sfx.play('horn');
        this.updateHUD();
        this.renderEconomyPanel();
        this.showBanner('👶', `+${toAdd} Autonomous Tax-Paying Citizens Joined Your Planetary Empire (${this.villagers.length} Active)!`);
    },

    renderEconomyPanel() {
        const summary = document.getElementById('econSummaryText');
        const list = document.getElementById('wealthiestCitizensList');
        if (!summary || !list) return;
    
        let totalWallet = 0;
        for (let i = 0; i < this.villagers.length; i++) totalWallet += (this.villagers[i].walletGold || 0);
        const avg = Math.round(totalWallet / Math.max(1, this.villagers.length));
        const pct = Math.round(this.taxRate * 100);
        summary.textContent = `${this.villagers.length} Active Citizens (Max ${this.maxBrowserAgents}) • Tax: ${pct}% • Total Wealth: ${Math.floor(totalWallet)}🪙 (Avg ${avg}🪙) • Collected: ${Math.floor(this.totalTaxesCollected)}🪙`;
    
        const top = [...this.villagers].sort((a, b) => (b.walletGold || 0) - (a.walletGold || 0)).slice(0, 8);
        list.innerHTML = top.map(u => `
            <div onclick="game.selectCitizenById(${u.id})" class="stone-btn p-1.5 rounded-lg cursor-pointer">
                <div class="font-bold text-amber-200 truncate">${u.isT101s ? '💍 ' : (u.personalityIcon || '🧑 ')}${u.name}</div>
                <div class="text-stone-300 text-[9px] truncate">${u.profession} • Lv.${u.personalGearLevel || 1}</div>
                <div class="text-yellow-300 font-bold mt-0.5">👛 ${Math.floor(u.walletGold || 0)}🪙 <span class="text-emerald-300 text-[9px]">(Tax: ${Math.floor(u.taxPaidTotal || 0)}🪙)</span></div>
            </div>
        `).join('');
    },

    toggleCreatorPanel() {
        const panel = document.getElementById('creatorPanel');
        if (!panel) return;
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) {
            ['economyPanel', 'emotionsPanel', 'diplomacyPanel', 'techForgePanel'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.add('hidden');
            });
            this.renderBlueprintLibrary();
        }
    },

    applyCreatorPreset(category, name, icon, color, components = ['timber', 'stone']) {
        const catEl = document.getElementById('creatorCategory');
        const nameEl = document.getElementById('creatorName');
        const iconEl = document.getElementById('creatorIcon');
        const colEl = document.getElementById('creatorColor');
        if (catEl) catEl.value = category;
        if (nameEl) nameEl.value = name;
        if (iconEl) iconEl.value = icon;
        if (colEl) colEl.value = color;
        if (typeof document.querySelectorAll === 'function') {
            document.querySelectorAll('.bp-comp').forEach(cb => {
                cb.checked = components.includes(cb.value);
            });
        }
    },

    toggleSandboxFreeBuild() {
        this.freeBuildMode = !this.freeBuildMode;
        const el = document.getElementById('freeBuildBtnText');
        if (el) el.textContent = `Free-Build: ${this.freeBuildMode ? 'ON' : 'OFF'}`;
        this.showBanner('🆓', this.freeBuildMode ? 'Sandbox Free-Build ON! Anyone can build anything with 0 resource cost!' : 'Sandbox Free-Build OFF (Normal Resource Costs).');
    },

    readCreatorForm() {
        const category = document.getElementById('creatorCategory')?.value || 'house';
        const name = (document.getElementById('creatorName')?.value || '').trim() || 'Custom Blueprint';
        const icon = (document.getElementById('creatorIcon')?.value || '').trim() || '✨';
        const color = document.getElementById('creatorColor')?.value || '#38bdf8';
        const components = typeof document.querySelectorAll === 'function'
            ? [...document.querySelectorAll('.bp-comp:checked')].map(cb => cb.value)
            : ['timber', 'stone'];
        return { category, name, icon, color, components: components.length ? components : ['timber'] };
    },

    saveBlueprintOnlyFromUI() {
        const spec = this.readCreatorForm();
        const bp = this.designBlueprint(spec);
        this.renderBlueprintLibrary();
        this.showBanner('📐', `Saved Blueprint "${bp.name}" (${bp.components.join(' + ')}) — Humans can now build it!`);
    },

    createAnythingFromUI() {
        const spec = this.readCreatorForm();
        const bp = this.designBlueprint(spec);
        this.buildFromBlueprint(bp.id);
        this.renderBlueprintLibrary();
    },

    renderBlueprintLibrary() {
        const grid = document.getElementById('savedBlueprintsList');
        if (!grid || !Array.isArray(this.blueprints)) return;
        const compIcons = { timber: '🪵', stone: '🪨', metal: '⚔️', gold: '🪙', crystal: '🔮', gears: '⚙️' };
        grid.innerHTML = this.blueprints.map(bp => `
            <div onclick="game.buildFromBlueprint('${bp.id}')" class="stone-btn p-1.5 rounded-lg cursor-pointer border" style="border-color:${bp.color}">
                <div class="font-bold text-amber-200 truncate">${bp.icon} ${bp.name}</div>
                <div class="text-[9px] text-cyan-200 truncate">${bp.category.toUpperCase()} • ${bp.components.map(c => compIcons[c] || c).join('')}</div>
                <div class="text-[9px] text-emerald-300 truncate">Built: ${bp.builtCount || 0}×</div>
            </div>
        `).join('');
    },

    toggleEmotionsPanel() {
        const panel = document.getElementById('emotionsPanel');
        if (!panel) return;
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) {
            document.getElementById('economyPanel').classList.add('hidden');
            document.getElementById('diplomacyPanel').classList.add('hidden');
            document.getElementById('techForgePanel').classList.add('hidden');
            this.renderEmotionsPanel();
        }
    },

    renderEmotionsPanel() {
        const summary = document.getElementById('emotionSummaryText');
        const grid = document.getElementById('emotionalCitizensList');
        if (!summary || !grid) return;
        const avgJoy = Math.round(this.villagers.reduce((a, b) => a + (b.joy || 75), 0) / Math.max(1, this.villagers.length));
        const avgLoyalty = Math.round(this.villagers.reduce((a, b) => a + (b.loyalty || 75), 0) / Math.max(1, this.villagers.length));
        summary.textContent = `Avg Joy: ${avgJoy}% • Avg Loyalty: ${avgLoyalty}% • Citizen-Founded Tribes: ${this.totalTribesFounded} • Free-Will Tribe Migrations: ${this.totalTribeMigrations}`;
    
        const sample = [...this.villagers]
            .filter(v => !v.isT101s)
            .sort((a, b) => (b.ambition + b.anger) - (a.ambition + a.anger))
            .slice(0, 8);
        grid.innerHTML = sample.map(u => `
            <div onclick="game.selectCitizenById(${u.id})" class="stone-btn p-1.5 rounded-lg flex flex-col justify-between cursor-pointer border" style="border-color:${u.tribeColor || '#475569'}">
                <div class="flex items-center justify-between font-bold text-amber-200">
                    <span class="truncate">${u.emotionIcon || '😄'} ${u.name}</span>
                    <span class="text-[9px] px-1 rounded bg-stone-900 text-pink-300">${u.emotionLabel || 'Joyful'}</span>
                </div>
                <div class="text-[9px] text-cyan-200 truncate">🏕️ Tribe: ${u.tribeName || 'Aethelgard Empire'}</div>
                <div class="text-[9px] text-stone-300 truncate">Joy ${Math.round(u.joy)}% • Loyalty ${Math.round(u.loyalty)}% • Ambition ${Math.round(u.ambition)}%</div>
                <div class="text-[9px] text-emerald-300 truncate">${u.mindDesire}</div>
            </div>
        `).join('');
    },

    selectCitizenById(id) {
        const u = this.villagers.find(v => v.id === id);
        if (!u) return;
        this.selectedIds = [u.id];
        this.globeMode = false;
        this.cam.targetX = u.x;
        this.cam.targetY = u.y;
        this.updateInspector();
    },

    toggleDiplomacyPanel() {
        const panel = document.getElementById('diplomacyPanel');
        if (!panel) return;
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) {
            document.getElementById('economyPanel').classList.add('hidden');
            document.getElementById('techForgePanel').classList.add('hidden');
            const em = document.getElementById('emotionsPanel');
            if (em) em.classList.add('hidden');
            this.renderDiplomacyPanel();
        }
    },

    renderDiplomacyPanel() {
        const box = document.getElementById('aiPlayersList');
        if (!box) return;
        box.innerHTML = this.aiPlayers.map(ai => `
            <div class="stone-panel p-2 rounded-lg border border-stone-600 flex flex-col justify-between gap-1">
                <div class="font-bold text-amber-200 flex items-center justify-between">
                    <span>${ai.icon} ${ai.name}</span>
                    <span class="text-[9px] px-1.5 py-0.5 rounded bg-stone-800 text-cyan-200">${ai.stance.toUpperCase()}</span>
                </div>
                <div class="text-[9px] text-stone-300">${ai.tribe} • Gold: ${ai.gold}🪙</div>
                <div class="flex items-center gap-1 mt-1">
                    <button onclick="game.spectateAICapital(${ai.id})" class="stone-btn px-1.5 py-0.5 rounded text-[9px] text-amber-200 flex-1">📷 View</button>
                    <button onclick="game.allyAIPlayer(${ai.id})" class="wood-btn px-1.5 py-0.5 rounded text-[9px] text-emerald-200 flex-1">🤝 Ally (45🪙)</button>
                    <button onclick="game.subjugateAIPlayer(${ai.id})" class="ring-btn px-1.5 py-0.5 rounded text-[9px] text-yellow-200 flex-1">💍 Vassal</button>
                </div>
            </div>
        `).join('');
    },

    spectateAICapital(aiId) {
        const ai = this.aiPlayers.find(a => a.id === aiId);
        if (!ai) return;
        this.globeMode = false;
        this.cam.targetX = ai.x;
        this.cam.targetY = ai.y;
        this.showBanner(ai.icon, `Spectating ${ai.name} of ${ai.tribe}!`);
    },

    allyAIPlayer(aiId) {
        const ai = this.aiPlayers.find(a => a.id === aiId);
        if (!ai) return;
        if (this.resources.gold < 45) {
            this.showBanner('⚠️', 'Need 45🪙 Imperial Gold to send an Alliance Tribute!');
            return;
        }
        this.resources.gold -= 45;
        ai.stance = 'allied';
        this.updateHUD();
        this.renderDiplomacyPanel();
        this.showBanner('🤝', `${ai.name} (${ai.tribe}) is now Allied with your Empire!`);
    },

    subjugateAIPlayer(aiId) {
        const ai = this.aiPlayers.find(a => a.id === aiId);
        const hero = this.villagers.find(v => v.isT101s);
        if (!ai || !hero) return;
        this.executeTeleportJump(hero, ai.x - 45, ai.y + 20, '💍 ONE RING SUBJUGATION!');
        ai.stance = 'vassal';
        this.renderDiplomacyPanel();
        this.showBanner('💍', `t101s subjugated ${ai.name} as a Ring-Sworn Vassal paying continuous Gold Tribute!`);
    },

    toggleTechForgePanel() {
        const panel = document.getElementById('techForgePanel');
        if (!panel) return;
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) {
            document.getElementById('economyPanel').classList.add('hidden');
            document.getElementById('diplomacyPanel').classList.add('hidden');
            const em = document.getElementById('emotionsPanel');
            if (em) em.classList.add('hidden');
            this.renderTechForgePanel();
        }
    },

    renderTechForgePanel() {
        const grid = document.getElementById('techForgeGrid');
        if (!grid) return;
        const items = [
            { key: 'wraithCrown', isHero: true, name: '👑 Sovereign Wraith Crown', desc: '+35% Bloodbending Range' },
            { key: 'twinRingBlades', isHero: true, name: '⚔️ Twin Crimson Ring-Blades', desc: 'Dual-Blade Crescent Waves' },
            { key: 'shadowDrakeWings', isHero: true, name: '🦇 Shadow-Drake Flight Wings', desc: 'Supersonic Sky-Soar Aura' },
            { key: 'eyeOfDominion', isHero: true, name: '👁️ Eye of Dominion Beam', desc: 'Auto Orbital Ring Laser' },
            { key: 'repeatingBows', isHero: false, name: '🏹 Repeating Crossbows', desc: 'Archers fire +40% faster' },
            { key: 'mithrilPhalanx', isHero: false, name: '🛡️ Mithril Phalanx Shields', desc: '+35% Citizen Armor' },
            { key: 'subElemental', isHero: false, name: '⚡ Sub-Elemental Mastery', desc: 'Blue Lightning & Lava' },
            { key: 'imperialTaxCarts', isHero: false, name: '⚖️ Imperial Trade Guilds', desc: '+30% Citizen Wage & Tax' }
        ];
        grid.innerHTML = items.map(it => {
            const active = it.isHero ? this.heroArtifacts[it.key] : this.researchedTechs[it.key];
            return `
                <div onclick="game.toggleTechOrArtifact('${it.key}', ${it.isHero})" class="stone-btn p-2 rounded-lg cursor-pointer border ${active ? 'border-amber-400' : 'border-stone-600'}">
                    <div class="font-bold text-amber-200 flex items-center justify-between">
                        <span>${it.name}</span>
                        <span class="text-[9px] ${active ? 'text-emerald-300' : 'text-stone-400'}">${active ? 'ACTIVE' : 'UNLOCK'}</span>
                    </div>
                    <div class="text-[9px] text-stone-300 mt-0.5">${it.desc}</div>
                </div>
            `;
        }).join('');
    },

    toggleTechOrArtifact(key, isHero) {
        if (isHero) {
            this.heroArtifacts[key] = !this.heroArtifacts[key];
        } else {
            this.researchedTechs[key] = !this.researchedTechs[key];
        }
        this.sfx.play('ring');
        this.renderTechForgePanel();
    },

    cycleCameraTilt() {
        const tilts = [
            { scale: 0.82, label: '2.5D 55°' },
            { scale: 0.66, label: '2.5D 38°' },
            { scale: 0.94, label: '2.5D 75°' }
        ];
        this.cam.tiltMode = (this.cam.tiltMode + 1) % tilts.length;
        this.cam.tiltScale = tilts[this.cam.tiltMode].scale;
        const el = document.getElementById('tiltBtnText');
        if (el) el.textContent = tilts[this.cam.tiltMode].label;
    },

    toggleGlobeMode() {
        this.globeMode = !this.globeMode;
        this.updateZoomHUD();
    },

    toggleDuelCam() {
        this.duelCamActive = !this.duelCamActive;
        this.cam.targetZoom = this.duelCamActive ? 1.68 : 1.04;
        const hero = this.villagers.find(v => v.isT101s);
        if (hero && this.duelCamActive) {
            this.cam.targetX = hero.x;
            this.cam.targetY = hero.y;
        }
        this.updateZoomHUD();
    },

    cycleDayNight() {
        const modes = ['Noon Sun', 'Golden Sunset', 'Starlit Night', 'Blood Moon'];
        this.lightingMode = (this.lightingMode + 1) % modes.length;
        const el = document.getElementById('lightingBtnText');
        if (el) el.textContent = modes[this.lightingMode];
    },

    toggleHD2D() {
        this.hd2dEnabled = !this.hd2dEnabled;
        const el = document.getElementById('hd2dBtnText');
        if (el) el.textContent = `HD-2D ${this.hd2dEnabled ? 'ON' : 'OFF'}`;
    },

    cycleSimSpeed() {
        const speeds = [1, 2, 0];
        const idx = speeds.indexOf(this.simSpeed);
        this.simSpeed = speeds[(idx + 1) % speeds.length];
        this.updateSimSpeedHUD();
        const labels = { 0: '⏸️ Simulation Paused (Camera & WASD still active)', 1: '▶️ Simulation Speed: 1x Normal', 2: '⏩ Simulation Speed: 2x Fast Forward' };
        this.showBanner('⏯️', labels[this.simSpeed]);
    },

    togglePause() {
        this.simSpeed = this.simSpeed === 0 ? 1 : 0;
        this.updateSimSpeedHUD();
        this.showBanner('⏯️', this.simSpeed === 0 ? '⏸️ Simulation Paused' : '▶️ Simulation Resumed (1x)');
    },

    updateSimSpeedHUD() {
        const el = document.getElementById('simSpeedBtnText');
        if (el) el.textContent = this.simSpeed === 0 ? 'Paused' : `${this.simSpeed}x`;
    },

    toggleMusic() {
        this.musicEnabled = !this.musicEnabled;
        const el = document.getElementById('musicBtnText');
        if (el) el.textContent = `Music ${this.musicEnabled ? 'ON' : 'OFF'}`;
        if (this.musicEnabled) this.sfx.play('kalimba');
    },

    showBanner(icon, text) {
        const banner = document.getElementById('eventBanner');
        const ic = document.getElementById('eventBannerIcon');
        const tx = document.getElementById('eventBannerText');
        if (!banner || !ic || !tx) return;
        ic.textContent = icon;
        tx.textContent = text;
        banner.style.opacity = '1';
        clearTimeout(this._bannerTimeout);
        this._bannerTimeout = setTimeout(() => {
            banner.style.opacity = '0';
        }, 3600);
    },

    spawnFloatText(x, y, text, color = '#fde047') {
        this.floatTexts.push({ x, y, text, color, life: 1.15 });
    },

    updateHUD() {
        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        setTxt('resFood', Math.floor(this.resources.food));
        setTxt('resWood', Math.floor(this.resources.wood));
        setTxt('resStone', Math.floor(this.resources.stone));
        setTxt('resGold', Math.floor(this.resources.gold));
        setTxt('resWeapons', Math.floor(this.resources.weapons));
        setTxt('resRelics', this.housedRelics);
        setTxt('ageTitleText', AGE_EPOCHS[this.ageLevel].title);
        setTxt('popText', `${this.villagers.length} Citizens • ${this.empirePopBillions.toFixed(2)}B Pop`);
        setTxt('mindSummaryBadge', `🧠 ${this.villagers.length} Autonomous Minds Active`);
        setTxt('bossCountLabel', this.worldBosses.filter(b => b.hp > 0).length);
        setTxt('emergentTribeCountLabel', this.aiPlayers.length);
        setTxt('allTribesBtnCount', this.aiPlayers.length);
        const totalEntries = (this.chronicles?.ring?.length || 0)
            + (this.chronicles?.heroes?.length || 0)
            + (this.chronicles?.empires?.length || 0);
        setTxt('chronicleCountLabel', totalEntries);
    
        const nextAge = AGE_EPOCHS[this.ageLevel + 1];
        setTxt('advanceAgeBtnText', nextAge ? `Age ${this.ageLevel + 2} (${nextAge.costGold}🪙)` : 'MAX AGE IV');
    },

    toggleChroniclePanel() {
        const p = document.getElementById('chroniclePanel');
        if (!p) return;
        p.classList.toggle('hidden');
        if (!p.classList.contains('hidden')) {
            this.renderChronicleBook();
        }
    },

    selectChronicleBook(bookKey) {
        this.activeChronicleBook = bookKey || 'ring';
        this.renderChronicleBook();
    },

    renderChronicleBook() {
        const container = document.getElementById('chronicleEntries');
        if (!container || !this.chronicles) return;
        const key = this.activeChronicleBook || 'ring';
        const entries = this.chronicles[key] || [];
        if (entries.length === 0) {
            container.innerHTML = '<div class="text-stone-400 italic p-2">No chapters inscribed yet in this book...</div>';
            return;
        }
        container.innerHTML = entries.map(e => `
            <div class="bg-stone-900/85 border border-stone-700/80 rounded-lg p-2">
                <div class="flex items-center justify-between text-amber-300 font-bold mb-0.5">
                    <span>📜 ${e.title}</span>
                    <span class="text-[10px] text-stone-400">Year ${e.year}</span>
                </div>
                <div class="text-stone-200 leading-snug">${e.story}</div>
            </div>
        `).join('');
    },

    inscribeCustomChronicle() {
        const input = document.getElementById('chronicleCustomInput');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        const key = this.activeChronicleBook || 'ring';
        this.addChronicle(key, 'Player Chronicle', text);
        input.value = '';
        this.renderChronicleBook();
        this.updateHUD();
    },

    updateInspector() {
        const u = this.getSelectedUnit();
        if (!u) return;
        const style = FIGHTING_STYLES[u.fightingStyle] || FIGHTING_STYLES.berserker;
        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        const ageVal = Math.floor(u.age ?? 20);
        const stage = ageVal < 13 ? 'Child' : (ageVal < 20 ? 'Youth' : (ageVal < 58 ? 'Adult' : 'Elder'));
        setTxt('selIcon', u.hasOneRing ? '💍' : (u.emotionIcon || style.icon));
        setTxt('selName', `${u.name} (${ageVal}y ${stage} • ${u.tribeName || 'Aethelgard'})`);
        setTxt('selWalletText', `👛 ${Math.round(u.walletGold || 0)}🪙`);
        setTxt('selHpText', u.invincible ? `🛡️ ∞/${u.maxHp} HP` : `❤️ ${Math.ceil(u.hp)}/${u.maxHp} HP`);
        const mountNames = { mammoth: ' • 🦣 Mammoth', sabre: ' • 🐅 Sabre-Cat', drake: ' • 🐉 Sky-Drake' };
        const mountTag = u.mountType ? (mountNames[u.mountType] || '') : '';
        const ringTag = u.hasOneRing ? ' • 💍 RING-BEARER' : '';
        const swimTag = (u.bender === 'water' || u.bender === 'avatar') ? ' • 🌊 Water-Surfer' : (u.canSwim ? ' • 🏊 Swimmer' : ' • 🚫 Non-Swimmer');
        setTxt('selRole', `Mind: ${u.mindDesire} • ⚔️ ${u.kills || 0} Kills • 😨 Fear ${Math.round(u.fear || 0)}%${swimTag}${mountTag}${ringTag}`);
        setTxt('ringToggleBtnText', u.hasOneRing ? 'Remove Ring' : 'Bestow Ring');
        setTxt('puppetCountText', this.enemies.filter(e => e.controlledByRing).length);
    }
};
