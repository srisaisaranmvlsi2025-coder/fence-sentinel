/**
 * FENCE SENTINEL - Realistic Multi-Signal Waveform & Telemetry Synthesizer (demo.js)
 * Generates physical waveform math, dynamic patrol scenarios, & JSON payload streams
 * for demo mode development, field testing, and evaluation.
 */

class DemoSignalSynthesizer {
    constructor() {
        this.activeMode = 'PULSED_FENCE'; // Default demo mode
        this.activeScenario = 'NORMAL_PATROL'; // Default scenario
        this.scenarioStep = 0;
        this.scenarioTimer = 0;
        this.phase = 0;
        this.sampleRate = 1000; // 1000 Hz ADC sample rate
        this.bufferSize = 256;
        this.intervalId = null;
        this.listeners = [];
        this.isDemoActive = true;
    }

    setMode(modeKey) {
        this.activeMode = modeKey;
        this.activeScenario = 'MANUAL';
        console.log(`[Demo] Switch signal mode to ${modeKey}`);
    }

    setScenario(scenarioKey) {
        this.activeScenario = scenarioKey;
        this.scenarioStep = 0;
        this.scenarioTimer = Date.now();
        console.log(`[Demo] Switch scenario to ${scenarioKey}`);
    }

    onData(callback) {
        this.listeners.push(callback);
    }

