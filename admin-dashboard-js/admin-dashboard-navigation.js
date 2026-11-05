/* ==========================================
BREATHSAFE NAVIGATION SYSTEM - OPTIMIZED v2.1
High-Performance SPA Navigation
FIXED: 
- applyFilterAndRender error
- STATE.allUsers.filter error (Map vs Array)
- Proper SharedState integration
========================================== */

// ========== IMMEDIATE CRITICAL CSS ==========
(function() {
    const s = document.createElement('style');
    s.textContent = `
        [data-section]{display:none;opacity:0;transition:opacity .2s ease}
        [data-section].active{display:block;opacity:1}
        .nav-loading{pointer-events:none;opacity:.5}
        .breadcrumb-item{cursor:pointer;transition:color .15s}
    `;
    document.head.appendChild(s);
})();

// ========== MINIFIED CONFIG ==========
const SEC = {
    home: 'homepageContainer',
    read: 'readingsContainer',
    user: 'userManagementContainer',
    diag: 'diagramContainer',
    anal: 'analyticsContainer',
    monitor: 'userMonitoringContainer'
};

// ========== UTILITIES ==========
const $ = id => document.getElementById(id);
const raf = requestAnimationFrame.bind(window);
const rIC = window.requestIdleCallback || (fn => setTimeout(fn, 1));

// ========== SAFE ELEMENT CHECK ==========
function isElement(target) {
    return target && target.nodeType === 1 && typeof target.closest === 'function';
}

// ========== PERFORMANCE UTILITIES ==========
function debounce(fn, ms) {
    let t;
    return (...a) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...a), ms);
    };
}

function throttle(fn, ms) {
    let last = 0, pending;
    return (...a) => {
        const now = Date.now();
        if (now - last >= ms) {
            last = now;
            fn(...a);
        } else if (!pending) {
            pending = setTimeout(() => {
                last = Date.now();
                pending = null;
                fn(...a);
            }, ms - (now - last));
        }
    };
}

// ========== BATCHED DOM OPERATIONS ==========
const DOM = {
    queue: [],
    scheduled: false,
    
    add(fn) {
        this.queue.push(fn);
        if (!this.scheduled) {
            this.scheduled = true;
            raf(() => this.flush());
        }
    },
    
    flush() {
        const fns = this.queue.splice(0);
        fns.forEach(fn => fn());
        this.scheduled = false;
    }
};

// ========== WEB WORKER FOR HEAVY OPERATIONS ==========
const WorkerManager = {
    _worker: null,
    _callbacks: new Map(),
    _id: 0,
    
    init() {
        if (this._worker || typeof Worker === 'undefined') return;
        
        try {
            const code = `
                self.onmessage = function(e) {
                    const { id, type, data } = e.data;
                    
                    switch(type) {
                        case 'filterUsers':
                            const filtered = data.users.filter(u => 
                                u.status === data.status || data.status === 'all'
                            );
                            self.postMessage({ id, result: filtered });
                            break;
                            
                        case 'calculateStats':
                            const stats = {
                                total: data.length,
                                active: data.filter(u => u.status === 'active').length,
                                inactive: data.filter(u => u.status === 'inactive').length
                            };
                            self.postMessage({ id, result: stats });
                            break;
                    }
                };
            `;
            
            const blob = new Blob([code], { type: 'application/javascript' });
            this._worker = new Worker(URL.createObjectURL(blob));
            
            this._worker.onmessage = (e) => {
                const { id, result } = e.data;
                const cb = this._callbacks.get(id);
                if (cb) {
                    cb(result);
                    this._callbacks.delete(id);
                }
            };
            
            this._worker.onerror = (e) => {
                console.warn('Worker error:', e.message);
            };
        } catch (err) {
            console.warn('Worker init failed:', err);
        }
    },
    
    send(type, data) {
        if (!this._worker) {
            return Promise.resolve(null);
        }
        return new Promise(resolve => {
            const id = ++this._id;
            this._callbacks.set(id, resolve);
            this._worker.postMessage({ id, type, data });
        });
    }
};

