/**
 * FENCE SENTINEL - Smartphone GPS Location & Patrol Path Tracker (location.js)
 * Manages real-time Geolocation coordinate acquisition, patrol distance calculations,
 * and simulated field patrol route coordinates for demo mode.
 */

class SentinelLocationManager {
    constructor() {
        this.currentPosition = {
            lat: 11.6853, // Default base coordinate (e.g. Wildlife Reserve Reserve Sector A)
            lng: 76.6291,
            alt: 940, // meters
            accuracy: 4.5, // meters
            speed: 0.0, // km/h
            timestamp: Date.now()
        };

        this.watchId = null;
        this.isTracking = false;
        this.patrolPath = []; // Array of {lat, lng, timestamp}
        this.totalDistanceKm = 0.0;
        this.listeners = [];

        // Simulated patrol vector direction
        this.simAngle = 0.4; // radians
        this.isSimulated = true;
    }

    onLocationUpdate(callback) {
        this.listeners.push(callback);
    }

    /**
     * Start real GPS position tracking via Geolocation API
     */
    startTracking() {
        if (!navigator.geolocation) {
            console.warn('[Location] Geolocation API not available. Using simulated location.');
            this.startSimulatedTracking();
            return;
        }

        this.isTracking = true;
        this.watchId = navigator.geolocation.watchPosition(
            (pos) => this.handleGPSPosition(pos),
            (err) => {
                console.warn(`[Location] GPS error (${err.code}): ${err.message}. Falling back to simulated position.`);
                this.startSimulatedTracking();
            },
            {
                enableHighAccuracy: true,
                maximumAge: 3000,
                timeout: 10000
            }
        );
    }

    stopTracking() {
        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
        this.isTracking = false;
    }

    handleGPSPosition(position) {
        this.isSimulated = false;
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const alt = position.coords.altitude || 940;
        const accuracy = position.coords.accuracy || 5;
        const speed = (position.coords.speed || 0) * 3.6; // m/s to km/h

        this.updatePosition(lat, lng, alt, accuracy, speed);
    }

    /**
     * Update current location state & calculate incremental patrol distance
     */
    updatePosition(lat, lng, alt, accuracy, speed) {
        const prev = this.currentPosition;
        const newPos = {
            lat: parseFloat(lat.toFixed(6)),
            lng: parseFloat(lng.toFixed(6)),
            alt: Math.round(alt),
            accuracy: parseFloat(accuracy.toFixed(1)),
            speed: parseFloat(speed.toFixed(1)),
            timestamp: Date.now()
        };

        // Calculate distance delta if already tracking a patrol
        if (this.isTracking && prev.lat && prev.lng) {
            const distDelta = this.calculateHaversineDistance(prev.lat, prev.lng, newPos.lat, newPos.lng);
            if (distDelta > 0.002) { // Minimum 2 meter movement threshold
                this.totalDistanceKm += distDelta;
                this.patrolPath.push({ lat: newPos.lat, lng: newPos.lng, timestamp: newPos.timestamp });
            }
        } else if (this.isTracking && this.patrolPath.length === 0) {
            this.patrolPath.push({ lat: newPos.lat, lng: newPos.lng, timestamp: newPos.timestamp });
        }

        this.currentPosition = newPos;
        this.listeners.forEach(cb => cb(this.currentPosition));
    }

    /**
     * Simulate movement along a fence perimeter for demo mode
     */
    startSimulatedTracking() {
        this.isSimulated = true;
        this.isTracking = true;

        if (this.simInterval) clearInterval(this.simInterval);
        this.simInterval = setInterval(() => {
            if (!this.isTracking) return;

            // Small step ~3-8 meters
            const step = 0.00004 + (Math.random() - 0.5) * 0.00001;
            this.simAngle += (Math.random() - 0.5) * 0.15; // Smooth random curve

            const newLat = this.currentPosition.lat + Math.sin(this.simAngle) * step;
            const newLng = this.currentPosition.lng + Math.cos(this.simAngle) * step;
            const speed = 3.2 + (Math.random() - 0.5) * 0.8; // ~3.2 km/h walking speed

            this.updatePosition(newLat, newLng, 942 + Math.random() * 5, 3.8 + Math.random(), speed);
        }, 3000);
    }

    resetPatrolDistance() {
        this.totalDistanceKm = 0.0;
        this.patrolPath = [];
        if (this.currentPosition.lat) {
            this.patrolPath.push({ lat: this.currentPosition.lat, lng: this.currentPosition.lng, timestamp: Date.now() });
        }
    }

    /**
     * Haversine formula for distance between 2 GPS coordinates in km
     */
    calculateHaversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    getFormattedCoords() {
        const lat = this.currentPosition.lat;
        const lng = this.currentPosition.lng;
        const latDir = lat >= 0 ? 'N' : 'S';
        const lngDir = lng >= 0 ? 'E' : 'W';
        return `${Math.abs(lat).toFixed(5)}° ${latDir}, ${Math.abs(lng).toFixed(5)}° ${lngDir}`;
    }
}

// Global Singleton Instance
window.sentinelLocation = new SentinelLocationManager();
