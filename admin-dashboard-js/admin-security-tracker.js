/* ==========================================
BREATHSAFE SECURITY TRACKER - FIXED v2.2
Real-Time Device Based with Reset
FIXED: Database ready check, lockout counting
========================================== */

(function() {
    'use strict';

    // ========== SHARED UTILITIES ==========
    const utils = {
        $(id) {
            return document.getElementById(id);
        },
        
        debounce(fn, ms) {
            let t;
            return function(...a) {
                clearTimeout(t);
                t = setTimeout(() => fn.apply(this, a), ms);
            };
        },
        
        throttle(fn, ms) {
            let last = 0, pending = null;
            return function(...a) {
                const now = Date.now();
                if (now - last >= ms) {
                    last = now;
                    fn.apply(this, a);
                } else if (!pending) {
                    pending = setTimeout(() => {
                        last = Date.now();
                        pending = null;
                        fn.apply(this, a);
                    }, ms - (now - last));
                }
            };
        },
        
        isElement(t) {
            return t && t.nodeType === 1 && typeof t.closest === 'function';
        }
    };

    // ========== BATCHED DOM UPDATES ==========
    const DOMBatch = {
        queue: [],
        scheduled: false,
        
        add(fn) {
            this.queue.push(fn);
            if (!this.scheduled) {
                this.scheduled = true;
                requestAnimationFrame(() => this.flush());
            }
        },
        
        flush() {
            const fns = this.queue.splice(0);
            fns.forEach(fn => {
                try { fn(); } catch(e) { console.error('DOM batch error:', e); }
            });
            this.scheduled = false;
        }
    };

    // ========== WEB WORKER FOR HEAVY OPERATIONS ==========
    const SecurityWorker = {
        _worker: null,
        _callbacks: new Map(),
        _id: 0,
        _ready: false,
        
        init() {
            if (this._worker || typeof Worker === 'undefined') return;
            
            try {
                const workerCode = `
                    self.onmessage = function(e) {
                        const { id, type, data } = e.data;
                        let result = null;
                        
                        try {
                            switch(type) {
                                case 'filterLogs':
                                    result = filterSecurityLogs(data.logs, data.filter);
                                    break;
                                case 'calculateStats':
                                    result = calculateStats(data.logs);
                                    break;
                                case 'generateCSV':
                                    result = generateCSV(data.logs);
                                    break;
                            }
                            self.postMessage({ id, success: true, result });
                        } catch(err) {
                            self.postMessage({ id, success: false, error: err.message });
                        }
                    };
                    
                    function filterSecurityLogs(logs, filter) {
                        if (!filter || filter === 'all') return logs;
                        
                        switch(filter) {
                            case 'admin':
                                return logs.filter(l => l.userType === 'admin');
                            case 'user':
                                return logs.filter(l => l.userType === 'user' || !l.userType);
                            case 'blocked':
                                return logs.filter(l => l.isBlocked === true);
                            case 'critical':
                                return logs.filter(l => l.severity === 'critical');
                            case 'suspicious':
                                return logs.filter(l => l.severity === 'suspicious' || l.isSuspicious);
                            default:
                                return logs;
                        }
                    }
                    
                    function calculateStats(logs) {
                        let totalLockouts = 0;
                        let suspicious = 0;
                        let reviewed = 0;
                        
                        for (let i = 0; i < logs.length; i++) {
                            const log = logs[i];
                            if (log.action === 'lockout') totalLockouts++;
                            if (log.isSuspicious || log.severity === 'suspicious' || log.severity === 'critical') suspicious++;
                            if (log.reviewed) reviewed++;
                        }
                        
                        return { totalLockouts, suspicious, reviewed };
                    }
                    
                    function generateCSV(logs) {
                        let csv = 'Timestamp,Severity,Username,UserType,DeviceID,DeviceName,IPAddress,Blocked,Reviewed,Action,LockoutCount\\n';
                        
                        for (let i = 0; i < logs.length; i++) {
                            const d = logs[i];
                            const time = d.timestamp || 'Unknown';
                            const deviceId = d.deviceShortId || (d.deviceId ? d.deviceId.substring(0, 12) : '');
                            const lockoutInfo = d.calculatedLockouts ? d.calculatedLockouts + ' of ' + d.totalDeviceLockouts : '';
                            csv += '"' + time + '","' + (d.severity || '') + '","' + (d.username || '') + '","' + (d.userType || '') + '","' + deviceId + '","' + (d.deviceName || '') + '","' + (d.ipAddress || '') + '","' + (d.isBlocked ? 'Yes' : 'No') + '","' + (d.reviewed ? 'Yes' : 'No') + '","' + (d.action || '') + '","' + lockoutInfo + '"\\n';
                        }
                        
                        return csv;
                    }
                `;
                
                const blob = new Blob([workerCode], { type: 'application/javascript' });
                this._worker = new Worker(URL.createObjectURL(blob));
                
                this._worker.onmessage = (e) => {
                    const { id, success, result, error } = e.data;
                    const callback = this._callbacks.get(id);
                    if (callback) {
                        if (success) {
                            callback.resolve(result);
                        } else {
                            callback.reject(new Error(error));
                        }
                        this._callbacks.delete(id);
                    }
                };
                
                this._worker.onerror = (err) => {
                    console.warn('Security worker error:', err.message);
                };
                
                this._ready = true;
                console.log('✅ Security Worker initialized');
            } catch (e) {
                console.warn('Security Worker init failed, using main thread:', e.message);
            }
        },
        
        async send(type, data) {
            if (!this._ready || !this._worker) {
                return null;
            }
            
            return new Promise((resolve, reject) => {
                const id = ++this._id;
                this._callbacks.set(id, { resolve, reject });
                
                setTimeout(() => {
                    if (this._callbacks.has(id)) {
                        this._callbacks.delete(id);
                        resolve(null);
                    }
                }, 5000);
                
                this._worker.postMessage({ id, type, data });
            });
        },
        
        terminate() {
            if (this._worker) {
                this._worker.terminate();
                this._worker = null;
                this._ready = false;
            }
            this._callbacks.clear();
        }
    };

    // ========== MAIN SECURITY TRACKER ==========
    const SecurityTracker = {
        db: null,
        rtdb: null,
        initialized: false,
        _initializing: false,
        currentAdmin: null,
        securityLogListener: null,
        blockedDevicesListener: null,
        blockedIPsListener: null,
        statsListener: null,
        allSecurityLogs: [],
        blockedDevicesCache: new Map(),
        blockedIPsCache: new Map(),
        deviceLockoutCounts: new Map(), // Track lockouts per device

        config: {
            LOCKOUT_THRESHOLDS: {
                SUSPICIOUS: 2,
                CRITICAL: 3,
                AUTO_BLOCK: 4
            },
            COLLECTIONS: {
                SECURITY_LOGS: 'security_logs',
                BLOCKED_DEVICES: 'blocked_devices',
                BLOCKED_IPS: 'blocked_ips',
                LOCKOUT_HISTORY: 'lockout_history',
                ADMIN_ALERTS: 'admin_alerts',
                ACTIVITY_LOGS: 'activity_logs'
            }
        },

        // ========== GET DATABASE ==========
        getDatabase() {
            if (this.db) return this.db;
            
            if (window.SharedState?.db) {
                this.db = window.SharedState.db;
                return this.db;
            }
            
            if (window.STATE?.db) {
                this.db = window.STATE.db;
                return this.db;
            }
            
            if (window.AdminCore?.db) {
                this.db = window.AdminCore.db;
                return this.db;
            }
            
            return null;
        },

        // ========== GET CURRENT ADMIN ==========
        getCurrentAdmin() {
            if (this.currentAdmin) return this.currentAdmin;
            
            if (window.SharedState?.currentAdmin) {
                this.currentAdmin = window.SharedState.currentAdmin;
                return this.currentAdmin;
            }
            
            if (window.STATE?.currentAdminData) {
                this.currentAdmin = window.STATE.currentAdminData;
                return this.currentAdmin;
            }
            
            return null;
        },

        // ========== WAIT FOR DATABASE ==========
        async waitForDatabase(maxWaitMs = 10000) {
            const startTime = Date.now();
            
            while (Date.now() - startTime < maxWaitMs) {
                const db = this.getDatabase();
                if (db) {
                    return db;
                }
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            
            return null;
        },

        // ========== INITIALIZATION ==========
        async init() {
            if (this.initialized) {
                return true;
            }
            
            if (this._initializing) {
                return false;
            }
            
            this._initializing = true;
            console.log('🔒 Security Tracker: Initializing...');
            
            try {
                this.db = await this.waitForDatabase(10000);
                this.currentAdmin = this.getCurrentAdmin();

                if (!this.db) {
                    console.warn('🔒 Security Tracker: Database not available, security features disabled');
                    this._initializing = false;
                    return false;
                }

                console.log('🔒 Security Tracker: Database connected');

                setTimeout(() => {
                    try {
                        SecurityWorker.init();
                    } catch (e) {
                        console.warn('Worker init error:', e);
                    }
                }, 100);

                await Promise.all([
                    this.loadBlockedDevices(),
                    this.loadBlockedIPs()
                ]);
                
                this.startSecurityLogStream();
                this.startStatsStream();
                this.setupRealtimeIndicator();
                
                this.initialized = true;
                this._initializing = false;
                console.log('✅ Security Tracker: Real-time mode active');
                return true;
                
            } catch (error) {
                console.error('🔒 Security Tracker: Initialization error:', error);
                this._initializing = false;
                return false;
            }
        },

        // ========== REAL-TIME INDICATORS ==========
        setupRealtimeIndicator() {
            const cardTitle = document.querySelector('.security-log-section .card-title');
            if (cardTitle && !cardTitle.querySelector('.realtime-indicator')) {
                const indicator = document.createElement('span');
                indicator.className = 'realtime-indicator';
                indicator.title = 'Real-time updates active';
                indicator.innerHTML = '<i class="fas fa-circle"></i> Live';
                cardTitle.appendChild(indicator);
            }
        },

        // ========== REAL-TIME BLOCKED DEVICES ==========
        async loadBlockedDevices() {
            const db = this.getDatabase();
            if (!db) return;

            const self = this;
            const handleSnapshot = utils.throttle((snapshot) => {
                self.blockedDevicesCache.clear();
                snapshot.forEach(doc => {
                    const data = doc.data();
                    self.blockedDevicesCache.set(data.deviceId, {
                        id: doc.id,
                        ...data
                    });
                });
                console.log(`📋 Blocked devices updated: ${self.blockedDevicesCache.size}`);
                self.updateBlockedCount();
            }, 100);

            try {
                this.blockedDevicesListener = db.collection(this.config.COLLECTIONS.BLOCKED_DEVICES)
                    .where('isActive', '==', true)
                    .onSnapshot(handleSnapshot, error => {
                        console.error('Blocked devices listener error:', error);
                    });
            } catch (error) {
                console.error('Failed to setup blocked devices listener:', error);
            }
        },

        // ========== REAL-TIME BLOCKED IPS ==========
        async loadBlockedIPs() {
            const db = this.getDatabase();
            if (!db) return;

            const self = this;
            const handleSnapshot = utils.throttle((snapshot) => {
                self.blockedIPsCache.clear();
                snapshot.forEach(doc => {
                    const data = doc.data();
                    self.blockedIPsCache.set(data.ipAddress, {
                        id: doc.id,
                        ...data
                    });
                });
                console.log(`📋 Blocked IPs updated: ${self.blockedIPsCache.size}`);
                self.updateBlockedCount();
            }, 100);

            try {
                this.blockedIPsListener = db.collection(this.config.COLLECTIONS.BLOCKED_IPS)
                    .where('isActive', '==', true)
                    .onSnapshot(handleSnapshot, error => {
                        console.error('Blocked IPs listener error:', error);
                    });
            } catch (error) {
                console.error('Failed to setup blocked IPs listener:', error);
            }
        },

        // ========== UPDATE BLOCKED COUNT ==========
        updateBlockedCount() {
            const totalBlocked = this.blockedDevicesCache.size + this.blockedIPsCache.size;
            const el = document.getElementById('statBlockedIPs');
            if (el) {
                const current = parseInt(el.textContent) || 0;
                if (current !== totalBlocked) {
                    DOMBatch.add(() => {
                        el.classList.add('stat-updating');
                        el.textContent = totalBlocked;
                        setTimeout(() => el.classList.remove('stat-updating'), 300);
                    });
                }
            }
        },

        // ========== REAL-TIME STATS ==========
        startStatsStream() {
            const db = this.getDatabase();
            if (!db) return;

            const self = this;
            const handleSnapshot = utils.debounce(async (snapshot) => {
                const logs = [];
                snapshot.forEach(doc => {
                    logs.push(doc.data());
                });

                let stats = null;
                if (SecurityWorker._ready && logs.length > 50) {
                    stats = await SecurityWorker.send('calculateStats', { logs });
                }

                if (!stats) {
                    stats = { totalLockouts: 0, suspicious: 0, reviewed: 0 };
                    logs.forEach(data => {
                        if (data.action === 'lockout') stats.totalLockouts++;
                        if (data.isSuspicious || data.severity === 'suspicious' || data.severity === 'critical') stats.suspicious++;
                        if (data.reviewed) stats.reviewed++;
                    });
                }

                stats.blockedTotal = self.blockedDevicesCache.size + self.blockedIPsCache.size;
                self.updateStatsDisplay(stats);
            }, 200);

            try {
                this.statsListener = db.collection(this.config.COLLECTIONS.SECURITY_LOGS)
                    .orderBy('timestamp', 'desc')
                    .limit(500)
                    .onSnapshot(handleSnapshot, error => {
                        console.error('Stats stream error:', error);
                    });
            } catch (error) {
                console.error('Failed to setup stats stream:', error);
            }
        },

        // ========== UPDATE STATS DISPLAY ==========
        updateStatsDisplay(stats) {
            const elements = {
                totalLockouts: document.getElementById('statTotalLockouts'),
                suspicious: document.getElementById('statSuspicious'),
                blockedTotal: document.getElementById('statBlockedIPs'),
                reviewed: document.getElementById('statReviewed')
            };

            DOMBatch.add(() => {
                Object.entries(elements).forEach(([key, el]) => {
                    if (el && stats[key] !== undefined) {
                        const current = parseInt(el.textContent) || 0;
                        const target = stats[key];
                        
                        if (current !== target) {
                            el.classList.add('stat-updating');
                            el.textContent = target;
                            setTimeout(() => el.classList.remove('stat-updating'), 300);
                        }
                    }
                });
            });
        },

        // ========== CALCULATE CONSECUTIVE LOCKOUTS PER DEVICE ==========
        calculateConsecutiveLockouts(logs) {
            // Clear previous counts
            this.deviceLockoutCounts.clear();
            
            // Group lockouts by device ID or IP
            const deviceLockouts = new Map();
            
            // First pass: collect all lockout logs per device
            logs.forEach(log => {
                if (log.action === 'lockout') {
                    const deviceKey = log.deviceId || log.ipAddress || 'unknown';
                    
                    if (!deviceLockouts.has(deviceKey)) {
                        deviceLockouts.set(deviceKey, []);
                    }
                    
                    deviceLockouts.get(deviceKey).push({
                        id: log.id,
                        timestamp: log.timestamp
                    });
                }
            });
            
            // Sort each device's logs by timestamp (oldest first for counting)
            deviceLockouts.forEach((deviceLogs, deviceKey) => {
                // Sort oldest first
                deviceLogs.sort((a, b) => {
                    const timeA = this.getTimestamp(a.timestamp);
                    const timeB = this.getTimestamp(b.timestamp);
                    return timeA - timeB;
                });
                
                // Assign position (1, 2, 3, etc.)
                deviceLogs.forEach((logEntry, index) => {
                    logEntry.position = index + 1;
                    logEntry.total = deviceLogs.length;
                });
                
                // Store total count for device
                this.deviceLockoutCounts.set(deviceKey, deviceLogs.length);
            });
            
            // Second pass: update each log with its lockout position
            return logs.map(log => {
                if (log.action === 'lockout') {
                    const deviceKey = log.deviceId || log.ipAddress || 'unknown';
                    const deviceLogs = deviceLockouts.get(deviceKey);
                    
                    if (deviceLogs) {
                        const logEntry = deviceLogs.find(l => l.id === log.id);
                        if (logEntry) {
                            log.calculatedLockouts = logEntry.position;
                            log.totalDeviceLockouts = logEntry.total;
                        }
                    }
                }
                return log;
            });
        },

        // ========== HELPER: GET TIMESTAMP ==========
        getTimestamp(timestamp) {
            if (!timestamp) return 0;
            if (timestamp instanceof Date) return timestamp.getTime();
            if (timestamp.toDate) return timestamp.toDate().getTime();
            if (typeof timestamp === 'number') return timestamp;
            return new Date(timestamp).getTime();
        },

        // ========== REAL-TIME SECURITY LOGS ==========
        startSecurityLogStream() {
            const db = this.getDatabase();
            if (!db || this.securityLogListener) return;

            const self = this;
            const handleSnapshot = utils.throttle((snapshot) => {
                const logs = [];

                snapshot.forEach(doc => {
                    logs.push({
                        id: doc.id,
                        ...doc.data(),
                        timestamp: doc.data().timestamp?.toDate() || new Date()
                    });
                });
                
                // Calculate lockouts BEFORE storing
                self.allSecurityLogs = self.calculateConsecutiveLockouts(logs);
                
                console.log(`📋 Security logs loaded: ${logs.length}, Lockouts calculated`);
                
                self.applySecurityLogFilter();
                
                // Highlight new entries
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        setTimeout(() => {
                            const row = document.querySelector(`tr[data-log-id="${change.doc.id}"]`);
                            if (row) {
                                row.classList.add('new-entry');
                                setTimeout(() => row.classList.remove('new-entry'), 3000);
                            }
                        }, 100);
                    }
                });
            }, 100);

            try {
                this.securityLogListener = db.collection(this.config.COLLECTIONS.SECURITY_LOGS)
                    .orderBy('timestamp', 'desc')
                    .limit(100)
                    .onSnapshot(handleSnapshot, error => {
                        console.error('Security log stream error:', error);
                    });
                
                // Setup filter listener
                const filterSelect = document.getElementById('securityLogFilter');
                if (filterSelect && !filterSelect._listenerAttached) {
                    filterSelect._listenerAttached = true;
                    filterSelect.addEventListener('change', () => {
                        this.applySecurityLogFilter();
                    });
                }
            } catch (error) {
                console.error('Failed to setup security log stream:', error);
            }
        },

        // ========== APPLY FILTER ==========
        applySecurityLogFilter() {
            const filterSelect = document.getElementById('securityLogFilter');
            const filterValue = filterSelect ? filterSelect.value : 'all';
            
            // Logs already have lockout counts calculated in startSecurityLogStream
            let filteredLogs = [...this.allSecurityLogs];
            
            // Apply filters
            switch(filterValue) {
                case 'admin':
                    filteredLogs = filteredLogs.filter(log => log.userType === 'admin');
                    break;
                case 'user':
                    filteredLogs = filteredLogs.filter(log => log.userType === 'user' || !log.userType);
                    break;
                case 'blocked':
                    filteredLogs = filteredLogs.filter(log => log.isBlocked === true);
                    break;
                case 'critical':
                    filteredLogs = filteredLogs.filter(log => log.severity === 'critical');
                    break;
                case 'suspicious':
                    filteredLogs = filteredLogs.filter(log => log.severity === 'suspicious' || log.isSuspicious);
                    break;
            }
            
            this.renderSecurityLogs(filteredLogs);
        },

        // ========== RENDER SECURITY LOGS ==========
        renderSecurityLogs(logs) {
            const tbody = document.getElementById('securityLogBody');
            if (!tbody) return;

            // Update count
            const countEl = document.getElementById('securityLogCount');
            if (countEl) {
                countEl.textContent = logs.length;
            }

            if (logs.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" class="loading-cell">
                            <i class="fas fa-shield-alt" style="font-size: 2rem; color: var(--muted); margin-bottom: 1rem; display: block;"></i>
                            <span class="muted">No security events recorded</span>
                        </td>
                    </tr>
                `;
                
                // Clear mobile cards
                const mobileContainer = document.querySelector('.security-mobile-cards-container');
                if (mobileContainer) {
                    mobileContainer.innerHTML = '';
                }
                return;
            }

            const isExecutive = this.isExecutiveAdmin();
            const html = logs.map(log => this._buildLogRowHTML(log, isExecutive)).join('');

            tbody.innerHTML = html;
            this.attachSecurityLogListeners();

            // Only render mobile cards if on mobile screen
            const isMobile = window.innerWidth <= 768;
            const mobileContainer = document.querySelector('.security-mobile-cards-container');
            
            if (isMobile && mobileContainer) {
                const mobileCardsHTML = logs.map(log => this.generateSecurityMobileCard(log)).join('');
                mobileContainer.innerHTML = mobileCardsHTML;
            } else if (mobileContainer) {
                mobileContainer.innerHTML = '';
            }
        },

        // ========== BUILD LOG ROW HTML ==========
        _buildLogRowHTML(log, isExecutive) {
            const severityClass = this.getSeverityClass(log.severity);
            const severityIcon = this.getSeverityIcon(log.severity);
            const deviceIcon = log.device?.icon || 'fa-desktop';
            const browserIcon = log.browser?.icon || 'fa-globe';
            
            const wasBlocked = log.isBlocked && log.unblockedAt;
            const currentlyBlocked = log.isBlocked && !log.unblockedAt;
            const rowClass = wasBlocked ? 'unblocked' : currentlyBlocked ? 'blocked-row' : '';

            const deviceFingerprint = log.deviceShortId || log.deviceId?.substring(0, 12)?.toUpperCase() || 'LEGACY-IP';
            const deviceName = log.deviceName || log.device?.name || 'Unknown Device';
            const isLegacy = log.isBackwardCompatible || !log.deviceId;

            // Get lockout display info
            const hasLockout = log.calculatedLockouts || log.consecutiveLockouts;
            const lockoutPosition = log.calculatedLockouts || log.consecutiveLockouts || 0;
            const lockoutTotal = log.totalDeviceLockouts || lockoutPosition;
            const lockoutClass = lockoutTotal >= 3 ? 'critical' : lockoutTotal >= 2 ? 'warning' : '';

            return `
                <tr class="security-log-row ${log.severity || ''} ${rowClass}" 
                    data-log-id="${log.id}" 
                    data-device-id="${log.deviceId || ''}"
                    data-ip="${log.ipAddress || ''}">
                    <td class="security-time-cell">
                        <div class="security-time">
                            <div class="time-primary">${this.formatTime(log.timestamp)}</div>
                            <div class="time-secondary">${this.formatDate(log.timestamp)}</div>
                        </div>
                    </td>
                    <td class="security-severity-cell">
                        <span class="severity-badge ${severityClass}">
                            <i class="fas ${severityIcon}"></i>
                            ${(log.severity || 'INFO').toUpperCase()}
                        </span>
                    </td>
                    <td class="security-user-cell">
                        <div class="security-user-info">
                            <span class="security-username">${log.username || 'Unknown'}</span>
                            <span class="security-usertype ${log.userType === 'admin' ? 'admin-type' : 'user-type'}">
                                <i class="fas ${log.userType === 'admin' ? 'fa-shield-alt' : 'fa-user'}"></i>
                                ${log.userType || 'user'}
                            </span>
                        </div>
                    </td>
                    <td class="security-device-cell">
                        <div class="device-fingerprint ${isLegacy ? 'legacy-mode' : ''}">
                            <i class="fas ${isLegacy ? 'fa-network-wired' : 'fa-fingerprint'} fingerprint-icon"></i>
                            <div class="fingerprint-info">
                                <span class="fingerprint-id">${deviceFingerprint}</span>
                                <span class="fingerprint-name">${deviceName}</span>
                            </div>
                        </div>
                        <div class="device-details">
                            <span class="device-badge">
                                <i class="fas ${deviceIcon}"></i>
                                ${log.device?.fullName || log.device?.name || 'Unknown'}
                            </span>
                            ${log.browser?.fullName ? `
                                <span class="browser-badge">
                                    <i class="fab ${browserIcon}"></i>
                                    ${log.browser.fullName}
                                </span>
                            ` : ''}
                        </div>
                    </td>
                    <td class="security-ip-cell">
                        <div class="ip-address ${currentlyBlocked ? 'blocked' : ''} ${wasBlocked ? 'was-blocked' : ''}">
                            <i class="fas ${currentlyBlocked ? 'fa-ban' : wasBlocked ? 'fa-unlock' : 'fa-network-wired'}"></i>
                            <span>${log.ipAddress || 'Unknown'}</span>
                        </div>
                        ${hasLockout ? `
                            <div class="lockout-count ${lockoutClass}">
                                <i class="fas fa-lock"></i>
                                ${lockoutPosition}${lockoutTotal > 1 ? ' of ' + lockoutTotal : ''} lockout${lockoutTotal > 1 ? 's' : ''}
                            </div>
                        ` : ''}
                        ${wasBlocked ? `
                            <div class="unblock-badge">
                                <i class="fas fa-unlock"></i>
                                Unblocked ${this.formatDateShort(log.unblockedAt)}
                            </div>
                        ` : ''}
                    </td>
                    <td class="security-status-cell">
                        ${currentlyBlocked ? 
                            `<span class="status-tag blocked"><i class="fas fa-ban"></i> Blocked</span>` :
                            wasBlocked ?
                                `<span class="status-tag unblocked"><i class="fas fa-unlock"></i> Unblocked</span>` :
                            log.reviewed ?
                                `<span class="status-tag reviewed"><i class="fas fa-check"></i> Reviewed</span>` :
                                `<span class="status-tag pending"><i class="fas fa-clock"></i> Pending</span>`
                        }
                    </td>
                    <td class="security-actions-cell">
                        ${isExecutive ? this.renderActionButtons(log) : '<span class="muted">-</span>'}
                    </td>
                </tr>
            `;
        },

        // ========== GENERATE MOBILE CARD ==========
        generateSecurityMobileCard(log) {
            const isExecutive = this.isExecutiveAdmin();
            const severityConfig = {
                'info': { icon: 'fa-info-circle', class: 'severity-info' },
                'warning': { icon: 'fa-exclamation-triangle', class: 'severity-warning' },
                'suspicious': { icon: 'fa-user-secret', class: 'severity-suspicious' },
                'critical': { icon: 'fa-skull-crossbones', class: 'severity-critical' }
            };
            
            const severity = severityConfig[log.severity] || severityConfig.info;
            const wasBlocked = log.isBlocked && log.unblockedAt;
            const currentlyBlocked = log.isBlocked && !log.unblockedAt;
            
            // Get lockout display info
            const hasLockout = log.calculatedLockouts || log.consecutiveLockouts;
            const lockoutPosition = log.calculatedLockouts || log.consecutiveLockouts || 0;
            const lockoutTotal = log.totalDeviceLockouts || lockoutPosition;
            
            return `
                <div class="security-log-mobile-card ${log.severity || ''} ${currentlyBlocked ? 'blocked-row' : ''} ${wasBlocked ? 'unblocked' : ''}" 
                     data-log-id="${log.id}">
                    
                    <div class="mobile-card-header">
                        <div class="security-time">
                            <div class="time-primary">${this.formatTime(log.timestamp)}</div>
                            <div class="time-secondary">${this.formatDate(log.timestamp)}</div>
                        </div>
                        <span class="severity-badge ${severity.class}">
                            <i class="fas ${severity.icon}"></i>
                            ${(log.severity || 'INFO').toUpperCase()}
                        </span>
                    </div>
                    
                    <div class="mobile-card-body">
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">User</span>
                            <div class="mobile-card-value">
                                <div class="security-username">${log.username || 'Unknown'}</div>
                                <span class="security-usertype ${log.userType === 'admin' ? 'admin-type' : 'user-type'}">
                                    <i class="fas ${log.userType === 'admin' ? 'fa-shield-alt' : 'fa-user'}"></i>
                                    ${log.userType || 'user'}
                                </span>
                            </div>
                        </div>
                        
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Device ID</span>
                            <div class="mobile-card-value">
                                <code class="fingerprint-id">${log.deviceShortId || log.deviceId?.substring(0, 12).toUpperCase() || 'N/A'}</code>
                            </div>
                        </div>
                        
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">IP Address</span>
                            <div class="mobile-card-value">
                                <div class="ip-address ${currentlyBlocked ? 'blocked' : ''}">
                                    <i class="fas ${currentlyBlocked ? 'fa-ban' : 'fa-network-wired'}"></i>
                                    <span>${log.ipAddress || 'Unknown'}</span>
                                </div>
                            </div>
                        </div>
                        
                        ${hasLockout ? `
                            <div class="mobile-card-row">
                                <span class="mobile-card-label">Lockouts</span>
                                <div class="mobile-card-value">
                                    <span class="lockout-count ${lockoutTotal >= 3 ? 'critical' : lockoutTotal >= 2 ? 'warning' : ''}">
                                        <i class="fas fa-lock"></i>
                                        ${lockoutPosition}${lockoutTotal > 1 ? ' of ' + lockoutTotal : ''}
                                    </span>
                                </div>
                            </div>
                        ` : ''}
                        
                        <div class="mobile-card-row">
                            <span class="mobile-card-label">Status</span>
                            <div class="mobile-card-value">
                                ${currentlyBlocked ? 
                                    '<span class="status-tag blocked"><i class="fas fa-ban"></i> Blocked</span>' :
                                    wasBlocked ?
                                        '<span class="status-tag unblocked"><i class="fas fa-unlock"></i> Unblocked</span>' :
                                    log.reviewed ?
                                        '<span class="status-tag reviewed"><i class="fas fa-check"></i> Reviewed</span>' :
                                        '<span class="status-tag pending"><i class="fas fa-clock"></i> Pending</span>'
                                }
                            </div>
                        </div>
                    </div>
                    
                    ${isExecutive ? `
                        <div class="mobile-card-actions">
                            ${this.renderActionButtons(log)}
                        </div>
                    ` : ''}
                </div>
            `;
        },

        // ========== RENDER ACTION BUTTONS ==========
        renderActionButtons(log) {
            const isExecutive = this.isExecutiveAdmin();
            if (!isExecutive) return '<span class="muted">-</span>';
            
            let buttons = '';
            
            const wasBlocked = log.isBlocked && log.unblockedAt;
            const currentlyBlocked = log.isBlocked && !log.unblockedAt;
            const deviceId = log.deviceId;
            const ipAddress = log.ipAddress;
            const hasDevice = deviceId && !log.isBackwardCompatible;

            if (!log.reviewed && !currentlyBlocked) {
                buttons += `
                    <button class="security-action-btn review" 
                            data-action="review"
                            data-log-id="${log.id}"
                            title="Mark as Reviewed">
                        <i class="fas fa-check"></i>
                    </button>
                `;
            }

            if (!currentlyBlocked && !wasBlocked) {
                if (hasDevice) {
                    buttons += `
                        <button class="security-action-btn block" 
                                data-action="blockDevice"
                                data-device-id="${deviceId}"
                                data-device-name="${log.deviceName || 'Unknown'}"
                                data-username="${log.username}"
                                title="Block Device">
                            <i class="fas fa-ban"></i>
                        </button>
                    `;
                } else if (ipAddress && ipAddress !== 'Unknown') {
                    buttons += `
                        <button class="security-action-btn block" 
                                data-action="blockIP"
                                data-ip="${ipAddress}"
                                data-username="${log.username}"
                                title="Block IP">
                            <i class="fas fa-ban"></i>
                        </button>
                    `;
                }
            }

            if (currentlyBlocked) {
                if (hasDevice) {
                    buttons += `
                        <button class="security-action-btn unblock" 
                                data-action="unblockDevice"
                                data-device-id="${deviceId}"
                                data-device-name="${log.deviceName || 'Unknown'}"
                                title="Unblock Device">
                            <i class="fas fa-unlock"></i>
                        </button>
                    `;
                } else if (ipAddress) {
                    buttons += `
                        <button class="security-action-btn unblock" 
                                data-action="unblockIP"
                                data-ip="${ipAddress}"
                                title="Unblock IP">
                            <i class="fas fa-unlock"></i>
                        </button>
                    `;
                }
            }

            if (wasBlocked) {
                buttons += `
                    <button class="security-action-btn info" 
                            data-action="viewHistory"
                            data-log-id="${log.id}"
                            title="View History">
                        <i class="fas fa-info-circle"></i>
                    </button>
                `;
            }

            if (log.userType === 'admin' && (log.totalDeviceLockouts || log.consecutiveLockouts) >= 3 && !currentlyBlocked) {
                buttons += `
                    <button class="security-action-btn disable-admin" 
                            data-action="disableAdmin"
                            data-username="${log.username}"
                            title="Disable Admin">
                        <i class="fas fa-user-slash"></i>
                    </button>
                `;
            }

            return buttons || '<span class="muted">-</span>';
        },

        // ========== ATTACH EVENT LISTENERS ==========
        attachSecurityLogListeners() {
            const tbody = document.getElementById('securityLogBody');
            if (!tbody) return;
            
            if (tbody._securityDelegated) return;
            tbody._securityDelegated = true;

            const self = this;

            tbody.addEventListener('click', (e) => {
                if (!utils.isElement(e.target)) return;
                
                const btn = e.target.closest('[data-action]');
                if (!btn) return;
                
                e.preventDefault();
                e.stopPropagation();
                
                const action = btn.dataset.action;
                
                switch(action) {
                    case 'review':
                        self.markAsReviewed(btn.dataset.logId);
                        break;
                    case 'blockDevice':
                        self.showBlockDeviceModal(
                            btn.dataset.deviceId,
                            btn.dataset.deviceName,
                            btn.dataset.username
                        );
                        break;
                    case 'blockIP':
                        self.showBlockIPModal(btn.dataset.ip, btn.dataset.username);
                        break;
                    case 'unblockDevice':
                        self.showUnblockDeviceModal(btn.dataset.deviceId, btn.dataset.deviceName);
                        break;
                    case 'unblockIP':
                        self.showUnblockIPModal(btn.dataset.ip);
                        break;
                    case 'viewHistory':
                        self.showUnblockHistory(btn.dataset.logId);
                        break;
                    case 'disableAdmin':
                        self.showDisableAdminModal(btn.dataset.username);
                        break;
                }
            });
        },

        // ========== BLOCK DEVICE ==========
        async blockDevice(deviceId, deviceName, reason, blockedBy) {
            const db = this.getDatabase();
            if (!db) return false;

            if (!this.hasPermission('canBlockDevices')) {
                if (window.showToast) {
                    window.showToast('Permission denied: Only Executive Administrators can block devices', 'error');
                }
                return false;
            }

            try {
                const blockedByInfo = blockedBy === 'system' ? {
                    id: 'system',
                    username: 'System',
                    role: 'system'
                } : {
                    id: this.currentAdmin?.id || 'unknown',
                    username: this.currentAdmin?.username || 'Unknown Admin',
                    role: this.currentAdmin?.role || 'admin'
                };

                await db.collection(this.config.COLLECTIONS.BLOCKED_DEVICES).add({
                    deviceId: deviceId,
                    deviceName: deviceName,
                    reason: reason,
                    blockedBy: blockedByInfo,
                    blockedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    isActive: true
                });

                const batch = db.batch();
                const logsSnapshot = await db.collection(this.config.COLLECTIONS.SECURITY_LOGS)
                    .where('deviceId', '==', deviceId)
                    .where('isBlocked', '==', false)
                    .get();

                logsSnapshot.forEach(doc => {
                    batch.update(doc.ref, {
                        isBlocked: true,
                        blockedBy: blockedByInfo,
                        blockedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });
                await batch.commit();

                console.log(`🚫 Device Blocked: ${deviceName} (${deviceId})`);

                if (window.showToast) {
                    window.showToast(`Device "${deviceName}" has been blocked`, 'success');
                }

                return true;
            } catch (error) {
                console.error('Failed to block device:', error);
                if (window.showToast) {
                    window.showToast('Failed to block device', 'error');
                }
                return false;
            }
        },

        // ========== UNBLOCK DEVICE ==========
        async unblockDevice(deviceId, reason) {
            const db = this.getDatabase();
            if (!db) return false;

            if (!this.hasPermission('canBlockDevices')) {
                if (window.showToast) {
                    window.showToast('Permission denied', 'error');
                }
                return false;
            }

            try {
                const unblockedByInfo = {
                    id: this.currentAdmin?.id || 'unknown',
                    username: this.currentAdmin?.username || 'Unknown Admin',
                    role: this.currentAdmin?.role || 'admin'
                };

                const blockedSnapshot = await db.collection(this.config.COLLECTIONS.BLOCKED_DEVICES)
                    .where('deviceId', '==', deviceId)
                    .where('isActive', '==', true)
                    .get();

                if (blockedSnapshot.empty) return false;

                const batch = db.batch();

                blockedSnapshot.forEach(doc => {
                    batch.update(doc.ref, {
                        isActive: false,
                        unblockReason: reason,
                        unblockedBy: unblockedByInfo,
                        unblockedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });

                const logsSnapshot = await db.collection(this.config.COLLECTIONS.SECURITY_LOGS)
                    .where('deviceId', '==', deviceId)
                    .where('isBlocked', '==', true)
                    .get();

                logsSnapshot.forEach(doc => {
                    batch.update(doc.ref, {
                        unblockedBy: unblockedByInfo,
                        unblockedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        unblockReason: reason
                    });
                });

                await batch.commit();

                if (window.showToast) {
                    window.showToast(`Device has been unblocked`, 'success');
                }

                return true;
            } catch (error) {
                console.error('Failed to unblock device:', error);
                return false;
            }
        },

        // ========== BLOCK IP ==========
        async blockIP(ipAddress, reason, blockedBy) {
            const db = this.getDatabase();
            if (!db) return false;

            if (!this.hasPermission('canBlockIPs')) {
                if (window.showToast) {
                    window.showToast('Permission denied', 'error');
                }
                return false;
            }

            try {
                const blockedByInfo = blockedBy === 'system' ? {
                    id: 'system',
                    username: 'System',
                    role: 'system'
                } : {
                    id: this.currentAdmin?.id || 'unknown',
                    username: this.currentAdmin?.username || 'Unknown Admin',
                    role: this.currentAdmin?.role || 'admin'
                };

                await db.collection(this.config.COLLECTIONS.BLOCKED_IPS).add({
                    ipAddress: ipAddress,
                    reason: reason,
                    blockedBy: blockedByInfo,
                    blockedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    isActive: true
                });

                const batch = db.batch();
                const logsSnapshot = await db.collection(this.config.COLLECTIONS.SECURITY_LOGS)
                    .where('ipAddress', '==', ipAddress)
                    .where('isBlocked', '==', false)
                    .get();

                logsSnapshot.forEach(doc => {
                    batch.update(doc.ref, {
                        isBlocked: true,
                        blockedBy: blockedByInfo,
                        blockedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });
                await batch.commit();

                if (window.showToast) {
                    window.showToast(`IP ${ipAddress} has been blocked`, 'success');
                }

                return true;
            } catch (error) {
                console.error('Failed to block IP:', error);
                return false;
            }
        },

        // ========== UNBLOCK IP ==========
        async unblockIP(ipAddress, reason) {
            const db = this.getDatabase();
            if (!db) return false;

            if (!this.hasPermission('canBlockIPs')) {
                if (window.showToast) {
                    window.showToast('Permission denied', 'error');
                }
                return false;
            }

            try {
                const unblockedByInfo = {
                    id: this.currentAdmin?.id || 'unknown',
                    username: this.currentAdmin?.username || 'Unknown Admin',
                    role: this.currentAdmin?.role || 'admin'
                };

                const snapshot = await db.collection(this.config.COLLECTIONS.BLOCKED_IPS)
                    .where('ipAddress', '==', ipAddress)
                    .where('isActive', '==', true)
                    .get();

                if (snapshot.empty) return false;

                const batch = db.batch();
                snapshot.forEach(doc => {
                    batch.update(doc.ref, {
                        isActive: false,
                        unblockReason: reason,
                        unblockedBy: unblockedByInfo,
                        unblockedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });

                const logsSnapshot = await db.collection(this.config.COLLECTIONS.SECURITY_LOGS)
                    .where('ipAddress', '==', ipAddress)
                    .where('isBlocked', '==', true)
                    .get();

                logsSnapshot.forEach(doc => {
                    batch.update(doc.ref, {
                        unblockedBy: unblockedByInfo,
                        unblockedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        unblockReason: reason
                    });
                });

                await batch.commit();

                if (window.showToast) {
                    window.showToast(`IP ${ipAddress} has been unblocked`, 'success');
                }

                return true;
            } catch (error) {
                console.error('Failed to unblock IP:', error);
                return false;
            }
        },

        // ========== PERMISSION CHECKS ==========
        hasPermission(permission) {
            this.getCurrentAdmin();
            if (!this.currentAdmin) return false;
            if (this.currentAdmin.role === 'executive') return true;

            const permissionMap = {
                'canBlockDevices': false,
                'canBlockIPs': false,
                'canDisableAdmins': false,
                'canViewSecurityLogs': true,
                'canReviewLogs': false
            };

            return permissionMap[permission] || false;
        },

        isExecutiveAdmin() {
            this.getCurrentAdmin();
            return this.currentAdmin?.role === 'executive';
        },

        // ========== MARK AS REVIEWED ==========
        async markAsReviewed(logId) {
            const db = this.getDatabase();
            if (!db) return false;

            try {
                await db.collection(this.config.COLLECTIONS.SECURITY_LOGS).doc(logId).update({
                    reviewed: true,
                    reviewedBy: {
                        id: this.currentAdmin?.id || 'unknown',
                        username: this.currentAdmin?.username || 'Unknown Admin',
                        role: this.currentAdmin?.role || 'admin'
                    },
                    reviewedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                if (window.showToast) {
                    window.showToast('Log marked as reviewed', 'success');
                }

                return true;
            } catch (error) {
                console.error('Failed to mark as reviewed:', error);
                return false;
            }
        },

        // ========== MODALS ==========
        showBlockDeviceModal(deviceId, deviceName, username) {
            const existing = document.getElementById('blockDeviceModal');
            if (existing) existing.remove();

            const modal = document.createElement('div');
            modal.id = 'blockDeviceModal';
            modal.className = 'modal active';
            modal.innerHTML = `
                <div class="modal-backdrop" onclick="SecurityTracker.closeModal('blockDeviceModal')"></div>
                <div class="modal-dialog modal-sm">
                    <div class="modal-header">
                        <h3 class="modal-title danger-title"><i class="fas fa-ban"></i> Block Device</h3>
                        <button class="icon-btn" onclick="SecurityTracker.closeModal('blockDeviceModal')"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert-danger">
                            <i class="fas fa-exclamation-triangle"></i>
                            <div>
                                <strong>Block this device?</strong>
                                <p><strong>Device:</strong> ${deviceName}</p>
                                <p><strong>User:</strong> ${username}</p>
                            </div>
                        </div>
                        <div class="form-group" style="margin-top: 16px;">
                            <label>Reason</label>
                            <textarea id="blockDeviceReason" rows="3" placeholder="Enter reason..." class="modern-input"></textarea>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-outline" onclick="SecurityTracker.closeModal('blockDeviceModal')">Cancel</button>
                        <button class="btn-danger" onclick="SecurityTracker.confirmBlockDevice('${deviceId}', '${deviceName}')">
                            <i class="fas fa-ban"></i> Block
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        },

        showUnblockDeviceModal(deviceId, deviceName) {
            const existing = document.getElementById('unblockDeviceModal');
            if (existing) existing.remove();

            const modal = document.createElement('div');
            modal.id = 'unblockDeviceModal';
            modal.className = 'modal active';
            modal.innerHTML = `
                <div class="modal-backdrop" onclick="SecurityTracker.closeModal('unblockDeviceModal')"></div>
                <div class="modal-dialog modal-sm">
                    <div class="modal-header">
                        <h3 class="modal-title"><i class="fas fa-unlock"></i> Unblock Device</h3>
                        <button class="icon-btn" onclick="SecurityTracker.closeModal('unblockDeviceModal')"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert-info">
                            <i class="fas fa-info-circle"></i>
                            <span>Unblock device: <strong>${deviceName}</strong></span>
                        </div>
                        <div class="form-group" style="margin-top: 16px;">
                            <label>Reason</label>
                            <textarea id="unblockDeviceReason" rows="3" placeholder="Enter reason..." class="modern-input"></textarea>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-outline" onclick="SecurityTracker.closeModal('unblockDeviceModal')">Cancel</button>
                        <button class="btn-primary" onclick="SecurityTracker.confirmUnblockDevice('${deviceId}')">
                            <i class="fas fa-unlock"></i> Unblock
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        },

        showBlockIPModal(ipAddress, username) {
            const existing = document.getElementById('blockIPModal');
            if (existing) existing.remove();

            const modal = document.createElement('div');
            modal.id = 'blockIPModal';
            modal.className = 'modal active';
            modal.innerHTML = `
                <div class="modal-backdrop" onclick="SecurityTracker.closeModal('blockIPModal')"></div>
                <div class="modal-dialog modal-sm">
                    <div class="modal-header">
                        <h3 class="modal-title danger-title"><i class="fas fa-ban"></i> Block IP</h3>
                        <button class="icon-btn" onclick="SecurityTracker.closeModal('blockIPModal')"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert-danger">
                            <i class="fas fa-exclamation-triangle"></i>
                            <div>
                                <strong>Block IP: ${ipAddress}</strong>
                                <p>User: ${username}</p>
                            </div>
                        </div>
                        <div class="form-group" style="margin-top: 16px;">
                            <label>Reason</label>
                            <textarea id="blockReason" rows="3" placeholder="Enter reason..." class="modern-input"></textarea>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-outline" onclick="SecurityTracker.closeModal('blockIPModal')">Cancel</button>
                        <button class="btn-danger" onclick="SecurityTracker.confirmBlockIP('${ipAddress}')">
                            <i class="fas fa-ban"></i> Block
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        },

        showUnblockIPModal(ipAddress) {
            const existing = document.getElementById('unblockIPModal');
            if (existing) existing.remove();

            const modal = document.createElement('div');
            modal.id = 'unblockIPModal';
            modal.className = 'modal active';
            modal.innerHTML = `
                <div class="modal-backdrop" onclick="SecurityTracker.closeModal('unblockIPModal')"></div>
                <div class="modal-dialog modal-sm">
                    <div class="modal-header">
                        <h3 class="modal-title"><i class="fas fa-unlock"></i> Unblock IP</h3>
                        <button class="icon-btn" onclick="SecurityTracker.closeModal('unblockIPModal')"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert-info">
                            <i class="fas fa-info-circle"></i>
                            <span>Unblock IP: <code>${ipAddress}</code></span>
                        </div>
                        <div class="form-group" style="margin-top: 16px;">
                            <label>Reason</label>
                            <textarea id="unblockReason" rows="3" placeholder="Enter reason..." class="modern-input"></textarea>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-outline" onclick="SecurityTracker.closeModal('unblockIPModal')">Cancel</button>
                        <button class="btn-primary" onclick="SecurityTracker.confirmUnblockIP('${ipAddress}')">
                            <i class="fas fa-unlock"></i> Unblock
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        },

        showDisableAdminModal(username) {
            const existing = document.getElementById('disableAdminModal');
            if (existing) existing.remove();

            const modal = document.createElement('div');
            modal.id = 'disableAdminModal';
            modal.className = 'modal active';
            modal.innerHTML = `
                <div class="modal-backdrop" onclick="SecurityTracker.closeModal('disableAdminModal')"></div>
                <div class="modal-dialog modal-sm">
                    <div class="modal-header">
                        <h3 class="modal-title danger-title"><i class="fas fa-user-slash"></i> Disable Admin</h3>
                        <button class="icon-btn" onclick="SecurityTracker.closeModal('disableAdminModal')"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert-danger">
                            <i class="fas fa-exclamation-triangle"></i>
                            <div>
                                <strong>Disable admin: ${username}</strong>
                                <p>Multiple lockouts detected.</p>
                            </div>
                        </div>
                        <div class="form-group" style="margin-top: 16px;">
                            <label>Reason</label>
                            <textarea id="disableReason" rows="3" placeholder="Enter reason..." class="modern-input"></textarea>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-outline" onclick="SecurityTracker.closeModal('disableAdminModal')">Cancel</button>
                        <button class="btn-danger" onclick="SecurityTracker.confirmDisableAdmin('${username}')">
                            <i class="fas fa-user-slash"></i> Disable
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        },

        showUnblockHistory(logId) {
            const log = this.allSecurityLogs?.find(l => l.id === logId);
            if (!log) return;
            
            const existing = document.getElementById('unblockHistoryModal');
            if (existing) existing.remove();

            const modal = document.createElement('div');
            modal.id = 'unblockHistoryModal';
            modal.className = 'modal active';
            modal.innerHTML = `
                <div class="modal-backdrop" onclick="SecurityTracker.closeModal('unblockHistoryModal')"></div>
                <div class="modal-dialog modal-sm">
                    <div class="modal-header">
                        <h3 class="modal-title"><i class="fas fa-history"></i> History</h3>
                        <button class="icon-btn" onclick="SecurityTracker.closeModal('unblockHistoryModal')"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body">
                        <div class="unblock-details">
                            <div class="detail-row"><span>User:</span> <strong>${log.username}</strong></div>
                            <div class="detail-row"><span>Unblocked:</span> ${this.formatTime(log.unblockedAt)} ${this.formatDate(log.unblockedAt)}</div>
                            <div class="detail-row"><span>By:</span> ${log.unblockedBy?.username || 'System'}</div>
                            <div class="detail-row"><span>Reason:</span> ${log.unblockReason || 'N/A'}</div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-outline" onclick="SecurityTracker.closeModal('unblockHistoryModal')">Close</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        },

        showResetSecurityModal() {
            if (!this.isExecutiveAdmin()) {
                if (window.showToast) window.showToast('Permission denied', 'error');
                return;
            }

            const existing = document.getElementById('resetSecurityModal');
            if (existing) existing.remove();

            const modal = document.createElement('div');
            modal.id = 'resetSecurityModal';
            modal.className = 'modal active';
            modal.innerHTML = `
                <div class="modal-backdrop" onclick="SecurityTracker.closeModal('resetSecurityModal')"></div>
                <div class="modal-dialog modal-md">
                    <div class="modal-header">
                        <h3 class="modal-title reset-title"><i class="fas fa-flask"></i> Reset Security Data</h3>
                        <button class="icon-btn" onclick="SecurityTracker.closeModal('resetSecurityModal')"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="modal-body">
                        <div class="reset-intro">
                            <div class="reset-intro-icon"><i class="fas fa-broom"></i></div>
                            <p>Clear security data for testing. Blocked users/devices will be able to access again.</p>
                        </div>
                        <div class="reset-options-container">
                            <label class="reset-checkbox-option">
                                <input type="checkbox" id="resetSecurityLogs" checked>
                                <span class="reset-checkbox-mark"></span>
                                <span class="reset-checkbox-content"><strong><i class="fas fa-file-alt"></i> Security Logs</strong></span>
                            </label>
                            <label class="reset-checkbox-option">
                                <input type="checkbox" id="resetBlockedDevices" checked>
                                <span class="reset-checkbox-mark"></span>
                                <span class="reset-checkbox-content"><strong><i class="fas fa-fingerprint"></i> Blocked Devices</strong></span>
                            </label>
                            <label class="reset-checkbox-option">
                                <input type="checkbox" id="resetBlockedIPs" checked>
                                <span class="reset-checkbox-mark"></span>
                                <span class="reset-checkbox-content"><strong><i class="fas fa-network-wired"></i> Blocked IPs</strong></span>
                            </label>
                            <label class="reset-checkbox-option">
                                <input type="checkbox" id="resetLockoutHistory" checked>
                                <span class="reset-checkbox-mark"></span>
                                <span class="reset-checkbox-content"><strong><i class="fas fa-history"></i> Lockout History</strong></span>
                            </label>
                        </div>
                        <div class="reset-warning-box">
                            <i class="fas fa-exclamation-triangle"></i>
                            <div><strong>Warning:</strong><p>This cannot be undone.</p></div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-outline" onclick="SecurityTracker.closeModal('resetSecurityModal')">Cancel</button>
                        <button class="btn-reset" id="confirmResetBtn" onclick="SecurityTracker.performSecurityReset()">
                            <i class="fas fa-sync-alt"></i> Reset
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        },

        async performSecurityReset() {
            const confirmBtn = document.getElementById('confirmResetBtn');
            if (confirmBtn) {
                confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Resetting...';
                confirmBtn.disabled = true;
            }

            console.log('🧹 Starting security data reset...');

            try {
                let total = 0;

                if (document.getElementById('resetSecurityLogs')?.checked) {
                    console.log('🗑️ Clearing security logs...');
                    const count = await this.clearCollection(this.config.COLLECTIONS.SECURITY_LOGS);
                    console.log(`✅ Cleared ${count} security logs`);
                    total += count;
                }

                if (document.getElementById('resetBlockedDevices')?.checked) {
                    console.log('🗑️ Clearing blocked devices...');
                    const count = await this.clearCollection(this.config.COLLECTIONS.BLOCKED_DEVICES);
                    console.log(`✅ Cleared ${count} blocked devices`);
                    total += count;
                    this.blockedDevicesCache.clear();
                }

                if (document.getElementById('resetBlockedIPs')?.checked) {
                    console.log('🗑️ Clearing blocked IPs...');
                    const count = await this.clearCollection(this.config.COLLECTIONS.BLOCKED_IPS);
                    console.log(`✅ Cleared ${count} blocked IPs`);
                    total += count;
                    this.blockedIPsCache.clear();
                }

                if (document.getElementById('resetLockoutHistory')?.checked) {
                    console.log('🗑️ Clearing lockout history...');
                    const count = await this.clearCollection(this.config.COLLECTIONS.LOCKOUT_HISTORY);
                    console.log(`✅ Cleared ${count} lockout history records`);
                    total += count;
                }

                console.log(`🎉 Security reset complete! Cleared ${total} total records`);

                if (window.showToast) window.showToast(`Cleared ${total} records`, 'success');

                setTimeout(() => this.closeModal('resetSecurityModal'), 1000);

            } catch (error) {
                console.error('❌ Reset failed:', error);
                if (window.showToast) window.showToast('Reset failed', 'error');
            }

            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Reset';
            }
        },

        async clearCollection(collectionName) {
            const db = this.getDatabase();
            if (!db) return 0;

            const snapshot = await db.collection(collectionName).get();
            if (snapshot.empty) return 0;

            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();

            return snapshot.size;
        },

        // ========== CONFIRM ACTIONS ==========
        async confirmBlockDevice(deviceId, deviceName) {
            const reason = document.getElementById('blockDeviceReason')?.value || 'Blocked by administrator';
            await this.blockDevice(deviceId, deviceName, reason);
            this.closeModal('blockDeviceModal');
        },

        async confirmUnblockDevice(deviceId) {
            const reason = document.getElementById('unblockDeviceReason')?.value || 'Unblocked by administrator';
            await this.unblockDevice(deviceId, reason);
            this.closeModal('unblockDeviceModal');
        },

        async confirmBlockIP(ipAddress) {
            const reason = document.getElementById('blockReason')?.value || 'Blocked by administrator';
            await this.blockIP(ipAddress, reason);
            this.closeModal('blockIPModal');
        },

        async confirmUnblockIP(ipAddress) {
            const reason = document.getElementById('unblockReason')?.value || 'Unblocked by administrator';
            await this.unblockIP(ipAddress, reason);
            this.closeModal('unblockIPModal');
        },

        async confirmDisableAdmin(username) {
            const db = this.getDatabase();
            if (!db) return;
            
            const reason = document.getElementById('disableReason')?.value || 'Disabled due to suspicious activity';
            
            const snapshot = await db.collection('admins').where('username', '==', username).limit(1).get();
            if (!snapshot.empty) {
                await db.collection('admins').doc(snapshot.docs[0].id).update({
                    isDisabled: true,
                    disabledReason: reason,
                    disabledAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                if (window.showToast) window.showToast(`Admin ${username} disabled`, 'success');
            }
            
            this.closeModal('disableAdminModal');
        },

        closeModal(modalId) {
            const modal = document.getElementById(modalId);
            if (modal) modal.remove();
        },

        // ========== EXPORT ==========
        async exportSecurityLogs() {
            const db = this.getDatabase();
            if (!db) return;

            if (window.showToast) window.showToast('Preparing export...', 'info');

            const snapshot = await db.collection(this.config.COLLECTIONS.SECURITY_LOGS)
                .orderBy('timestamp', 'desc')
                .limit(1000)
                .get();

            let csv = 'Timestamp,Severity,Username,DeviceID,IP,Status,Lockouts\n';
            snapshot.forEach(doc => {
                const d = doc.data();
                const time = d.timestamp?.toDate()?.toISOString() || '';
                csv += `"${time}","${d.severity || ''}","${d.username || ''}","${d.deviceShortId || ''}","${d.ipAddress || ''}","${d.reviewed ? 'Reviewed' : 'Pending'}","${d.calculatedLockouts || ''}"\n`;
            });

            const blob = new Blob([csv], { type: 'text/csv' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `security_logs_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();

            if (window.showToast) window.showToast(`Exported ${snapshot.size} logs`, 'success');
        },

        // ========== UTILITY FUNCTIONS ==========
        getSeverityClass(severity) {
            return {
                'info': 'severity-info',
                'warning': 'severity-warning',
                'suspicious': 'severity-suspicious',
                'critical': 'severity-critical'
            }[severity] || 'severity-info';
        },

        getSeverityIcon(severity) {
            return {
                'info': 'fa-info-circle',
                'warning': 'fa-exclamation-triangle',
                'suspicious': 'fa-user-secret',
                'critical': 'fa-skull-crossbones'
            }[severity] || 'fa-info-circle';
        },

        formatTime(timestamp) {
            if (!timestamp) return 'Unknown';
            const date = timestamp instanceof Date ? timestamp : 
                         timestamp.toDate ? timestamp.toDate() : 
                         new Date(timestamp);
            return date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        },

        formatDate(timestamp) {
            if (!timestamp) return '';
            const date = timestamp instanceof Date ? timestamp : 
                         timestamp.toDate ? timestamp.toDate() : 
                         new Date(timestamp);
            const now = new Date();
            
            if (date.toDateString() === now.toDateString()) return 'Today';
            
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
            
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        },

        formatDateShort(timestamp) {
            if (!timestamp) return '';
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);
            
            if (diffMins < 1) return 'just now';
            if (diffMins < 60) return `${diffMins}m ago`;
            if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
            return `${Math.floor(diffMins / 1440)}d ago`;
        },

        // ========== CLEANUP ==========
        destroy() {
            if (this.securityLogListener) this.securityLogListener();
            if (this.blockedDevicesListener) this.blockedDevicesListener();
            if (this.blockedIPsListener) this.blockedIPsListener();
            if (this.statsListener) this.statsListener();
            
            this.blockedDevicesCache.clear();
            this.blockedIPsCache.clear();
            this.deviceLockoutCounts.clear();
            this.allSecurityLogs = [];
            
            SecurityWorker.terminate();
            
            this.initialized = false;
            console.log('🔒 Security Tracker: Destroyed');
        }
    };

    // ========== EXPORT GLOBALLY ==========
    window.SecurityTracker = SecurityTracker;

    console.log('🔒 Security Tracker Module Loaded (Fixed v2.2)');

})();