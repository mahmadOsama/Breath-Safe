// ==========================================
// BreathSafe administrator sign-in interface
// UPDATED FOR NEW FIREBASE DATABASE WITH LOCKOUT TRACKING
// ==========================================

(function() {
    'use strict';
    
    console.time('BreathSafe Admin Login Load');

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
                ADMIN: {
                    INITIAL_ATTEMPTS: 3,
                    SUBSEQUENT_ATTEMPTS: 2,
                    DURATION: 20 * 60 * 1000,
                    STORAGE_KEY: 'breathsafe_admin_lockout'
                }
            }
        },
        PERFORMANCE: {
            DEBOUNCE: {
                VALIDATION: 300
            }
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

    // ========== ADMIN LOCKOUT MANAGER ==========
    class AdminLockoutManager {
        constructor(storageKey, options = {}) {
            this.storageKey = storageKey;
            this.options = {
                initialAttempts: options.initialAttempts || 3,
                subsequentAttempts: options.subsequentAttempts || 2,
                duration: options.duration || 20 * 60 * 1000,
                ...options
            };
            this.timer = null;
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
                console.error('Unable to read local admin lockout data.');
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
                console.error('Error saving admin lockout data:', error);
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

        getRemainingLockTime() {
            const data = this.getData();
            if (!data.lockedUntil) return 0;
            
            const remaining = data.lockedUntil - Date.now();
            return remaining > 0 ? remaining : 0;
        }

        recordFailedAttempt() {
            const data = this.getData(true);
            data.attempts += 1;
            
            const maxAttempts = this.getMaxAttempts();
            
            if (data.attempts >= maxAttempts) {
                data.lockedUntil = Date.now() + this.options.duration;
                data.lockoutCount += 1;
                data.attempts = 0;
                
                this.saveData(data);
                
                console.warn(`🔒 Admin lockout #${data.lockoutCount} triggered`);
                
                return {
                    locked: true,
                    attemptsUsed: maxAttempts,
                    remainingAttempts: 0,
                    lockoutMinutes: Math.ceil(this.options.duration / 60000),
                    lockoutCount: data.lockoutCount
                };
            }
            
            this.saveData(data);
            
            return {
                locked: false,
                attemptsUsed: data.attempts,
                remainingAttempts: maxAttempts - data.attempts,
                lockoutMinutes: Math.ceil(this.options.duration / 60000),
                lockoutCount: data.lockoutCount
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
            
            console.log('✅ Admin login successful - lockout data reset');
        }

        clearAll() {
            localStorage.removeItem(this.storageKey);
            this.cachedData = null;
            this.cacheTimeout = 0;
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
    }

    // ========== STATE MANAGEMENT ==========
    const state = {
        db: null,
        lockoutManager: null,
        firebaseReady: false,
        elementsCache: new Map()
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

    // ========== DEBOUNCE ==========
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
        
        sanitizeUsername(username) {
            if (!username || typeof username !== 'string') {
                throw new Error('Username must be a valid string');
            }
            
            const limited = username.substring(0, APP_CONFIG.VALIDATION.USERNAME.MAX_LENGTH);
            const cacheKey = `user:${limited}`;
            
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

        sanitizePassword(password) {
            if (!password || typeof password !== 'string') {
                throw new Error('Password must be a valid string');
            }
            
            const sanitized = password.substring(0, 128);
            
            if (!sanitized) {
                throw new Error('Password cannot be empty');
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
        validateUsername(username) {
            try {
                if (!username) {
                    return {
                        valid: false,
                        message: 'Username is required',
                        code: 'EMPTY'
                    };
                }
                
                const sanitized = InputSanitizer.sanitizeUsername(username);
                
                return {
                    valid: true,
                    message: 'Valid username',
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
        },

        validatePassword(password) {
            try {
                if (!password) {
                    return {
                        valid: false,
                        message: 'Password is required',
                        code: 'EMPTY'
                    };
                }
                
                const sanitized = InputSanitizer.sanitizePassword(password);
                
                return {
                    valid: true,
                    message: 'Valid password',
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
                    userMessage: 'Connection lost. Please try again.'
                };
            }
            
            if (['validation', 'invalid', 'required', 'format'].some(word => message.includes(word))) {
                return {
                    type: this.ERROR_TYPES.VALIDATION,
                    message: error.message || 'Validation failed.',
                    code: 'VALIDATION_FAILED',
                    userMessage: error.message || 'Validation failed. Please check your input.'
                };
            }
            
            return {
                type: this.ERROR_TYPES.UNKNOWN,
                message: 'An unexpected error occurred.',
                code: 'GENERIC_ERROR',
                userMessage: 'An unexpected error occurred. Please try again.'
            };
        },

        classifyFirebaseError(error, context) {
            const errorMap = {
                'unavailable': {
                    type: this.ERROR_TYPES.NETWORK,
                    message: 'Database service unavailable.',
                    code: 'FIREBASE_UNAVAILABLE',
                    userMessage: 'Service temporarily unavailable. Please try again.'
                },
                'permission-denied': {
                    type: this.ERROR_TYPES.PERMISSION,
                    message: 'Permission denied.',
                    code: 'FIREBASE_PERMISSION',
                    userMessage: 'Access denied. Please contact support.'
                },
                'not-found': {
                    type: this.ERROR_TYPES.NOT_FOUND,
                    message: 'Admin account not found.',
                    code: 'FIREBASE_NOT_FOUND',
                    userMessage: 'Admin not found. Please check credentials.'
                }
            };
            
            return errorMap[error.code] || {
                type: this.ERROR_TYPES.SERVER,
                message: 'Database error.',
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
                }, "adminLoginApp");
                
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
        async login(username, password, apiToken) {
            if (!state.db) {
                throw new Error('Database not initialized');
            }
            
            try {
                PerformanceMonitor.start('admin_login');
                
                const adminsRef = state.db.collection('admins');
                
                // Query: Find admin by username first
                const usernameQuery = await adminsRef
                    .where('username', '==', username)
                    .limit(1)
                    .get();
                
                if (usernameQuery.empty) {
                    PerformanceMonitor.end('admin_login');
                    
                    return { 
                        success: false, 
                        message: 'Admin username not found'
                    };
                }
                
                const adminDoc = usernameQuery.docs[0];
                const adminData = adminDoc.data();
                
                // Verify password
                if (adminData.password !== password) {
                    PerformanceMonitor.end('admin_login');
                    
                    return { 
                        success: false, 
                        message: 'Incorrect admin password'
                    };
                }
                
                // Verify API token
                if (adminData.apiToken !== apiToken) {
                    PerformanceMonitor.end('admin_login');
                    
                    return { 
                        success: false, 
                        message: 'Invalid admin API token'
                    };
                }
                
                // Update last login (non-blocking)
                adminsRef.doc(adminDoc.id).update({
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                }).catch(err => console.warn('Could not update last login:', err));
                
                PerformanceMonitor.end('admin_login');
                
                return {
                    success: true,
                    admin: {
                        id: adminDoc.id,
                        username: adminData.username,
                        email: adminData.email,
                        apiToken: adminData.apiToken,
                        firstName: adminData.firstName || '',
                        lastName: adminData.lastName || '',
                        phoneNumber: adminData.phoneNumber || '',
                        role: adminData.role || 'regular',
                        permissions: adminData.permissions || {}
                    }
                };
                
            } catch (error) {
                console.error('Admin login error:', error);
                const classifiedError = ErrorManager.classify(error, 'admin_login');
                throw new Error(classifiedError.userMessage);
            }
        }
    };

// ========== SESSION MANAGER ( WITH AVATAR SUPPORT) ==========
// ========== SESSION MANAGER (WITH AVATAR PERSISTENCE) ==========
const sessionManager = {
    async create(admin) {
        // Fetch avatar data from Firestore before creating session
        let avatarIcon = null;
        let avatarBgColor = '#10b981';
        let avatarBgGradient = true;
        
        try {
            if (state.db) {
                const adminDoc = await state.db.collection('admins').doc(admin.id).get();
                if (adminDoc.exists) {
                    const data = adminDoc.data();
                    avatarIcon = data.avatarIcon || null;
                    avatarBgColor = data.avatarBgColor || '#10b981';
                    avatarBgGradient = data.avatarBgGradient !== undefined ? data.avatarBgGradient : true;
                }
            }
        } catch (e) {
            console.warn('Could not load avatar data:', e);
        }

        // Get initials
        const first = (admin.firstName || '')[0] || '';
        const last = (admin.lastName || '')[0] || '';
        const initials = (first + last).toUpperCase() || (admin.username || 'AD').substring(0, 2).toUpperCase();

        const session = {
            id: admin.id,
            username: admin.username,
            email: admin.email,
            firstName: admin.firstName || '',
            lastName: admin.lastName || '',
            phoneNumber: admin.phoneNumber || '',
            apiToken: admin.apiToken,
            role: admin.role || 'regular',
            permissions: admin.permissions || {},
            loginTime: Date.now(),
            // Avatar data in session
            avatarIcon: avatarIcon,
            avatarBgColor: avatarBgColor,
            avatarBgGradient: avatarBgGradient
        };
        
        try {
            sessionStorage.setItem('breathsafeAdmin', JSON.stringify(session));
            sessionStorage.setItem('breathsafeAdminToken', admin.apiToken);
        } catch (e) {
            console.warn('Session storage is unavailable.');
        }
        
        localStorage.setItem('breathsafeAdminUsername', admin.username);
        localStorage.setItem('lastAdminToken', admin.apiToken);
        
        // ⭐ CRITICAL FIX: Save avatar to localStorage for persistence
        const avatarState = {
            icon: avatarIcon,
            color: avatarBgColor,
            gradient: avatarBgGradient,
            initials: initials,
            timestamp: Date.now()
        };
        localStorage.setItem('breathsafe_avatar_v4', JSON.stringify(avatarState));
    },

    redirectToDashboard() {
        console.log('Redirecting to admin dashboard...');
        window.location.href = '../admin-dashboard.html';
    }
};
    // ========== PREFILL MANAGER () ==========
    const prefillManager = {
        check() {
            const prefillValue = sessionStorage.getItem('adminPrefillValue');
            const prefillType = sessionStorage.getItem('adminPrefillType');
            
            if (prefillValue && prefillType) {
                console.log(`Pre-filling ${prefillType} with:`, prefillValue);
                
                if (prefillType === 'username') {
                    this.fillUsername(prefillValue);
                } else if (prefillType === 'token') {
                    this.fillToken(prefillValue);
                }
                
                sessionStorage.removeItem('adminPrefillValue');
                sessionStorage.removeItem('adminPrefillType');
            }
        },

        fillUsername(value) {
            const usernameInput = ElementCache.get('adminUsername');
            if (!usernameInput) return;
            
            usernameInput.value = value;
            this.addVisualEffect(usernameInput);
            
            const passwordInput = ElementCache.get('adminPassword');
            if (passwordInput) passwordInput.focus();
            
            uiManager.showMessage('Username pre-filled. Enter your password and API token.', 'info');
        },

        fillToken(value) {
            const tokenInput = ElementCache.get('adminAPI');
            if (!tokenInput) return;
            
            tokenInput.value = value;
            this.addVisualEffect(tokenInput);
            
            const usernameInput = ElementCache.get('adminUsername');
            if (usernameInput) usernameInput.focus();
            
            uiManager.showMessage('API token pre-filled. Enter your username and password.', 'info');
        },

        addVisualEffect(input) {
            input.style.background = 'rgba(16, 185, 129, 0.1)';
            input.style.borderColor = '#10b981';
            
            setTimeout(() => {
                input.style.background = '';
                input.style.borderColor = '';
            }, 2000);
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

        togglePassword() {
            const passwordInput = ElementCache.get('adminPassword');
            const toggleBtn = ElementCache.get('togglePassword');
            
            if (!passwordInput || !toggleBtn) return;
            
            const type = passwordInput.type === 'password' ? 'text' : 'password';
            passwordInput.type = type;
            
            const icon = toggleBtn.querySelector('i');
            if (icon) {
                icon.className = type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
            }
        },

        showLockoutTimer(remainingTime) {
            const lockoutDiv = ElementCache.get('adminLockoutTimer');
            const countdownDiv = ElementCache.get('adminLockoutCountdown');
            const loginBtn = ElementCache.get('loginBtn');
            
            if (!lockoutDiv || !countdownDiv) return;
            
            if (remainingTime <= 0) {
                domBatcher.add(() => {
                    lockoutDiv.classList.remove('active');
                    if (loginBtn) loginBtn.disabled = false;
                });
                
                const maxAttempts = state.lockoutManager.getMaxAttempts();
                this.showMessage(
                    `Admin lockout expired. You have ${maxAttempts} attempt${maxAttempts !== 1 ? 's' : ''} available.`, 
                    'info'
                );
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
            const lockoutDiv = ElementCache.get('adminLockoutTimer');
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
        handleTokenInput: null,

        async handleSubmit(e, elements) {
            e.preventDefault();
            
            PerformanceMonitor.start('form_submit');
            
            const { usernameInput, passwordInput, apiInput, loginBtn, btnContent, btnLoading } = elements;
            
            // Check if locked
            if (state.lockoutManager.isLocked()) {
                const remaining = state.lockoutManager.getRemainingLockTime();
                const minutes = Math.ceil(remaining / 60000);
                uiManager.showMessage(
                    `Admin account locked for security. Please wait ${minutes} minute${minutes !== 1 ? 's' : ''}.`, 
                    'error'
                );
                PerformanceMonitor.end('form_submit');
                return;
            }
            
            const username = usernameInput.value.trim();
            const password = passwordInput.value.trim();
            const apiToken = apiInput.value.trim();
            
            if (!username || !password || !apiToken) {
                uiManager.showMessage('All fields are required', 'error');
                PerformanceMonitor.end('form_submit');
                return;
            }
            
            // Validate inputs
            const usernameValidation = InputValidator.validateUsername(username);
            if (!usernameValidation.valid) {
                uiManager.showMessage(usernameValidation.message, 'error');
                PerformanceMonitor.end('form_submit');
                return;
            }
            
            const passwordValidation = InputValidator.validatePassword(password);
            if (!passwordValidation.valid) {
                uiManager.showMessage(passwordValidation.message, 'error');
                PerformanceMonitor.end('form_submit');
                return;
            }
            
            const tokenValidation = InputValidator.validateApiToken(apiToken);
            if (!tokenValidation.valid) {
                uiManager.showMessage(tokenValidation.message, 'error');
                PerformanceMonitor.end('form_submit');
                return;
            }
            
            loginBtn.disabled = true;
            domBatcher.add(() => {
                if (btnContent) btnContent.style.display = 'none';
                if (btnLoading) btnLoading.style.display = 'flex';
            });
            
            try {
                uiManager.showMessage('Verifying admin credentials...', 'info');
                
                const result = await loginManager.login(
                    usernameValidation.sanitized,
                    passwordValidation.sanitized,
                    tokenValidation.sanitized
                );
                
                if (result.success) {
                    // Successful login
                    state.lockoutManager.recordSuccessfulLogin();
                    uiManager.hideLockoutTimer();
                    
                    uiManager.showMessage('Admin authentication successful! Redirecting...', 'success');
                    sessionStorage.setItem('shouldLogLogin', 'true');
// NEW CODE:
await sessionManager.create(result.admin);

setTimeout(() => {
    sessionManager.redirectToDashboard();
}, 1500);
                } else {
                    // Failed login
                    const lockoutResult = state.lockoutManager.recordFailedAttempt();
                    
                    if (lockoutResult.locked) {
                        // ⭐ RECORD ADMIN LOCKOUT TO SECURITY SYSTEM
                        console.log(`🔒 Admin lockout #${lockoutResult.lockoutCount} triggered - recording to security...`);
                        if (window.LoginSecurityCheck && typeof window.LoginSecurityCheck.recordLockoutAttempt === 'function') {
                            try {
                                await window.LoginSecurityCheck.recordLockoutAttempt('admin', username);
                                console.log('✅ Admin lockout recorded to security system');
                            } catch (secError) {
                                console.error('❌ Failed to record admin lockout:', secError);
                            }
                        } else {
                            console.warn('⚠️ LoginSecurityCheck not available');
                        }
                        
                        uiManager.showMessage(
                            `Too many failed admin login attempts. Account locked for ${lockoutResult.lockoutMinutes} minutes for security.`, 
                            'error'
                        );
                        
                        state.lockoutManager.startCountdown((remaining) => {
                            uiManager.showLockoutTimer(remaining);
                        });
                    } else {
                        const attemptText = lockoutResult.remainingAttempts === 1 ? 'attempt' : 'attempts';
                        uiManager.showMessage(
                            `${result.message}<br><small style="margin-top:8px;display:block"><i class="fas fa-shield-alt"></i> ${lockoutResult.remainingAttempts} ${attemptText} remaining</small>`, 
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
                console.error('Error:', error);
                const classifiedError = ErrorManager.classify(error, 'admin_submit');
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
        console.time('BreathSafe Admin Initialize');
        
        themeManager.load();
        
        // Initialize lockout manager
        state.lockoutManager = new AdminLockoutManager(
            APP_CONFIG.SECURITY.LOCKOUT.ADMIN.STORAGE_KEY,
            {
                initialAttempts: APP_CONFIG.SECURITY.LOCKOUT.ADMIN.INITIAL_ATTEMPTS,
                subsequentAttempts: APP_CONFIG.SECURITY.LOCKOUT.ADMIN.SUBSEQUENT_ATTEMPTS,
                duration: APP_CONFIG.SECURITY.LOCKOUT.ADMIN.DURATION
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
                `Admin account locked for security. Please wait ${minutes} minute${minutes !== 1 ? 's' : ''}.`, 
                'error'
            );
        }
        
        const connected = await firebaseManager.init();
        if (!connected) return;
        
        // Check and pre-fill from main login
        prefillManager.check();
        
        // Event delegation for theme toggle
        document.addEventListener('click', (e) => {
            if (e.target.id === 'themeToggle') {
                themeManager.toggle();
            } else if (e.target.id === 'togglePassword') {
                uiManager.togglePassword();
            }
        });
        
        const form = ElementCache.get('adminLoginForm');
        const loginBtn = ElementCache.get('loginBtn');
        const btnContent = loginBtn?.querySelector('.btn-content');
        const btnLoading = loginBtn?.querySelector('.btn-loading');
        const apiInput = ElementCache.get('adminAPI');
        
        if (!form || !loginBtn) {
            console.error('Form elements not found');
            return;
        }
        
        if (apiInput) {
            formHandlers.handleTokenInput = eventHandlers.getDebounced(
                'token_validation',
                (value) => {
                    const validation = InputValidator.validateApiToken(value);
                    const tokenValidation = ElementCache.get('tokenValidation');
                    if (!tokenValidation) return;
                    
                    domBatcher.add(() => {
                        if (!value) {
                            tokenValidation.style.display = 'none';
                            return;
                        }
                        
                        if (validation.valid) {
                            tokenValidation.className = 'validation-status success';
                            tokenValidation.innerHTML = '<i class="fas fa-check-circle"></i> Valid token format';
                            tokenValidation.style.display = 'block';
                        } else {
                            tokenValidation.className = 'validation-status error';
                            tokenValidation.innerHTML = '<i class="fas fa-exclamation-circle"></i> Enter 64 hexadecimal characters';
                            tokenValidation.style.display = 'block';
                        }
                    });
                },
                APP_CONFIG.PERFORMANCE.DEBOUNCE.VALIDATION
            );

            apiInput.addEventListener('input', (e) => {
                formHandlers.handleTokenInput(e.target.value.trim());
            }, { passive: true });
        }
        
        form.addEventListener('submit', (e) => {
            formHandlers.handleSubmit(e, {
                usernameInput: ElementCache.get('adminUsername'),
                passwordInput: ElementCache.get('adminPassword'),
                apiInput,
                loginBtn,
                btnContent,
                btnLoading
            });
        });
        
        // Clear error messages on input
        const inputs = [
            ElementCache.get('adminUsername'),
            ElementCache.get('adminPassword'),
            apiInput
        ];
        
        inputs.forEach(input => {
            if (input) {
                input.addEventListener('input', () => {
                    const messageDiv = ElementCache.get('message');
                    if (messageDiv && messageDiv.className && messageDiv.className.includes('error')) {
                        messageDiv.style.display = 'none';
                    }
                }, { passive: true });
                
                input.addEventListener('focus', (e) => {
                    if (e.target.parentElement) {
                        e.target.parentElement.style.transform = 'scale(1.01)';
                    }
                }, { passive: true });
                
                input.addEventListener('blur', (e) => {
                    if (e.target.parentElement) {
                        e.target.parentElement.style.transform = 'scale(1)';
                    }
                }, { passive: true });
            }
        });
        
        console.timeEnd('BreathSafe Admin Initialize');
    }

    // ========== START APPLICATION ==========
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    // Expose for debugging
    if (typeof window !== 'undefined') {
        window.BreathSafeAdminLogin = {
            performance: PerformanceMonitor,
            InputValidator,
            InputSanitizer,
            ErrorManager,
            lockout: {
                isLocked: () => state.lockoutManager.isLocked(),
                getData: () => state.lockoutManager.getData(),
                clear: () => state.lockoutManager.clearAll(),
                getMaxAttempts: () => state.lockoutManager.getMaxAttempts()
            }
        };
    }

    console.timeEnd('BreathSafe Admin Login Load');

})();
