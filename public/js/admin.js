/* =========================================================
    Placement Tracker Admin Panel JS
   ========================================================= */

// ---------- Auth Guard ----------
const adminUser = JSON.parse(localStorage.getItem('user'));
if (!adminUser || adminUser.role !== 'admin') {
    localStorage.setItem('adminRedirect', 'yes');
    window.location.href = 'index.html';
}

// ---------- Toast System ----------
function toast(msg, type = 'info') {
    const container = document.getElementById('toast-admin');
    const el = document.createElement('div');
    const icon = {
        success: 'fa-check-circle', error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle', info: 'fa-info-circle'
    }[type] || 'fa-info-circle';
    el.className = `toast-item toast-${type}`;
    el.innerHTML = `<i class="fas ${icon}"></i>${msg}<span onclick="this.parentElement.remove()"
        style="margin-left:auto; cursor:pointer; opacity:0.6; font-size:0.9rem;">&#x2715;</span>`;
    container.appendChild(el);
    setTimeout(() => { el.style.animation = 'slideOut 0.3s ease forwards'; el.addEventListener('animationend', () => el.remove()); }, 4000);
}

// ---------- Dark Mode ----------
function adminToggleDark() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = dark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('adminTheme', next);
    document.getElementById('darkIcon').className = next === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    document.getElementById('darkLabel').textContent = next === 'dark' ? 'Light Mode' : 'Dark Mode';
}
(function initAdminTheme() {
    const saved = localStorage.getItem('adminTheme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    if (saved === 'dark') {
        document.getElementById('darkIcon').className = 'fas fa-sun';
        document.getElementById('darkLabel').textContent = 'Light Mode';
    }
})();

// ---------- Tab Switching ----------
function switchTab(tabName) {
    ['post-job', 'students', 'apply-student', 'applicants', 'rankings', 'stats'].forEach(t => {
        const el = document.getElementById(`tab-${t}`);
        if (el) el.classList.add('hidden');
    });
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');

    const idx = { 'post-job': 0, 'students': 1, 'apply-student': 2, 'applicants': 3, 'rankings': 4, 'stats': 5 }[tabName];
    const navItems = document.querySelectorAll('.nav-item');
    if (navItems[idx]) navItems[idx].classList.add('active');

    if (tabName === 'applicants') loadAllApplications();
    if (tabName === 'stats') loadAdminStats();
    if (tabName === 'students') loadStudents();
    if (tabName === 'apply-student') loadApplyDropdowns();
    if (tabName === 'rankings') loadRankings();
}

function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

// ---------- 1. POST JOB ----------
document.getElementById('postJobForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const company_name = document.getElementById('jobCompany').value.trim();
    const role_title = document.getElementById('jobRole').value.trim();
    const stipend = document.getElementById('jobStipend').value.trim();
    const duration = document.getElementById('jobDuration').value.trim();
    const mode = document.getElementById('jobMode').value;
    const type = document.getElementById('jobType').value;
    const location = document.getElementById('jobLocation').value.trim();
    const deadline = document.getElementById('jobDeadline').value;
    const rawSkills = document.getElementById('jobSkills').value;

    if (!mode || !type) { toast('Please select a Mode and Type.', 'warning'); return; }

    const required_skills = rawSkills
        ? rawSkills.split(',').map(s => s.trim()).filter(Boolean)
        : [];

    const btn = e.submitter;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publishing...';

    try {
        const res = await authenticatedFetch('/internships', {
            method: 'POST',
            body: JSON.stringify({ company_name, role_title, stipend, duration, mode, type, location, deadline, required_skills })
        });
        const data = await safeJson(res);
        if (res.ok) {
            toast(`"${role_title}" at ${company_name} posted successfully!`, 'success');
            document.getElementById('postJobForm').reset();
        } else {
            toast('Error: ' + (data.error || data.message || 'Failed to post'), 'error');
        }
    } catch (err) {
        console.error(err);
        toast('Network error. Please try again.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Publish Opportunity';
    }
});

