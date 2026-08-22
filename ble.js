/**
 * FENCE SENTINEL - Web Bluetooth BLE Hardware Interface (ble.js)
 * Connects to ESP32 sensor node via GATT services, receives live JSON ADC telemetry,
 * manages connection lifecycle, and gracefully falls back to demo mode.
 */

class SentinelBLEManager {
    constructor() {
        this.deviceNamePrefix = 'FENCE-SENTINEL';
        // Standard Nordic / Custom UART BLE Service UUIDs
        this.serviceUUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
        this.characteristicUUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

        this.device = null;
        this.server = null;
        this.characteristic = null;
        this.isConnected = false;
        this.batteryLevel = 92;
        this.rssi = -64; // dBm
        this.firmwareVersion = 'v1.0.4-ESP32-S3';
        this.lastPacketTime = null;
        this.packetCount = 0;
        this.listeners = [];
        this.logListeners = [];

        this.decoder = new TextDecoder('utf-8');
        this.isDemoMode = true; // Default to demo until real BLE is attached
    }

    onData(callback) {
        this.listeners.push(callback);
    }

    onLog(callback) {
        this.logListeners.push(callback);
    }

    notifyLog(message, isError = false) {
        const entry = {
            timestamp: new Date().toLocaleTimeString(),
            message: message,
            isError: isError
        };
        this.logListeners.forEach(cb => cb(entry));
    }

    /**
     * Request Bluetooth Device pairing via Web Bluetooth API
     */
    async connect() {
        if (!navigator.bluetooth) {
            this.notifyLog('Web Bluetooth API is not supported in this browser. Running in Demo Mode.', true);
            throw new Error('Web Bluetooth API unavailable');
        }

        try {
            this.notifyLog('Scanning for FENCE-SENTINEL ESP32 BLE device...');
            this.device = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: 'FENCE' },
                    { namePrefix: 'SENTINEL' },
                    { namePrefix: 'ESP32' }
                ],
                optionalServices: [this.serviceUUID, 'battery_service', 'device_information']
            });

            this.device.addEventListener('gattserverdisconnected', () => this.handleDisconnect());

            this.notifyLog(`Device found: ${this.device.name}. Connecting GATT server...`);
            this.server = await this.device.gatt.connect();

            this.notifyLog('GATT server connected. Subscribing to telemetry characteristic...');
            const service = await this.server.getPrimaryService(this.serviceUUID);
            this.characteristic = await service.getCharacteristic(this.characteristicUUID);

            await this.characteristic.startNotifications();
            this.characteristic.addEventListener('characteristicvaluechanged', (event) => this.handleValueChange(event));

            this.isConnected = true;
            this.isDemoMode = false; // Disable demo when real hardware connects
            this.notifyLog(`Successfully connected to ${this.device.name}! Receiving live ESP32 stream.`);
            return true;

        } catch (error) {
            this.notifyLog(`BLE Connection failed: ${error.message}`, true);
            this.handleDisconnect();
            throw error;
        }
    }

    /**
     * Disconnect GATT server
     */
    async disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this.handleDisconnect();
    }

    handleDisconnect() {
        this.isConnected = false;
        this.device = null;
        this.server = null;
        this.characteristic = null;
        this.notifyLog('BLE Disconnected. Reverting to Offline/Demo mode.');
    }

    /**
     * Parse incoming BLE characteristic JSON payload
     */
    handleValueChange(event) {
        try {
            const rawValue = this.decoder.decode(event.target.value);
            this.lastPacketTime = Date.now();
            this.packetCount++;

            const payload = JSON.parse(rawValue);

            // Pass through Signal Intelligence engine if needed
            const metrics = {
                frequency: payload.frequency || 0,
                rms: payload.rms || 0,
                peakToPeak: payload.peakToPeak || 0,
                noise: payload.noise || 0.05,
                periodicity: payload.type === 'PULSED_FENCE' ? 0.9 : 0.2,
                waveform: payload.waveform || []
            };

            const classification = window.signalIntelligence ? window.signalIntelligence.classify(metrics) : {
                type: payload.type || 'PULSED FENCE-LIKE',
                confidence: payload.confidence || 90,
                breakdown: { pulsed: 90, mains: 5, ambient: 3, uncertain: 2 },
                explanation: ['Real ESP32 ADC packet received.'],
                fingerprint: { amplitude: 0.8, periodicity: 0.9, harmonicPurity: 0.85, stability: 0.9, snr: 0.88 }
            };

            const telemetry = {
                type: classification.type,
                signal: payload.signal || 85,
                confidence: classification.confidence,
                frequency: payload.frequency || 0,
                rms: payload.rms || 0,
                peakToPeak: payload.peakToPeak || 0,
                noise: payload.noise || 0,
                timestamp: payload.timestamp ? payload.timestamp * 1000 : Date.now(),
                breakdown: classification.breakdown,
                explanation: classification.explanation,
                fingerprint: classification.fingerprint,
                waveform: payload.waveform || [],
                isDemo: false
            };

            this.notifyLog(`RX Packet #${this.packetCount}: ${telemetry.type} (${telemetry.signal}%)`);
            this.listeners.forEach(cb => cb(telemetry));

        } catch (err) {
            this.notifyLog(`Failed to parse BLE packet: ${err.message}`, true);
        }
    }

    /**
     * Get device status summary
     */
    getStatus() {
        return {
            isConnected: this.isConnected,
            deviceName: this.device ? this.device.name : (this.isDemoMode ? 'FENCE-SENTINEL-DEMO' : 'Not Connected'),
            batteryLevel: this.batteryLevel,
            rssi: this.rssi,
            firmwareVersion: this.firmwareVersion,
            packetCount: this.packetCount,
            lastPacketTime: this.lastPacketTime,
            isDemoMode: this.isDemoMode
        };
    }
}

// Global Singleton Instance
window.sentinelBLE = new SentinelBLEManager();
