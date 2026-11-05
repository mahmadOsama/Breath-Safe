// ==========================================
// BREATHSAFE ACTIVITY TRACKER v5.0
// ULTRA PERFORMANCE
// ==========================================

const ActivityTracker = (() => {
    'use strict';

    const raf = window.requestAnimationFrame || (fn => setTimeout(fn, 16));
    const rIC = window.requestIdleCallback || (fn => setTimeout(fn, 1));
    const now = Date.now;

    const debounce = (fn, delay) => {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => fn.apply(this, args), delay);
        };
    };

    const throttle = (fn, ms) => {
        let last = 0;
        return function(...args) {
            const n = now();
            if (n - last >= ms) {
                last = n;
                fn.apply(this, args);
            }
        };
    };

    const _state = {
        initialized: false,
        initializing: false,
        currentView: 'activity',
        recentLogs: new Map(),
        logCooldown: 2000,
        renderScheduled: false,
        searchTerm: '',
        lastRenderTime: 0,
        minRenderInterval: 50,
        visibleCount: 50,
        domCache: new Map(),
        htmlCache: new Map(),
        listenersAttached: false
    };

    const getEl = (id) => {
        if (!_state.domCache.has(id)) {
            _state.domCache.set(id, document.getElementById(id));
        }
        return _state.domCache.get(id);
    };

    const clearDomCache = () => {
        _state.domCache.clear();
    };

    const ACTION_CONFIGS = Object.freeze({
        create: { icon: 'user-plus', color: 'success', label: 'User Created' },
        delete: { icon: 'trash-alt', color: 'danger', label: 'User Deleted' },
        status_change: { icon: 'toggle-on', color: 'warning', label: 'Status Changed' },
        user_approved: { icon: 'user-check', color: 'success', label: 'User Approved' },
        user_reactivated: { icon: 'redo', color: 'info', label: 'User Reactivated' },
        sensor_assign: { icon: 'microchip', color: 'primary', label: 'Sensors Assigned' },
        sensor_modify: { icon: 'cogs', color: 'info', label: 'Sensors Modified' },
        login: { icon: 'sign-in-alt', color: 'info', label: 'Login' },
        logout: { icon: 'sign-out-alt', color: 'secondary', label: 'Logout' },
        session_end: { icon: 'power-off', color: 'danger', label: 'Session Ended' }
    });

    const DEFAULT_CONFIG = Object.freeze({ icon: 'circle', color: 'secondary', label: 'Action' });

    const SENSOR_CONFIG = Object.freeze({
        'MQ6': { icon: 'fa-fire', desc: 'LPG/Propane', color: '#ef4444' },
        'MQ7': { icon: 'fa-smog', desc: 'CO Detection', color: '#f59e0b' },
        'DHT22': { icon: 'fa-thermometer-half', desc: 'Temp/Humidity', color: '#3b82f6' }
    });

    const _escapeEl = document.createElement('div');
    const escapeHtml = (str) => {
        if (!str) return '';
        _escapeEl.textContent = str;
        return _escapeEl.innerHTML;
    };

    const _timeCache = new Map();
    const formatTime = (timestamp) => {
        if (!timestamp) return 'Unknown';

        const ts = timestamp instanceof Date ? timestamp.getTime() :
            timestamp.toDate ? timestamp.toDate().getTime() :
            new Date(timestamp).getTime();

        const cacheKey = Math.floor(ts / 10000);
        const cached = _timeCache.get(cacheKey);
        if (cached && now() - cached.time < 10000) {
            return cached.value;
        }

        const diff = Math.floor((now() - ts) / 1000);
        let result;

        if (diff < 30) result = 'Just now';
        else if (diff < 60) result = `${diff}s ago`;
        else if (diff < 3600) result = `${Math.floor(diff / 60)}m ago`;
        else if (diff < 86400) result = `${Math.floor(diff / 3600)}h ago`;
        else {
            const date = new Date(ts);
            result = date.toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
        }

        if (_timeCache.size > 200) {
            const first = _timeCache.keys().next().value;
            _timeCache.delete(first);
        }

        _timeCache.set(cacheKey, { value: result, time: now() });
        return result;
    };

    const formatDuration = (ms) => {
        if (!ms || ms < 0) return 'Just now';
        const s = Math.floor(ms / 1000);
        if (s < 60) return `${s}s`;
        const m = Math.floor(s / 60);
        if (m < 60) return `${m}m`;
        const h = Math.floor(m / 60);
        return `${h}h ${m % 60}m`;
    };

    const getInitials = (user) => {
        if (!user) return 'U';
        if (user.firstName && user.lastName) {
            return (user.firstName[0] + user.lastName[0]).toUpperCase();
        }
        return (user.username || 'U').substring(0, 2).toUpperCase();
    };

    const getSensorIcon = (type) => SENSOR_CONFIG[type]?.icon || 'fa-microchip';

    const scheduleRender = () => {
        if (_state.renderScheduled) return;

        const elapsed = now() - _state.lastRenderTime;
        if (elapsed >= _state.minRenderInterval) {
            _state.renderScheduled = true;
            raf(() => {
                _state.renderScheduled = false;
                _state.lastRenderTime = now();
                renderCurrentView();
                updateAllCounters();
            });
        } else {
            _state.renderScheduled = true;
            setTimeout(() => {
                _state.renderScheduled = false;
                _state.lastRenderTime = now();
                renderCurrentView();
                updateAllCounters();
            }, _state.minRenderInterval - elapsed);
        }
    };

    const renderCurrentView = () => {
        switch (_state.currentView) {
            case 'activity':
                renderActivityList();
                break;
            case 'monitoring':
                renderMonitoringView();
                break;
            case 'sessions':
                renderSessionsView();
                break;
        }
    };

    const init = async () => {
        if (_state.initialized) {
            console.log('📊 ActivityTracker: Already initialized');
            return true;
        }

        if (_state.initializing) {
            return waitForInit();
        }

        _state.initializing = true;
        console.log('🚀 ActivityTracker v5.0: Starting...');
        const startTime = now();

        try {
            if (!SharedState.initialized) {
                await SharedState.init();
            }

            renderActivitySection();

            rIC(() => {
                setupEventListeners();
                setupSharedStateListeners();
            }, { timeout: 100 });

            _state.initialized = true;
            _state.initializing = false;

            console.log(`✅ ActivityTracker v5.0: Ready (${now() - startTime}ms)`);
            return true;

        } catch (error) {
            console.error('❌ ActivityTracker init failed:', error);
            _state.initializing = false;
            showEmpty('Failed to load activities: ' + error.message, 'fa-exclamation-triangle');
            return false;
        }
    };

    const waitForInit = () => {
        return new Promise((resolve) => {
            const check = setInterval(() => {
                if (_state.initialized) {
                    clearInterval(check);
                    resolve(true);
                }
            }, 50);

            setTimeout(() => {
                clearInterval(check);
                resolve(false);
            }, 10000);
        });
    };

    const setupSharedStateListeners = () => {
        if (_state.listenersAttached) return;
        _state.listenersAttached = true;

        const throttledRender = throttle(scheduleRender, 100);
        const throttledCounters = throttle(updateAllCounters, 200);

        SharedState.on('activities:changed', throttledRender);
        SharedState.on('activities:filtered', throttledRender);
        SharedState.on('users:changed', () => {
            if (_state.currentView === 'monitoring') {
                throttledRender();
            }
            throttledCounters();
        });
        SharedState.on('presence:changed', () => {
            if (_state.currentView === 'sessions') {
                throttledRender();
            }
            throttledCounters();
        });
        SharedState.on('user:updated', throttledRender);
        SharedState.on('user:removed', throttledRender);
    };

    const setupEventListeners = () => {
        const filterEl = getEl('activityFilter');
        if (filterEl) {
            filterEl.addEventListener('click', (e) => e.stopPropagation(), { passive: true, capture: true });
            filterEl.addEventListener('mousedown', (e) => e.stopPropagation(), { passive: true, capture: true });
            filterEl.addEventListener('change', () => {
                const filter = filterEl.value;
                SharedState.setActivityFilter(filter);
            }, { passive: true });
        }

        const exportBtn = getEl('exportActivityBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                rIC(() => exportActivities());
            });
        }

        const clearBtn = getEl('clearActivityBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openClearModal();
            });
        }

        setupClearModalListeners();
    };

    const setupClearModalListeners = () => {
        const modal = getEl('clearActivityModal');
        if (!modal) return;

        const cancelBtn = getEl('cancelClearActivity');
        const closeBtn = getEl('closeClearActivityModal');
        const confirmBtn = getEl('confirmClearActivity');

        if (cancelBtn) cancelBtn.onclick = closeClearModal;
        if (closeBtn) closeBtn.onclick = closeClearModal;

        if (confirmBtn) {
            confirmBtn.onclick = async (e) => {
                e.preventDefault();
                await handleConfirmClear(confirmBtn);
            };
        }

        modal.onclick = (e) => {
            if (e.target === modal) closeClearModal();
        };
    };

    const renderActivitySection = () => {
        const container = getEl('activityBody');
        if (!container) return;

        const cacheKey = 'activity-section-layout';
        let html = _state.htmlCache.get(cacheKey);

        if (!html) {
            html = `
            <div class="activity-monitoring-layout">
                <div class="live-stats-bar">
                    <div class="stat-item pulse">
                        <span class="stat-icon"><i class="fas fa-circle"></i></span>
                        <span class="stat-label">Online Now</span>
                        <span class="stat-value" id="liveOnlineCount">0</span>
                    </div>
                    <div class="stat-item warning">
                        <span class="stat-icon"><i class="fas fa-user-clock"></i></span>
                        <span class="stat-label">Pending</span>
                        <span class="stat-value" id="livePendingCount">0</span>
                    </div>
                    <div class="stat-item info">
                        <span class="stat-icon"><i class="fas fa-microchip"></i></span>
                        <span class="stat-label">Need Sensors</span>
                        <span class="stat-value" id="liveNeedSensorsCount">0</span>
                    </div>
                    <div class="stat-item success">
                        <span class="stat-icon"><i class="fas fa-check-circle"></i></span>
                        <span class="stat-label">Active Users</span>
                        <span class="stat-value" id="liveActiveCount">0</span>
                    </div>
                </div>

                <div class="activity-view-tabs">
                    <button class="view-tab active" data-view="activity">
                        <i class="fas fa-history"></i>
                        <span>Activity Log</span>
                        <span class="tab-count" id="activityTabCount">0</span>
                    </button>
                    <button class="view-tab" data-view="monitoring">
                        <i class="fas fa-users-cog"></i>
                        <span>User Status</span>
                        <span class="tab-count" id="monitoringTabCount">0</span>
                    </button>
                    <button class="view-tab" data-view="sessions">
                        <i class="fas fa-broadcast-tower"></i>
                        <span>Live Sessions</span>
                        <span class="tab-count live" id="sessionsTabCount">0</span>
                    </button>
                </div>

                <div class="view-panel active" id="activityViewPanel">
                    <div class="activity-list" id="activityList">
                        <div class="activity-loading">
                            <div class="spinner"></div>
                            <p>Loading activities...</p>
                        </div>
                    </div>
                </div>
                
                <div class="view-panel" id="monitoringViewPanel">
                    <div class="monitoring-grid" id="monitoringGrid"></div>
                </div>
                
                <div class="view-panel" id="sessionsViewPanel">
                    <div class="sessions-header">
                        <div class="live-indicator-bar">
                            <span class="live-pulse"></span>
                            <span>Live Monitoring Active</span>
                        </div>
                        <div class="sessions-search">
                            <i class="fas fa-search"></i>
                            <input type="text" id="sessionSearchInput" placeholder="Search users...">
                        </div>
                    </div>
                    <div class="sessions-grid" id="sessionsGrid"></div>
                </div>
            </div>
            `;
            _state.htmlCache.set(cacheKey, html);
        }

        container.innerHTML = html;
        _state.domCache.clear();

        const tabContainer = container.querySelector('.activity-view-tabs');
        if (tabContainer) {
            tabContainer.onclick = (e) => {
                const tab = e.target.closest('.view-tab');
                if (tab) {
                    switchView(tab.dataset.view);
                }
            };
        }

        rIC(() => {
            const searchInput = getEl('sessionSearchInput');
            if (searchInput) {
                searchInput.addEventListener('input', debounce((e) => {
                    _state.searchTerm = e.target.value.toLowerCase().trim();
                    if (_state.currentView === 'sessions') {
                        renderSessionsView();
                    }
                }, 200), { passive: true });
            }
        });

        SharedState.setActivityFilter('all');
        updateAllCounters();
    };

    const switchView = (view) => {
        if (_state.currentView === view) return;

        _state.currentView = view;

        raf(() => {
            const tabs = document.querySelectorAll('.view-tab');
            for (let i = 0; i < tabs.length; i++) {
                tabs[i].classList.toggle('active', tabs[i].dataset.view === view);
            }

            const panels = document.querySelectorAll('.view-panel');
            for (let i = 0; i < panels.length; i++) {
                panels[i].classList.remove('active');
            }

            const activePanel = getEl(`${view}ViewPanel`);
            if (activePanel) activePanel.classList.add('active');

            renderCurrentView();
        });
    };

    // ==========================================
    // ACTIVITY VIEW (with filter to hide profile/password/avatar)
    // ==========================================
    const renderActivityList = () => {
        const container = getEl('activityList');
        if (!container) return;

        const all = SharedState.filteredActivities || [];

        // IMPORTANT: hide system-only actions from Recent Activity
        const activities = all.filter(a =>
            !['profile_update', 'password_change', 'avatar_change'].includes(a.action)
        );

        if (!activities || activities.length === 0) {
            container.innerHTML = `
                <div class="activity-empty">
                    <div class="activity-empty-icon"><i class="fas fa-inbox"></i></div>
                    <h4>No Activities</h4>
                    <p>No activities found for the selected filter</p>
                </div>
            `;
            return;
        }

        const visibleActivities = activities.slice(0, _state.visibleCount);
        const grouped = groupByTime(visibleActivities);

        const fragment = document.createDocumentFragment();

        for (const period in grouped) {
            const items = grouped[period];
            const groupDiv = document.createElement('div');
            groupDiv.className = 'activity-time-group';
            groupDiv.innerHTML = `
                <div class="activity-time-label">${period} <span class="count">${items.length}</span></div>
                <div class="activity-items">${items.map(createActivityItemHTML).join('')}</div>
            `;
            fragment.appendChild(groupDiv);
        }

        container.innerHTML = '';
        container.appendChild(fragment);

        if (activities.length > _state.visibleCount) {
            const loadMoreDiv = document.createElement('div');
            loadMoreDiv.className = 'load-more-container';
            loadMoreDiv.innerHTML = `
                <button class="btn-outline load-more-btn" onclick="ActivityTracker.loadMoreActivities()">
                    <i class="fas fa-chevron-down"></i>
                    Load More (${activities.length - _state.visibleCount} remaining)
                </button>
            `;
            container.appendChild(loadMoreDiv);
        }
    };

    const loadMoreActivities = () => {
        _state.visibleCount += 50;
        renderActivityList();
    };

    const groupByTime = (activities) => {
        const n = now();
        const today = new Date(n).setHours(0, 0, 0, 0);
        const yesterday = today - 86400000;
        const weekAgo = today - 604800000;

        const groups = { 'Today': [], 'Yesterday': [], 'This Week': [], 'Earlier': [] };

        for (let i = 0; i < activities.length; i++) {
            const a = activities[i];
            const ts = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();

            if (ts >= today) groups['Today'].push(a);
            else if (ts >= yesterday) groups['Yesterday'].push(a);
            else if (ts >= weekAgo) groups['This Week'].push(a);
            else groups['Earlier'].push(a);
        }

        const result = {};
        for (const key in groups) {
            if (groups[key].length > 0) result[key] = groups[key];
        }
        return result;
    };

    const createActivityItemHTML = (activity) => {
        const config = ACTION_CONFIGS[activity.action] || DEFAULT_CONFIG;
        const message = formatActivityMessage(activity);
        const time = formatTime(activity.timestamp);

        return `<div class="activity-item" data-id="${activity.id}" data-action="${activity.action}">
            <div class="activity-icon ${config.color}"><i class="fas fa-${config.icon}"></i></div>
            <div class="activity-content">
                <div class="activity-message">${message}</div>
                <div class="activity-meta">
                    <span class="activity-time"><i class="fas fa-clock"></i> ${time}</span>
                    <span class="activity-type-badge ${config.color}">${config.label}</span>
                </div>
            </div>
        </div>`;
    };

    const formatActivityMessage = (activity) => {
        const actor = `<span class="actor">${escapeHtml(activity.adminFullName || activity.adminUsername || 'Admin')}</span>`;
        const target = activity.targetUser ? `<span class="target">${escapeHtml(activity.targetUser)}</span>` : '';
        const sensors = activity.details?.sensors;
        const sensorList = sensors && sensors.length > 0
            ? `<span class="sensor-list">${sensors.map(s => `<span class="sensor-tag ${s.toLowerCase()}">${s}</span>`).join('')}</span>`
            : '';

        switch (activity.action) {
            case 'create':
                return `${actor} created ${activity.details?.type === 'admin' ? 'administrator' : 'user'} ${target}`;
            case 'delete':
                if (activity.details?.count > 1) {
                    return `${actor} deleted <span class="target">${activity.details.count} users</span>`;
                }
                return `${actor} deleted user ${target}`;
            case 'status_change':
                const statusAction = activity.details?.newStatus === 'active'
                    ? '<span class="action-text activated">activated</span>'
                    : '<span class="action-text deactivated">deactivated</span>';
                return `${actor} ${statusAction} ${target}`;
            case 'user_approved':
                return `${actor} <span class="action-text approved">approved</span> ${target} ${sensorList}`;
            case 'user_reactivated':
                return `${actor} <span class="action-text reactivated">reactivated</span> ${target} ${sensorList}`;
            case 'sensor_assign':
                return `${actor} assigned sensors to ${target} ${sensorList}`;
            case 'sensor_modify':
                return `${actor} modified sensors for ${target} ${sensorList}`;
            case 'login':
                return `${actor} <span class="action-text login">logged in</span>`;
            case 'logout':
                return `${actor} <span class="action-text logout">logged out</span>`;
            case 'session_end':
                const reason = activity.details?.reason ? `: "${escapeHtml(activity.details.reason)}"` : '';
                return `${actor} <span class="action-text session-ended">ended session</span> for ${target}${reason}`;
            default:
                return `${actor} performed <span class="action-text">${activity.action.replace(/_/g, ' ')}</span> ${target ? 'on ' + target : ''}`;
        }
    };

    const renderMonitoringView = () => {
        const container = getEl('monitoringGrid');
        if (!container) return;

        const pendingSize = SharedState.pendingUsers.size;
        const needSensorsSize = SharedState.needsSensorUsers.size;
        const onlineSize = SharedState.onlineUsers.size;

        const fragment = document.createDocumentFragment();

        const pendingCard = document.createElement('div');
        pendingCard.className = 'monitoring-card pending-card';
        pendingCard.innerHTML = `
            <div class="monitoring-card-header">
                <div class="monitoring-card-icon warning"><i class="fas fa-user-clock"></i></div>
                <div class="monitoring-card-title">
                    <h4>Pending Approval</h4>
                    <span class="monitoring-count" id="monitoringPendingCount">${pendingSize}</span>
                </div>
            </div>
            <div class="monitoring-card-body">${renderPendingUsers()}</div>
        `;
        fragment.appendChild(pendingCard);

        const sensorsCard = document.createElement('div');
        sensorsCard.className = 'monitoring-card sensors-card';
        sensorsCard.innerHTML = `
            <div class="monitoring-card-header">
                <div class="monitoring-card-icon info"><i class="fas fa-microchip"></i></div>
                <div class="monitoring-card-title">
                    <h4>Need Sensors</h4>
                    <span class="monitoring-count" id="monitoringNeedSensorsCount">${needSensorsSize}</span>
                </div>
            </div>
            <div class="monitoring-card-body">${renderNeedSensorsUsers()}</div>
        `;
        fragment.appendChild(sensorsCard);

        const onlineCard = document.createElement('div');
        onlineCard.className = 'monitoring-card online-card';
        onlineCard.innerHTML = `
            <div class="monitoring-card-header">
                <div class="monitoring-card-icon success"><i class="fas fa-wifi"></i></div>
                <div class="monitoring-card-title">
                    <h4>Online Now</h4>
                    <span class="monitoring-count" id="monitoringOnlineCount">${onlineSize}</span>
                </div>
            </div>
            <div class="monitoring-card-body">${renderOnlineUsersMini()}</div>
        `;
        fragment.appendChild(onlineCard);

        container.innerHTML = '';
        container.appendChild(fragment);
    };

    const renderPendingUsers = () => {
        const users = Array.from(SharedState.pendingUsers.values()).slice(0, 5);

        if (users.length === 0) {
            return `<div class="empty-mini"><i class="fas fa-check-circle"></i><span>No pending approvals</span></div>`;
        }

        const parts = [];
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            const isInactive = (user.status || '').toLowerCase() === 'inactive';
            const initials = getInitials(user);

            parts.push(`
                <div class="mini-user-card ${isInactive ? 'inactive' : 'pending'}" data-user-id="${user.id}">
                    <div class="mini-avatar ${isInactive ? 'inactive' : 'pending'}">${initials}</div>
                    <div class="mini-info">
                        <span class="mini-name">${escapeHtml(user.username || 'Unknown')}</span>
                        <span class="mini-status">${isInactive ? 'Inactive' : 'Pending'}</span>
                    </div>
                    <div class="mini-actions">
                        ${isInactive ? `
                            <button class="mini-btn reactivate" onclick="UserMonitoring.reactivateUser('${user.id}')" title="Reactivate">
                                <i class="fas fa-redo"></i>
                            </button>
                        ` : `
                            <button class="mini-btn approve" onclick="UserMonitoring.approveUser('${user.id}')" title="Approve">
                                <i class="fas fa-check"></i>
                            </button>
                        `}
                        <button class="mini-btn delete" onclick="UserMonitoring.deleteUser('${user.id}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `);
        }

        if (SharedState.pendingUsers.size > 5) {
            parts.push(`<a href="#" class="view-all-link" onclick="showUserMonitoring(); return false;">View all ${SharedState.pendingUsers.size} users →</a>`);
        }

        return parts.join('');
    };

    const renderNeedSensorsUsers = () => {
        const users = Array.from(SharedState.needsSensorUsers.values()).slice(0, 5);

        if (users.length === 0) {
            return `<div class="empty-mini"><i class="fas fa-check-circle"></i><span>All users configured</span></div>`;
        }

        const parts = [];
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            const isOnline = SharedState.onlineUsers.has(user.id);
            const initials = getInitials(user);

            parts.push(`
                <div class="mini-user-card ${isOnline ? 'online' : ''}" data-user-id="${user.id}">
                    <div class="mini-avatar active">
                        ${initials}
                        ${isOnline ? '<span class="mini-online-dot"></span>' : ''}
                    </div>
                    <div class="mini-info">
                        <span class="mini-name">${escapeHtml(user.username || 'Unknown')}</span>
                        <span class="mini-status warning">No sensors</span>
                    </div>
                    <button class="mini-btn primary" onclick="UserMonitoring.showModifySensorsModal('${user.id}')" title="Assign Sensors">
                        <i class="fas fa-microchip"></i>
                    </button>
                </div>
            `);
        }

        if (SharedState.needsSensorUsers.size > 5) {
            parts.push(`<a href="#" class="view-all-link" onclick="showUserMonitoring(); return false;">View all ${SharedState.needsSensorUsers.size} users →</a>`);
        }

        return parts.join('');
    };

    const renderOnlineUsersMini = () => {
        const users = Array.from(SharedState.onlineUsers.values()).slice(0, 5);

        if (users.length === 0) {
            return `<div class="empty-mini"><i class="fas fa-user-clock"></i><span>No users online</span></div>`;
        }

        const parts = [];
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            const sensors = user.assignedSensorTypes || [];
            const initials = getInitials(user);

            parts.push(`
                <div class="mini-user-card online" data-user-id="${user.id}">
                    <div class="mini-avatar active">
                        ${initials}
                        <span class="mini-online-dot"></span>
                    </div>
                    <div class="mini-info">
                        <span class="mini-name">${escapeHtml(user.username || 'Unknown')}</span>
                        <span class="mini-status">${sensors.length > 0 ? sensors.join(', ') : 'No sensors'}</span>
                    </div>
                    <button class="mini-btn primary" onclick="UserMonitoring.showModifySensorsModal('${user.id}')" title="Manage">
                        <i class="fas fa-cog"></i>
                    </button>
                </div>
            `);
        }

        if (SharedState.onlineUsers.size > 5) {
            parts.push(`<a href="#" class="view-all-link" onclick="ActivityTracker.switchView('sessions'); return false;">View all ${SharedState.onlineUsers.size} online →</a>`);
        }

        return parts.join('');
    };

    const renderSessionsView = () => {
        const container = getEl('sessionsGrid');
        if (!container) return;

        const search = _state.searchTerm;

        const onlineArray = Array.from(SharedState.onlineUsers.values());
        const filteredUsers = [];

        for (let i = 0; i < onlineArray.length; i++) {
            const u = onlineArray[i];
            if (!search ||
                (u.username || '').toLowerCase().includes(search) ||
                (u.email || '').toLowerCase().includes(search)) {
                filteredUsers.push(u);
            }
        }

        filteredUsers.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

        if (filteredUsers.length === 0) {
            container.innerHTML = `
                <div class="empty-sessions">
                    <div class="empty-sessions-icon"><i class="fas fa-user-clock"></i></div>
                    <h4>${search ? 'No Results' : 'No Active Sessions'}</h4>
                    <p>${search ? `No users match "${escapeHtml(search)}"` : 'Active users will appear here when they\'re online'}</p>
                    <div class="live-monitoring-status">
                        <span class="live-pulse"></span>
                        <span>Monitoring active...</span>
                    </div>
                </div>
            `;
            return;
        }

        const fragment = document.createDocumentFragment();
        const n = now();

        for (let i = 0; i < filteredUsers.length; i++) {
            const user = filteredUsers[i];
            const sensors = user.assignedSensorTypes || [];
            const sessionDuration = user.sessionStarted ? formatDuration(n - user.sessionStarted) : 'Just now';
            const initials = getInitials(user);

            const card = document.createElement('div');
            card.className = 'session-card-mini';
            card.dataset.userId = user.id;
            card.innerHTML = `
                <div class="session-card-header">
                    <div class="session-avatar">
                        ${initials}
                        <span class="online-indicator pulse"></span>
                    </div>
                    <div class="session-info">
                        <span class="session-name">
                            ${escapeHtml(user.username || 'Unknown')}
                            <span class="live-badge">LIVE</span>
                        </span>
                        <span class="session-email">${escapeHtml(user.email || 'N/A')}</span>
                    </div>
                </div>
                <div class="session-card-body">
                    <div class="session-meta">
                        <span class="meta-item"><i class="fas fa-clock"></i>${sessionDuration}</span>
                        <span class="meta-item"><i class="fas fa-sync"></i>${formatTime(user.lastSeen)}</span>
                    </div>
                    <div class="session-sensors">
                        ${sensors.length > 0
                            ? sensors.map(t => `<span class="sensor-pill ${t.toLowerCase()}"><i class="fas ${getSensorIcon(t)}"></i>${t}</span>`).join('')
                            : '<span class="sensor-pill empty">No sensors</span>'
                        }
                    </div>
                </div>
                <div class="session-card-actions">
                    <button class="session-action-btn" onclick="UserMonitoring.showModifySensorsModal('${user.id}')" title="Modify Sensors">
                        <i class="fas fa-cog"></i>
                    </button>
                    <button class="session-action-btn danger" onclick="UserMonitoring.endSession('${user.id}')" title="End Session">
                        <i class="fas fa-sign-out-alt"></i>
                    </button>
                </div>
            `;
            fragment.appendChild(card);
        }

        container.innerHTML = '';
        container.appendChild(fragment);
    };

    const _lastCounterValues = new Map();
    const updateAllCounters = () => {
        const onlineCount = SharedState.onlineUsers.size;
        const pendingCount = SharedState.pendingUsers.size;
        const needSensorsCount = SharedState.needsSensorUsers.size;
        const allUsersSize = SharedState.allUsers.size;
        const activeCount = allUsersSize - pendingCount;
        const activityCount = SharedState.filteredActivities.filter(a =>
            !['profile_update', 'password_change', 'avatar_change'].includes(a.action)
        ).length;

        const updates = [
            ['liveOnlineCount', onlineCount],
            ['livePendingCount', pendingCount],
            ['liveNeedSensorsCount', needSensorsCount],
            ['liveActiveCount', activeCount],
            ['activityTabCount', activityCount],
            ['monitoringTabCount', pendingCount + needSensorsCount],
            ['sessionsTabCount', onlineCount],
            ['activityCount', activityCount],
            ['quickTotalUsers', allUsersSize],
            ['activeUsersLive', onlineCount],
            ['pendingSetupCount', needSensorsCount],
            ['onlineNow', onlineCount],
            ['pendingApprovalNum', pendingCount],
            ['totalActiveUsers', activeCount],
            ['cardUserCount', allUsersSize],
            ['cardActiveUsers', activeCount],
            ['monitoringPendingCount', pendingCount],
            ['monitoringNeedSensorsCount', needSensorsCount],
            ['monitoringOnlineCount', onlineCount]
        ];

        raf(() => {
            for (let i = 0; i < updates.length; i++) {
                const [id, value] = updates[i];
                if (_lastCounterValues.get(id) === value) continue;
                _lastCounterValues.set(id, value);
                const el = getEl(id);
                if (el) {
                    el.textContent = value;
                    el.classList.add('counter-update');
                    setTimeout((el2) => el2.classList.remove('counter-update'), 300, el);
                }
            }
        });
    };

    const openClearModal = () => {
        const modal = getEl('clearActivityModal');
        if (!modal) return;

        const totalCount = SharedState.activities.length;
        const filteredCount = SharedState.filteredActivities
            .filter(a => !['profile_update', 'password_change', 'avatar_change'].includes(a.action))
            .length;

        if (totalCount === 0 || filteredCount === 0) {
            SharedState.notify('No activities to clear', 'warning');
            return;
        }

        const countEl = getEl('clearActivityCount');
        if (countEl) countEl.textContent = filteredCount;

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    const closeClearModal = () => {
        const modal = getEl('clearActivityModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    };

    const handleConfirmClear = async (btn) => {
        if (btn) {
            btn.disabled = true;
            btn.classList.add('loading');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
        }

        try {
            await deleteActivities();
            closeClearModal();
            SharedState.notify('Activities cleared!', 'success');

            if (btn) {
                btn.disabled = false;
                btn.classList.remove('loading');
                btn.innerHTML = '<i class="fas fa-trash-alt"></i> Yes, Clear All';
            }
        } catch (error) {
            console.error('Delete error:', error);
            SharedState.notify('Failed: ' + error.message, 'error');

            if (btn) {
                btn.disabled = false;
                btn.classList.remove('loading');
                btn.innerHTML = '<i class="fas fa-trash-alt"></i> Yes, Clear All';
            }
        }
    };

    const deleteActivities = async () => {
        const db = SharedState.db;
        if (!db) throw new Error('Database not connected');

        const currentFilter = SharedState.currentFilter;
        const all = SharedState.activities;
        const toDelete = (currentFilter === 'all'
            ? all
            : SharedState.filteredActivities
        ).filter(a => !['profile_update', 'password_change', 'avatar_change'].includes(a.action));

        if (!toDelete.length) throw new Error('No activities found');

        const BATCH_SIZE = 400;
        const chunks = [];
        for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
            chunks.push(toDelete.slice(i, i + BATCH_SIZE));
        }

        await Promise.all(chunks.map(async (chunk) => {
            const batch = db.batch();
            for (let i = 0; i < chunk.length; i++) {
                if (chunk[i].id) {
                    // IMPORTANT: delete only from activity_logs (Recent Activity), not system_activity_logs
                    batch.delete(db.collection('activity_logs').doc(chunk[i].id));
                }
            }
            await batch.commit();
        }));

        _state.visibleCount = 50;
    };

    const exportActivities = () => {
        const activitiesAll = SharedState.filteredActivities;

        // same filter as visible list
        const activities = activitiesAll.filter(a =>
            !['profile_update', 'password_change', 'avatar_change'].includes(a.action)
        );

        if (activities.length === 0) {
            SharedState.notify('No activities to export', 'warning');
            return;
        }

        rIC(() => {
            const headers = ['Date', 'Time', 'Action', 'Description', 'Admin', 'Target'];
            const rows = [headers.join(',')];

            for (let i = 0; i < activities.length; i++) {
                const a = activities[i];
                const d = new Date(a.timestamp);
                let desc = formatActivityMessage(a);
                desc = desc.replace(/<[^>]*>/g, '');

                rows.push([
                    d.toLocaleDateString(),
                    d.toLocaleTimeString(),
                    a.action,
                    desc,
                    a.adminFullName || a.adminUsername || 'Unknown',
                    a.targetUser || '-'
                ].map(c => `"${String(c).replace(/"/g, '""')}"`).join(','));
            }

            const csv = rows.join('\n');
            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `activity-log-${now()}.csv`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(link.href), 100);

            SharedState.notify(`${activities.length} activities exported`, 'success');
        }, { timeout: 500 });
    };

    const showEmpty = (message, icon) => {
        const container = getEl('activityList') || getEl('activityBody');
        if (container) {
            container.innerHTML = `
                <div class="activity-empty">
                    <div class="activity-empty-icon"><i class="fas ${icon}"></i></div>
                    <h4>No Activities</h4>
                    <p>${message}</p>
                </div>
            `;
        }
        updateAllCounters();
    };

    const destroy = () => {
        _state.initialized = false;
        _state.listenersAttached = false;
        _state.recentLogs.clear();
        _state.domCache.clear();
        _state.htmlCache.clear();
        _timeCache.clear();
        _lastCounterValues.clear();
    };

    return {
        init,
        destroy,
        switchView,
        scheduleRender,
        renderActivitySection,
        updateAllCounters,
        loadMoreActivities,
        get initialized() { return _state.initialized; },
        get currentView() { return _state.currentView; }
    };
})();

window.ActivityTracker = ActivityTracker;

console.log('✅ ActivityTracker v5.0 loaded (Ultra Performance Optimized)');