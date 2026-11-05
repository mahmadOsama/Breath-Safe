const UserMonitoring = (() => {
    'use strict';

    // ========== CONFIGURATION ==========
    const CONFIG = {
        HEARTBEAT_INTERVAL: 3000,
        ONLINE_THRESHOLD: 30000,
        SENSORS: ['MQ6', 'MQ7', 'DHT22']
    };

    // ========== STATE ==========
    const state = {
        initialized: false,
        initializing: false,
        heartbeatTimer: null,
        listeners: []
    };

    // ========== UTILITY FUNCTIONS ==========
    function escape(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function getInitials(user) {
        if (!user) return 'U';
        if (user.firstName && user.lastName) {
            return (user.firstName[0] + user.lastName[0]).toUpperCase();
        }
        return (user.username || 'U').substring(0, 2).toUpperCase();
    }

    function getSensorIcon(type) {
        const icons = { 'MQ6': 'fa-fire', 'MQ7': 'fa-smog', 'DHT22': 'fa-thermometer-half' };
        return icons[type] || 'fa-microchip';
    }

    function getSensorDesc(type) {
        const descs = { 'MQ6': 'LPG/Propane', 'MQ7': 'CO Detection', 'DHT22': 'Temp/Humidity' };
        return descs[type] || 'Sensor';
    }

    function formatTimeAgo(ts) {
        if (!ts) return 'Never';
        const diff = Math.floor((Date.now() - ts) / 1000);
        if (diff < 5) return 'Just now';
        if (diff < 60) return `${diff}s ago`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    }

    function formatDuration(ms) {
        if (!ms || ms < 0) return 'Just now';
        const s = Math.floor(ms / 1000);
        if (s < 60) return `${s}s`;
        const m = Math.floor(s / 60);
        if (m < 60) return `${m}m`;
        const h = Math.floor(m / 60);
        return `${h}h ${m % 60}m`;
    }

    function formatDate(timestamp) {
        if (!timestamp) return 'Unknown';
        try {
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } catch (e) {
            return 'Unknown';
        }
    }

    function debounce(fn, delay) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    // ========== TOAST HELPER ==========
    function showNotification(message, type = 'info') {
        if (SharedState?.notify) {
            SharedState.notify(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

   // ========== INITIALIZATION ==========
   async function init() {
        if (state.initialized) {
            console.log('📊 UserMonitoring: Already running');
            return true;
        }

        if (state.initializing) {
            return waitForInit();
        }

        state.initializing = true;
        console.log('🚀 UserMonitoring: Starting...');
        showLoadingState();

        try {
            // This is the only check you need. If SharedState isn't ready,
            // this will wait for it, which in turn waits for Firebase.
            if (!SharedState.initialized) {
                await SharedState.init();
            }

            // THIS LINE IS REMOVED as it's redundant and caused the error
            // await SharedState.waitForFirebase();

            await loadAllUsers();
            setupPresenceListener();
            setupUserChangesListener();
            startHeartbeat();
            render();

            state.initialized = true;
            state.initializing = false;

            console.log('✅ UserMonitoring: Live');
            return true;

        } catch (error) {
            console.error('❌ UserMonitoring init failed:', error);
            showErrorState(error.message);
            state.initializing = false;
            return false;
        }
    }

    function waitForInit() {
        return new Promise((resolve) => {
            const check = setInterval(() => {
                if (state.initialized) {
                    clearInterval(check);
                    resolve(true);
                }
            }, 100);
            setTimeout(() => { clearInterval(check); resolve(false); }, 10000);
        });
    }

    // ========== LOAD USERS ==========
    async function loadAllUsers() {
        const db = SharedState.db;
        if (!db) throw new Error('Database not connected');

        console.log('📥 Loading users...');

        const snapshot = await db.collection('users').get();

        // Clear only user-related categorization maps
        SharedState.pendingUsers.clear();
        SharedState.needsSensorUsers.clear();

        snapshot.forEach(doc => {
            const data = doc.data();
            SharedState.updateUser(doc.id, {
                ...data,
                isAdmin: false,
                assignedSensorTypes: data.assignedSensorTypes || []
            });
        });
    }

    // ========== PRESENCE LISTENER ==========
    function setupPresenceListener() {
        const rtdb = SharedState.rtdb;
        if (!rtdb) {
            console.warn('RTDB not available for presence');
            return;
        }

        const presenceRef = rtdb.ref('presence');

        presenceRef.on('value', (snapshot) => {
            const presence = snapshot.val() || {};
            const now = Date.now();

            SharedState.onlineUsers.clear();

            Object.entries(presence).forEach(([userId, data]) => {
                if (userId.startsWith('_') || !data || typeof data !== 'object') return;

                const user = SharedState.allUsers.get(userId);
                if (!user) return;

                const lastSeen = data.lastSeen || 0;
                const isOnline = data.online === true && (now - lastSeen < CONFIG.ONLINE_THRESHOLD);

                SharedState.setUserOnlineStatus(userId, isOnline, {
                    lastSeen,
                    sessionStarted: data.sessionStarted || lastSeen
                });
            });

            render();

        }, (error) => {
            console.error('Presence listener error:', error);
        });

        state.listeners.push(() => presenceRef.off('value'));
    }

    // ========== USER CHANGES LISTENER ==========
    function setupUserChangesListener() {
        const db = SharedState.db;
        if (!db) return;

        const unsubscribe = db.collection('users').onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                const data = change.doc.data();
                const userId = change.doc.id;

                if (change.type === 'removed') {
                    SharedState.removeUser(userId);
                } else {
                    SharedState.updateUser(userId, {
                        ...data,
                        assignedSensorTypes: data.assignedSensorTypes || []
                    });
                }
            });

            render();

        }, (error) => {
            console.error('User listener error:', error);
        });

        state.listeners.push(unsubscribe);
    }

    // ========== HEARTBEAT ==========
    function startHeartbeat() {
        if (state.heartbeatTimer) {
            clearInterval(state.heartbeatTimer);
        }

        state.heartbeatTimer = setInterval(() => {
            const now = Date.now();
            let changed = false;

            SharedState.onlineUsers.forEach((user, userId) => {
                if (now - (user.lastSeen || 0) > CONFIG.ONLINE_THRESHOLD) {
                    SharedState.setUserOnlineStatus(userId, false);
                    changed = true;
                }
            });

            if (changed) {
                render();
            }

            updateTimeDisplays();

        }, CONFIG.HEARTBEAT_INTERVAL);
    }

    function updateTimeDisplays() {
        document.querySelectorAll('[data-last-seen]').forEach(el => {
            const ts = parseInt(el.dataset.lastSeen);
            if (ts && !isNaN(ts)) {
                el.textContent = formatTimeAgo(ts);
            }
        });
    }

  // ========== RENDERING ==========
  function render() {
        renderPendingApproval();
        renderNeedsSensors();
        renderActiveSessions();

        if (window.CounterManager?.updateNow) {
            CounterManager.updateNow();
        }

        SharedState.emit('monitoring:rendered');
    }

    function renderPendingApproval() {
        const container = document.getElementById('pendingApprovalGrid');
        if (!container) return;

        const users = Array.from(SharedState.pendingUsers.values());
        const pendingOnly = users.filter(u => (u.status || 'pending').toLowerCase() === 'pending');
        const inactiveOnly = users.filter(u => (u.status || '').toLowerCase() === 'inactive');

        const badge = document.getElementById('pendingApprovalCount');
        if (badge) badge.textContent = `${users.length} pending`;

        if (users.length === 0) {
            container.innerHTML = `
                <div class="empty-state compact">
                    <div class="empty-state-icon"><i class="fas fa-check-circle"></i></div>
                    <div class="empty-state-title">No Pending Approvals</div>
                    <div class="empty-state-description">All users are active and configured</div>
                </div>
            `;
            return;
        }

        const allSorted = [...pendingOnly, ...inactiveOnly];

        container.innerHTML = allSorted.map(user => {
            const isInactive = (user.status || '').toLowerCase() === 'inactive';
            const hasSensors = user.assignedSensorTypes && user.assignedSensorTypes.length > 0;
            const sensorList = hasSensors ? user.assignedSensorTypes.join(', ') : 'None';

            return `
                <div class="user-card ${isInactive ? 'inactive-card' : 'pending-card'}" data-user-id="${user.id}">
                    <div class="user-card-header">
                        <div class="user-avatar ${isInactive ? 'inactive' : 'pending'}">
                            ${getInitials(user)}
                        </div>
                        <div class="user-info">
                            <div class="user-name">
                                ${escape(user.username || 'Unknown')}
                                ${isInactive ? '<span class="status-badge inactive-badge"><i class="fas fa-pause-circle"></i> Inactive</span>' : ''}
                            </div>
                            <div class="user-email">${escape(user.email || 'No email')}</div>
                            <div class="user-meta">
                                <span class="meta-item">
                                    <i class="fas fa-calendar"></i>
                                    ${isInactive ? 'Deactivated' : 'Registered'}: ${formatDate(user.createdAt)}
                                </span>
                                ${hasSensors ? `<span class="meta-item"><i class="fas fa-microchip"></i> Sensors: ${sensorList}</span>` : ''}
                            </div>
                        </div>
                        ${!isInactive ? '<div class="status-badge pending"><i class="fas fa-clock"></i> Pending</div>' : ''}
                    </div>
                    <div class="user-card-actions">
                        ${isInactive ? `
                            <button class="btn-reactivate" onclick="UserMonitoring.reactivateUser('${user.id}')">
                                <i class="fas fa-redo"></i> Reactivate User
                            </button>
                        ` : `
                            <button class="btn-approve" onclick="UserMonitoring.approveUser('${user.id}')">
                                <i class="fas fa-check"></i> Approve & Assign Sensors
                            </button>
                        `}
                        <button class="btn-reject" onclick="UserMonitoring.deleteUser('${user.id}')">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

 function renderNeedsSensors() {
        const container = document.getElementById('pendingSetupGrid');
        if (!container) return;

        const users = Array.from(SharedState.needsSensorUsers.values());
        const badge = document.getElementById('pendingCount');
        if (badge) badge.textContent = `${users.length} need sensors`;

        if (users.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fas fa-check-circle"></i></div>
                    <div class="empty-state-title">All Active Users Have Sensors</div>
                    <div class="empty-state-description">No active users waiting for sensor assignment</div>
                </div>
            `;
            return;
        }

        container.innerHTML = users.map(user => {
            const isOnline = SharedState.onlineUsers.has(user.id);
            return `
                <div class="setup-user-card ${isOnline ? 'user-online' : ''}" data-user-id="${user.id}">
                    <div class="setup-user-header">
                        <div class="setup-user-avatar ${isOnline ? 'online' : ''}">
                            ${getInitials(user)}
                            ${isOnline ? '<span class="mini-online-dot"></span>' : ''}
                        </div>
                        <div class="setup-user-info">
                            <div class="setup-user-name">
                                ${escape(user.username || 'Unknown')}
                                ${isOnline ? '<span class="live-badge">LIVE</span>' : ''}
                            </div>
                            <div class="setup-user-email">${escape(user.email || 'No email')}</div>
                            <div class="setup-user-status-row">
                                <span class="status-badge-small active"><i class="fas fa-circle"></i> Active</span>
                                <span class="no-sensors-badge"><i class="fas fa-exclamation-triangle"></i> No Sensors</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="sensor-assignment">
                        <label class="sensor-label"><i class="fas fa-microchip"></i> Assign Sensors</label>
                        <div class="sensor-checkboxes" id="cb-${user.id}">
                            ${CONFIG.SENSORS.map(type => `
                                <label class="sensor-checkbox-item ${type.toLowerCase()}">
                                    <input type="checkbox" value="${type}" data-user="${user.id}">
                                    <div class="checkbox-content">
                                        <i class="fas ${getSensorIcon(type)}"></i>
                                        <div><span>${type}</span><small>${getSensorDesc(type)}</small></div>
                                    </div>
                                </label>
                            `).join('')}
                        </div>
                        <button class="assign-btn" id="btn-${user.id}" disabled onclick="UserMonitoring.assignSensors('${user.id}')">
                            <i class="fas fa-check"></i> Assign Sensors
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        setupSensorCheckboxListeners(container);
    }

    function setupSensorCheckboxListeners(container) {
        container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const userId = e.target.dataset.user;
                const btn = document.getElementById(`btn-${userId}`);
                if (!btn) return;
                const checkboxes = container.querySelectorAll(`input[data-user="${userId}"]`);
                const checked = Array.from(checkboxes).filter(c => c.checked).length;
                btn.disabled = checked === 0;
            });
        });
    }

   function renderActiveSessions() {
        const container = document.getElementById('activeSessionsList');
        if (!container) return;

        const onlineUsers = Array.from(SharedState.onlineUsers.values())
            .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

        if (onlineUsers.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fas fa-user-clock"></i></div>
                    <div class="empty-state-title">No Active Sessions</div>
                    <div class="empty-state-description">Active users will appear here when they're online</div>
                    <div class="live-status"><span class="live-dot"></span><span>Monitoring live...</span></div>
                </div>
            `;
            return;
        }

        const searchInput = document.getElementById('searchSessions');
        const search = (searchInput?.value || '').toLowerCase().trim();

        const filtered = search
            ? onlineUsers.filter(u =>
                (u.username || '').toLowerCase().includes(search) ||
                (u.email || '').toLowerCase().includes(search)
            )
            : onlineUsers;

        if (filtered.length === 0 && search) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon"><i class="fas fa-search"></i></div>
                    <div class="empty-state-title">No Results</div>
                    <div class="empty-state-description">No online users match "${escape(search)}"</div>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(user => {
            const sensors = user.assignedSensorTypes || [];
            const sessionDuration = user.sessionStarted
                ? formatDuration(Date.now() - user.sessionStarted)
                : 'Just now';

            return `
                <div class="session-card online" data-user-id="${user.id}">
                    <div class="session-avatar">
                        ${getInitials(user)}
                        <div class="session-status online pulse"></div>
                    </div>
                    <div class="session-info">
                        <div class="session-user-name">
                            ${escape(user.username || 'Unknown')}
                            <span class="live-badge">LIVE</span>
                        </div>
                        <div class="session-details">
                            <span class="session-detail"><i class="fas fa-envelope"></i> ${escape(user.email || 'N/A')}</span>
                            <span class="session-detail"><i class="fas fa-clock"></i> Session: ${sessionDuration}</span>
                            <span class="session-detail" data-last-seen="${user.lastSeen || ''}">
                                <i class="fas fa-sync"></i> ${formatTimeAgo(user.lastSeen)}
                            </span>
                        </div>
                        <div class="session-sensors">
                            ${sensors.length > 0
                                ? sensors.map(t => `<span class="sensor-badge ${t.toLowerCase()}">${t}</span>`).join('')
                                : '<span class="sensor-badge empty">No sensors</span>'
                            }
                        </div>
                    </div>
                    <div class="session-actions">
                        <button class="modify-sensors-btn" onclick="UserMonitoring.showModifySensorsModal('${user.id}')" title="Modify Sensors">
                            <i class="fas fa-cog"></i>
                        </button>
                        <button class="end-session-btn" onclick="UserMonitoring.endSession('${user.id}')" title="End Session">
                            <i class="fas fa-sign-out-alt"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        if (searchInput && !searchInput.dataset.listenerAdded) {
            searchInput.addEventListener('input', debounce(() => {
                renderActiveSessions();
            }, 200));
            searchInput.dataset.listenerAdded = 'true';
        }
    }


function updateCounters() {
    // Use CounterManager for consistent counts
    if (window.CounterManager?.updateNow) {
        CounterManager.updateNow();
    }

    
    // Fallback if CounterManager not available
    const updates = {
        'onlineNow': SharedState.onlineUsers.size,
        'activeUsersLive': SharedState.onlineUsers.size,
        'pendingSetup': SharedState.needsSensorUsers.size,
        'pendingSetupCount': SharedState.needsSensorUsers.size,
        'pendingApprovalNum': SharedState.pendingUsers.size,
        'totalActiveUsers': SharedState.allUsers.size - SharedState.pendingUsers.size
    };

    Object.entries(updates).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el && el.textContent !== String(value)) {
            el.textContent = value;
        }
    });
}
    // ========== USER ACTIONS ==========

    async function approveUser(userId) {
        const user = SharedState.pendingUsers.get(userId);
        if (!user) {
            showNotification('User not found', 'error');
            return;
        }

        const status = (user.status || 'pending').toLowerCase();
        if (status === 'inactive') {
            showNotification('Use "Reactivate" for inactive users', 'info');
            return;
        }

        showApprovalModal(user);
    }

    async function reactivateUser(userId) {
        const user = SharedState.pendingUsers.get(userId) || SharedState.allUsers.get(userId);
        if (!user) {
            showNotification('User not found', 'error');
            return;
        }

        const hasSensors = user.assignedSensorTypes && user.assignedSensorTypes.length > 0;

        if (hasSensors) {
            showReactivateConfirmModal(user);
        } else {
            showReactivationModal(user);
        }
    }

    async function deleteUser(userId) {
        const user = SharedState.pendingUsers.get(userId) || SharedState.allUsers.get(userId);
        if (!user) {
            showNotification('User not found', 'error');
            return;
        }

        const confirmed = confirm(`Are you sure you want to delete "${user.username}"?\n\nThis action cannot be undone.`);
        if (!confirmed) return;

        try {
            const db = SharedState.db;
            const rtdb = SharedState.rtdb;

            await db.collection('users').doc(userId).delete();

            if (rtdb) {
                try {
                    await rtdb.ref(`presence/${userId}`).remove();
                    await rtdb.ref(`userSessions/${userId}`).remove();
                } catch (e) {
                    console.warn('RTDB cleanup failed:', e);
                }
            }

            // Log activity using SharedState
            await SharedState.logDelete('user', user.username, 1);

            showNotification(`${user.username} has been deleted`, 'success');

        } catch (error) {
            console.error('Delete error:', error);
            showNotification('Failed to delete user: ' + error.message, 'error');
        }
    }

    async function assignSensors(userId) {
        const container = document.getElementById(`cb-${userId}`);
        if (!container) {
            showNotification('Sensor container not found', 'error');
            return;
        }

        const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
        const selected = Array.from(checkboxes).map(cb => cb.value);

        if (selected.length === 0) {
            showNotification('Select at least one sensor', 'warning');
            return;
        }

        const user = SharedState.allUsers.get(userId);
        if (!user) {
            showNotification('User not found', 'error');
            return;
        }

        const btn = document.getElementById(`btn-${userId}`);
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Assigning...';
        }

        try {
            const db = SharedState.db;

            await db.collection('users').doc(userId).update({
                assignedSensorTypes: selected,
                welcomeCompleted: false,
                sensorConfiguredAt: firebase.firestore.FieldValue.serverTimestamp(),
                sensorConfiguredBy: SharedState.currentAdmin?.username || 'admin',
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Log activity using SharedState
            await SharedState.logSensorAssign(user.username, selected);

            showNotification(`Sensors assigned to ${user.username}: ${selected.join(', ')}`, 'success');

        } catch (error) {
            console.error('Assign error:', error);
            showNotification('Failed to assign sensors: ' + error.message, 'error');

            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-check"></i> Assign Sensors';
            }
        }
    }

    function endSession(userId) {
        const user = SharedState.onlineUsers.get(userId);
        if (!user) {
            showNotification('User is not currently online', 'warning');
            return;
        }

        showEndSessionModal(user);
    }

    // ========== MODALS ==========

    function showApprovalModal(user) {
        removeExistingModal('approvalModal');

        const modal = document.createElement('div');
        modal.id = 'approvalModal';
        modal.className = 'um-modal-overlay';
        modal.innerHTML = `
            <div class="um-modal-backdrop" onclick="UserMonitoring.closeModal('approvalModal')"></div>
            <div class="um-modal">
                <div class="um-modal-header">
                    <div class="um-modal-icon success"><i class="fas fa-user-check"></i></div>
                    <h3>Approve User Account</h3>
                    <button class="um-modal-close" onclick="UserMonitoring.closeModal('approvalModal')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="um-modal-body">
                    <div class="um-user-preview">
                        <div class="um-user-avatar">${getInitials(user)}</div>
                        <div class="um-user-details">
                            <div class="um-user-name">${escape(user.username)}</div>
                            <div class="um-user-email">${escape(user.email || 'No email')}</div>
                        </div>
                    </div>
                    
                    <div class="um-section">
                        <label class="um-section-label"><i class="fas fa-microchip"></i> Assign Sensors (Required)</label>
                        <div class="um-sensor-grid" id="approvalSensors-${user.id}">
                            ${CONFIG.SENSORS.map(type => `
                                <label class="um-sensor-option ${type.toLowerCase()}">
                                    <input type="checkbox" value="${type}">
                                    <div class="um-sensor-content">
                                        <i class="fas ${getSensorIcon(type)}"></i>
                                        <span class="um-sensor-name">${type}</span>
                                        <span class="um-sensor-desc">${getSensorDesc(type)}</span>
                                    </div>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div class="um-info-box">
                        <i class="fas fa-info-circle"></i>
                        <span>User will see welcome setup flow after approval</span>
                    </div>
                </div>
                <div class="um-modal-footer">
                    <button class="um-btn-secondary" onclick="UserMonitoring.closeModal('approvalModal')">Cancel</button>
                    <button class="um-btn-primary" id="confirmApprovalBtn" onclick="UserMonitoring.confirmApproval('${user.id}')" disabled>
                        <i class="fas fa-check"></i> Approve & Activate
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';

        setupModalSensorListeners(modal, `approvalSensors-${user.id}`, 'confirmApprovalBtn');
        requestAnimationFrame(() => modal.classList.add('active'));
    }

    function showReactivationModal(user) {
        removeExistingModal('reactivationModal');

        const modal = document.createElement('div');
        modal.id = 'reactivationModal';
        modal.className = 'um-modal-overlay';
        modal.innerHTML = `
            <div class="um-modal-backdrop" onclick="UserMonitoring.closeModal('reactivationModal')"></div>
            <div class="um-modal">
                <div class="um-modal-header">
                    <div class="um-modal-icon info"><i class="fas fa-redo"></i></div>
                    <h3>Reactivate User Account</h3>
                    <button class="um-modal-close" onclick="UserMonitoring.closeModal('reactivationModal')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="um-modal-body">
                    <div class="um-user-preview">
                        <div class="um-user-avatar">${getInitials(user)}</div>
                        <div class="um-user-details">
                            <div class="um-user-name">${escape(user.username)}</div>
                            <div class="um-user-email">${escape(user.email || 'No email')}</div>
                        </div>
                    </div>
                    
                    <div class="um-warning-box">
                        <i class="fas fa-exclamation-triangle"></i>
                        <div>
                            <strong>This user has no sensors assigned</strong>
                            <p>Please assign at least one sensor before reactivating.</p>
                        </div>
                    </div>
                    
                    <div class="um-section">
                        <label class="um-section-label"><i class="fas fa-microchip"></i> Assign Sensors (Required)</label>
                        <div class="um-sensor-grid" id="reactivationSensors-${user.id}">
                            ${CONFIG.SENSORS.map(type => `
                                <label class="um-sensor-option ${type.toLowerCase()}">
                                    <input type="checkbox" value="${type}">
                                    <div class="um-sensor-content">
                                        <i class="fas ${getSensorIcon(type)}"></i>
                                        <span class="um-sensor-name">${type}</span>
                                        <span class="um-sensor-desc">${getSensorDesc(type)}</span>
                                    </div>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div class="um-info-box">
                        <i class="fas fa-info-circle"></i>
                        <span>User will see welcome setup flow after reactivation</span>
                    </div>
                </div>
                <div class="um-modal-footer">
                    <button class="um-btn-secondary" onclick="UserMonitoring.closeModal('reactivationModal')">Cancel</button>
                    <button class="um-btn-primary" id="confirmReactivationBtn" onclick="UserMonitoring.confirmReactivation('${user.id}')" disabled>
                        <i class="fas fa-redo"></i> Reactivate User
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';

        setupModalSensorListeners(modal, `reactivationSensors-${user.id}`, 'confirmReactivationBtn');
        requestAnimationFrame(() => modal.classList.add('active'));
    }

    function showReactivateConfirmModal(user) {
        removeExistingModal('reactivateConfirmModal');

        const sensorList = user.assignedSensorTypes.join(', ');

        const modal = document.createElement('div');
        modal.id = 'reactivateConfirmModal';
        modal.className = 'um-modal-overlay';
        modal.innerHTML = `
            <div class="um-modal-backdrop" onclick="UserMonitoring.closeModal('reactivateConfirmModal')"></div>
            <div class="um-modal">
                <div class="um-modal-header">
                    <div class="um-modal-icon info"><i class="fas fa-redo"></i></div>
                    <h3>Reactivate User</h3>
                    <button class="um-modal-close" onclick="UserMonitoring.closeModal('reactivateConfirmModal')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="um-modal-body">
                    <div class="um-user-preview">
                        <div class="um-user-avatar">${getInitials(user)}</div>
                        <div class="um-user-details">
                            <div class="um-user-name">${escape(user.username)}</div>
                            <div class="um-user-email">${escape(user.email || 'No email')}</div>
                        </div>
                    </div>
                    
                    <div class="um-info-box">
                        <i class="fas fa-microchip"></i>
                        <span>This user has sensors: <strong>${sensorList}</strong></span>
                    </div>
                    
                    <div class="um-warning-box">
                        <i class="fas fa-info-circle"></i>
                        <div>
                            <strong>User will see the welcome screen</strong>
                            <p>Their sensor configuration will be preserved.</p>
                        </div>
                    </div>
                </div>
                <div class="um-modal-footer">
                    <button class="um-btn-secondary" onclick="UserMonitoring.closeModal('reactivateConfirmModal')">Cancel</button>
                    <button class="um-btn-primary" id="confirmReactivateBtn" onclick="UserMonitoring.confirmReactivateWithSensors('${user.id}')">
                        <i class="fas fa-redo"></i> Reactivate User
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => modal.classList.add('active'));
    }

    function showModifySensorsModal(userId) {
        const user = SharedState.allUsers.get(userId);
        if (!user) {
            showNotification('User not found', 'error');
            return;
        }

        removeExistingModal('modifySensorsModal');

        const currentSensors = user.assignedSensorTypes || [];
        const isOnline = SharedState.onlineUsers.has(userId);

        const modal = document.createElement('div');
        modal.id = 'modifySensorsModal';
        modal.className = 'um-modal-overlay';
        modal.innerHTML = `
            <div class="um-modal-backdrop" onclick="UserMonitoring.closeModal('modifySensorsModal')"></div>
            <div class="um-modal">
                <div class="um-modal-header">
                    <div class="um-modal-icon info"><i class="fas fa-microchip"></i></div>
                    <h3>Modify Sensors</h3>
                    <button class="um-modal-close" onclick="UserMonitoring.closeModal('modifySensorsModal')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="um-modal-body">
                    <div class="um-user-preview ${isOnline ? 'online' : ''}">
                        <div class="um-user-avatar">
                            ${getInitials(user)}
                            ${isOnline ? '<span class="um-online-indicator"></span>' : ''}
                        </div>
                        <div class="um-user-details">
                            <div class="um-user-name">${escape(user.username)}</div>
                            <div class="um-user-email">${escape(user.email || 'No email')}</div>
                            ${isOnline ? '<span class="um-online-badge"><span class="um-pulse-dot"></span> Online</span>' : ''}
                        </div>
                    </div>
                    
                    <div class="um-section">
                        <label class="um-section-label"><i class="fas fa-microchip"></i> Select Sensors</label>
                        <div class="um-sensor-grid" id="modifySensors-${user.id}">
                            ${CONFIG.SENSORS.map(type => `
                                <label class="um-sensor-option ${type.toLowerCase()}">
                                    <input type="checkbox" value="${type}" ${currentSensors.includes(type) ? 'checked' : ''}>
                                    <div class="um-sensor-content">
                                        <i class="fas ${getSensorIcon(type)}"></i>
                                        <span class="um-sensor-name">${type}</span>
                                        <span class="um-sensor-desc">${getSensorDesc(type)}</span>
                                    </div>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div class="um-warning-box">
                        <i class="fas fa-exclamation-triangle"></i>
                        <div>
                            <strong>Changing sensors will reset welcome flow</strong>
                        </div>
                    </div>
                </div>
                <div class="um-modal-footer">
                    <button class="um-btn-secondary" onclick="UserMonitoring.closeModal('modifySensorsModal')">Cancel</button>
                    <button class="um-btn-primary" id="confirmModifySensorsBtn" onclick="UserMonitoring.confirmModifySensors('${user.id}')">
                        <i class="fas fa-save"></i> Save Changes
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => modal.classList.add('active'));
    }
// ==========================================
// SESSION TERMINATION SYSTEM v1.0
// Works with Firebase RTDB v8 (compat)
// ==========================================

const SessionTerminationSystem = (() => {
    let initialized = false;
    let sessionListeners = new Map();
    
    function sanitizeUserId(userId) {
        if (!userId) return null;
        return String(userId)
            .replace(/\./g, '_')
            .replace(/#/g, '_')
            .replace(/\$/g, '_')
            .replace(/\[/g, '_')
            .replace(/\]/g, '_')
            .replace(/\//g, '_');
    }

    function initUserSessionListener(userId) {
        if (!firebase.database) {
            console.error('❌ Firebase Database not available');
            return;
        }

        const sanitizedId = sanitizeUserId(userId);
        const sessionPath = `userSessions/${sanitizedId}`;
        

        const sessionRef = firebase.database().ref(sessionPath);

        const listener = sessionRef.on(
            'value',
            (snapshot) => {
                const data = snapshot.val();
                
                if (data?.terminated === true) {
                    console.log('🚪 SESSION TERMINATED BY ADMIN');
                    console.log('Details:', {
                        reason: data.reason,
                        terminatedBy: data.terminatedBy,
                        sessionId: data.sessionId,
                        timestamp: new Date(data.timestamp).toLocaleString()
                    });
                    
                    handleTermination(data);
                }
            },
            (error) => {
                console.error('❌ Session listener error:', error.code, error.message);
                
                // Retry on permission denied
                if (error.code === 'PERMISSION_DENIED') {
                    console.error('🔐 PERMISSION DENIED on userSessions');
                    console.error('Firebase RTDB rules may be incorrect');
                    console.log('Check rules at: https://console.firebase.google.com/project/YOUR_PROJECT/database');
                }
            }
        );

        sessionListeners.set(userId, { ref: sessionRef, listener });
        console.log(`✅ Session listener registered for: ${userId}`);
    }

    function handleTermination(data) {
        // 1. Log termination
        console.log('📝 Logging termination event...');
        if (window.SharedState?.logActivity) {
            window.SharedState.logActivity('session_terminated', null, {
                reason: data.reason || 'Admin initiated',
                terminatedBy: data.terminatedBy,
                sessionId: data.sessionId,
                timestamp: data.timestamp
            }).catch(e => console.warn('⚠️ Logging failed:', e));
        }

        // 2. Show notification
        const message = `Your session was ended by ${data.terminatedBy || 'Administrator'}.`;
        if (window.SharedState?.notify) {
            window.SharedState.notify(message, 'danger');
        } else {
            alert(`⚠️ ${message}`);
        }

        // 3. Wait and redirect
        console.log('⏳ Redirecting to login in 3 seconds...');
        setTimeout(() => {
            sessionStorage.clear();
            localStorage.removeItem('theme');
            localStorage.removeItem('breathsafe_avatar_v4');
            
            // Redirect with reason
            window.location.href = './Login-codes/breathsafe-admin-login.html?reason=terminated&by=' + 
                encodeURIComponent(data.terminatedBy || 'Administrator');
        }, 3000);
    }

    function cleanup(userId) {
        if (!sessionListeners.has(userId)) return;
        
        const { ref } = sessionListeners.get(userId);
        ref.off();
        sessionListeners.delete(userId);
    }

    function init(userId) {
        if (!userId) {
            return false;
        }

        if (initialized) {
            console.log('⚠️ Already initialized');
            return true;
        }

        initUserSessionListener(userId);
        initialized = true;
        return true;
    }

    return {
        init,
        cleanup,
        get isInitialized() { return initialized; }
    };
})();

// ==========================================
// ADMIN: END SESSION FUNCTION
// ==========================================

async function endUserSession(userId, reason = 'Administrator action') {
    if (!firebase.database) {
        console.error('❌ Firebase Database not available');
        alert('Database connection failed');
        return false;
    }

    const sanitizedId = String(userId)
        .replace(/\./g, '_')
        .replace(/#/g, '_')
        .replace(/\$/g, '_')
        .replace(/\[/g, '_')
        .replace(/\]/g, '_')
        .replace(/\//g, '_');

    const sessionPath = `userSessions/${sanitizedId}`;
    const terminationData = {
        terminated: true,
        reason: reason,
        terminatedBy: window.AdminCore?.currentAdminUsername || 'Administrator',
        sessionId: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };


    try {
        await firebase.database().ref(sessionPath).set(terminationData);
        console.log('✅ Session termination sent');
        return true;
    } catch (error) {
        console.error('❌ Failed to send termination:', error.code);
        if (error.code === 'PERMISSION_DENIED') {
            console.error('🔐 Permission denied - check RTDB rules');
            console.error('Required rule: "userSessions": { "$uid": { ".write": true } }');
        }
        return false;
    }
}

window.endUserSession = endUserSession;
    function showEndSessionModal(user) {
        removeExistingModal('endSessionModal');

        const modal = document.createElement('div');
        modal.id = 'endSessionModal';
        modal.className = 'um-modal-overlay';
        modal.innerHTML = `
            <div class="um-modal-backdrop" onclick="UserMonitoring.closeModal('endSessionModal')"></div>
            <div class="um-modal">
                <div class="um-modal-header">
                    <div class="um-modal-icon danger"><i class="fas fa-sign-out-alt"></i></div>
                    <h3>End User Session</h3>
                    <button class="um-modal-close" onclick="UserMonitoring.closeModal('endSessionModal')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="um-modal-body">
                    <div class="um-user-preview online">
                        <div class="um-user-avatar">
                            ${getInitials(user)}
                            <span class="um-online-indicator"></span>
                        </div>
                        <div class="um-user-details">
                            <div class="um-user-name">${escape(user.username)}</div>
                            <div class="um-user-email">${escape(user.email || 'No email')}</div>
                            <span class="um-online-badge"><span class="um-pulse-dot"></span> Online</span>
                        </div>
                    </div>
                    
                    <div class="um-warning-box danger">
                        <i class="fas fa-exclamation-triangle"></i>
                        <div>
                            <strong>This will immediately log out the user</strong>
                        </div>
                    </div>
                    
                    <div class="um-input-group">
                        <label for="endSessionReason"><i class="fas fa-comment"></i> Reason (optional)</label>
                        <input type="text" id="endSessionReason" placeholder="e.g., Maintenance..." maxlength="150">
                    </div>
                </div>
                <div class="um-modal-footer">
                    <button class="um-btn-secondary" onclick="UserMonitoring.closeModal('endSessionModal')">Cancel</button>
                    <button class="um-btn-danger" id="confirmEndSessionBtn" onclick="UserMonitoring.confirmEndSession('${user.id}')">
                        <i class="fas fa-sign-out-alt"></i> End Session
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';

        requestAnimationFrame(() => {
            modal.classList.add('active');
            setTimeout(() => {
                document.getElementById('endSessionReason')?.focus();
            }, 300);
        });
    }

    // ========== CONFIRMATION HANDLERS ==========

    async function confirmApproval(userId) {
        const user = SharedState.pendingUsers.get(userId);
        if (!user) {
            closeModal('approvalModal');
            showNotification('User not found', 'error');
            return;
        }

        const sensorGrid = document.getElementById(`approvalSensors-${userId}`);
        if (!sensorGrid) {
            showNotification('Sensor selection not found', 'error');
            return;
        }

        const selected = getSelectedSensors(sensorGrid);

        if (selected.length === 0) {
            showNotification('Please select at least one sensor', 'warning');
            return;
        }

        const btn = document.getElementById('confirmApprovalBtn');
        setButtonLoading(btn, true, 'Approving...');

        try {
            const db = SharedState.db;

            await db.collection('users').doc(userId).update({
                status: 'active',
                activatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                activatedBy: SharedState.currentAdmin?.username || 'admin',
                assignedSensorTypes: selected,
                sensorConfiguredAt: firebase.firestore.FieldValue.serverTimestamp(),
                sensorConfiguredBy: SharedState.currentAdmin?.username || 'admin',
                welcomeCompleted: false,
                sensorLocation: null,
                userLocation: null,
                setupCompletedAt: null,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });

            closeModal('approvalModal');
            
            // Log activity using SharedState
            await SharedState.logUserApproved(user.username, selected);

            showNotification(`${user.username} approved with ${selected.length} sensor(s)`, 'success');

        } catch (error) {
            console.error('Approval error:', error);
            showNotification('Failed to approve user: ' + error.message, 'error');
            setButtonLoading(btn, false, '<i class="fas fa-check"></i> Approve & Activate');
        }
    }

    async function confirmReactivation(userId) {
        const user = SharedState.pendingUsers.get(userId) || SharedState.allUsers.get(userId);
        if (!user) {
            closeModal('reactivationModal');
            showNotification('User not found', 'error');
            return;
        }

        const sensorGrid = document.getElementById(`reactivationSensors-${userId}`);
        if (!sensorGrid) {
            showNotification('Sensor selection not found', 'error');
            return;
        }

        const selected = getSelectedSensors(sensorGrid);

        if (selected.length === 0) {
            showNotification('Please select at least one sensor', 'warning');
            return;
        }

        const btn = document.getElementById('confirmReactivationBtn');
        setButtonLoading(btn, true, 'Reactivating...');

        try {
            const db = SharedState.db;

            await db.collection('users').doc(userId).update({
                status: 'active',
                activatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                activatedBy: SharedState.currentAdmin?.username || 'admin',
                assignedSensorTypes: selected,
                sensorConfiguredAt: firebase.firestore.FieldValue.serverTimestamp(),
                sensorConfiguredBy: SharedState.currentAdmin?.username || 'admin',
                welcomeCompleted: false,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });

                 closeModal('reactivationModal');
            
            // Log activity using SharedState
            await SharedState.logUserReactivated(user.username, selected);

            showNotification(`${user.username} reactivated with ${selected.length} sensor(s)`, 'success');

        } catch (error) {
            console.error('Reactivation error:', error);
            showNotification('Failed to reactivate user: ' + error.message, 'error');
            setButtonLoading(btn, false, '<i class="fas fa-redo"></i> Reactivate User');
        }
    }

    async function confirmReactivateWithSensors(userId) {
        const user = SharedState.pendingUsers.get(userId) || SharedState.allUsers.get(userId);
        if (!user) {
            closeModal('reactivateConfirmModal');
            showNotification('User not found', 'error');
            return;
        }

        const btn = document.getElementById('confirmReactivateBtn');
        setButtonLoading(btn, true, 'Reactivating...');

        try {
            const db = SharedState.db;

            await db.collection('users').doc(userId).update({
                status: 'active',
                activatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                activatedBy: SharedState.currentAdmin?.username || 'admin',
                welcomeCompleted: false,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });

            closeModal('reactivateConfirmModal');
            
            // Log activity using SharedState
            await SharedState.logUserReactivated(user.username, user.assignedSensorTypes || []);

            showNotification(`${user.username} reactivated successfully`, 'success');

        } catch (error) {
            console.error('Reactivation error:', error);
            showNotification('Failed to reactivate user: ' + error.message, 'error');
            setButtonLoading(btn, false, '<i class="fas fa-redo"></i> Reactivate User');
        }
    }

    async function confirmModifySensors(userId) {
        const user = SharedState.allUsers.get(userId);
        if (!user) {
            closeModal('modifySensorsModal');
            showNotification('User not found', 'error');
            return;
        }

        const sensorGrid = document.getElementById(`modifySensors-${userId}`);
        if (!sensorGrid) {
            showNotification('Sensor selection not found', 'error');
            return;
        }

        const selected = getSelectedSensors(sensorGrid);
        const oldSensors = user.assignedSensorTypes || [];

        const btn = document.getElementById('confirmModifySensorsBtn');
        setButtonLoading(btn, true, 'Saving...');

        try {
            const db = SharedState.db;

            const updateData = {
                assignedSensorTypes: selected,
                sensorsModifiedAt: firebase.firestore.FieldValue.serverTimestamp(),
                sensorsModifiedBy: SharedState.currentAdmin?.username || 'admin',
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            };

            // Check if sensors actually changed
            const oldSorted = [...oldSensors].sort().join(',');
            const newSorted = [...selected].sort().join(',');

            if (oldSorted !== newSorted) {
                updateData.welcomeCompleted = false;
            }

            await db.collection('users').doc(userId).update(updateData);

            closeModal('modifySensorsModal');

            // Log activity using SharedState
            await SharedState.logSensorModify(user.username, oldSensors, selected);

            const message = selected.length > 0
                ? `Sensors updated for ${user.username}: ${selected.join(', ')}`
                : `All sensors removed from ${user.username}`;

            showNotification(message, 'success');

        } catch (error) {
            console.error('Modify sensors error:', error);
            showNotification('Failed to modify sensors: ' + error.message, 'error');
            setButtonLoading(btn, false, '<i class="fas fa-save"></i> Save Changes');
        }
    }

    async function confirmEndSession(userId) {
        const user = SharedState.onlineUsers.get(userId);
        if (!user) {
            closeModal('endSessionModal');
            showNotification('User is no longer online', 'info');
            return;
        }

        const reasonInput = document.getElementById('endSessionReason');
        const reason = (reasonInput?.value || '').trim() || 'Session ended by administrator.';

        const btn = document.getElementById('confirmEndSessionBtn');
        setButtonLoading(btn, true, 'Ending...');

        try {
            const rtdb = SharedState.rtdb;
            const sessionId = Date.now().toString() + '_' + Math.random().toString(36).substr(2, 9);

            await rtdb.ref(`userSessions/${userId}`).set({
                terminated: true,
                sessionId: sessionId,
                reason: reason,
                terminatedBy: SharedState.currentAdmin?.username || 'Administrator',
                terminatedByName: SharedState.getAdminFullName(),
                timestamp: firebase.database.ServerValue.TIMESTAMP
            });

            await rtdb.ref(`presence/${userId}`).update({
                online: false,
                lastSeen: firebase.database.ServerValue.TIMESTAMP,
                terminatedAt: firebase.database.ServerValue.TIMESTAMP
            });

            SharedState.setUserOnlineStatus(userId, false);

            closeModal('endSessionModal');
            render();

            // Log activity using SharedState
            await SharedState.logSessionEnd(user.username, reason);

            showNotification(`Session ended for ${user.username}`, 'success');

        } catch (error) {
            console.error('Unable to end the user session.');
            showNotification('Failed to end the user session. Please try again.', 'error');
            setButtonLoading(btn, false, '<i class="fas fa-sign-out-alt"></i> End Session');
        }
    }

    // ========== HELPER FUNCTIONS ==========

    function removeExistingModal(id) {
        const existing = document.getElementById(id);
        if (existing) existing.remove();
    }

    function getSelectedSensors(container) {
        const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }

    function setButtonLoading(btn, loading, text) {
        if (!btn) return;

        if (loading) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${text}`;
        } else {
            btn.disabled = false;
            btn.innerHTML = text;
        }
    }

    function setupModalSensorListeners(modal, gridId, btnId) {
        const sensorGrid = document.getElementById(gridId);
        const confirmBtn = document.getElementById(btnId);

        if (!sensorGrid || !confirmBtn) return;

        sensorGrid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                const checked = sensorGrid.querySelectorAll('input:checked').length;
                confirmBtn.disabled = checked === 0;
            });
        });
    }

    function closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => {
                modal.remove();
                if (!document.querySelector('.um-modal-overlay.active')) {
                    document.body.style.overflow = '';
                }
            }, 350);
        }
    }

    // ========== UI STATES ==========

    function showLoadingState() {
        const loadingHTML = `
            <div class="loading-state">
                <div class="spinner"></div>
                <span>Connecting to database...</span>
            </div>
        `;

        ['pendingApprovalGrid', 'pendingSetupGrid', 'activeSessionsList'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = loadingHTML;
        });
    }

    function showErrorState(message) {
        const errorHTML = `
            <div class="empty-state error-state">
                <div class="empty-state-icon"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="empty-state-title">Connection Error</div>
                <div class="empty-state-description">${escape(message)}</div>
                <button class="um-btn-primary" onclick="UserMonitoring.init()" style="margin-top:20px;">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>
        `;

        ['pendingApprovalGrid', 'pendingSetupGrid', 'activeSessionsList'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = errorHTML;
        });
    }
    // ========== REFRESH & CLEANUP ==========
    async function refreshAll() {
        console.log('🔄 UserMonitoring: Refreshing...');
        showLoadingState();

        try {
            await loadAllUsers();
            render();
            showNotification('Data refreshed', 'success');
        } catch (e) {
            console.error('Refresh error:', e);
            showErrorState(e.message);
            showNotification('Failed to refresh: ' + e.message, 'error');
        }
    }

    function destroy() {
        if (state.heartbeatTimer) {
            clearInterval(state.heartbeatTimer);
            state.heartbeatTimer = null;
        }

        state.listeners.forEach(unsub => {
            if (typeof unsub === 'function') {
                try { unsub(); } catch (e) {}
            }
        });
        state.listeners = [];

        if (SharedState.rtdb) {
            try { SharedState.rtdb.ref('presence').off(); } catch (e) {}
        }

        state.initialized = false;
    }

    // ========== PUBLIC API ==========
    return {
        init,
        destroy,
        refreshAll,
        approveUser,
        reactivateUser,
        deleteUser,
        assignSensors,
        endSession,
        showModifySensorsModal,
        closeModal,
        confirmApproval,
        confirmReactivation,
        confirmReactivateWithSensors,
        confirmModifySensors,
        confirmEndSession,
        get initialized() { return state.initialized; },
        get onlineCount() { return SharedState.onlineUsers.size; },
        get pendingCount() { return SharedState.pendingUsers.size; },
        get needsSensorsCount() { return SharedState.needsSensorUsers.size; }
    };
})();

window.UserMonitoring = UserMonitoring;

console.log('✅ UserMonitoring v5.2 loaded (uses SharedState logging)');