// ---------- 2. LOAD APPLICATIONS ----------
let allAppsCache = [];

async function loadAllApplications() {
    const tbody = document.getElementById('adminAppList');
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:3rem; color:#94a3b8;">
        <i class="fas fa-spinner fa-spin fa-2x"></i><br><br>Loading applications...</td></tr>`;

    try {
        const res = await authenticatedFetch('/applications/admin-view');
        if (!res.ok) throw new Error('Fetch failed');
        const data = await safeJson(res, []);
        allAppsCache = Array.isArray(data) ? data : (data.data || []);

        document.getElementById('appSubtitle').textContent = `${allAppsCache.length} application${allAppsCache.length !== 1 ? 's' : ''} found`;
        document.getElementById('totalBadge').textContent = allAppsCache.length;

        renderAppsTable(allAppsCache);
    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:3rem; color:#ef4444;">
            <i class="fas fa-exclamation-circle fa-2x"></i><br><br>Failed to load applications.</td></tr>`;
    }
}

function filterAdminApps() {
    const q = document.getElementById('adminSearch').value.toLowerCase();
    const status = document.getElementById('adminStatusFilter').value;
    const filtered = allAppsCache.filter(app => {
        const matchQ = !q ||
            (app.student_name || '').toLowerCase().includes(q) ||
            (app.company_name || '').toLowerCase().includes(q) ||
            (app.role_title || '').toLowerCase().includes(q);
        const matchS = !status || app.status === status;
        return matchQ && matchS;
    });
    renderAppsTable(filtered);
}

document.addEventListener('DOMContentLoaded', () => {
    const si = document.getElementById('adminSearch');
    if (si) si.addEventListener('input', filterAdminApps);
});