// ========== NAVIGATION STATE ==========
const NavState = {
    current: null,
    history: [],
    loading: false,
    
    setCurrent(section) {
        if (this.current && this.current !== section) {
            this.history.push(this.current);
            if (this.history.length > 10) this.history.shift();
        }
        this.current = section;
    }
};

// ========== LAZY SECTION LOADER ==========
const SectionLoader = {
    _loaded: new Set(),
    
    preload(key) {
        if (!key || this._loaded.has(key)) return;
        this._loaded.add(key);
    },
    
    isLoaded(key) {
        return this._loaded.has(key);
    }
};

// ========== HIDE ALL CONTAINERS ==========
function hideAllContainers() {
    const containerIds = [
        'homepageContainer',
        'readingsContainer',
        'userManagementContainer',
        'diagramContainer',
        'analyticsContainer',
        'userMonitoringContainer',
        'dashboardContent',
        'usersContent',
        'userMonitoringContent',
        'sensorsContent',
        'analyticsContent',
        'activityContent',
        'securityContent',
        'settingsContent',
        'notificationsContent',
        'reportsContent',
        'logsContent'
    ];
    
    containerIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = 'none';
            el.classList.remove('active', 'show');
        }
    });
    
    Object.values(SEC).forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = 'none';
            el.classList.remove('active');
        }
    });
    
    document.querySelectorAll('.content-section, .dashboard-section, .tab-content, [data-section]').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active', 'show');
    });
}

// ========== HIDE ALL SECTIONS ==========
function hideAll() {
    DOM.add(() => {
        hideAllContainers();
    });
}

// ========== SHOW SECTION ==========
const showSection = throttle(function(key, breadcrumb) {
    const sectionId = SEC[key];
    if (!sectionId || NavState.loading) return;
    
    NavState.loading = true;
    NavState.setCurrent(key);
    
    hideAll();
    
    DOM.add(() => {
        const section = $(sectionId);
        if (section) {
            section.style.display = 'block';
            section.style.opacity = '0';
            
            raf(() => {
                section.style.transition = 'opacity 0.2s ease';
                section.style.opacity = '1';
                section.classList.add('active');
            });
        }
        NavState.loading = false;
    });
    
    updateBreadcrumb(breadcrumb || 'Dashboard');
    
}, 100);

// ========== HELPER: Get Users Array from STATE or SharedState ==========
function getUsersArray() {
    if (window.SharedState?.allUsers) {
        const users = window.SharedState.allUsers;
        if (users instanceof Map) {
            return Array.from(users.values());
        }
        if (Array.isArray(users)) {
            return users;
        }
    }
    
    if (window.STATE?.allUsers) {
        const users = window.STATE.allUsers;
        if (Array.isArray(users)) {
            return users;
        }
        if (users instanceof Map) {
            return Array.from(users.values());
        }
    }
    
    if (window.AdminCore?.allUsers) {
        const users = window.AdminCore.allUsers;
        if (Array.isArray(users)) {
            return users;
        }
        if (users instanceof Map) {
            return Array.from(users.values());
        }
    }
    
    return [];
}

