/**
 * FENCE SENTINEL - High-Performance Canvas Waveform Engine (waveform.js)
 * Handles 60FPS live oscilloscope rendering, spectrum visualizer, and 2D Signal Fingerprint radar charts.
 */

class WaveformEngine {
    constructor() {
        this.oscCanvas = null;
        this.oscCtx = null;
        this.specCanvas = null;
        this.specCtx = null;
        this.fpCanvas = null;
        this.fpCtx = null;

        this.buffer = new Float32Array(256);
        this.isPaused = false;
        this.animFrameId = null;
        this.themeColor = '#10B981'; // Default emerald

        // Initialize default waveform baseline
        for (let i = 0; i < this.buffer.length; i++) {
            this.buffer[i] = (Math.random() - 0.5) * 0.05;
        }
    }

    /**
     * Bind canvas HTML elements to the engine
     */
    initCanvases({ oscilloscopeId, spectrumId, fingerprintId }) {
        if (oscilloscopeId) {
            this.oscCanvas = document.getElementById(oscilloscopeId);
            if (this.oscCanvas) this.oscCtx = this.oscCanvas.getContext('2d');
        }

        if (spectrumId) {
            this.specCanvas = document.getElementById(spectrumId);
            if (this.specCanvas) this.specCtx = this.specCanvas.getContext('2d');
        }

        if (fingerprintId) {
            this.fpCanvas = document.getElementById(fingerprintId);
            if (this.fpCanvas) this.fpCtx = this.fpCanvas.getContext('2d');
        }

        this.handleResize();
        window.addEventListener('resize', () => this.handleResize());
        this.startLoop();
    }

    handleResize() {
        const resizeCanvas = (canvas) => {
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                canvas.width = rect.width * (window.devicePixelRatio || 1);
                canvas.height = rect.height * (window.devicePixelRatio || 1);
            }
        };