function renderAppsTable(apps) {
    const tbody = document.getElementById('adminAppList');
    if (!apps.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:4rem; color:#94a3b8;">
            <i class="fas fa-users-slash fa-2x" style="margin-bottom:10px; display:block;"></i>
            No applications match your filter.</td></tr>`;
        return;
    }

    tbody.innerHTML = apps.map((app, i) => {
        const { badge, icon } = getStatusStyle(app.status);
        const date = app.applied_at ? new Date(app.applied_at).toLocaleDateString('en-IN') : '&mdash;';
        return `
        <tr class="app-row">
            <td style="color:#94a3b8; font-size:0.8rem;">${i + 1}</td>
            <td><strong>${escapeAdmin(app.student_name || 'N/A')}</strong></td>
            <td>${escapeAdmin(app.company_name || '—')}</td>
            <td>${escapeAdmin(app.role_title || app.role || '—')}</td>
            <td style="color:#64748b; font-size:0.85rem;">${date}</td>
            <td>
                <span class="offer-tag ${badge}">
                    <i class="fas ${icon}" style="margin-right:4px;"></i>${app.status}
                </span>
                ${app.admin_reason ? `<div style="font-size:0.78rem;color:#64748b;margin-top:5px;font-style:italic;max-width:180px;white-space:normal;line-height:1.4;"><i class="fas fa-comment-alt" style="color:#94a3b8;margin-right:4px;"></i>${escapeAdmin(app.admin_reason)}</div>` : ''}
            </td>
            <td style="white-space:nowrap;">
                ${app.resume_link
                ? `<a href="${app.resume_link}" target="_blank" title="View Resume"
                        style="color:var(--primary); margin-right:10px;">
                        <i class="fas fa-file-pdf fa-lg"></i></a>`
                : `<span style="color:#d1d5db; margin-right:10px;"><i class="fas fa-file-excel fa-lg"></i></span>`}
                ${(app.status || '').toLowerCase() === 'applied' ? `
                    <button class="action-btn" style="background:#22c55e; color:white;" title="Shortlist"
                        onclick="openStatusModal('${app.id}', 'Shortlisted')">
                        <i class="fas fa-check"></i>
                    </button>
                    <button class="action-btn" style="background:#f97316; color:white; margin-left:6px;" title="Offer"
                        onclick="openStatusModal('${app.id}', 'Offered')">
                        <i class="fas fa-trophy"></i>
                    </button>
                    <button class="action-btn" style="background:#ef4444; color:white; margin-left:6px;" title="Reject"
                        onclick="openStatusModal('${app.id}', 'Rejected')">
                        <i class="fas fa-times"></i>
                    </button>
                ` : (app.status || '').toLowerCase() === 'shortlisted' ? `
                    <button class="action-btn" style="background:#f97316; color:white;" title="Offer"
                        onclick="openStatusModal('${app.id}', 'Offered')">
                        <i class="fas fa-trophy"></i>
                    </button>
                    <button class="action-btn" style="background:#ef4444; color:white; margin-left:6px;" title="Reject"
                        onclick="openStatusModal('${app.id}', 'Rejected')">
                        <i class="fas fa-times"></i>
                    </button>
                ` : `<span style="color:#cbd5e1; font-size:0.8rem;">—</span>`}
            </td>
        </tr>`;
    }).join('');
}

function getStatusStyle(status) {
    const map = {
        'applied': { badge: 'badge-applied', icon: 'fa-paper-plane' },
        'shortlisted': { badge: 'badge-shortlisted', icon: 'fa-check-circle' },
        'offered': { badge: 'badge-offered', icon: 'fa-trophy' },
        'rejected': { badge: 'badge-rejected', icon: 'fa-times-circle' }
    };
    return map[(status || '').toLowerCase()] || { badge: 'badge-applied', icon: 'fa-question-circle' };
}

// ---------- 3. UPDATE STATUS ----------
let _pendingStatusId = null;
let _pendingStatusValue = null;

function openStatusModal(appId, newStatus) {
    _pendingStatusId = appId;
    _pendingStatusValue = newStatus;

    const modal = document.getElementById('statusReasonModal');
    const title = document.getElementById('statusModalTitle');
    const badge = document.getElementById('statusModalBadge');
    const textarea = document.getElementById('statusReasonText');

    const styles = {
        Shortlisted: { bg: '#f0fdf4', color: '#166534', border: '#86efac', icon: 'fa-check-circle' },
        Offered: { bg: '#fefce8', color: '#92400e', border: '#fde68a', icon: 'fa-trophy' },
        Rejected: { bg: '#fef2f2', color: '#991b1b', border: '#fca5a5', icon: 'fa-times-circle' }
    };
    const c = styles[newStatus] || { bg: '#eff6ff', color: '#1e40af', border: '#bfdbfe', icon: 'fa-info-circle' };

    title.textContent = `Change Status to "${newStatus}"`;
    badge.innerHTML = `<i class="fas ${c.icon}"></i> ${newStatus}`;
    badge.style.cssText = `display:inline-flex;align-items:center;gap:6px;background:${c.bg};color:${c.color};border:1px solid ${c.border};padding:5px 16px;border-radius:20px;font-size:0.82rem;font-weight:600;`;
    textarea.value = '';
    modal.classList.remove('hidden');
    textarea.focus();
}

function closeStatusModal() {
    document.getElementById('statusReasonModal').classList.add('hidden');
    _pendingStatusId = null;
    _pendingStatusValue = null;
}

async function confirmStatusUpdate() {
    if (!_pendingStatusId || !_pendingStatusValue) return;
    const reason = document.getElementById('statusReasonText').value.trim();
    await updateStatus(_pendingStatusId, _pendingStatusValue, reason);
    closeStatusModal();
}

async function updateStatus(appId, newStatus, reason) {
    try {
        const res = await authenticatedFetch(`/applications/${appId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status: newStatus, reason: reason || '' })
        });
        if (res.ok) {
            toast(`Status updated to "${newStatus}"${reason ? ' — Reason noted.' : ''}`, 'success');
            loadAllApplications();
        } else {
            const d = await safeJson(res);
            toast('Failed: ' + (d.error || d.message), 'error');
        }
    } catch (err) {
        console.error(err);
        toast('Server error while updating status.', 'error');
    }
}

