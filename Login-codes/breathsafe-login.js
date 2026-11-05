// ==========================================
// BreathSafe user sign-in interface
// UPDATED FOR NEW FIREBASE DATABASE WITH LOCKOUT TRACKING
// ==========================================

(function() {
    'use strict';
    
    console.time('BreathSafe Login Load');

    // ========== CONFIGURATION ==========
    const APP_CONFIG = {
        APP: { NAME: 'BreathSafe', VERSION: '1.0.0' },
        VALIDATION: {
            USERNAME: {
                MIN_LENGTH: 3,
                MAX_LENGTH: 12,
                MIN_LETTERS: 6,
                ALLOWED_CHARS: /^[a-zA-Z0-9_#$]+$/,
                START_PATTERN: /^[a-zA-Z0-9]/,
                NO_ALL_NUMBERS: /^\d+$/
            },
            API_TOKEN: {
                PATTERN: /^[A-F0-9]{64}$/i
            }
        },
 SECURITY: {
    LOCKOUT: {
        USER: {
            INITIAL_ATTEMPTS: 5,
            SUBSEQUENT_ATTEMPTS: 3,
            INITIAL_DURATION: 5 * 60 * 1000, // 5 minutes
            SUBSEQUENT_DURATION: 10 * 60 * 1000, // 10 minutes
            STORAGE_KEY: 'breathsafe_login_attempts'
        }
    }
},
        PERFORMANCE: {
            DEBOUNCE: {
                INPUT: 300,
                CHECK: 500
            },
            CACHE: { TTL: 5 * 60 * 1000 },
            BATCH_SIZE: 10
        }
    };

    // ========== PERFORMANCE MONITORING ==========
    const PerformanceMonitor = {
        metrics: new Map(),
        
        start(label) {
            this.metrics.set(label, performance.now());
        },
        
        end(label) {
            if (!this.metrics.has(label)) return 0;
            const duration = performance.now() - this.metrics.get(label);
            this.metrics.delete(label);
            
            if (duration > 100) {
                console.warn(`⚠️ ${label}: ${duration.toFixed(2)}ms`);
            }
            return duration;
        },

        getMetrics() {
            return {
                active: Array.from(this.metrics.keys())
            };
        }
    };

    // ========== ADVANCED CACHE MANAGER ==========
    class AdvancedCacheManager {
        constructor(ttl) {
            this.cache = new Map();
            this.ttl = ttl;
            this.accessLog = new Map();
            this.maxSize = 100;
        }

        set(key, value, ttl = this.ttl) {
            if (this.cache.size >= this.maxSize) {
                this.evictLRU();
            }

            this.cache.set(key, {
                value,
                timestamp: Date.now(),
                ttl: ttl || this.ttl
            });
            this.accessLog.set(key, Date.now());
        }

        get(key) {
            const item = this.cache.get(key);
            if (!item) return null;
            
            if (Date.now() - item.timestamp > item.ttl) {
                this.cache.delete(key);
                this.accessLog.delete(key);
                return null;
            }
            
            this.accessLog.set(key, Date.now());
            return item.value;
        }

        evictLRU() {
            let oldestKey = null;
            let oldestTime = Infinity;

            for (const [key, time] of this.accessLog) {
                if (time < oldestTime) {
                    oldestTime = time;
                    oldestKey = key;
                }
            }

            if (oldestKey) {
                this.cache.delete(oldestKey);
                this.accessLog.delete(oldestKey);
            }
        }

        clear() {
            this.cache.clear();
            this.accessLog.clear();
        }

        stats() {
            return { size: this.cache.size, maxSize: this.maxSize };
        }
    }

    // ========== REQUEST QUEUE SYSTEM ==========
    class RequestQueue {
        constructor(maxConcurrent = 3) {
            this.queue = [];
            this.pending = new Map();
            this.maxConcurrent = maxConcurrent;
            this.activeCount = 0;
        }

        async add(key, fn) {
            if (this.pending.has(key)) {
                return this.pending.get(key);
            }

            const promise = new Promise((resolve, reject) => {
                this.queue.push({ key, fn, resolve, reject });
                this.process();
            });

            this.pending.set(key, promise);
            return promise;
        }

        async process() {
            if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
                return;
            }

            this.activeCount++;
            const { key, fn, resolve, reject } = this.queue.shift();

            try {
                const result = await fn();
                resolve(result);
            } catch (error) {
                reject(error);
            } finally {
                this.activeCount--;
                this.pending.delete(key);
                this.process();
            }
        }
    }

// ========== LOCKOUT MANAGER ==========
class OptimizedLockoutManager {
    constructor(storageKey, options = {}) {
        this.storageKey = storageKey;
        this.options = {
            initialAttempts: options.initialAttempts || 5,
            subsequentAttempts: options.subsequentAttempts || 3,
            initialDuration: options.initialDuration || 5 * 60 * 1000,
            subsequentDuration: options.subsequentDuration || 10 * 60 * 1000,
            ...options
        };
        this.timer = null;
        this.timerCallbacks = new Set();
        this.cachedData = null;
        this.cacheTimeout = 0;
    }

        getData(skipCache = false) {
            const now = Date.now();
            if (!skipCache && this.cachedData && this.cacheTimeout > now) {
                return { ...this.cachedData };
            }

            try {
                const data = localStorage.getItem(this.storageKey);
                if (!data) {
                    this.cachedData = this.getDefaultData();
                } else {
                    const parsed = JSON.parse(data);
                    this.cachedData = this.isValidData(parsed) ? parsed : this.getDefaultData();
                }
                this.cacheTimeout = now + 1000;
                return { ...this.cachedData };
            } catch (error) {
                console.error('Unable to read local lockout data.');
                return this.getDefaultData();
            }
        }

        getDefaultData() {
            return {
                attempts: 0,
                lockedUntil: null,
                lockoutCount: 0,
                lastSuccessfulLogin: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
        }

        isValidData(data) {
            return (
                typeof data === 'object' &&
                typeof data.attempts === 'number' &&
                (data.lockedUntil === null || typeof data.lockedUntil === 'number') &&
                typeof data.lockoutCount === 'number'
            );
        }

        saveData(data) {
            try {
                if (!this.isValidData(data)) {
                    throw new Error('Invalid lockout data structure');
                }
                
                data.updatedAt = new Date().toISOString();
                localStorage.setItem(this.storageKey, JSON.stringify(data));
                this.cachedData = { ...data };
                this.cacheTimeout = Date.now() + 1000;
            } catch (error) {
                console.error('Error saving lockout data:', error);
            }
        }

        isLocked() {
            const data = this.getData();
            
            if (!data.lockedUntil) {
                return false;
            }
            
            const now = Date.now();
            if (now < data.lockedUntil) {
                return true;
            }
            
            this.saveData({
                attempts: 0,
                lockedUntil: null,
                lockoutCount: data.lockoutCount,
                lastSuccessfulLogin: data.lastSuccessfulLogin,
                createdAt: data.createdAt,
                updatedAt: new Date().toISOString()
            });
            
            return false;
        }

        getRemainingLockTime() {
            const data = this.getData();
            if (!data.lockedUntil) return 0;
            
            const remaining = data.lockedUntil - Date.now();
            return remaining > 0 ? remaining : 0;
        }

        getMaxAttempts() {
            const data = this.getData();
            
            if (data.lastSuccessfulLogin && data.lockoutCount > 0) {
                const timeSinceSuccess = Date.now() - data.lastSuccessfulLogin;
                if (timeSinceSuccess < this.options.duration) {
                    return this.options.initialAttempts;
                }
            }
            
            return data.lockoutCount > 0 ? 
                this.options.subsequentAttempts : 
                this.options.initialAttempts;
        }

 recordFailedAttempt() {
    const data = this.getData(true);
    data.attempts += 1;
    
    const maxAttempts = this.getMaxAttempts();
    
    if (data.attempts >= maxAttempts) {
        // Determine lockout duration based on lockout count
        const lockoutDuration = data.lockoutCount > 0 ? 
            this.options.subsequentDuration : 
            this.options.initialDuration;
        
        data.lockedUntil = Date.now() + lockoutDuration;
        data.lockoutCount += 1;
        data.attempts = 0;
        
        this.saveData(data);
        
        console.log(`🔒 User lockout #${data.lockoutCount} triggered (${lockoutDuration / 60000} minutes)`);
        
        return {
            locked: true,
            attemptsUsed: maxAttempts,
            remainingAttempts: 0,
            lockoutMinutes: Math.ceil(lockoutDuration / 60000),
            lockoutCount: data.lockoutCount,
            hideAttempts: true // Flag to hide attempts from user
        };
    }
    
    this.saveData(data);
    
    return {
        locked: false,
        attemptsUsed: data.attempts,
        remainingAttempts: maxAttempts - data.attempts,
        lockoutMinutes: 0,
        lockoutCount: data.lockoutCount,
        hideAttempts: true // Flag to hide attempts from user
    };
}

        recordSuccessfulLogin() {
            const data = this.getData();
            
            this.saveData({
                attempts: 0,
                lockedUntil: null,
                lockoutCount: 0,
                lastSuccessfulLogin: Date.now(),
                createdAt: data.createdAt,
                updatedAt: new Date().toISOString()
            });
        }

        resetAttempts() {
            const data = this.getData();
            data.attempts = 0;
            this.saveData(data);
        }

        clearAll() {
            localStorage.removeItem(this.storageKey);
            this.cachedData = null;
            this.cacheTimeout = 0;
        }

        getStatus() {
            const data = this.getData();
            const remaining = this.getRemainingLockTime();
            const maxAttempts = this.getMaxAttempts();
            
            return {
                isLocked: this.isLocked(),
                attempts: data.attempts,
                maxAttempts: maxAttempts,
                remainingAttempts: maxAttempts - data.attempts,
                lockoutCount: data.lockoutCount,
                remainingTime: remaining,
                remainingMinutes: Math.ceil(remaining / 60000),
                remainingSeconds: Math.ceil(remaining / 1000)
            };
        }

        startCountdown(callback) {
            if (this.timer) {
                clearInterval(this.timer);
            }

            const updateCountdown = () => {
                const remaining = this.getRemainingLockTime();
                
                if (remaining <= 0) {
                    clearInterval(this.timer);
                    this.timer = null;
                    if (callback) callback(0);
                    return;
                }
                
                if (callback) callback(remaining);
            };

            updateCountdown();
            this.timer = setInterval(updateCountdown, 1000);
            
            return this.timer;
        }

        stopCountdown() {
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }
        }
    }

    // ========== STATE MANAGEMENT ==========
    const state = {
        db: null,
        cache: new AdvancedCacheManager(APP_CONFIG.PERFORMANCE.CACHE.TTL),
        requestQueue: new RequestQueue(3),
        lockoutManager: null,
        firebaseReady: false,
        elementsCache: new Map(),
        pendingAccountDetected: false
    };

    // ========== ELEMENT CACHE ==========
    const ElementCache = {
        get(id) {
            if (state.elementsCache.has(id)) {
                return state.elementsCache.get(id);
            }
            const element = document.getElementById(id);
            if (element) {
                state.elementsCache.set(id, element);
            }
            return element;
        },

        clear() {
            state.elementsCache.clear();
        }
    };

    // ========== DOM BATCHING ==========
    class DOMBatcher {
        constructor(delay = 16) {
            this.updates = [];
            this.delay = delay;
            this.scheduled = false;
        }

        add(fn) {
            this.updates.push(fn);
            if (!this.scheduled) {
                this.scheduled = true;
                requestAnimationFrame(() => {
                    this.flush();
                });
            }
        }

        flush() {
            const updates = this.updates.splice(0);
            updates.forEach(fn => {
                try {
                    fn();
                } catch (e) {
                    console.error('DOM update error:', e);
                }
            });
            this.scheduled = false;
        }
    }

    const domBatcher = new DOMBatcher();

    // ========== DEBOUNCE & THROTTLE ==========
    const debounce = (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func.apply(this, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    };

    // ========== INPUT SANITIZER () ==========
    const InputSanitizer = {
        sanitizeCache: new Map(),
        
sanitizeInput(input) {
    if (!input || typeof input !== 'string') {
        throw new Error('Input must be a valid string');
    }

    const trimmed = input.trim();
    if (APP_CONFIG.VALIDATION.API_TOKEN.PATTERN.test(trimmed)) {
        return trimmed.toUpperCase();
    }

    const limited = input.substring(0, 100); // This will now be max 20 from HTML
    const cacheKey = `input:${limited}`;
    
    if (this.sanitizeCache.has(cacheKey)) {
        return this.sanitizeCache.get(cacheKey);
    }

    const sanitized = limited
        .trim()
        .toLowerCase()
        .replace(/[<>\"'%;()&+\\/]/g, '');
        
    if (sanitized) {
        this.sanitizeCache.set(cacheKey, sanitized);
        if (this.sanitizeCache.size > 50) {
            const first = this.sanitizeCache.keys().next().value;
            this.sanitizeCache.delete(first);
        }
    }
    
    return sanitized;
},

        sanitizeApiToken(token) {
            if (!token || typeof token !== 'string') {
                throw new Error('API token must be a valid string');
            }
            
            const sanitized = token.trim().toUpperCase();
                
            if (!sanitized) {
                throw new Error('API token cannot be empty');
            }
            
            if (!APP_CONFIG.VALIDATION.API_TOKEN.PATTERN.test(sanitized)) {
                throw new Error('Invalid API token format. Expected 64 hexadecimal characters.');
            }
            
            return sanitized;
        },

        escapeHtml(text) {
            if (!text || typeof text !== 'string') return '';
            
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    };

    // ========== INPUT VALIDATOR () ==========
    const InputValidator = {
        validateInput(input) {
            try {
                if (!input) {
                    return {
                        valid: false,
                        message: 'Username or API token is required',
                        code: 'EMPTY'
                    };
                }
                
                const sanitized = InputSanitizer.sanitizeInput(input);
                
                return {
                    valid: true,
                    message: 'Input validated',
                    code: 'VALID',
                    sanitized: sanitized,
                    isTokenFormat: APP_CONFIG.VALIDATION.API_TOKEN.PATTERN.test(sanitized)
                };
            } catch (error) {
                return {
                    valid: false,
                    message: error.message,
                    code: 'SANITIZATION_ERROR'
                };
            }
        },

        validateApiToken(token) {
            try {
                if (!token) {
                    return {
                        valid: false,
                        message: 'API token is required',
                        code: 'EMPTY'
                    };
                }
                
                const sanitized = InputSanitizer.sanitizeApiToken(token);
                
                return {
                    valid: true,
                    message: 'Valid API token format',
                    code: 'VALID',
                    sanitized: sanitized
                };
            } catch (error) {
                return {
                    valid: false,
                    message: error.message,
                    code: 'SANITIZATION_ERROR'
                };
            }
        }
    };

    // ========== ERROR MANAGER () ==========
    const ErrorManager = {
        ERROR_TYPES: {
            NETWORK: 'NETWORK_ERROR',
            VALIDATION: 'VALIDATION_ERROR',
            PERMISSION: 'PERMISSION_ERROR',
            AUTHENTICATION: 'AUTHENTICATION_ERROR',
            NOT_FOUND: 'NOT_FOUND_ERROR',
            SERVER: 'SERVER_ERROR',
            UNKNOWN: 'UNKNOWN_ERROR'
        },

        classify(error, context = 'unknown') {
            if (error.code) {
                return this.classifyFirebaseError(error, context);
            }
            
            const message = error.message?.toLowerCase() || '';
            
            if (['network', 'connection', 'timeout', 'offline'].some(word => message.includes(word))) {
                return {
                    type: this.ERROR_TYPES.NETWORK,
                    message: 'Connection lost. Please check your internet and try again.',
                    code: 'NETWORK_UNAVAILABLE',
                    context: context,
                    userMessage: 'Connection lost. Please try again.'
                };
            }
            
            if (['validation', 'invalid', 'required', 'format', 'not found'].some(word => message.includes(word))) {
                return {
                    type: this.ERROR_TYPES.VALIDATION,
                    message: error.message || 'Please check your input and try again.',
                    code: 'VALIDATION_FAILED',
                    context: context,
                    userMessage: error.message || 'Validation failed. Please check your input.'
                };
            }
            
            return {
                type: this.ERROR_TYPES.UNKNOWN,
                message: 'An unexpected error occurred. Please try again.',
                code: 'GENERIC_ERROR',
                context: context,
                userMessage: 'An unexpected error occurred. Please try again.'
            };
        },

        classifyFirebaseError(error, context) {
            const errorMap = {
                'unavailable': {
                    type: this.ERROR_TYPES.NETWORK,
                    message: 'Database service unavailable. Please try again later.',
                    code: 'FIREBASE_UNAVAILABLE',
                    userMessage: 'Service temporarily unavailable. Please try again.'
                },
                'deadline-exceeded': {
                    type: this.ERROR_TYPES.NETWORK,
                    message: 'Request timeout.',
                    code: 'FIREBASE_TIMEOUT',
                    userMessage: 'Request timeout. Please try again.'
                },
                'permission-denied': {
                    type: this.ERROR_TYPES.PERMISSION,
                    message: 'Permission denied.',
                    code: 'FIREBASE_PERMISSION',
                    userMessage: 'Access denied. Please contact support.'
                },
                'not-found': {
                    type: this.ERROR_TYPES.NOT_FOUND,
                    message: 'Account not found.',
                    code: 'FIREBASE_NOT_FOUND',
                    userMessage: 'Username or API token not found'
                }
            };
            
            return errorMap[error.code] || {
                type: this.ERROR_TYPES.SERVER,
                message: 'Database error. Please try again.',
                code: 'FIREBASE_ERROR',
                userMessage: 'Login service error. Please try again.'
            };
        }
    };

    // ========== THEME MANAGER () ==========
    const themeManager = {
        toggle() {
            document.body.classList.toggle('dark');
            document.body.classList.toggle('light');
            
            const isDark = document.body.classList.contains('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        },
        
        load() {
            const theme = localStorage.getItem('theme') || 'light';
            document.body.classList.add(theme);
        }
    };

    // ========== FIREBASE MANAGER () ==========
    let firebaseInstance = null;

    const firebaseManager = {
        async init() {
            if (firebaseInstance) return true;

            try {
                PerformanceMonitor.start('firebase_init');
                
                if (typeof firebase === 'undefined') {
                    throw new Error('Firebase SDK not loaded');
                }
                
                firebaseInstance = firebase.initializeApp({
                    apiKey: "YOUR_FIREBASE_WEB_API_KEY",
                    authDomain: "YOUR_FIREBASE_PROJECT_ID.firebaseapp.com",
                    databaseURL: "https://YOUR_FIREBASE_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app",
                    projectId: "YOUR_FIREBASE_PROJECT_ID",
                    storageBucket: "YOUR_FIREBASE_PROJECT_ID.firebasestorage.app",
                    messagingSenderId: "YOUR_FIREBASE_MESSAGING_SENDER_ID",
                    appId: "YOUR_FIREBASE_APP_ID",
                    measurementId: "YOUR_FIREBASE_MEASUREMENT_ID"
                }, "loginApp");
                
                state.db = firebase.firestore(firebaseInstance);
                state.firebaseReady = true;
                
                console.log('✅ Firebase initialized with new database configuration');
                PerformanceMonitor.end('firebase_init');
                return true;
            } catch (error) {
                console.error('Firebase Error:', error);
                const classifiedError = ErrorManager.classify(error, 'firebase_init');
                uiManager.showMessage(classifiedError.userMessage, 'error');
                return false;
            }
        }
    };

    // ========== LOGIN MANAGER () ==========
    const loginManager = {
        async handleLogin(input) {
            if (!state.db) {
                throw new Error('Database not initialized');
            }
            
            try {
                PerformanceMonitor.start('login_handler');
                
                state.pendingAccountDetected = false;

                const isTokenFormat = APP_CONFIG.VALIDATION.API_TOKEN.PATTERN.test(input.trim());
                if (isTokenFormat) input = input.trim().toUpperCase();
                const cacheKey = `login_${input}`;
                
                // Check admin username
                if (!isTokenFormat) {
                    const adminByUsername = await state.requestQueue.add(`admin_username_${input}`, async () => {
                        return await state.db.collection('admins')
                            .where('username', '==', input)
                            .limit(1)
                            .get();
                    });
                    
                    if (!adminByUsername.empty) {
                        console.log('Admin username found, redirecting');
                        uiManager.showMessage('Admin account detected. Redirecting...', 'info');
                        await this.delay(1000);
                        this.redirectToAdminLogin(input, 'username');
                        return { redirect: true };
                    }
                }
                
                // Check admin token
                if (isTokenFormat) {
                    const adminByToken = await state.requestQueue.add(`admin_token_${input}`, async () => {
                        return await state.db.collection('admins')
                            .where('apiToken', '==', input)
                            .limit(1)
                            .get();
                    });
                    
                    if (!adminByToken.empty) {
                        console.log('Admin token found, redirecting');
                        uiManager.showMessage('Admin token detected. Redirecting...', 'info');
                        await this.delay(1000);
                        this.redirectToAdminLogin(input, 'token');
                        return { redirect: true };
                    }
                }
                
                // Check user
                const result = await state.requestQueue.add(cacheKey, async () => {
                    const usersRef = state.db.collection('users');
                    
                    if (!isTokenFormat) {
                        const userByUsername = await usersRef
                            .where('username', '==', input)
                            .limit(1)
                            .get();
                        
                        if (!userByUsername.empty) {
                            return this.processUserLogin(userByUsername.docs[0]);
                        }
                    }
                    
                    const userByToken = await usersRef
                        .where('apiToken', '==', input)
                        .limit(1)
                        .get();
                    
                    if (!userByToken.empty) {
                        return this.processUserLogin(userByToken.docs[0]);
                    }
                    
                    return {
                        success: false,
                        isPendingAccount: false,
                        message: 'Username or API token not found'
                    };
                });
                
                PerformanceMonitor.end('login_handler');
                return result;
                
            } catch (error) {
                console.error('Login handler error:', error);
                const classifiedError = ErrorManager.classify(error, 'login_handler');
                throw new Error(classifiedError.userMessage);
            }
        },

        processUserLogin(userDoc) {
            const userData = userDoc.data();
            
            if (userData.status !== 'active') {
                state.pendingAccountDetected = true;
                return {
                    success: false,
                    isPendingAccount: true,
                    message: 'Account is pending activation. Please contact admin.'
                };
            }
            
            console.log('User found and active');
            return {
                success: true,
                isPendingAccount: false,
                user: {
                    id: userDoc.id,
                    ...userData
                }
            };
        },

        redirectToAdminLogin(input, type) {
            try {
                sessionStorage.setItem('adminPrefillValue', InputSanitizer.escapeHtml(input));
                sessionStorage.setItem('adminPrefillType', type);
            } catch (e) {
                console.warn('Session storage is unavailable.');
            }
window.location.href = 'Login-codes/breathsafe-admin-login.html';

        },

        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    };

    // ========== INPUT CHECKER () ==========
    const inputChecker = {
        async check(input) {
            if (!input || input.length < 3 || !state.db) return;
            
            PerformanceMonitor.start('input_check');
            
            const indicator = ElementCache.get('inputIndicator');
            const hint = ElementCache.get('inputHint');
            
            if (!indicator || !hint) return;
            
            domBatcher.add(() => {
                indicator.className = 'input-indicator checking';
                indicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                indicator.style.display = 'block';
            });
            
            try {
            const isTokenFormat = APP_CONFIG.VALIDATION.API_TOKEN.PATTERN.test(input.trim());
            if (isTokenFormat) input = input.trim().toUpperCase();
                
                const [adminUsernameCheck, adminTokenCheck, userCheck, userTokenCheck] = await Promise.all([
                    !isTokenFormat ? state.requestQueue.add(`admin_check_${input}`, async () => {
                        return await state.db.collection('admins')
                            .where('username', '==', input)
                            .limit(1)
                            .get();
                    }) : Promise.resolve({ empty: true }),
                    isTokenFormat ? state.requestQueue.add(`admin_token_check_${input}`, async () => {
                        return await state.db.collection('admins')
                            .where('apiToken', '==', input)
                            .limit(1)
                            .get();
                    }) : Promise.resolve({ empty: true }),
                    !isTokenFormat ? state.db.collection('users')
                        .where('username', '==', input)
                        .limit(1)
                        .get() : Promise.resolve({ empty: true }),
                    isTokenFormat ? state.db.collection('users')
                        .where('apiToken', '==', input)
                        .limit(1)
                        .get() : Promise.resolve({ empty: true })
                ]);
                
                domBatcher.add(() => {
                    if (!adminUsernameCheck.empty || !adminTokenCheck.empty) {
                        indicator.className = 'input-indicator admin';
                        indicator.innerHTML = '<i class="fas fa-user-shield"></i>';
                        hint.innerHTML = 'Admin account detected';
                        state.pendingAccountDetected = false;
                        return;
                    }
                    
                    if (!userCheck.empty || !userTokenCheck.empty) {
                        const userData = !userCheck.empty ? userCheck.docs[0].data() : userTokenCheck.docs[0].data();
                        
                        if (userData.status !== 'active') {
                            state.pendingAccountDetected = true;
                            indicator.className = 'input-indicator warning';
                            indicator.innerHTML = '<i class="fas fa-hourglass-half"></i>';
                            hint.innerHTML = 'Account pending activation';
                            return;
                        }
                        
                        state.pendingAccountDetected = false;
                        indicator.className = 'input-indicator user';
                        indicator.innerHTML = '<i class="fas fa-user"></i>';
                        hint.innerHTML = 'User account found';
                        return;
                    }
                    
                    state.pendingAccountDetected = false;
                    indicator.style.display = 'none';
                    hint.innerHTML = 'Enter your username or API token to continue';
                });
                
            } catch (error) {
                console.error('Check input error:', error);
                state.pendingAccountDetected = false;
                domBatcher.add(() => {
                    indicator.style.display = 'none';
                });
            }
            
            PerformanceMonitor.end('input_check');
        }
    };

// ========== SESSION MANAGER () ==========
// ========== SESSION MANAGER () ==========
const sessionManager = {
    createUserSession(user) {
        const session = {
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            phoneNumber: user.phoneNumber || '',
            apiToken: user.apiToken || '',
            role: 'user',
            loginTime: Date.now()
        };
        
        try {
            sessionStorage.setItem('breathsafeUser', JSON.stringify(session));
            sessionStorage.setItem('breathsafeToken', user.apiToken || '');
        } catch (e) {
            console.warn('Session storage is unavailable.');
        }
        
        localStorage.setItem('breathsafeUsername', user.username);
    },

    redirectToUserDashboard() {
        console.log('Redirecting to user dashboard...');
window.location.href = '../user-dashboard/user-dashboard.html';

    }
};

    // ========== UI MANAGER () ==========
    const uiManager = {
        showMessage(msg, type) {
            domBatcher.add(() => {
                const messageDiv = ElementCache.get('message');
                if (!messageDiv) return;
                
                messageDiv.innerHTML = msg;
                messageDiv.className = `modern-message ${type}`;
                messageDiv.style.display = 'block';
            });
        },

        showLockoutTimer(remainingTime) {
            const lockoutDiv = ElementCache.get('lockoutTimer');
            const countdownDiv = ElementCache.get('lockoutCountdown');
            const loginBtn = ElementCache.get('loginBtn');
            
            if (!lockoutDiv || !countdownDiv) return;
            
            if (remainingTime <= 0) {
                domBatcher.add(() => {
                    lockoutDiv.classList.remove('active');
                    if (loginBtn) loginBtn.disabled = false;
                });
                this.showMessage('You can try logging in again.', 'info');
                return;
            }
            
            domBatcher.add(() => {
                lockoutDiv.classList.add('active');
                if (loginBtn) loginBtn.disabled = true;
                
                const minutes = Math.floor(remainingTime / 60000);
                const seconds = Math.floor((remainingTime % 60000) / 1000);
                countdownDiv.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            });
        },

        hideLockoutTimer() {
            const lockoutDiv = ElementCache.get('lockoutTimer');
            if (lockoutDiv) {
                domBatcher.add(() => {
                    lockoutDiv.classList.remove('active');
                });
            }
        }
    };

    // ========== EVENT HANDLERS () ==========
    const eventHandlers = {
        debounced: new Map(),

        getDebounced(key, fn, wait) {
            if (!this.debounced.has(key)) {
                this.debounced.set(key, debounce(fn, wait));
            }
            return this.debounced.get(key);
        }
    };

    // ========== FORM HANDLERS ( WITH SECURITY TRACKING) ==========
    const formHandlers = {
        handleInput: null,

        async handleSubmit(e, elements) {
            e.preventDefault();
            
            PerformanceMonitor.start('form_submit');
            
            const { userInput, loginBtn, btnContent, btnLoading } = elements;
            const input = userInput.value.trim();
            
            // Check if locked
            if (state.lockoutManager.isLocked()) {
                const remaining = state.lockoutManager.getRemainingLockTime();
                const minutes = Math.ceil(remaining / 60000);
                uiManager.showMessage(
                    `Account temporarily locked. Please wait ${minutes} minute${minutes !== 1 ? 's' : ''}.`, 
                    'error'
                );
                PerformanceMonitor.end('form_submit');
                return;
            }
            
            if (!input) {
                uiManager.showMessage('Please enter your username or API token', 'error');
                PerformanceMonitor.end('form_submit');
                return;
            }
            
            // Check if pending before login
            if (state.pendingAccountDetected) {
                uiManager.showMessage('Account is pending activation. Please contact admin.', 'warning');
                PerformanceMonitor.end('form_submit');
                return;
            }
            
            loginBtn.disabled = true;
            domBatcher.add(() => {
                if (btnContent) btnContent.style.display = 'none';
                if (btnLoading) btnLoading.style.display = 'flex';
            });
            
            try {
                uiManager.showMessage('Verifying credentials...', 'info');
                
                const result = await loginManager.handleLogin(input);
                
                if (result.redirect) {
                    return;
                }
                
                if (result.success) {
                    // Successful login
                    state.lockoutManager.recordSuccessfulLogin();
                    uiManager.hideLockoutTimer();
                    
                    uiManager.showMessage('Welcome back! Redirecting...', 'success');
                    sessionManager.createUserSession(result.user);
                    
                    await loginManager.delay(1500);
                    sessionManager.redirectToUserDashboard();
} else {
    // Failure handling
    if (result.isPendingAccount) {
        uiManager.showMessage(result.message, 'warning');
        
        loginBtn.disabled = false;
        domBatcher.add(() => {
            if (btnContent) btnContent.style.display = 'flex';
            if (btnLoading) btnLoading.style.display = 'none';
        });
        PerformanceMonitor.end('form_submit');
        return;
    }
    
    // Count failed attempts for ACTIVE accounts
    const lockoutResult = state.lockoutManager.recordFailedAttempt();
    
    if (lockoutResult.locked) {
        // ⭐ RECORD LOCKOUT TO SECURITY SYSTEM
        console.log(`🔒 User lockout #${lockoutResult.lockoutCount} triggered - recording to security...`);
        if (window.LoginSecurityCheck && typeof window.LoginSecurityCheck.recordLockoutAttempt === 'function') {
            try {
                await window.LoginSecurityCheck.recordLockoutAttempt('user', input);
                console.log('✅ Lockout recorded to security system');
            } catch (secError) {
                console.error('❌ Security recording failed:', secError);
            }
        } else {
            console.warn('⚠️ LoginSecurityCheck not available');
        }
        
        // UPDATED: Hide attempt count from user
        uiManager.showMessage(
            `Too many failed attempts. Account locked for ${lockoutResult.lockoutMinutes} minutes.`, 
            'error'
        );
        
        state.lockoutManager.startCountdown((remaining) => {
            uiManager.showLockoutTimer(remaining);
        });
    } else {
        // UPDATED: Don't show remaining attempts to user
        uiManager.showMessage(
            `${result.message}`, 
            'error'
        );
    }
    
    loginBtn.disabled = false;
    domBatcher.add(() => {
        if (btnContent) btnContent.style.display = 'flex';
        if (btnLoading) btnLoading.style.display = 'none';
    });
}
            } catch (error) {
                console.error('Login error:', error);
                const classifiedError = ErrorManager.classify(error, 'login_submit');
                uiManager.showMessage(classifiedError.userMessage, 'error');
                
                loginBtn.disabled = false;
                domBatcher.add(() => {
                    if (btnContent) btnContent.style.display = 'flex';
                    if (btnLoading) btnLoading.style.display = 'none';
                });
            }
            
            PerformanceMonitor.end('form_submit');
        }
    };

    // ========== INITIALIZATION () ==========
    async function initialize() {
        console.time('BreathSafe Initialize');
        
        themeManager.load();
        
// Initialize lockout manager
state.lockoutManager = new OptimizedLockoutManager(
    APP_CONFIG.SECURITY.LOCKOUT.USER.STORAGE_KEY,
    {
        initialAttempts: APP_CONFIG.SECURITY.LOCKOUT.USER.INITIAL_ATTEMPTS,
        subsequentAttempts: APP_CONFIG.SECURITY.LOCKOUT.USER.SUBSEQUENT_ATTEMPTS,
        initialDuration: APP_CONFIG.SECURITY.LOCKOUT.USER.INITIAL_DURATION,
        subsequentDuration: APP_CONFIG.SECURITY.LOCKOUT.USER.SUBSEQUENT_DURATION
    }
);
        
// Check if already locked on page load
if (state.lockoutManager.isLocked()) {
    const loginBtn = ElementCache.get('loginBtn');
    if (loginBtn) loginBtn.disabled = true;
    
    state.lockoutManager.startCountdown((remaining) => {
        uiManager.showLockoutTimer(remaining);
    });
    
    const minutes = Math.ceil(state.lockoutManager.getRemainingLockTime() / 60000);
    uiManager.showMessage(
        `Account temporarily locked. Please wait ${minutes} minute${minutes !== 1 ? 's' : ''}.`, 
        'error'
    );
}
        
        const connected = await firebaseManager.init();
        if (!connected) {
            console.error('Failed to initialize Firebase');
            return;
        }
        
        // Event delegation for theme toggle
        document.addEventListener('click', (e) => {
            if (e.target.id === 'themeToggle') {
                themeManager.toggle();
            }
        });
        
        const form = ElementCache.get('loginForm');
        const loginBtn = ElementCache.get('loginBtn');
        const btnContent = loginBtn?.querySelector('.btn-content');
        const btnLoading = loginBtn?.querySelector('.btn-loading');
        const userInput = ElementCache.get('userInput');
        
        if (form) {
            form.addEventListener('submit', (e) => {
                formHandlers.handleSubmit(e, {
                    userInput,
                    loginBtn,
                    btnContent,
                    btnLoading
                });
            });
        }
        
        if (userInput) {
            formHandlers.handleInput = eventHandlers.getDebounced(
                'input_check',
                async (value) => {
                    if (value.length >= 3) {
                        await inputChecker.check(value);
                    } else {
                        const indicator = ElementCache.get('inputIndicator');
                        const hint = ElementCache.get('inputHint');
                        
                        domBatcher.add(() => {
                            if (indicator) indicator.style.display = 'none';
                            if (hint) {
                                hint.innerHTML = 'Enter your username or API token to continue';
                            }
                        });
                    }
                },
                APP_CONFIG.PERFORMANCE.DEBOUNCE.CHECK
            );

            userInput.addEventListener('input', (e) => {
                formHandlers.handleInput(e.target.value.trim());
            }, { passive: true });
            
            userInput.addEventListener('input', () => {
                const messageDiv = ElementCache.get('message');
                if (messageDiv && messageDiv.className && messageDiv.className.includes('error')) {
                    messageDiv.style.display = 'none';
                }
            }, { passive: true });
        }
        
        console.timeEnd('BreathSafe Initialize');
    }

    // ========== START APPLICATION ==========
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    // Expose for debugging
    if (typeof window !== 'undefined') {
        window.BreathSafeLogin = {
            cache: state.cache,
            performance: PerformanceMonitor,
            InputValidator,
            InputSanitizer,
            ErrorManager,
            lockout: {
                isLocked: () => state.lockoutManager.isLocked(),
                getData: () => state.lockoutManager.getData(),
                clear: () => state.lockoutManager.clearAll()
            }
        };
    }

    console.timeEnd('BreathSafe Login Load');

})();