        resizeCanvas(this.oscCanvas);
        resizeCanvas(this.specCanvas);
        resizeCanvas(this.fpCanvas);
    }

    /**
     * Push new raw sample data into the buffer
     */
    pushSamples(newSamples, themeColor = null) {
        if (this.isPaused) return;
        if (themeColor) this.themeColor = themeColor;

        if (Array.isArray(newSamples) || newSamples instanceof Float32Array) {
            if (newSamples.length >= this.buffer.length) {
                this.buffer.set(newSamples.slice(newSamples.length - this.buffer.length));
            } else {
                // Shift left and append
                this.buffer.set(this.buffer.subarray(newSamples.length), 0);
                this.buffer.set(newSamples, this.buffer.length - newSamples.length);
            }
        }
    }

    /**
     * Main animation loop
     */
    startLoop() {
        const render = () => {
            if (!this.isPaused) {
                this.drawOscilloscope();
                this.drawSpectrum();
            }
            this.animFrameId = requestAnimationFrame(render);
        };
        render();
    }

    pause() {
        this.isPaused = true;
    }

    resume() {
        this.isPaused = false;
    }

    clear() {
        this.buffer.fill(0);
        this.drawOscilloscope();
        this.drawSpectrum();
    }

    /**
     * Draw 60FPS Time-Domain Oscilloscope
     */
    drawOscilloscope() {
        if (!this.oscCanvas || !this.oscCtx) return;
        const ctx = this.oscCtx;
        const width = this.oscCanvas.width;
        const height = this.oscCanvas.height;
        const dpr = window.devicePixelRatio || 1;

        // Clear background
        ctx.fillStyle = '#0B0F19';
        ctx.fillRect(0, 0, width, height);

        // Draw engineering grid lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1 * dpr;

        // Vertical grid lines
        const gridCols = 10;
        for (let i = 1; i < gridCols; i++) {
            const x = (width / gridCols) * i;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        // Horizontal grid lines & center baseline
        const gridRows = 6;
        for (let i = 1; i < gridRows; i++) {
            const y = (height / gridRows) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Center baseline highlight
        const centerY = height / 2;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Plot Waveform trace
        ctx.strokeStyle = this.themeColor;
        ctx.lineWidth = 2.5 * dpr;
        ctx.shadowColor = this.themeColor;
        ctx.shadowBlur = 10 * dpr;

        ctx.beginPath();
        const sliceWidth = width / (this.buffer.length - 1);
        let x = 0;

        for (let i = 0; i < this.buffer.length; i++) {
            // Buffer values mapped -3.0V .. +3.0V to Y coordinates
            const val = this.buffer[i];
            const y = centerY - (val * (height / 6.5));

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            x += sliceWidth;
        }
        ctx.stroke();
        ctx.shadowBlur = 0; // Reset glow

        // Draw Peak Voltage markers
        let maxVal = -Infinity;
        let minVal = Infinity;
        let maxIdx = 0;

        for (let i = 0; i < this.buffer.length; i++) {
            if (this.buffer[i] > maxVal) {
                maxVal = this.buffer[i];
                maxIdx = i;
            }
            if (this.buffer[i] < minVal) {
                minVal = this.buffer[i];
            }
        }

        if (maxVal > 0.4) {
            const peakX = maxIdx * sliceWidth;
            const peakY = centerY - (maxVal * (height / 6.5));

            ctx.fillStyle = '#EF4444';
            ctx.beginPath();
            ctx.arc(peakX, peakY, 4 * dpr, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.font = `${10 * dpr}px "JetBrains Mono", monospace`;
            ctx.fillText(`+${maxVal.toFixed(2)}V PK`, Math.min(width - 70 * dpr, peakX + 6 * dpr), peakY - 6 * dpr);
        }
    }

    /**
     * Draw Frequency Spectrum & Harmonics Bar Visualizer
     */
    drawSpectrum() {
        if (!this.specCanvas || !this.specCtx) return;
        const ctx = this.specCtx;
        const width = this.specCanvas.width;
        const height = this.specCanvas.height;
        const dpr = window.devicePixelRatio || 1;

        ctx.fillStyle = '#0B0F19';
        ctx.fillRect(0, 0, width, height);

        // Approximate FFT magnitude bins from buffer
        const numBins = 32;
        const barWidth = (width / numBins) - (2 * dpr);

        for (let i = 0; i < numBins; i++) {
            // Compute simple spectral energy estimate per bin
            let energy = 0;
            const step = Math.floor(this.buffer.length / numBins);
            for (let j = 0; j < step; j++) {
                energy += Math.abs(this.buffer[i * step + j] || 0);
            }
            energy = (energy / step) * 1.8;
            energy = Math.min(1.0, Math.max(0.04, energy));

            const barHeight = energy * (height * 0.85);
            const x = i * (barWidth + 2 * dpr);
            const y = height - barHeight;

            const gradient = ctx.createLinearGradient(0, height, 0, y);
            gradient.addColorStop(0, 'rgba(16, 185, 129, 0.2)');
            gradient.addColorStop(1, this.themeColor);

            ctx.fillStyle = gradient;
            ctx.fillRect(x, y, barWidth, barHeight);
        }
    }

    /**
     * Draw 2D Signal Fingerprint Radar / Polar Chart
     */
    drawFingerprint(fpData) {
        if (!this.fpCanvas || !this.fpCtx) return;
        const ctx = this.fpCtx;
        const width = this.fpCanvas.width;
        const height = this.fpCanvas.height;
        const dpr = window.devicePixelRatio || 1;

        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(centerX, centerY) * 0.70;

        ctx.fillStyle = '#0B0F19';
        ctx.fillRect(0, 0, width, height);

        const labels = ['AMPLITUDE', 'PERIODICITY', 'HARMONICS', 'STABILITY', 'SNR'];
        const values = [
            fpData.amplitude || 0.5,
            fpData.periodicity || 0.5,
            fpData.harmonicPurity || 0.5,
            fpData.stability || 0.5,
            fpData.snr || 0.5
        ];

        const numAxes = labels.length;

        // Concentric polygon background grids
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1 * dpr;

        for (let level = 1; level <= 4; level++) {
            const r = (radius / 4) * level;
            ctx.beginPath();
            for (let i = 0; i < numAxes; i++) {
                const angle = (Math.PI * 2 / numAxes) * i - Math.PI / 2;
                const x = centerX + Math.cos(angle) * r;
                const y = centerY + Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
        }

        // Radar axis lines & labels
        ctx.font = `${9 * dpr}px "JetBrains Mono", monospace`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';

        for (let i = 0; i < numAxes; i++) {
            const angle = (Math.PI * 2 / numAxes) * i - Math.PI / 2;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;

            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(x, y);
            ctx.stroke();

            // Label position offset
            const lx = centerX + Math.cos(angle) * (radius + 18 * dpr);
            const ly = centerY + Math.sin(angle) * (radius + 18 * dpr);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(labels[i], lx, ly);
        }

        // Draw Fingerprint polygon
        ctx.beginPath();
        for (let i = 0; i < numAxes; i++) {
            const val = Math.max(0.1, Math.min(1.0, values[i]));
            const r = radius * val;
            const angle = (Math.PI * 2 / numAxes) * i - Math.PI / 2;
            const x = centerX + Math.cos(angle) * r;
            const y = centerY + Math.sin(angle) * r;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();

        ctx.fillStyle = `${this.themeColor}33`; // 20% alpha
        ctx.fill();
        ctx.strokeStyle = this.themeColor;
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();
    }

    /**
     * Return base64 PNG data URL of current waveform canvas for reports
     */
    getCanvasDataURL() {
        return this.oscCanvas ? this.oscCanvas.toDataURL('image/png') : '';
    }
}

// Global Singleton Instance
window.waveformEngine = new WaveformEngine();