// ---------- 4. ANALYTICS TAB ----------
async function loadAdminStats() {
    try {
        const res = await authenticatedFetch('/applications/admin-view');
        if (!res.ok) throw new Error();
        const data = await safeJson(res, []);
        const apps = Array.isArray(data) ? data : (data.data || []);

        const total = apps.length;
        const shortlisted = apps.filter(a => a.status === 'Shortlisted').length;
        const offered = apps.filter(a => a.status === 'Offered').length;
        const rejected = apps.filter(a => a.status === 'Rejected').length;

        animateNum(document.getElementById('sTotal'), total);
        animateNum(document.getElementById('sShortlisted'), shortlisted);
        animateNum(document.getElementById('sOffered'), offered);
        animateNum(document.getElementById('sRejected'), rejected);

        // Status breakdown pills
        const breakdown = document.getElementById('statusBreakdown');
        const statuses = ['Applied', 'Shortlisted', 'Offered', 'Rejected'];
        breakdown.innerHTML = statuses.map(s => {
            const count = apps.filter(a => a.status === s).length;
            const pct = total ? Math.round((count / total) * 100) : 0;
            const { badge } = getStatusStyle(s);
            return `<div style="flex:1; min-width:140px;">
                <div class="offer-tag ${badge}"
                    style="display:block; text-align:center; padding:12px; border-radius:12px; margin-bottom:6px;">
                    <div style="font-size:1.6rem; font-weight:700;">${count}</div>
                    <div style="font-size:0.78rem; margin-top:2px;">${s}</div>
                </div>
                <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
                <div style="text-align:center; font-size:0.75rem; color:#94a3b8; margin-top:4px;">${pct}%</div>
            </div>`;
        }).join('');
    } catch (err) {
        toast('Could not load analytics.', 'error');
    }
}

function animateNum(el, target) {
    if (!el) return;
    let start = 0;
    const step = Math.ceil(target / 30);
    const t = setInterval(() => {
        start = Math.min(start + step, target);
        el.textContent = start;
        if (start >= target) clearInterval(t);
    }, 30);
}

// ---------- Utility ----------
function escapeAdmin(str) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str)));
    return d.innerHTML;
}

// ==========================================
// STUDENTS TAB — College Verified Badge
// ==========================================
let allStudentsCache = [];

async function loadStudents() {
    const tbody = document.getElementById('studentList');
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:3rem;color:#94a3b8;">
        <i class="fas fa-spinner fa-spin fa-2x"></i><br><br>Loading students...</td></tr>`;

    try {
        const res = await authenticatedFetch('/admin/students');
        if (!res.ok) throw new Error('Fetch failed');
        const data = await safeJson(res);
        allStudentsCache = Array.isArray(data.data) ? data.data : [];
        document.getElementById('studentSubtitle').textContent =
            `${allStudentsCache.length} student${allStudentsCache.length !== 1 ? 's' : ''} registered`;
        document.getElementById('studentBadge').textContent = allStudentsCache.length;
        renderStudentsTable(allStudentsCache);
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:3rem;color:#ef4444;">
            <i class="fas fa-exclamation-circle fa-2x"></i><br><br>Failed to load students.</td></tr>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const si = document.getElementById('adminSearch');
    if (si) si.addEventListener('input', filterAdminApps);
    const ss = document.getElementById('studentSearch');
    if (ss) ss.addEventListener('input', () => {
        const q = ss.value.toLowerCase();
        const filtered = allStudentsCache.filter(s =>
            (s.full_name || '').toLowerCase().includes(q) ||
            (s.email || '').toLowerCase().includes(q)
        );
        renderStudentsTable(filtered);
    });
});

function renderStudentsTable(students) {
    const tbody = document.getElementById('studentList');
    if (!students.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:3rem;color:#94a3b8;">
            No students found.</td></tr>`;
        return;
    }
    tbody.innerHTML = students.map((s, i) => {
        const isVerified = !!s.college_verified;
        const verifiedSkillsCount = Array.isArray(s.verified_skills) ? s.verified_skills.length : 0;
        return `
        <tr class="app-row">
            <td style="color:#94a3b8;font-size:0.8rem;">${i + 1}</td>
            <td><strong>${escapeAdmin(s.full_name || 'N/A')}</strong></td>
            <td style="color:#64748b;font-size:0.85rem;">${escapeAdmin(s.email || '—')}</td>
            <td style="color:#64748b;font-size:0.85rem;">${escapeAdmin(s.batch_year || '—')}</td>
            <td style="text-align:center;">
                <span style="background:#ecfdf3;color:#166534;padding:3px 10px;border-radius:20px;font-size:0.8rem;font-weight:600;">
                    ${verifiedSkillsCount} skill${verifiedSkillsCount !== 1 ? 's' : ''}
                </span>
            </td>
            <td style="text-align:center;">
                ${isVerified
                ? `<span class="offer-tag badge-shortlisted"><i class="fas fa-check-circle"></i> Verified</span>`
                : `<span class="offer-tag badge-rejected"><i class="fas fa-times-circle"></i> Not Verified</span>`
            }
            </td>
            <td style="white-space:nowrap;">
                ${isVerified
                ? `<button class="action-btn" style="background:#ef4444;color:white;" title="Revoke Verification"
                        onclick="toggleCollegeVerify('${s.id}', false)">
                        <i class="fas fa-times"></i>
                       </button>`
                : `<button class="action-btn" style="background:#22c55e;color:white;" title="Grant College Verified Badge"
                        onclick="toggleCollegeVerify('${s.id}', true)">
                        <i class="fas fa-check"></i>
                       </button>`
            }
            </td>
        </tr>`;
    }).join('');
}

