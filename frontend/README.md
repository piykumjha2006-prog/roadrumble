# Road Rumble — Frontend PWA

React + Vite + Tailwind CSS Progressive Web App for real-time dashcam pothole detection and civic complaint filing.

## 📱 Hardware & Permission Requirements

> ⚠️ **IMPORTANT**: Modern web browsers (Chrome, Safari, Firefox, Edge) restrict camera access (`getUserMedia`) and high-accuracy GPS (`Geolocation`) strictly to **Secure Contexts (HTTPS)** or **`localhost`**.

### For Local Development:
- When running locally on the same machine, `http://localhost:3000` is trusted by default.

### For Mobile Phone Testing (In-Car / On-Bike):
- When opening the app on a physical mobile device over your local Wi-Fi or cellular network, you **MUST** use an HTTPS tunnel (such as `cloudflared` or `ngrok`).
- Example command to expose the Vite server over HTTPS:
  ```bash
  cloudflared tunnel --url http://localhost:3000
  ```

---

## 🛠️ Setup & Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Production build
npm run build

# Preview build
npm run preview
```

---

## 🏗️ Architecture & Features (Member A)

- **`AppBar.jsx`**: Displays branding & pings `GET /api/health` every 10 seconds to indicate backend connectivity.
- **`DetectPage.jsx`**: Live rear-camera (`facingMode: "environment"`) feed, `navigator.geolocation.watchPosition` tracker, and `captureFrame()` helper for exporting video frames to JPEG Blobs.
- **`MapPage.jsx`**: Pothole radar view for Leaflet map markers.
- **`ReportsPage.jsx`**: Civic complaint dashboard & `mailto:` export interface.
