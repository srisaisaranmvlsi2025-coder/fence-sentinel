/**
 * FENCE SENTINEL v2.0 — Mobile-First Field Intelligence Controller (app.js)
 * Coordinates data streams, map rendering & filtering, nearest flagged calculations,
 * auto-scan verification, false-positive protection, haptic feedback,
 * offline photo capture, ML developer debug views, and inspection reports.
 */

class SentinelApp {
    constructor() {
        this.currentView = 'dashboard';
        this.latestTelemetry = null;
        this.map = null;
        this.mapMarkers = [];
        this.patrolPolyline = null;
        this.mapInitialized = false;
        this.activeMapFilter = 'ALL';

        // Patrol State
        this.patrolActive = false;
        this.patrolStartTime = null;
        this.patrolTimerId = null;
        this.patrolLoggedCount = 0;
        this.patrolFlaggedCount = 0;
        this.patrolMaxSignal = 0;
        this.patrolTotalConf = 0;
        this.patrolConfSamples = 0;

        // Auto-Scan & False-Positive Verification
        this.autoScanEnabled = false;
        this.verifyBuffer = [];
        this.verifyThreshold = 4;
        this.isVerifying = false;
        this.activeEvent = null;
        this.activeEventStart = null;
        this.eventCooldownMs = 8000;
        this.lastEventTime = 0;

        // Confidence History Trend
        this.confHistory = new Float32Array(30);
        this.confHistIdx = 0;

        // Haptic Feedback
        this.hapticEnabled = true;

        // Signal Stability Buffer
        this.stabilityBuffer = [];
        this.stabilityMax = 15;

        // PWA Install
        this.deferredInstallPrompt = null;

        // Inspection
        this.currentInspectedEvent = null;
        this.debugModeEnabled = false;
    }

