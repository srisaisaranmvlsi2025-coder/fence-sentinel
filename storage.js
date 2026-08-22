/**
 * FENCE SENTINEL - Offline-First IndexedDB Storage Engine (storage.js)
 * Manages local persistence for detection events, patrol tracks, device logs, and configuration.
 */

class SentinelStorage {
    constructor() {
        this.dbName = 'FenceSentinelDB';
        this.dbVersion = 1;
        this.db = null;
        this.isReady = false;
        this.initPromise = this.init();
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Detections Store
                if (!db.objectStoreNames.contains('detections')) {
                    const detStore = db.createObjectStore('detections', { keyPath: 'id' });
                    detStore.createIndex('timestamp', 'timestamp', { unique: false });
                    detStore.createIndex('type', 'type', { unique: false });
                    detStore.createIndex('status', 'status', { unique: false }); // Detected, Flagged, Verified, False Positive
                    detStore.createIndex('synced', 'synced', { unique: false });
                }

                // Patrol Tracks Store
                if (!db.objectStoreNames.contains('patrols')) {
                    const patrolStore = db.createObjectStore('patrols', { keyPath: 'id' });
                    patrolStore.createIndex('startTime', 'startTime', { unique: false });
                }

                // System Logs Store
                if (!db.objectStoreNames.contains('logs')) {
                    const logStore = db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
                    logStore.createIndex('timestamp', 'timestamp', { unique: false });
                }

                // User Settings Store
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.isReady = true;
                console.log('[Storage] IndexedDB initialized successfully.');
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error('[Storage] IndexedDB initialization error:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    // Ensure DB is ready before executing transactions
    async ensureReady() {
        if (!this.isReady) {
            await this.initPromise;
        }
    }

    // Save a new detection event
    async saveDetection(event) {
        await this.ensureReady();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['detections'], 'readwrite');
            const store = transaction.objectStore('detections');
            
            const record = {
                id: event.id || `FS-${Date.now().toString(36).toUpperCase()}`,
                timestamp: event.timestamp || Date.now(),
                isoTime: new Date(event.timestamp || Date.now()).toISOString(),
                type: event.type || 'UNCERTAIN',
                signal: Math.round(event.signal || 0),
                confidence: Math.round(event.confidence || 0),
                frequency: parseFloat((event.frequency || 0).toFixed(2)),
                rms: parseFloat((event.rms || 0).toFixed(2)),
                peakToPeak: parseFloat((event.peakToPeak || 0).toFixed(2)),
                noise: parseFloat((event.noise || 0).toFixed(2)),
                lat: event.lat !== undefined ? event.lat : null,
                lng: event.lng !== undefined ? event.lng : null,
                status: event.status || 'Detected', // 'Detected' | 'Flagged' | 'Verified' | 'False Positive'
                notes: event.notes || '',
                waveform: event.waveform || [], // Snippet array
                fingerprint: event.fingerprint || null,
                explanation: event.explanation || [],
                isDemo: event.isDemo !== undefined ? event.isDemo : true,
                synced: false
            };

            const request = store.put(record);

            request.onsuccess = () => {
                console.log(`[Storage] Saved detection ${record.id}`);
                this.logSystemEvent('DETECTION_SAVED', `Event ${record.id} (${record.type}) recorded`);
                resolve(record);
            };

            request.onerror = (e) => reject(e.target.error);
        });
    }

    // Get all detections with optional sorting and limit
    async getAllDetections() {
        await this.ensureReady();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['detections'], 'readonly');
            const store = transaction.objectStore('detections');
            const index = store.index('timestamp');
            const request = index.openCursor(null, 'prev'); // Newest first

            const results = [];
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    results.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };

            request.onerror = (e) => reject(e.target.error);
        });
    }

    // Get single detection by ID
    async getDetectionById(id) {
        await this.ensureReady();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['detections'], 'readonly');
            const store = transaction.objectStore('detections');
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    // Update detection status or notes
    async updateDetectionStatus(id, newStatus, notes = null) {
        await this.ensureReady();
        const event = await this.getDetectionById(id);
        if (!event) throw new Error(`Detection ${id} not found.`);

        event.status = newStatus;
        if (notes !== null) {
            event.notes = notes;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['detections'], 'readwrite');
            const store = transaction.objectStore('detections');
            const request = store.put(event);

            request.onsuccess = () => {
                console.log(`[Storage] Updated status for ${id} to ${newStatus}`);
                this.logSystemEvent('STATUS_UPDATE', `Updated ${id} status to ${newStatus}`);
                resolve(event);
            };

            request.onerror = (e) => reject(e.target.error);
        });
    }

    // Save a patrol session
    async savePatrolSession(patrol) {
        await this.ensureReady();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['patrols'], 'readwrite');
            const store = transaction.objectStore('patrols');
            const request = store.put(patrol);

            request.onsuccess = () => resolve(patrol);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    // Get all patrol sessions
    async getAllPatrols() {
        await this.ensureReady();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['patrols'], 'readonly');
            const store = transaction.objectStore('patrols');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    // System event logger
    async logSystemEvent(type, message) {
        if (!this.isReady) return;
        try {
            const transaction = this.db.transaction(['logs'], 'readwrite');
            const store = transaction.objectStore('logs');
            store.add({
                timestamp: Date.now(),
                iso: new Date().toISOString(),
                type: type,
                message: message
            });
        } catch (err) {
            console.warn('[Storage] Failed to write log:', err);
        }
    }

    // Get unsynced count
    async getUnsyncedCount() {
        await this.ensureReady();
        const all = await this.getAllDetections();
        return all.filter(d => !d.synced).length;
    }

    // Mark all as synced
    async markAllSynced() {
        await this.ensureReady();
        const all = await this.getAllDetections();
        const transaction = this.db.transaction(['detections'], 'readwrite');
        const store = transaction.objectStore('detections');

        all.forEach(d => {
            d.synced = true;
            store.put(d);
        });
    }

    // Clear all data (For settings reset)
    async clearAllData() {
        await this.ensureReady();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['detections', 'patrols', 'logs'], 'readwrite');
            transaction.objectStore('detections').clear();
            transaction.objectStore('patrols').clear();
            transaction.objectStore('logs').clear();

            transaction.oncomplete = () => {
                console.log('[Storage] All local stores cleared.');
                resolve(true);
            };
            transaction.onerror = (e) => reject(e.target.error);
        });
    }

    // CSV Exporter
    exportToCSV(data) {
        if (!data || !data.length) return '';
        const headers = ['Event ID', 'Timestamp', 'Signal Type', 'Signal Strength (%)', 'Confidence (%)', 'Frequency (Hz)', 'RMS (V)', 'Peak-to-Peak (V)', 'Latitude', 'Longitude', 'Status', 'Notes', 'Mode'];
        
        const rows = data.map(d => [
            d.id,
            `"${d.isoTime}"`,
            `"${d.type}"`,
            d.signal,
            d.confidence,
            d.frequency,
            d.rms,
            d.peakToPeak,
            d.lat || '',
            d.lng || '',
            `"${d.status}"`,
            `"${(d.notes || '').replace(/"/g, '""')}"`,
            d.isDemo ? 'DEMO' : 'BLE'
        ]);

        return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }
}

// Global Singleton Instance
window.sentinelStorage = new SentinelStorage();
