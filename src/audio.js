export class TribalAudioEngine {
    constructor() {
        this.ctx = null;
    }
    _init() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) this.ctx = new AC();
        }
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }
    play(kind) {
        try {
            this._init();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            if (kind === 'ring') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(520, now);
                osc.frequency.exponentialRampToValueAtTime(880, now + 0.22);
                gain.gain.setValueAtTime(0.06, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
                osc.start(now);
                osc.stop(now + 0.25);
            } else if (kind === 'bow') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(340, now);
                osc.frequency.exponentialRampToValueAtTime(140, now + 0.11);
                gain.gain.setValueAtTime(0.04, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
                osc.start(now);
                osc.stop(now + 0.13);
            } else if (kind === 'sword') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(250, now);
                osc.frequency.exponentialRampToValueAtTime(95, now + 0.09);
                gain.gain.setValueAtTime(0.035, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
                osc.start(now);
                osc.stop(now + 0.11);
            } else if (kind === 'horn') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(146, now);
                osc.frequency.exponentialRampToValueAtTime(220, now + 0.30);
                gain.gain.setValueAtTime(0.06, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
                osc.start(now);
                osc.stop(now + 0.33);
            } else if (kind === 'kalimba') {
                const notes = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3];
                osc.type = 'sine';
                osc.frequency.setValueAtTime(notes[Math.floor(Math.random() * notes.length)], now);
                gain.gain.setValueAtTime(0.035, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
                osc.start(now);
                osc.stop(now + 0.30);
            }
        } catch (e) {}
    }
}