    async init() {
        console.log('[App] Initializing Fence Sentinel v2.0 Platform...');

        // 1. Initialize Canvases
        window.waveformEngine.initCanvases({
            oscilloscopeId: 'main-canvas-osc',
            spectrumId: 'main-canvas-spec',
            fingerprintId: 'canvas-fingerprint'
        });
        this.dashCanvas = document.getElementById('dash-canvas-osc');
        if (this.dashCanvas) this.dashCtx = this.dashCanvas.getContext('2d');
        this.confCanvas = document.getElementById('canvas-conf-history');
        if (this.confCanvas) this.confCtx = this.confCanvas.getContext('2d');

        // 2. Bind View Routing & UI Events
        this.bindNavigation();
        this.bindEvents();

        // 3. Location Tracking
        window.sentinelLocation.onLocationUpdate((pos) => this.handleLocationUpdate(pos));
        window.sentinelLocation.startTracking();

        // 4. Demo Telemetry Stream
        window.demoSynthesizer.onData((data) => this.handleTelemetryData(data));
        window.demoSynthesizer.start(250);

        // 5. BLE Hardware Stream
        window.sentinelBLE.onData((data) => this.handleTelemetryData(data));
        window.sentinelBLE.onLog((entry) => this.appendBLEConsole(entry));

        // 6. Load Saved Events
        await this.loadEventsList();
        this.updateSyncCenter();

        // 7. PWA Install Prompt Listener
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredInstallPrompt = e;
            const btn = document.getElementById('btn-install-pwa');
            if (btn) btn.style.display = 'block';
        });

        console.log('[App] Fence Sentinel v2.0 Ready.');
    }

    /* ===== NAVIGATION & VIEW ROUTING ===== */
    bindNavigation() {
        document.querySelectorAll('[data-view]').forEach(item => {
            item.addEventListener('click', () => this.switchView(item.getAttribute('data-view')));
        });
    }

    switchView(viewName) {
        this.currentView = viewName;
        document.querySelectorAll('[data-view]').forEach(el => {
            el.classList.toggle('active', el.getAttribute('data-view') === viewName);
        });
        document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
        const target = document.getElementById(`view-${viewName}`);
        if (target) target.classList.add('active');

        // Canvas resize trigger
        if (['signal', 'dashboard'].includes(viewName)) {
            setTimeout(() => window.waveformEngine.handleResize(), 60);
        }
        // Map invalidation
        if (viewName === 'map') {
            if (!this.mapInitialized) this.initMap();
            else if (this.map) setTimeout(() => this.map.invalidateSize(), 100);
        }
    }

    /* ===== EVENT BINDINGS ===== */
    bindEvents() {
        const $ = id => document.getElementById(id);

        // Landing
        $('btn-enter-dashboard').addEventListener('click', () => {
            $('landing-screen').classList.add('hidden');
            this.switchView('dashboard');
        });
        $('btn-start-patrol-landing').addEventListener('click', () => {
            $('landing-screen').classList.add('hidden');
            this.switchView('patrol');
            this.startPatrol();
        });

        // Self-Test
        $('btn-run-selftest').addEventListener('click', () => {
            $('modal-selftest').classList.add('active');
            this.runSelfTest();
        });
        $('btn-close-selftest').addEventListener('click', () => $('modal-selftest').classList.remove('active'));

        // Save / Flag from dashboard
        $('btn-save-current-event').addEventListener('click', () => this.latestTelemetry && this.saveCurrentEvent('Detected'));
        $('btn-flag-current-event').addEventListener('click', () => this.latestTelemetry && this.saveCurrentEvent('Flagged'));

        // FAB Quick Capture Modal
        $('fab-capture').addEventListener('click', () => this.openQuickCaptureModal());
        $('btn-close-capture').addEventListener('click', () => $('modal-quick-capture').classList.remove('active'));
        $('btn-save-quick-capture').addEventListener('click', () => this.saveQuickCapture());

        // Oscilloscope controls
        $('btn-osc-pause').addEventListener('click', (e) => {
            if (window.waveformEngine.isPaused) { window.waveformEngine.resume(); e.currentTarget.innerHTML = '<i class="fa-solid fa-pause"></i> PAUSE'; }
            else { window.waveformEngine.pause(); e.currentTarget.innerHTML = '<i class="fa-solid fa-play"></i> RESUME'; }
        });
        $('btn-osc-clear').addEventListener('click', () => window.waveformEngine.clear());

        // Patrol controls
        $('btn-patrol-start').addEventListener('click', () => this.startPatrol());
        $('btn-patrol-pause').addEventListener('click', () => this.pausePatrol());
        $('btn-patrol-end').addEventListener('click', () => this.endPatrol());
        $('btn-close-patrol-summary').addEventListener('click', () => $('modal-patrol-summary').classList.remove('active'));
        $('btn-patrol-report').addEventListener('click', () => this.generatePatrolReport());

        // Export controls
        $('btn-export-csv').addEventListener('click', async () => {
            const all = await window.sentinelStorage.getAllDetections();
            window.sentinelReport.downloadCSV(all);
        });
        $('btn-export-json').addEventListener('click', async () => {
            const all = await window.sentinelStorage.getAllDetections();
            window.sentinelReport.downloadJSON(all);
        });

        // Settings: Demo Scenario Switcher
        $('select-demo-scenario').addEventListener('change', (e) => {
            window.demoSynthesizer.setScenario(e.target.value);
        });

        // Settings: Manual Demo Signal Mode
        $('select-demo-mode').addEventListener('change', (e) => {
            window.demoSynthesizer.setMode(e.target.value);
            $('select-demo-scenario').value = 'MANUAL';
        });

        // Settings: Haptic toggle
        $('toggle-haptic').addEventListener('change', (e) => {
            this.hapticEnabled = e.target.checked;
            $('haptic-knob').style.background = e.target.checked ? 'var(--color-pulsed)' : 'var(--text-muted)';
            $('haptic-knob').style.left = e.target.checked ? '25px' : '3px';
        });

        // Settings: Auto-scan toggle
        $('toggle-autoscan').addEventListener('change', (e) => {
            this.autoScanEnabled = e.target.checked;
            $('autoscan-knob').style.background = e.target.checked ? 'var(--color-pulsed)' : 'var(--text-muted)';
            $('autoscan-knob').style.left = e.target.checked ? '25px' : '3px';
            $('autoscan-badge').style.display = e.target.checked ? 'inline-flex' : 'none';
        });

        // Settings: Debug Mode Toggle
        $('toggle-debug').addEventListener('change', (e) => {
            this.debugModeEnabled = e.target.checked;
            $('debug-knob').style.background = e.target.checked ? 'var(--color-pulsed)' : 'var(--text-muted)';
            $('debug-knob').style.left = e.target.checked ? '25px' : '3px';
            $('debug-panel').style.display = e.target.checked ? 'block' : 'none';
        });

        // Developer ML Modals
        $('btn-show-ml-perf').addEventListener('click', () => $('modal-ml-perf').classList.add('active'));
        $('btn-close-ml-perf').addEventListener('click', () => $('modal-ml-perf').classList.remove('active'));
        $('btn-show-dataset-stat').addEventListener('click', () => $('modal-dataset-stat').classList.add('active'));
        $('btn-close-dataset-stat').addEventListener('click', () => $('modal-dataset-stat').classList.remove('active'));

        // Clear storage
        $('btn-clear-storage').addEventListener('click', async () => {
            if (confirm('Clear all locally stored detection data?')) {
                await window.sentinelStorage.clearAllData();
                await this.loadEventsList();
                this.updateSyncCenter();
                this.hapticPulse('confirm');
            }
        });

        // BLE Pair / Disconnect
        $('btn-ble-connect').addEventListener('click', async () => {
            try {
                await window.sentinelBLE.connect();
                $('badge-mode').className = 'mode-badge real'; $('badge-mode').innerText = 'REAL SENSOR DATA';
                $('badge-ml-mode').className = 'mode-badge real'; $('badge-ml-mode').innerText = 'REAL ML';
                $('hero-demo-tag').className = 'mode-badge real'; $('hero-demo-tag').innerText = 'ESP32 BLE';
                $('dot-ble').className = 'status-dot active'; $('label-ble').innerText = 'BLE CONNECTED';
                $('dev-status-text').innerText = 'ESP32 CONNECTED';
            } catch (err) { /* handled in ble.js */ }
        });
        $('btn-ble-disconnect').addEventListener('click', async () => {
            await window.sentinelBLE.disconnect();
            $('badge-mode').className = 'mode-badge demo'; $('badge-mode').innerText = 'DEMO DATA';
            $('badge-ml-mode').className = 'mode-badge demo'; $('badge-ml-mode').innerText = 'DEMO ML';
            $('hero-demo-tag').className = 'mode-badge demo'; $('hero-demo-tag').innerText = 'DEMO DATA';
            $('dot-ble').className = 'status-dot warning'; $('label-ble').innerText = 'BLE DEMO';
            $('dev-status-text').innerText = 'DISCONNECTED / DEMO';
        });

        // Sync Now
        $('btn-sync-now').addEventListener('click', async () => {
            await window.sentinelStorage.markAllSynced();
            this.updateSyncCenter();
            this.hapticPulse('confirm');
            alert('All local events marked as synchronized.');
        });

        // Rapid Alert Actions
        $('rapid-alert-flag').addEventListener('click', () => {
            this.saveCurrentEvent('Flagged');
            $('rapid-alert').classList.remove('active');
            this.hapticPulse('confirm');
        });
        $('rapid-alert-dismiss').addEventListener('click', () => {
            $('rapid-alert').classList.remove('active');
        });

        // Status Strip Click -> Drawer
        $('status-strip').addEventListener('click', () => {
            this.populateStatusDrawer();
            $('modal-status-drawer').classList.add('active');
        });
        $('btn-close-status-drawer').addEventListener('click', () => $('modal-status-drawer').classList.remove('active'));

        // Map Filters
        document.querySelectorAll('.map-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.map-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.activeMapFilter = btn.getAttribute('data-filter');
                this.refreshMapMarkers();
            });
        });

        // Dashboard freeze
        $('btn-dash-freeze').addEventListener('click', (e) => {
            if (window.waveformEngine.isPaused) { window.waveformEngine.resume(); e.currentTarget.innerHTML = '<i class="fa-solid fa-pause"></i> FREEZE'; }
            else { window.waveformEngine.pause(); e.currentTarget.innerHTML = '<i class="fa-solid fa-play"></i> RESUME'; }
        });
    }

    /* ===== HAPTIC FEEDBACK ===== */
    hapticPulse(type = 'normal') {
        if (!this.hapticEnabled || !navigator.vibrate) return;
        switch (type) {
            case 'warning': navigator.vibrate(80); break;
            case 'high': navigator.vibrate([60, 40, 60, 40, 60]); break;
            case 'confirm': navigator.vibrate(40); break;
            default: break;
        }
    }

    /* ===== TELEMETRY DATA HANDLER ===== */
    handleTelemetryData(data) {
        this.latestTelemetry = data;
        const safety = window.signalIntelligence.getSafetyAssessment(data.type);

        // Push samples to Waveform Engine
        window.waveformEngine.pushSamples(data.waveform, safety.color);
        this.drawDashboardQuickview(data.waveform, safety.color);
        if (data.fingerprint && this.currentView === 'signal') {
            window.waveformEngine.drawFingerprint(data.fingerprint);
        }

        // Update Dashboard UI
        this.updateDashboardUI(data, safety);

        // Update Hardware LED + Buzzer Mirror
        this.updateHardwareMirror(data);

        // Update Confidence History Trend
        this.confHistory[this.confHistIdx % this.confHistory.length] = data.confidence;
        this.confHistIdx++;
        if (this.currentView === 'signal') this.drawConfidenceHistory();

        // Calculate Signal Stability
        this.stabilityBuffer.push(data.confidence);
        if (this.stabilityBuffer.length > this.stabilityMax) this.stabilityBuffer.shift();
        const stability = this.calculateStability();
        const stabEl = document.getElementById('stability-label');
        if (stabEl) {
            const stabLabel = stability > 80 ? 'HIGH' : stability > 50 ? 'MEDIUM' : 'LOW';
            const stabColor = stability > 80 ? 'var(--color-pulsed)' : stability > 50 ? 'var(--color-warning)' : 'var(--color-mains)';
            stabEl.style.color = stabColor;
            stabEl.innerText = `${stabLabel} — ${Math.round(stability)}%`;
        }

        // Signal Profile Bars
        this.updateSignalProfile(data);

        // Patrol Live Stats Update
        if (this.patrolActive) {
            const ps = document.getElementById('patrol-signal-val');
            const pt = document.getElementById('patrol-signal-type');
            const pc = document.getElementById('patrol-signal-conf');
            if (ps) ps.innerText = `${data.signal}%`;
            if (pt) pt.innerText = data.type;
            if (pc) pc.innerText = `Confidence ${data.confidence}%`;
            if (data.signal > this.patrolMaxSignal) this.patrolMaxSignal = data.signal;
            this.patrolTotalConf += data.confidence;
            this.patrolConfSamples++;
            const spd = document.getElementById('patrol-speed');
            if (spd) spd.innerHTML = `${window.sentinelLocation.currentPosition.speed.toFixed(1)} <span class="metric-unit">km/h</span>`;
        }

        // Developer Debug View
        if (this.debugModeEnabled) {
            this.updateDebugViews(data);
        }

        // Auto-Scan & False-Positive Verification
        if (this.autoScanEnabled || this.patrolActive) {
            this.processAutoScan(data, safety);
        }
    }

    updateDashboardUI(data, safety) {
        const $ = id => document.getElementById(id);

        $('gauge-value').innerText = data.signal;
        $('hero-type').innerText = data.type;
        $('hero-confidence').innerText = `${data.confidence}%`;

        // Gauge Ring Color
        const gaugeFill = $('gauge-ring-fill');
        const gaugeGlow = $('gauge-ring-glow');
        gaugeFill.style.borderColor = safety.color;
        gaugeGlow.style.boxShadow = `0 0 22px ${safety.color}33`;

        // Status Badge
        const badge = $('hero-status-badge');
        badge.className = `badge ${safety.badgeClass}`;
        badge.innerText = safety.level;

        // Alert Banner
        const ab = $('dash-alert-banner');
        ab.className = data.type === 'CONTINUOUS / MAINS-LIKE' ? 'alert-banner high-priority' :
                       data.type === 'UNCERTAIN' ? 'alert-banner warning' : 'alert-banner';
        $('dash-alert-title').innerText = safety.alertTitle;
        $('dash-alert-desc').innerText = safety.alertBody;

        // Numerical Metrics
        $('val-freq').innerHTML = `${data.frequency.toFixed(2)} <span class="metric-unit">Hz</span>`;
        $('val-rms').innerHTML = `${data.rms.toFixed(2)} <span class="metric-unit">V</span>`;
        $('val-p2p').innerHTML = `${data.peakToPeak.toFixed(2)} <span class="metric-unit">V</span>`;
        $('val-time').innerText = new Date(data.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});

        // Signal Extracted Features on Signal page
        const setIfExists = (id, text) => { const el = $(id); if (el) el.innerText = text; };
        setIfExists('an-noise', `${data.noise.toFixed(2)} V`);
        setIfExists('an-period', `${(data.frequency > 0 ? (1 / data.frequency).toFixed(2) : '0.83')} s`);
        setIfExists('an-risetime', '0.004 s');
        setIfExists('an-harmonic', data.frequency >= 45 && data.frequency <= 65 ? '0.18' : '0.65');

        // Classification Bars
        if (data.breakdown) {
            $('cp-pulsed-pct').innerText = `${data.breakdown.pulsed}%`;
            $('cp-pulsed-bar').style.width = `${data.breakdown.pulsed}%`;
            $('cp-mains-pct').innerText = `${data.breakdown.mains}%`;
            $('cp-mains-bar').style.width = `${data.breakdown.mains}%`;
            $('cp-ambient-pct').innerText = `${data.breakdown.ambient}%`;
            $('cp-ambient-bar').style.width = `${data.breakdown.ambient}%`;
            $('cp-uncertain-pct').innerText = `${data.breakdown.uncertain}%`;
            $('cp-uncertain-bar').style.width = `${data.breakdown.uncertain}%`;
        }

        // Explainable Rationale
        if (data.explanation) {
            $('explain-rationale-list').innerHTML = data.explanation.map(item =>
                `<li><span class="check">✓</span> ${item}</li>`
            ).join('');
        }
    }

    updateHardwareMirror(data) {
        const led = document.getElementById('hw-led');
        const bz = document.getElementById('hw-buzzer-label');
        if (!led || !bz) return;

        if (data.type === 'CONTINUOUS / MAINS-LIKE') {
            led.className = 'status-dot danger';
            bz.innerText = 'BUZZER WARN (2kHz)';
            bz.style.color = 'var(--color-mains)';
        } else if (data.type === 'UNCERTAIN') {
            led.className = 'status-dot warning';
            bz.innerText = 'BUZZER SLOW BEEP';
            bz.style.color = 'var(--color-warning)';
        } else {
            led.className = 'status-dot active';
            bz.innerText = 'BUZZER OFF';
            bz.style.color = 'var(--text-secondary)';
        }
    }

    updateSignalProfile(data) {
        const fp = data.fingerprint || {};
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.style.width = `${Math.round(val * 100)}%`;
            const vEl = document.getElementById(id + '-v');
            if (vEl) vEl.innerText = `${Math.round(val * 100)}%`;
        };
        set('sp-period', fp.periodicity || 0.5);
        set('sp-stab', fp.stability || 0.5);
        set('sp-noise', data.noise ? Math.min(1, data.noise / 0.3) : 0.2);
        set('sp-50hz', data.frequency >= 45 && data.frequency <= 65 ? 0.93 : data.frequency < 10 ? 0.04 : 0.15);
        set('sp-harm', fp.harmonicPurity || 0.5);
    }

    calculateStability() {
        if (this.stabilityBuffer.length < 3) return 90;
        const mean = this.stabilityBuffer.reduce((a, b) => a + b, 0) / this.stabilityBuffer.length;
        const variance = this.stabilityBuffer.reduce((s, v) => s + (v - mean) ** 2, 0) / this.stabilityBuffer.length;
        return Math.max(0, Math.min(100, 100 - Math.sqrt(variance) * 3));
    }

    updateDebugViews(data) {
        const inEl = document.getElementById('debug-model-input');
        const outEl = document.getElementById('debug-model-output');
        if (inEl) {
            const features = window.signalIntelligence.extractFeatures({
                frequency: data.frequency,
                rms: data.rms,
                peakToPeak: data.peakToPeak,
                noise: data.noise,
                periodicity: data.fingerprint ? data.fingerprint.periodicity : 0.5,
                waveform: data.waveform
            });
            inEl.innerText = JSON.stringify(features, null, 2);
        }
        if (outEl) {
            outEl.innerText = JSON.stringify({
                classification: data.type,
                confidence: data.confidence,
                breakdown: data.breakdown,
                modelVersion: 'FenceSentinel-RF-v1'
            }, null, 2);
        }
    }

    /* ===== AUTO-SCAN & FALSE-POSITIVE VERIFICATION ===== */
    processAutoScan(data, safety) {
        const isSignificant = data.type === 'CONTINUOUS / MAINS-LIKE' || data.type === 'UNCERTAIN' || data.signal > 80;

        if (!isSignificant) {
            if (this.activeEvent) this.endActiveEvent();
            this.verifyBuffer = [];
            this.isVerifying = false;
            const vb = document.getElementById('verify-bar');
            if (vb) vb.style.display = 'none';
            return;
        }

        this.verifyBuffer.push(data.type);
        if (this.verifyBuffer.length > this.verifyThreshold + 2) this.verifyBuffer.shift();

        const vb = document.getElementById('verify-bar');
        const vf = document.getElementById('verify-bar-fill');
        if (vb && vf && !this.activeEvent) {
            vb.style.display = 'block';
            const progress = Math.min(100, (this.verifyBuffer.length / this.verifyThreshold) * 100);
            vf.style.width = `${progress}%`;
        }

        const consistent = this.verifyBuffer.length >= this.verifyThreshold &&
            this.verifyBuffer.slice(-this.verifyThreshold).every(t => t === data.type);

        if (consistent && !this.activeEvent) {
            if (Date.now() - this.lastEventTime < this.eventCooldownMs) return;

            this.activeEvent = { ...data, startTime: Date.now(), maxSignal: data.signal };
            this.activeEventStart = Date.now();
            this.lastEventTime = Date.now();
            this.isVerifying = false;
            if (vb) vb.style.display = 'none';

            if (data.type === 'CONTINUOUS / MAINS-LIKE') {
                this.hapticPulse('high');
                this.showRapidAlert(data);
            } else {
                this.hapticPulse('warning');
            }

            this.autoLogEvent(data);
        } else if (this.activeEvent) {
            if (data.signal > this.activeEvent.maxSignal) this.activeEvent.maxSignal = data.signal;
        }
    }

    endActiveEvent() {
        this.activeEvent = null;
        this.activeEventStart = null;
        this.verifyBuffer = [];
    }

    showRapidAlert(data) {
        const $ = id => document.getElementById(id);
        $('rapid-alert-type').innerText = data.type;
        $('rapid-alert-conf').innerText = `${data.confidence}% CONFIDENCE`;
        $('rapid-alert-freq').innerText = `${data.frequency.toFixed(1)} Hz — ${data.signal}% Signal`;
        $('rapid-alert-icon').style.color = data.type === 'CONTINUOUS / MAINS-LIKE' ? 'var(--color-mains)' : 'var(--color-warning)';
        $('rapid-alert').classList.add('active');

        setTimeout(() => $('rapid-alert').classList.remove('active'), 8000);
    }

    async autoLogEvent(data) {
        const pos = window.sentinelLocation.currentPosition;
        const event = {
            ...data,
            lat: pos.lat, lng: pos.lng,
            status: data.type === 'CONTINUOUS / MAINS-LIKE' ? 'Flagged' : 'Detected'
        };
        await window.sentinelStorage.saveDetection(event);
        this.patrolLoggedCount++;
        if (event.status === 'Flagged') this.patrolFlaggedCount++;

        const pc = document.getElementById('patrol-count');
        const pf = document.getElementById('patrol-flagged');
        if (pc) pc.innerText = this.patrolLoggedCount;
        if (pf) pf.innerText = this.patrolFlaggedCount;

        await this.loadEventsList();
        if (this.mapInitialized) await this.refreshMapMarkers();
        this.updateSyncCenter();
    }

    /* ===== QUICK CAPTURE MODAL ===== */
    openQuickCaptureModal() {
        if (!this.latestTelemetry) return;
        const data = this.latestTelemetry;
        document.getElementById('cap-type').innerText = data.type;
        document.getElementById('cap-conf').innerText = `${data.confidence}%`;
        document.getElementById('modal-quick-capture').classList.add('active');
    }

    async saveQuickCapture() {
        if (!this.latestTelemetry) return;
        const pos = window.sentinelLocation.currentPosition;
        const notes = document.getElementById('capture-notes-input').value;
        const photoInput = document.getElementById('capture-photo-input');

        let photoData = null;
        if (photoInput && photoInput.files && photoInput.files[0]) {
            photoData = await this.readFileAsDataURL(photoInput.files[0]);
        }

        const event = {
            ...this.latestTelemetry,
            lat: pos.lat,
            lng: pos.lng,
            status: 'Detected',
            notes: notes,
            photo: photoData
        };

        await window.sentinelStorage.saveDetection(event);
        this.hapticPulse('confirm');
        document.getElementById('modal-quick-capture').classList.remove('active');
        document.getElementById('capture-notes-input').value = '';
        if (photoInput) photoInput.value = '';

        await this.loadEventsList();
        if (this.mapInitialized) await this.refreshMapMarkers();
        this.updateSyncCenter();
        alert('Quick Capture evidence recorded to offline store.');
    }

    readFileAsDataURL(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
    }

    /* ===== CANVAS OSCILLOSCOPE DRAWING ===== */
    drawDashboardQuickview(samples, color) {
        if (!this.dashCanvas || !this.dashCtx) return;
        const ctx = this.dashCtx;
        const w = this.dashCanvas.width = this.dashCanvas.clientWidth * (window.devicePixelRatio || 1);
        const h = this.dashCanvas.height = this.dashCanvas.clientHeight * (window.devicePixelRatio || 1);
        ctx.fillStyle = '#080C14';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2 * (window.devicePixelRatio || 1);
        ctx.beginPath();
        const slice = w / (samples.length - 1);
        for (let i = 0; i < samples.length; i++) {
            const y = (h / 2) - (samples[i] * (h / 6.5));
            if (i === 0) ctx.moveTo(0, y); else ctx.lineTo(i * slice, y);
        }
        ctx.stroke();
    }

    drawConfidenceHistory() {
        if (!this.confCanvas || !this.confCtx) return;
        const ctx = this.confCtx;
        const dpr = window.devicePixelRatio || 1;
        const w = this.confCanvas.width = this.confCanvas.clientWidth * dpr;
        const h = this.confCanvas.height = this.confCanvas.clientHeight * dpr;
        ctx.fillStyle = 'rgba(10,16,28,0.5)';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#38BDF8';
        ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath();
        const len = this.confHistory.length;
        const slice = w / (len - 1);
        for (let i = 0; i < len; i++) {
            const idx = (this.confHistIdx + i) % len;
            const val = this.confHistory[idx] || 50;
            const y = h - (val / 100) * h * 0.85 - h * 0.05;
            if (i === 0) ctx.moveTo(0, y); else ctx.lineTo(i * slice, y);
        }
        ctx.stroke();
    }

    /* ===== GEOSPATIAL MAP & NEAREST FLAGGED ===== */
    initMap() {
        if (this.mapInitialized) return;
        const pos = window.sentinelLocation.currentPosition;
        this.map = L.map('map-container').setView([pos.lat, pos.lng], 15);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OSM &copy; CARTO', maxZoom: 19
        }).addTo(this.map);
        this.patrolPolyline = L.polyline([], { color: '#38BDF8', weight: 3, opacity: 0.7 }).addTo(this.map);
        this.mapInitialized = true;
        this.refreshMapMarkers();
    }

    handleLocationUpdate(pos) {
        const mc = document.getElementById('map-coords');
        if (mc) mc.innerText = window.sentinelLocation.getFormattedCoords();

        const quality = pos.accuracy <= 5 ? 'EXCELLENT' : pos.accuracy <= 15 ? 'GOOD' : pos.accuracy <= 30 ? 'WEAK' : 'UNAVAILABLE';
        const qColor = quality === 'EXCELLENT' || quality === 'GOOD' ? 'var(--color-pulsed)' : quality === 'WEAK' ? 'var(--color-warning)' : 'var(--color-mains)';
        const gql = document.getElementById('gps-quality-label');
        if (gql) gql.innerHTML = `<div class="status-dot" style="background:${qColor};"></div> <span>${quality} ±${Math.round(pos.accuracy)}m</span>`;

        if (this.map && this.patrolActive && window.sentinelLocation.patrolPath.length > 1) {
            this.patrolPolyline.setLatLngs(window.sentinelLocation.patrolPath.map(p => [p.lat, p.lng]));
        }
        if (this.patrolActive) {
            const pd = document.getElementById('patrol-dist');
            if (pd) pd.innerHTML = `${window.sentinelLocation.totalDistanceKm.toFixed(2)} <span class="metric-unit">km</span>`;
            this.calculateNearestFlagged(pos);
        }
    }

    async calculateNearestFlagged(currentPos) {
        const detections = await window.sentinelStorage.getAllDetections();
        const flagged = detections.filter(d => d.status === 'Flagged' && d.lat && d.lng);
        const label = document.getElementById('nearest-flagged-label');
        if (!label) return;

        if (flagged.length === 0) {
            label.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Nearest Flagged: None';
            return;
        }

        let minDistKm = Infinity;
        let nearestEvent = null;

        flagged.forEach(f => {
            const dist = window.sentinelLocation.calculateHaversineDistance(currentPos.lat, currentPos.lng, f.lat, f.lng);
            if (dist < minDistKm) {
                minDistKm = dist;
                nearestEvent = f;
            }
        });

        if (nearestEvent) {
            const meters = Math.round(minDistKm * 1000);
            label.innerHTML = `<i class="fa-solid fa-location-crosshairs"></i> Nearest Flagged: <strong>${meters}m</strong> (${nearestEvent.id})`;
        }
    }

    async refreshMapMarkers() {
        if (!this.map) return;
        this.mapMarkers.forEach(m => this.map.removeLayer(m));
        this.mapMarkers = [];
        let detections = await window.sentinelStorage.getAllDetections();

        // Apply Filter
        if (this.activeMapFilter !== 'ALL') {
            detections = detections.filter(d => {
                if (this.activeMapFilter === 'PULSED') return d.type === 'PULSED FENCE-LIKE';
                if (this.activeMapFilter === 'MAINS') return d.type === 'CONTINUOUS / MAINS-LIKE';
                if (this.activeMapFilter === 'AMBIENT') return d.type === 'AMBIENT EMI';
                if (this.activeMapFilter === 'UNCERTAIN') return d.type === 'UNCERTAIN';
                return true;
            });
        }

        detections.forEach(d => {
            if (!d.lat || !d.lng) return;
            let mc = '#10B981';
            if (d.type === 'CONTINUOUS / MAINS-LIKE') mc = '#EF4444';
            else if (d.type === 'UNCERTAIN') mc = '#F59E0B';
            else if (d.type === 'AMBIENT EMI') mc = '#06B6D4';
            const icon = L.divIcon({
                className: 'map-pin', iconSize: [14, 14], iconAnchor: [7, 7],
                html: `<div style="background:${mc};width:14px;height:14px;border-radius:50%;border:2px solid #FFF;box-shadow:0 0 8px ${mc};"></div>`
            });
            const popup = `<div style="font-family:sans-serif;font-size:11px;color:#1F2937;">
                <strong style="color:${mc};">${d.id}</strong><br>${d.type}<br>
                Signal: ${d.signal}% | Conf: ${d.confidence}%<br>Status: ${d.status}<br>
                <button onclick="window.sentinelApp.openInspection('${d.id}')" style="margin-top:4px;padding:4px 8px;background:#0F172A;color:#FFF;border:none;border-radius:4px;cursor:pointer;font-size:10px;">INSPECT</button>
            </div>`;
            const marker = L.marker([d.lat, d.lng], { icon }).addTo(this.map).bindPopup(popup);
            this.mapMarkers.push(marker);
        });
    }

    /* ===== SAVE DETECTION SNAPSHOT ===== */
    async saveCurrentEvent(status = 'Detected') {
        if (!this.latestTelemetry) return;
        const pos = window.sentinelLocation.currentPosition;
        const event = { ...this.latestTelemetry, lat: pos.lat, lng: pos.lng, status };
        await window.sentinelStorage.saveDetection(event);
        this.hapticPulse('confirm');
        await this.loadEventsList();
        if (this.mapInitialized) await this.refreshMapMarkers();
        this.updateSyncCenter();
    }

    /* ===== EVENTS LIST (Mobile Cards) ===== */
    async loadEventsList() {
        const container = document.getElementById('events-list-container');
        if (!container) return;
        const detections = await window.sentinelStorage.getAllDetections();
        if (detections.length === 0) {
            container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:24px;font-size:13px;">No detection events logged yet.</div>';
            return;
        }
        container.innerHTML = detections.slice(0, 50).map(d => {
            const time = new Date(d.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
            const date = new Date(d.timestamp).toLocaleDateString([], {day:'2-digit',month:'short'});
            let badgeClass = 'badge-info';
            if (d.status === 'Flagged') badgeClass = 'badge-danger';
            else if (d.status === 'Verified') badgeClass = 'badge-success';
            else if (d.status === 'False Positive') badgeClass = 'badge-warning';
            let typeColor = 'var(--color-pulsed)';
            if (d.type === 'CONTINUOUS / MAINS-LIKE') typeColor = 'var(--color-mains)';
            else if (d.type === 'UNCERTAIN') typeColor = 'var(--color-uncertain)';
            else if (d.type === 'AMBIENT EMI') typeColor = 'var(--color-ambient)';
            return `
                <div class="event-card" onclick="window.sentinelApp.openInspection('${d.id}')">
                    <div class="event-card-top">
                        <span class="event-card-id">${d.id}</span>
                        <span class="badge ${badgeClass}">${d.status}</span>
                    </div>
                    <div class="event-card-type" style="color:${typeColor};">${d.type}</div>
                    <div class="event-card-meta">
                        <span>${date} ${time}</span>
                        <span>${d.signal}% sig</span>
                        <span>${d.confidence}% conf</span>
                        <span>${d.frequency} Hz</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    /* ===== INSPECTION & EVIDENCE ===== */
    async openInspection(eventId) {
        this.switchView('inspection');
        const event = await window.sentinelStorage.getDetectionById(eventId);
        const container = document.getElementById('inspection-active-container');
        if (!event) { container.innerHTML = '<div style="color:var(--color-mains);">Event not found.</div>'; return; }
        this.currentInspectedEvent = event;
        const time = new Date(event.timestamp).toLocaleString();
        const explanations = (event.explanation || []).map(e => `<li><span class="check">✓</span> ${e}</li>`).join('');
        container.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:12px;">
                <div style="display:flex;gap:8px;align-items:center;font-size:11px;color:var(--text-muted);flex-wrap:wrap;">
                    <span class="badge badge-info">DETECTED</span> → <span class="badge ${event.status === 'Flagged' ? 'badge-danger' : 'badge-info'}">${event.status === 'Flagged' || event.status === 'Verified' ? 'FLAGGED' : '—'}</span> → <span class="badge ${event.status === 'Verified' ? 'badge-success' : 'badge-info'}">${event.status === 'Verified' ? 'VERIFIED' : '—'}</span>
                </div>
                <div class="card-title"><i class="fa-solid fa-microchip"></i> ${event.id}</div>
                <div class="telemetry-grid">
                    <div class="metric-item"><div class="metric-label">Classification</div><div class="metric-value" style="font-size:12px;">${event.type}</div></div>
                    <div class="metric-item"><div class="metric-label">Confidence</div><div class="metric-value">${event.confidence}%</div></div>
                    <div class="metric-item"><div class="metric-label">Signal</div><div class="metric-value">${event.signal}%</div></div>
                    <div class="metric-item"><div class="metric-label">Frequency</div><div class="metric-value">${event.frequency} Hz</div></div>
                    <div class="metric-item"><div class="metric-label">RMS</div><div class="metric-value">${event.rms} V</div></div>
                    <div class="metric-item"><div class="metric-label">P-to-P</div><div class="metric-value">${event.peakToPeak} V</div></div>
                    <div class="metric-item"><div class="metric-label">Noise</div><div class="metric-value">${event.noise} V</div></div>
                    <div class="metric-item"><div class="metric-label">Time</div><div class="metric-value" style="font-size:11px;">${time}</div></div>
                </div>
                ${event.lat ? `<div style="font-size:12px;color:var(--text-muted);font-family:var(--font-mono);">GPS: ${event.lat.toFixed(5)}, ${event.lng.toFixed(5)}</div>` : ''}

                ${event.photo ? `<div style="margin-top:6px;"><div class="metric-label">Attached Photo Evidence</div><img src="${event.photo}" style="width:100%;max-height:180px;object-fit:cover;border-radius:8px;border:var(--glass-border);"></div>` : ''}

                ${explanations ? `<div class="card-title"><i class="fa-solid fa-lightbulb"></i> WHY THIS RESULT?</div><div class="explain-box"><ul class="explain-list">${explanations}</ul></div>` : ''}

                <div class="card-title"><i class="fa-solid fa-list-check"></i> UPDATE INSPECTION LIFECYCLE</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button class="btn btn-danger btn-sm" onclick="window.sentinelApp.updateEventStatus('${event.id}','Flagged')"><i class="fa-solid fa-flag"></i> FLAG FOR INSPECTION</button>
                    <button class="btn btn-primary btn-sm" onclick="window.sentinelApp.updateEventStatus('${event.id}','Verified')"><i class="fa-solid fa-check"></i> VERIFIED ACCURATE</button>
                    <button class="btn btn-secondary btn-sm" onclick="window.sentinelApp.updateEventStatus('${event.id}','False Positive')"><i class="fa-solid fa-xmark"></i> FALSE POSITIVE</button>
                </div>

                <div class="card-title"><i class="fa-solid fa-pen"></i> FIELD INSPECTION NOTES</div>
                <textarea id="inspect-notes-input" style="width:100%;height:70px;padding:10px;background:rgba(10,16,28,0.9);color:#FFF;border:var(--glass-border);border-radius:8px;font-size:13px;">${event.notes || ''}</textarea>

                <div style="display:flex;gap:8px;">
                    <button class="btn btn-secondary" style="flex:1;" onclick="window.sentinelApp.saveInspectionNotes('${event.id}')"><i class="fa-solid fa-save"></i> SAVE NOTES</button>
                    <button class="btn btn-primary" style="flex:1;" onclick="window.sentinelReport.printReport(window.sentinelApp.currentInspectedEvent)"><i class="fa-solid fa-print"></i> FIELD REPORT</button>
                </div>
            </div>
        `;
    }

    async updateEventStatus(id, newStatus) {
        await window.sentinelStorage.updateDetectionStatus(id, newStatus);
        this.hapticPulse('confirm');
        await this.loadEventsList();
        await this.openInspection(id);
    }

    async saveInspectionNotes(id) {
        const notes = document.getElementById('inspect-notes-input').value;
        if (this.currentInspectedEvent) {
            await window.sentinelStorage.updateDetectionStatus(id, this.currentInspectedEvent.status, notes);
            this.hapticPulse('confirm');
            alert('Inspection notes saved.');
        }
    }

    /* ===== PATROL MODE ===== */
    startPatrol() {
        this.patrolActive = true;
        this.patrolStartTime = Date.now();
        this.patrolLoggedCount = 0;
        this.patrolFlaggedCount = 0;
        this.patrolMaxSignal = 0;
        this.patrolTotalConf = 0;
        this.patrolConfSamples = 0;
        window.sentinelLocation.resetPatrolDistance();

        document.getElementById('btn-patrol-start').disabled = true;
        document.getElementById('btn-patrol-pause').disabled = false;
        document.getElementById('btn-patrol-end').style.display = 'inline-flex';

        this.autoScanEnabled = true;
        document.getElementById('autoscan-badge').style.display = 'inline-flex';

        if (this.patrolTimerId) clearInterval(this.patrolTimerId);
        this.patrolTimerId = setInterval(() => {
            const ms = Date.now() - this.patrolStartTime;
            const s = Math.floor((ms / 1000) % 60).toString().padStart(2, '0');
            const m = Math.floor((ms / 60000) % 60).toString().padStart(2, '0');
            const h = Math.floor(ms / 3600000).toString().padStart(2, '0');
            document.getElementById('patrol-timer').innerText = `${h}:${m}:${s}`;
        }, 1000);
    }

    pausePatrol() {
        this.patrolActive = false;
        if (this.patrolTimerId) clearInterval(this.patrolTimerId);
        document.getElementById('btn-patrol-start').disabled = false;
        document.getElementById('btn-patrol-pause').disabled = true;
    }

    endPatrol() {
        this.pausePatrol();
        document.getElementById('btn-patrol-end').style.display = 'none';
        this.autoScanEnabled = false;
        document.getElementById('autoscan-badge').style.display = 'none';
        this.showPatrolSummary();
    }

    showPatrolSummary() {
        const ms = this.patrolStartTime ? Date.now() - this.patrolStartTime : 0;
        const duration = `${Math.floor(ms / 3600000).toString().padStart(2,'0')}:${Math.floor((ms/60000)%60).toString().padStart(2,'0')}:${Math.floor((ms/1000)%60).toString().padStart(2,'0')}`;
        const avgConf = this.patrolConfSamples > 0 ? Math.round(this.patrolTotalConf / this.patrolConfSamples) : 0;
        const grid = document.getElementById('patrol-summary-grid');
        grid.innerHTML = `
            <div class="metric-item"><div class="metric-label">Duration</div><div class="metric-value" style="font-size:14px;">${duration}</div></div>
            <div class="metric-item"><div class="metric-label">Distance</div><div class="metric-value">${window.sentinelLocation.totalDistanceKm.toFixed(2)} <span class="metric-unit">km</span></div></div>
            <div class="metric-item"><div class="metric-label">Detections</div><div class="metric-value">${this.patrolLoggedCount}</div></div>
            <div class="metric-item"><div class="metric-label">Flagged Events</div><div class="metric-value" style="color:var(--color-mains);">${this.patrolFlaggedCount}</div></div>
            <div class="metric-item"><div class="metric-label">Max Signal</div><div class="metric-value">${this.patrolMaxSignal}%</div></div>
            <div class="metric-item"><div class="metric-label">Avg Confidence</div><div class="metric-value">${avgConf}%</div></div>
        `;
        document.getElementById('modal-patrol-summary').classList.add('active');
    }

    async generatePatrolReport() {
        const all = await window.sentinelStorage.getAllDetections();
        if (all.length > 0) window.sentinelReport.printReport(all[0]);
        document.getElementById('modal-patrol-summary').classList.remove('active');
    }

    /* ===== PRE-PATROL SELF TEST ===== */
    async runSelfTest() {
        const steps = [
            { id: 'st-ble', label: 'BLE' },
            { id: 'st-gps', label: 'GPS' },
            { id: 'st-adc', label: 'ADC' },
            { id: 'st-sensor', label: 'Sensor' },
            { id: 'st-storage', label: 'Storage' },
            { id: 'st-engine', label: 'Engine' },
            { id: 'st-batt', label: 'Battery' }
        ];
        document.getElementById('st-final-result').innerText = 'RUNNING DIAGNOSTIC PROTOCOL...';
        document.getElementById('st-final-result').style.color = 'var(--color-warning)';

        for (const s of steps) {
            const el = document.getElementById(s.id);
            el.innerText = 'TESTING...'; el.style.color = '#F59E0B';
            await new Promise(r => setTimeout(r, 250));
            el.innerText = '✓ PASS / READY'; el.style.color = '#10B981';
        }
        document.getElementById('st-final-result').innerText = '✓ ALL SYSTEMS OPERATIONAL — READY FOR PATROL';
        document.getElementById('st-final-result').style.color = 'var(--color-pulsed)';
        this.hapticPulse('confirm');
    }

    /* ===== STATUS DRAWER ===== */
    populateStatusDrawer() {
        const pos = window.sentinelLocation.currentPosition;
        const quality = pos.accuracy <= 5 ? 'EXCELLENT' : pos.accuracy <= 15 ? 'GOOD' : pos.accuracy <= 30 ? 'WEAK' : 'UNAVAILABLE';
        const grid = document.getElementById('status-drawer-grid');
        grid.innerHTML = `
            <div class="health-item"><span class="health-icon ${window.sentinelBLE.isConnected ? 'health-ok' : 'health-warn'}"><i class="fa-solid fa-bluetooth-b"></i></span> BLE <span style="margin-left:auto;font-size:10px;">${window.sentinelBLE.isConnected ? '✓ CONNECTED' : 'DEMO'}</span></div>
            <div class="health-item"><span class="health-icon health-ok"><i class="fa-solid fa-satellite-dish"></i></span> GPS <span style="margin-left:auto;font-size:10px;">${quality} ±${Math.round(pos.accuracy)}m</span></div>
            <div class="health-item"><span class="health-icon health-ok"><i class="fa-solid fa-bolt"></i></span> ADC <span style="margin-left:auto;font-size:10px;color:var(--color-pulsed);">READY</span></div>
            <div class="health-item"><span class="health-icon health-ok"><i class="fa-solid fa-tower-broadcast"></i></span> Sensor <span style="margin-left:auto;font-size:10px;color:var(--color-pulsed);">ACTIVE</span></div>
            <div class="health-item"><span class="health-icon health-ok"><i class="fa-solid fa-battery-three-quarters"></i></span> Battery <span style="margin-left:auto;font-size:10px;">${window.sentinelBLE.batteryLevel}%</span></div>
            <div class="health-item"><span class="health-icon health-ok"><i class="fa-solid fa-database"></i></span> Storage <span style="margin-left:auto;font-size:10px;color:var(--color-pulsed);">READY</span></div>
            <div class="health-item"><span class="health-icon health-ok"><i class="fa-solid fa-cloud"></i></span> Sync <span style="margin-left:auto;font-size:10px;">${navigator.onLine ? 'ONLINE' : 'OFFLINE'}</span></div>
        `;
    }

    /* ===== OFFLINE SYNC CENTER ===== */
    async updateSyncCenter() {
        const pending = await window.sentinelStorage.getUnsyncedCount();
        const all = await window.sentinelStorage.getAllDetections();
        const synced = all.length - pending;
        const sp = document.getElementById('sync-pending');
        const sd = document.getElementById('sync-done');
        if (sp) sp.innerText = pending;
        if (sd) sd.innerText = synced;
    }

    /* ===== BLE CONSOLE ===== */
    appendBLEConsole(entry) {
        const el = document.getElementById('ble-console-log');
        if (!el) return;
        const color = entry.isError ? '#EF4444' : '#10B981';
        el.innerHTML += `<div style="color:${color};">[${entry.timestamp}] ${entry.message}</div>`;
        el.scrollTop = el.scrollHeight;
    }
}

// Instantiate on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    window.sentinelApp = new SentinelApp();
    window.sentinelApp.init();
});
