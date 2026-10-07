// --- LOGIN LOGIC ---
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    // UI Elements
    const btnText = document.getElementById('btnText');
    const loader = document.getElementById('loader');
    const errorMsg = document.getElementById('errorMsg');

    // Start Loading UI
    setLoading(true, btnText, loader, errorMsg, 'Logging in...');

    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await safeJson(response);

        if (response.ok) {
            // Success: Save Token
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));

            // Redirect based on role
            window.location.href = data.user.role === 'admin' ? 'admin.html' : 'dashboard.html';
        } else {
            // Server Error
            throw new Error(data.error || 'Login failed');
        }
    } catch (err) {
        // Handle Network or Server Errors
        showError(err.message, btnText, loader, errorMsg, 'Login');
    }
});

// --- REGISTER LOGIC ---
document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const full_name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPassword').value;
    const role = document.getElementById('regRole').value;

    // UI Elements
    const btnText = document.getElementById('regBtnText');
    const loader = document.getElementById('regLoader');
    const errorMsg = document.getElementById('regErrorMsg');

    setLoading(true, btnText, loader, errorMsg, 'Creating Account...');

    try {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ full_name, email, password, role })
        });

        const data = await safeJson(response);

        if (response.ok) {
            alert("Registration Successful! Please login.");
            window.location.href = 'index.html';
        } else {
            // Parse Error (could be array or string)
            let message = 'Registration failed';
            if (data.errors && Array.isArray(data.errors)) {
                message = data.errors[0].msg;
            } else if (data.error) {
                message = data.error;
            }
            throw new Error(message);
        }
    } catch (err) {
        showError(err.message, btnText, loader, errorMsg, 'Sign Up');
    }
});

// --- HELPERS (UI Toggles) ---
function setLoading(isLoading, btnText, loader, errorMsg, loadingText) {
    if (!btnText || !loader) return; // Safety check

    if (isLoading) {
        btnText.innerText = loadingText;
        loader.classList.remove('hidden');
        if (errorMsg) errorMsg.classList.add('hidden');
    }
}

function showError(msg, btnText, loader, errorMsg, defaultText) {
    if (errorMsg) {
        errorMsg.innerText = msg;
        errorMsg.classList.remove('hidden');
    } else {
        alert(msg); // Fallback if no error element
    }

    if (btnText) btnText.innerText = defaultText;
    if (loader) loader.classList.add('hidden');
}