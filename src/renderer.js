import {
    WORLD_W, RIVER_Y, CONTINENTS, AGE_EPOCHS,
    wrapX, wrapDX, solve2BoneIK
} from './constants.js';

export const rendererMethods = {
    render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
    
        if (this.globeMode) {
            this.render3DPlanetaryGlobe(ctx, w, h);
            this.renderMinimapRadar();
            return;
        }
    
        ctx.fillStyle = '#0c1424';
        ctx.fillRect(0, 0, w, h);
    
        ctx.save();
        ctx.translate(w * 0.5, h * 0.5);
        ctx.scale(this.cam.zoom, this.cam.zoom * this.cam.tiltScale);
        const invTilt = 1 / this.cam.tiltScale;
    
        this.renderContinentsAndRiver(ctx, invTilt);
        this.renderYBufferEntities(ctx, invTilt);
        this.renderCombatAndArrowVFX(ctx, invTilt);
    
        ctx.restore();
    
        this.renderAtmosphereAndPostFX(ctx, w, h);
        this.renderMinimapRadar();
    },

    renderContinentsAndRiver(ctx, invTilt) {
        const viewHalfW = (this.canvas.width * 0.65) / this.cam.zoom;
    
        for (let c = 0; c < CONTINENTS.length; c++) {
            const cont = CONTINENTS[c];
            const center = (cont.xStart + cont.xEnd) * 0.5;
            const dx = wrapDX(this.cam.x, center);
            if (Math.abs(dx) > viewHalfW + 5000) continue;
    
            const drawX = dx - (cont.xEnd - cont.xStart) * 0.5;
            const cw = cont.xEnd - cont.xStart;
            const topY = 1200 - this.cam.y;
    
            ctx.fillStyle = cont.grass;
            ctx.fillRect(drawX, topY, cw, 8400);
    
            // Highland plateau + striated 2.5D cliff face + drop shadow
            ctx.fillStyle = cont.color;
            ctx.fillRect(drawX, topY, cw, 480);
            ctx.fillStyle = cont.cliff;
            ctx.fillRect(drawX, 1680 - this.cam.y, cw, 34);
            ctx.fillStyle = 'rgba(0,0,0,0.28)';
            ctx.fillRect(drawX, 1714 - this.cam.y, cw, 10);
            ctx.strokeStyle = 'rgba(0,0,0,0.22)';
            ctx.lineWidth = 1.5;
            for (let sx = 40; sx < cw; sx += 90) {
                ctx.beginPath();
                ctx.moveTo(drawX + sx, 1682 - this.cam.y);
                ctx.lineTo(drawX + sx - 8, 1712 - this.cam.y);
                ctx.stroke();
            }
    
            // Feathered biome transition seam with next continent
            const nextCont = CONTINENTS[(c + 1) % CONTINENTS.length];
            const seamGrad = ctx.createLinearGradient(drawX + cw - 90, 0, drawX + cw + 90, 0);
            seamGrad.addColorStop(0, 'rgba(0,0,0,0)');
            seamGrad.addColorStop(0.5, nextCont.grass);
            seamGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.save();
            ctx.globalAlpha = 0.45;
            ctx.fillStyle = seamGrad;
            ctx.fillRect(drawX + cw - 90, 1714 - this.cam.y, 180, 7886);
            ctx.restore();
    
            // Procedural biome ground details (culled by zoom & viewport)
            if (this.cam.zoom >= 0.42) {
                const detailColor = cont.biome === 'volcanic' ? 'rgba(249, 115, 22, 0.35)'
                    : cont.biome === 'boreal' ? 'rgba(241, 245, 249, 0.35)'
                    : cont.biome === 'savanna' ? 'rgba(250, 204, 21, 0.25)'
                    : cont.biome === 'coral' ? 'rgba(103, 232, 249, 0.28)'
                    : 'rgba(134, 239, 172, 0.25)';
                ctx.fillStyle = detailColor;
                const viewHalfH = (this.canvas.height * 0.65) / (this.cam.zoom * this.cam.tiltScale);
                for (let i = 0; i < 90; i++) {
                    const gx = drawX + ((i * 397 + c * 137) % (cw - 60)) + 30;
                    if (Math.abs(gx) > viewHalfW + 80) continue;
                    const gy = 1750 + ((i * 271 + c * 89) % 7400);
                    if (Math.abs(gy - this.cam.y) > viewHalfH + 60) continue;
                    if (Math.abs(gy - RIVER_Y) < 85) continue;
                    const sy = gy - this.cam.y;
                    if (cont.biome === 'volcanic') {
                        ctx.fillRect(gx - 8, sy, 16, 2.5);
                    } else if (cont.biome === 'boreal') {
                        ctx.beginPath();
                        ctx.ellipse(gx, sy, 14, 5, 0, 0, Math.PI * 2);
                        ctx.fill();
                    } else {
                        ctx.fillRect(gx - 2, sy - 5, 2, 6);
                        ctx.fillRect(gx + 2, sy - 4, 2, 5);
                    }
                }
            }
        }
    
        // Stone Staircase Ramps
        this.cliffRamps.forEach(r => {
            const rx = wrapDX(this.cam.x, r.x);
            if (Math.abs(rx) > viewHalfW + 120) return;
            const ry = r.y - this.cam.y;
            ctx.fillStyle = '#a8a29e';
            ctx.fillRect(rx - 32, ry - 4, 64, 42);
            ctx.strokeStyle = '#57534e';
            ctx.lineWidth = 2;
            for (let s = 0; s < 5; s++) {
                ctx.strokeRect(rx - 30, ry + s * 7, 60, 6);
            }
        });
    
        // Winding Turquoise Continental River with Animated Ripples & Foam
        const rY = RIVER_Y - this.cam.y;
        const rW = (viewHalfW + 200) * 2;
        const rGrad = ctx.createLinearGradient(0, rY - 56, 0, rY + 56);
        rGrad.addColorStop(0, '#0369a1');
        rGrad.addColorStop(0.5, '#0284c7');
        rGrad.addColorStop(1, '#0c4a6e');
        ctx.fillStyle = rGrad;
        ctx.fillRect(-viewHalfW - 200, rY - 56, rW, 112);
    
        // Shoreline foam strips
        ctx.fillStyle = 'rgba(224, 242, 254, 0.25)';
        ctx.fillRect(-viewHalfW - 200, rY - 56, rW, 4);
        ctx.fillRect(-viewHalfW - 200, rY + 52, rW, 4);
    
        // Scrolling shimmering wave streaks
        const waveShift = (this.time * 48) % 140;
        ctx.fillStyle = 'rgba(186, 230, 253, 0.28)';
        for (let wx = -viewHalfW - 200 + waveShift; wx < viewHalfW + 200; wx += 140) {
            ctx.fillRect(wx, rY - 28, 48, 3);
            ctx.fillRect(wx + 65, rY + 8, 52, 3);
            ctx.fillRect(wx + 25, rY + 32, 36, 2.5);
        }
    
        // Swimming Prehistoric Fish
        ctx.fillStyle = 'rgba(12, 74, 110, 0.65)';
        for (let i = 0; i < this.riverFish.length; i++) {
            const f = this.riverFish[i];
            const fx = wrapDX(this.cam.x, f.x);
            if (Math.abs(fx) > viewHalfW) continue;
            ctx.beginPath();
            ctx.ellipse(fx, f.y - this.cam.y, 7, 3, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    
        // Naval Dragon-Fire War Galleys
        this.warGalleys.forEach(g => {
            const gx = wrapDX(this.cam.x, g.x);
            if (Math.abs(gx) > viewHalfW + 120) return;
            const gy = g.y - this.cam.y;
            ctx.save();
            ctx.translate(gx, gy);
            ctx.scale(1, invTilt);
            ctx.fillStyle = '#451a03';
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(-34, 0);
            ctx.lineTo(34, 0);
            ctx.lineTo(24, 14);
            ctx.lineTo(-24, 14);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#991b1b';
            ctx.fillRect(-14, -32, 28, 24);
            ctx.fillStyle = '#fde047';
            ctx.font = 'bold 8px Inter';
            ctx.textAlign = 'center';
            ctx.fillText('🐉 WAR GALLEY', 0, -37);
            ctx.restore();
        });
    
        // Walkable Bridges & Causeways
        this.stoneBridges.forEach(br => {
            const bx = wrapDX(this.cam.x, br.x);
            if (Math.abs(bx) > viewHalfW + 120) return;
            ctx.fillStyle = '#78350f';
            ctx.fillRect(bx - 42, rY - 62, 84, 124);
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 2;
            ctx.strokeRect(bx - 42, rY - 62, 84, 124);
        });
    
        // Citizen-Carved Prehistoric Spirit Totem Monuments
        this.totemMonuments.forEach(tm => {
            const tx = wrapDX(this.cam.x, tm.x);
            if (Math.abs(tx) > viewHalfW + 80) return;
            const ty = tm.y - this.cam.y;
            ctx.save();
            ctx.translate(tx, ty);
            ctx.scale(1, invTilt);
            ctx.fillStyle = '#57534e';
            ctx.strokeStyle = tm.color || '#facc15';
            ctx.lineWidth = 1.6;
            ctx.fillRect(-5, -26, 10, 26);
            ctx.strokeRect(-5, -26, 10, 26);
            ctx.fillStyle = tm.color || '#facc15';
            ctx.beginPath();
            ctx.arc(0, -30, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
    
        // Glowing Subterranean Star-Mithril Cavern Portals
        this.mithrilCaverns.forEach(cav => {
            const cx = wrapDX(this.cam.x, cav.x);
            if (Math.abs(cx) > viewHalfW + 120) return;
            const cy = cav.y - this.cam.y;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(1, invTilt);
            ctx.fillStyle = '#1e1b4b';
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, 26, Math.PI, 0);
            ctx.lineTo(26, 14);
            ctx.lineTo(-26, 14);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
    
            ctx.fillStyle = 'rgba(56, 189, 248, 0.55)';
            ctx.beginPath();
            ctx.arc(0, 2, 15 + Math.sin(this.time * 4) * 3, 0, Math.PI * 2);
            ctx.fill();
    
            ctx.fillStyle = '#bae6fd';
            ctx.font = 'bold 9px Inter';
            ctx.textAlign = 'center';
            ctx.fillText('💎 MITHRIL CAVERN', 0, -32);
            ctx.restore();
        });
    },

    renderYBufferEntities(ctx, invTilt) {
        const viewHalfW = (this.canvas.width * 0.65) / this.cam.zoom;
        const drawList = [];
    
        this.resourcesNodes.forEach(r => {
            const dx = wrapDX(this.cam.x, r.x);
            if (Math.abs(dx) < viewHalfW + 90) drawList.push({ y: r.y, kind: 'node', obj: r, dx });
        });
        this.buildings.forEach(b => {
            const dx = wrapDX(this.cam.x, b.x);
            if (Math.abs(dx) < viewHalfW + 140) drawList.push({ y: b.y, kind: 'building', obj: b, dx });
        });
        this.siegeEngines.forEach(s => {
            const dx = wrapDX(this.cam.x, s.x);
            if (Math.abs(dx) < viewHalfW + 110) drawList.push({ y: s.y, kind: 'siege', obj: s, dx });
        });
        this.villagers.forEach(u => {
            const dx = wrapDX(this.cam.x, u.x);
            if (Math.abs(dx) < viewHalfW + 100) drawList.push({ y: u.y, kind: 'villager', obj: u, dx });
        });
        this.enemies.forEach(e => {
            const dx = wrapDX(this.cam.x, e.x);
            if (Math.abs(dx) < viewHalfW + 120) drawList.push({ y: e.y, kind: 'enemy', obj: e, dx });
        });
    
        drawList.sort((a, b) => a.y - b.y);
    
        for (let i = 0; i < drawList.length; i++) {
            const item = drawList[i];
            const sy = item.y - this.cam.y;
            if (item.kind === 'node') {
                this.drawResourceNode(ctx, item.obj, item.dx, sy, invTilt);
            } else if (item.kind === 'building') {
                this.drawBuilding(ctx, item.obj, item.dx, sy, invTilt);
            } else if (item.kind === 'siege') {
                this.drawSiegeEngine(ctx, item.obj, item.dx, sy, invTilt);
            } else if (item.kind === 'villager') {
                this.drawArticulatedHuman(ctx, item.obj, item.dx, sy, invTilt, false);
            } else if (item.kind === 'enemy') {
                this.drawArticulatedHuman(ctx, item.obj, item.dx, sy, invTilt, true);
            }
        }
    },

    drawResourceNode(ctx, node, sx, sy, invTilt) {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(1, invTilt);

        // Ground shadow
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.beginPath();
        ctx.ellipse(2, 2, 16, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        if (node.type === 'tree') {
            const sway = Math.sin(this.time * 1.9 + node.x * 0.015) * 2.2;
            ctx.fillStyle = '#5c4033';
            ctx.fillRect(-4, -18, 8, 18);
            ctx.fillStyle = '#14532d';
            ctx.beginPath();
            ctx.arc(sway * 0.6, -26, 17, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#15803d';
            ctx.beginPath();
            ctx.arc(sway * 0.85, -30, 15, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#22c55e';
            ctx.beginPath();
            ctx.arc(-4 + sway, -34, 10, 0, Math.PI * 2);
            ctx.fill();
        } else if (node.type === 'stone') {
            ctx.fillStyle = '#64748b';
            ctx.beginPath();
            ctx.moveTo(-16, 0);
            ctx.lineTo(-8, -22);
            ctx.lineTo(10, -18);
            ctx.lineTo(16, 0);
            ctx.closePath();
            ctx.fill();
            // Lit facet
            ctx.fillStyle = '#cbd5e1';
            ctx.beginPath();
            ctx.moveTo(-8, -22);
            ctx.lineTo(2, -12);
            ctx.lineTo(10, -18);
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.fillStyle = '#ca8a04';
            ctx.beginPath();
            ctx.moveTo(-15, 0);
            ctx.lineTo(-5, -24);
            ctx.lineTo(12, -16);
            ctx.lineTo(15, 0);
            ctx.closePath();
            ctx.fill();
            // Shimmering gold crystal facet
            const glint = 0.5 + 0.5 * Math.sin(this.time * 4 + node.x);
            ctx.fillStyle = `rgba(254, 240, 138, ${(0.55 + glint * 0.45).toFixed(2)})`;
            ctx.beginPath();
            ctx.moveTo(-5, -24);
            ctx.lineTo(2, -10);
            ctx.lineTo(12, -16);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    },

    drawBuilding(ctx, b, sx, sy, invTilt) {
        const epoch = AGE_EPOCHS[this.ageLevel];
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(1, invTilt);
    
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.beginPath();
        ctx.ellipse(0, 6, b.radius * 1.15, b.radius * 0.48, 0, 0, Math.PI * 2);
        ctx.fill();
    
        const w = b.radius * 1.5;
        const h = b.radius * 1.15;
    
        ctx.fillStyle = '#44403c';
        ctx.fillRect(-w * 0.56, -6, w * 1.12, 12);
    
        ctx.fillStyle = b.owner === 'player' ? epoch.wallColor : '#3f3f46';
        ctx.strokeStyle = b.customColor || epoch.trimColor;
        ctx.lineWidth = 2;
        ctx.fillRect(-w * 0.5, -h, w, h);
        ctx.strokeRect(-w * 0.5, -h, w, h);

        if (b.auraColor) {
            ctx.save();
            ctx.globalAlpha = 0.25 + 0.1 * Math.sin(this.time * 3 + b.id);
            ctx.strokeStyle = b.auraColor;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.ellipse(0, 4, b.radius * 1.35, b.radius * 0.58, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    
        // Doorway arch
        ctx.fillStyle = '#1c1917';
        ctx.fillRect(-5, -13, 10, 13);
    
        // Warm flickering hearth / forge glow
        if (b.type === 'forge' || b.type === 'kitchen' || b.type === 'hut' || b.type === 'shrine' || b.type === 'wonder') {
            const flicker = 0.85 + Math.sin(this.time * 9 + b.id) * 0.15;
            const glowR = (b.type === 'wonder' || b.type === 'forge' ? 38 : 24) * flicker;
            const glowCol = (b.type === 'shrine' || b.type === 'wonder') ? 'rgba(56, 189, 248, 0.26)' : 'rgba(251, 146, 60, 0.28)';
            const gGrad = ctx.createRadialGradient(0, -h * 0.4, 2, 0, -h * 0.4, glowR);
            gGrad.addColorStop(0, glowCol);
            gGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = gGrad;
            ctx.beginPath();
            ctx.arc(0, -h * 0.4, glowR, 0, Math.PI * 2);
            ctx.fill();
        }
    
        if (b.type === 'sawmill') {
            ctx.save();
            ctx.translate(w * 0.28, -h * 0.45);
            ctx.rotate(this.time * 8);
            ctx.fillStyle = '#cbd5e1';
            ctx.beginPath();
            ctx.arc(0, 0, 11, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        } else if (b.type === 'forge') {
            ctx.fillStyle = '#f97316';
            ctx.beginPath();
            ctx.arc(0, -h * 0.35, 8 + Math.sin(this.time * 6) * 2, 0, Math.PI * 2);
            ctx.fill();
        } else if (b.type === 'wonder' || b.type === 'shrine') {
            ctx.strokeStyle = '#fde047';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, -h - 26, 16, 0, Math.PI * 2);
            ctx.stroke();
        }
    
        ctx.fillStyle = b.owner === 'player' ? epoch.roofColor : '#7f1d1d';
        ctx.beginPath();
        ctx.moveTo(-w * 0.62, -h);
        ctx.lineTo(0, -h - b.radius * 0.85);
        ctx.lineTo(w * 0.62, -h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    
        // Rising chimney smoke wisps for Forge / Kitchen / Hut
        if ((b.type === 'forge' || b.type === 'kitchen' || b.type === 'hut') && this.cam.zoom >= 0.5) {
            ctx.fillStyle = 'rgba(203, 213, 225, 0.35)';
            for (let sp = 0; sp < 3; sp++) {
                const phase = ((this.time * 0.9 + b.id * 0.3 + sp * 0.33) % 1);
                const smX = Math.sin(this.time * 2 + sp + b.id) * 5 + phase * 8;
                const smY = -h - b.radius * 0.7 - phase * 26;
                ctx.beginPath();
                ctx.arc(smX, smY, 3 + phase * 4.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    
        // Waving tribal banner on military / wonder structures
        if (b.type === 'barracks' || b.type === 'tower' || b.type === 'gatehouse' || b.type === 'wonder') {
            const topY = -h - b.radius * 0.85;
            const wave = Math.sin(this.time * 7 + b.id) * 3;
            ctx.strokeStyle = '#fef08a';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(0, topY);
            ctx.lineTo(0, topY - 14);
            ctx.stroke();
            ctx.fillStyle = b.customColor || (b.owner === 'player' ? '#ef4444' : '#a855f7');
            ctx.beginPath();
            ctx.moveTo(0, topY - 14);
            ctx.lineTo(12, topY - 11 + wave);
            ctx.lineTo(0, topY - 7);
            ctx.closePath();
            ctx.fill();
        }
    
        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 10px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(`${b.icon} ${b.name}`, 0, -h - b.radius * 0.95);
        ctx.restore();
    },

    drawSiegeEngine(ctx, s, sx, sy, invTilt) {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(1, invTilt);
        ctx.fillStyle = '#78350f';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.fillRect(-22, -16, 44, 14);
        ctx.strokeRect(-22, -16, 44, 14);
        ctx.beginPath();
        ctx.moveTo(-14, -16);
        ctx.lineTo(0, -42);
        ctx.lineTo(14, -16);
        ctx.stroke();
        ctx.fillStyle = '#fde68a';
        ctx.font = 'bold 8px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(`🪨 ${s.name}`, 0, -48);
        ctx.restore();
    },

    drawArticulatedHuman(ctx, u, sx, sy, invTilt, isEnemy) {
        const elev = this.getTerrainElevation(u.x, u.y);
        const soarZ = u.skySoar ? 28 + Math.sin(this.time * 4 + u.id) * 6 : 0;
        const jumpZ = u.dodgeAnim > 0 ? Math.sin(u.dodgeAnim * Math.PI) * 26 : 0;
        const zOff = elev + soarZ + jumpZ;
    
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(1, invTilt);
        const scale = u.isBoss ? 1.85 : (u.isT101s ? 1.24 : 1.0);
        ctx.scale(scale, scale);
    
        // Height-responsive ground shadow
        const shadowScale = Math.max(0.35, 1 - zOff / 140);
        ctx.fillStyle = `rgba(0,0,0,${(0.38 * shadowScale).toFixed(2)})`;
        ctx.beginPath();
        ctx.ellipse(0, 3, 10 * shadowScale, 4.5 * shadowScale, 0, 0, Math.PI * 2);
        ctx.fill();
    
        if (this.selectedIds.includes(u.id)) {
            ctx.strokeStyle = u.isT101s ? '#fde047' : '#4ade80';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(0, 3, 15, 6.5, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
    
        // Sprint / dodge landing dust puffs
        if (this.cam.zoom >= 0.7 && (u.dodgeAnim > 0 || Math.abs(Math.sin(u.walkPhase || 0)) > 0.94)) {
            ctx.fillStyle = 'rgba(214, 211, 209, 0.35)';
            ctx.beginPath();
            ctx.arc(-u.facing * 6, 1, u.dodgeAnim > 0 ? 5.5 : 3, 0, Math.PI * 2);
            ctx.fill();
        }
    
        // Zoom-based LOD for 500-agent performance at strategic map zoom
        if (this.cam.zoom < 0.45 && !u.isT101s && !u.isBoss) {
            ctx.translate(0, -zOff);
            ctx.fillStyle = u.hitFlash > 0 ? '#ffffff' : (isEnemy ? '#ef4444' : (u.tribeColor || '#10b981'));
            ctx.beginPath();
            ctx.arc(0, -14, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
            return;
        }
    
        ctx.translate(0, -zOff);
        if (u.childScale && u.childScale < 1.0) {
            ctx.scale(u.childScale, u.childScale);
        }
    
        // Articulated Prehistoric Mount (War-Mammoth, Sabre-Tooth Cat, or Sky-Drake)
        if (u.mountType) {
            const mDir = u.facing || 1;
            const mBob = Math.sin((u.walkPhase || 0) * 1.4) * 2.5;
            const mStride = Math.sin((u.walkPhase || 0) * 1.4) * 5;
            ctx.save();
            ctx.translate(0, 4 + mBob);
            if (u.mountType === 'mammoth') {
                // Animated 4 legs
                ctx.strokeStyle = '#3e2723';
                ctx.lineWidth = 3.2;
                ctx.beginPath();
                ctx.moveTo(-10, -4); ctx.lineTo(-10 - mStride, 5);
                ctx.moveTo(-4, -4);  ctx.lineTo(-4 + mStride, 5);
                ctx.moveTo(6, -4);   ctx.lineTo(6 - mStride, 5);
                ctx.moveTo(11, -4);  ctx.lineTo(11 + mStride, 5);
                ctx.stroke();
                ctx.fillStyle = '#5c4033';
                ctx.strokeStyle = '#fbbf24';
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.ellipse(0, -10, 18, 12, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // Swinging trunk & ivory tusks
                ctx.strokeStyle = '#5c4033';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(mDir * 15, -10);
                ctx.quadraticCurveTo(mDir * 24, -4 + mBob, mDir * 20, 2);
                ctx.stroke();
                ctx.strokeStyle = '#fef3c7';
                ctx.lineWidth = 2.6;
                ctx.beginPath();
                ctx.moveTo(mDir * 14, -8);
                ctx.quadraticCurveTo(mDir * 26, -2, mDir * 24, -14);
                ctx.stroke();
            } else if (u.mountType === 'sabre') {
                ctx.strokeStyle = '#b45309';
                ctx.lineWidth = 2.4;
                ctx.beginPath();
                ctx.moveTo(-9, -4); ctx.lineTo(-11 - mStride, 4);
                ctx.moveTo(9, -4);  ctx.lineTo(11 + mStride, 4);
                ctx.stroke();
                ctx.fillStyle = '#d97706';
                ctx.strokeStyle = '#fef08a';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.ellipse(0, -8, 15, 8, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // Swishing tail & fangs
                ctx.beginPath();
                ctx.moveTo(-mDir * 14, -9);
                ctx.quadraticCurveTo(-mDir * 22, -16 + mBob, -mDir * 20, -4);
                ctx.stroke();
                ctx.strokeStyle = '#ffffff';
                ctx.beginPath();
                ctx.moveTo(mDir * 14, -6); ctx.lineTo(mDir * 15, 0);
                ctx.stroke();
            } else if (u.mountType === 'drake') {
                const flap = Math.sin(this.time * 10 + u.id) * 9;
                ctx.fillStyle = 'rgba(190, 18, 60, 0.72)';
                ctx.strokeStyle = '#fda4af';
                ctx.lineWidth = 1.4;
                ctx.beginPath();
                ctx.moveTo(0, -10);
                ctx.lineTo(-22, -24 + flap);
                ctx.lineTo(-10, -6);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, -10);
                ctx.lineTo(22, -24 + flap);
                ctx.lineTo(10, -6);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#881337';
                ctx.strokeStyle = '#f43f5e';
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.ellipse(0, -9, 16, 9, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
            ctx.restore();
        }
    
        // Shadow-Drake Flight Wings for t101s
        if ((u.isT101s && this.heroArtifacts.shadowDrakeWings && u.skySoar) || u.isWraith) {
            const flap = Math.sin(this.time * 9) * 8;
            ctx.fillStyle = 'rgba(153, 27, 27, 0.78)';
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(0, -18);
            ctx.lineTo(-24, -32 + flap);
            ctx.lineTo(-14, -10);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, -18);
            ctx.lineTo(24, -32 + flap);
            ctx.lineTo(14, -10);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
    
        // Flowing Hero / Bender Cape
        if ((u.isT101s || u.bender) && (this.cam.zoom >= 0.55 || u.isT101s)) {
            const wave = Math.sin(this.time * 6 + u.id) * 5;
            ctx.fillStyle = u.isT101s ? '#991b1b' : '#1e3a8a';
            ctx.beginPath();
            ctx.moveTo(-4 * u.facing, -23);
            ctx.lineTo(-15 * u.facing, -4 + wave);
            ctx.lineTo(-6 * u.facing, -3);
            ctx.closePath();
            ctx.fill();
        }
    
        // 2-Bone IK Legs
        const stride = Math.sin(u.walkPhase || 0) * 6;
        const legL = solve2BoneIK(-3, -10, -4 - stride, 0, 6, 6, u.facing);
        const legR = solve2BoneIK(3, -10, 4 + stride, 0, 6, 6, u.facing);
        ctx.strokeStyle = '#d6d3d1';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(-3, -10);
        ctx.lineTo(legL.midX, legL.midY);
        ctx.lineTo(legL.endX, legL.endY);
        ctx.moveTo(3, -10);
        ctx.lineTo(legR.midX, legR.midY);
        ctx.lineTo(legR.endX, legR.endY);
        ctx.stroke();
    
        // Tunic / Armor Torso
        ctx.fillStyle = u.hitFlash > 0
            ? '#ffffff'
            : (u.isT101s ? '#7f1d1d' : (u.controlledByRing ? '#a855f7' : (isEnemy ? '#991b1b' : (u.tribeColor || '#0f766e'))));
        ctx.strokeStyle = u.isT101s ? '#facc15' : '#1e293b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(-6, -24, 12, 14, 3);
        ctx.fill();
        ctx.stroke();
    
        // Head & Sovereign Crown
        ctx.fillStyle = '#fde68a';
        ctx.beginPath();
        ctx.arc(0, -29, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    
        if (this.cam.zoom >= 1.55) {
            ctx.fillStyle = u.isT101s ? '#fef08a' : '#0f172a';
            ctx.beginPath();
            ctx.arc(u.facing * 2.4, -29.5, 1.1, 0, Math.PI * 2);
            ctx.fill();
        }
    
        if (u.isT101s && this.heroArtifacts.wraithCrown) {
            ctx.fillStyle = '#facc15';
            ctx.beginPath();
            ctx.moveTo(-5, -33);
            ctx.lineTo(-3, -39);
            ctx.lineTo(0, -35);
            ctx.lineTo(3, -39);
            ctx.lineTo(5, -33);
            ctx.closePath();
            ctx.fill();
        }
    
        // 2-Bone IK Weapon Arm & The One Ring
        const swing = (u.swingAnim || 0) * 18;
        const arm = solve2BoneIK(3 * u.facing, -21, (12 + swing) * u.facing, -16 - swing * 0.5, 6, 6, -u.facing);
        ctx.strokeStyle = '#fde68a';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(3 * u.facing, -21);
        ctx.lineTo(arm.midX, arm.midY);
        ctx.lineTo(arm.endX, arm.endY);
        ctx.stroke();
    
        if (u.isT101s) {
            ctx.strokeStyle = '#fef08a';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(arm.endX, arm.endY, 3.2, 0, Math.PI * 2);
            ctx.stroke();
    
            ctx.strokeStyle = '#f43f5e';
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.moveTo(arm.endX, arm.endY);
            ctx.lineTo(arm.endX + u.facing * 16, arm.endY - 10);
            ctx.stroke();
        } else if (u.fightingStyle === 'archery') {
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.arc(arm.endX, arm.endY, 8, -Math.PI * 0.45, Math.PI * 0.45);
            ctx.stroke();
        } else {
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            ctx.moveTo(arm.endX, arm.endY);
            ctx.lineTo(arm.endX + u.facing * 12, arm.endY - 8);
            ctx.stroke();
        }
    
        // Crescent melee swing trail
        if ((u.swingAnim || 0) > 0.08) {
            ctx.save();
            ctx.globalAlpha = Math.min(1, u.swingAnim * 1.4);
            ctx.strokeStyle = u.isT101s ? '#fde047' : (u.bender ? '#38bdf8' : '#f8fafc');
            ctx.lineWidth = u.isT101s ? 3.5 : 2.2;
            ctx.beginPath();
            const arcStart = u.facing > 0 ? -0.9 : Math.PI - 0.9;
            ctx.arc(u.facing * 8, -16, u.isT101s ? 22 : 16, arcStart, arcStart + 1.8);
            ctx.stroke();
            ctx.restore();
        }
    
        if (u.customTool) {
            ctx.fillStyle = u.customTool.color || '#fbbf24';
            ctx.beginPath();
            ctx.arc(arm.endX + u.facing * 6, arm.endY - 4, 3.8, 0, Math.PI * 2);
            ctx.fill();
        }

        if (u.customMagic) {
            ctx.save();
            ctx.strokeStyle = u.customMagic.color || '#c084fc';
            ctx.lineWidth = 1.6;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.arc(0, -18, 17 + Math.sin(this.time * 4 + u.id) * 2, this.time * 2, this.time * 2 + Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        if (u.invincible) {
            ctx.strokeStyle = 'rgba(250, 204, 21, 0.75)';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.arc(0, -18, 22, 0, Math.PI * 2);
            ctx.stroke();
        }
    
        if (this.cam.zoom <= 0.55) {
            if (u.isT101s || u.isBoss || u.controlledByRing) {
                const badgeScale = Math.min(2.6, 0.85 / this.cam.zoom);
                ctx.save();
                ctx.translate(0, -42);
                ctx.scale(badgeScale, badgeScale);
                ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
                ctx.strokeStyle = u.isT101s ? '#facc15' : (u.controlledByRing ? '#c084fc' : '#f43f5e');
                ctx.lineWidth = 1.5;
                ctx.fillRect(-38, -12, 76, 15);
                ctx.strokeRect(-38, -12, 76, 15);
                ctx.fillStyle = '#fef08a';
                ctx.font = 'bold 8.5px Inter';
                ctx.textAlign = 'center';
                ctx.fillText(u.isT101s ? '💍 HERO t101s' : u.name.slice(0, 12), 0, -2);
                ctx.restore();
            }
            ctx.restore();
            return;
        }
    
        const showDetailTag = this.cam.zoom >= 1.35 || this.selectedIds.includes(u.id) || u.isT101s || u.isBoss || u.controlledByRing;
        if (!isEnemy && u.thoughtTimer > 0 && u.thoughtBubble && (this.cam.zoom >= 0.88 || u.isT101s || this.selectedIds.includes(u.id))) {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 1;
            ctx.fillRect(-44, -56, 88, 13);
            ctx.strokeRect(-44, -56, 88, 13);
            ctx.fillStyle = '#fef08a';
            ctx.font = 'bold 7.5px Inter';
            ctx.textAlign = 'center';
            ctx.fillText(u.thoughtBubble, 0, -47);
        }
    
        if (showDetailTag) {
            ctx.fillStyle = u.isT101s ? '#fde047' : (u.controlledByRing ? '#e879f9' : (isEnemy ? '#fca5a5' : '#a7f3d0'));
            ctx.font = 'bold 8px Inter';
            ctx.textAlign = 'center';
            const walletBadge = !isEnemy ? ` • ${u.emotionIcon || '😄'} • 👛${Math.round(u.walletGold || 0)}🪙` : '';
            const tribeTag = (!isEnemy && u.tribeId && u.tribeId !== 'player') ? ` [${u.tribeName.split(' ')[0]}]` : '';
            ctx.fillText(`${u.isT101s ? '💍 ' : (u.controlledByRing ? '👑 PUPPET ' : '')}${u.name}${tribeTag}${walletBadge}`, 0, -39);
        }
    
        ctx.restore();
    },

    renderCombatAndArrowVFX(ctx, invTilt) {
        const hero = this.villagers.find(v => v.isT101s);
        if (hero) {
            this.enemies.filter(e => e.controlledByRing).forEach(p => {
                const hx = wrapDX(this.cam.x, hero.x);
                const hy = hero.y - this.cam.y - 34;
                const px = wrapDX(this.cam.x, p.x);
                const py = p.y - this.cam.y - 24;
                ctx.strokeStyle = 'rgba(244, 63, 94, 0.78)';
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.moveTo(hx, hy);
                ctx.quadraticCurveTo((hx + px) * 0.5, Math.min(hy, py) - 45, px, py);
                ctx.stroke();
            });
        }
    
        this.afterimages.forEach(a => {
            const ax = wrapDX(this.cam.x, a.x);
            const ay = a.y - this.cam.y;
            ctx.fillStyle = a.color;
            ctx.globalAlpha = Math.max(0, a.life);
            ctx.beginPath();
            ctx.arc(ax, ay - 16, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        });
    
        this.slashRibbons.forEach(s => {
            const sx = wrapDX(this.cam.x, s.x);
            const sy = s.y - this.cam.y;
            ctx.save();
            ctx.translate(sx, sy);
            ctx.scale(s.facing, invTilt);
            ctx.strokeStyle = s.color;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(0, 0, 22, -Math.PI * 0.45, Math.PI * 0.45);
            ctx.stroke();
            ctx.restore();
        });
    
        this.blackHoles.forEach(bh => {
            const bx = wrapDX(this.cam.x, bh.x);
            const by = bh.y - this.cam.y;
            ctx.save();
            ctx.translate(bx, by);
            ctx.scale(1, invTilt);
            ctx.fillStyle = 'rgba(15, 3, 28, 0.92)';
            ctx.strokeStyle = '#e879f9';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, 32 + Math.sin(this.time * 10) * 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        });
    
        this.embeddedArrows.forEach(a => {
            const ax = wrapDX(this.cam.x, a.x);
            const ay = a.y - this.cam.y;
            ctx.save();
            ctx.translate(ax, ay);
            ctx.rotate(a.angle);
            ctx.strokeStyle = '#fde68a';
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(-12, 0);
            ctx.lineTo(4, 0);
            ctx.stroke();
            ctx.restore();
        });
    
        this.projectiles.forEach(p => {
            const px = wrapDX(this.cam.x, p.x);
            const py = p.y - this.cam.y;
    
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            ctx.beginPath();
            ctx.ellipse(px, py, 7, 2.5, 0, 0, Math.PI * 2);
            ctx.fill();
    
            if (p.trail.length > 1) {
                ctx.strokeStyle = p.arrowKind === 'phoenix'
                    ? 'rgba(249, 115, 22, 0.78)'
                    : (p.arrowKind === 'gale' ? 'rgba(52, 211, 153, 0.78)' : 'rgba(253, 224, 71, 0.75)');
                ctx.lineWidth = 2.6;
                ctx.beginPath();
                for (let t = 0; t < p.trail.length; t++) {
                    const pt = p.trail[t];
                    const tx = wrapDX(this.cam.x, pt.x);
                    const ty = pt.y - this.cam.y - pt.z;
                    if (t === 0) ctx.moveTo(tx, ty);
                    else ctx.lineTo(tx, ty);
                }
                ctx.stroke();
            }
    
            ctx.save();
            ctx.translate(px, py - p.z);
            ctx.rotate(p.angle);
            ctx.strokeStyle = '#fef3c7';
            ctx.lineWidth = 2.2;
            ctx.beginPath();
            ctx.moveTo(-14, 0);
            ctx.lineTo(12, 0);
            ctx.stroke();
    
            ctx.fillStyle = p.arrowKind === 'phoenix' ? '#f97316' : '#f43f5e';
            ctx.beginPath();
            ctx.moveTo(-14, 0);
            ctx.lineTo(-19, -4);
            ctx.lineTo(-17, 0);
            ctx.lineTo(-19, 4);
            ctx.closePath();
            ctx.fill();
    
            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.moveTo(14, 0);
            ctx.lineTo(8, -3.5);
            ctx.lineTo(8, 3.5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        });
    
        this.fallingMeteors.forEach(m => {
            const mx = wrapDX(this.cam.x, m.x + (m.targetX - m.x) * m.progress);
            const my = (m.y + (m.targetY - m.y) * m.progress) - this.cam.y;
            ctx.fillStyle = '#f97316';
            ctx.beginPath();
            ctx.arc(mx, my, 20, 0, Math.PI * 2);
            ctx.fill();
        });
    
        this.parryRings.forEach(r => {
            const rx = wrapDX(this.cam.x, r.x);
            const ry = r.y - this.cam.y;
            const rad = r.radius + (r.maxRadius - r.radius) * (1 - r.life);
            ctx.strokeStyle = r.color;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(rx, ry, rad, 0, Math.PI * 2);
            ctx.stroke();
        });
    
        this.clashSparks.forEach(s => {
            const sx = wrapDX(this.cam.x, s.x);
            const sy = s.y - this.cam.y;
            ctx.save();
            ctx.globalAlpha = Math.max(0.15, Math.min(1, (s.life || 0.3) * 2.5));
            ctx.fillStyle = s.color;
            ctx.fillRect(sx - 2, sy - 2, 4, 4);
            ctx.restore();
        });
    
        this.floatTexts.forEach(f => {
            const fx = wrapDX(this.cam.x, f.x);
            const fy = f.y - this.cam.y;
            ctx.save();
            ctx.scale(1, invTilt);
            ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.4));
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.font = 'bold 11px Inter';
            ctx.textAlign = 'center';
            ctx.fillText(f.text, fx + 1, fy * this.cam.tiltScale + 1);
            ctx.fillStyle = f.color;
            ctx.fillText(f.text, fx, fy * this.cam.tiltScale);
            ctx.restore();
        });
    },

    renderAtmosphereAndPostFX(ctx, w, h) {
        if (this.lightingMode === 1) {
            const sunGrad = ctx.createLinearGradient(0, 0, 0, h);
            sunGrad.addColorStop(0, 'rgba(249, 115, 22, 0.24)');
            sunGrad.addColorStop(1, 'rgba(245, 158, 11, 0.08)');
            ctx.fillStyle = sunGrad;
            ctx.fillRect(0, 0, w, h);
        } else if (this.lightingMode === 2) {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.44)';
            ctx.fillRect(0, 0, w, h);
            // Twinkling stars & crescent moon
            ctx.fillStyle = 'rgba(248, 250, 252, 0.75)';
            for (let i = 0; i < 36; i++) {
                const sx = ((i * 211 + 47) % 997) / 997 * w;
                const sy = ((i * 137 + 23) % 991) / 991 * (h * 0.35);
                const tw = 0.7 + 0.6 * Math.sin(this.time * 3 + i);
                ctx.fillRect(sx, sy, tw * 2, tw * 2);
            }
            ctx.fillStyle = '#fef08a';
            ctx.beginPath();
            ctx.arc(w * 0.85, h * 0.14, 16, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.arc(w * 0.85 + 6, h * 0.14 - 3, 14, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.lightingMode === 3 || this.greatCometTimer > 0) {
            ctx.fillStyle = 'rgba(153, 27, 27, 0.24)';
            ctx.fillRect(0, 0, w, h);
        }

        // HD-2D Cinematic Vignette & Warm Bloom
        if (this.hd2dEnabled) {
            const vig = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.32, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
            vig.addColorStop(0, 'rgba(0,0,0,0)');
            vig.addColorStop(1, 'rgba(2, 6, 23, 0.42)');
            ctx.fillStyle = vig;
            ctx.fillRect(0, 0, w, h);
        }
    
        if (this.globalTimeSlowTimer > 0) {
            ctx.strokeStyle = 'rgba(192, 132, 252, 0.55)';
            ctx.lineWidth = 6;
            ctx.strokeRect(3, 3, w - 6, h - 6);
        }
    
        // Dynamic Planetary Weather Overlay (Monsoon, Volcanic Ash, Blizzard, Ring Eclipse)
        if (this.weatherMode > 0) {
            if (this.weatherMode === 4) {
                ctx.fillStyle = 'rgba(127, 29, 29, 0.24)';
                ctx.fillRect(0, 0, w, h);
                const pulse = 28 + Math.sin(this.time * 4) * 3;
                const corona = ctx.createRadialGradient(w * 0.82, h * 0.18, pulse * 0.7, w * 0.82, h * 0.18, pulse * 2.1);
                corona.addColorStop(0, 'rgba(250, 204, 21, 0.85)');
                corona.addColorStop(0.5, 'rgba(239, 68, 68, 0.35)');
                corona.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = corona;
                ctx.beginPath();
                ctx.arc(w * 0.82, h * 0.18, pulse * 2.1, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#090d16';
                ctx.beginPath();
                ctx.arc(w * 0.82, h * 0.18, pulse * 0.82, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Occasional subtle lightning flash during Monsoon
                if (this.weatherMode === 1 && Math.sin(this.time * 17.3) > 0.992) {
                    ctx.fillStyle = 'rgba(224, 242, 254, 0.18)';
                    ctx.fillRect(0, 0, w, h);
                }
                ctx.save();
                for (let i = 0; i < this.weatherParticles.length; i++) {
                    const wp = this.weatherParticles[i];
                    wp.x = (wp.x + wp.speedX * 0.016 + w) % w;
                    wp.y = (wp.y + wp.speedY * 0.016) % h;
                    if (this.weatherMode === 1) {
                        ctx.strokeStyle = 'rgba(125, 211, 252, 0.55)';
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        ctx.moveTo(wp.x, wp.y);
                        ctx.lineTo(wp.x - 5, wp.y + 14);
                        ctx.stroke();
                    } else if (this.weatherMode === 2) {
                        ctx.fillStyle = 'rgba(251, 146, 60, 0.72)';
                        ctx.beginPath();
                        ctx.arc(wp.x, wp.y, wp.size, 0, Math.PI * 2);
                        ctx.fill();
                    } else if (this.weatherMode === 3) {
                        ctx.fillStyle = 'rgba(241, 245, 249, 0.82)';
                        ctx.beginPath();
                        ctx.arc(wp.x, wp.y, wp.size * 1.1, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
                ctx.restore();
            }
        }
    
        // RTS Marquee Box-Lasso Selection Overlay
        if (this.lassoRect) {
            const r = this.lassoRect;
            const rx = Math.min(r.x1, r.x2);
            const ry = Math.min(r.y1, r.y2);
            const rw = Math.abs(r.x2 - r.x1);
            const rh = Math.abs(r.y2 - r.y1);
            ctx.fillStyle = 'rgba(74, 222, 128, 0.18)';
            ctx.strokeStyle = '#4ade80';
            ctx.lineWidth = 2;
            ctx.fillRect(rx, ry, rw, rh);
            ctx.strokeRect(rx, ry, rw, rh);
        }
    },

    render3DPlanetaryGlobe(ctx, w, h) {
        ctx.fillStyle = '#050811';
        ctx.fillRect(0, 0, w, h);

        // Deep-space twinkling starfield
        for (let i = 0; i < 70; i++) {
            const sx = ((i * 313 + 71) % 1009) / 1009 * w;
            const sy = ((i * 199 + 43) % 1013) / 1013 * h;
            const alpha = 0.35 + 0.55 * Math.abs(Math.sin(this.time * 1.6 + i));
            ctx.fillStyle = `rgba(226, 232, 240, ${alpha.toFixed(2)})`;
            ctx.fillRect(sx, sy, (i % 3 === 0 ? 2 : 1.3), (i % 3 === 0 ? 2 : 1.3));
        }

        const cx = w * 0.5;
        const cy = h * 0.5;
        const R = Math.min(w, h) * 0.34;

        // Outer atmospheric limb glow
        const atmo = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.18);
        atmo.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
        atmo.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = atmo;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.18, 0, Math.PI * 2);
        ctx.fill();
    
        const grad = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
        grad.addColorStop(0, '#0284c7');
        grad.addColorStop(0.7, '#0c4a6e');
        grad.addColorStop(1, '#090d16');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fill();

        // Subtle latitude rings
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.clip();
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.14)';
        ctx.lineWidth = 1;
        for (let lat = -2; lat <= 2; lat++) {
            const ly = cy + lat * R * 0.28 + Math.sin(this.globePitch) * R * 0.12;
            ctx.beginPath();
            ctx.ellipse(cx, ly, R, R * 0.16, 0, 0, Math.PI * 2);
            ctx.stroke();
        }
    
        for (let c = 0; c < CONTINENTS.length; c++) {
            const cont = CONTINENTS[c];
            const lon = (c / 6) * Math.PI * 2 + this.globeYaw;
            const x3d = Math.sin(lon);
            const z3d = Math.cos(lon);
            if (z3d > -0.15) {
                const sx = cx + x3d * R * 0.78;
                const sy = cy + Math.sin(this.globePitch) * R * 0.25;
                ctx.fillStyle = cont.grass;
                ctx.beginPath();
                ctx.ellipse(sx, sy, R * 0.22 * Math.max(0.25, z3d), R * 0.32, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fef08a';
                ctx.font = 'bold 11px Cinzel';
                ctx.textAlign = 'center';
                ctx.fillText(cont.name, sx, sy);
            }
        }

        // Drifting cloud wisps
        ctx.fillStyle = 'rgba(248, 250, 252, 0.14)';
        for (let cl = 0; cl < 5; cl++) {
            const clon = (cl * 1.25) + this.globeYaw + this.time * 0.08;
            const cz = Math.cos(clon);
            if (cz > 0) {
                const clx = cx + Math.sin(clon) * R * 0.75;
                const cly = cy + ((cl - 2) * 0.28) * R;
                ctx.beginPath();
                ctx.ellipse(clx, cly, R * 0.24 * cz, R * 0.06, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();

        // Orbital One-Ring Halo
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.85)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, R + 16, (R + 16) * 0.34, -0.22, 0, Math.PI * 2);
        ctx.stroke();
    },

    renderMinimapRadar() {
        const mctx = this.minimapCtx;
        if (!mctx) return;
        const mw = this.minimapCanvas.width;
        const mh = this.minimapCanvas.height;
        mctx.clearRect(0, 0, mw, mh);
    
        for (let c = 0; c < CONTINENTS.length; c++) {
            mctx.fillStyle = CONTINENTS[c].grass;
            mctx.fillRect((c / 6) * mw, 0, mw / 6, mh);
        }
        mctx.fillStyle = '#0284c7';
        mctx.fillRect(0, mh * 0.45, mw, 3);
    
        mctx.fillStyle = '#4ade80';
        for (let i = 0; i < this.villagers.length; i++) {
            const u = this.villagers[i];
            const mx = (u.x / WORLD_W) * mw;
            const my = ((u.y - 1200) / 1800) * mh;
            mctx.fillRect(mx, my, 2, 2);
        }
    
        mctx.fillStyle = '#f43f5e';
        for (let i = 0; i < this.enemies.length; i++) {
            const e = this.enemies[i];
            const mx = (e.x / WORLD_W) * mw;
            const my = ((e.y - 1200) / 1800) * mh;
            mctx.fillRect(mx, my, 2.5, 2.5);
        }
    
        const hero = this.villagers.find(v => v.isT101s);
        if (hero) {
            mctx.fillStyle = '#fde047';
            mctx.beginPath();
            mctx.arc((hero.x / WORLD_W) * mw, ((hero.y - 1200) / 8200) * mh, 3.5, 0, Math.PI * 2);
            mctx.fill();
        }
    
        const camX = (this.cam.x / WORLD_W) * mw;
        mctx.strokeStyle = '#ffffff';
        mctx.lineWidth = 1.2;
        mctx.strokeRect(camX - 10, 1, 20, mh - 2);
    }
};