async function toggleCollegeVerify(studentId, verified) {
    try {
        const res = await authenticatedFetch(`/admin/students/${studentId}/verify`, {
            method: 'PUT',
            body: JSON.stringify({ college_verified: verified })
        });
        if (res.ok) {
            toast(`College Verified badge ${verified ? 'granted' : 'revoked'} successfully.`, 'success');
            loadStudents();
        } else {
            const d = await safeJson(res);
            toast('Failed: ' + (d.message || d.error), 'error');
        }
    } catch (err) {
        toast('Server error.', 'error');
    }
}

// ==========================================
// APPLY FOR STUDENT TAB
// ==========================================
async function loadApplyDropdowns() {
    try {
        const [studRes, intRes] = await Promise.all([
            authenticatedFetch('/admin/students'),
            authenticatedFetch('/internships')
        ]);
        const studData = await safeJson(studRes);
        const intData = await safeJson(intRes, []);

        const students = Array.isArray(studData.data) ? studData.data : [];
        const internships = Array.isArray(intData) ? intData : (intData.data || []);

        const studSelect = document.getElementById('applyStudentSelect');
        studSelect.innerHTML = '<option value="">-- Select Student --</option>' +
            students.map(s => `<option value="${s.id}">${escapeAdmin(s.full_name)} (${escapeAdmin(s.email)})</option>`).join('');

        const intSelect = document.getElementById('applyInternshipSelect');
        intSelect.innerHTML = '<option value="">-- Select Opportunity --</option>' +
            internships.map(i => `<option value="${i.id}">${escapeAdmin(i.company_name)} – ${escapeAdmin(i.role_title)}</option>`).join('');
    } catch (err) {
        toast('Failed to load dropdowns.', 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const applyForm = document.getElementById('adminApplyForm');
    if (applyForm) {
        applyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const student_id = document.getElementById('applyStudentSelect').value;
            const internship_id = document.getElementById('applyInternshipSelect').value;
            if (!student_id || !internship_id) { toast('Please select a student and an opportunity.', 'warning'); return; }

            const btn = e.submitter;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

            try {
                const res = await authenticatedFetch('/admin/applications', {
                    method: 'POST',
                    body: JSON.stringify({ student_id, internship_id })
                });
                const data = await safeJson(res);
                if (res.ok) {
                    toast('Application created successfully!', 'success');
                    applyForm.reset();
                } else {
                    toast('Error: ' + (data.message || data.error || 'Failed'), 'error');
                }
            } catch (err) {
                toast('Network error. Please try again.', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-file-signature"></i> Submit Application';
            }
        });
    }
});

