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

// Predictive crowdsourced geofence alert service.
// Car A passively logs potholes; Rider B gets a spoken chime ~100m before
// reaching a known spot, giving 8-10 seconds of genuine reaction time.
const WARNING_DISTANCE = 100; // meters — start warning
const REARM_DISTANCE = 200; // meters — reset debounce after passing far beyond

class ProximityAlertService {
  constructor() {
    this.activeAlert = null; // { pothole, distance }
    this.alertedPotholes = new Set(); // IDs already alerted on current approach
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

  // Attention chime: two rising tones
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

      [660, 990].forEach((freq, i) => {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        const t = this.audioCtx.currentTime + i * 0.22;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0.001, t);
        gain.gain.exponentialRampToValueAtTime(0.35, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(t);
        osc.stop(t + 0.22);
      });
    } catch (e) {
      console.warn('Web Audio API play error:', e);
    }
  }

  // Spoken voice alert: "Caution: Severe road depression 100m ahead"
  speakAlert(distance, roadName) {
    try {
      if (!('speechSynthesis' in window)) return;
      const road = roadName ? ` near ${roadName}` : '';
      const utterance = new SpeechSynthesisUtterance(
        `Caution. Severe road depression. ${distance} meters ahead${road}.`
      );
      utterance.rate = 1.05;
      utterance.pitch = 1;
      utterance.volume = 1;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
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

      // Re-arm alert once rider has passed well beyond the pothole
      if (dist > REARM_DISTANCE && this.alertedPotholes.has(pothole.id)) {
        this.alertedPotholes.delete(pothole.id);
      }
    });

    // Predictive geofence: warn within 100m
    if (closestPothole && minDistance <= WARNING_DISTANCE) {
      const roundedDist = Math.round(minDistance);
      this.activeAlert = { pothole: closestPothole, distance: roundedDist };

      // Fire chime + voice once per approach
      if (!this.alertedPotholes.has(closestPothole.id)) {
        this.alertedPotholes.add(closestPothole.id);
        this.playWarningBeep();
        this.speakAlert(roundedDist, closestPothole.road_name);
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
