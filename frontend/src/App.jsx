import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppBar from './components/AppBar';
import Navigation from './components/Navigation';
import Toast from './components/Toast';
import ProximityBanner from './components/ProximityBanner';
import DetectPage from './pages/DetectPage';
import MapPage from './pages/MapPage';
import ReportsPage from './pages/ReportsPage';
import { fetchPotholes } from './services/api';
import { proximityAlertInstance } from './services/proximityAlert';

export default function App() {
  const [cachedPotholes, setCachedPotholes] = useState([]);

  // 1. Fetch & cache known pothole list every 30s
  const refreshPotholeCache = useCallback(async () => {
    const data = await fetchPotholes();
    if (data && data.length > 0) {
      setCachedPotholes(data);
    }
  }, []);

  useEffect(() => {
    refreshPotholeCache();
    const interval = setInterval(refreshPotholeCache, 30000);
    return () => clearInterval(interval);
  }, [refreshPotholeCache]);

  // 2. Global GPS Watcher for Proximity Alerts across all screens
  useEffect(() => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        proximityAlertInstance.checkProximity(
          pos.coords.latitude,
          pos.coords.longitude,
          cachedPotholes
        );
      },
      (err) => console.warn('Global proximity GPS watch error:', err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [cachedPotholes]);

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100 font-sans pb-24 relative">
        <Toast />
        <ProximityBanner />
        <AppBar />
        
        <main className="flex-1 max-w-md w-full mx-auto p-4 space-y-4">
          <Routes>
            <Route path="/" element={<DetectPage />} />
            <Route path="/detect" element={<Navigate to="/" replace />} />
            <Route path="/map" element={<MapPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        <Navigation />
      </div>
    </BrowserRouter>
  );
}
