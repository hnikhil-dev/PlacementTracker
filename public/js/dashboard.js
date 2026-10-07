// ==========================================
// PLACEMENT TRACKER DASHBOARD CONTROLLER - NEXT LEVEL
// ==========================================

// --- GLOBAL STATE ---
let currentUser = JSON.parse(localStorage.getItem('user')) || {};
const token = localStorage.getItem('token');
let allOpportunities = [];
let myAppliedIds = new Set();
let bookmarkedIds = new Set(JSON.parse(localStorage.getItem('bookmarks') || '[]'));
let currentJobType = 'All';
let currentQuizData = null;
let currentQuizSkill = null;
let quizTimerInterval = null;
let searchTimeout = null;

// Auth guard
if (!currentUser || !token) { window.location.href = 'index.html'; }

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initUI();
    loadProfile();        // always fetch latest profile+skills from server on every load
    loadJobs();           // loads from cache instantly, then refreshes in background
    loadDashboardStats();
    initDarkMode();
    initKeyboardShortcuts();
    updateBookmarkBadge();
});

function initUI() {
    const name = currentUser.full_name || currentUser.name || 'Student';
    document.getElementById('userName').innerText = name;
    document.getElementById('avatar').innerText = name.charAt(0).toUpperCase();
    document.getElementById('profileName').innerText = name;
    document.getElementById('profileEmail').innerText = currentUser.email || '';
    document.getElementById('profileInitials').innerText = name.charAt(0).toUpperCase();
}

