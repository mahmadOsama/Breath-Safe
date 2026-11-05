// ==========================================
// BREATHSAFE SHARED STATE MANAGER v3.1
// Dual Collection Support
// - activity_logs: Recent Activity (deletable)
// - system_activity_logs: Permanent System Log
// ==========================================

const SharedState = (() => {
    'use strict';

    // ==========================================
    // PERFORMANCE UTILITIES
    // ==========================================
    const raf = window.requestAnimationFrame || (fn => setTimeout(fn, 16));
    const rIC = window.requestIdleCallback || (fn => setTimeout(fn, 1));
    const now = Date.now;

    const debounce = (fn, ms) => {
        let t;
        return (...a) => {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(null, a), ms);
        };
    };

    const throttle = (fn, ms) => {
        let last = 0, pending = null;
        return (...a) => {
            const n = now();
            if (n - last >= ms) {
                last = n;
                fn.apply(null, a);
            } else if (!pending) {
                pending = setTimeout(() => {
                    last = now();
                    pending = null;
                    fn.apply(null, a);
                }, ms - (n - last));
            }
        };
    };

    // ==========================================
    // FIREBASE CONFIG
    // ==========================================
    const FIREBASE_CONFIG = Object.freeze({
        apiKey: "YOUR_FIREBASE_WEB_API_KEY",
        authDomain: "YOUR_FIREBASE_PROJECT_ID.firebaseapp.com",
        databaseURL: "https://YOUR_FIREBASE_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "YOUR_FIREBASE_PROJECT_ID",
        storageBucket: "YOUR_FIREBASE_PROJECT_ID.firebasestorage.app",
        messagingSenderId: "YOUR_FIREBASE_MESSAGING_SENDER_ID",
        appId: "YOUR_FIREBASE_APP_ID",
        measurementId: "YOUR_FIREBASE_MEASUREMENT_ID"
    });

    // ==========================================
    // OBJECT POOL
    // ==========================================
    const ObjectPool = {
        _userPool: [],
        _activityPool: [],
        _maxPoolSize: 100,

        getUser() {
            return this._userPool.pop() || {
                id: '', username: '', email: '', firstName: '', lastName: '',
                phoneNumber: '', status: 'pending', createdAt: null, activatedAt: null,
                assignedSensorTypes: [], apiToken: '', isAdmin: false, role: 'user',
                online: false, lastSeen: null, sessionStarted: null
            };
        },

        releaseUser(user) {
            if (this._userPool.length < this._maxPoolSize) {
                user.id = '';
                user.username = '';
                user.assignedSensorTypes = [];
                this._userPool.push(user);
            }
        },

        getActivity() {
            return this._activityPool.pop() || {
                id: '', timestamp: null, type: '', action: '',
                details: {}, targetUser: null, adminId: '',
                adminUsername: '', adminFullName: ''
            };
        },

        releaseActivity(activity) {
            if (this._activityPool.length < this._maxPoolSize) {
                activity.id = '';
                activity.details = {};
                this._activityPool.push(activity);
            }
        },

        clear() {
            this._userPool.length = 0;
            this._activityPool.length = 0;
        }
    };

    // ==========================================
    // SMART CACHE
    // ==========================================
    const SmartCache = {
        _cache: new Map(),
        _maxSize: 500,
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
            const keysToDelete = [];
            for (const key of this._cache.keys()) {
                if (key.includes(pattern)) keysToDelete.push(key);
            }
            keysToDelete.forEach(k => this._cache.delete(k));
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
            if (oldestKey) this._cache.delete(oldestKey);
        },

        clear() {
            this._cache.clear();
        },

        get size() {
            return this._cache.size;
        }
    };

    // ==========================================
    // STATE
    // ==========================================
    const _state = {
        db: null,
        rtdb: null,
        firebaseApp: null,
        firebaseReady: false,
        initialized: false,
        initializing: false,
        currentAdmin: null,
        _cachedAdminName: null,
        
        allUsers: new Map(),
        onlineUsers: new Map(),
        pendingUsers: new Map(),
        needsSensorUsers: new Map(),
        
        // Separate collections
        activities: [], // Recent Activity (activity_logs)
        systemActivities: [], // System Log (system_activity_logs) - NEVER DELETED
        filteredActivities: [],
        currentFilter: 'all',
        activityLimit: 200,
        
        unsubscribers: [],
        eventSubscribers: new Map(),
        listenersActive: false,
        
        recentLogs: new Map(),
        logCooldown: 2000,
        
        toastActive: false,
        _cachedToast: null,
        
        pendingEvents: [],
        eventFlushScheduled: false
    };

    // ==========================================
    // EVENT SYSTEM
    // ==========================================
    const flushEvents = () => {
        const events = _state.pendingEvents;
        _state.pendingEvents = [];
        _state.eventFlushScheduled = false;
        
        const grouped = new Map();
        for (let i = 0; i < events.length; i++) {
            const { name, data } = events[i];
            if (!grouped.has(name)) grouped.set(name, []);
            grouped.get(name).push(data);
        }
        
        for (const [name, dataArray] of grouped) {
            const subs = _state.eventSubscribers.get(name);
            if (subs && subs.length > 0) {
                const eventData = dataArray.length === 1 ? dataArray[0] : dataArray;
                for (let j = 0; j < subs.length; j++) {
                    try { subs[j](eventData); } catch (e) {}
                }
            }
        }
    };

    const events = {
        emit(eventName, data) {
            _state.pendingEvents.push({ name: eventName, data });
            if (!_state.eventFlushScheduled) {
                _state.eventFlushScheduled = true;
                raf(flushEvents);
            }
        },
        
        on(eventName, callback) {
            let subs = _state.eventSubscribers.get(eventName);
            if (!subs) {
                subs = [];
                _state.eventSubscribers.set(eventName, subs);
            }
            subs.push(callback);
            return () => {
                const idx = subs.indexOf(callback);
                if (idx > -1) subs.splice(idx, 1);
            };
        },
        
        off(eventName, callback) {
            if (!callback) {
                _state.eventSubscribers.delete(eventName);
            } else {
                const subs = _state.eventSubscribers.get(eventName);
                if (subs) {
                    const idx = subs.indexOf(callback);
                    if (idx > -1) subs.splice(idx, 1);
                }
            }
        },

        clear() {
            _state.eventSubscribers.clear();
            _state.pendingEvents = [];
            _state.eventFlushScheduled = false;
        }
    };

    // ==========================================
    // FIREBASE INIT
    // ==========================================
    const initFirebase = async () => {
        if (_state.firebaseReady) {
            return { db: _state.db, rtdb: _state.rtdb };
        }

        console.log('🔥 SharedState: Initializing Firebase...');

        if (typeof firebase === 'undefined') {
            throw new Error('Firebase SDK not loaded');
        }

        try {
            _state.firebaseApp = firebase.app();
        } catch (e) {
            _state.firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
        }

        _state.db = firebase.firestore(_state.firebaseApp);
        _state.rtdb = firebase.database(_state.firebaseApp);

        try {
            await _state.db.enablePersistence({ synchronizeTabs: true });
            console.log('✅ Firestore persistence enabled');
        } catch (err) {
            if (err.code !== 'failed-precondition') {
                console.warn('⚠️ Persistence warning:', err.code);
            }
        }

        _state.firebaseReady = true;
        window.db = _state.db;
        window.rtdb = _state.rtdb;

        console.log('✅ SharedState: Firebase ready');
        events.emit('firebase:ready', { db: _state.db, rtdb: _state.rtdb });

        return { db: _state.db, rtdb: _state.rtdb };
    };

    // ==========================================
    // ADMIN SESSION
    // ==========================================
    const loadAdminSession = () => {
        if (_state.currentAdmin) return _state.currentAdmin;

        const cacheKey = 'admin-session';
        const cached = SmartCache.get(cacheKey);
        if (cached) {
            _state.currentAdmin = cached;
            return cached;
        }

        try {
            const session = sessionStorage.getItem('breathsafeAdmin');
            if (session) {
                _state.currentAdmin = JSON.parse(session);
                SmartCache.set(cacheKey, _state.currentAdmin, 300000);
            } else {
                _state.currentAdmin = {
                    id: 'default_admin',
                    username: 'admin',
                    firstName: 'Admin',
                    lastName: 'User',
                    role: 'executive',
                    email: 'admin@breathsafe.com'
                };
                console.log('⚠️ Using fallback admin session');
            }
        } catch (e) {
            _state.currentAdmin = {
                id: 'default_admin',
                username: 'admin',
                role: 'executive'
            };
        }
        
        return _state.currentAdmin;
    };

    const getAdminFullName = () => {
        if (_state._cachedAdminName) return _state._cachedAdminName;
        if (!_state.currentAdmin) return 'Administrator';
        
        const first = _state.currentAdmin.firstName || '';
        const last = _state.currentAdmin.lastName || '';
        _state._cachedAdminName = `${first} ${last}`.trim() || _state.currentAdmin.username || 'Administrator';
        
        return _state._cachedAdminName;
    };

    // ==========================================
    // USER MANAGEMENT
    // ==========================================
    const categorizeUser = (user) => {
        if (!user || !user.id || user.isAdmin) return;

        const status = (user.status || 'pending').toLowerCase();
        const hasSensors = user.assignedSensorTypes && user.assignedSensorTypes.length > 0;
        const id = user.id;

        _state.pendingUsers.delete(id);
        _state.needsSensorUsers.delete(id);

        if (status === 'pending' || status === 'inactive') {
            _state.pendingUsers.set(id, user);
        } else if (status === 'active' && !hasSensors) {
            _state.needsSensorUsers.set(id, user);
        }
    };

    const updateUser = (userId, userData) => {
        let user = _state.allUsers.get(userId);
        
        if (!user) {
            user = ObjectPool.getUser();
            user.id = userId;
        }
        
        const keys = Object.keys(userData);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (key !== 'assignedSensorTypes') {
                user[key] = userData[key];
            }
        }
        
        if (userData.assignedSensorTypes) {
            user.assignedSensorTypes = userData.assignedSensorTypes.slice();
        } else if (!user.assignedSensorTypes) {
            user.assignedSensorTypes = [];
        }

        _state.allUsers.set(userId, user);
        
        if (!user.isAdmin) {
            categorizeUser(user);
        }

        if (_state.onlineUsers.has(userId)) {
            if (user.status === 'active') {
                const onlineUser = _state.onlineUsers.get(userId);
                Object.assign(onlineUser, user);
            } else {
                _state.onlineUsers.delete(userId);
            }
        }

        events.emit('user:updated', user);
        return user;
    };

    const removeUser = (userId) => {
        const user = _state.allUsers.get(userId);
        
        _state.allUsers.delete(userId);
        _state.pendingUsers.delete(userId);
        _state.needsSensorUsers.delete(userId);
        _state.onlineUsers.delete(userId);
        
        if (user) ObjectPool.releaseUser(user);
        
        events.emit('user:removed', userId);
    };

    const setUserOnlineStatus = (userId, isOnline, presenceData) => {
        const user = _state.allUsers.get(userId);
        if (!user || user.isAdmin) return;

        const n = now();
        user.online = isOnline;
        user.lastSeen = presenceData?.lastSeen || n;
        user.sessionStarted = presenceData?.sessionStarted || user.sessionStarted || n;

        if (isOnline && user.status === 'active') {
            let onlineUser = _state.onlineUsers.get(userId);
            if (!onlineUser) {
                onlineUser = {};
                _state.onlineUsers.set(userId, onlineUser);
            }
            Object.assign(onlineUser, user, { presenceData });
        } else {
            _state.onlineUsers.delete(userId);
        }

        events.emit('user:presence', { userId, isOnline, user });
    };

    // ==========================================
    // ACTIVITY MANAGEMENT (DUAL COLLECTION)
    // ==========================================
    const _activityIdSet = new Set();

    const addActivity = (activity) => {
        if (_activityIdSet.has(activity.id)) return false;
        
        _activityIdSet.add(activity.id);
        _state.activities.unshift(activity);
        
        if (_state.activities.length > _state.activityLimit) {
            const removed = _state.activities.pop();
            if (removed) {
                _activityIdSet.delete(removed.id);
                ObjectPool.releaseActivity(removed);
            }
        }
        
        SmartCache.delete('filtered-activities-' + _state.currentFilter);
        events.emit('activity:added', activity);
        return true;
    };

    const removeActivity = (activityId) => {
        if (!_activityIdSet.has(activityId)) return false;
        
        const len = _state.activities.length;
        for (let i = 0; i < len; i++) {
            if (_state.activities[i].id === activityId) {
                const removed = _state.activities.splice(i, 1)[0];
                _activityIdSet.delete(activityId);
                ObjectPool.releaseActivity(removed);
                
                SmartCache.delete('filtered-activities-' + _state.currentFilter);
                events.emit('activity:removed', activityId);
                return true;
            }
        }
        return false;
    };

    const clearActivities = (filter) => {
        // ONLY clears Recent Activity (activity_logs)
        // System Log (system_activity_logs) is NEVER touched
        if (filter && filter !== 'all') {
            const newActivities = [];
            for (let i = 0; i < _state.activities.length; i++) {
                const a = _state.activities[i];
                if (a.action !== filter) {
                    newActivities.push(a);
                } else {
                    _activityIdSet.delete(a.id);
                    ObjectPool.releaseActivity(a);
                }
            }
            _state.activities = newActivities;
        } else {
            for (let i = 0; i < _state.activities.length; i++) {
                _activityIdSet.delete(_state.activities[i].id);
                ObjectPool.releaseActivity(_state.activities[i]);
            }
            _state.activities = [];
        }
        
        SmartCache.invalidate('filtered-activities');
        events.emit('activities:cleared', filter);
    };

    const getFilteredActivities = () => {
        const cacheKey = 'filtered-activities-' + _state.currentFilter;
        const cached = SmartCache.get(cacheKey);
        if (cached) return cached;

        let result;
        if (_state.currentFilter === 'all') {
            result = _state.activities.slice();
        } else {
            result = [];
            for (let i = 0; i < _state.activities.length; i++) {
                if (_state.activities[i].action === _state.currentFilter) {
                    result.push(_state.activities[i]);
                }
            }
        }
        
        SmartCache.set(cacheKey, result, 5000);
        return result;
    };

    const setActivityFilter = (filter) => {
        _state.currentFilter = filter || 'all';
        _state.filteredActivities = getFilteredActivities();
        events.emit('activities:filtered', { filter, activities: _state.filteredActivities });
    };

    // ==========================================
    // ACTIVITY LOGGING (DUAL WRITE)
    // ==========================================
    const isDuplicateLog = (action, target) => {
        const key = `${action}-${target || ''}`;
        const time = now();
        const lastTime = _state.recentLogs.get(key);

        if (lastTime && time - lastTime < _state.logCooldown) {
            return true;
        }

        _state.recentLogs.set(key, time);

        if (_state.recentLogs.size > 50) {
            const cutoff = time - _state.logCooldown;
            for (const [k, v] of _state.recentLogs) {
                if (v < cutoff) _state.recentLogs.delete(k);
            }
        }

        return false;
    };

    const logActivity = async (action, target, details = {}) => {
        if (!_state.db || !_state.currentAdmin) {
            if (!_state.currentAdmin) loadAdminSession();
            if (!_state.currentAdmin) return null;
        }

        if (isDuplicateLog(action, target)) {
            console.log('⚠️ Duplicate log prevented:', action, target);
            return null;
        }

        console.log('📝 Logging activity:', action, target);

        const logData = {
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            type: details.type || 'admin',
            action,
            details,
            targetUser: target,
            adminId: _state.currentAdmin.id || _state.currentAdmin.username,
            adminUsername: _state.currentAdmin.username,
            adminFullName: getAdminFullName()
        };

        try {
            // Dual write
            // 1. Write to activity_logs (Recent Activity - deletable)
            const recentRef = await _state.db.collection('activity_logs').add(logData);
            
            // 2. Write to system_activity_logs (System Log - permanent)
            const systemRef = await _state.db.collection('system_activity_logs').add(logData);

            console.log(`✅ Activity logged: ${action} → ${target || 'N/A'}`);
            console.log(`   Recent ID: ${recentRef.id}, System ID: ${systemRef.id}`);
            
            return recentRef.id;
        } catch (error) {
            console.error('❌ Failed to log activity:', error);
            return null;
        }
    };

    // Convenience methods
    const logLogin = () => logActivity('login', null, { type: 'session' });
    const logLogout = () => logActivity('logout', null, { type: 'session' });
    const logCreate = (type, username) => logActivity('create', username, { type, userType: type === 'admin' ? 'administrator' : 'user' });
    const logDelete = (type, usernames, count) => {
        const arr = Array.isArray(usernames) ? usernames : [usernames];
        return logActivity('delete', count === 1 ? arr[0] : null, { usernames: arr, count: count || arr.length, type: 'user' });
    };
    const logStatusChange = (username, oldStatus, newStatus) => 
        logActivity('status_change', username, { oldStatus, newStatus, type: 'user' });
    const logUserApproved = (username, sensors) => 
        logActivity('user_approved', username, { sensors: sensors || [], type: 'user', action: 'approved' });
    const logUserReactivated = (username, sensors) => 
        logActivity('user_reactivated', username, { sensors: sensors || [], type: 'user', action: 'reactivated' });
    const logSensorAssign = (username, sensors) => 
        logActivity('sensor_assign', username, { sensors: sensors || [], type: 'sensor' });
    const logSensorModify = (username, oldSensors, newSensors) => 
        logActivity('sensor_modify', username, { oldSensors: oldSensors || [], sensors: newSensors || [], type: 'sensor' });
    const logSessionEnd = (username, reason) => 
        logActivity('session_end', username, { reason: reason || '', type: 'session' });

    // ==========================================
    // LOAD INITIAL DATA
    // ==========================================
    const loadInitialData = async () => {
        if (!_state.db) return;

        console.log('📥 SharedState: Loading initial data...');
        const startTime = now();

        try {
            _state.allUsers.clear();
            _state.pendingUsers.clear();
            _state.needsSensorUsers.clear();
            _state.activities = [];
            _activityIdSet.clear();
            SmartCache.clear();

            const [usersSnapshot, adminsSnapshot, activitiesSnapshot] = await Promise.all([
                _state.db.collection('users').get(),
                _state.db.collection('admins').get(),
                _state.db.collection('activity_logs')
                    .orderBy('timestamp', 'desc')
                    .limit(_state.activityLimit)
                    .get()
            ]);

            await processUsersSnapshot(usersSnapshot);
            await processAdminsSnapshot(adminsSnapshot);
            processActivitiesSnapshot(activitiesSnapshot);

            _state.filteredActivities = getFilteredActivities();

            const loadTime = now() - startTime;
            console.log(`📊 Loaded ${_state.allUsers.size} users/admins, ${_state.activities.length} activities in ${loadTime}ms`);
            console.log(`📊 Pending: ${_state.pendingUsers.size}, Need Sensors: ${_state.needsSensorUsers.size}`);

            events.emit('data:loaded');

        } catch (error) {
            console.error('❌ Failed to load initial data:', error);
            throw error;
        }
    };

    const processUsersSnapshot = (snapshot) => {
        return new Promise((resolve) => {
            const docs = snapshot.docs;
            let index = 0;
            const batchSize = 50;

            const processBatch = () => {
                const end = Math.min(index + batchSize, docs.length);
                
                for (; index < end; index++) {
                    const doc = docs[index];
                    const data = doc.data();
                    
                    const user = ObjectPool.getUser();
                    user.id = doc.id;
                    user.username = data.username || '';
                    user.email = data.email || '';
                    user.firstName = data.firstName || '';
                    user.lastName = data.lastName || '';
                    user.phoneNumber = data.phoneNumber || '';
                    user.status = data.status || 'pending';
                    user.createdAt = data.createdAt;
                    user.activatedAt = data.activatedAt;
                    user.assignedSensorTypes = data.assignedSensorTypes || [];
                    user.apiToken = data.apiToken || '';
                    user.isAdmin = false;
                    user.role = 'user';
                    user.online = false;
                    user.lastSeen = null;
                    
                    _state.allUsers.set(doc.id, user);
                    categorizeUser(user);
                }

                if (index < docs.length) {
                    rIC(processBatch, { timeout: 50 });
                } else {
                    resolve();
                }
            };

            if (docs.length > 0) {
                processBatch();
            } else {
                resolve();
            }
        });
    };

    const processAdminsSnapshot = (snapshot) => {
        return new Promise((resolve) => {
            const docs = snapshot.docs;
            
            for (let i = 0; i < docs.length; i++) {
                const doc = docs[i];
                const data = doc.data();
                
                const admin = ObjectPool.getUser();
                admin.id = doc.id;
                admin.username = data.username || doc.id;
                admin.email = data.email || '';
                admin.firstName = data.firstName || '';
                admin.lastName = data.lastName || '';
                admin.phoneNumber = data.phoneNumber || '';
                admin.status = 'active';
                admin.createdAt = data.createdAt;
                admin.activatedAt = data.createdAt;
                admin.assignedSensorTypes = [];
                admin.apiToken = data.apiToken || '';
                admin.isAdmin = true;
                admin.role = data.role || 'admin';
                admin.permissions = data.permissions || {};
                admin.online = false;
                admin.lastSeen = null;
                
                _state.allUsers.set(doc.id, admin);
            }
            
            resolve();
        });
    };

    const processActivitiesSnapshot = (snapshot) => {
        const docs = snapshot.docs;
        
        for (let i = 0; i < docs.length; i++) {
            const doc = docs[i];
            const data = doc.data();
            
            const activity = ObjectPool.getActivity();
            activity.id = doc.id;
            activity.timestamp = data.timestamp?.toDate() || new Date();
            activity.type = data.type || '';
            activity.action = data.action || '';
            activity.details = data.details || {};
            activity.targetUser = data.targetUser || null;
            activity.adminId = data.adminId || '';
            activity.adminUsername = data.adminUsername || '';
            activity.adminFullName = data.adminFullName || '';
            
            _state.activities.push(activity);
            _activityIdSet.add(activity.id);
        }
    };

    // ==========================================
    // REAL-TIME LISTENERS
    // ==========================================
    const setupRealtimeListeners = () => {
        if (_state.listenersActive) return;
        
        console.log('🔄 SharedState: Setting up real-time listeners...');
        
        setupUserListener();
        setupAdminListener();
        
        rIC(() => {
            setupActivityListener();
            setupPresenceListener();
        }, { timeout: 200 });
        
        _state.listenersActive = true;
        console.log('✅ SharedState: Real-time listeners active');
    };

    const setupUserListener = () => {
        if (!_state.db) return;

        const unsubscribe = _state.db.collection('users')
            .onSnapshot((snapshot) => {
                let hasChanges = false;
                const changes = snapshot.docChanges();
                
                for (let i = 0; i < changes.length; i++) {
                    const change = changes[i];
                    const data = change.doc.data();
                    const userId = change.doc.id;

                    if (change.type === 'removed') {
                        removeUser(userId);
                    } else {
                        const existing = _state.allUsers.get(userId);
                        
                        updateUser(userId, {
                            username: data.username || '',
                            email: data.email || '',
                            firstName: data.firstName || '',
                            lastName: data.lastName || '',
                            phoneNumber: data.phoneNumber || '',
                            status: data.status || 'pending',
                            createdAt: data.createdAt,
                            activatedAt: data.activatedAt,
                            assignedSensorTypes: data.assignedSensorTypes || [],
                            apiToken: data.apiToken || '',
                            isAdmin: false,
                            role: 'user',
                            online: existing?.online || false,
                            lastSeen: existing?.lastSeen || null
                        });
                    }
                    hasChanges = true;
                }

                if (hasChanges) {
                    events.emit('users:changed');
                }
            }, (error) => {
                console.error('User listener error:', error);
            });

        _state.unsubscribers.push(unsubscribe);
    };

    const setupAdminListener = () => {
        if (!_state.db) return;

        const unsubscribe = _state.db.collection('admins')
            .onSnapshot((snapshot) => {
                let hasChanges = false;
                const changes = snapshot.docChanges();
                
                for (let i = 0; i < changes.length; i++) {
                    const change = changes[i];
                    const data = change.doc.data();
                    const adminId = change.doc.id;

                    if (change.type === 'removed') {
                        _state.allUsers.delete(adminId);
                        events.emit('user:removed', adminId);
                    } else {
                        updateUser(adminId, {
                            username: data.username || adminId,
                            email: data.email || '',
                            firstName: data.firstName || '',
                            lastName: data.lastName || '',
                            phoneNumber: data.phoneNumber || '',
                            status: 'active',
                            createdAt: data.createdAt,
                            activatedAt: data.createdAt,
                            assignedSensorTypes: [],
                            apiToken: data.apiToken || '',
                            isAdmin: true,
                            role: data.role || 'admin',
                            permissions: data.permissions || {}
                        });
                    }
                    hasChanges = true;
                }

                if (hasChanges) {
                    events.emit('users:changed');
                    events.emit('admins:changed');
                }
            }, (error) => {
                console.error('Admin listener error:', error);
            });

        _state.unsubscribers.push(unsubscribe);
    };

    const setupActivityListener = () => {
        if (!_state.db) return;

        console.log('👂 Setting up activity listener (activity_logs)...');

        const unsubscribe = _state.db.collection('activity_logs')
            .orderBy('timestamp', 'desc')
            .limit(_state.activityLimit)
            .onSnapshot((snapshot) => {
                let hasChanges = false;
                const changes = snapshot.docChanges();

                for (let i = 0; i < changes.length; i++) {
                    const change = changes[i];
                    const data = change.doc.data();
                    
                    if (change.type === 'added') {
                        if (!_activityIdSet.has(change.doc.id)) {
                            const activity = ObjectPool.getActivity();
                            activity.id = change.doc.id;
                            activity.timestamp = data.timestamp?.toDate() || new Date();
                            activity.type = data.type || '';
                            activity.action = data.action || '';
                            activity.details = data.details || {};
                            activity.targetUser = data.targetUser || null;
                            activity.adminId = data.adminId || '';
                            activity.adminUsername = data.adminUsername || '';
                            activity.adminFullName = data.adminFullName || '';
                            
                            if (addActivity(activity)) {
                                hasChanges = true;
                            }
                        }
                    } else if (change.type === 'removed') {
                        if (removeActivity(change.doc.id)) {
                            hasChanges = true;
                        }
                    }
                }

                if (hasChanges) {
                    SmartCache.invalidate('filtered-activities');
                    _state.filteredActivities = getFilteredActivities();
                    events.emit('activities:changed');
                }
            }, (error) => {
                console.error('Activity listener error:', error);
            });

        _state.unsubscribers.push(unsubscribe);
    };

    const handlePresenceUpdate = throttle((presence) => {
        const time = now();
        const THRESHOLD = 30000;
        let hasChanges = false;
        const previousOnline = new Set(_state.onlineUsers.keys());

        _state.onlineUsers.clear();

        for (const userId in presence) {
            if (userId[0] === '_') continue;
            
            const data = presence[userId];
            if (!data || typeof data !== 'object') continue;

            const user = _state.allUsers.get(userId);
            if (!user || user.isAdmin) continue;

            const lastSeen = data.lastSeen || 0;
            const isOnline = data.online === true && (time - lastSeen < THRESHOLD);

            user.online = isOnline;
            user.lastSeen = lastSeen;
            user.sessionStarted = data.sessionStarted || lastSeen;

            if (isOnline && user.status === 'active') {
                _state.onlineUsers.set(userId, Object.assign({}, user, { presenceData: data }));
                if (!previousOnline.has(userId)) hasChanges = true;
            } else if (previousOnline.has(userId)) {
                hasChanges = true;
            }
        }

        previousOnline.forEach(userId => {
            if (!_state.onlineUsers.has(userId)) hasChanges = true;
        });

        if (hasChanges) {
            events.emit('presence:changed');
        }
    }, 100);

    const setupPresenceListener = () => {
        if (!_state.rtdb) return;

        const presenceRef = _state.rtdb.ref('presence');

        presenceRef.on('value', (snapshot) => {
            handlePresenceUpdate(snapshot.val() || {});
        }, (error) => {
            console.error('Presence listener error:', error);
        });

        _state.unsubscribers.push(() => presenceRef.off('value'));
    };

    // ==========================================
    // NOTIFICATION
    // ==========================================
    const notify = (message, type = 'info') => {
        if (_state.toastActive) {
            console.log(`[${type.toUpperCase()}] ${message}`);
            return;
        }
        
        _state.toastActive = true;

        if (!_state._cachedToast) {
            _state._cachedToast = document.getElementById('toast');
        }
        
        const toast = _state._cachedToast;
        if (toast) {
            toast.textContent = message;
            toast.className = 'toast ' + type;
            toast.style.display = 'block';
            
            setTimeout(() => {
                toast.style.display = 'none';
                _state.toastActive = false;
            }, 3000);
            return;
        }
        
        const existing = document.querySelector('.shared-state-toast');
        if (existing) existing.remove();

        const el = document.createElement('div');
        el.className = `shared-state-toast toast ${type}`;
        el.textContent = message;
        
        const bgColors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };
        
        el.style.cssText = `position:fixed;bottom:20px;right:20px;padding:12px 20px;border-radius:8px;color:#fff;z-index:99999;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,.15);animation:slideInToast .3s ease;background:${bgColors[type] || bgColors.info}`;
        document.body.appendChild(el);
        
        setTimeout(() => {
            el.style.animation = 'slideOutToast .3s ease';
            setTimeout(() => {
                el.remove();
                _state.toastActive = false;
            }, 300);
        }, 3000);
    };

    // ==========================================
    // INITIALIZATION
    // ==========================================
    const init = async () => {
        if (_state.initialized) return true;
        if (_state.initializing) {
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
        }

        _state.initializing = true;
        console.log('🚀 SharedState v3.1: Initializing...');
        const startTime = now();

        try {
            loadAdminSession();
            await initFirebase();
            await loadInitialData();
            
            rIC(() => {
                setupRealtimeListeners();
            }, { timeout: 100 });
            
            _state.initialized = true;
            _state.initializing = false;
            
            events.emit('shared:ready');
            
            const initTime = now() - startTime;
            console.log(`✅ SharedState v3.1: Ready (${initTime}ms)`);
            console.log('📊 Total Users+Admins:', _state.allUsers.size);
            console.log('📊 Pending Users:', _state.pendingUsers.size);
            console.log('📊 Need Sensors:', _state.needsSensorUsers.size);
            console.log('📝 Recent Activities:', _state.activities.length);
            
            return true;
        } catch (error) {
            console.error('❌ SharedState: Init failed:', error);
            _state.initializing = false;
            events.emit('shared:error', error);
            return false;
        }
    };

    // ==========================================
    // CLEANUP
    // ==========================================
    const destroy = () => {
        console.log('🧹 SharedState: Cleaning up...');

        for (let i = 0; i < _state.unsubscribers.length; i++) {
            try { _state.unsubscribers[i](); } catch (e) {}
        }
        _state.unsubscribers = [];

        if (_state.rtdb) {
            try { _state.rtdb.ref('presence').off(); } catch (e) {}
        }

        _state.allUsers.clear();
        _state.onlineUsers.clear();
        _state.pendingUsers.clear();
        _state.needsSensorUsers.clear();
        _state.activities = [];
        _state.filteredActivities = [];
        _activityIdSet.clear();
        _state.recentLogs.clear();
        
        SmartCache.clear();
        ObjectPool.clear();
        events.clear();
        
        _state.listenersActive = false;
        _state.initialized = false;
        _state.initializing = false;
        _state._cachedAdminName = null;
        _state._cachedToast = null;

        console.log('✅ SharedState: Cleaned up');
    };
