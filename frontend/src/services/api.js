const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export async function checkHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    
    const response = await fetch(`${API_URL}/api/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    if (!response.ok) return false;
    const data = await response.json();
    return data.status === 'ok';
  } catch (error) {
    return false;
  }
}

export async function fetchPotholes() {
  try {
    const response = await fetch(`${API_URL}/api/potholes`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn('Fetch potholes error:', error.message);
    return [];
  }
}

export async function generateComplaint(potholeId) {
  try {
    const response = await fetch(`${API_URL}/api/potholes/${potholeId}/complaint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
    });
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Generate complaint error:', error.message);
    throw error;
  }
}

export { API_URL };