// ========== SECTION-SPECIFIC INITIALIZERS ==========
const SectionInit = {
    home: debounce(function() {
        if (window.ActivityTracker?.initialized) {
            rIC(() => {
                try {
                    if (typeof window.ActivityTracker.scheduleRender === 'function') {
                        window.ActivityTracker.scheduleRender();
                    }
                } catch (e) {
                    console.warn('Activity render error:', e);
                }
            });
        }
    }, 100),
    
    read: debounce(function() {
        rIC(() => {
            try {
                if (window.rtdb && typeof listenToSensorData === 'function') {
                    listenToSensorData();
                }
                if (typeof initializeChart === 'function' && !window.sensorChart) {
                    initializeChart();
                }
            } catch (e) {
                console.warn('Sensor init error:', e);
            }
        });
    }, 100),
    
    user: debounce(function() {
        rIC(() => {
            try {
                const usersArray = getUsersArray();
                
                if (usersArray.length === 0 && typeof loadUsers === 'function') {
                    loadUsers();
                } else if (typeof renderUsers === 'function') {
                    renderUsers();
                }
                
                if (typeof updateStats === 'function') {
                    updateStats();
                }
            } catch (e) {
                console.warn('User init error:', e);
            }
        });
    }, 100),
    
    anal: debounce(function() {
        rIC(() => {
            try {
                if (window.Analytics?.init) {
                    window.Analytics.init();
                }
            } catch (e) {
                console.warn('Analytics init error:', e);
            }
        });
    }, 150),
    
    monitor: debounce(function() {
        rIC(() => {
            try {
                if (window.UserMonitoring) {
                    if (!window.UserMonitoring.initialized) {
                        window.UserMonitoring.init();
                    } else if (window.UserMonitoring.refreshAll) {
                        window.UserMonitoring.refreshAll();
                    }
                }
            } catch (e) {
                console.warn('User Monitoring init error:', e);
            }
        });
    }, 100)
};

// ========== NAVIGATION FUNCTIONS ==========
function showHomepage() {
    showSection('home', 'Dashboard');
    SectionInit.home();
}

function showReadings() {
    showSection('read', 'Real-Time Readings');
    SectionInit.read();
}

function showUserManagement() {
    showSection('user', 'User Management');
    SectionInit.user();
}

function showDiagram() {
    showSection('diag', 'System Diagram');
}

function showAnalytics() {
    showSection('anal', 'Analytics');
    SectionInit.anal();
}

// ========== IMPROVED showUserMonitoring ==========
async function showUserMonitoring(event) {
    if (event && event.target) {
        const isFromSelect = event.target.closest('select') || 
                           event.target.closest('.activity-filter-wrapper');
        if (isFromSelect) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
    }
    
    console.log('📊 Opening User Monitoring...');
    
    hideAllContainers();
    
    const container = document.getElementById('userMonitoringContainer');
    if (container) {
        container.style.display = 'block';
        container.classList.add('active');
        container.style.opacity = '0';
        requestAnimationFrame(() => {
            container.style.transition = 'opacity 0.3s ease';
            container.style.opacity = '1';
        });
    }
    
    updateBreadcrumb('User Setup and Monitoring');
    NavState.setCurrent('monitor');
    
    // ⭐ CRITICAL: Initialize UserMonitoring with proper await
    if (window.UserMonitoring) {
        try {
            console.log('🔄 Initializing UserMonitoring...');
            const success = await window.UserMonitoring.init();
            
            if (success) {
                console.log('✅ UserMonitoring initialized successfully');
            } else {
                console.error('❌ UserMonitoring initialization failed');
            }
        } catch (e) {
            console.error('❌ UserMonitoring init error:', e);
        }
    } else {
        console.error('❌ UserMonitoring not available');
    }
}

// ========== BREADCRUMB ==========
const updateBreadcrumb = debounce(function(section, icon) {
    const bc = $('breadcrumb');
    if (!bc) return;
    
    const iconClass = icon || 'fa-home';
    
    DOM.add(() => {
        if (section === 'Dashboard') {
            bc.innerHTML = `<span class="breadcrumb-item active" data-nav="home"><i class="fas fa-home"></i> Dashboard</span>`;
        } else {
            bc.innerHTML = `
                <span class="breadcrumb-item" data-nav="home"><i class="fas fa-home"></i> Dashboard</span>
                <i class="fas fa-chevron-right" style="color:var(--muted);font-size:.7rem;margin:0 8px"></i>
                <span class="breadcrumb-item active"><i class="fas ${iconClass}"></i> ${section}</span>
            `;
        }
    });
}, 50);