// ==========================================
// TOAST NOTIFICATION SYSTEM
// ==========================================
function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');

    const colors = {
        success: { bg: '#ecfdf5', border: '#6ee7b7', color: '#065f46', icon: 'fa-check-circle' },
        error: { bg: '#fef2f2', border: '#fca5a5', color: '#991b1b', icon: 'fa-exclamation-circle' },
        warning: { bg: '#fffbeb', border: '#fcd34d', color: '#92400e', icon: 'fa-exclamation-triangle' },
        info: { bg: '#eff6ff', border: '#93c5fd', color: '#1e40af', icon: 'fa-info-circle' }
    };
    const c = colors[type] || colors.info;

    toast.style.cssText = `
        background:${c.bg}; border:1px solid ${c.border}; color:${c.color};
        padding:14px 18px; border-radius:12px; font-size:0.88rem; font-weight:500;
        display:flex; align-items:center; gap:10px; pointer-events:all;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-width:380px; animation:slideIn 0.3s ease;
        font-family:'Poppins',sans-serif;
    `;
    toast.innerHTML = `<i class="fas ${c.icon}" style="font-size:1rem;"></i><span style="flex:1;">${escapeHtml(message)}</span><button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:${c.color};padding:0;font-size:1.1rem;line-height:1;opacity:0.6;">×</button>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ==========================================
// DARK MODE
// ==========================================
function initDarkMode() {
    const saved = localStorage.getItem('darkMode') === 'true';
    if (saved) applyDarkMode(true);
}

function toggleDarkMode() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    applyDarkMode(!isDark);
    localStorage.setItem('darkMode', !isDark);
}

function applyDarkMode(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const icon = document.getElementById('darkModeIcon');
    const label = document.getElementById('darkModeLabel');
    if (icon) { icon.className = dark ? 'fas fa-sun' : 'fas fa-moon'; }
    if (label) { label.innerText = dark ? 'Light Mode' : 'Dark Mode'; }
}

// ==========================================
// KEYBOARD SHORTCUTS
// ==========================================
function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // ESC: close any open modal
        if (e.key === 'Escape') { closeModal(); document.getElementById('skillGapModal')?.classList.add('hidden'); }
        // '/': focus search bar
        if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            e.preventDefault();
            switchTab('jobs');
            document.getElementById('searchInput')?.focus();
        }
    });
}

// ==========================================
// TAB NAVIGATION
// ==========================================
function switchTab(tabName) {
    const tabs = ['jobs', 'bookmarks', 'applications', 'profile'];
    tabs.forEach(t => {
        document.getElementById(`tab-${t}`)?.classList.add('hidden');
        document.getElementById(`nav-${t}`)?.classList.remove('active');
    });

    document.getElementById(`tab-${tabName}`)?.classList.remove('hidden');
    document.getElementById(`nav-${tabName}`)?.classList.add('active');

    if (tabName === 'applications') { loadApplications(); loadDashboardStats(); }
    if (tabName === 'profile') { loadProfile(); }
    if (tabName === 'bookmarks') { renderBookmarks(); }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}

// ==========================================
// ANIMATED COUNTERS
// ==========================================
function animateCounter(el, target, duration = 800) {
    if (!el) return;
    const start = parseInt(el.innerText) || 0;
    const range = target - start;
    const step = duration / 60;
    let current = start;
    const timer = setInterval(() => {
        current += Math.ceil(range / (duration / step));
        if (current >= target) { current = target; clearInterval(timer); }
        el.innerText = current;
    }, step);
}

// ==========================================
// JOBS & OPPORTUNITIES
// ==========================================
async function loadJobs() {
    const list = document.getElementById('jobsList');
    list.innerHTML = `<div class="loading-state"><i class="fas fa-circle-notch fa-spin" style="font-size:2.5rem; color:var(--primary);"></i><p>Fetching opportunities...</p></div>`;

    try {
        // Fetch applications and jobs in parallel
        const [appsRes, jobsRes] = await Promise.all([
            authenticatedFetch(`/applications/my`),
            authenticatedFetch(`/internships`)
        ]);

        const appsData = await safeJson(appsRes, []);
        const jobsData = await safeJson(jobsRes, []);

        const myApps = Array.isArray(appsData) ? appsData : (appsData.data || []);
        allOpportunities = Array.isArray(jobsData) ? jobsData : (jobsData.data || []);

        // Build applied set
        myAppliedIds = new Set();
        myApps.forEach(app => {
            const id = app.internship_id || app.job_id || app.company_id;
            if (id) myAppliedIds.add(String(id));
        });

        // Update app badge
        const badge = document.getElementById('appBadge');
        if (badge && myApps.length > 0) {
            badge.innerText = myApps.length;
            badge.style.display = 'inline-flex';
        }

        if (allOpportunities.length === 0) {
            list.innerHTML = `<div class="empty-state"><i class="fas fa-briefcase" style="font-size:4rem; color:#e2e8f0;"></i><p>No active opportunities found yet.</p></div>`;
            return;
        }

        // Populate skill gap modal job select
        const sel = document.getElementById('gapJobSelect');
        if (sel) {
            sel.innerHTML = '<option value="">-- Select an Opportunity --</option>' +
                allOpportunities.map(j => `<option value="${escapeHtml(j.id)}">${escapeHtml(j.company_name)} – ${escapeHtml(j.role_title)}</option>`).join('');
        }

        applyFilters();

    } catch (err) {
        console.error('Load Jobs Error:', err);
        list.innerHTML = `<div class="empty-state" style="color:#ef4444;"><i class="fas fa-wifi" style="font-size:3rem;"></i><p>Failed to load. Check your connection.</p></div>`;
    }
}

function setJobType(type) {
    currentJobType = type;
    const btnA = document.getElementById('btnAll');
    const btnI = document.getElementById('btnInternship');
    const btnJ = document.getElementById('btnJob');
    if (btnA) { btnA.className = type === 'All' ? 'toggle-btn active-toggle' : 'toggle-btn inactive-toggle'; }
    if (btnI) { btnI.className = type === 'Internship' ? 'toggle-btn active-toggle' : 'toggle-btn inactive-toggle'; }
    if (btnJ) { btnJ.className = type === 'Job' ? 'toggle-btn active-toggle' : 'toggle-btn inactive-toggle'; }
    applyFilters();
}

// Keeps old function name working
function filterOpportunities(type) { setJobType(type); }

let _searchTerm = '';
function debounceSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        _searchTerm = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
        applyFilters();
    }, 250);
}

function applyFilters() {
    const mode = document.getElementById('modeFilter')?.value || 'all';
    const matchFilter = document.getElementById('matchFilter')?.value || 'all';
    const skillCoverageFilter = document.getElementById('skillCoverageFilter')?.value || 'all';
    const verifiedSkills = (currentUser.verified_skills || []).map(s => s.toLowerCase());

    // Normalize type: treat null/undefined/empty as 'Internship'; treat 'Full-time' as 'Job'
    const normalizeType = t => {
        if (!t) return 'Internship';
        if (t.toLowerCase().includes('full')) return 'Job';
        if (t.toLowerCase().includes('job')) return 'Job';
        return 'Internship';
    };
    let filtered = currentJobType === 'All'
        ? [...allOpportunities]
        : allOpportunities.filter(job => normalizeType(job.type) === currentJobType);

    // Search filter
    if (_searchTerm) {
        filtered = filtered.filter(job =>
            (job.company_name || '').toLowerCase().includes(_searchTerm) ||
            (job.role_title || '').toLowerCase().includes(_searchTerm) ||
            (job.required_skills || []).some(s => s.toLowerCase().includes(_searchTerm))
        );
    }

    // Mode filter
    if (mode !== 'all') { filtered = filtered.filter(job => (job.mode || '').toLowerCase() === mode.toLowerCase()); }

    // Match/saved filter
    if (matchFilter === 'match') {
        filtered = filtered.filter(job =>
            (job.required_skills || []).some(s => verifiedSkills.includes(s.toLowerCase()))
        );
    } else if (matchFilter === 'saved') {
        filtered = filtered.filter(job => bookmarkedIds.has(String(job.id)));
    }

    // Skill coverage filter: show fully covered vs missing-skill opportunities
    if (skillCoverageFilter !== 'all') {
        filtered = filtered.filter(job => {
            const requiredSkills = Array.isArray(job.required_skills) ? job.required_skills : [];
            const matchInfo = job.matchInfo || {
                missingSkills: requiredSkills.filter(s => !verifiedSkills.includes(String(s).toLowerCase()))
            };

            if (skillCoverageFilter === 'verified') return (matchInfo.missingSkills || []).length === 0;
            if (skillCoverageFilter === 'unverified') return (matchInfo.missingSkills || []).length > 0;
            return true;
        });
    }

    const countEl = document.getElementById('jobCount');
    if (countEl) countEl.innerText = `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`;

    renderJobCards(filtered, document.getElementById('jobsList'), true);
}

function renderJobCards(jobs, container, showBookmark = false) {
    if (!container) return;
    if (jobs.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-search" style="font-size:3rem; color:#cbd5e1;"></i><p>No jobs match your filters.</p></div>`;
        return;
    }

    const verifiedSkills = (currentUser.verified_skills || []).map(s => s.toLowerCase());
    const today = new Date();

    container.innerHTML = jobs.map(job => {
        // Use matchInfo from backend if available, otherwise calculate on frontend
        let matchInfo = job.matchInfo;
        if (!matchInfo) {
            // Fallback: calculate match on frontend
            const matches = (job.required_skills || []).filter(s => verifiedSkills.includes(s.toLowerCase()));
            const matchPct = job.required_skills?.length > 0 ? Math.round((matches.length / job.required_skills.length) * 100) : 0;
            matchInfo = {
                matchPercentage: matchPct,
                matchedSkills: matches,
                missingSkills: (job.required_skills || []).filter(s => !matches.includes(s)),
                isPerfectMatch: matchPct === 100,
                isGoodMatch: matchPct >= 70,
                isPartialMatch: matchPct >= 40 && matchPct < 70,
                isPoorMatch: matchPct < 40
            };
        }

        const isSmartMatch = matchInfo.matchPercentage > 0;
        const isApplied = myAppliedIds.has(String(job.id));
        const isBookmarked = bookmarkedIds.has(String(job.id));
        const matchPct = matchInfo.matchPercentage;

        // Deadline
        let deadlineBadge = '';
        if (job.deadline) {
            const dl = new Date(job.deadline);
            const daysLeft = Math.ceil((dl - today) / (1000 * 60 * 60 * 24));
            if (daysLeft <= 3 && daysLeft >= 0) {
                deadlineBadge = `<span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:20px;font-size:0.7rem;font-weight:700;"><i class="fas fa-fire"></i> ${daysLeft}d left</span>`;
            } else if (daysLeft > 3 && daysLeft <= 7) {
                deadlineBadge = `<span style="background:#fffbeb;color:#b45309;padding:2px 8px;border-radius:20px;font-size:0.7rem;font-weight:700;"><i class="fas fa-clock"></i> ${daysLeft}d left</span>`;
            }
        }

        // Enhanced match badge with color coding
        let matchBadgeColor = '#64748b'; // Default gray
        let matchBadgeBg = '#f1f5f9';
        let matchIcon = 'fa-circle';

        if (matchInfo.isPerfectMatch) {
            matchBadgeColor = '#16a34a';
            matchBadgeBg = '#f0fdf4';
            matchIcon = 'fa-check-circle';
        } else if (matchInfo.isGoodMatch) {
            matchBadgeColor = '#22c55e';
            matchBadgeBg = '#f0fdf4';
            matchIcon = 'fa-star';
        } else if (matchInfo.isPartialMatch) {
            matchBadgeColor = '#f59e0b';
            matchBadgeBg = '#fffbeb';
            matchIcon = 'fa-bolt';
        } else if (matchInfo.isPoorMatch) {
            matchBadgeColor = '#ef4444';
            matchBadgeBg = '#fef2f2';
            matchIcon = 'fa-exclamation-circle';
        }

        const borderColor = isSmartMatch ? matchBadgeColor : '#e2e8f0';
        const borderWidth = isSmartMatch ? '2px' : '1px';

        const matchBadge = matchPct > 0
            ? `<div class="match-badge" style="background:${matchBadgeBg};color:${matchBadgeColor};border:1px solid ${matchBadgeColor};padding:4px 12px;border-radius:20px;font-size:0.85rem;font-weight:700;display:inline-flex;align-items:center;gap:6px;">
                <i class="fas ${matchIcon}"></i> ${matchPct}% Match
                ${matchInfo.matchedCount > 0 ? `<span style="font-size:0.75rem;opacity:0.8;">(${matchInfo.matchedCount}/${matchInfo.totalRequired})</span>` : ''}
               </div>`
            : `<div style="height:26px;"></div>`;

        // Show matched and missing skills
        const skillChips = (job.required_skills || []).map(s => {
            const isOwned = matchInfo.matchedSkills && matchInfo.matchedSkills.some(ms => ms.toLowerCase() === s.toLowerCase());
            return `<span class="skill-chip ${isOwned ? 'skill-chip-owned' : ''}" title="${isOwned ? 'You have this skill' : 'Missing skill'}">${escapeHtml(s)} ${isOwned ? '<i class="fas fa-check" style="margin-left:4px;color:#16a34a;"></i>' : ''}</span>`;
        }).join('');

        // Show match details if available
        const matchDetails = matchInfo.matchedSkills && matchInfo.matchedSkills.length > 0
            ? `<div style="margin-top:8px;padding:8px;background:#f8fafc;border-radius:8px;font-size:0.8rem;">
                <div style="color:#16a34a;font-weight:600;margin-bottom:4px;">
                    <i class="fas fa-check-circle"></i> Matched: ${matchInfo.matchedSkills.map(s => escapeHtml(s)).join(', ')}
                </div>
                ${matchInfo.missingSkills && matchInfo.missingSkills.length > 0
                ? `<div style="color:#ef4444;font-weight:600;">
                        <i class="fas fa-times-circle"></i> Missing: ${matchInfo.missingSkills.map(s => escapeHtml(s)).join(', ')}
                    </div>`
                : '<div style="color:#16a34a;font-weight:600;"><i class="fas fa-trophy"></i> Perfect Match! You have all required skills.</div>'
            }
            </div>`
            : '';

        const isDirectApply = job.apply_enabled !== false;
        const applyBtn = !isDirectApply
            ? `<button class="btn" disabled style="background:#e2e8f0;color:#64748b;cursor:not-allowed;"><i class="fas fa-eye"></i> Listed Record</button>`
            : (isApplied
                ? `<button class="btn applied-btn" disabled><i class="fas fa-check-circle"></i> Applied</button>`
                : `<button class="btn btn-primary apply-btn" onclick="applyJob('${job.id}')">Apply Now <i class="fas fa-arrow-right"></i></button>`);

        const bookmarkIcon = showBookmark
            ? `<button class="bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" onclick="toggleBookmark('${job.id}', event)" title="${isBookmarked ? 'Remove bookmark' : 'Save job'}">
                <i class="fas fa-bookmark"></i>
               </button>`
            : '';

        return `
            <div class="job-card" style="border:${borderWidth} solid ${borderColor}; ${isSmartMatch ? 'box-shadow:0 4px 16px rgba(245,158,11,0.15);' : ''}">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
                    ${matchBadge}
                    <div style="display:flex; gap:6px; align-items:center;">
                        ${deadlineBadge}
                        ${bookmarkIcon}
                    </div>
                </div>
                <div class="job-content">
                    <div class="job-role">${escapeHtml(job.role_title)}</div>
                    <div class="job-company"><i class="fas fa-building"></i> ${escapeHtml(job.company_name)}</div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px;">
                        <span class="info-chip"><i class="fas fa-wallet"></i> ${escapeHtml(job.stipend || 'Unpaid')}</span>
                        <span class="info-chip"><i class="fas fa-clock"></i> ${escapeHtml(job.duration || 'Flexible')}</span>
                        <span class="info-chip"><i class="fas fa-map-marker-alt"></i> ${escapeHtml(job.mode || 'Remote')}</span>
                    </div>
                    <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">${skillChips || '<span style="color:#94a3b8;font-size:0.8rem;">No skills listed</span>'}</div>
                    ${matchDetails}
                </div>
                ${applyBtn}
            </div>`;
    }).join('');
}