// ==========================================
// STUDENT RANKINGS TAB
// ==========================================
let allRankingsCache = [];

async function loadRankings() {
    const tbody = document.getElementById('rankingList');
    const podium = document.getElementById('rankingPodium');
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:3rem;color:#94a3b8;">
        <i class="fas fa-spinner fa-spin fa-2x"></i><br><br>Loading rankings...</td></tr>`;
    if (podium) podium.innerHTML = '';

    try {
        const res = await authenticatedFetch('/admin/rankings');
        if (!res.ok) throw new Error('Fetch failed');
        const data = await safeJson(res);
        allRankingsCache = Array.isArray(data.data) ? data.data : [];

        document.getElementById('rankingBadge').textContent = allRankingsCache.length;

        // Populate department and batch filters
        const depts = [...new Set(allRankingsCache.map(s => s.department).filter(Boolean))].sort();
        const batches = [...new Set(allRankingsCache.map(s => s.batch_year).filter(Boolean))].sort();
        const deptSelect = document.getElementById('rankDeptFilter');
        const batchSelect = document.getElementById('rankBatchFilter');
        deptSelect.innerHTML = '<option value="">All Departments</option>' + depts.map(d => `<option value="${d}">${escapeAdmin(d)}</option>`).join('');
        batchSelect.innerHTML = '<option value="">All Batches</option>' + batches.map(b => `<option value="${b}">${escapeAdmin(b)}</option>`).join('');

        renderRankings(allRankingsCache);
    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:3rem;color:#ef4444;">
            <i class="fas fa-exclamation-circle fa-2x"></i><br><br>Failed to load rankings.</td></tr>`;
    }
}

function filterRankings() {
    const q = (document.getElementById('rankSearch')?.value || '').toLowerCase();
    const dept = document.getElementById('rankDeptFilter')?.value || '';
    const batch = document.getElementById('rankBatchFilter')?.value || '';
    const filtered = allRankingsCache.filter(s => {
        const matchQ = !q || (s.full_name || '').toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q);
        const matchD = !dept || s.department === dept;
        const matchB = !batch || String(s.batch_year) === batch;
        return matchQ && matchD && matchB;
    });
    renderRankings(filtered);
}

