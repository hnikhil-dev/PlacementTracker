// Auto-detects the base URL so the app works both locally, over LAN, and when deployed
const API_BASE_URL = (typeof window !== 'undefined' && window.location && window.location.origin)
    ? `${window.location.origin}/api`
    : 'http://localhost:3000/api';

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

/**
 * Extracts a user-friendly error message from API responses across
 * FastAPI (detail), standard REST (message, error), and validation error lists.
 */
function getErrorMessage(data, fallback = 'Operation failed') {
    if (!data) return fallback;
    if (typeof data === 'string') return data;
    if (data.detail) {
        if (typeof data.detail === 'string') return data.detail;
        if (Array.isArray(data.detail) && data.detail.length > 0) {
            return data.detail.map(d => d.msg || (typeof d === 'string' ? d : JSON.stringify(d))).join(', ');
        }
    }
    if (data.message && typeof data.message === 'string') return data.message;
    if (data.error && typeof data.error === 'string') return data.error;
    if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
        return data.errors[0].msg || data.errors[0].message || JSON.stringify(data.errors[0]);
    }
    return fallback;
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
