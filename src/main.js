import { CONTINENTS } from './constants.js';
import { PrehistoricPlanetaryGame } from './simulation.js';
import { installIsometricGraphicsUpgrade } from './isometric_upgrade.js';

installIsometricGraphicsUpgrade(PrehistoricPlanetaryGame);

let game = null;
window.addEventListener('load', () => {
    game = new PrehistoricPlanetaryGame();
    window.game = game;
    let lastTime = performance.now();
    function loop(now) {
        const dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;
        game._fpsFrames++;
        game._fpsAccum += dt;
        if (game._fpsAccum >= 0.5) {
            game.fps = Math.round(game._fpsFrames / game._fpsAccum);
            game._fpsFrames = 0;
            game._fpsAccum = 0;
            const fpsEl = document.getElementById('perfFps');
            if (fpsEl) fpsEl.textContent = `${game.fps} FPS`;
            const contEl = document.getElementById('perfContinent');
            if (contEl) contEl.textContent = game.getContinentAt(game.cam.x).name;
        }
        game.update(dt);
        game.render();
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
});