function renderRankings(students) {
    const tbody = document.getElementById('rankingList');
    const podium = document.getElementById('rankingPodium');

    if (!students.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:3rem;color:#94a3b8;">No students match your filter.</td></tr>`;
        if (podium) podium.innerHTML = '';
        return;
    }

    // Top 3 Podium
    if (podium) {
        const top3 = students.slice(0, 3);
        const medals = ['🥇', '🥈', '🥉'];
        const medalColors = [
            { bg: 'linear-gradient(135deg, #fef3c7, #fde68a)', border: '#f59e0b', glow: 'rgba(245,158,11,0.3)' },
            { bg: 'linear-gradient(135deg, #f1f5f9, #e2e8f0)', border: '#94a3b8', glow: 'rgba(148,163,184,0.3)' },
            { bg: 'linear-gradient(135deg, #fef3c7, #fed7aa)', border: '#f97316', glow: 'rgba(249,115,22,0.25)' }
        ];
        const avatarGradients = [
            'linear-gradient(135deg, #f59e0b, #d97706)',
            'linear-gradient(135deg, #64748b, #475569)',
            'linear-gradient(135deg, #f97316, #ea580c)'
        ];

        podium.innerHTML = `<div class="podium-grid">${top3.map((s, i) => {
            const initials = (s.full_name || 'NA').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
            const score = Number(s.ranking_score || 0).toFixed(1);
            const skillCount = s.verified_skills_count || 0;
            return `
            <div class="podium-card ${i === 0 ? 'podium-gold' : ''}" style="background:${medalColors[i].bg}; border:2px solid ${medalColors[i].border}; box-shadow:0 8px 32px ${medalColors[i].glow};">
                <div class="podium-medal">${medals[i]}</div>
                <div class="podium-avatar" style="background:${avatarGradients[i]};">${initials}</div>
                <h4 class="podium-name">${escapeAdmin(s.full_name || 'N/A')}</h4>
                <p class="podium-dept">${escapeAdmin(s.department || 'N/A')} ${s.batch_year ? '• ' + s.batch_year : ''}</p>
                <div class="podium-score">${score}</div>
                <div class="podium-stats-row">
                    <span title="CGPA"><i class="fas fa-graduation-cap"></i> ${Number(s.cgpa || 0).toFixed(1)}</span>
                    <span title="Verified Skills"><i class="fas fa-check-double"></i> ${skillCount}</span>
                    <span title="Offers"><i class="fas fa-trophy"></i> ${s.offers_count || 0}</span>
                </div>
                ${s.college_verified ? '<div class="podium-verified"><i class="fas fa-shield-check"></i> College Verified</div>' : ''}
            </div>`;
        }).join('')}</div>`;
    }

    // Full table
    tbody.innerHTML = students.map((s, i) => {
        const rank = i + 1;
        const score = Number(s.ranking_score || 0).toFixed(1);
        const skillCount = s.verified_skills_count || 0;
        const skills = Array.isArray(s.verified_skills) ? s.verified_skills : [];
        const skillPills = skills.slice(0, 3).map(sk => `<span class="ranking-skill-pill">${escapeAdmin(sk)}</span>`).join('') + (skills.length > 3 ? `<span class="ranking-skill-pill more">+${skills.length - 3}</span>` : '');
        const rankBadge = rank === 1 ? '<span class="rank-medal gold">🥇</span>'
            : rank === 2 ? '<span class="rank-medal silver">🥈</span>'
                : rank === 3 ? '<span class="rank-medal bronze">🥉</span>'
                    : `<span class="rank-number">${rank}</span>`;

        return `
        <tr class="app-row ranking-row ${rank <= 3 ? 'top-rank' : ''}">
            <td style="text-align:center;">${rankBadge}</td>
            <td>
                <div style="display:flex;align-items:center;gap:10px;">
                    <div class="ranking-avatar" style="background:${rank <= 3 ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'linear-gradient(135deg,#25a244,#1a7a32)'};">
                        ${(s.full_name || 'NA').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                        <strong>${escapeAdmin(s.full_name || 'N/A')}</strong>
                        ${s.college_verified ? '<i class="fas fa-check-circle" style="color:#3b82f6;margin-left:4px;font-size:0.75rem;" title="College Verified"></i>' : ''}
                        <div style="font-size:0.78rem;color:#94a3b8;">${escapeAdmin(s.email || '')}</div>
                    </div>
                </div>
            </td>
            <td style="color:#64748b;font-size:0.85rem;">${escapeAdmin(s.department || '—')} ${s.batch_year ? '<br><span style="font-size:0.75rem;color:#94a3b8;">Batch ' + escapeAdmin(s.batch_year) + '</span>' : ''}</td>
            <td>
                <span class="cgpa-badge ${Number(s.cgpa) >= 8 ? 'cgpa-high' : Number(s.cgpa) >= 6 ? 'cgpa-mid' : 'cgpa-low'}">${Number(s.cgpa || 0).toFixed(1)}</span>
            </td>
            <td>
                <div style="display:flex;flex-wrap:wrap;gap:4px;">${skillPills || '<span style="color:#cbd5e1;font-size:0.8rem;">None</span>'}</div>
            </td>
            <td style="text-align:center;">
                <span class="app-count-badge">${s.total_applications || 0}</span>
            </td>
            <td style="text-align:center;">
                <span class="offer-count-badge ${(s.offers_count || 0) > 0 ? 'has-offers' : ''}">${s.offers_count || 0}</span>
            </td>
            <td style="text-align:center;">
                <div class="ranking-score-badge">${score}</div>
            </td>
        </tr>`;
    }).join('');
}