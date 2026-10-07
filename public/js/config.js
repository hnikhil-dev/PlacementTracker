// Auto-detects the base URL so the app works both locally and on Vercel
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `http://localhost:${window.location.port || 3000}/api`
    : `${window.location.origin}/api`;

/**
 * Safely parse JSON from a fetch Response.
 * Returns parsed JSON, or a fallback object if the body is empty / not JSON.
 */
async function safeJson(response, fallback = {}) {
    if (!response) return fallback;
    const contentType = response.headers?.get('content-type') || '';
    // If Content-Length is 0 or status is 204 No Content, skip parsing
    if (response.status === 204 || response.headers?.get('content-length') === '0') {
        return fallback;
    }
    try {
        const text = await response.text();
        if (!text || text.trim().length === 0) return fallback;
        return JSON.parse(text);
    } catch (e) {
        console.warn('safeJson: Could not parse response as JSON:', e.message);
        return fallback;
    }
}

// Helper function to handle fetch with Auth Token automatically
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('token');

    const headers = {
        ...options.headers,
    };

    // Only set Content-Type to JSON if not sending FormData
    // (FormData needs the browser to set Content-Type with boundary)
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${url}`, {
        ...options,
        headers
    });

    // Auto-logout if token is invalid
    if (response.status === 401 || response.status === 403) {
        alert("Session expired. Please login again.");
        localStorage.clear();
        window.location.href = 'index.html';
        // Throw so callers don't try to use the response
        throw new Error('SESSION_EXPIRED');
    }

    return response;
}