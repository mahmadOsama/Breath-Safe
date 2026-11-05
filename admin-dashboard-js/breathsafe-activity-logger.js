/* ==========================================
BREATHSAFE ACTIVITY LOGGER v1.1
Dual-Collection Logging
- system_activity_logs: permanent archive (System Log)
- activity_logs: dashboard Recent Activity
========================================== */

(function() {
    'use strict';

    if (window.BreathSafeLogger) return;

    console.log('📝 BreathSafeLogger v1.1 Loading...');

    const FIREBASE_CONFIG = {
        apiKey: "YOUR_FIREBASE_WEB_API_KEY",
        authDomain: "YOUR_FIREBASE_PROJECT_ID.firebaseapp.com",
        databaseURL: "https://YOUR_FIREBASE_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "YOUR_FIREBASE_PROJECT_ID",
        storageBucket: "YOUR_FIREBASE_PROJECT_ID.firebasestorage.app",
        messagingSenderId: "YOUR_FIREBASE_MESSAGING_SENDER_ID",
        appId: "YOUR_FIREBASE_APP_ID",
        measurementId: "YOUR_FIREBASE_MEASUREMENT_ID"
    };

    // Permanent archive (System Activity Log)
    const ARCHIVE_COLLECTION = 'system_activity_logs';
    // Dashboard Recent Activity (can be cleared)
    const RECENT_COLLECTION = 'activity_logs';

    // Only these actions appear in dashboard Recent Activity
    const DASHBOARD_ACTIONS = new Set([
        'login',
        'logout',
        'create',
        'delete',
        'user_approved',
        'user_reactivated',
        'status_change',
        'sensor_assign',
        'sensor_modify',
        'session_end'
    ]);

    let db = null;
    let initialized = false;
    let initPromise = null;
    let cachedIP = null;

    async function init() {
        if (initialized) return true;
        if (initPromise) return initPromise;

        initPromise = (async () => {
            if (typeof firebase === 'undefined') {
                await waitForFirebase();
            }

            let app;
            try {
                app = firebase.app('loggerApp');
            } catch {
                app = firebase.initializeApp(FIREBASE_CONFIG, 'loggerApp');
            }

            db = firebase.firestore(app);
            initialized = true;
            prefetchIP();
            console.log('✅ BreathSafeLogger v1.1 Loaded');
            return true;
        })();

        return initPromise;
    }

    function waitForFirebase() {
        return new Promise((resolve, reject) => {
            let tries = 0;
            const t = setInterval(() => {
                tries++;
                if (typeof firebase !== 'undefined') {
                    clearInterval(t);
                    resolve();
                } else if (tries > 50) {
                    clearInterval(t);
                    reject(new Error('Firebase not available'));
                }
            }, 100);
        });
    }

    function getAdmin() {
        try {
            const s = sessionStorage.getItem('breathsafeAdmin');
            return s ? JSON.parse(s) : null;
        } catch {
            return null;
        }
    }

    function getBrowser() {
        const ua = navigator.userAgent;
        if (ua.includes('Edg/')) return 'Edge';
        if (ua.includes('Chrome')) return 'Chrome';
        if (ua.includes('Firefox')) return 'Firefox';
        if (ua.includes('Safari')) return 'Safari';
        if (ua.includes('OPR') || ua.includes('Opera')) return 'Opera';
        return 'Unknown';
    }

    function getDevice() {
        const ua = navigator.userAgent;
        if (/Mobi|Android/i.test(ua)) return 'Mobile';
        if (/Tablet|iPad/i.test(ua)) return 'Tablet';
        return 'Desktop';
    }

    function getOS() {
        const ua = navigator.userAgent;
        if (ua.includes('Windows NT 11')) return 'Windows 11';
        if (ua.includes('Windows NT 10')) return 'Windows 10';
        if (ua.includes('Windows')) return 'Windows';
        if (ua.includes('Mac OS X')) return 'macOS';
        if (ua.includes('Android')) return 'Android';
        if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
        if (ua.includes('Linux')) return 'Linux';
        return 'Unknown';
    }

    async function prefetchIP() {
        if (cachedIP) return cachedIP;

        try {
            const c = new AbortController();
            setTimeout(() => c.abort(), 3000);
            const res = await fetch('https://api.ipify.org?format=json', { signal: c.signal });
            if (res.ok) {
                const d = await res.json();
                cachedIP = d.ip;
                return cachedIP;
            }
        } catch {}

        try {
            const res = await fetch('https://api.my-ip.io/ip.json');
            if (res.ok) {
                const d = await res.json();
                cachedIP = d.ip;
                return cachedIP;
            }
        } catch {}

        cachedIP = 'Unknown';
        return cachedIP;
    }

    async function getIP() {
        return cachedIP || prefetchIP();
    }

    async function log(action, details = {}, targetUser = '') {
        if (!initialized) {
            const ok = await init();
            if (!ok) return false;
        }

        const admin = getAdmin();
        if (!admin || !admin.id) {
            console.warn('BreathSafeLogger: no admin session');
            return false;
        }

        try {
            const ip = await getIP();
            const fullName = [admin.firstName, admin.lastName].filter(Boolean).join(' ') || admin.username || 'Admin';

            const entry = {
                adminId: admin.id,
                adminUsername: admin.username || 'Unknown',
                adminFullName: fullName,
                adminRole: admin.role || 'regular',
                action,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                details: {
                    ...details,
                    browser: getBrowser(),
                    device: getDevice(),
                    os: getOS(),
                    ipAddress: ip,
                    page: window.location.pathname
                }
            };
            if (targetUser) entry.targetUser = targetUser;

            // 1) Permanent archive (System Log)
            await db.collection(ARCHIVE_COLLECTION).add(entry);

            // 2) Dashboard Recent Activity
            if (DASHBOARD_ACTIONS.has(action)) {
                await db.collection(RECENT_COLLECTION).add(entry);
            }

            console.log(`📝 Logged ${action}${targetUser ? ' → ' + targetUser : ''}`);
            return true;
        } catch (err) {
            console.error('BreathSafeLogger error:', err);
            return false;
        }
    }

    // ===== Convenience Methods =====

    const logProfileUpdate = (changes) =>
        log('profile_update', { changes, changedFields: Object.keys(changes) });

    const logPasswordChange = () =>
        log('password_change', { description: 'Changed account password' });

    const logAvatarChange = (oldAvatar, newAvatar) =>
        log('avatar_change', {
            oldIcon: oldAvatar.icon,
            newIcon: newAvatar.icon,
            oldColor: oldAvatar.color,
            newColor: newAvatar.color,
            oldGradient: oldAvatar.gradient,
            newGradient: newAvatar.gradient
        });

    const logUserCreate = (username, details = {}) =>
        log('create', { type: 'user', ...details }, username);

    const logUserDelete = (username) =>
        log('delete', {}, username);

    const logBulkDelete = (usernames, count) =>
        log('delete', { bulk: true, users: usernames, count });

    const logUserApproval = (username, sensors = []) =>
        log('user_approved', { sensors }, username);

    const logUserReactivation = (username, sensors = []) =>
        log('user_reactivated', { sensors }, username);

    const logStatusChange = (username, oldStatus, newStatus) =>
        log('status_change', { oldStatus, newStatus }, username);

    const logSensorAssign = (username, sensors) =>
        log('sensor_assign', { sensors }, username);

    const logSensorModify = (username, added, removed) =>
        log('sensor_modify', { added, removed }, username);

    const logSessionEnd = (username, reason = '') =>
        log('session_end', { reason }, username);

    const logLogin = () =>
        log('login', { description: 'Logged in to admin panel' });

    const logLogout = async () => {
        const admin = getAdmin();
        const details = { description: 'Logged out from admin panel' };
        if (admin?.loginTime) {
            const ms = Date.now() - new Date(admin.loginTime).getTime();
            details.sessionDuration = ms;
        }
        return log('logout', details);
    };

    window.BreathSafeLogger = Object.freeze({
        init,
        log,
        // Profile
        logProfileUpdate,
        logPasswordChange,
        logAvatarChange,
        // User
        logUserCreate,
        logUserDelete,
        logBulkDelete,
        logUserApproval,
        logUserReactivation,
        logStatusChange,
        logSensorAssign,
        logSensorModify,
        logSessionEnd,
        // Auth
        logLogin,
        logLogout,
        version: '1.1.0'
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(init, 50));
    } else {
        setTimeout(init, 50);
    }
})();