    start(intervalMs = 200) {
        if (this.intervalId) clearInterval(this.intervalId);
        
        this.intervalId = setInterval(() => {
            if (!this.isDemoActive) return;
            this.updateScenarioProgression();
            const telemetry = this.generateFrame();
            this.listeners.forEach(cb => cb(telemetry));
        }, intervalMs);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * Dynamic scenario runner for real-world patrol testing
     */
    updateScenarioProgression() {
        if (this.activeScenario === 'MANUAL') return;

        const elapsed = (Date.now() - this.scenarioTimer) / 1000;

        switch (this.activeScenario) {
            case 'NORMAL_PATROL':
                // Steady standard pulsed energizer
                this.activeMode = 'PULSED_FENCE';
                break;

            case 'SINGLE_WARNING':
                // Pulsed for 8s -> Uncertain burst for 4s -> back to Pulsed
                if (elapsed % 16 < 8) {
                    this.activeMode = 'PULSED_FENCE';
                } else if (elapsed % 16 < 12) {
                    this.activeMode = 'UNCERTAIN';
                } else {
                    this.activeMode = 'PULSED_FENCE';
                }
                break;

            case 'REPEATED_MAINS':
                // Pulsed for 5s -> High-priority 50Hz Mains for 10s -> Ambient for 5s -> Repeat
                if (elapsed % 20 < 5) {
                    this.activeMode = 'PULSED_FENCE';
                } else if (elapsed % 20 < 15) {
                    this.activeMode = 'MAINS_LIKE';
                } else {
                    this.activeMode = 'AMBIENT_EMI';
                }
                break;

            case 'NOISY_ENV':
                // High noise background with occasional faint pulses
                if (elapsed % 10 < 7) {
                    this.activeMode = 'AMBIENT_EMI';
                } else {
                    this.activeMode = 'UNCERTAIN';
                }
                break;
        }
    }

    /**
     * Synthesize realistic physical waveform samples and ADC telemetry payload
     */
    generateFrame() {
        const samples = new Float32Array(this.bufferSize);
        let frequency = 0;
        let rms = 0;
        let peakToPeak = 0;
        let noise = 0.08;
        let periodicity = 0.5;
        let signalStrength = 50;

        const timeStep = 1 / this.sampleRate;

        switch (this.activeMode) {
            case 'PULSED_FENCE': {
                // High voltage sharp pulse repeating every ~0.83 seconds (1.20 Hz)
                const pulsePeriod = 0.83; // seconds
                frequency = 1.20;
                signalStrength = 84 + Math.floor(Math.random() * 8); // 84-91%
                periodicity = 0.94;
                noise = 0.05 + Math.random() * 0.03;

                let sumSq = 0;
                let maxVal = -Infinity;
                let minVal = Infinity;

                for (let i = 0; i < this.bufferSize; i++) {
                    const t = (this.phase + i) * timeStep;
                    const modT = t % pulsePeriod;

                    let sample = (Math.random() - 0.5) * noise; // Baseline noise

                    // Sharp impulse exponential spike
                    if (modT < 0.03) {
                        const pulsePhase = modT / 0.03;
                        sample += 2.4 * Math.sin(pulsePhase * Math.PI) * Math.exp(-pulsePhase * 3);
                    }

                    samples[i] = sample;
                    sumSq += sample * sample;
                    if (sample > maxVal) maxVal = sample;
                    if (sample < minVal) minVal = sample;
                }

                rms = Math.sqrt(sumSq / this.bufferSize);
                peakToPeak = maxVal - minVal;
                break;
            }

            case 'MAINS_LIKE': {
                // Continuous 50.0 Hz power line sinusoidal field with minor 3rd harmonic distortion
                frequency = 50.0 + (Math.random() - 0.5) * 0.4;
                signalStrength = 90 + Math.floor(Math.random() * 7); // 90-96%
                periodicity = 0.20; // Low pulse gap periodicity, high duty cycle
                noise = 0.04 + Math.random() * 0.02;

                let sumSq = 0;
                let maxVal = -Infinity;
                let minVal = Infinity;

                for (let i = 0; i < this.bufferSize; i++) {
                    const t = (this.phase + i) * timeStep;
                    // Fundamental 50Hz + 150Hz harmonic + random noise
                    let sample = 1.25 * Math.sin(2 * Math.PI * frequency * t) 
                               + 0.18 * Math.sin(2 * Math.PI * 3 * frequency * t)
                               + (Math.random() - 0.5) * noise;

                    samples[i] = sample;
                    sumSq += sample * sample;
                    if (sample > maxVal) maxVal = sample;
                    if (sample < minVal) minVal = sample;
                }

                rms = Math.sqrt(sumSq / this.bufferSize);
                peakToPeak = maxVal - minVal;
                break;
            }

            case 'AMBIENT_EMI': {
                // Random low amplitude high frequency noise floor (solar/radio/motor EMI)
                frequency = 120.0 + Math.random() * 80;
                signalStrength = 18 + Math.floor(Math.random() * 12); // 18-30%
                periodicity = 0.15;
                noise = 0.18 + Math.random() * 0.08;

                let sumSq = 0;
                let maxVal = -Infinity;
                let minVal = Infinity;

                for (let i = 0; i < this.bufferSize; i++) {
                    const t = (this.phase + i) * timeStep;
                    let sample = 0.12 * Math.sin(2 * Math.PI * frequency * t)
                               + (Math.random() - 0.5) * noise;

                    samples[i] = sample;
                    sumSq += sample * sample;
                    if (sample > maxVal) maxVal = sample;
                    if (sample < minVal) minVal = sample;
                }

                rms = Math.sqrt(sumSq / this.bufferSize);
                peakToPeak = maxVal - minVal;
                break;
            }

            case 'UNCERTAIN':
            default: {
                // Irregular transient pulses obscuring classification
                frequency = 8.5 + Math.random() * 15;
                signalStrength = 45 + Math.floor(Math.random() * 20);
                periodicity = 0.42;
                noise = 0.22 + Math.random() * 0.10;

                let sumSq = 0;
                let maxVal = -Infinity;
                let minVal = Infinity;

                for (let i = 0; i < this.bufferSize; i++) {
                    const t = (this.phase + i) * timeStep;
                    let sample = 0.55 * Math.sin(2 * Math.PI * frequency * t)
                               + (Math.random() > 0.95 ? (Math.random() - 0.5) * 1.8 : 0)
                               + (Math.random() - 0.5) * noise;

                    samples[i] = sample;
                    sumSq += sample * sample;
                    if (sample > maxVal) maxVal = sample;
                    if (sample < minVal) minVal = sample;
                }

                rms = Math.sqrt(sumSq / this.bufferSize);
                peakToPeak = maxVal - minVal;
                break;
            }
        }

        // Advance phase step
        this.phase += this.bufferSize;

        // Perform intelligence classification
        const metrics = {
            frequency: frequency,
            rms: rms,
            peakToPeak: peakToPeak,
            noise: noise,
            periodicity: periodicity,
            waveform: Array.from(samples)
        };

        const classification = window.signalIntelligence ? window.signalIntelligence.classify(metrics) : {
            type: 'PULSED FENCE-LIKE',
            confidence: 91,
            breakdown: { pulsed: 91, mains: 4, ambient: 3, uncertain: 2 },
            explanation: ['Simulated pulsed signal'],
            fingerprint: { amplitude: 0.8, periodicity: 0.9, harmonicPurity: 0.85, stability: 0.9, snr: 0.88 }
        };

        return {
            type: classification.type,
            signal: signalStrength,
            confidence: classification.confidence,
            frequency: parseFloat(frequency.toFixed(2)),
            rms: parseFloat(rms.toFixed(2)),
            peakToPeak: parseFloat(peakToPeak.toFixed(2)),
            noise: parseFloat(noise.toFixed(2)),
            timestamp: Date.now(),
            breakdown: classification.breakdown,
            explanation: classification.explanation,
            fingerprint: classification.fingerprint,
            waveform: Array.from(samples),
            scenario: this.activeScenario,
            isDemo: true
        };
    }
}

// Global Singleton Instance
window.demoSynthesizer = new DemoSignalSynthesizer();