// Apply for a job
async function applyJob(jobId) {
    if (!confirm('Are you sure you want to apply for this position?')) return;

    try {
        const res = await authenticatedFetch(`/applications`, {
            method: 'POST',
            body: JSON.stringify({ company_id: jobId })
        });
        const data = await safeJson(res);

        if (res.ok) {
            showToast('Application submitted successfully!', 'success');
            loadJobs();
            loadDashboardStats();
        } else {
            showToast(data.message || data.error || 'Could not apply.', 'warning');
        }
    } catch (err) {
        showToast('Network error. Please try again.', 'error');
    }
}

// ==========================================
// BOOKMARK SYSTEM
// ==========================================
function toggleBookmark(jobId, event) {
    event.stopPropagation();
    const id = String(jobId);
    if (bookmarkedIds.has(id)) {
        bookmarkedIds.delete(id);
        showToast('Job removed from saved.', 'info');
    } else {
        bookmarkedIds.add(id);
        showToast('Job saved! View it in Saved Jobs.', 'success');
    }
    localStorage.setItem('bookmarks', JSON.stringify([...bookmarkedIds]));
    updateBookmarkBadge();
    applyFilters(); // re-render to update bookmark icon
}

function updateBookmarkBadge() {
    const badge = document.getElementById('bookmarkBadge');
    if (!badge) return;
    if (bookmarkedIds.size > 0) {
        badge.innerText = bookmarkedIds.size;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function clearBookmarks() {
    if (bookmarkedIds.size === 0) { showToast('No saved jobs to clear.', 'info'); return; }
    if (!confirm('Clear all saved jobs?')) return;
    bookmarkedIds.clear();
    localStorage.setItem('bookmarks', '[]');
    updateBookmarkBadge();
    renderBookmarks();
    showToast('All saved jobs cleared.', 'info');
}

function renderBookmarks() {
    const container = document.getElementById('bookmarksList');
    if (!container) return;
    const saved = allOpportunities.filter(j => bookmarkedIds.has(String(j.id)));
    if (saved.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-bookmark" style="font-size:3rem; color:#cbd5e1;"></i><p>No saved jobs yet.<br>Click the bookmark icon on any job card.</p></div>`;
        return;
    }
    renderJobCards(saved, container, false);
}

// ==========================================
// APPLICATIONS
// ==========================================
async function loadApplications() {
    const tbody = document.getElementById('applicationsList');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#64748b;"><i class="fas fa-circle-notch fa-spin"></i> Loading...</td></tr>';

    try {
        const res = await authenticatedFetch(`/applications/my`);
        const responseData = await safeJson(res, []);
        const apps = Array.isArray(responseData) ? responseData : (responseData.data || []);

        if (apps.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:3rem;color:#94a3b8;"><i class="fas fa-file-alt" style="font-size:3rem;display:block;margin-bottom:1rem;"></i>No applications yet. Go find opportunities!</td></tr>';
            return;
        }

        tbody.innerHTML = apps.map(app => {
            const statusInfo = getStatusInfo(app.status);
            return `
                <tr class="app-row">
                    <td style="padding:14px 16px;font-weight:600;">${escapeHtml(app.company_name)}</td>
                    <td style="padding:14px 16px;color:#475569;">${escapeHtml(app.role || app.role_title || '—')}</td>
                    <td style="padding:14px 16px;">
                        <span class="status-badge" style="background:${statusInfo.bg};color:${statusInfo.color};border:1px solid ${statusInfo.border};">
                            <i class="fas ${statusInfo.icon}"></i> ${escapeHtml(app.status)}
                        </span>
                    </td>
                    <td style="padding:14px 16px;color:#64748b;font-size:0.85rem;">
                        ${app.admin_reason
                    ? `<span><i class="fas fa-comment-alt" style="color:#94a3b8;margin-right:5px;font-size:0.8rem;"></i>${escapeHtml(app.admin_reason)}</span>`
                    : '<span style="color:#d1d5db;">—</span>'}
                    </td>
                    <td style="padding:14px 16px;color:#64748b;font-size:0.9rem;">${new Date(app.applied_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td style="padding:14px 16px;">
                        <button onclick="withdrawApp('${app.id}')" class="btn-icon-danger" title="Withdraw Application">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                </tr>`;
        }).join('');
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#ef4444;">Failed to load applications.</td></tr>';
    }
}

function getStatusInfo(status) {
    const s = (status || '').toLowerCase();
    if (s === 'shortlisted') return { bg: '#ecfdf5', color: '#065f46', border: '#6ee7b7', icon: 'fa-star' };
    if (s === 'offered') return { bg: '#f0fdf4', color: '#16a34a', border: '#86efac', icon: 'fa-handshake' };
    if (s === 'rejected') return { bg: '#fef2f2', color: '#dc2626', border: '#fca5a5', icon: 'fa-times-circle' };
    return { bg: '#eff6ff', color: '#1e40af', border: '#93c5fd', icon: 'fa-paper-plane' };
}

function getStatusColor(status) { return getStatusInfo(status).bg; }

async function withdrawApp(appId) {
    if (!confirm('Withdraw this application? This cannot be undone.')) return;
    try {
        const res = await authenticatedFetch(`/applications/${appId}`, {
            method: 'DELETE'
        });
        if (res.ok || res.status === 204) {
            showToast('Application withdrawn.', 'info');
            loadApplications();
            loadDashboardStats();
        } else {
            showToast('Could not withdraw. Try again.', 'error');
        }
    } catch (err) {
        showToast('Network error.', 'error');
    }
}

// ==========================================
// DASHBOARD STATS
// ==========================================
async function loadDashboardStats() {
    try {
        const res = await authenticatedFetch(`/stats/dashboard`);
        if (!res.ok) return;
        const { data } = await safeJson(res);

        animateCounter(document.getElementById('statApplied'), data.total || 0);
        animateCounter(document.getElementById('statShortlisted'), data.shortlisted || 0);
        animateCounter(document.getElementById('statOffered'), data.offered || 0);
        animateCounter(document.getElementById('statVerified'), data.verifiedSkills || 0);

        // Update profile score
        updateProfileScoreBar(data.profileScore || 0);
    } catch (err) {
        console.warn('Stats load failed:', err);
    }
}

function updateProfileScoreBar(score) {
    const bar = document.getElementById('profileScoreBar');
    const label = document.getElementById('profileScoreLabel');
    const hint = document.getElementById('profileScoreHint');
    if (bar) { bar.style.width = score + '%'; bar.style.background = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444'; }
    if (label) { label.innerText = score + '%'; }
    if (hint) {
        if (score < 30) hint.innerText = 'Upload your resume to boost your profile score.';
        else if (score < 60) hint.innerText = 'Verify more skills using AI to increase your score!';
        else if (score < 90) hint.innerText = 'Great progress! Verify remaining skills for a perfect profile.';
        else hint.innerText = 'Excellent! Your profile is highly competitive.';
    }
}

// ==========================================
// PROFILE
// ==========================================
const toArr = v => Array.isArray(v) ? v : (v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : []);

async function loadProfile() {
    // Render immediately from cache so profile tab isn't blank on load
    _renderProfileUI();

    // Fetch latest from server in background
    try {
        const res = await authenticatedFetch(`/profile/me`);
        if (res.ok) {
            const json = await safeJson(res);
            const data = json.data || json;
            // Deep merge — server is source of truth for skills
            currentUser = {
                ...currentUser,
                ...data,
                skills: toArr(data.skills || currentUser.skills),
                verified_skills: toArr(data.verified_skills || currentUser.verified_skills)
            };
            localStorage.setItem('user', JSON.stringify(currentUser));
            _renderProfileUI(); // re-render with fresh data
            applyFilters();     // refresh job match badges
        }
    } catch (err) {
        console.warn('Using cached profile data.');
    }
}

function _renderProfileUI() {
    const name = currentUser.full_name || currentUser.name || 'Student';
    const nameEl = document.getElementById('profileName');
    const emailEl = document.getElementById('profileEmail');
    const initEl = document.getElementById('profileInitials');
    const userEl = document.getElementById('userName');
    const avatarEl = document.getElementById('avatar');
    if (nameEl) nameEl.innerText = name;
    if (emailEl) emailEl.innerText = currentUser.email || '';
    if (initEl) initEl.innerText = name.charAt(0).toUpperCase();
    if (userEl) userEl.innerText = name;
    if (avatarEl) avatarEl.innerText = name.charAt(0).toUpperCase();

    // College Verified badge — show only if admin has verified this student
    const cvBadge = document.getElementById('collegeVerifiedBadge');
    if (cvBadge) {
        cvBadge.style.display = currentUser.college_verified ? 'inline-flex' : 'none';
    }

    renderSkills(toArr(currentUser.skills), toArr(currentUser.verified_skills));
}

function renderSkills(allSkills, verifiedSkills) {
    const container = document.getElementById('skills-container');
    if (!container) return;
    if (!Array.isArray(allSkills) || allSkills.length === 0) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = '';
    allSkills.forEach(skill => {
        const verified = verifiedSkills.some(v => v.toLowerCase() === skill.toLowerCase());
        const pill = document.createElement('div');
        pill.className = verified ? 'skill-pill verified' : 'skill-pill';
        pill.innerHTML = verified
            ? `${escapeHtml(skill)} <i class="fas fa-certificate" title="AI Verified"></i>`
            : `${escapeHtml(skill)} <button onclick="startVerification('${escapeHtml(skill)}')" class="verify-btn">Verify</button>`;
        container.appendChild(pill);
    });
}

async function uploadResume() {
    const fileInput = document.getElementById('resumeInput');
    const file = fileInput.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { showToast('Please upload a PDF file only.', 'warning'); return; }
    if (file.size > 10 * 1024 * 1024) { showToast('File too large. Max 10MB.', 'warning'); return; }

    const formData = new FormData();
    formData.append('resume', file);

    const uploadStatus = document.getElementById('uploadStatus');
    uploadStatus.innerHTML = `<div style="color:var(--primary); font-weight:500;"><i class="fas fa-brain fa-spin"></i> AI analyzing your resume...</div>`;
    uploadStatus.classList.remove('hidden');

    try {
        const res = await authenticatedFetch(`/profile/upload-resume`, {
            method: 'POST',
            body: formData
        });
        const data = await safeJson(res);

        if (res.ok) {
            currentUser.skills = data.skills_identified;
            currentUser.resume_link = data.resume_url;
            localStorage.setItem('user', JSON.stringify(currentUser));

            renderSkills(currentUser.skills, currentUser.verified_skills || []);
            loadDashboardStats();

            const skillCount = data.skills_identified?.length || 0;
            uploadStatus.innerHTML = `
                <div style="color:var(--secondary); font-weight:600; display:flex; align-items:center; gap:8px;">
                    <i class="fas fa-check-circle"></i>
                    <span>Resume uploaded! ${skillCount} skill${skillCount !== 1 ? 's' : ''} detected.</span>
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:10px;">
                    ${(data.skills_identified || []).map(s => `<span class="skill-chip skill-chip-owned">${escapeHtml(s)}</span>`).join('')}
                </div>`;
            showToast(`Resume parsed! ${skillCount} skills found.`, 'success');
        } else {
            uploadStatus.innerHTML = `<p style="color:#ef4444;"><i class="fas fa-exclamation-circle"></i> ${escapeHtml(data.message || 'Upload failed.')}</p>`;
            showToast(data.message || 'Resume upload failed.', 'error');
        }
    } catch (err) {
        uploadStatus.innerHTML = `<p style="color:#ef4444;">Server error. Please try again.</p>`;
        showToast('Server error.', 'error');
    }
}

function handleResumeDrop(event) {
    event.preventDefault();
    document.getElementById('resumeDropZone').classList.remove('drag-over');
    const file = event.dataTransfer.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { showToast('Only PDF files are allowed.', 'warning'); return; }
    const dt = new DataTransfer();
    dt.items.add(file);
    document.getElementById('resumeInput').files = dt.files;
    uploadResume();
}

// ==========================================
// AI VERIFICATION & QUIZ
// ==========================================
async function startVerification(skill) {
    // ── 24-hour cooldown check ──────────────────────────────────────────
    try {
        const histRes = await authenticatedFetch(`/skills/history`);
        if (histRes.ok) {
            const histData = await safeJson(histRes);
            const attempts = Array.isArray(histData.data) ? histData.data : [];
            const now = Date.now();
            const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

            // Find most recent failed attempt for this skill
            const recentFail = attempts.find(a =>
                a.skill_name?.toLowerCase() === skill.toLowerCase() &&
                a.passed === false &&
                (now - new Date(a.created_at).getTime()) < TWENTY_FOUR_HOURS
            );

            if (recentFail) {
                const failedAt = new Date(recentFail.created_at).getTime();
                const elapsed = now - failedAt;
                const remaining = TWENTY_FOUR_HOURS - elapsed;
                const hoursLeft = Math.ceil(remaining / (60 * 60 * 1000));
                const minutesLeft = Math.ceil(remaining / (60 * 1000));
                const displayTime = hoursLeft >= 1 ? `${hoursLeft} hour${hoursLeft > 1 ? 's' : ''}` : `${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}`;
                showToast(`⏳ You failed the ${skill} quiz recently. Please wait ${displayTime} before retrying.`, 'warning', 6000);
                return; // Block quiz start
            }
        }
    } catch (_) { /* Non-fatal — proceed with quiz if check fails */ }
    // ───────────────────────────────────────────────────────────────────

    currentQuizSkill = skill;
    const modal = document.getElementById('quizModal');
    const loading = document.getElementById('quizLoading');
    const questionsDiv = document.getElementById('quizQuestions');
    const resultDiv = document.getElementById('quizResult');

    modal.classList.remove('hidden');
    loading.classList.remove('hidden');
    questionsDiv.classList.add('hidden');
    resultDiv.classList.add('hidden');

    try {
        const res = await authenticatedFetch(`/ai/quiz`, {
            method: 'POST',
            body: JSON.stringify({ skill })
        });
        const data = await safeJson(res);

        if (data.quiz && data.quiz.length > 0) {
            currentQuizData = data.quiz;
            loading.classList.add('hidden');
            questionsDiv.classList.remove('hidden');
            renderQuizForm(skill, data.quiz);
            startQuizTimer(5 * 60);
        } else {
            throw new Error('AI returned empty quiz.');
        }
    } catch (err) {
        closeModal();
        showToast('Failed to generate quiz. Please try again.', 'error');
    }
}

function startQuizTimer(seconds) {
    const badge = document.getElementById('quizTimerBadge');
    const display = document.getElementById('timerDisplay');
    if (!badge || !display) return;
    badge.classList.remove('hidden');

    clearInterval(quizTimerInterval);
    let remaining = seconds;

    quizTimerInterval = setInterval(() => {
        remaining--;
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        display.innerText = `${m}:${s.toString().padStart(2, '0')}`;

        if (remaining <= 60) { badge.style.background = '#fee2e2'; badge.style.color = '#dc2626'; }
        if (remaining <= 0) {
            clearInterval(quizTimerInterval);
            showToast('Time is up! Auto-submitting...', 'warning');
            submitQuiz();
        }
    }, 1000);
}

function renderQuizForm(skill, questions) {
    document.getElementById('quizSkillTitle').innerText = `Skill: ${skill}`;
    const form = document.getElementById('quizForm');
    const progressFill = document.getElementById('quizProgressFill');
    form.innerHTML = '';

    questions.forEach((q, index) => {
        const qDiv = document.createElement('div');
        qDiv.className = 'quiz-question';

        let optionsHtml = '';
        q.options.forEach((opt, optIndex) => {
            optionsHtml += `
                <label class="quiz-option">
                    <input type="radio" name="q${index}" value="${optIndex}" onchange="updateQuizProgress(${questions.length})">
                    <span class="option-text">${escapeHtml(opt)}</span>
                </label>`;
        });

        qDiv.innerHTML = `<p style="font-weight:600;margin-bottom:10px;color:#1e293b;">${index + 1}. ${escapeHtml(q.question)}</p>${optionsHtml}`;
        form.appendChild(qDiv);
    });
}

function updateQuizProgress(total) {
    const answered = document.querySelectorAll('#quizForm input[type="radio"]:checked').length;
    const pct = (answered / total) * 100;
    const fill = document.getElementById('quizProgressFill');
    if (fill) fill.style.width = pct + '%';
}

async function submitQuiz() {
    clearInterval(quizTimerInterval);
    const badge = document.getElementById('quizTimerBadge');
    if (badge) badge.classList.add('hidden');

    if (!currentQuizData) return;

    const answers = [];
    let allAnswered = true;

    currentQuizData.forEach((q, index) => {
        const selected = document.querySelector(`input[name="q${index}"]:checked`);
        if (!selected) { allAnswered = false; answers.push(-1); }
        else answers.push(parseInt(selected.value));
    });

    if (!allAnswered) {
        showToast('Please answer all questions before submitting.', 'warning');
        return;
    }

    let score = 0;
    currentQuizData.forEach((q, index) => {
        if (answers[index] === q.correctIndex) score++;
    });

    const passed = score >= 4;

    document.getElementById('quizQuestions').classList.add('hidden');
    document.getElementById('quizResult').classList.remove('hidden');

    const resultIcon = document.getElementById('resultIcon');
    const resultTitle = document.getElementById('resultTitle');
    const resultMessage = document.getElementById('resultMessage');
    const retryBtn = document.getElementById('retryBtn');

    if (passed) {
        resultIcon.className = 'fas fa-medal';
        resultIcon.style.color = '#f59e0b';
        resultTitle.innerText = 'Verified! Gold Badge Earned.';
        resultMessage.innerText = `You scored ${score}/${currentQuizData.length}. ${currentQuizSkill} has been verified!`;
        showToast(`${currentQuizSkill} verified! Gold Badge awarded.`, 'success', 6000);
    } else {
        resultIcon.className = 'fas fa-times-circle';
        resultIcon.style.color = '#ef4444';
        resultTitle.innerText = 'Not Quite There Yet';
        resultMessage.innerText = `You scored ${score}/${currentQuizData.length}. You need 4/5 to pass.`;
        if (retryBtn) retryBtn.style.display = 'inline-flex';
        showStudyResources(currentQuizSkill);
    }

    await saveVerification(score, passed);
    await fetchAIFeedback(currentQuizSkill, score, currentQuizData.length);
}

function showStudyResources(skill) {
    const box = document.getElementById('studyResourcesBox');
    const list = document.getElementById('studyResourcesList');
    if (!box || !list) return;

    const s = (skill || '').toLowerCase();
    const resources = [
        { label: `Free ${skill} Course`, url: `https://www.freecodecamp.org`, icon: 'fa-graduation-cap' },
        { label: `${skill} on YouTube`, url: `https://www.youtube.com/results?search_query=${encodeURIComponent(skill + ' tutorial')}`, icon: 'fa-play-circle' },
        { label: `${skill} Documentation`, url: `https://devdocs.io`, icon: 'fa-book' }
    ];

    list.innerHTML = resources.map(r =>
        `<a href="${r.url}" target="_blank" rel="noopener" class="resource-link"><i class="fas ${r.icon}"></i> ${escapeHtml(r.label)}</a>`
    ).join('');
    box.classList.remove('hidden');
}

async function fetchAIFeedback(skill, score, total) {
    const box = document.getElementById('aiFeedbackBox');
    const text = document.getElementById('aiFeedbackText');
    if (!box || !text) return;

    box.classList.remove('hidden');
    text.innerText = 'Getting personalized feedback from AI...';

    try {
        const res = await authenticatedFetch(`/ai/feedback`, {
            method: 'POST',
            body: JSON.stringify({ skill, score, total })
        });
        const data = await safeJson(res);
        if (data.feedback) {
            text.innerText = data.feedback;
        } else {
            box.classList.add('hidden');
        }
    } catch (err) {
        box.classList.add('hidden');
    }
}

async function saveVerification(score, passed) {
    const skill = currentQuizSkill;
    const response = await authenticatedFetch(`/skills/submit`, {
        method: 'POST',
        body: JSON.stringify({ user_id: currentUser.id, skill_name: skill, score, passed })
    });

    if (passed) {
        const data = await safeJson(response);

        if (!currentUser.verified_skills) currentUser.verified_skills = [];
        if (!currentUser.verified_skills.some(v => v.toLowerCase() === skill.toLowerCase())) {
            currentUser.verified_skills.push(skill);
        }
        localStorage.setItem('user', JSON.stringify(currentUser));
        renderSkills(currentUser.skills || [], currentUser.verified_skills);
        applyFilters();
        loadDashboardStats();

        // NEW: Show match results if available
        if (data.topMatches && data.topMatches.length > 0) {
            const matchInfo = data.matchInfo || {};
            const matchMessage = `
                <div style="background:#f0fdf4;border:2px solid #16a34a;border-radius:12px;padding:16px;margin-top:12px;">
                    <div style="font-weight:700;color:#16a34a;margin-bottom:8px;font-size:1rem;">
                        <i class="fas fa-chart-line"></i> Job Matching Results
                    </div>
                    <div style="color:#065f46;font-size:0.9rem;margin-bottom:12px;">
                        Analyzed ${matchInfo.totalJobsAnalyzed || 0} opportunities:
                        ${matchInfo.perfectMatches || 0} perfect matches, ${matchInfo.goodMatches || 0} good matches
                    </div>
                    <div style="font-weight:600;color:#1e293b;margin-bottom:8px;">Top Matches:</div>
                    <div style="display:flex;flex-direction:column;gap:6px;">
                        ${data.topMatches.slice(0, 3).map(match => `
                            <div style="background:white;padding:8px;border-radius:8px;border:1px solid #d1d5db;">
                                <div style="font-weight:600;color:#1e293b;">${escapeHtml(match.company_name)} - ${escapeHtml(match.role_title)}</div>
                                <div style="color:#16a34a;font-size:0.85rem;margin-top:4px;">
                                    <i class="fas fa-percentage"></i> ${match.matchPercentage}% Match
                                    (${match.matchedSkills.length}/${match.matchedSkills.length + (match.missingSkills?.length || 0)} skills)
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div style="margin-top:12px;padding-top:12px;border-top:1px solid #d1d5db;">
                        <button onclick="switchTab('jobs');closeModal();" class="btn btn-primary" style="width:100%;">
                            <i class="fas fa-briefcase"></i> View All Matched Jobs
                        </button>
                    </div>
                </div>
            `;

            // Add to quiz result modal
            const resultDiv = document.getElementById('quizResult');
            if (resultDiv) {
                const existingContent = resultDiv.innerHTML;
                resultDiv.innerHTML = existingContent + matchMessage;
            }

            showToast(`Found ${matchInfo.goodMatches || 0} great matches after verifying ${skill}!`, 'success', 8000);
        }

        // Refresh jobs to show updated match ratios
        loadJobs();
    }
}

function retryCurrentSkill() {
    closeModal();
    setTimeout(() => { if (currentQuizSkill) startVerification(currentQuizSkill); }, 300);
}

function closeModal() {
    clearInterval(quizTimerInterval);
    document.getElementById('quizModal')?.classList.add('hidden');

    // Reset quiz modal state
    const loading = document.getElementById('quizLoading');
    const questions = document.getElementById('quizQuestions');
    const result = document.getElementById('quizResult');
    const badge = document.getElementById('quizTimerBadge');
    const aiFeedback = document.getElementById('aiFeedbackBox');
    const studyBox = document.getElementById('studyResourcesBox');
    const retryBtn = document.getElementById('retryBtn');

    if (loading) loading.classList.remove('hidden');
    if (questions) questions.classList.add('hidden');
    if (result) result.classList.add('hidden');
    if (badge) { badge.classList.add('hidden'); badge.style.background = ''; badge.style.color = ''; }
    if (aiFeedback) aiFeedback.classList.add('hidden');
    if (studyBox) studyBox.classList.add('hidden');
    if (retryBtn) retryBtn.style.display = 'none';

    const fill = document.getElementById('quizProgressFill');
    if (fill) fill.style.width = '0%';
}

// ==========================================
// SKILL GAP ANALYSIS
// ==========================================
function openSkillGapAnalysis() {
    document.getElementById('skillGapModal').classList.remove('hidden');
    document.getElementById('gapResult').classList.add('hidden');
}

async function runSkillGap() {
    const select = document.getElementById('gapJobSelect');
    const jobId = select?.value;
    if (!jobId) { showToast('Please select an opportunity first.', 'warning'); return; }

    const job = allOpportunities.find(j => String(j.id) === String(jobId));
    if (!job) { showToast('Could not find that job.', 'error'); return; }

    const resultDiv = document.getElementById('gapResult');
    resultDiv.classList.remove('hidden');
    resultDiv.innerHTML = `<div style="text-align:center;padding:2rem;"><i class="fas fa-brain fa-spin" style="color:var(--primary);font-size:2rem;"></i><p style="margin-top:10px;color:#64748b;">AI generating your learning plan...</p></div>`;

    try {
        const res = await fetch(`${API_BASE_URL}/ai/skill-gap`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userSkills: [...(currentUser.verified_skills || []), ...(currentUser.skills || [])],
                targetRole: job.role_title,
                requiredSkills: job.required_skills || []
            })
        });
        const data = await safeJson(res);

        if (data.gapSkills?.length === 0) {
            resultDiv.innerHTML = `
                <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:1.5rem;text-align:center;">
                    <i class="fas fa-trophy" style="font-size:3rem;color:#16a34a;margin-bottom:1rem;"></i>
                    <h3 style="color:#065f46;">You're Ready!</h3>
                    <p style="color:#064e3b;">You have all the required skills for <strong>${escapeHtml(job.role_title)}</strong> at <strong>${escapeHtml(job.company_name)}</strong>!</p>
                    <button onclick="applyJob('${job.id}')" class="btn btn-primary" style="margin-top:1rem;">Apply Now <i class="fas fa-arrow-right"></i></button>
                </div>`;
            return;
        }

        const plan = data.plan;
        const weeks = Array.isArray(plan?.weeks) ? plan.weeks : [];

        resultDiv.innerHTML = `
            <div style="background:#f8fafc;border-radius:12px;padding:1.5rem;border:1px solid #e2e8f0;">
                <h3 style="color:#1e293b;margin-bottom:8px;"><i class="fas fa-route" style="color:var(--primary);"></i> 30-Day Learning Plan</h3>
                <p style="color:#475569;font-size:0.9rem;margin-bottom:1.5rem;">${escapeHtml(typeof plan === 'string' ? plan : plan?.summary || '')}</p>

                <div style="margin-bottom:1.5rem;">
                    <p style="font-weight:600;color:#1e293b;margin-bottom:8px;">Missing Skills:</p>
                    <div style="display:flex;flex-wrap:wrap;gap:6px;">
                        ${(data.gapSkills || []).map(s => `<span class="skill-chip" style="background:#fee2e2;color:#dc2626;border-color:#fca5a5;">${escapeHtml(s)}</span>`).join('')}
                    </div>
                </div>

                ${weeks.length > 0 ? `
                <div style="display:grid;gap:10px;">
                    ${weeks.map(w => {
            const rawResource = (w.resource || '').trim();
            // Check if the resource is a real URL (starts with http:// or https://)
            const isRealUrl = /^https?:\/\//i.test(rawResource);
            let linkUrl = '';
            let linkLabel = '';
            if (rawResource) {
                if (isRealUrl) {
                    linkUrl = rawResource;
                    linkLabel = rawResource.length > 60 ? rawResource.substring(0, 57) + '...' : rawResource;
                } else {
                    // It's plain text like "Search SQLite tutorial on YouTube" — create a Google search link
                    linkUrl = 'https://www.google.com/search?q=' + encodeURIComponent(rawResource);
                    linkLabel = rawResource;
                }
            }
            return `
                        <div style="background:white;border-radius:10px;padding:14px;border:1px solid #e2e8f0;display:flex;gap:12px;align-items:flex-start;">
                            <div style="background:linear-gradient(135deg,var(--primary),var(--primary-dark));color:white;border-radius:8px;padding:6px 12px;font-weight:700;font-size:0.85rem;white-space:nowrap;">Wk ${w.week}</div>
                            <div>
                                <p style="font-weight:600;color:#1e293b;margin-bottom:3px;">${escapeHtml(w.focus || '')}</p>
                                <p style="color:#64748b;font-size:0.85rem;margin-bottom:4px;">${escapeHtml(w.goal || '')}</p>
                                ${linkUrl ? `<a href="${escapeHtml(linkUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary);font-size:0.8rem;font-weight:500;"><i class="fas fa-external-link-alt"></i> ${escapeHtml(linkLabel)}</a>` : ''}
                            </div>
                        </div>`;
        }).join('')}
                </div>` : ''}

                ${plan?.tip ? `<div style="background:#fffbeb;border-radius:10px;padding:12px;margin-top:1rem;border:1px solid #fcd34d;">
                    <p style="color:#b45309;font-size:0.9rem;"><i class="fas fa-lightbulb"></i> ${escapeHtml(plan.tip)}</p>
                </div>` : ''}
            </div>`;
    } catch (err) {
        resultDiv.innerHTML = `<p style="color:#ef4444;text-align:center;">Failed to generate analysis. Please try again.</p>`;
    }
}

// ==========================================
// PDF DOWNLOAD — PROFESSIONAL PLACEMENT PROFILE
// ==========================================
async function downloadProfile() {
    showToast('Building Placement Profile...', 'info', 4000);

    // --- Fetch fresh stats ---
    let stats = { total: 0, shortlisted: 0, offered: 0, rejected: 0, verifiedSkills: 0, profileScore: 0 };
    try {
        const r = await fetch(`${API_BASE_URL}/stats/dashboard`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (r.ok) { const d = await safeJson(r); stats = d.data || stats; }
    } catch (_) { }

    const u = currentUser;
    const name = escapeHtml(u.full_name || u.name || 'Student');
    const email = escapeHtml(u.email || '—');
    const batch = escapeHtml(u.batch_year || '—');
    const role = escapeHtml(u.role || 'Student');
    const allSkills = u.skills || [];
    const verifiedSkills = u.verified_skills || [];
    const initials = name.replace(/[^A-Z]/g, '') || name.charAt(0).toUpperCase() || 'S';
    const profileId = 'PT-' + Math.random().toString(36).substr(2, 8).toUpperCase();
    const dateIssued = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
    const scoreColor = stats.profileScore >= 70 ? '#16a34a' : stats.profileScore >= 40 ? '#d97706' : '#dc2626';

    // Skill rows helper
    const renderSkillRow = (arr, verified = false) =>
        arr.map(s =>
            `<span style="display:inline-flex;align-items:center;gap:5px;background:${verified ? '#f0fdf4' : '#eff6ff'};
            color:${verified ? '#166534' : '#1e40af'};border:1px solid ${verified ? '#86efac' : '#bfdbfe'};
            padding:4px 12px;border-radius:20px;font-size:11px;font-weight:600;margin:3px;">
            ${verified ? '<span style="color:#ca8a04;font-size:11px;">★</span>' : ''}${escapeHtml(s)}</span>`
        ).join('');

    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Arial', Helvetica, sans-serif; font-size: 12px; color: #1e293b; background: #fff; }
  .page { width: 210mm; min-height: 297mm; padding: 18mm 18mm 14mm; }

  /* ── HEADER ── */
    .hdr { display:flex; align-items:center; justify-content:space-between; padding-bottom:10px; border-bottom:3px solid #25a244; margin-bottom:18px; }
  .hdr-logo  { display:flex; align-items:center; gap:10px; }
    .hdr-icon  { width:46px; height:46px; border-radius:10px; background:linear-gradient(135deg,#25a244,#1a7a32); display:flex; align-items:center; justify-content:center; color:#fff; font-size:22px; font-weight:900; }
    .hdr-title { font-size:20px; font-weight:800; color:#25a244; letter-spacing:-0.3px; }
  .hdr-sub   { font-size:10px; color:#64748b; margin-top:1px; }
  .doc-label { text-align:right; }
  .doc-label h2 { font-size:13px; font-weight:700; color:#1e293b; letter-spacing:0.5px; text-transform:uppercase; }
  .doc-label p  { font-size:9px; color:#64748b; margin-top:2px; }

  /* ── STUDENT BANNER ── */
    .student-banner { background:linear-gradient(135deg,#25a244 0%,#1a7a32 100%); border-radius:12px; padding:18px 22px; display:flex; align-items:center; gap:18px; margin-bottom:18px; color:#fff; }
  .avatar { width:62px; height:62px; border-radius:50%; background:rgba(255,255,255,0.2); border:3px solid rgba(255,255,255,0.5); display:flex; align-items:center; justify-content:center; font-size:26px; font-weight:800; color:#fff; flex-shrink:0; }
  .student-info h1 { font-size:20px; font-weight:800; letter-spacing:-0.3px; }
  .student-info .meta { font-size:10px; opacity:0.85; margin-top:5px; }
  .student-info .badges { margin-top:8px; display:flex; gap:6px; flex-wrap:wrap; }
  .badge-pill { background:rgba(255,255,255,0.22); border:1px solid rgba(255,255,255,0.35); color:#fff; padding:3px 10px; border-radius:20px; font-size:9.5px; font-weight:600; }
  .score-block { margin-left:auto; text-align:center; flex-shrink:0; }
  .score-circle { width:62px; height:62px; border-radius:50%; border:4px solid rgba(255,255,255,0.4); display:flex; align-items:center; justify-content:center; flex-direction:column; }
  .score-num  { font-size:17px; font-weight:800; line-height:1; }
  .score-lbl  { font-size:8px; opacity:0.8; margin-top:1px; }

  /* ── SECTION ── */
  .section { margin-bottom:16px; }
    .sec-title { display:flex; align-items:center; gap:7px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.7px; color:#25a244; border-bottom:1.5px solid #d1fae5; padding-bottom:5px; margin-bottom:10px; }
  .sec-title span { font-size:13px; }

  /* ── INFO TABLE ── */
  .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 16px; }
  .info-row  { display:flex; gap:6px; align-items:flex-start; }
  .info-key  { font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase; min-width:92px; padding-top:1px; }
  .info-val  { font-size:11px; color:#1e293b; font-weight:500; }

  /* ── STAT CARDS ── */
  .stat-row  { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; }
  .stat-box  { border-radius:8px; padding:10px 8px; text-align:center; border:1px solid #e2e8f0; }
  .stat-num  { font-size:20px; font-weight:800; }
  .stat-lbl  { font-size:9px; color:#64748b; margin-top:3px; font-weight:600; text-transform:uppercase; }

  /* ── COMPETENCY BAR ── */
  .bar-row   { margin-bottom:8px; }
  .bar-label { display:flex; justify-content:space-between; font-size:10px; margin-bottom:3px; }
  .bar-track { background:#e2e8f0; border-radius:4px; height:7px; }
  .bar-fill  { border-radius:4px; height:7px; }

  /* ── SIGNATURE ── */
  .sig-row   { display:grid; grid-template-columns:1fr 1fr 1fr; gap:20px; margin-top:4px; }
  .sig-box   { text-align:center; }
  .sig-line  { border-top:1.5px solid #334155; margin-top:36px; padding-top:6px; font-size:9px; color:#64748b; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; }

  /* ── FOOTER ── */
  .footer { margin-top:18px; padding-top:10px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:flex-end; }
  .footer-left  { font-size:8.5px; color:#94a3b8; line-height:1.6; }
  .footer-right { text-align:right; font-size:8.5px; color:#94a3b8; }
    .watermark    { color:#25a244; font-weight:700; font-size:9px; }

  .verified-note { background:#fefce8; border:1px solid #fde68a; border-radius:6px; padding:6px 10px; font-size:9.5px; color:#92400e; margin-bottom:8px; }
  .resume-badge  { display:inline-flex; align-items:center; gap:5px; background:#f0fdf4; border:1px solid #86efac; color:#166534; padding:4px 12px; border-radius:20px; font-size:10px; font-weight:600; }
  .no-skill      { font-size:10px; color:#94a3b8; font-style:italic; }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="hdr">
    <div class="hdr-logo">
                <div class="hdr-icon">P</div>
      <div>
                <div class="hdr-title">Placement Tracker</div>
                <div class="hdr-sub">Placement & Internship Management Platform</div>
      </div>
    </div>
    <div class="doc-label">
      <h2>Student Placement Profile</h2>
      <p>Document ID: ${profileId}</p>
      <p>Issued: ${dateIssued}</p>
    </div>
  </div>

  <!-- STUDENT BANNER -->
  <div class="student-banner">
    <div class="avatar">${initials.charAt(0)}</div>
    <div class="student-info">
      <h1>${name}</h1>
      <div class="meta">${email} &nbsp;|&nbsp; Batch: ${batch} &nbsp;|&nbsp; Role: ${role}</div>
      <div class="badges">
        <span class="badge-pill">✓ Platform Verified</span>
        ${verifiedSkills.length > 0 ? `<span class="badge-pill">★ ${verifiedSkills.length} AI-Certified Skill${verifiedSkills.length > 1 ? 's' : ''}</span>` : ''}
        ${u.resume_link ? '<span class="badge-pill">Resume Uploaded</span>' : ''}
      </div>
    </div>
    <div class="score-block">
      <div class="score-circle">
        <div class="score-num">${stats.profileScore}%</div>
        <div class="score-lbl">Profile</div>
      </div>
      <div style="font-size:8.5px;margin-top:5px;opacity:0.85;">Strength Score</div>
    </div>
  </div>

  <!-- PERSONAL INFORMATION -->
  <div class="section">
    <div class="sec-title"><span>Person</span> Personal &amp; Academic Information</div>
    <div class="info-grid">
      <div class="info-row"><span class="info-key">Full Name</span><span class="info-val">${name}</span></div>
      <div class="info-row"><span class="info-key">Email Address</span><span class="info-val">${email}</span></div>
      <div class="info-row"><span class="info-key">Batch / Year</span><span class="info-val">${batch}</span></div>
      <div class="info-row"><span class="info-key">Account Role</span><span class="info-val">${role}</span></div>
      <div class="info-row"><span class="info-key">Total Skills</span><span class="info-val">${allSkills.length} skills identified from resume</span></div>
      <div class="info-row"><span class="info-key">Resume</span>
        <span class="info-val">${u.resume_link ? '<span style="color:#16a34a;font-weight:700;">✓ Uploaded &amp; Verified</span>' : '<span style="color:#dc2626;">Not uploaded</span>'}</span>
      </div>
    </div>
  </div>

  <!-- PLACEMENT STATISTICS -->
  <div class="section">
    <div class="sec-title"><span>Stats</span> Placement Activity Summary</div>
    <div class="stat-row">
      <div class="stat-box" style="background:#eff6ff;border-color:#bfdbfe;">
        <div class="stat-num" style="color:#1d4ed8;">${stats.total}</div>
        <div class="stat-lbl">Applied</div>
      </div>
      <div class="stat-box" style="background:#f0fdf4;border-color:#86efac;">
        <div class="stat-num" style="color:#16a34a;">${stats.shortlisted}</div>
        <div class="stat-lbl">Shortlisted</div>
      </div>
      <div class="stat-box" style="background:#fefce8;border-color:#fde68a;">
        <div class="stat-num" style="color:#ca8a04;">${stats.offered}</div>
        <div class="stat-lbl">Offered</div>
      </div>
      <div class="stat-box" style="background:#fef2f2;border-color:#fca5a5;">
        <div class="stat-num" style="color:#dc2626;">${stats.rejected}</div>
        <div class="stat-lbl">Rejected</div>
      </div>
            <div class="stat-box" style="background:#ecfdf3;border-color:#bbf7d0;">
                <div class="stat-num" style="color:#25a244;">${verifiedSkills.length}</div>
        <div class="stat-lbl">Verified Skills</div>
      </div>
    </div>
  </div>

  <!-- PROFILE STRENGTH -->
  <div class="section">
    <div class="sec-title"><span>Analysis</span> Profile Strength Breakdown</div>
    <div class="bar-row">
      <div class="bar-label"><span>Resume Uploaded</span><span>${u.resume_link ? '30/30 pts' : '0/30 pts'}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${u.resume_link ? 100 : 0}%;background:#16a34a;"></div></div>
    </div>
    <div class="bar-row">
      <div class="bar-label"><span>AI-Verified Skills</span><span>${Math.min(verifiedSkills.length * 10, 40)}/40 pts</span></div>
    <div class="bar-track"><div class="bar-fill" style="width:${Math.min((verifiedSkills.length * 10 / 40) * 100, 100)}%;background:#25a244;"></div></div>
    </div>
    <div class="bar-row">
      <div class="bar-label"><span>Resume Skills</span><span>${Math.min(allSkills.length * 2, 20)}/20 pts</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.min((allSkills.length * 2 / 20) * 100, 100)}%;background:#0891b2;"></div></div>
    </div>
    <div style="margin-top:8px;display:flex;align-items:center;gap:8px;">
      <span style="font-size:10px;color:#64748b;font-weight:600;">Overall Profile Score:</span>
      <span style="font-size:13px;font-weight:800;color:${scoreColor};">${stats.profileScore}%</span>
      <span style="font-size:9px;color:#64748b;">(${stats.profileScore >= 70 ? 'Excellent — Ready for placements' : stats.profileScore >= 40 ? 'Good — Verify more skills to improve' : 'Needs work — Upload resume & verify skills'})</span>
    </div>
  </div>

  <!-- AI-VERIFIED SKILLS -->
  <div class="section">
    <div class="sec-title"><span>★</span> AI-Certified Skill Competency</div>
    ${verifiedSkills.length > 0 ? `
      <div class="verified-note">
        The following skills have been assessed and certified by Placement Tracker AI Assessment System. Each skill was tested via a 5-question adaptive quiz with a minimum passing score of 80%.
      </div>
      <div style="margin-bottom:6px;">${renderSkillRow(verifiedSkills, true)}</div>
    ` : `<p class="no-skill">No skills AI-verified yet. Use the Skill Assessment feature on the dashboard.</p>`}
  </div>

  <!-- ALL SKILLS -->
  <div class="section">
    <div class="sec-title"><span>Skills</span> Technical Skills (Resume-Extracted)</div>
    ${allSkills.length > 0
            ? `<div>${renderSkillRow(allSkills.filter(s => !verifiedSkills.some(v => v.toLowerCase() === s.toLowerCase())))}</div>
           ${verifiedSkills.length > 0 ? `<p style="font-size:9px;color:#64748b;margin-top:6px;">Note: AI-verified skills shown in the section above are excluded here.</p>` : ''}`
            : `<p class="no-skill">No skills extracted. Please upload a PDF resume to auto-populate skills.</p>`}
  </div>

  <!-- SIGNATURE -->
  <div class="section">
    <div class="sec-title"><span>Certification</span> Certification &amp; Signatures</div>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;font-size:9.5px;color:#475569;line-height:1.6;margin-bottom:12px;">
    This document certifies that <strong>${name}</strong> is a registered student on the Placement Tracker platform. 
      The skill competency ratings herein are generated based on AI-assisted assessments conducted on the platform. 
      This profile is valid for use in college placement drives, internship applications, and company onboarding processes.
    </div>
    <div class="sig-row">
      <div class="sig-box"><div class="sig-line">Student Signature<br>${name}</div></div>
    <div class="sig-box"><div class="sig-line">Placement Officer<br>Placement Tracker</div></div>
      <div class="sig-box"><div class="sig-line">Date of Issue<br>${dateIssued}</div></div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <div class="footer-left">
    <div class="watermark">Placement Tracker — Placement Platform</div>
      <div>This is a digitally generated document. Profile ID: ${profileId}</div>
    <div>Verify authenticity at: placementtracker.platform/verify/${profileId}</div>
    </div>
    <div class="footer-right">
      <div>Generated on ${dateIssued}</div>
      <div>For official use — Placement &amp; Internship Drives</div>
    </div>
  </div>

</div>
</body>
</html>`;

    const opt = {
        margin: 10,
        filename: `${(u.full_name || u.name || 'Student').replace(/\s+/g, '_')}_Placement_Profile_${profileId}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
        // Pass HTML string directly — html2pdf renders it in its own iframe,
        // which guarantees layout is complete and nothing is off-screen.
        await html2pdf().set(opt).from(html, 'string').save();
        showToast('Placement Profile downloaded successfully!', 'success', 4000);
    } catch (err) {
        console.error('PDF error:', err);
        showToast('PDF generation failed. Please try again.', 'error');
    }
}

// ==========================================
// UTILITIES
// ==========================================
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Backward compat
