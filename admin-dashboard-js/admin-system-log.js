/* ==========================================
BREATHSAFE SYSTEM LOG v4.1
FULLY INDEPENDENT MONITORING SYSTEM

Features:
- Reads from system_activity_logs (permanent)
- Real-time admin online/offline tracking
- Session management with login/logout
- Complete activity history
- Never affected by Recent Activity deletions
========================================== */

(function() {
    'use strict';

    console.log('🚀 System Log v4.1 Loading...');

    // ==========================================
    // FIREBASE CONFIGURATION
    // ==========================================
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

    // ==========================================
    // PERFORMANCE UTILITIES
    // ==========================================
    const perf = {
        now: () => Date.now(),
        raf: (fn) => requestAnimationFrame(fn),
        debounce(fn, ms) {
            let t;
            return (...args) => {
                clearTimeout(t);
                t = setTimeout(() => fn.apply(this, args), ms);
            };
        }
    };

    // ==========================================
    // STATE
    // ==========================================
    const STATE = {
        db: null,
        rtdb: null,
        initialized: false,
        currentAdmin: window.__ADMIN_DATA__ || {},
        
        // Data
        allAdmins: new Map(),
        onlineAdmins: new Set(), // Real-time tracking
        adminAvatars: new Map(),
        systemLogs: [], // All logs from system_activity_logs
        sessions: new Map(), // Built from logs
        filteredSessions: [],
        
        // Filters
        filters: {
            search: '',
            admin: 'all',
            role: 'all',
            action: 'all',
            dateRange: 'week'
        },
        
        // UI
        expandedSessions: new Set(),
        visibleSessions: [],
        batchSize: 20,
        currentBatch: 0,
        
        // Listeners
        listeners: [],
        presenceListener: null,
        
        // Stats
        stats: {
            totalAdmins: 0,
            onlineNow: 0,
            totalSessions: 0,
            totalActions: 0
        }
    };

    // ==========================================
    // DOM CACHE
    // ==========================================
    const DOM = (() => {
        const cache = new Map();
        return {
            get(id) {
                if (!cache.has(id)) {
                    cache.set(id, document.getElementById(id));
                }
                return cache.get(id);
            },
            clear() { cache.clear(); }
        };
    })();

    // ==========================================
    // UTILITIES
    // ==========================================
    const Utils = {
        escapeDiv: document.createElement('div'),
        
        escape(str) {
            if (!str) return '';
            this.escapeDiv.textContent = str;
            return this.escapeDiv.innerHTML;
        },
        
        getInitials(admin) {
            if (!admin) return 'AD';
            const f = (admin.firstName || '')[0] || '';
            const l = (admin.lastName || '')[0] || '';
            return (f + l).toUpperCase() || (admin.username || 'AD').substring(0, 2).toUpperCase();
        },
        
        formatDuration(ms) {
            if (!ms || ms < 0) return 'Just now';
            const s = Math.floor(ms / 1000);
            if (s < 60) return `${s} seconds`;
            const m = Math.floor(s / 60);
            if (m < 60) return `${m} minute${m > 1 ? 's' : ''}`;
            const h = Math.floor(m / 60);
            if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ${m % 60}m`;
            const d = Math.floor(h / 24);
            return `${d} day${d > 1 ? 's' : ''} ${h % 24}h`;
        },
        
        formatTime(timestamp) {
            if (!timestamp) return 'Unknown';
            try {
                const date = this.toDate(timestamp);
                return date.toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
            } catch {
                return 'Unknown';
            }
        },
        
        toDate(timestamp) {
            if (!timestamp) return new Date();
            if (timestamp instanceof Date) return timestamp;
            if (timestamp.toDate) return timestamp.toDate();
            if (typeof timestamp === 'number') return new Date(timestamp);
            return new Date(timestamp);
        },
        
        toMillis(timestamp) {
            return this.toDate(timestamp).getTime();
        },
        
        getActionIcon(action) {
            const icons = {
                login: 'fa-sign-in-alt',
                logout: 'fa-sign-out-alt',
                create: 'fa-user-plus',
                delete: 'fa-trash-alt',
                user_approved: 'fa-user-check',
                user_reactivated: 'fa-redo',
                status_change: 'fa-toggle-on',
                sensor_assign: 'fa-microchip',
                sensor_modify: 'fa-cogs',
                session_end: 'fa-power-off',
                profile_update: 'fa-user-edit',
                password_change: 'fa-key',
                avatar_change: 'fa-palette'
            };
            return icons[action] || 'fa-circle';
        },
        
        getDeviceIcon(device) {
            if (!device) return 'fa-desktop';
            const d = device.toLowerCase();
            if (d.includes('mobile') || d.includes('phone')) return 'fa-mobile-alt';
            if (d.includes('tablet')) return 'fa-tablet-alt';
            return 'fa-desktop';
        },
        
        getCountryFlag(code) {
            if (!code || code.length !== 2) return '🌐';
            const points = code.toUpperCase().split('').map(c => 127397 + c.charCodeAt());
            return String.fromCodePoint(...points);
        }
    };

    // ==========================================
    // TOAST
    // ==========================================
    const Toast = {
        show(message, type = 'info', duration = 4000) {
            const container = DOM.get('toastContainer');
            if (!container) return;
            
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            
            const icons = {
                success: 'fa-check-circle',
                error: 'fa-exclamation-circle',
                warning: 'fa-exclamation-triangle',
                info: 'fa-info-circle'
            };
            
            toast.innerHTML = `
                <div class="toast-icon"><i class="fas ${icons[type]}"></i></div>
                <div class="toast-content">
                    <div class="toast-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
                    <div class="toast-message">${Utils.escape(message)}</div>
                </div>
                <button class="toast-close"><i class="fas fa-times"></i></button>
                <div class="toast-progress"></div>
            `;
            
            container.appendChild(toast);
            perf.raf(() => toast.classList.add('show'));
            
            toast.querySelector('.toast-close').onclick = () => this.hide(toast);
            setTimeout(() => this.hide(toast), duration);
        },
        
        hide(toast) {
            if (!toast) return;
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 400);
        }
    };

    // ==========================================
    // FIREBASE INIT
    // ==========================================
    async function initFirebase() {
        try {
            let app;
            try {
                app = firebase.app("systemLogApp");
            } catch (e) {
                app = firebase.initializeApp(FIREBASE_CONFIG, "systemLogApp");
            }
            
            STATE.db = firebase.firestore(app);
            STATE.rtdb = firebase.database(app);
            
            try {
                await STATE.db.enablePersistence({ synchronizeTabs: true });
            } catch (err) {
                if (err.code !== 'failed-precondition') {
                    console.warn('Persistence warning:', err.code);
                }
            }
            
            console.log('✅ Firebase connected for System Log');
            return true;
        } catch (error) {
            console.error('❌ Firebase init failed:', error);
            Toast.show('Database connection failed', 'error');
            return false;
        }
    }

    // ==========================================
    // AVATAR MANAGER
    // ==========================================
    const AvatarManager = {
        COLORS: {
            '#10b981': '#059669', '#3b82f6': '#2563eb', '#8b5cf6': '#7c3aed',
            '#ef4444': '#dc2626', '#f59e0b': '#d97706', '#ec4899': '#db2777',
            '#06b6d4': '#0891b2', '#eab308': '#ca8a04', '#374151': '#1f2937',
            '#64748b': '#475569', '#6366f1': '#4f46e5', '#14b8a6': '#0d9488'
        },
        
        async loadAdminAvatar(adminId) {
            if (!STATE.db || !adminId) return null;
            if (STATE.adminAvatars.has(adminId)) return STATE.adminAvatars.get(adminId);
            
            try {
                const doc = await STATE.db.collection('admins').doc(adminId).get();
                if (!doc.exists) return null;
                
                const data = doc.data();
                const avatar = {
                    icon: data.avatarIcon || null,
                    color: data.avatarBgColor || '#10b981',
                    gradient: data.avatarBgGradient !== false,
                    initials: Utils.getInitials(data)
                };
                
                STATE.adminAvatars.set(adminId, avatar);
                return avatar;
            } catch {
                return null;
            }
        },
        
        getAvatarHTML(adminData) {
            const avatar = STATE.adminAvatars.get(adminData.adminId) || {};
            const initials = avatar.initials || Utils.getInitials(adminData);
            const color = avatar.color || '#10b981';
            const gradient = avatar.gradient !== false;
            
            const bg = gradient && this.COLORS[color]
                ? `linear-gradient(135deg, ${color}, ${this.COLORS[color]})`
                : color;
            
            const content = avatar.icon 
                ? `<i class="fas ${avatar.icon}"></i>` 
                : `<span>${initials}</span>`;
            
            return `<div class="admin-avatar-img${avatar.icon ? ' has-icon' : ''}" style="background: ${bg}">${content}</div>`;
        },
        
        setupListener() {
            if (!STATE.db) return;
            
            const unsubscribe = STATE.db.collection('admins').onSnapshot((snapshot) => {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === 'modified' || change.type === 'added') {
                        const adminId = change.doc.id;
                        const data = change.doc.data();
                        
                        STATE.adminAvatars.set(adminId, {
                            icon: data.avatarIcon || null,
                            color: data.avatarBgColor || '#10b981',
                            gradient: data.avatarBgGradient !== false,
                            initials: Utils.getInitials(data)
                        });
                        
                        this.updateAvatarsInUI(adminId);
                    }
                });
            });
            
            STATE.listeners.push(unsubscribe);
        },
        
        updateAvatarsInUI(adminId) {
            document.querySelectorAll(`[data-admin-id="${adminId}"] .admin-avatar-img`).forEach(el => {
                const avatar = STATE.adminAvatars.get(adminId);
                if (!avatar) return;
                
                const bg = avatar.gradient && this.COLORS[avatar.color]
                    ? `linear-gradient(135deg, ${avatar.color}, ${this.COLORS[avatar.color]})`
                    : avatar.color;
                
                if (/^(?:#[0-9a-f]{6}|linear-gradient\(135deg,\s*#[0-9a-f]{6},\s*#[0-9a-f]{6}\))$/i.test(bg || '')) el.style.background = bg;
                if (typeof avatar.icon === 'string' && /^fa-[a-z0-9-]+$/i.test(avatar.icon)) {
                    const icon = document.createElement('i');
                    icon.className = `fas ${avatar.icon}`;
                    el.replaceChildren(icon);
                    el.classList.add('has-icon');
                } else {
                    const initials = document.createElement('span');
                    initials.textContent = typeof avatar.initials === 'string' ? avatar.initials.slice(0, 4) : 'AD';
                    el.replaceChildren(initials);
                    el.classList.remove('has-icon');
                }
            });
        }
    };

    // ==========================================
    // DATA LOADER
    // ==========================================
    const DataLoader = {
        async loadAdmins() {
            if (!STATE.db) return;
            
            try {
                const snapshot = await STATE.db.collection('admins').get();
                STATE.allAdmins.clear();
                
                const avatarPromises = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    STATE.allAdmins.set(doc.id, {
                        id: doc.id,
                        username: data.username,
                        firstName: data.firstName || '',
                        lastName: data.lastName || '',
                        email: data.email,
                        role: data.role || 'regular'
                    });
                    avatarPromises.push(AvatarManager.loadAdminAvatar(doc.id));
                });
                
                await Promise.all(avatarPromises);
                console.log(`✅ Loaded ${STATE.allAdmins.size} admins`);
                this.populateAdminFilter();
            } catch (error) {
                console.error('Failed to load admins:', error);
            }
        },
        
        populateAdminFilter() {
            const select = DOM.get('filterAdmin');
            if (!select) return;
            
            const options = ['<option value="all">All Admins</option>'];
            Array.from(STATE.allAdmins.values())
                .sort((a, b) => (a.username || '').localeCompare(b.username || ''))
                .forEach(admin => {
                    options.push(`<option value="${admin.id}">${Utils.escape(admin.username)}</option>`);
                });
            
            select.innerHTML = options.join('');
        },
        
        async loadSystemLogs() {
            if (!STATE.db) return;
            
            const loading = DOM.get('sessionsLoading');
            const timeline = DOM.get('sessionsTimeline');
            const empty = DOM.get('sessionsEmpty');
            
            if (loading) loading.classList.remove('hidden');
            if (timeline) timeline.classList.add('hidden');
            if (empty) empty.classList.add('hidden');
            
            try {
                // Load from system_activity_logs (permanent archive)
                const snapshot = await STATE.db.collection('system_activity_logs')
                    .orderBy('timestamp', 'desc')
                    .limit(500)
                    .get();
                
                STATE.systemLogs = [];
                
                snapshot.forEach(doc => {
                    const data = doc.data();
                    STATE.systemLogs.push({
                        id: doc.id,
                        ...data,
                        timestamp: Utils.toMillis(data.timestamp)
                    });
                });
                
                console.log(`✅ Loaded ${STATE.systemLogs.length} archive logs`);
                
                // Build sessions
                await this.buildSessions();
                
            } catch (error) {
                console.error('Failed to load system logs:', error);
                Toast.show('Failed to load system logs', 'error');
            } finally {
                if (loading) loading.classList.add('hidden');
            }
        },
        
        async buildSessions() {
            STATE.sessions.clear();
            
            // Create sessions even without explicit login actions
            // Group activities by admin
            const activitiesByAdmin = new Map();
            
            STATE.systemLogs.forEach(log => {
                const adminId = log.adminId;
                if (!adminId) return;
                
                if (!activitiesByAdmin.has(adminId)) {
                    activitiesByAdmin.set(adminId, []);
                }
                activitiesByAdmin.get(adminId).push(log);
            });
            
            // Build sessions for each admin
            for (const [adminId, logs] of activitiesByAdmin) {
                const admin = STATE.allAdmins.get(adminId);
                if (!admin) continue;
                
                // Sort logs by timestamp
                logs.sort((a, b) => a.timestamp - b.timestamp);
                
                // Find login actions to create sessions
                const loginLogs = logs.filter(l => l.action === 'login');
                
                if (loginLogs.length === 0) {
                    // If no login found, create a single session from all activities
                    const firstLog = logs[0];
                    const sessionId = `${adminId}_${firstLog.timestamp}`;
                    
                    const sessionActivities = logs.map(l => ({
                        id: l.id,
                        action: l.action,
                        timestamp: l.timestamp,
                        details: l.details || {},
                        targetUser: l.targetUser || '',
                        description: this.formatActivityDescription(l)
                    }));
                    
                    const logoutLog = logs.find(l => l.action === 'logout');
                    const isOnline = STATE.onlineAdmins.has(adminId);
                    const loginTime = firstLog.timestamp;
                    const logoutTime = logoutLog ? logoutLog.timestamp : (isOnline ? null : logs[logs.length - 1].timestamp);
                    const duration = isOnline ? (Date.now() - loginTime) : (logoutTime ? logoutTime - loginTime : 0);
                    
                    STATE.sessions.set(sessionId, {
                        id: sessionId,
                        adminId: adminId,
                        adminUsername: admin.username,
                        adminFullName: [admin.firstName, admin.lastName].filter(Boolean).join(' ') || admin.username,
                        role: admin.role || 'regular',
                        loginTime: loginTime,
                        logoutTime: logoutTime,
                        duration: duration,
                        isOnline: isOnline,
                        deviceInfo: {
                            browser: firstLog.details?.browser || 'Unknown',
                            device: firstLog.details?.device || 'Unknown',
                            os: firstLog.details?.os || 'Unknown'
                        },
                        ipAddress: firstLog.details?.ipAddress || 'Unknown',
                        location: { country: 'Unknown', region: 'Unknown', city: 'Unknown', countryCode: '' },
                        activities: sessionActivities,
                        activityCount: sessionActivities.length
                    });
                } else {
                    // Create sessions from login actions
                    loginLogs.forEach((loginLog, index) => {
                        const sessionId = `${adminId}_${loginLog.timestamp}`;
                        const loginTime = loginLog.timestamp;
                        
                        // Find next login time
                        const nextLogin = loginLogs[index + 1];
                        const sessionEndTime = nextLogin ? nextLogin.timestamp : Date.now();
                        
                        // Get activities for this session
                        const sessionActivities = logs
                            .filter(l => l.timestamp >= loginTime && l.timestamp < sessionEndTime)
                            .map(l => ({
                                id: l.id,
                                action: l.action,
                                timestamp: l.timestamp,
                                details: l.details || {},
                                targetUser: l.targetUser || '',
                                description: this.formatActivityDescription(l)
                            }));
                        
                        // Find logout
                        const logoutLog = sessionActivities.find(a => a.action === 'logout');
                        const isOnline = STATE.onlineAdmins.has(adminId) && !nextLogin;
                        const logoutTime = logoutLog ? logoutLog.timestamp : (isOnline ? null : sessionEndTime);
                        const duration = isOnline ? (Date.now() - loginTime) : (logoutTime ? logoutTime - loginTime : 0);
                        
                        STATE.sessions.set(sessionId, {
                            id: sessionId,
                            adminId: adminId,
                            adminUsername: admin.username,
                            adminFullName: [admin.firstName, admin.lastName].filter(Boolean).join(' ') || admin.username,
                            role: admin.role || 'regular',
                            loginTime: loginTime,
                            logoutTime: logoutTime,
                            duration: duration,
                            isOnline: isOnline,
                            deviceInfo: {
                                browser: loginLog.details?.browser || 'Unknown',
                                device: loginLog.details?.device || 'Unknown',
                                os: loginLog.details?.os || 'Unknown'
                            },
                            ipAddress: loginLog.details?.ipAddress || 'Unknown',
                            location: { country: 'Unknown', region: 'Unknown', city: 'Unknown', countryCode: '' },
                            activities: sessionActivities,
                            activityCount: sessionActivities.length
                        });
                    });
                }
            }
            
            console.log(`✅ Built ${STATE.sessions.size} sessions`);
            
            await this.applyFilters();
            this.updateStats();
        },
        
        formatActivityDescription(activity) {
            const action = activity.action;
            const target = activity.targetUser ? Utils.escape(activity.targetUser) : '';
            const details = activity.details || {};
            const adminName = activity.adminFullName || activity.adminUsername || 'Administrator';
            
            switch (action) {
                case 'login':
                    return `<strong>${Utils.escape(adminName)}</strong> logged in`;
                
                case 'logout':
                    const duration = details.sessionDuration ? Utils.formatDuration(details.sessionDuration) : 'unknown';
                    return `<strong>${Utils.escape(adminName)}</strong> logged out. Session: ${duration}`;
                
                case 'create':
                    const userType = details.type === 'admin' ? 'administrator' : 'user';
                    return `<strong>${Utils.escape(adminName)}</strong> created ${userType}: <span class="target">${target}</span>`;
                
                case 'delete':
                    if (details.count > 1) {
                        return `<strong>${Utils.escape(adminName)}</strong> deleted <span class="highlight danger">${details.count} users</span>`;
                    }
                    return `<strong>${Utils.escape(adminName)}</strong> deleted user: <span class="target danger">${target}</span>`;
                
                case 'user_approved':
                    const approvedSensors = details.sensors && details.sensors.length > 0
                        ? ` with sensors: ${details.sensors.map(s => `<span class="sensor-tag">${s}</span>`).join('')}`
                        : '';
                    return `<strong>${Utils.escape(adminName)}</strong> <span class="action-approved">approved</span> ${target}${approvedSensors}`;
                
                case 'user_reactivated':
                    const reactivatedSensors = details.sensors && details.sensors.length > 0
                        ? ` with sensors: ${details.sensors.map(s => `<span class="sensor-tag">${s}</span>`).join('')}`
                        : '';
                    return `<strong>${Utils.escape(adminName)}</strong> <span class="action-reactivated">reactivated</span> ${target}${reactivatedSensors}`;
                
                case 'status_change':
                    const statusText = details.newStatus === 'active' ? 'activated' : 'deactivated';
                    return `<strong>${Utils.escape(adminName)}</strong> <span class="action-${statusText}">${statusText}</span> ${target}`;
                
                case 'sensor_assign':
                    const assignedSensors = details.sensors && details.sensors.length > 0
                        ? details.sensors.map(s => `<span class="sensor-tag">${s}</span>`).join('')
                        : 'none';
                    return `<strong>${Utils.escape(adminName)}</strong> assigned sensors to ${target}: ${assignedSensors}`;
                
                case 'sensor_modify':
                    const modifiedSensors = details.sensors && details.sensors.length > 0
                        ? details.sensors.map(s => `<span class="sensor-tag">${s}</span>`).join('')
                        : 'none';
                    return `<strong>${Utils.escape(adminName)}</strong> modified sensors for ${target}: ${modifiedSensors}`;
                
                case 'session_end':
                    const reason = details.reason ? ` Reason: "${Utils.escape(details.reason)}"` : '';
                    return `<strong>${Utils.escape(adminName)}</strong> ended session for ${target}${reason}`;
                
                case 'profile_update':
                    const changes = [];
                    if (details.changedFields && Array.isArray(details.changedFields)) {
                        details.changedFields.forEach(field => {
                            if (field === 'firstName' || field === 'lastName') {
                                if (!changes.includes('name')) changes.push('name');
                            } else {
                                changes.push(field);
                            }
                        });
                    }
                    const changeList = changes.length > 0 ? changes.join(', ') : 'profile';
                    return `<strong>${Utils.escape(adminName)}</strong> updated their <span class="highlight">${changeList}</span>`;
                
                case 'password_change':
                    return `<strong>${Utils.escape(adminName)}</strong> <span class="action-warning">changed their password</span>`;
                
                case 'avatar_change':
                    const avatarChanges = [];
                    if (details.iconChanged) avatarChanges.push(details.newIcon ? `icon` : 'removed icon');
                    if (details.colorChanged) avatarChanges.push(`color`);
                    if (details.gradientChanged !== undefined) avatarChanges.push(`gradient`);
                    const avatarText = avatarChanges.length > 0 ? avatarChanges.join(', ') : 'avatar';
                    return `<strong>${Utils.escape(adminName)}</strong> changed their ${avatarText}`;
                
                default:
                    return `<strong>${Utils.escape(adminName)}</strong> performed <span class="highlight">${action.replace(/_/g, ' ')}</span>${target ? ` on ${target}` : ''}`;
            }
        },
        
        async applyFilters() {
            const filters = STATE.filters;
            let sessions = Array.from(STATE.sessions.values());
            
            // Search
            if (filters.search) {
                const search = filters.search.toLowerCase();
                sessions = sessions.filter(s =>
                    s.adminUsername.toLowerCase().includes(search) ||
                    s.adminFullName.toLowerCase().includes(search) ||
                    s.ipAddress.includes(search)
                );
            }
            
            // Admin
            if (filters.admin !== 'all') {
                sessions = sessions.filter(s => s.adminId === filters.admin);
            }
            
            // Role
            if (filters.role !== 'all') {
                sessions = sessions.filter(s => s.role === filters.role);
            }
            
            // Action
            if (filters.action !== 'all') {
                sessions = sessions.filter(s =>
                    s.activities.some(a => a.action === filters.action)
                );
            }
            
            // Date range
            if (filters.dateRange !== 'all') {
                const now = Date.now();
                let cutoff;
                switch (filters.dateRange) {
                    case 'today': cutoff = new Date().setHours(0, 0, 0, 0); break;
                    case 'week': cutoff = now - (7 * 24 * 60 * 60 * 1000); break;
                    case 'month': cutoff = now - (30 * 24 * 60 * 60 * 1000); break;
                }
                if (cutoff) {
                    sessions = sessions.filter(s => s.loginTime >= cutoff);
                }
            }
            
            // Sort by login time descending
            sessions.sort((a, b) => b.loginTime - a.loginTime);
            
            STATE.filteredSessions = sessions;
            console.log(`📊 Filtered: ${STATE.filteredSessions.length} sessions`);
            
            this.resetPagination();
            await Renderer.render();
        },
        
        resetPagination() {
            STATE.currentBatch = 0;
            STATE.visibleSessions = [];
        },
        
        loadMoreSessions() {
            const start = STATE.currentBatch * STATE.batchSize;
            const end = start + STATE.batchSize;
            const batch = STATE.filteredSessions.slice(start, end);
            
            STATE.visibleSessions.push(...batch);
            STATE.currentBatch++;
            
            return batch;
        },
        
        updateStats() {
            STATE.stats.totalAdmins = STATE.allAdmins.size;
            STATE.stats.onlineNow = STATE.onlineAdmins.size;
            STATE.stats.totalSessions = STATE.sessions.size;
            STATE.stats.totalActions = STATE.systemLogs.length;
            
            const updates = [
                ['statTotalAdmins', STATE.stats.totalAdmins],
                ['statOnlineNow', STATE.stats.onlineNow],
                ['statTotalSessions', STATE.stats.totalSessions],
                ['statTotalActions', STATE.stats.totalActions]
            ];
            
            updates.forEach(([id, value]) => {
                const el = DOM.get(id);
                if (el) el.textContent = value;
            });
        },
        
        setupRealTimeListener() {
            if (!STATE.db) return;
            
            console.log('👂 Setting up real-time listener for system logs...');
            
            // Listen for new system logs
            const unsubscribe = STATE.db.collection('system_activity_logs')
                .orderBy('timestamp', 'desc')
                .limit(1)
                .onSnapshot((snapshot) => {
                    snapshot.docChanges().forEach((change) => {
                        if (change.type === 'added') {
                            const data = change.doc.data();
                            const newLog = {
                                id: change.doc.id,
                                ...data,
                                timestamp: Utils.toMillis(data.timestamp)
                            };
                            
                            // Check if already exists
                            const exists = STATE.systemLogs.some(l => l.id === newLog.id);
                            if (!exists) {
                                STATE.systemLogs.unshift(newLog);
                                console.log('🔔 New system log entry:', newLog.action);
                                
                                // Rebuild sessions
                                perf.debounce(() => this.buildSessions(), 500)();
                            }
                        }
                    });
                });
            
            STATE.listeners.push(unsubscribe);
        },
        
        setupPresenceListener() {
            if (!STATE.rtdb) return;
            
            console.log('👂 Setting up admin presence listener...');
            
            const presenceRef = STATE.rtdb.ref('admin_presence');
            
            STATE.presenceListener = presenceRef.on('value', (snapshot) => {
                const presence = snapshot.val() || {};
                const now = Date.now();
                const THRESHOLD = 60000; // 1 minute
                
                STATE.onlineAdmins.clear();
                
                for (const adminId in presence) {
                    if (adminId.startsWith('_')) continue;
                    
                    const data = presence[adminId];
                    if (!data) continue;
                    
                    const lastSeen = data.lastSeen || 0;
                    const isOnline = data.online === true && (now - lastSeen < THRESHOLD);
                    
                    if (isOnline) {
                        STATE.onlineAdmins.add(adminId);
                    }
                }
                
                console.log(`👥 Online admins: ${STATE.onlineAdmins.size}`);
                
                // Update stats and UI
                this.updateStats();
                
                // Update session online status
                STATE.sessions.forEach(session => {
                    const wasOnline = session.isOnline;
                    session.isOnline = STATE.onlineAdmins.has(session.adminId);
                    
                    if (wasOnline !== session.isOnline) {
                        // Recalculate duration
                        if (session.isOnline) {
                            session.duration = Date.now() - session.loginTime;
                            session.logoutTime = null;
                        }
                    }
                });
                
                // Re-render if needed
                if (STATE.visibleSessions.length > 0) {
                    Renderer.render();
                }
            });
        }
    };

    // ==========================================
    // RENDERER
    // ==========================================
    const Renderer = {
        async render() {
            const timeline = DOM.get('sessionsTimeline');
            const loading = DOM.get('sessionsLoading');
            const empty = DOM.get('sessionsEmpty');
            const loadMoreContainer = DOM.get('loadMoreContainer');
            
            if (!timeline) return;
            
            if (STATE.filteredSessions.length === 0) {
                timeline.classList.add('hidden');
                if (loading) loading.classList.add('hidden');
                if (empty) empty.classList.remove('hidden');
                if (loadMoreContainer) loadMoreContainer.classList.add('hidden');
                return;
            }
            
            timeline.classList.remove('hidden');
            if (loading) loading.classList.add('hidden');
            if (empty) empty.classList.add('hidden');
            
            if (STATE.visibleSessions.length === 0) {
                DataLoader.loadMoreSessions();
            }
            
            const fragment = document.createDocumentFragment();
            
            for (const session of STATE.visibleSessions) {
                const card = await this.createSessionCard(session);
                fragment.appendChild(card);
            }
            
            timeline.innerHTML = '';
            timeline.appendChild(fragment);
            
            // Show/hide load more
            if (STATE.visibleSessions.length < STATE.filteredSessions.length) {
                if (loadMoreContainer) {
                    loadMoreContainer.classList.remove('hidden');
                    const remaining = STATE.filteredSessions.length - STATE.visibleSessions.length;
                    const countEl = DOM.get('loadMoreCount');
                    if (countEl) countEl.textContent = `(${remaining} remaining)`;
                }
            } else {
                if (loadMoreContainer) loadMoreContainer.classList.add('hidden');
            }
            
            this.attachSessionListeners();
        },
        
        async createSessionCard(session) {
            const card = document.createElement('div');
            card.className = `session-card ${session.isOnline ? 'online' : ''} animate-fadeInUp`;
            card.dataset.sessionId = session.id;
            card.dataset.adminId = session.adminId;
            
            const isExpanded = STATE.expandedSessions.has(session.id);
            if (isExpanded) card.classList.add('expanded');
            
            const avatarHTML = AvatarManager.getAvatarHTML(session);
            const roleBadgeIcon = session.role === 'executive' ? 'fa-crown' : 'fa-shield-alt';
            const deviceIcon = Utils.getDeviceIcon(session.deviceInfo.device);
            
            card.innerHTML = `
                <div class="session-header">
                    <div class="admin-avatar">
                        ${avatarHTML}
                        <div class="admin-role-badge ${session.role}">
                            <i class="fas ${roleBadgeIcon}"></i>
                        </div>
                        ${session.isOnline ? '<div class="online-indicator"></div>' : ''}
                    </div>
                    
                    <div class="session-info">
                        <div class="session-admin-row">
                            <span class="session-admin-name">${Utils.escape(session.adminFullName)}</span>
                            <span class="session-admin-role ${session.role}">
                                <i class="fas ${roleBadgeIcon}"></i>
                                ${session.role}
                            </span>
                            ${session.isOnline 
                                ? '<span class="session-status-badge online"><i class="fas fa-circle"></i> Online</span>' 
                                : '<span class="session-status-badge offline">Offline</span>'
                            }
                        </div>
                        <div class="session-meta">
                            <span class="session-meta-item">
                                <i class="fas fa-sign-in-alt"></i>
                                ${Utils.formatTime(session.loginTime)}
                            </span>
                            ${!session.isOnline && session.logoutTime ? `
                                <span class="session-meta-item">
                                    <i class="fas fa-sign-out-alt"></i>
                                    ${Utils.formatTime(session.logoutTime)}
                                </span>
                            ` : ''}
                            <span class="session-meta-item">
                                <i class="fas fa-clock"></i>
                                ${Utils.formatDuration(session.duration)}
                            </span>
                            <span class="session-meta-item">
                                <i class="fas ${deviceIcon}"></i>
                                ${Utils.escape(session.deviceInfo.browser)} / ${Utils.escape(session.deviceInfo.device)}
                            </span>
                            <span class="session-meta-item">
                                <i class="fas fa-network-wired"></i>
                                ${Utils.escape(session.ipAddress)}
                            </span>
                        </div>
                    </div>
                    
                    <div class="session-stats">
                        <div class="session-stat">
                            <span class="session-stat-value">${session.activityCount}</span>
                            <span class="session-stat-label">Actions</span>
                        </div>
                    </div>
                    
                    <button class="session-expand-btn" type="button">
                        <i class="fas fa-chevron-down"></i>
                    </button>
                </div>
                
                <div class="session-activities">
                    ${this.renderActivities(session)}
                </div>
            `;
            
            return card;
        },
        
        renderActivities(session) {
            if (session.activities.length === 0) {
                return `
                    <div class="activities-header">
                        <div class="activities-title">
                            <i class="fas fa-history"></i>
                            Activity Log
                            <span class="activities-count">0</span>
                        </div>
                    </div>
                    <div class="empty-state" style="padding: 40px 20px;">
                        <div class="empty-icon" style="width: 60px; height: 60px; font-size: 1.5rem;">
                            <i class="fas fa-inbox"></i>
                        </div>
                        <h3 class="empty-title" style="font-size: 1rem;">No Activities</h3>
                        <p class="empty-description">No actions recorded for this session</p>
                    </div>
                `;
            }
            
            const activitiesHTML = session.activities.map(activity => {
                const icon = Utils.getActionIcon(activity.action);
                
                return `
                    <div class="activity-item">
                        <div class="activity-icon ${activity.action}">
                            <i class="fas ${icon}"></i>
                        </div>
                        <div class="activity-content">
                            <div class="activity-description">${activity.description}</div>
                            <div class="activity-time">
                                <i class="fas fa-clock"></i>
                                ${Utils.formatTime(activity.timestamp)}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            
            return `
                <div class="activities-header">
                    <div class="activities-title">
                        <i class="fas fa-history"></i>
                        Activity Log
                        <span class="activities-count">${session.activities.length}</span>
                    </div>
                </div>
                <div class="activities-list">
                    ${activitiesHTML}
                </div>
            `;
        },
        
        attachSessionListeners() {
            document.querySelectorAll('.session-header').forEach(header => {
                header.addEventListener('click', (e) => {
                    if (e.target.closest('button')) return;
                    
                    const card = header.closest('.session-card');
                    const sessionId = card.dataset.sessionId;
                    
                    if (STATE.expandedSessions.has(sessionId)) {
                        STATE.expandedSessions.delete(sessionId);
                        card.classList.remove('expanded');
                    } else {
                        STATE.expandedSessions.add(sessionId);
                        card.classList.add('expanded');
                    }
                });
            });
            
            document.querySelectorAll('.session-expand-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const card = btn.closest('.session-card');
                    const sessionId = card.dataset.sessionId;
                    
                    if (STATE.expandedSessions.has(sessionId)) {
                        STATE.expandedSessions.delete(sessionId);
                        card.classList.remove('expanded');
                    } else {
                        STATE.expandedSessions.add(sessionId);
                        card.classList.add('expanded');
                    }
                });
            });
        }
    };

    // ==========================================
    // UI INTERACTIONS
    // ==========================================
    const UI = {
        setupEventListeners() {
            // Search
            const searchInput = DOM.get('searchInput');
            if (searchInput) {
                searchInput.addEventListener('input', perf.debounce((e) => {
                    STATE.filters.search = e.target.value.trim();
                    this.updateSearchClear();
                    DataLoader.applyFilters();
                }, 300));
            }
            
            // Search clear
            const searchClear = DOM.get('searchClear');
            if (searchClear) {
                searchClear.addEventListener('click', () => {
                    if (searchInput) searchInput.value = '';
                    STATE.filters.search = '';
                    this.updateSearchClear();
                    DataLoader.applyFilters();
                });
            }
            
            // Filters
            ['filterAdmin', 'filterRole', 'filterAction', 'filterDate'].forEach(filterId => {
                const select = DOM.get(filterId);
                if (select) {
                    select.addEventListener('change', (e) => {
                        const key = filterId.replace('filter', '').toLowerCase();
                        const mappedKey = key === 'date' ? 'dateRange' : key;
                        STATE.filters[mappedKey] = e.target.value;
                        DataLoader.applyFilters();
                    });
                }
            });
            
            // Reset filters
            const resetBtn = DOM.get('resetFilters');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => this.resetFilters());
            }
            
            // Empty reset
            const emptyResetBtn = DOM.get('emptyResetBtn');
            if (emptyResetBtn) {
                emptyResetBtn.addEventListener('click', () => this.resetFilters());
            }
            
            // Load more
            const loadMoreBtn = DOM.get('loadMoreBtn');
            if (loadMoreBtn) {
                loadMoreBtn.addEventListener('click', () => {
                    DataLoader.loadMoreSessions();
                    Renderer.render();
                });
            }
            
            // Refresh
            const refreshBtn = DOM.get('refreshBtn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => this.refresh());
            }
            
            // User menu
            const userMenu = DOM.get('userMenu');
            if (userMenu) {
                userMenu.addEventListener('click', (e) => {
                    e.stopPropagation();
                    userMenu.classList.toggle('active');
                });
                
                document.addEventListener('click', () => {
                    userMenu.classList.remove('active');
                });
            }
            
            // Logout
            const logoutBtn = DOM.get('logoutBtn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', () => this.logout());
            }
            
            // Theme toggle
            const themeToggle = DOM.get('themeToggle');
            if (themeToggle) {
                themeToggle.addEventListener('click', () => this.toggleTheme());
            }
            
            // Filter tag removal
            document.addEventListener('click', (e) => {
                const removeBtn = e.target.closest('.filter-tag-remove');
                if (removeBtn) {
                    const filterKey = removeBtn.dataset.filter;
                    this.removeFilter(filterKey);
                }
            });
        },
        
        updateSearchClear() {
            const searchClear = DOM.get('searchClear');
            const searchInput = DOM.get('searchInput');
            if (searchClear && searchInput) {
                searchClear.classList.toggle('hidden', !searchInput.value.trim());
            }
        },
        
        resetFilters() {
            STATE.filters = {
                search: '',
                admin: 'all',
                role: 'all',
                action: 'all',
                dateRange: 'week'
            };
            
            const searchInput = DOM.get('searchInput');
            if (searchInput) searchInput.value = '';
            this.updateSearchClear();
            
            ['filterAdmin', 'filterRole', 'filterAction'].forEach(id => {
                const el = DOM.get(id);
                if (el) el.value = 'all';
            });
            
            const filterDate = DOM.get('filterDate');
            if (filterDate) filterDate.value = 'week';
            
            DataLoader.applyFilters();
        },
        
        removeFilter(filterKey) {
            const defaults = { search: '', admin: 'all', role: 'all', action: 'all', dateRange: 'week' };
            STATE.filters[filterKey] = defaults[filterKey];
            
            const elementMap = {
                search: 'searchInput',
                admin: 'filterAdmin',
                role: 'filterRole',
                action: 'filterAction',
                dateRange: 'filterDate'
            };
            
            const el = DOM.get(elementMap[filterKey]);
            if (el) el.value = defaults[filterKey];
            
            if (filterKey === 'search') this.updateSearchClear();
            
            DataLoader.applyFilters();
        },
        
        async refresh() {
            const refreshBtn = DOM.get('refreshBtn');
            if (refreshBtn) {
                const icon = refreshBtn.querySelector('i');
                if (icon) icon.classList.add('fa-spin');
                refreshBtn.disabled = true;
            }
            
            try {
                await DataLoader.loadSystemLogs();
                Toast.show('Data refreshed successfully', 'success');
            } catch (error) {
                Toast.show('Failed to refresh data', 'error');
            } finally {
                if (refreshBtn) {
                    const icon = refreshBtn.querySelector('i');
                    if (icon) icon.classList.remove('fa-spin');
                    refreshBtn.disabled = false;
                }
            }
        },
        
        toggleTheme() {
            const isDark = document.body.classList.contains('dark');
            document.body.classList.toggle('dark', !isDark);
            document.body.classList.toggle('light', isDark);
            localStorage.setItem('theme', isDark ? 'light' : 'dark');
        },
        
        loadTheme() {
            const theme = localStorage.getItem('theme') || 'light';
            document.body.classList.remove('light', 'dark');
            document.body.classList.add(theme);
        },
        
        logout() {
            if (confirm('Are you sure you want to logout?')) {
                sessionStorage.removeItem('breathsafeAdmin');
                sessionStorage.removeItem('breathsafeAdminToken');
                localStorage.removeItem('breathsafe_avatar_v4');
                window.location.href = './Login-codes/breathsafe-admin-login.html';
            }
        }
    };

    // ==========================================
    // INITIALIZATION
    // ==========================================
    async function init() {
        if (STATE.initialized) return;
        
        console.log('🚀 Initializing System Log v4.1...');
        const startTime = perf.now();
        
        try {
            UI.loadTheme();
            
            const connected = await initFirebase();
            if (!connected) {
                throw new Error('Failed to connect to Firebase');
            }
            
            UI.setupEventListeners();
            
            await DataLoader.loadAdmins();
            AvatarManager.setupListener();
            await DataLoader.loadSystemLogs();
            
            // Setup real-time listeners
            DataLoader.setupRealTimeListener();
            DataLoader.setupPresenceListener();
            
            STATE.initialized = true;
            
            const initTime = perf.now() - startTime;
            console.log(`✅ System Log v4.1 Ready (${initTime.toFixed(0)}ms)`);
            
            // Hide loading
            const appLoading = DOM.get('appLoading');
            if (appLoading) {
                appLoading.classList.add('fade-out');
                setTimeout(() => appLoading.remove(), 300);
            }
            
        } catch (error) {
            console.error('❌ Initialization failed:', error);
            
            const appLoading = DOM.get('appLoading');
            if (appLoading) {
                appLoading.innerHTML = `
                    <div style="text-align: center; padding: 40px;">
                        <div style="font-size: 3rem; color: #ef4444; margin-bottom: 20px;">
                            <i class="fas fa-exclamation-triangle"></i>
                        </div>
                        <h2 style="color: var(--text); margin-bottom: 10px;">Initialization Failed</h2>
                        <p style="color: var(--muted); margin-bottom: 20px;">${error.message}</p>
                        <button onclick="location.reload()" class="btn btn-primary">
                            <i class="fas fa-redo"></i> Retry
                        </button>
                    </div>
                `;
            }
        }
    }

    // ==========================================
    // CLEANUP
    // ==========================================
    function cleanup() {
        console.log('🧹 Cleaning up...');
        
        STATE.listeners.forEach(unsubscribe => {
            try { unsubscribe(); } catch(e) {}
        });
        STATE.listeners = [];
        
        if (STATE.rtdb && STATE.presenceListener) {
            try {
                STATE.rtdb.ref('admin_presence').off('value', STATE.presenceListener);
            } catch(e) {}
        }
        
        DOM.clear();
        STATE.initialized = false;
    }

    // ==========================================
    // GLOBAL API
    // ==========================================
    window.SystemLog = {
        init,
        cleanup,
        refresh: () => UI.refresh(),
        getState: () => ({ ...STATE }),
        getSessions: () => Array.from(STATE.sessions.values()),
        getAdmins: () => Array.from(STATE.allAdmins.values()),
        getSystemLogs: () => [...STATE.systemLogs]
    };

    // ==========================================
    // AUTO-INIT
    // ==========================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        requestIdleCallback(() => init());
    }
    
    window.addEventListener('beforeunload', cleanup);
    
    console.log('✅ System Log v4.1 Module Loaded');

})();
