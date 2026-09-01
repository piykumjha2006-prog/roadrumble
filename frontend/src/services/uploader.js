import { API_URL } from './api';

const QUEUE_STORAGE_KEY = 'road_rumble_offline_queue';

class UploadManager {
  constructor() {
    this.queue = [];
    this.logs = [];
    this.isProcessing = false;
    this.listeners = new Set();
    this.toastListeners = new Set();
    
    this.loadQueue();
  }

  // Debug Log Helper
  log(msg, type = 'info') {
    const entry = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toLocaleTimeString(),
      msg,
      type, // 'info' | 'success' | 'warn' | 'error' | 'duplicate'
    };
    this.logs.unshift(entry);
    if (this.logs.length > 50) this.logs.pop();
    this.notifyListeners();
  }

  notifyListeners() {
    this.listeners.forEach((fn) => fn([...this.logs], [...this.queue]));
  }

  subscribe(fn) {
    this.listeners.add(fn);
    fn([...this.logs], [...this.queue]);
    return () => this.listeners.delete(fn);
  }

  onToast(fn) {
    this.toastListeners.add(fn);
    return () => this.toastListeners.delete(fn);
  }

  emitToast(message, status = 'info') {
    this.toastListeners.forEach((fn) => fn({ message, status, id: Date.now() }));
  }

  loadQueue() {
    try {
      const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (stored) {
        // Base64 serialized queue metadata
        this.queue = JSON.parse(stored);
      }
    } catch (e) {
      this.queue = [];
    }
  }

  saveQueue() {
    try {
      // Save serializable queue metadata (excluding raw blobs)
      const serializable = this.queue.map((item) => ({
        id: item.id,
        lat: item.lat,
        lng: item.lng,
        timestamp: item.timestamp,
        confidence: item.confidence,
        retryCount: item.retryCount || 0,
      }));
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(serializable));
    } catch (e) {
      console.warn('LocalStorage queue save failed:', e);
    }
  }

  async uploadDetection({ blob, lat, lng, timestamp, confidence }) {
    const queueId = `detection_${Date.now()}`;
    const payload = {
      id: queueId,
      blob,
      lat: lat || 12.9716,
      lng: lng || 77.5946,
      timestamp: timestamp || new Date().toISOString(),
      confidence: parseFloat(confidence || 0.85),
      retryCount: 0,
    };

    this.log(`Detection logged: ${Math.round(payload.confidence * 100)}% conf at (${payload.lat.toFixed(4)}, ${payload.lng.toFixed(4)})`, 'info');
    
    this.queue.push(payload);
    this.saveQueue();
    this.notifyListeners();

    return this.processQueue();
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const item = this.queue[0];
      this.log(`Uploading item ${item.id} to ${API_URL}/api/potholes...`, 'info');

      try {
        const formData = new FormData();
        formData.append('lat', item.lat.toString());
        formData.append('lng', item.lng.toString());
        formData.append('timestamp', item.timestamp);
        formData.append('confidence', item.confidence.toString());

        if (item.blob) {
          formData.append('image', item.blob, `${item.id}.jpg`);
        } else {
          // Dummy 1x1 image fallback if blob missing from localstorage restore
          const dummyBlob = new Blob(['dummy'], { type: 'image/jpeg' });
          formData.append('image', dummyBlob, `${item.id}.jpg`);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(`${API_URL}/api/potholes`, {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Server returned status ${response.status}`);
        }

        const result = await response.json();
        
        // Remove from queue on success
        this.queue.shift();
        this.saveQueue();

        if (result.status === 'duplicate') {
          this.log(`Merged duplicate pothole #${result.record?.id || ''} (Hit Count: ${result.record?.hit_count || 2})`, 'duplicate');
          this.emitToast('Already reported', 'duplicate');
        } else {
          this.log(`Pothole logged successfully! ID #${result.record?.id || result.id || 'NEW'}`, 'success');
          this.emitToast('Pothole logged', 'success');
        }
      } catch (err) {
        this.log(`Upload failed (${err.message}). Retrying offline queue when reconnected.`, 'warn');
        this.emitToast('Queued offline', 'warn');
        
        // Bump retry count and pause loop until next trigger/online
        item.retryCount = (item.retryCount || 0) + 1;
        break;
      }
    }

    this.isProcessing = false;
    this.notifyListeners();
  }

  clearLogs() {
    this.logs = [];
    this.notifyListeners();
  }
}

export const uploaderInstance = new UploadManager();
