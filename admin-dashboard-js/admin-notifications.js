// ==========================================
// BREATHSAFE ADMIN NOTIFICATIONS -
// High Performance Version with:
// - Lazy Loading
// - Debouncing & Throttling
// - Web Workers
// - Virtual Scrolling
// - Caching
// - Minimized DOM Operations
// ==========================================

const AdminNotifications = (() => {
    'use strict';

    // ==========================================
    // PRIVATE STATE
    // ==========================================
    const _state = {
        db: null,
        currentAdmin: null,
        appealsListener: null,
        appeals: [],
        unreadCount: 0,
        dropdownOpen: false,
        initialized: false,
        
        // Cache
        cache: new Map(),
        cacheExpiry: 5 * 60 * 1000,
        
        // Virtual scroll
        visibleRange: { start: 0, end: 20 },
        itemHeight: 180,
        
        // Worker
        worker: null,
        workerReady: false
    };

    // ==========================================
    // CONSTANTS
    // ==========================================
    const COLLECTIONS = Object.freeze({
        BLOCK_APPEALS: 'block_appeals',
        BLOCKED_DEVICES: 'blocked_devices',
        BLOCKED_IPS: 'blocked_ips',
        SECURITY_LOGS: 'security_logs',
        UNBLOCK_NOTIFICATIONS: 'unblock_notifications',
        ACTIVITY_LOGS: 'activity_logs'
    });

    const EMAILJS_CONFIG = Object.freeze({
        serviceId: 'YOUR_EMAILJS_SERVICE_ID',
        templateIdApprove: 'YOUR_EMAILJS_APPROVAL_TEMPLATE_ID',
        templateIdReject: 'YOUR_EMAILJS_REJECTION_TEMPLATE_ID',
        publicKey: 'YOUR_EMAILJS_PUBLIC_KEY'
    });

    const BATCH_SIZE = 500;
    const DEBOUNCE_DELAY = 300;
    const THROTTLE_DELAY = 100;

    // ==========================================
    // UTILITY FUNCTIONS
    // ==========================================
    const debounce = (fn, delay, leading = false) => {
        let timeoutId, lastCallTime = 0;
        return function(...args) {
            const now = Date.now();
            const shouldCallNow = leading && (now - lastCallTime > delay);
            clearTimeout(timeoutId);
            if (shouldCallNow) {
                lastCallTime = now;
                fn.apply(this, args);
            } else {
                timeoutId = setTimeout(() => {
                    lastCallTime = Date.now();
                    fn.apply(this, args);
                }, delay);
            }
        };
    };

    const throttle = (fn, delay) => {
        let lastCall = 0, timeoutId;
        return function(...args) {
            const now = Date.now();
            const remaining = delay - (now - lastCall);
            clearTimeout(timeoutId);
            if (remaining <= 0) {
                lastCall = now;
                fn.apply(this, args);
            } else {
                timeoutId = setTimeout(() => {
                    lastCall = Date.now();
                    fn.apply(this, args);
                }, remaining);
            }
        };
    };

    const raf = (fn) => typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(fn) : setTimeout(fn, 16);

    const escapeHtmlRegex = /[&<>"']/g;
    const escapeHtmlMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    const escapeHtml = (str) => str ? String(str).replace(escapeHtmlRegex, m => escapeHtmlMap[m]) : '';

    const timeFormatCache = new Map();
    const formatTime = (timestamp) => {
        if (!timestamp) return 'Unknown';
        const key = timestamp.seconds || timestamp;
        const cached = timeFormatCache.get(key);
        if (cached && Date.now() - cached.time < 60000) return cached.value;
        
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);
        
        let result;
        if (diffMins < 1) result = 'Just now';
        else if (diffMins < 60) result = `${diffMins}m ago`;
        else if (diffMins < 1440) result = `${Math.floor(diffMins / 60)}h ago`;
        else if (diffMins < 10080) result = `${Math.floor(diffMins / 1440)}d ago`;
        else result = date.toLocaleDateString();
        
        timeFormatCache.set(key, { value: result, time: Date.now() });
        if (timeFormatCache.size > 500) timeFormatCache.delete(timeFormatCache.keys().next().value);
        return result;
    };

    const formatDateTime = (timestamp) => {
        if (!timestamp) return 'Unknown';
        return (timestamp.toDate ? timestamp.toDate() : new Date(timestamp)).toLocaleString();
    };

    const getInitials = (name) => {
        if (!name) return 'U';
        const parts = name.trim().split(/\s+/);
        return parts.length >= 2 
            ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
            : name.substring(0, 2).toUpperCase();
    };

    // ==========================================
    // WEB WORKER
    // ==========================================
    const workerCode = `
        self.onmessage = function(e) {
            const { type, data, id } = e.data;
            let result;
            
            switch(type) {
                case 'filter':
                    result = filterAppeals(data.appeals, data.filters);
                    break;
                case 'search':
                    result = searchAppeals(data.appeals, data.term);
                    break;
                case 'generateCSV':
                    result = generateCSV(data.appeals);
                    break;
                default:
                    result = data;
            }
            self.postMessage({ type: type + 'Result', data: result, id });
        };
        
        function filterAppeals(appeals, filters) {
            let result = appeals;
            if (filters.status !== 'all') {
                result = result.filter(a => filters.status === 'pending' 
                    ? (!a.resolved && (a.status === 'pending' || !a.status))
                    : a.status === filters.status);
            }
            if (filters.type !== 'all') {
                result = result.filter(a => (a.blockType || 'device') === filters.type);
            }
            if (filters.search) {
                const term = filters.search.toLowerCase();
                result = result.filter(a => 
                    [a.fullName, a.email, a.username, a.referenceNumber, a.deviceId, a.ipAddress, a.description]
                    .filter(Boolean).join(' ').toLowerCase().includes(term)
                );
            }
            return result;
        }
        
        function searchAppeals(appeals, term) {
            if (!term) return appeals;
            const lowerTerm = term.toLowerCase();
            return appeals.filter(a => 
                [a.fullName, a.email, a.username, a.referenceNumber, a.deviceId, a.ipAddress, a.description]
                .filter(Boolean).join(' ').toLowerCase().includes(lowerTerm)
            );
        }
        
        function generateCSV(appeals) {
            const headers = ['Reference', 'Full Name', 'Email', 'Username', 'Device ID', 'IP Address', 'Status', 'Submitted', 'Resolved At', 'Admin Notes'];
            const rows = appeals.map(a => [
                a.referenceNumber || '',
                '"' + (a.fullName || '').replace(/"/g, '""') + '"',
                a.email || '',
                a.username || 'N/A',
                a.deviceId || 'N/A',
                a.ipAddress || 'N/A',
                a.status || 'pending',
                a.createdAt ? new Date(a.createdAt.seconds * 1000).toLocaleString() : 'N/A',
                a.resolvedAt ? new Date(a.resolvedAt.seconds * 1000).toLocaleString() : 'N/A',
                '"' + (a.adminNotes || 'N/A').replace(/"/g, '""') + '"'
            ]);
            return [headers.join(','), ...rows.map(r => r.join(','))].join('\\n');
        }
    `;

    const initWorker = () => {
        if (_state.worker) return;
        try {
            const blob = new Blob([workerCode], { type: 'application/javascript' });
            _state.worker = new Worker(URL.createObjectURL(blob));
            _state.workerReady = true;
            _state.worker.onerror = () => { _state.workerReady = false; };
        } catch (e) {
            _state.workerReady = false;
        }
    };

    const workerTask = (type, data) => new Promise(resolve => {
        if (!_state.workerReady) {
            resolve(mainThreadTask(type, data));
            return;
        }
        const id = Math.random().toString(36).substr(2, 9);
        const handler = (e) => {
            if (e.data.id === id) {
                _state.worker.removeEventListener('message', handler);
                resolve(e.data.data);
            }
        };
        _state.worker.addEventListener('message', handler);
        _state.worker.postMessage({ type, data, id });
        setTimeout(() => {
            _state.worker.removeEventListener('message', handler);
            resolve(mainThreadTask(type, data));
        }, 1000);
    });

    const mainThreadTask = (type, data) => {
        if (type === 'filter') return getFilteredAppealsSync(data.filters);
        return data;
    };

    // ==========================================
    // LAZY LOADING - EmailJS
    // ==========================================
    let emailJSLoaded = false, emailJSPromise = null;

    const loadEmailJS = () => {
        if (emailJSLoaded) return Promise.resolve();
        if (emailJSPromise) return emailJSPromise;
        
        emailJSPromise = new Promise((resolve, reject) => {
            if (typeof emailjs !== 'undefined') {
                try {
                    emailjs.init(EMAILJS_CONFIG.publicKey);
                    emailJSLoaded = true;
                    resolve();
                } catch (e) { reject(e); }
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js';
            script.async = true;
            script.onload = () => {
                try {
                    emailjs.init(EMAILJS_CONFIG.publicKey);
                    emailJSLoaded = true;
                    resolve();
                } catch (e) { reject(e); }
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
        return emailJSPromise;
    };

    // ==========================================
    // CACHING SYSTEM
    // ==========================================
    const cache = {
        get(key) {
            const item = _state.cache.get(key);
            if (!item) return null;
            if (Date.now() > item.expiry) { _state.cache.delete(key); return null; }
            return item.value;
        },
        set(key, value, ttl = _state.cacheExpiry) {
            _state.cache.set(key, { value, expiry: Date.now() + ttl });
            if (_state.cache.size > 100) _state.cache.delete(_state.cache.keys().next().value);
        },
        invalidate(pattern) {
            if (!pattern) { _state.cache.clear(); return; }
            for (const key of _state.cache.keys()) {
                if (key.includes(pattern)) _state.cache.delete(key);
            }
        }
    };

    // ==========================================
    // RENDER QUEUE
    // ==========================================
    const renderQueue = {
        queue: [],
        isProcessing: false,
        add(fn) {
            this.queue.push(fn);
            this.process();
        },
        process() {
            if (this.isProcessing || this.queue.length === 0) return;
            this.isProcessing = true;
            raf(() => {
                const batch = this.queue.splice(0, 10);
                batch.forEach(fn => fn());
                this.isProcessing = false;
                if (this.queue.length > 0) this.process();
            });
        }
    };

    // ==========================================
    // CORE INITIALIZATION
    // ==========================================
    const init = async () => {
        if (_state.initialized) return;
        console.log('🔔 Admin Notifications: Initializing...');
        
        _state.db = window.STATE?.db || null;
        _state.currentAdmin = window.STATE?.currentAdminData || null;

        if (!_state.db) {
            setTimeout(init, 500);
            return;
        }

        initWorker();
        startAppealsListener();
        renderNotificationBell();
        
        _state.initialized = true;
        console.log('✅ Admin Notifications: Ready');
    };

    const startAppealsListener = () => {
        if (!_state.db || _state.appealsListener) return;

        _state.appealsListener = _state.db.collection(COLLECTIONS.BLOCK_APPEALS)
            .orderBy('createdAt', 'desc')
            .limit(100)
            .onSnapshot(
                { includeMetadataChanges: false },
                throttle((snapshot) => {
                    const appeals = [];
                    let unread = 0;
                    snapshot.forEach(doc => {
                        const data = { id: doc.id, ...doc.data() };
                        delete data._searchText;
                        appeals.push(data);
                        if (!data.resolved && data.status === 'pending') unread++;
                    });
                    _state.appeals = appeals;
                    _state.unreadCount = unread;
                    cache.invalidate('filtered');
                    renderQueue.add(updateBadge);
                    renderQueue.add(renderNotificationList);
                }, THROTTLE_DELAY),
                (error) => console.error('Appeals listener error:', error)
            );
    };

    // ==========================================
    // NOTIFICATION BELL
    // ==========================================
    const renderNotificationBell = () => {
        const userMenu = document.getElementById('userMenu');
        if (!userMenu || document.getElementById('notificationBell')) return;

        const bellContainer = document.createElement('div');
        bellContainer.className = 'notification-bell-container';
        bellContainer.id = 'notificationBell';
        bellContainer.innerHTML = `
        <div class="notification-bell-container" id="notificationBell">
    <button class="notification-bell-btn" id="notificationBellBtn" title="Notifications">
        <i class="fas fa-bell"></i>
        <span class="notification-badge" id="notificationBadge" style="display:none;">0</span>
    </button>
    <div class="notification-dropdown" id="notificationDropdown">
                <div class="notification-dropdown-header">
                    <h4><i class="fas fa-bell"></i> Notifications</h4>
                    <button class="notification-mark-all" id="markAllReadBtn" title="Mark all as read">
                        <i class="fas fa-check-double"></i>
                    </button>
                </div>
                <div class="notification-dropdown-body" id="notificationList">
                    <div class="notification-empty">
                        <i class="fas fa-bell-slash"></i>
                        <p>No notifications</p>
                    </div>
                </div>
                <div class="notification-dropdown-footer">
                    <a href="#" id="viewAllAppealsBtn">View All Appeals</a>
                </div>
            </div>
        `;
        userMenu.parentNode.insertBefore(bellContainer, userMenu);
        attachNotificationListeners();
    };

    const attachNotificationListeners = () => {
        document.getElementById('notificationBellBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDropdown();
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.notification-bell-container')) closeDropdown();
        }, { passive: true });
        document.getElementById('markAllReadBtn')?.addEventListener('click', markAllAsRead);
        document.getElementById('viewAllAppealsBtn')?.addEventListener('click', (e) => {
            e.preventDefault();
            showAllAppealsModal();
        });
    };

// update with bell shake
// badge update function with class management
const updateBadge = () => {
    const badge = document.getElementById('notificationBadge');
    const bellBtn = document.getElementById('notificationBellBtn');
    
    if (!badge || !bellBtn) {
        console.warn('Badge or bell button not found');
        return;
    }
    
    const count = _state.unreadCount || 0;
    const previousCount = parseInt(badge.getAttribute('data-count')) || 0;
    
    // Store current count
    badge.setAttribute('data-count', count);
    
    if (count > 0) {
        // SHOW BADGE
        badge.style.display = 'flex';
        badge.style.visibility = 'visible';
        badge.style.opacity = '1';
        
        // FORMAT COUNT
        let displayCount = count;
        if (count > 99) {
            displayCount = '99+';
        }
        
        // UPDATE TEXT
        badge.textContent = displayCount;
        
        // REMOVE ALL SIZE CLASSES
        badge.classList.remove('two-digits', 'three-digits', 'urgent', 'new-notification');
        
        // ADD SIZE CLASSES
        if (count >= 100 || displayCount === '99+') {
            badge.classList.add('three-digits');
        } else if (count >= 10) {
            badge.classList.add('two-digits');
        }
        
        // ADD URGENT CLASS
        if (count >= 10) {
            badge.classList.add('urgent');
        }
        
        // ANIMATE IF NEW NOTIFICATION
        if (count > previousCount) {
            // Add new notification animation
            badge.classList.add('new-notification');
            setTimeout(() => {
                badge.classList.remove('new-notification');
            }, 800);
            
            // Shake bell button
            bellBtn.classList.add('has-new');
            setTimeout(() => {
                bellBtn.classList.remove('has-new');
            }, 800);
            
            console.log(`🔔 New notification! Total: ${count}`);
        }
        
        // UPDATE TOOLTIP
        bellBtn.setAttribute('title', `${count} new notification${count !== 1 ? 's' : ''}`);
        
    } else {
        // HIDE BADGE
        badge.style.display = 'none';
        badge.style.visibility = 'hidden';
        badge.style.opacity = '0';
        badge.textContent = '0';
        badge.classList.remove('two-digits', 'three-digits', 'urgent', 'new-notification');
        bellBtn.setAttribute('title', 'Notifications');
    }
    
    // Force repaint (sometimes needed for visibility issues)
    badge.offsetHeight;
};

    const renderNotificationList = () => {
        const container = document.getElementById('notificationList');
        if (!container) return;

        const pending = _state.appeals.filter(a => a.status === 'pending' && !a.resolved);

        if (pending.length === 0) {
            container.innerHTML = `<div class="notification-empty"><i class="fas fa-bell-slash"></i><p>No pending appeals</p></div>`;
            return;
        }

        const fragment = document.createDocumentFragment();
        pending.slice(0, 5).forEach(appeal => {
            const item = document.createElement('div');
            item.className = `notification-item ${appeal.viewed ? '' : 'unread'}`;
            item.dataset.appealId = appeal.id;
            item.innerHTML = `
                <div class="notification-item-icon"><i class="fas fa-flag"></i></div>
                <div class="notification-item-content">
                    <div class="notification-item-title">Block Appeal from ${escapeHtml(appeal.fullName)}</div>
                    <div class="notification-item-subtitle">${escapeHtml(appeal.email)}</div>
                    <div class="notification-item-time">${formatTime(appeal.createdAt)}</div>
                </div>
                <div class="notification-item-actions">
                    <button class="notification-action-btn approve" title="Review"><i class="fas fa-eye"></i></button>
                </div>
            `;
            item.querySelector('.notification-action-btn').addEventListener('click', () => showAppealDetail(appeal.id));
            fragment.appendChild(item);
        });
        container.innerHTML = '';
        container.appendChild(fragment);
    };

    const toggleDropdown = () => {
        const dropdown = document.getElementById('notificationDropdown');
        if (!dropdown) return;
        _state.dropdownOpen = !_state.dropdownOpen;
        dropdown.classList.toggle('active', _state.dropdownOpen);
    };

    const closeDropdown = () => {
        const dropdown = document.getElementById('notificationDropdown');
        if (dropdown) {
            dropdown.classList.remove('active');
            _state.dropdownOpen = false;
        }
    };

    // ==========================================
    // FILTER FUNCTIONS
    // ==========================================
    const getFilteredAppealsSync = (filters) => {
        const cacheKey = `filtered_${filters.status}_${filters.type}_${filters.search}`;
        const cached = cache.get(cacheKey);
        if (cached) return cached;
        
        let result = [..._state.appeals];
        
        if (filters.status !== 'all') {
            result = result.filter(a => filters.status === 'pending' 
                ? (!a.resolved && (a.status === 'pending' || !a.status))
                : a.status === filters.status);
        }
        if (filters.type !== 'all') {
            result = result.filter(a => (a.blockType || 'device') === filters.type);
        }
        if (filters.search) {
            const term = filters.search.toLowerCase();
            result = result.filter(a => 
                [a.fullName, a.email, a.username, a.referenceNumber, a.deviceId, a.ipAddress, a.description]
                .filter(Boolean).join(' ').toLowerCase().includes(term)
            );
        }
        
        cache.set(cacheKey, result, 30000);
        return result;
    };

    const getFilteredAppeals = async (filters) => {
        if (_state.workerReady && _state.appeals.length > 50) {
            return workerTask('filter', { appeals: _state.appeals, filters });
        }
        return getFilteredAppealsSync(filters);
    };

    const handleFilterChange = debounce(async () => {
        const container = document.getElementById('appealsGridContainer');
        if (!container) return;
        
        const statusFilter = document.getElementById('appealsStatusFilter')?.value || 'all';
        const typeFilter = document.getElementById('appealsTypeFilter')?.value || 'all';
        const searchTerm = document.getElementById('appealsSearchInput')?.value?.toLowerCase().trim() || '';
        
        const hasActiveFilters = statusFilter !== 'all' || typeFilter !== 'all' || searchTerm !== '';
        const clearBtn = document.getElementById('clearFiltersBtn');
        if (clearBtn) clearBtn.style.display = hasActiveFilters ? 'flex' : 'none';
        
        const filtered = await getFilteredAppeals({ status: statusFilter, type: typeFilter, search: searchTerm });
        
        renderQueue.add(() => {
            renderAppealsGrid(filtered);
            updateFilterStats(filtered);
        });
    }, DEBOUNCE_DELAY);

    // ==========================================
    // APPEAL CARD RENDERING
    // ==========================================
    const renderAppealCard = (appeal) => {
        const blockTypeIcon = appeal.blockType === 'ip' ? 'fa-network-wired' : 'fa-mobile-alt';
        const blockTypeLabel = appeal.blockType === 'ip' ? 'IP Address' : 'Device ID';
        const blockValue = appeal.blockType === 'ip' 
            ? (appeal.ipAddress || 'Unknown') 
            : (appeal.deviceId?.substring(0, 12) || 'Unknown');
        const status = appeal.status || 'pending';
        
        return `
            <div class="appeal-card ${status}" data-appeal-id="${appeal.id}">
                <div class="appeal-card-body">
                    <div class="appeal-card-header-row">
                        <div class="appeal-user-section">
                            <div class="user-avatar-appeal">${getInitials(appeal.fullName)}</div>
                            <div class="appeal-user-info">
                                <h4 class="user-name-appeal">${escapeHtml(appeal.fullName || 'Unknown')}</h4>
                                <p class="user-email-appeal">${escapeHtml(appeal.email || 'No email')}</p>
                                ${appeal.username ? `<p class="user-username-appeal"><i class="fas fa-user"></i> ${escapeHtml(appeal.username)}</p>` : ''}
                            </div>
                        </div>
                        <div class="appeal-actions-section">
                            <div class="appeal-status-compact ${status}">
                                ${status === 'approved' ? '<i class="fas fa-check-circle"></i> Approved' :
                                  status === 'rejected' ? '<i class="fas fa-times-circle"></i> Rejected' :
                                  '<i class="fas fa-clock"></i> Pending'}
                            </div>
                            ${appeal.resolved && appeal.resolvedBy ? `<div class="resolved-by-info"><i class="fas fa-user-shield"></i><span>by <strong>${escapeHtml(appeal.resolvedBy.username)}</strong></span></div>` : ''}
                            <div class="appeal-actions-buttons">
                                <button class="btn-appeal-view" data-action="view" data-id="${appeal.id}"><i class="fas fa-eye"></i><span>Details</span></button>
                                ${!appeal.resolved ? `
                                    <button class="btn-appeal-approve" data-action="approve" data-id="${appeal.id}"><i class="fas fa-check"></i><span>Approve</span></button>
                                    <button class="btn-appeal-reject" data-action="reject" data-id="${appeal.id}"><i class="fas fa-times"></i><span>Reject</span></button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="appeal-details-section">
                        <div class="appeal-reference-compact"><i class="fas fa-fingerprint"></i><span>Ref:</span><code>${appeal.referenceNumber}</code></div>
                        <div class="appeal-device-info">
                            <div class="device-icon"><i class="fas ${blockTypeIcon}"></i></div>
                            <div class="device-details">
                                <div class="device-type">${blockTypeLabel}</div>
                                <div class="device-value" title="${blockValue}">${blockValue}</div>
                            </div>
                        </div>
                        <div class="appeal-time-info">
                            <div class="time-item"><i class="fas fa-calendar-plus"></i><span class="time-label">Submitted:</span><span class="time-value">${formatTime(appeal.createdAt)}</span></div>
                            ${appeal.resolved ? `<div class="time-item"><i class="fas fa-calendar-check"></i><span class="time-label">Resolved:</span><span class="time-value">${formatTime(appeal.resolvedAt)}</span></div>` : ''}
                        </div>
                    </div>
                    <div class="appeal-description-compact">
                        <div class="description-label"><i class="fas fa-comment-dots"></i><span>Explanation</span></div>
                        <p class="description-text">${escapeHtml(appeal.description || 'No description')}</p>
                    </div>
                </div>
            </div>
        `;
    };

    const renderAppealsGrid = (appeals) => {
        const container = document.getElementById('appealsGridContainer');
        if (!container) return;

        if (appeals.length === 0) {
            container.innerHTML = `<div class="appeals-empty-state"><div class="empty-icon"><i class="fas fa-inbox"></i></div><h4>No Appeals Found</h4><p>No appeals match your filters</p></div>`;
            return;
        }

        // Virtual scrolling for large lists
        if (appeals.length > 50) {
            const visibleAppeals = appeals.slice(0, 20);
            container.innerHTML = visibleAppeals.map(renderAppealCard).join('');
            
            if (appeals.length > 20) {
                const sentinel = document.createElement('div');
                sentinel.className = 'scroll-sentinel';
                container.appendChild(sentinel);
                
                const observer = new IntersectionObserver((entries) => {
                    if (entries[0].isIntersecting) {
                        const currentCount = container.querySelectorAll('.appeal-card').length;
                        const nextBatch = appeals.slice(currentCount, currentCount + 10);
                        if (nextBatch.length > 0) {
                            const fragment = document.createDocumentFragment();
                            const temp = document.createElement('div');
                            temp.innerHTML = nextBatch.map(renderAppealCard).join('');
                            while (temp.firstChild) fragment.appendChild(temp.firstChild);
                            sentinel.before(fragment);
                        }
                        if (currentCount + 10 >= appeals.length) observer.disconnect();
                    }
                }, { rootMargin: '100px' });
                observer.observe(sentinel);
            }
        } else {
            container.innerHTML = appeals.map(renderAppealCard).join('');
        }

        attachCardListeners(container);
    };

    const attachCardListeners = (container) => {
        container.addEventListener('click', (e) => {
            const button = e.target.closest('[data-action]');
            if (!button) return;
            const { action, id } = button.dataset;
            if (action === 'view') showAppealDetail(id);
            else if (action === 'approve') quickApprove(id);
            else if (action === 'reject') quickReject(id);
        });
    };

    const updateFilterStats = (filtered) => {
        const resultsCount = document.getElementById('resultsCount');
        if (resultsCount) {
            const total = _state.appeals.length;
            const visible = filtered.length;
            resultsCount.innerHTML = visible === total 
                ? `Showing <strong>${total}</strong> appeals`
                : `Showing <strong>${visible}</strong> of <strong>${total}</strong> appeals`;
        }
        
        const pending = filtered.filter(a => !a.resolved && (a.status === 'pending' || !a.status)).length;
        const approved = filtered.filter(a => a.status === 'approved').length;
        const rejected = filtered.filter(a => a.status === 'rejected').length;
        
        ['statMiniPending', 'statMiniApproved', 'statMiniRejected'].forEach((id, i) => {
            const el = document.querySelector(`#${id} .stat-mini-value`);
            if (el) el.textContent = [pending, approved, rejected][i];
        });
    };

    // ==========================================
    // MODALS
    // ==========================================
    const showAllAppealsModal = () => {
        closeDropdown();
        
        const pending = _state.appeals.filter(a => a.status === 'pending' || !a.resolved).length;
        const approved = _state.appeals.filter(a => a.status === 'approved').length;
        const rejected = _state.appeals.filter(a => a.status === 'rejected').length;

        const modal = document.createElement('div');
        modal.id = 'allAppealsModal';
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal-dialog modal-appeals-manager">
                <div class="appeals-header">
                    <div class="appeals-header-left">
                        <div class="appeals-icon-wrapper"><i class="fas fa-flag"></i></div>
                        <div class="appeals-title-group">
                            <h3 class="appeals-main-title">Block Appeals Management</h3>
                            <p class="appeals-subtitle">Review and manage unblock requests</p>
                        </div>
                    </div>
                    <div class="appeals-header-right">
                        <div class="appeals-stats-mini">
                            <div class="stat-mini pending" id="statMiniPending"><span class="stat-mini-value">${pending}</span><span class="stat-mini-label">Pending</span></div>
                            <div class="stat-mini approved" id="statMiniApproved"><span class="stat-mini-value">${approved}</span><span class="stat-mini-label">Approved</span></div>
                            <div class="stat-mini rejected" id="statMiniRejected"><span class="stat-mini-value">${rejected}</span><span class="stat-mini-label">Rejected</span></div>
                        </div>
                        <button class="icon-btn appeals-close" id="closeAppealsModal"><i class="fas fa-times"></i></button>
                    </div>
                </div>
                <div class="appeals-control-bar">
                    <div class="appeals-search-wrapper">
                        <i class="fas fa-search"></i>
                        <input type="text" id="appealsSearchInput" class="appeals-search-input" placeholder="Search...">
                    </div>
                    <div class="appeals-filters">
                        <select id="appealsStatusFilter" class="appeals-filter-select">
                            <option value="all">All Status</option>
                            <option value="pending">⏳ Pending</option>
                            <option value="approved">✅ Approved</option>
                            <option value="rejected">❌ Rejected</option>
                        </select>
                        <select id="appealsTypeFilter" class="appeals-filter-select">
                            <option value="all">All Types</option>
                            <option value="device">📱 Device</option>
                            <option value="ip">🌐 IP</option>
                        </select>
                    </div>
                    <div class="appeals-actions">
                        <button class="btn-outline btn-sm" id="refreshAppealsBtn"><i class="fas fa-sync-alt"></i> Refresh</button>
                        <button class="btn-outline btn-sm" id="exportAppealsBtn"><i class="fas fa-download"></i> Export</button>
                        <button class="btn-danger btn-sm" id="bulkDeleteBtn"><i class="fas fa-trash-alt"></i> Bulk Delete</button>
                    </div>
                </div>
                <div class="appeals-results-bar">
                    <div class="results-info"><i class="fas fa-filter"></i><span id="resultsCount">Showing <strong>${_state.appeals.length}</strong> appeals</span></div>
                    <button class="btn-clear-filters" id="clearFiltersBtn" style="display:none"><i class="fas fa-times-circle"></i> Clear</button>
                </div>
                <div class="appeals-content-area"><div id="appealsGridContainer" class="appeals-grid-container"></div></div>
                <div class="appeals-footer">
                    <div class="appeals-footer-info"><i class="fas fa-info-circle"></i><span>Total: <strong>${_state.appeals.length}</strong></span></div>
                    <button class="btn-outline" id="closeAppealsFooter">Close</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Attach listeners
        modal.querySelector('.modal-backdrop').addEventListener('click', () => closeModal('allAppealsModal'));
        modal.querySelector('#closeAppealsModal').addEventListener('click', () => closeModal('allAppealsModal'));
        modal.querySelector('#closeAppealsFooter').addEventListener('click', () => closeModal('allAppealsModal'));
        modal.querySelector('#refreshAppealsBtn').addEventListener('click', refreshAppeals);
        modal.querySelector('#exportAppealsBtn').addEventListener('click', exportAppeals);
        modal.querySelector('#bulkDeleteBtn').addEventListener('click', showBulkDeleteModal);
        modal.querySelector('#clearFiltersBtn').addEventListener('click', clearFilters);
        modal.querySelector('#appealsSearchInput').addEventListener('input', handleFilterChange);
        modal.querySelector('#appealsStatusFilter').addEventListener('change', handleFilterChange);
        modal.querySelector('#appealsTypeFilter').addEventListener('change', handleFilterChange);
        
        renderAppealsGrid(_state.appeals);
    };

    const showAppealDetail = (appealId) => {
        const appeal = _state.appeals.find(a => a.id === appealId);
        if (!appeal) return;
        closeDropdown();

        const modal = document.createElement('div');
        modal.id = 'appealDetailModal';
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal-dialog modal-lg">
                <div class="modal-header">
                    <h3 class="modal-title"><i class="fas fa-flag"></i> Block Appeal Review</h3>
                    <button class="icon-btn" id="closeDetailModal"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div class="appeal-status-banner ${appeal.resolved ? 'resolved' : 'pending'}">
                        <i class="fas ${appeal.resolved ? 'fa-check-circle' : 'fa-clock'}"></i>
                        <span>${appeal.resolved ? `Resolved: ${appeal.resolution}` : 'Pending Review'}</span>
                    </div>
                    <div class="appeal-detail-grid">
                        <div class="appeal-section">
                            <h4><i class="fas fa-user"></i> User Information</h4>
                            <div class="appeal-info-row"><span class="label">Full Name:</span><span class="value">${escapeHtml(appeal.fullName)}</span></div>
                            <div class="appeal-info-row"><span class="label">Email:</span><span class="value">${escapeHtml(appeal.email)}</span></div>
                            <div class="appeal-info-row"><span class="label">Username:</span><span class="value">${escapeHtml(appeal.username || 'N/A')}</span></div>
                            <div class="appeal-info-row"><span class="label">Reference:</span><code>${appeal.referenceNumber}</code></div>
                        </div>
                        <div class="appeal-section">
                            <h4><i class="fas fa-fingerprint"></i> Device Information</h4>
                            <div class="appeal-info-row"><span class="label">Device ID:</span><code>${appeal.deviceId || 'Unknown'}</code></div>
                            <div class="appeal-info-row"><span class="label">Device Name:</span><span class="value">${escapeHtml(appeal.deviceName || 'Unknown')}</span></div>
                            <div class="appeal-info-row"><span class="label">IP Address:</span><code>${appeal.ipAddress || 'Unknown'}</code></div>
                            <div class="appeal-info-row"><span class="label">Block Type:</span><span class="value">${appeal.blockType?.toUpperCase() || 'DEVICE'}</span></div>
                        </div>
                        <div class="appeal-section full-width">
                            <h4><i class="fas fa-comment"></i> User's Explanation</h4>
                            <div class="appeal-description">${escapeHtml(appeal.description)}</div>
                        </div>
                        <div class="appeal-section full-width">
                            <h4><i class="fas fa-exclamation-triangle"></i> Block Reason</h4>
                            <div class="appeal-block-reason">${escapeHtml(appeal.blockReason || 'Multiple failed attempts')}</div>
                        </div>
                        ${!appeal.resolved ? `
                            <div class="appeal-section full-width">
                                <h4><i class="fas fa-reply"></i> Admin Response</h4>
                                <textarea id="adminResponseText" class="admin-response-textarea" placeholder="Enter response..." rows="4"></textarea>
                            </div>
                        ` : `
                            <div class="appeal-section full-width">
                                <h4><i class="fas fa-clipboard-check"></i> Resolution</h4>
                                <div class="appeal-info-row"><span class="label">By:</span><span class="value">${appeal.resolvedBy?.username || 'Unknown'}</span></div>
                                <div class="appeal-info-row"><span class="label">At:</span><span class="value">${formatDateTime(appeal.resolvedAt)}</span></div>
                                ${appeal.adminNotes ? `<div class="appeal-info-row"><span class="label">Notes:</span><span class="value">${escapeHtml(appeal.adminNotes)}</span></div>` : ''}
                            </div>
                        `}
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-outline" id="closeDetailFooter">Close</button>
                    ${!appeal.resolved ? `
                        <button class="btn-danger" id="rejectAppealBtn"><i class="fas fa-times"></i> Reject</button>
                        <button class="btn-primary" id="approveAppealBtn"><i class="fas fa-check"></i> Approve & Unblock</button>
                    ` : ''}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        modal.querySelector('.modal-backdrop').addEventListener('click', () => closeModal('appealDetailModal'));
        modal.querySelector('#closeDetailModal').addEventListener('click', () => closeModal('appealDetailModal'));
        modal.querySelector('#closeDetailFooter').addEventListener('click', () => closeModal('appealDetailModal'));
        
        if (!appeal.resolved) {
            modal.querySelector('#approveAppealBtn').addEventListener('click', () => approveAppeal(appealId));
            modal.querySelector('#rejectAppealBtn').addEventListener('click', () => rejectAppeal(appealId));
        }
        
        markAppealAsViewed(appealId);
    };

    const showBulkDeleteModal = () => {
        const counts = {
            all: _state.appeals.length,
            resolved: _state.appeals.filter(a => a.resolved).length,
            approved: _state.appeals.filter(a => a.status === 'approved').length,
            rejected: _state.appeals.filter(a => a.status === 'rejected').length
        };
        
        const modal = document.createElement('div');
        modal.id = 'bulkDeleteModal';
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal-dialog modal-md">
                <div class="modal-header">
                    <h3 class="modal-title danger-title"><i class="fas fa-trash-alt"></i> Bulk Delete</h3>
                    <button class="icon-btn" id="closeBulkDelete"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div class="bulk-delete-intro"><i class="fas fa-exclamation-triangle"></i><p>Select appeals to delete permanently.</p></div>
                    <div class="bulk-delete-options">
                        <label class="bulk-delete-option"><input type="radio" name="deleteOption" value="all" checked><span class="option-mark"></span><div class="option-content"><strong><i class="fas fa-trash"></i> All</strong><small>${counts.all} appeals</small></div></label>
                        <label class="bulk-delete-option"><input type="radio" name="deleteOption" value="resolved"><span class="option-mark"></span><div class="option-content"><strong><i class="fas fa-check-double"></i> Resolved</strong><small>${counts.resolved} appeals</small></div></label>
                        <label class="bulk-delete-option"><input type="radio" name="deleteOption" value="approved"><span class="option-mark"></span><div class="option-content"><strong><i class="fas fa-check-circle"></i> Approved</strong><small>${counts.approved} appeals</small></div></label>
                        <label class="bulk-delete-option"><input type="radio" name="deleteOption" value="rejected"><span class="option-mark"></span><div class="option-content"><strong><i class="fas fa-times-circle"></i> Rejected</strong><small>${counts.rejected} appeals</small></div></label>
                    </div>
                    <div class="bulk-delete-warning"><i class="fas fa-exclamation-triangle"></i><div><strong>Warning!</strong><p>This cannot be undone.</p></div></div>
                </div>
                <div class="modal-footer">
                    <button class="btn-outline" id="cancelBulkDelete">Cancel</button>
                    <button class="btn-danger" id="confirmBulkDelete"><i class="fas fa-trash-alt"></i> Delete</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        modal.querySelector('.modal-backdrop').addEventListener('click', () => closeModal('bulkDeleteModal'));
        modal.querySelector('#closeBulkDelete').addEventListener('click', () => closeModal('bulkDeleteModal'));
        modal.querySelector('#cancelBulkDelete').addEventListener('click', () => closeModal('bulkDeleteModal'));
        modal.querySelector('#confirmBulkDelete').addEventListener('click', confirmBulkDelete);
    };

    const closeModal = (modalId) => {
        const modal = document.getElementById(modalId);
        if (modal) modal.remove();
    };

    // ==========================================
    // APPEAL ACTIONS
    // ==========================================
    const approveAppeal = async (appealId) => {
        const appeal = _state.appeals.find(a => a.id === appealId);
        if (!appeal) return;

        const adminResponse = document.getElementById('adminResponseText')?.value || '';
        const approveBtn = document.getElementById('approveAppealBtn');
        
        if (approveBtn) {
            approveBtn.disabled = true;
            approveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        }

        try {
            const adminInfo = {
                id: _state.currentAdmin?.id || 'unknown',
                username: _state.currentAdmin?.username || 'Unknown Admin',
                role: _state.currentAdmin?.role || 'admin'
            };

            // Parallel operations
            await Promise.all([
                _state.db.collection(COLLECTIONS.BLOCK_APPEALS).doc(appealId).update({
                    status: 'approved',
                    resolved: true,
                    resolvedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    resolvedBy: adminInfo,
                    resolution: adminResponse || 'Approved - access restored',
                    adminNotes: adminResponse
                }),
                appeal.deviceId && appeal.blockType === 'device' ? unblockDevice(appeal.deviceId, 'Appeal approved') : Promise.resolve(),
                appeal.ipAddress && (appeal.blockType === 'ip' || !appeal.deviceId) ? unblockIP(appeal.ipAddress, 'Appeal approved') : Promise.resolve()
            ]);

            // Background tasks
            Promise.all([
                updateSecurityLogs(appeal, adminInfo, 'approved'),
                createUnblockNotification(appeal, adminInfo),
                logAppealAction('appeal_approved', appeal, adminInfo),
                loadEmailJS().then(() => sendApprovalEmail(appeal, adminResponse || 'Your appeal has been approved.'))
            ]).catch(console.warn);

            cache.invalidate('filtered');
            if (window.showToast) window.showToast(`Appeal approved! ${appeal.fullName}'s access restored.`, 'success');
            closeModal('appealDetailModal');

        } catch (error) {
            console.error('Approve failed:', error);
            if (approveBtn) {
                approveBtn.disabled = false;
                approveBtn.innerHTML = '<i class="fas fa-check"></i> Approve & Unblock';
            }
            if (window.showToast) window.showToast('Failed: ' + error.message, 'error');
        }
    };

    const rejectAppeal = async (appealId) => {
        const appeal = _state.appeals.find(a => a.id === appealId);
        if (!appeal) return;

        const adminResponse = document.getElementById('adminResponseText')?.value || '';
        const rejectBtn = document.getElementById('rejectAppealBtn');
        
        if (rejectBtn) {
            rejectBtn.disabled = true;
            rejectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Rejecting...';
        }

        try {
            const adminInfo = {
                id: _state.currentAdmin?.id || 'unknown',
                username: _state.currentAdmin?.username || 'Unknown Admin',
                role: _state.currentAdmin?.role || 'admin'
            };

            await _state.db.collection(COLLECTIONS.BLOCK_APPEALS).doc(appealId).update({
                status: 'rejected',
                resolved: true,
                resolvedAt: firebase.firestore.FieldValue.serverTimestamp(),
                resolvedBy: adminInfo,
                resolution: adminResponse || 'Rejected - block remains',
                adminNotes: adminResponse
            });

            Promise.all([
                markSecurityLogsReviewed(appeal, adminInfo),
                logAppealAction('appeal_rejected', appeal, adminInfo),
                loadEmailJS().then(() => sendRejectionEmail(appeal, adminResponse || 'Your appeal has been rejected.'))
            ]).catch(console.warn);

            cache.invalidate('filtered');
            if (window.showToast) window.showToast('Appeal rejected. Block remains.', 'warning');
            closeModal('appealDetailModal');

        } catch (error) {
            console.error('Reject failed:', error);
            if (rejectBtn) {
                rejectBtn.disabled = false;
                rejectBtn.innerHTML = '<i class="fas fa-times"></i> Reject';
            }
            if (window.showToast) window.showToast('Failed: ' + error.message, 'error');
        }
    };

    const quickApprove = async (appealId) => {
        if (!confirm('Quick approve and unblock?')) return;
        
        const appeal = _state.appeals.find(a => a.id === appealId);
        if (!appeal) return;

        try {
            const adminInfo = {
                id: _state.currentAdmin?.id || 'unknown',
                username: _state.currentAdmin?.username || 'Unknown Admin',
                role: _state.currentAdmin?.role || 'admin'
            };

            await Promise.all([
                _state.db.collection(COLLECTIONS.BLOCK_APPEALS).doc(appealId).update({
                    status: 'approved',
                    resolved: true,
                    resolvedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    resolvedBy: adminInfo,
                    resolution: 'Quick approved'
                }),
                appeal.deviceId ? unblockDevice(appeal.deviceId, 'Quick approved') : Promise.resolve(),
                appeal.ipAddress ? unblockIP(appeal.ipAddress, 'Quick approved') : Promise.resolve()
            ]);

            Promise.all([
                updateSecurityLogs(appeal, adminInfo, 'approved'),
                createUnblockNotification(appeal, adminInfo),
                logAppealAction('appeal_approved', appeal, adminInfo),
                loadEmailJS().then(() => sendApprovalEmail(appeal, 'Quick approved.'))
            ]).catch(console.warn);

            cache.invalidate('filtered');
            if (window.showToast) window.showToast('Appeal approved!', 'success');

        } catch (error) {
            console.error('Quick approve failed:', error);
            if (window.showToast) window.showToast('Failed: ' + error.message, 'error');
        }
    };

    const quickReject = async (appealId) => {
        const reason = prompt('Rejection reason:');
        if (!reason?.trim()) return;
        
        const appeal = _state.appeals.find(a => a.id === appealId);
        if (!appeal) return;

        try {
            const adminInfo = {
                id: _state.currentAdmin?.id || 'unknown',
                username: _state.currentAdmin?.username || 'Unknown Admin',
                role: _state.currentAdmin?.role || 'admin'
            };

            await _state.db.collection(COLLECTIONS.BLOCK_APPEALS).doc(appealId).update({
                status: 'rejected',
                resolved: true,
                resolvedAt: firebase.firestore.FieldValue.serverTimestamp(),
                resolvedBy: adminInfo,
                resolution: reason.trim(),
                adminNotes: reason.trim()
            });

            Promise.all([
                markSecurityLogsReviewed(appeal, adminInfo),
                logAppealAction('appeal_rejected', appeal, adminInfo),
                loadEmailJS().then(() => sendRejectionEmail(appeal, reason.trim()))
            ]).catch(console.warn);

            cache.invalidate('filtered');
            if (window.showToast) window.showToast('Appeal rejected.', 'info');

        } catch (error) {
            console.error('Quick reject failed:', error);
            if (window.showToast) window.showToast('Failed: ' + error.message, 'error');
        }
    };

    // ==========================================
    // DATABASE OPERATIONS
    // ==========================================
    const unblockDevice = async (deviceId, reason) => {
        if (!_state.db || !deviceId) return false;
        try {
            const snapshot = await _state.db.collection(COLLECTIONS.BLOCKED_DEVICES)
                .where('deviceId', '==', deviceId)
                .where('isActive', '==', true)
                .limit(10).get();

            if (snapshot.empty) return true;

            const batch = _state.db.batch();
            const adminInfo = { id: _state.currentAdmin?.id || 'unknown', username: _state.currentAdmin?.username || 'Unknown Admin' };
            snapshot.forEach(doc => {
                batch.update(doc.ref, {
                    isActive: false,
                    unblockReason: reason,
                    unblockedBy: adminInfo,
                    unblockedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
            await batch.commit();
            return true;
        } catch (error) {
            console.error('Unblock device failed:', error);
            return false;
        }
    };

    const unblockIP = async (ipAddress, reason) => {
        if (!_state.db || !ipAddress) return false;
        try {
            const snapshot = await _state.db.collection(COLLECTIONS.BLOCKED_IPS)
                .where('ipAddress', '==', ipAddress)
                .where('isActive', '==', true)
                .limit(10).get();

            if (snapshot.empty) return true;

            const batch = _state.db.batch();
            const adminInfo = { id: _state.currentAdmin?.id || 'unknown', username: _state.currentAdmin?.username || 'Unknown Admin' };
            snapshot.forEach(doc => {
                batch.update(doc.ref, {
                    isActive: false,
                    unblockReason: reason,
                    unblockedBy: adminInfo,
                    unblockedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
            await batch.commit();
            return true;
        } catch (error) {
            console.error('Unblock IP failed:', error);
            return false;
        }
    };

    const updateSecurityLogs = async (appeal, adminInfo, action) => {
        if (!_state.db) return;
        try {
            const queries = [];
            if (appeal.deviceId) queries.push(_state.db.collection(COLLECTIONS.SECURITY_LOGS).where('deviceId', '==', appeal.deviceId).where('isBlocked', '==', true).limit(50).get());
            if (appeal.ipAddress) queries.push(_state.db.collection(COLLECTIONS.SECURITY_LOGS).where('ipAddress', '==', appeal.ipAddress).where('isBlocked', '==', true).limit(50).get());
            if (queries.length === 0) return;

            const results = await Promise.all(queries);
            const processedIds = new Set();
            const allDocs = [];
            results.forEach(snapshot => snapshot.forEach(doc => { if (!processedIds.has(doc.id)) { processedIds.add(doc.id); allDocs.push(doc); }}));

            for (let i = 0; i < allDocs.length; i += BATCH_SIZE) {
                const batch = _state.db.batch();
                allDocs.slice(i, i + BATCH_SIZE).forEach(doc => {
                    batch.update(doc.ref, {
                        isBlocked: false,
                        unblockedBy: adminInfo,
                        unblockedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        unblockReason: `Appeal approved: ${appeal.referenceNumber}`,
                        reviewed: true,
                        reviewedBy: adminInfo,
                        appealId: appeal.id,
                        appealStatus: 'approved'
                    });
                });
                await batch.commit();
            }
        } catch (error) {
            console.error('Update security logs failed:', error);
        }
    };

    const markSecurityLogsReviewed = async (appeal, adminInfo) => {
        if (!_state.db) return;
        try {
            const queries = [];
            if (appeal.deviceId) queries.push(_state.db.collection(COLLECTIONS.SECURITY_LOGS).where('deviceId', '==', appeal.deviceId).limit(50).get());
            if (appeal.ipAddress) queries.push(_state.db.collection(COLLECTIONS.SECURITY_LOGS).where('ipAddress', '==', appeal.ipAddress).limit(50).get());
            if (queries.length === 0) return;

            const results = await Promise.all(queries);
            const processedIds = new Set();
            const batch = _state.db.batch();
            results.forEach(snapshot => snapshot.forEach(doc => {
                if (!processedIds.has(doc.id)) {
                    processedIds.add(doc.id);
                    batch.update(doc.ref, { reviewed: true, reviewedBy: adminInfo, reviewedAt: firebase.firestore.FieldValue.serverTimestamp(), appealId: appeal.id, appealStatus: 'rejected' });
                }
            }));
            await batch.commit();
        } catch (error) {
            console.error('Mark logs reviewed failed:', error);
        }
    };

    const createUnblockNotification = async (appeal, adminInfo) => {
        if (!_state.db) return;
        try {
            await _state.db.collection(COLLECTIONS.UNBLOCK_NOTIFICATIONS).add({
                deviceId: appeal.deviceId || null,
                ipAddress: appeal.ipAddress || null,
                appealId: appeal.id,
                referenceNumber: appeal.referenceNumber,
                fullName: appeal.fullName,
                email: appeal.email,
                message: 'Your appeal has been approved.',
                unblockedBy: adminInfo,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                read: false
            });
        } catch (error) {
            console.error('Create notification failed:', error);
        }
    };

    const logAppealAction = async (action, appeal, adminInfo) => {
        if (!_state.db) return;
        try {
            await _state.db.collection(COLLECTIONS.ACTIVITY_LOGS).add({
                action,
                actionCategory: 'security',
                description: `${action === 'appeal_approved' ? 'Approved' : 'Rejected'} appeal from ${appeal.fullName}`,
                targetUser: appeal.fullName,
                targetEmail: appeal.email,
                appealId: appeal.id,
                referenceNumber: appeal.referenceNumber,
                performedBy: adminInfo,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error('Log action failed:', error);
        }
    };

    const markAppealAsViewed = async (appealId) => {
        if (!_state.db) return;
        try {
            await _state.db.collection(COLLECTIONS.BLOCK_APPEALS).doc(appealId).update({
                viewed: true,
                viewedAt: firebase.firestore.FieldValue.serverTimestamp(),
                viewedBy: { id: _state.currentAdmin?.id || 'unknown', username: _state.currentAdmin?.username || 'Unknown' }
            });
        } catch (error) {
            console.warn('Mark viewed failed:', error);
        }
    };

    // ==========================================
    // EMAIL FUNCTIONS
    // ==========================================
    const sendApprovalEmail = async (appeal, message) => {
        if (typeof emailjs === 'undefined' || !emailJSLoaded || !appeal.email) return false;
        try {
            await emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templateIdApprove, {
                to_name: appeal.fullName || 'User',
                to_email: appeal.email.trim(),
                reference_number: appeal.referenceNumber || 'N/A',
                message: message || 'Your appeal has been approved.',
                from_name: 'BreathSafe Security Team'
            });
            return true;
        } catch (error) {
            return false;
        }
    };

    const sendRejectionEmail = async (appeal, reason) => {
        if (typeof emailjs === 'undefined' || !emailJSLoaded || !appeal.email) return false;
        try {
            await emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templateIdReject, {
                to_name: appeal.fullName || 'User',
                to_email: appeal.email.trim(),
                reference_number: appeal.referenceNumber || 'N/A',
                reason: reason || 'Your appeal has been rejected.',
                from_name: 'BreathSafe Security Team'
            });
            return true;
        } catch (error) {
            return false;
        }
    };

    // ==========================================
    // UTILITY ACTIONS
    // ==========================================
    const markAllAsRead = async () => {
        const pending = _state.appeals.filter(a => !a.viewed);
        if (pending.length === 0) return;
        
        const batch = _state.db.batch();
        pending.forEach(appeal => {
            batch.update(_state.db.collection(COLLECTIONS.BLOCK_APPEALS).doc(appeal.id), { viewed: true });
        });
        await batch.commit();
        if (window.showToast) window.showToast('All marked as read', 'success');
    };

    const refreshAppeals = () => {
        cache.invalidate('filtered');
        const container = document.getElementById('appealsGridContainer');
        if (container) {
            container.innerHTML = '<div class="appeals-loading"><i class="fas fa-spinner fa-spin"></i> Refreshing...</div>';
            setTimeout(() => {
                renderAppealsGrid(_state.appeals);
                if (window.showToast) window.showToast('Refreshed', 'success');
            }, 300);
        }
    };

    const clearFilters = () => {
        const statusFilter = document.getElementById('appealsStatusFilter');
        const typeFilter = document.getElementById('appealsTypeFilter');
        const searchInput = document.getElementById('appealsSearchInput');
        if (statusFilter) statusFilter.value = 'all';
        if (typeFilter) typeFilter.value = 'all';
        if (searchInput) searchInput.value = '';
        handleFilterChange();
        if (window.showToast) window.showToast('Filters cleared', 'success');
    };

    const exportAppeals = async () => {
        const statusFilter = document.getElementById('appealsStatusFilter')?.value || 'all';
        const filtered = await getFilteredAppeals({ status: statusFilter, type: 'all', search: '' });
        
        let csv;
        if (_state.workerReady && filtered.length > 50) {
            csv = await workerTask('generateCSV', { appeals: filtered });
        } else {
            const headers = ['Reference', 'Full Name', 'Email', 'Status', 'Submitted'];
            const rows = filtered.map(a => [
                a.referenceNumber || '',
                `"${(a.fullName || '').replace(/"/g, '""')}"`,
                a.email || '',
                a.status || 'pending',
                formatDateTime(a.createdAt)
            ]);
            csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        }
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `appeals_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        if (window.showToast) window.showToast(`Exported ${filtered.length} appeals`, 'success');
    };

    const confirmBulkDelete = async () => {
        const selected = document.querySelector('input[name="deleteOption"]:checked');
        if (!selected) return;
        
        const deleteType = selected.value;
        const confirmBtn = document.getElementById('confirmBulkDelete');
        
        if (confirmBtn) {
            confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
            confirmBtn.disabled = true;
        }
        
        try {
            let toDelete = [];
            switch(deleteType) {
                case 'all': toDelete = [..._state.appeals]; break;
                case 'resolved': toDelete = _state.appeals.filter(a => a.resolved); break;
                case 'approved': toDelete = _state.appeals.filter(a => a.status === 'approved'); break;
                case 'rejected': toDelete = _state.appeals.filter(a => a.status === 'rejected'); break;
            }
            
            if (toDelete.length === 0) {
                if (window.showToast) window.showToast('Nothing to delete', 'warning');
                closeModal('bulkDeleteModal');
                return;
            }
            
            for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
                const batch = _state.db.batch();
                toDelete.slice(i, i + BATCH_SIZE).forEach(appeal => {
                    batch.delete(_state.db.collection(COLLECTIONS.BLOCK_APPEALS).doc(appeal.id));
                });
                await batch.commit();
            }
            
            cache.invalidate('filtered');
            closeModal('bulkDeleteModal');
            if (window.showToast) window.showToast(`Deleted ${toDelete.length} appeals`, 'success');
            setTimeout(refreshAppeals, 500);
            
        } catch (error) {
            console.error('Bulk delete failed:', error);
            if (confirmBtn) {
                confirmBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Delete';
                confirmBtn.disabled = false;
            }
            if (window.showToast) window.showToast('Delete failed: ' + error.message, 'error');
        }
    };

    // ==========================================
    // CLEANUP
    // ==========================================
    const destroy = () => {
        if (_state.appealsListener) {
            _state.appealsListener();
            _state.appealsListener = null;
        }
        if (_state.worker) {
            _state.worker.terminate();
            _state.worker = null;
        }
        _state.cache.clear();
        timeFormatCache.clear();
        _state.initialized = false;
    };

    // ==========================================
    // PUBLIC API
    // ==========================================
    return {
        init,
        destroy,
        showAppealDetail,
        showAllAppealsModal,
        approveAppeal,
        rejectAppeal,
        quickApprove,
        quickReject,
        refreshAppeals,
        clearFilters,
        exportAppeals,
        closeModal,
        handleFilterChange,
        markAllAsRead,
        showBulkDeleteModal,
        
        // Expose for debugging
        get appeals() { return _state.appeals; },
        get unreadCount() { return _state.unreadCount; }
    };
})();

// Global export
window.AdminNotifications = AdminNotifications;

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AdminNotifications.init());
} else {
    AdminNotifications.init();
}

console.log('🔔 Admin Notifications module loaded (OPTIMIZED)');
