// Haversine formula distance calculation in meters
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

class ProximityAlertService {
  constructor() {
    this.activeAlert = null; // { pothole, distance }
    this.alertedPotholes = new Set(); // Set of pothole IDs already alerted on current approach
    this.listeners = new Set();
    this.audioCtx = null;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn(this.activeAlert);
    return () => this.listeners.delete(fn);
  }

  notify() {
    this.listeners.forEach((fn) => fn(this.activeAlert));
  }

  // Play short warning audio beep using Web Audio API
  playWarningBeep() {
    try {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          this.audioCtx = new AudioContextClass();
        }
      }

      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      if (!this.audioCtx) return;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, this.audioCtx.currentTime); // High pitch A5
      osc.frequency.exponentialRampToValueAtTime(440, this.audioCtx.currentTime + 0.25);

      gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.25);
    } catch (e) {
      console.warn('Web Audio API play error:', e);
    }
  }

  checkProximity(userLat, userLng, potholes = []) {
    if (!userLat || !userLng || !Array.isArray(potholes) || potholes.length === 0) {
      if (this.activeAlert) {
        this.activeAlert = null;
        this.notify();
      }
      return;
    }

    let closestPothole = null;
    let minDistance = Infinity;

    potholes.forEach((pothole) => {
      if (!pothole.lat || !pothole.lng) return;
      const dist = haversineDistance(userLat, userLng, pothole.lat, pothole.lng);

      if (dist < minDistance) {
        minDistance = dist;
        closestPothole = pothole;
      }

      // Reset approach debounce if user has moved away (> 50m)
      if (dist > 50 && this.alertedPotholes.has(pothole.id)) {
        this.alertedPotholes.delete(pothole.id);
      }
    });

    // Check if within 30 meters threshold
    if (closestPothole && minDistance <= 30) {
      const roundedDist = Math.round(minDistance);
      this.activeAlert = { pothole: closestPothole, distance: roundedDist };

      // Fire audio beep & notify if not already alerted on current approach
      if (!this.alertedPotholes.has(closestPothole.id)) {
        this.alertedPotholes.add(closestPothole.id);
        this.playWarningBeep();
      }

      this.notify();
    } else {
      if (this.activeAlert) {
        this.activeAlert = null;
        this.notify();
      }
    }
  }

  dismissAlert() {
    this.activeAlert = null;
    this.notify();
  }
}

export const proximityAlertInstance = new ProximityAlertService();