// ==========================================
// RTDB CONNECTION (ADD THIS SECTION)
// ==========================================
const RTDBManager = {
    connectionStatus: false,
    connectionListener: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    reconnectDelay: 2000,

    async ensureConnection() {
        if (!_state.rtdb) {
            console.error("❌ RTDB not initialized");
            return false;
        }

        try {
            const connectedRef = _state.rtdb.ref('.info/connected');
            
            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    console.warn("⚠️ RTDB connection timeout");
                    resolve(false);
                }, 10000);

                connectedRef.once('value', (snapshot) => {
                    clearTimeout(timeout);
                    const connected = snapshot.val();
                    
                    if (connected) {
                        console.log("✅ RTDB Connected");
                        this.connectionStatus = true;
                        this.reconnectAttempts = 0;
                        resolve(true);
                    } else {
                        console.warn("⚠️ RTDB Disconnected");
                        this.connectionStatus = false;
                        this.attemptReconnect();
                        resolve(false);
                    }
                }, (error) => {
                    clearTimeout(timeout);
                    console.error("❌ RTDB Connection Error:", error);
                    this.connectionStatus = false;
                    resolve(false);
                });
            });
        } catch (error) {
            console.error("❌ RTDB Connection Check Failed:", error);
            return false;
        }
    },

    startMonitoring() {
        if (!_state.rtdb || this.connectionListener) return;

        console.log("👂 Starting RTDB connection monitoring...");
        
        const connectedRef = _state.rtdb.ref('.info/connected');
        
        this.connectionListener = connectedRef.on('value', (snapshot) => {
            const connected = snapshot.val();
            const wasConnected = this.connectionStatus;
            this.connectionStatus = connected;
            
            if (connected && !wasConnected) {
                console.log("🟢 RTDB Connected - Session monitoring active");
                this.reconnectAttempts = 0;
                events.emit('rtdb:connected');
                
                // Show success notification
                if (wasConnected === false) {
                    notify('Real-time connection restored', 'success');
                }
            } else if (!connected && wasConnected) {
                console.warn("🔴 RTDB Disconnected - Attempting reconnection...");
                events.emit('rtdb:disconnected');
                this.attemptReconnect();
            }
        });

        _state.unsubscribers.push(() => {
            connectedRef.off('value', this.connectionListener);
            this.connectionListener = null;
        });
    },

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error("❌ Max reconnection attempts reached");
            notify('Real-time connection unavailable. Please refresh the page.', 'error');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        console.log(`🔄 Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms...`);
        
        setTimeout(() => {
            if (!this.connectionStatus && _state.rtdb) {
                try {
                    firebase.database().goOnline();
                    console.log("📡 Reconnection initiated");
                } catch (e) {
                    console.error("Reconnection failed:", e);
                    this.attemptReconnect();
                }
            }
        }, delay);
    },

    forceReconnect() {
        console.log("🔄 Force reconnecting RTDB...");
        if (_state.rtdb) {
            firebase.database().goOffline();
            setTimeout(() => {
                firebase.database().goOnline();
            }, 1000);
        }
    },

    stopMonitoring() {
        if (this.connectionListener && _state.rtdb) {
            _state.rtdb.ref('.info/connected').off('value', this.connectionListener);
            this.connectionListener = null;
        }
        this.connectionStatus = false;
        this.reconnectAttempts = 0;
    },

    getStatus() {
        return {
            connected: this.connectionStatus,
            reconnectAttempts: this.reconnectAttempts,
            monitoring: this.connectionListener !== null
        };
    }
};
    // ==========================================
    // PUBLIC API
    // ==========================================
    return {
        init,
        destroy,
        initFirebase,
        loadInitialData,
        setupRealtimeListeners,
        
        on: events.on,
        off: events.off,
        emit: events.emit,
        
        loadAdminSession,
        getAdminFullName,
        
        categorizeUser,
        updateUser,
        removeUser,
        setUserOnlineStatus,
        
        addActivity,
        removeActivity,
        clearActivities,
        getFilteredActivities,
        setActivityFilter,
        
        logActivity,
        logLogin,
        logLogout,
        logCreate,
        logDelete,
        logStatusChange,
        logUserApproved,
        logUserReactivated,
        logSensorAssign,
        logSensorModify,
        logSessionEnd,
        
        notify,
        SmartCache,
        
        get db() { return _state.db; },
        get rtdb() { return _state.rtdb; },
        get firebaseReady() { return _state.firebaseReady; },
        get initialized() { return _state.initialized; },
        get currentAdmin() { return _state.currentAdmin; },
        get allUsers() { return _state.allUsers; },
        get onlineUsers() { return _state.onlineUsers; },
        get pendingUsers() { return _state.pendingUsers; },
        get needsSensorUsers() { return _state.needsSensorUsers; },
        get activities() { return _state.activities; },
        get filteredActivities() { return _state.filteredActivities; },
        get currentFilter() { return _state.currentFilter; },
        
        set filteredActivities(val) { _state.filteredActivities = val; }
    };
})();

window.SharedState = SharedState;

if (!document.getElementById('shared-state-styles')) {
    const s = document.createElement('style');
    s.id = 'shared-state-styles';
    s.textContent = '@keyframes slideInToast{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes slideOutToast{from{transform:translateX(0);opacity:1}to{transform:translateX(100%);opacity:0}}';
    document.head.appendChild(s);
}

console.log('✅ SharedState v3.1 loaded (Dual Collection Support)');