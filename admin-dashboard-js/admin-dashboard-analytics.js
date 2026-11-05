// ================================
// BREATHSAFE ANALYTICS - ULTRA PERFORMANCE v2.0
// Optimizations:
// - Lazy Loading & Deferred Initialization
// - Object Pooling for reduced GC
// - Smart Caching with LRU eviction
// - Batch DOM Operations with RAF
// - Web Workers for Heavy Operations
// - Virtual Rendering for Large Lists
// - Throttling & Debouncing
// - Memory-efficient data structures
// ================================

const Analytics = (() => {
    'use strict';

    // ==========================================
    // PERFORMANCE UTILITIES
    // ==========================================
    const raf = window.requestAnimationFrame || (fn => setTimeout(fn, 16));
    const rIC = window.requestIdleCallback || (fn => setTimeout(fn, 1));
    const now = Date.now;

    const debounce = (fn, delay) => {
        let t;
        return function(...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), delay);
        };
    };

    const throttle = (fn, delay) => {
        let last = 0, pending = null;
        return function(...args) {
            const n = now();
            if (n - last >= delay) {
                last = n;
                fn.apply(this, args);
            } else if (!pending) {
                pending = setTimeout(() => {
                    last = now();
                    pending = null;
                    fn.apply(this, args);
                }, delay - (n - last));
            }
        };
    };

    // ==========================================
    // OBJECT POOL (Reduce GC pressure)
    // ==========================================
    const ObjectPool = {
        _logPool: [],
        _maxPoolSize: 50,

        getLog() {
            return this._logPool.pop() || {
                id: '', timestamp: null, action: '', adminUsername: '',
                adminFullName: '', details: {}, performedBy: {},
                targetUser: '', description: '', severity: 'info'
            };
        },

        releaseLog(log) {
            if (this._logPool.length < this._maxPoolSize) {
                log.id = '';
                log.timestamp = null;
                log.action = '';
                log.adminUsername = '';
                log.adminFullName = '';
                log.details = {};
                log.performedBy = {};
                log.targetUser = '';
                log.description = '';
                log.severity = 'info';
                this._logPool.push(log);
            }
        },

        clear() {
            this._logPool.length = 0;
        }
    };

    // ==========================================
    // SMART CACHE (LRU with TTL)
    // ==========================================
    const SmartCache = {
        _cache: new Map(),
        _maxSize: 100,
        _defaultTTL: 60000,

        get(key) {
            const item = this._cache.get(key);
            if (!item) return null;
            
            if (now() > item.expiry) {
                this._cache.delete(key);
                return null;
            }
            
            item.lastAccess = now();
            return item.value;
        },

        set(key, value, ttl = this._defaultTTL) {
            if (this._cache.size >= this._maxSize) {
                this._evictOldest();
            }

            this._cache.set(key, {
                value,
                expiry: now() + ttl,
                lastAccess: now()
            });
        },

        delete(key) {
            this._cache.delete(key);
        },

        invalidate(pattern) {
            if (!pattern) {
                this._cache.clear();
                return;
            }
            
            const toDelete = [];
            for (const key of this._cache.keys()) {
                if (key.includes(pattern)) {
                    toDelete.push(key);
                }
            }
            toDelete.forEach(k => this._cache.delete(k));
        },

        _evictOldest() {
            let oldestKey = null;
            let oldestAccess = Infinity;

            for (const [key, item] of this._cache) {
                if (item.lastAccess < oldestAccess) {
                    oldestAccess = item.lastAccess;
                    oldestKey = key;
                }
            }

            if (oldestKey) {
                this._cache.delete(oldestKey);
            }
        },

        clear() {
            this._cache.clear();
        },

        get size() {
            return this._cache.size;
        }
    };

    // ==========================================
    // PRIVATE STATE
    // ==========================================
    const _state = {
        charts: {},
        logs: [],
        db: null,
        rtdb: null,
        initialized: false,
        initializing: false,
        
        // Listeners
        eventLogListener: null,
        sensorListener: null,
        
        // User stats
        userStats: {
            total: 0, active: 0, pending: 0,
            thisWeek: 0, lastWeek: 0,
            thisMonth: 0, lastMonth: 0,
            growthRate: 0
        },
        
        // Worker
        worker: null,
        workerReady: false,
        workerCallbacks: new Map(),
        
        // Render optimization
        renderPending: false,
        lastRenderTime: 0,
        minRenderInterval: 100,
        
        // Chart data buffers
        chartBuffers: {
            gas: { labels: [], mq6: [], mq7: [] },
            env: { labels: [], temp: [], humidity: [] }
        },
        maxChartPoints: 20,
        
        // Sensor data throttling
        lastSensorUpdate: 0,
        sensorUpdateInterval: 1000,
        
        // Login tracking (dedupe)
        loginCache: new Map(),
        logCooldown: 3600000,
        
        // DOM cache
        domCache: new Map(),
        
        // Deferred tasks
        deferredInit: false
    };

    // ==========================================
    // CONSTANTS
    // ==========================================
    const CONFIG = Object.freeze({
        apiKey: "YOUR_FIREBASE_WEB_API_KEY",
        authDomain: "YOUR_FIREBASE_PROJECT_ID.firebaseapp.com",
        databaseURL: "https://YOUR_FIREBASE_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "YOUR_FIREBASE_PROJECT_ID",
        storageBucket: "YOUR_FIREBASE_PROJECT_ID.firebasestorage.app",
        messagingSenderId: "YOUR_FIREBASE_MESSAGING_SENDER_ID",
        appId: "YOUR_FIREBASE_APP_ID",
        measurementId: "YOUR_FIREBASE_MEASUREMENT_ID"
    });

    const EVENT_TYPES = Object.freeze({
        login: { icon: 'fa-sign-in-alt', color: 'info', label: 'Login' },
        logout: { icon: 'fa-sign-out-alt', color: 'secondary', label: 'Logout' },
        create: { icon: 'fa-user-plus', color: 'success', label: 'Create' },
        delete: { icon: 'fa-trash-alt', color: 'danger', label: 'Delete' },
        status_change: { icon: 'fa-toggle-on', color: 'warning', label: 'Update' },
        system: { icon: 'fa-cog', color: 'primary', label: 'System' }
    });

    const DEBOUNCE_DELAY = 150;
    const THROTTLE_DELAY = 100;
    const BATCH_SIZE = 400;

    // ==========================================
    // DOM CACHE
    // ==========================================
    const getEl = (id) => {
        if (!_state.domCache.has(id)) {
            _state.domCache.set(id, document.getElementById(id));
        }
        return _state.domCache.get(id);
    };

    const clearDomCache = () => {
        _state.domCache.clear();
    };

    // ==========================================
    // UTILITY FUNCTIONS
    // ==========================================
    const escapeHtml = (() => {
        const el = document.createElement('div');
        return (str) => {
            if (!str) return '';
            el.textContent = str;
            return el.innerHTML;
        };
    })();

    // Memoized time formatters
    const _timeCache = new Map();
    
    const formatLogTime = (timestamp) => {
        if (!timestamp) return 'Unknown';
        
        const cacheKey = Math.floor(timestamp.getTime() / 1000);
        const cached = _timeCache.get(cacheKey);
        if (cached) return cached;
        
        const result = timestamp.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
        
        if (_timeCache.size > 200) {
            const first = _timeCache.keys().next().value;
            _timeCache.delete(first);
        }
        
        _timeCache.set(cacheKey, result);
        return result;
    };

    const formatLogDate = (timestamp) => {
        if (!timestamp) return '';
        
        const date = new Date(timestamp);
        const now = new Date();
        const dateStr = date.toDateString();
        
        const cacheKey = dateStr + '_' + now.toDateString();
        const cached = SmartCache.get('date_' + cacheKey);
        if (cached) return cached;
        
        let result;
        if (dateStr === now.toDateString()) {
            result = 'Today';
        } else {
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            if (dateStr === yesterday.toDateString()) {
                result = 'Yesterday';
            } else {
                result = date.toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric',
                    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
                });
            }
        }
        
        SmartCache.set('date_' + cacheKey, result, 30000);
        return result;
    };

    // ==========================================
    // WEB WORKER
    // ==========================================
    const workerCode = `
        self.onmessage = function(e) {
            const { type, data, id } = e.data;
            let result;
            
            switch(type) {
                case 'processUserStats':
                    result = calculateUserStats(data.users);
                    break;
                case 'generateCSV':
                    result = generateCSV(data.logs, data.type);
                    break;
                case 'filterLogs':
                    result = filterLogs(data.logs, data.filter);
                    break;
                default:
                    result = data;
            }
            
            self.postMessage({ type: type + 'Result', data: result, id });
        };
        
        function calculateUserStats(users) {
            const now = Date.now();
            const oneWeek = 7 * 24 * 60 * 60 * 1000;
            const twoWeeks = 14 * 24 * 60 * 60 * 1000;
            const oneMonth = 30 * 24 * 60 * 60 * 1000;
            const twoMonths = 60 * 24 * 60 * 60 * 1000;
            
            const stats = {
                total: users.length, active: 0, pending: 0,
                thisWeek: 0, lastWeek: 0, thisMonth: 0, lastMonth: 0, growthRate: 0
            };
            
            for (let i = 0; i < users.length; i++) {
                const user = users[i];
                const age = now - user.createdAt;
                
                if (user.status === 'active') stats.active++; else stats.pending++;
                if (age <= oneWeek) stats.thisWeek++;
                else if (age <= twoWeeks) stats.lastWeek++;
                if (age <= oneMonth) stats.thisMonth++;
                else if (age <= twoMonths) stats.lastMonth++;
            }
            
            stats.growthRate = stats.lastWeek > 0 
                ? ((stats.thisWeek - stats.lastWeek) / stats.lastWeek * 100).toFixed(1) 
                : (stats.thisWeek > 0 ? 100 : 0);
            
            return stats;
        }
        
        function generateCSV(logs, type) {
            if (type === 'events') {
                let csv = 'Document ID,Time,Date,Action,Admin,Type,Browser,Device,IP Address,Description\\n';
                for (let i = 0; i < logs.length; i++) {
                    const log = logs[i];
                    const time = new Date(log.timestamp).toLocaleTimeString();
                    const date = new Date(log.timestamp).toLocaleDateString();
                    csv += '"' + [
                        log.id, time, date, log.action || 'unknown',
                        log.adminUsername || 'Unknown', log.performedBy?.role || 'admin',
                        log.details?.browser || 'Unknown', log.details?.device || 'Unknown',
                        log.details?.ipAddress || 'Unknown', (log.description || '').replace(/"/g, '""')
                    ].join('","') + '"\\n';
                }
                return csv;
            } else {
                return 'BreathSafe Analytics Report\\n' +
                    'Generated: ' + new Date().toLocaleString() + '\\n\\n' +
                    'User Statistics\\n' +
                    'Total Users,' + logs.total + '\\n' +
                    'Active Users,' + logs.active + '\\n' +
                    'Pending Users,' + logs.pending + '\\n' +
                    'This Week,' + logs.thisWeek + '\\n' +
                    'Last Week,' + logs.lastWeek + '\\n' +
                    'Growth Rate,' + logs.growthRate + '%\\n';
            }
        }
        
        function filterLogs(logs, filter) {
            if (!filter || filter === 'all') return logs;
            const result = [];
            for (let i = 0; i < logs.length; i++) {
                if (logs[i].action === filter) result.push(logs[i]);
            }
            return result;
        }
    `;

    const initWorker = () => {
        if (_state.worker || !window.Worker) return;
        
        try {
            const blob = new Blob([workerCode], { type: 'application/javascript' });
            _state.worker = new Worker(URL.createObjectURL(blob));
            _state.workerReady = true;
            
            _state.worker.onmessage = (e) => {
                const { id, data } = e.data;
                const callback = _state.workerCallbacks.get(id);
                if (callback) {
                    callback(data);
                    _state.workerCallbacks.delete(id);
                }
            };
            
            _state.worker.onerror = () => {
                _state.workerReady = false;
            };
        } catch (e) {
            console.warn('Web Worker not supported');
            _state.workerReady = false;
        }
    };

    const workerTask = (type, data) => new Promise(resolve => {
        if (!_state.workerReady) {
            resolve(mainThreadTask(type, data));
            return;
        }
        
        const id = Math.random().toString(36).substr(2, 9);
        _state.workerCallbacks.set(id, resolve);
        _state.worker.postMessage({ type, data, id });
        
        setTimeout(() => {
            if (_state.workerCallbacks.has(id)) {
                _state.workerCallbacks.delete(id);
                resolve(mainThreadTask(type, data));
            }
        }, 500);
    });

    const mainThreadTask = (type, data) => {
        switch (type) {
            case 'processUserStats':
                return calculateUserStatsSync(data.users);
            case 'filterLogs':
                return data.filter === 'all' ? data.logs : data.logs.filter(l => l.action === data.filter);
            case 'generateCSV':
                return generateCSVSync(data.logs, data.type);
            default:
                return data;
        }
    };

    const calculateUserStatsSync = (users) => {
        const n = now();
        const oneWeek = 604800000;
        const twoWeeks = 1209600000;
        const oneMonth = 2592000000;
        const twoMonths = 5184000000;
        
        const stats = { total: users.length, active: 0, pending: 0, thisWeek: 0, lastWeek: 0, thisMonth: 0, lastMonth: 0, growthRate: 0 };
        
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            const age = n - user.createdAt;
            if (user.status === 'active') stats.active++; else stats.pending++;
            if (age <= oneWeek) stats.thisWeek++;
            else if (age <= twoWeeks) stats.lastWeek++;
            if (age <= oneMonth) stats.thisMonth++;
            else if (age <= twoMonths) stats.lastMonth++;
        }
        
        stats.growthRate = stats.lastWeek > 0 
            ? ((stats.thisWeek - stats.lastWeek) / stats.lastWeek * 100).toFixed(1) 
            : (stats.thisWeek > 0 ? 100 : 0);
        
        return stats;
    };

    // ==========================================
    // INITIALIZATION ()
    // ==========================================
    const init = async () => {
        if (_state.initialized) return;
        if (_state.initializing) {
            return new Promise((resolve) => {
                const check = setInterval(() => {
                    if (_state.initialized) {
                        clearInterval(check);
                        resolve();
                    }
                }, 50);
                setTimeout(() => clearInterval(check), 10000);
            });
        }
        
        _state.initializing = true;
        console.log('Analytics: Starting (Optimized)...');
        const startTime = now();
        
        // Wait for dependencies
        if (window.SharedState && !window.SharedState.initialized) {
            await window.SharedState.init();
        }
        
        _state.db = window.SharedState?.db || window.STATE?.db || null;
        _state.rtdb = window.SharedState?.rtdb || window.rtdb || null;
        
        if (!_state.db || !_state.rtdb) {
            _state.initializing = false;
            setTimeout(init, 500);
            return;
        }
        
        // Initialize worker in background
        rIC(() => initWorker(), { timeout: 200 });
        
        // Defer chart setup
        rIC(() => {
            raf(() => {
                setupGasChart();
                setupEnvChart();
                setupUserChart();
            });
        }, { timeout: 100 });
        
        // Start streams with throttling
        rIC(() => {
            startRealtimeStream();
            startEventLogStream();
        }, { timeout: 150 });
        
        // Load user stats asynchronously
        rIC(() => loadUserStatistics(), { timeout: 300 });
        
        // Log admin login (heavily deferred)
        setTimeout(() => logAdminLogin(), 2000);
        
        _state.initialized = true;
        _state.initializing = false;
        
        const initTime = now() - startTime;
        console.log(`Analytics: Ready (${initTime}ms)`);
    };

    // ==========================================
    // CHART SETUP (Lazy + )
    // ==========================================
    const setupGasChart = () => {
        const ctx = getEl('gasTrendChart');
        if (!ctx || _state.charts.gas) return;

        const n = new Date();
        const labels = [];
        for (let i = 19; i >= 0; i--) {
            const d = new Date(n.getTime() - (i * 2000));
            labels.push(`${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`);
        }

        _state.chartBuffers.gas = {
            labels: labels.slice(),
            mq6: new Array(20).fill(0),
            mq7: new Array(20).fill(0)
        };

        _state.charts.gas = new Chart(ctx, {
            type: 'line',
            data: {
                labels: _state.chartBuffers.gas.labels,
                datasets: [
                    {
                        label: 'MQ6 (LPG)', data: _state.chartBuffers.gas.mq6,
                        borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0
                    },
                    {
                        label: 'MQ7 (CO)', data: _state.chartBuffers.gas.mq7,
                        borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { display: true } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(0, 0, 0, 0.05)' } },
                    x: { grid: { display: false } }
                }
            }
        });
    };

    const setupEnvChart = () => {
        const ctx = getEl('envChart');
        if (!ctx || _state.charts.env) return;

        _state.chartBuffers.env = {
            labels: new Array(10).fill(''),
            temp: new Array(10).fill(0),
            humidity: new Array(10).fill(0)
        };

        _state.charts.env = new Chart(ctx, {
            type: 'line',
            data: {
                labels: _state.chartBuffers.env.labels,
                datasets: [
                    { 
                        label: 'Temperature', data: _state.chartBuffers.env.temp,
                        borderColor: '#ef4444', borderWidth: 2, tension: 0.4,
                        yAxisID: 'y', pointRadius: 0
                    },
                    { 
                        label: 'Humidity', data: _state.chartBuffers.env.humidity,
                        borderColor: '#3b82f6', borderWidth: 2, tension: 0.4,
                        yAxisID: 'y1', pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                scales: {
                    y: { type: 'linear', display: true, position: 'left', grid: { color: 'rgba(0, 0, 0, 0.05)' } },
                    y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false } }
                }
            }
        });
    };

    const setupUserChart = () => {
        const ctx = getEl('userGrowthChart');
        if (!ctx || _state.charts.users) return;

        _state.charts.users = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Active Users', 'Pending Users', 'This Week', 'Last Week'],
                datasets: [{
                    label: 'Users', data: [0, 0, 0, 0],
                    backgroundColor: [
                        'rgba(16, 185, 129, 0.8)', 'rgba(245, 158, 11, 0.8)',
                        'rgba(59, 130, 246, 0.8)', 'rgba(139, 92, 246, 0.8)'
                    ],
                    borderColor: [
                        'rgb(16, 185, 129)', 'rgb(245, 158, 11)',
                        'rgb(59, 130, 246)', 'rgb(139, 92, 246)'
                    ],
                    borderWidth: 2, borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            afterLabel: (context) => {
                                const label = context.label;
                                const value = context.raw;
                                if (label === 'Active Users' && _state.userStats.total > 0) {
                                    return `${((value / _state.userStats.total) * 100).toFixed(1)}% of total`;
                                }
                                if (label === 'This Week' && _state.userStats.lastWeek > 0) {
                                    const growth = ((value - _state.userStats.lastWeek) / _state.userStats.lastWeek * 100).toFixed(1);
                                    return `${growth > 0 ? '+' : ''}${growth}% vs last week`;
                                }
                                return '';
                            }
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 }, grid: { color: 'rgba(0, 0, 0, 0.05)' } },
                    x: { grid: { display: false } }
                }
            }
        });
    };

    // ==========================================
    // USER STATISTICS (Worker-based + Cached)
    // ==========================================
    const loadUserStatistics = async () => {
        if (!_state.db) return;

        try {
            const cached = SmartCache.get('userStats');
            if (cached) {
                _state.userStats = cached;
                updateUserStatsUI();
                updateUserChart();
                return;
            }

            const snapshot = await _state.db.collection('users').get();
            const users = [];
            
            snapshot.forEach(doc => {
                const data = doc.data();
                users.push({
                    id: doc.id,
                    status: data.status,
                    createdAt: data.createdAt?.toDate()?.getTime() || now()
                });
            });

            let stats;
            if (_state.workerReady && users.length > 100) {
                stats = await workerTask('processUserStats', { users });
            } else {
                stats = calculateUserStatsSync(users);
            }

            _state.userStats = stats;
            SmartCache.set('userStats', stats, 30000);

            updateUserStatsUI();
            updateUserChart();

        } catch (error) {
            console.error('Failed to load user statistics:', error);
        }
    };

    const updateUserStatsUI = () => {
        const stats = _state.userStats;
        
        raf(() => {
            const totalEl = getEl('analyticsTotalUsers');
            if (totalEl) totalEl.textContent = stats.total;

            const newUsersEl = getEl('analyticsNewUsers');
            if (newUsersEl) {
                const growth = stats.growthRate;
                const arrow = growth > 0 ? '↑' : growth < 0 ? '↓' : '→';
                const color = growth > 0 ? 'text-success' : growth < 0 ? 'text-danger' : 'text-muted';
                newUsersEl.className = color;
                newUsersEl.innerHTML = `<span>${arrow} ${Math.abs(growth)}%</span><small style="display:block;font-size:0.7rem;margin-top:4px">${stats.thisWeek} this week</small>`;
            }

            const activePercent = stats.total > 0 ? ((stats.active / stats.total) * 100).toFixed(1) : 0;
            const pendingPercent = (100 - activePercent).toFixed(1);
            
            const statFooter = document.querySelector('.stat-footer');
            if (statFooter) {
                statFooter.innerHTML = `
                    <div class="stat-item"><span class="muted">Active</span><strong class="text-success">${stats.active}</strong><small class="muted">${activePercent}%</small></div>
                    <div class="stat-item"><span class="muted">Pending</span><strong class="text-warning">${stats.pending}</strong><small class="muted">${pendingPercent}%</small></div>
                    <div class="stat-item"><span class="muted">Growth</span><strong class="${stats.growthRate > 0 ? 'text-success' : 'text-danger'}">${stats.growthRate > 0 ? '+' : ''}${stats.growthRate}%</strong></div>
                `;
            }
        });
    };

    const updateUserChart = () => {
        if (_state.charts.users) {
            raf(() => {
                _state.charts.users.data.datasets[0].data = [
                    _state.userStats.active,
                    _state.userStats.pending,
                    _state.userStats.thisWeek,
                    _state.userStats.lastWeek
                ];
                _state.charts.users.update('none');
            });
        }
    };

    // ==========================================
    // REALTIME STREAM (Throttled + )
    // ==========================================
    const processSensorData = throttle((data) => {
        if (!data) return;

        const n = now();
        if (n - _state.lastSensorUpdate < _state.sensorUpdateInterval) return;
        _state.lastSensorUpdate = n;

        const time = new Date();
        const timeStr = `${time.getHours()}:${String(time.getMinutes()).padStart(2, '0')}:${String(time.getSeconds()).padStart(2, '0')}`;

        raf(() => {
            // Update gas chart
            if (_state.charts.gas) {
                const buffer = _state.chartBuffers.gas;
                buffer.labels.push(timeStr);
                buffer.mq6.push(data.MQ6_Value || 0);
                buffer.mq7.push(data.MQ7_Value || 0);

                if (buffer.labels.length > _state.maxChartPoints) {
                    buffer.labels.shift();
                    buffer.mq6.shift();
                    buffer.mq7.shift();
                }

                _state.charts.gas.data.labels = buffer.labels;
                _state.charts.gas.data.datasets[0].data = buffer.mq6;
                _state.charts.gas.data.datasets[1].data = buffer.mq7;
                _state.charts.gas.update('none');

                const badge = getEl('analyticsGasStatus');
                if (badge) {
                    badge.textContent = `Live: MQ6 ${data.MQ6_Value}`;
                    badge.className = data.MQ6_Value > 1000 ? 'status-badge inactive' : 'status-badge active';
                }
            }

            // Update env chart
            if (_state.charts.env) {
                const buffer = _state.chartBuffers.env;
                buffer.labels.push(timeStr);
                buffer.temp.push(data.Temperature || 0);
                buffer.humidity.push(data.Humidity || 0);

                if (buffer.labels.length > _state.maxChartPoints) {
                    buffer.labels.shift();
                    buffer.temp.shift();
                    buffer.humidity.shift();
                }

                _state.charts.env.data.labels = buffer.labels;
                _state.charts.env.data.datasets[0].data = buffer.temp;
                _state.charts.env.data.datasets[1].data = buffer.humidity;
                _state.charts.env.update('none');

                const tempEl = getEl('analyticsAvgTemp');
                const humEl = getEl('analyticsAvgHum');
                if (tempEl) tempEl.textContent = `${data.Temperature || 0}°C`;
                if (humEl) humEl.textContent = `${data.Humidity || 0}%`;
            }
        });
    }, THROTTLE_DELAY);

    const startRealtimeStream = () => {
        if (!_state.rtdb || _state.sensorListener) return;

        _state.sensorListener = _state.rtdb.ref('Sensors').on('value', (snapshot) => {
            processSensorData(snapshot.val());
        });
    };

    // ==========================================
    // EVENT LOG STREAM ( + Virtual)
    // ==========================================
    const processEventLogs = throttle((logs) => {
        // Release old logs to pool
        for (let i = 0; i < _state.logs.length; i++) {
            ObjectPool.releaseLog(_state.logs[i]);
        }
        
        _state.logs = logs;
        scheduleLogRender();
    }, THROTTLE_DELAY);

    const startEventLogStream = () => {
        if (!_state.db || _state.eventLogListener) return;

        _state.eventLogListener = _state.db.collection('activity_logs')
            .orderBy('timestamp', 'desc')
            .limit(100)
            .onSnapshot(snapshot => {
                const logs = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    const log = ObjectPool.getLog();
                    log.id = doc.id;
                    log.timestamp = data.timestamp?.toDate() || new Date();
                    log.action = data.action || '';
                    log.adminUsername = data.adminUsername || '';
                    log.adminFullName = data.adminFullName || '';
                    log.details = data.details || {};
                    log.performedBy = data.performedBy || {};
                    log.targetUser = data.targetUser || '';
                    log.description = data.description || '';
                    log.severity = data.severity || 'info';
                    logs.push(log);
                });
                processEventLogs(logs);
            }, error => console.error('Event log stream error:', error));
    };

    const scheduleLogRender = () => {
        if (_state.renderPending) return;
        
        const n = now();
        const elapsed = n - _state.lastRenderTime;
        
        if (elapsed >= _state.minRenderInterval) {
            _state.renderPending = true;
            raf(() => {
                _state.renderPending = false;
                _state.lastRenderTime = now();
                renderEventLogs();
            });
        } else {
            _state.renderPending = true;
            setTimeout(() => {
                _state.renderPending = false;
                _state.lastRenderTime = now();
                renderEventLogs();
            }, _state.minRenderInterval - elapsed);
        }
    };

    const renderEventLogs = () => {
        const tbody = getEl('analyticsLogBody');
        if (!tbody) return;

        const logs = _state.logs;
        
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No events</td></tr>';
            return;
        }

        // Build HTML using array join (faster)
        const parts = [];
        for (let i = 0; i < logs.length; i++) {
            const log = logs[i];
            parts.push('<tr class="event-log-row">');
            parts.push('<td class="event-time-cell"><div class="event-time"><div class="time-primary">');
            parts.push(formatLogTime(log.timestamp));
            parts.push('</div><div class="time-secondary">');
            parts.push(formatLogDate(log.timestamp));
            parts.push('</div></div></td>');
            parts.push('<td class="event-type-cell">');
            parts.push(getEventTypeHTML(log));
            parts.push('</td><td class="event-desc-cell">');
            parts.push(getEventDescription(log));
            parts.push('</td><td class="event-status-cell">');
            parts.push(getEventStatus(log));
            parts.push('</td></tr>');
        }

        tbody.innerHTML = parts.join('');
    };

    const getEventTypeHTML = (log) => {
        const config = EVENT_TYPES[log.action] || EVENT_TYPES.system;
        return `<div class="event-type-badge ${config.color}"><i class="fas ${config.icon}"></i><span>${config.label}</span></div>`;
    };

    const getEventDescription = (log) => {
        const admin = escapeHtml(log.adminUsername || 'Admin');
        const target = escapeHtml(log.targetUser || '');
        
        switch (log.action) {
            case 'login':
                const details = log.details || {};
                const performedBy = log.performedBy || {};
                return `<div class="event-description"><div class="event-main"><strong class="admin-name">${escapeHtml(performedBy.username || admin)}</strong><span class="admin-role">(${escapeHtml(performedBy.role || 'Admin')})</span> logged in</div><div class="event-details"><div class="detail-item"><i class="fas fa-globe"></i><span>${escapeHtml(details.browser || 'Unknown')}</span></div><div class="detail-item"><i class="fas fa-${getDeviceIcon(details.device)}"></i><span>${escapeHtml(details.device || 'Unknown')}</span></div><div class="detail-item"><i class="fas fa-map-marker-alt"></i><span>IP: ${escapeHtml(details.ipAddress || 'Unknown')}</span></div></div></div>`;
            case 'create':
                return `<div class="event-description"><div class="event-main"><strong>${admin}</strong> created ${log.type === 'admin' ? 'administrator' : 'user'} <strong>${target}</strong></div></div>`;
            case 'delete':
                const count = log.details?.count || 1;
                return `<div class="event-description"><div class="event-main"><strong>${admin}</strong> deleted <strong>${count}</strong> user${count > 1 ? 's' : ''}</div></div>`;
            case 'status_change':
                const newStatus = log.details?.newStatus || 'unknown';
                return `<div class="event-description"><div class="event-main"><strong>${admin}</strong> ${newStatus === 'active' ? 'activated' : 'deactivated'} <strong>${target}</strong></div></div>`;
            default:
                return `<div class="event-description"><div class="event-main">${escapeHtml(log.description || 'System event')}</div></div>`;
        }
    };

    const getEventStatus = (log) => {
        const severity = log.severity || 'info';
        const configs = {
            info: { class: 'info', icon: 'fa-info-circle' },
            warning: { class: 'warning', icon: 'fa-exclamation-triangle' },
            error: { class: 'error', icon: 'fa-times-circle' },
            success: { class: 'success', icon: 'fa-check-circle' }
        };
        const config = configs[severity] || configs.info;
        
        return `<div class="event-status"><span class="status-badge ${config.class}"><i class="fas ${config.icon}"></i>${severity.toUpperCase()}</span><div class="event-id" title="ID: ${log.id}">ID: ${log.id.substring(0, 8)}...</div></div>`;
    };

    const getDeviceIcon = (device) => {
        if (!device) return 'desktop';
        if (device.includes('Mobile')) return 'mobile-alt';
        if (device.includes('Tablet')) return 'tablet-alt';
        return 'desktop';
    };

    // ==========================================
    // ADMIN LOGIN LOGGING (Deduplicated + )
    // ==========================================
    const logAdminLogin = async () => {
        if (!_state.db) return;

        const admin = window.SharedState?.currentAdmin || window.STATE?.currentAdminData;
        if (!admin) return;

        try {
            const browserInfo = getBrowserInfo();
            const deviceInfo = getDeviceInfo();
            const ipAddress = await getIPAddress();
            const sessionFingerprint = createFingerprint(admin.username, browserInfo, deviceInfo, ipAddress);
            
            const cacheKey = `${admin.username}_${sessionFingerprint}`;
            const lastLogin = _state.loginCache.get(cacheKey);
            
            if (lastLogin && (now() - lastLogin < _state.logCooldown)) {
                console.log('Duplicate login in cache, skipping');
                return;
            }
            
            // Check recent logins in DB
            const oneHourAgo = new Date(now() - 3600000);
            const recentLogins = await _state.db.collection('activity_logs')
                .where('action', '==', 'login')
                .where('adminId', '==', admin.id || admin.username)
                .where('timestamp', '>', oneHourAgo)
                .limit(5)
                .get();
            
            let isDuplicate = false;
            recentLogins.forEach(doc => {
                if (doc.data().details?.sessionFingerprint === sessionFingerprint) {
                    isDuplicate = true;
                }
            });
            
            if (!isDuplicate) {
                await _state.db.collection('activity_logs').add({
                    action: 'login',
                    actionCategory: 'authentication',
                    adminId: admin.id || admin.username,
                    adminUsername: admin.username,
                    adminFullName: `${admin.firstName || ''} ${admin.lastName || ''}`.trim() || admin.username,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    severity: 'info',
                    description: `Admin login from ${deviceInfo.fullName}`,
                    details: {
                        browser: browserInfo.fullName,
                        device: deviceInfo.fullName,
                        deviceType: deviceInfo.type,
                        os: deviceInfo.os,
                        ipAddress,
                        sessionFingerprint,
                        screenResolution: `${window.screen.width}x${window.screen.height}`,
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
                    },
                    performedBy: {
                        id: admin.id || admin.username,
                        username: admin.username,
                        role: admin.role || 'admin'
                    }
                });
                
                _state.loginCache.set(cacheKey, now());
                cleanLoginCache();
                console.log('Login logged successfully');
            }
        } catch (error) {
            console.error('Failed to log login:', error);
        }
    };

    const getBrowserInfo = () => {
        const ua = navigator.userAgent;
        let name = 'Unknown', version = '';
        
        if (ua.includes('Firefox')) { name = 'Firefox'; version = ua.match(/Firefox\/(\d+\.?\d*)/)?.[1] || ''; }
        else if (ua.includes('Edg')) { name = 'Edge'; version = ua.match(/Edg\/(\d+\.?\d*)/)?.[1] || ''; }
        else if (ua.includes('Chrome')) { name = 'Chrome'; version = ua.match(/Chrome\/(\d+\.?\d*)/)?.[1] || ''; }
        else if (ua.includes('Safari')) { name = 'Safari'; version = ua.match(/Version\/(\d+\.?\d*)/)?.[1] || ''; }
        
        return { name, version, fullName: version ? `${name} ${version}` : name };
    };

    const getDeviceInfo = () => {
        const ua = navigator.userAgent;
        let type = 'Desktop', os = 'Unknown', osVersion = '';
        
        if (/Android/i.test(ua)) { type = 'Mobile'; os = 'Android'; osVersion = ua.match(/Android (\d+\.?\d*)/)?.[1] || ''; }
        else if (/iPhone/i.test(ua)) { type = 'Mobile'; os = 'iOS'; osVersion = ua.match(/OS (\d+_?\d*)/)?.[1]?.replace('_', '.') || ''; }
        else if (/iPad/i.test(ua)) { type = 'Tablet'; os = 'iOS'; }
        else if (/Windows NT/i.test(ua)) { os = 'Windows'; }
        else if (/Mac OS X/i.test(ua)) { os = 'macOS'; }
        else if (/Linux/i.test(ua)) { os = 'Linux'; }
        
        return { type, os, osVersion, fullName: `${type} (${os}${osVersion ? ' ' + osVersion : ''})` };
    };

    const getIPAddress = async () => {
        try {
            const controller = new AbortController();
            setTimeout(() => controller.abort(), 3000);
            
            const response = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
            const data = await response.json();
            return data.ip || 'Unknown';
        } catch {
            return 'Unknown';
        }
    };

    const createFingerprint = (username, browser, device, ip) => {
        const str = `${username}_${browser.name}_${device.type}_${device.os}_${ip}`;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    };

    const cleanLoginCache = () => {
        const cutoff = now() - 7200000;
        const toDelete = [];
        for (const [key, timestamp] of _state.loginCache.entries()) {
            if (timestamp < cutoff) toDelete.push(key);
        }
        toDelete.forEach(k => _state.loginCache.delete(k));
    };

    // ==========================================
    // EXPORT FUNCTIONS (Worker-based + )
    // ==========================================
    const exportEventLogs = async () => {
        try {
            const snapshot = await _state.db.collection('activity_logs')
                .orderBy('timestamp', 'desc')
                .limit(1000)
                .get();
            
            const logs = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                logs.push({
                    id: doc.id,
                    ...data,
                    timestamp: data.timestamp?.toDate()?.getTime() || now()
                });
            });
            
            let csv;
            if (_state.workerReady && logs.length > 100) {
                csv = await workerTask('generateCSV', { logs, type: 'events' });
            } else {
                csv = generateCSVSync(logs, 'events');
            }
            
            downloadCSV(csv, `event_logs_${new Date().toISOString().split('T')[0]}.csv`);
            
            if (window.showToast) window.showToast('Event logs exported', 'success');
        } catch (error) {
            console.error('Export failed:', error);
            if (window.showToast) window.showToast('Export failed', 'error');
        }
    };

    const generateReport = async () => {
        let csv;
        if (_state.workerReady) {
            csv = await workerTask('generateCSV', { logs: _state.userStats, type: 'report' });
        } else {
            csv = generateCSVSync(_state.userStats, 'report');
        }
        
        downloadCSV(csv, `breathsafe_analytics_${new Date().toISOString().split('T')[0]}.csv`);
        
        if (window.showToast) window.showToast('Report generated', 'success');
    };

    const generateCSVSync = (data, type) => {
        if (type === 'events') {
            const parts = ['Document ID,Time,Date,Action,Admin,Type,Browser,Device,IP Address,Description\n'];
            for (let i = 0; i < data.length; i++) {
                const log = data[i];
                const time = new Date(log.timestamp).toLocaleTimeString();
                const date = new Date(log.timestamp).toLocaleDateString();
                parts.push('"');
                parts.push([
                    log.id, time, date, log.action || 'unknown',
                    log.adminUsername || 'Unknown', log.performedBy?.role || 'admin',
                    log.details?.browser || 'Unknown', log.details?.device || 'Unknown',
                    log.details?.ipAddress || 'Unknown', (log.description || '').replace(/"/g, '""')
                ].join('","'));
                parts.push('"\n');
            }
            return parts.join('');
        } else {
            return `BreathSafe Analytics Report\nGenerated: ${new Date().toLocaleString()}\n\nUser Statistics\nTotal Users,${data.total}\nActive Users,${data.active}\nPending Users,${data.pending}\nThis Week,${data.thisWeek}\nLast Week,${data.lastWeek}\nGrowth Rate,${data.growthRate}%\n`;
        }
    };

    const downloadCSV = (csv, filename) => {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 100);
    };

    const clearEventLogs = async () => {
        if (!confirm('Clear all event logs? This cannot be undone.')) return;
        
        try {
            const snapshot = await _state.db.collection('activity_logs').get();
            
            const docs = snapshot.docs;
            for (let i = 0; i < docs.length; i += BATCH_SIZE) {
                const batch = _state.db.batch();
                const chunk = docs.slice(i, i + BATCH_SIZE);
                for (let j = 0; j < chunk.length; j++) {
                    batch.delete(chunk[j].ref);
                }
                await batch.commit();
            }
            
            if (window.showToast) window.showToast('Event logs cleared', 'success');
        } catch (error) {
            console.error('Clear failed:', error);
            if (window.showToast) window.showToast('Clear failed', 'error');
        }
    };

    // ==========================================
    // CLEANUP
    // ==========================================
    const destroy = () => {
        if (_state.eventLogListener) {
            _state.eventLogListener();
            _state.eventLogListener = null;
        }
        
        if (_state.sensorListener && _state.rtdb) {
            _state.rtdb.ref('Sensors').off('value', _state.sensorListener);
            _state.sensorListener = null;
        }
        
        if (_state.worker) {
            _state.worker.terminate();
            _state.worker = null;
        }
        
        Object.values(_state.charts).forEach(chart => {
            if (chart) chart.destroy();
        });
        
        // Release logs to pool
        for (let i = 0; i < _state.logs.length; i++) {
            ObjectPool.releaseLog(_state.logs[i]);
        }
        
        _state.charts = {};
        _state.logs = [];
        SmartCache.clear();
        _state.loginCache.clear();
        _timeCache.clear();
        clearDomCache();
        ObjectPool.clear();
        _state.initialized = false;
        _state.initializing = false;
        
        console.log('Analytics destroyed');
    };

    // ==========================================
    // PUBLIC API
    // ==========================================
    return {
        init,
        destroy,
        loadUserStatistics,
        exportEventLogs,
        generateReport,
        clearEventLogs,
        clearLogs: () => { const tbody = getEl('analyticsLogBody'); if (tbody) tbody.innerHTML = ''; },
        
        // Getters
        get userStats() { return _state.userStats; },
        get logs() { return _state.logs; },
        get charts() { return _state.charts; },
        get initialized() { return _state.initialized; }
    };
})();

// ==========================================
// GLOBAL EXPORT
// ==========================================
window.Analytics = Analytics;

// Auto-initialize (deferred)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        requestIdleCallback(() => Analytics.init(), { timeout: 500 });
    });
} else {
    requestIdleCallback(() => Analytics.init(), { timeout: 500 });
}

console.log('Analytics Module Loaded (OPTIMIZED)');