// ========== DASHBOARD CARDS ==========
const updateDashboardCards = debounce(async function() {
    const usersArray = getUsersArray();
    
    if (usersArray.length === 0) return;
    
    let stats;
    
    if (usersArray.length > 100 && WorkerManager._worker) {
        stats = await WorkerManager.send('calculateStats', usersArray);
    }
    
    if (!stats) {
        stats = {
            total: usersArray.length,
            active: usersArray.filter(u => u.status === 'active').length
        };
    }
    
    DOM.add(() => {
        const cardTotal = $('cardUserCount');
        const cardActive = $('cardActiveUsers');
        const quickTotal = $('quickTotalUsers');
        
        if (cardTotal) cardTotal.textContent = stats.total;
        if (cardActive) cardActive.textContent = stats.active;
        if (quickTotal) quickTotal.textContent = stats.total;
    });
}, 200);

// ========== SAFE EVENT DELEGATION ==========
function setupNavigation() {
    document.addEventListener('click', (e) => {
        if (!isElement(e.target)) return;
        
        const navItem = e.target.closest('[data-nav]');
        if (!navItem) return;
        
        e.preventDefault();
        const target = navItem.dataset.nav;
        
        const handlers = {
            home: showHomepage,
            read: showReadings,
            user: showUserManagement,
            diag: showDiagram,
            anal: showAnalytics,
            monitor: showUserMonitoring
        };
        
        if (handlers[target]) {
            handlers[target]();
        }
    }, { passive: false });
    
    document.addEventListener('mouseenter', (e) => {
        if (!isElement(e.target)) return;
        
        const navItem = e.target.closest('[data-nav]');
        if (navItem && navItem.dataset.nav) {
            SectionLoader.preload(navItem.dataset.nav);
        }
    }, { capture: true, passive: true });
}

// ========== KEYBOARD NAVIGATION ==========
const handleKeyNav = throttle(function(e) {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    
    const keyMap = {
        '1': showHomepage,
        '2': showReadings,
        '3': showUserManagement,
        '4': showDiagram,
        '5': showAnalytics,
        '6': showUserMonitoring,
        'Backspace': () => {
            if (NavState.history.length > 0) {
                const prev = NavState.history.pop();
                const handlers = { 
                    home: showHomepage, 
                    read: showReadings, 
                    user: showUserManagement, 
                    diag: showDiagram, 
                    anal: showAnalytics,
                    monitor: showUserMonitoring
                };
                if (handlers[prev]) handlers[prev]();
            }
        }
    };
    
    if (keyMap[e.key]) {
        e.preventDefault();
        keyMap[e.key]();
    }
}, 150);

// ========== INITIALIZATION ==========
function initNavigation() {
    console.log('🧭 Navigation: Initializing...');
    
    try {
        rIC(() => WorkerManager.init());
        setupNavigation();
        document.addEventListener('keydown', handleKeyNav, { passive: false });
        
        raf(() => {
            showHomepage();
            rIC(() => updateDashboardCards());
        });
        
        console.log('✅ Navigation: Ready');
    } catch (err) {
        console.error('❌ Navigation init error:', err);
    }
}

// ========== FAST INITIALIZATION ==========
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavigation, { once: true });
} else {
    queueMicrotask(initNavigation);
}

// ========== EXPORTS ==========
window.hideAllContainers = hideAllContainers;
window.showHomepage = showHomepage;
window.showReadings = showReadings;
window.showUserManagement = showUserManagement;
window.showDiagram = showDiagram;
window.showAnalytics = showAnalytics;
window.showUserMonitoring = showUserMonitoring;
window.initNavigation = initNavigation;
window.updateDashboardCards = updateDashboardCards;
window.NavState = NavState;
window.getUsersArray = getUsersArray;

console.log('🧭 Navigation Module Loaded (Optimized v2.1)');