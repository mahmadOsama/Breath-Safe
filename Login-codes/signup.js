// ==========================================
// BreathSafe user registration interface
// Username: 3-20 chars (a-z, 0-9, _, .)
// Names: 3-20 chars (a-z, spaces)
// ==========================================

(function() {
    'use strict';
    
    console.log('BreathSafe Signup Loading...');

    // ========== CONFIGURATION ==========
    const APP_CONFIG = {
        APP: {
            NAME: 'BreathSafe',
            VERSION: '1.0.0'
        },
        VALIDATION: {
            USERNAME: {
                MIN_LENGTH: 3,
                MAX_LENGTH: 20,
                MIN_LETTERS: 3,
                ALLOWED_CHARS: /^[a-zA-Z0-9_.]+$/,
                START_PATTERN: /^[a-zA-Z0-9]/,
                END_PATTERN: /[a-zA-Z0-9]$/,
                NO_ALL_NUMBERS: /^\d+$/,
                NO_CONSECUTIVE_SPECIAL: /[_.]{2,}/,
                VALID_SPECIAL_CHARS: ['_', '.'],
                // API Token patterns to block
                API_TOKEN_PATTERNS: [
                    /^[A-F0-9]{64}$/i,
                    /^[A-Z0-9]{2,5}-[A-Z0-9]{2,6}-[A-Z0-9]{2,8}$/i,
                    /^[A-Z0-9]{3,4}-[A-Z0-9]{3,5}-[A-Z0-9]{3,6}$/i,
                    /^[A-Z]+-[A-Z]+-[A-Z]+$/i,
                    /^[A-Z0-9]+-ADMIN-[A-Z0-9]+$/i,
                    /^[A-Z0-9]+-USER-[A-Z0-9]+$/i,
                    /^[A-Z0-9]+-MASTER$/i,
                    /^[A-Z0-9]+-TOKEN$/i,
                    /^[A-Z0-9]+-API$/i,
                    /^API-[A-Z0-9]+$/i,
                    /^TOKEN-[A-Z0-9]+$/i,
                    /^USER-[A-Z0-9]+-[A-Z0-9]+$/i,
                    /^ADMIN-[A-Z0-9]+-[A-Z0-9]+$/i,
                    /^[A-Z]{2,4}-[A-Z]{2,5}-[A-Z]{2,6}$/,
                ],
                BLOCKED_KEYWORDS: ['ADMIN', 'MASTER', 'TOKEN', 'API', 'KEY', 'SECRET', 'AUTH']
            },
            NAME: {
                MIN_LENGTH: 3,
                MAX_LENGTH: 20,
                ALLOWED_CHARS: /^[a-zA-Z\s]+$/
            },
            EMAIL: {
                PATTERN: /^[a-zA-Z0-9._%-]+@gmail\.com$/,
                MAX_LENGTH: 254
            },
            PHONE: {
                LENGTH: 9,
                VALID_PREFIXES: ['77', '78', '79'],
                OPERATORS: {
                    '77': 'Orange',
                    '78': 'Umniah', 
                    '79': 'Zain'
                },
                PATTERN: /^\d+$/
            }
        },
        PERFORMANCE: {
            DEBOUNCE: {
                INPUT: 300,
                USERNAME_CHECK: 400,
                EMAIL_CHECK: 500,
                PHONE_CHECK: 800
            },
            CACHE: {
                TTL: 5 * 60 * 1000
            }
        }
    };

    // ========== INPUT SANITIZER ==========
    const InputSanitizer = {
        sanitizeUsername(username) {
            if (!username || typeof username !== 'string') {
                throw new Error('Username must be a valid string');
            }
            
            const sanitized = username
                .trim()
                .replace(/[^a-zA-Z0-9_.]/g, '')
                .substring(0, APP_CONFIG.VALIDATION.USERNAME.MAX_LENGTH);
                
            if (!sanitized) {
                throw new Error('Username cannot be empty after sanitization');
            }
            
            if (!APP_CONFIG.VALIDATION.USERNAME.ALLOWED_CHARS.test(sanitized)) {
                throw new Error('Username can only contain letters (a-z), numbers (0-9), underscores (_), and periods (.)');
            }
            
            return sanitized;
        },

        sanitizeName(name) {
            if (!name || typeof name !== 'string') {
                throw new Error('Name must be a valid string');
            }
            
            const sanitized = name
                .trim()
                .replace(/[^a-zA-Z\s]/g, '')
                .replace(/\s+/g, ' ')
                .substring(0, APP_CONFIG.VALIDATION.NAME.MAX_LENGTH);
                
            if (!sanitized || sanitized.length === 0) {
                throw new Error('Name cannot be empty after sanitization');
            }
            
            if (!APP_CONFIG.VALIDATION.NAME.ALLOWED_CHARS.test(sanitized)) {
                throw new Error('Name can only contain letters and spaces');
            }
            
            return sanitized;
        },

        sanitizeEmail(email) {
            if (!email || typeof email !== 'string') {
                throw new Error('Email must be a valid string');
            }
            
            const sanitized = email
                .trim()
                .toLowerCase()
                .substring(0, APP_CONFIG.VALIDATION.EMAIL.MAX_LENGTH);
                
            if (!sanitized) {
                throw new Error('Email cannot be empty');
            }
            
            if (!sanitized.includes('@') || !sanitized.includes('.')) {
                throw new Error('Email must contain @ and domain');
            }
            
            if (!APP_CONFIG.VALIDATION.EMAIL.PATTERN.test(sanitized)) {
                throw new Error('Only Gmail addresses are allowed (@gmail.com)');
            }
            
            return sanitized;
        },

        sanitizePhone(phone) {
            if (!phone || typeof phone !== 'string') {
                throw new Error('Phone number must be a valid string');
            }
            
            let sanitized = phone.replace(/\D/g, '');
            
            if (sanitized.startsWith('0')) {
                sanitized = sanitized.substring(1);
            }
            
            sanitized = sanitized.substring(0, APP_CONFIG.VALIDATION.PHONE.LENGTH);
            
            if (!sanitized) {
                throw new Error('Phone number cannot be empty');
            }
            
            if (!APP_CONFIG.VALIDATION.PHONE.PATTERN.test(sanitized)) {
                throw new Error('Phone number can only contain digits');
            }
            
            return sanitized;
        },

        escapeHtml(text) {
            if (!text || typeof text !== 'string') {
                return '';
            }
            
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    };

    // ========== INPUT VALIDATOR ==========
    const InputValidator = {
        validateUsername(username) {
            try {
                if (!username) {
                    return {
                        valid: false,
                        message: 'Username is required',
                        code: 'EMPTY',
                        isApiToken: false
                    };
                }
                
                const config = APP_CONFIG.VALIDATION.USERNAME;
                const trimmed = username.trim();
                
                // ========== CRITICAL: API TOKEN DETECTION ==========
                const upperInput = trimmed.toUpperCase();
                
                // Check against API token patterns
                for (const pattern of config.API_TOKEN_PATTERNS) {
                    if (pattern.test(trimmed)) {
                        return {
                            valid: false,
                            message: '⚠️ SECURITY ERROR: This looks like an API Token, not a username! API tokens cannot be used as usernames.',
                            code: 'API_TOKEN_DETECTED',
                            isApiToken: true,
                            critical: true
                        };
                    }
                }
                
                // Check for blocked keywords in dash-separated format
                if (trimmed.includes('-')) {
                    const parts = upperInput.split('-');
                    for (const part of parts) {
                        if (config.BLOCKED_KEYWORDS.includes(part)) {
                            return {
                                valid: false,
                                message: `⚠️ SECURITY ERROR: "${part}" is a reserved keyword. This looks like an API Token!`,
                                code: 'API_TOKEN_KEYWORD',
                                isApiToken: true,
                                critical: true
                            };
                        }
                    }
                }
                
                // Check for XXX-XXX-XXX pattern
                const dashPattern = /^[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+$/i;
                if (dashPattern.test(trimmed)) {
                    return {
                        valid: false,
                        message: '⚠️ SECURITY ERROR: This format (XXX-XXX-XXX) is reserved for API Tokens!',
                        code: 'API_TOKEN_FORMAT',
                        isApiToken: true,
                        critical: true
                    };
                }
                
                // Check for XX-XX pattern
                const twoPartPattern = /^[A-Z0-9]{3,}-[A-Z0-9]{3,}$/i;
                if (twoPartPattern.test(trimmed) && trimmed.length > 8) {
                    const upperRatio = (trimmed.match(/[A-Z]/g) || []).length / trimmed.replace(/-/g, '').length;
                    if (upperRatio > 0.7) {
                        return {
                            valid: false,
                            message: '⚠️ SECURITY ERROR: This looks like an API Token format!',
                            code: 'API_TOKEN_SUSPECTED',
                            isApiToken: true,
                            critical: true
                        };
                    }
                }
                // ========== END API TOKEN DETECTION ==========
                
                // Sanitize
                const sanitized = InputSanitizer.sanitizeUsername(trimmed);
                
                if (sanitized.length < config.MIN_LENGTH) {
                    return {
                        valid: false,
                        message: `Minimum ${config.MIN_LENGTH} characters required`,
                        code: 'TOO_SHORT',
                        isApiToken: false
                    };
                }
                
                if (sanitized.length > config.MAX_LENGTH) {
                    return {
                        valid: false,
                        message: `Maximum ${config.MAX_LENGTH} characters allowed`,
                        code: 'TOO_LONG',
                        isApiToken: false
                    };
                }
                
                if (!config.START_PATTERN.test(sanitized)) {
                    return {
                        valid: false,
                        message: 'Must start with a letter or number',
                        code: 'INVALID_START',
                        isApiToken: false
                    };
                }
                
                if (!config.END_PATTERN.test(sanitized)) {
                    return {
                        valid: false,
                        message: 'Must end with a letter or number',
                        code: 'INVALID_END',
                        isApiToken: false
                    };
                }
                
                if (config.NO_ALL_NUMBERS.test(sanitized)) {
                    return {
                        valid: false,
                        message: 'Username cannot be all numbers',
                        code: 'ALL_NUMBERS',
                        isApiToken: false
                    };
                }
                
                if (config.NO_CONSECUTIVE_SPECIAL.test(sanitized)) {
                    return {
                        valid: false,
                        message: 'Cannot have consecutive underscores or periods',
                        code: 'CONSECUTIVE_SPECIAL',
                        isApiToken: false
                    };
                }
                
                const letterCount = (sanitized.match(/[a-zA-Z]/g) || []).length;
                if (letterCount < config.MIN_LETTERS) {
                    return {
                        valid: false,
                        message: `Must contain at least ${config.MIN_LETTERS} letters`,
                        code: 'INSUFFICIENT_LETTERS',
                        isApiToken: false
                    };
                }
                
                return {
                    valid: true,
                    message: 'Valid username format',
                    code: 'VALID',
                    sanitized: sanitized,
                    isApiToken: false
                };
            } catch (error) {
                return {
                    valid: false,
                    message: error.message,
                    code: 'SANITIZATION_ERROR',
                    isApiToken: false
                };
            }
        },

        validateName(name, fieldName = 'Name') {
            try {
                if (!name) {
                    return {
                        valid: false,
                        message: `${fieldName} is required`,
                        code: 'EMPTY'
                    };
                }
                
                const sanitized = InputSanitizer.sanitizeName(name);
                const config = APP_CONFIG.VALIDATION.NAME;
                
                if (sanitized.length < config.MIN_LENGTH) {
                    return {
                        valid: false,
                        message: `Minimum ${config.MIN_LENGTH} characters required`,
                        code: 'TOO_SHORT'
                    };
                }
                
                if (sanitized.length > config.MAX_LENGTH) {
                    return {
                        valid: false,
                        message: `Maximum ${config.MAX_LENGTH} characters allowed`,
                        code: 'TOO_LONG'
                    };
                }
                
                if (sanitized.trim().length === 0) {
                    return {
                        valid: false,
                        message: `${fieldName} cannot be empty`,
                        code: 'EMPTY_AFTER_TRIM'
                    };
                }
                
                return {
                    valid: true,
                    message: `Valid ${fieldName.toLowerCase()}`,
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

        validateEmail(email) {
            try {
                if (!email) {
                    return {
                        valid: false,
                        message: 'Email is required',
                        code: 'EMPTY'
                    };
                }
                
                const sanitized = InputSanitizer.sanitizeEmail(email);
                const config = APP_CONFIG.VALIDATION.EMAIL;
                
                if (!email.includes('@')) {
                    return {
                        valid: false,
                        message: 'Email must contain @',
                        code: 'MISSING_AT'
                    };
                }
                
                if (!email.endsWith('@gmail.com')) {
                    return {
                        valid: false,
                        message: 'Only Gmail addresses allowed (@gmail.com)',
                        code: 'NOT_GMAIL'
                    };
                }
                
                if (!config.PATTERN.test(sanitized)) {
                    return {
                        valid: false,
                        message: 'Invalid Gmail format',
                        code: 'INVALID_FORMAT'
                    };
                }
                
                return {
                    valid: true,
                    message: 'Valid Gmail address',
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

        validatePhone(phone) {
            try {
                if (!phone || phone.length === 0) {
                    return {
                        valid: false,
                        message: 'Phone number is required',
                        operator: null,
                        code: 'EMPTY'
                    };
                }
                
                const sanitized = InputSanitizer.sanitizePhone(phone);
                const config = APP_CONFIG.VALIDATION.PHONE;
                
                if (sanitized.length !== config.LENGTH) {
                    return {
                        valid: false,
                        message: `Must be exactly ${config.LENGTH} digits`,
                        operator: null,
                        code: 'INVALID_LENGTH'
                    };
                }
                
                if (!config.PATTERN.test(sanitized)) {
                    return {
                        valid: false,
                        message: 'Only numbers allowed',
                        operator: null,
                        code: 'INVALID_FORMAT'
                    };
                }
                
                const prefix = sanitized.substring(0, 2);
                if (!config.VALID_PREFIXES.includes(prefix)) {
                    return {
                        valid: false,
                        message: 'Must start with 77 (Orange), 78 (Umniah), or 79 (Zain)',
                        operator: null,
                        code: 'INVALID_PREFIX'
                    };
                }
                
                if (/^(\d)\1{8}$/.test(sanitized)) {
                    return {
                        valid: false,
                        message: 'Invalid phone number (all same digits)',
                        operator: null,
                        code: 'INVALID_PATTERN'
                    };
                }
                
                const operator = config.OPERATORS[prefix];
                
                return {
                    valid: true,
                    message: `Valid phone (${operator})`,
                    operator: operator,
                    code: 'VALID',
                    sanitized: sanitized
                };
            } catch (error) {
                return {
                    valid: false,
                    message: error.message,
                    operator: null,
                    code: 'SANITIZATION_ERROR'
                };
            }
        }
    };

    // ========== ERROR MANAGER ==========
    const ErrorManager = {
        ERROR_TYPES: {
            NETWORK: 'NETWORK_ERROR',
            VALIDATION: 'VALIDATION_ERROR',
            PERMISSION: 'PERMISSION_ERROR',
            SERVER: 'SERVER_ERROR',
            UNKNOWN: 'UNKNOWN_ERROR'
        },

        classify(error, context = 'unknown') {
            if (error.code) {
                return this.classifyFirebaseError(error, context);
            }
            
            if (this.isNetworkError(error)) {
                return {
                    type: this.ERROR_TYPES.NETWORK,
                    message: 'Connection lost. Please check your internet and try again.',
                    code: 'NETWORK_UNAVAILABLE',
                    context: context
                };
            }
            
            if (this.isValidationError(error)) {
                return {
                    type: this.ERROR_TYPES.VALIDATION,
                    message: error.message || 'Please check your input and try again.',
                    code: 'VALIDATION_FAILED',
                    context: context
                };
            }
            
            return {
                type: this.ERROR_TYPES.UNKNOWN,
                message: 'An unexpected error occurred. Please try again.',
                code: 'GENERIC_ERROR',
                context: context
            };
        },

        classifyFirebaseError(error, context) {
            switch (error.code) {
                case 'unavailable':
                case 'deadline-exceeded':
                    return {
                        type: this.ERROR_TYPES.NETWORK,
                        message: 'Database service unavailable. Please try again later.',
                        code: 'FIREBASE_UNAVAILABLE',
                        context: context
                    };
                
                case 'permission-denied':
                    return {
                        type: this.ERROR_TYPES.PERMISSION,
                        message: 'Permission denied. Please contact support.',
                        code: 'FIREBASE_PERMISSION',
                        context: context
                    };
                
                case 'not-found':
                    return {
                        type: this.ERROR_TYPES.VALIDATION,
                        message: 'Record not found.',
                        code: 'FIREBASE_NOT_FOUND',
                        context: context
                    };
                
                default:
                    return {
                        type: this.ERROR_TYPES.SERVER,
                        message: 'Database error. Please try again.',
                        code: 'FIREBASE_ERROR',
                        context: context
                    };
            }
        },

        isNetworkError(error) {
            const message = error.message?.toLowerCase() || '';
            return ['network', 'connection', 'timeout', 'offline', 'fetch'].some(
                indicator => message.includes(indicator)
            );
        },

        isValidationError(error) {
            const message = error.message?.toLowerCase() || '';
            return ['validation', 'invalid', 'required', 'format'].some(
                indicator => message.includes(indicator)
            );
        }
    };

    // ========== STATE ==========
    const state = {
        db: null,
        cache: new Map(),
        pendingRequests: new Map()
    };

    // ========== UTILITIES ==========
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    class CacheManager {
        constructor(ttl) {
            this.cache = new Map();
            this.ttl = ttl;
        }

        set(key, value) {
            this.cache.set(key, {
                value,
                timestamp: Date.now()
            });
        }

        get(key) {
            const item = this.cache.get(key);
            if (!item) return null;
            
            if (Date.now() - item.timestamp > this.ttl) {
                this.cache.delete(key);
                return null;
            }
            
            return item.value;
        }

        clear() {
            this.cache.clear();
        }
    }

    const cache = new CacheManager(APP_CONFIG.PERFORMANCE.CACHE.TTL);

    async function dedupedRequest(key, requestFn) {
        const cached = cache.get(key);
        if (cached !== null) return cached;

        if (state.pendingRequests.has(key)) {
            return state.pendingRequests.get(key);
        }

        const promise = requestFn().then(result => {
            cache.set(key, result);
            state.pendingRequests.delete(key);
            return result;
        }).catch(error => {
            state.pendingRequests.delete(key);
            throw error;
        });

        state.pendingRequests.set(key, promise);
        return promise;
    }

    // ========== FIREBASE ==========
    let firebasePromise = null;
    function loadFirebase() {
        if (firebasePromise) return firebasePromise;
        
        firebasePromise = new Promise((resolve, reject) => {
            if (typeof firebase !== 'undefined') {
                resolve(firebase);
            } else {
                const checkFirebase = setInterval(() => {
                    if (typeof firebase !== 'undefined') {
                        clearInterval(checkFirebase);
                        resolve(firebase);
                    }
                }, 100);
                
                setTimeout(() => {
                    clearInterval(checkFirebase);
                    reject(new Error('Firebase failed to load'));
                }, 10000);
            }
        });
        
        return firebasePromise;
    }

    // ========== ICONS ==========
    const icons = {
        success: '<i class="fas fa-check-circle"></i>',
        error: '<i class="fas fa-exclamation-circle"></i>',
        info: '<i class="fas fa-info-circle"></i>',
        warning: '<i class="fas fa-exclamation-triangle"></i>',
        loading: '<i class="fas fa-spinner fa-spin"></i>',
        check: '<i class="fas fa-check"></i>',
        times: '<i class="fas fa-times"></i>',
        lightbulb: '<i class="fas fa-lightbulb"></i>',
        shield: '<i class="fas fa-shield-exclamation"></i>',
        ban: '<i class="fas fa-ban"></i>'
    };

    function createMessageWithIcon(type, text) {
        return `${icons[type] || ''} ${text}`;
    }

// ========== THEME ==========
const themeManager = {
    init() {
        // Load saved theme
        const theme = localStorage.getItem('theme') || 'light';
        document.body.classList.remove('light', 'dark');
        document.body.classList.add(theme);
        this.updateIcon();
    },
    
    toggle() {
        const isDark = document.body.classList.contains('dark');
        
        if (isDark) {
            document.body.classList.remove('dark');
            document.body.classList.add('light');
            localStorage.setItem('theme', 'light');
        } else {
            document.body.classList.remove('light');
            document.body.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        }
        
        this.updateIcon();
    },
    
    updateIcon() {
        const themeIcon = document.getElementById('themeIcon');
        if (themeIcon) {
            const isDark = document.body.classList.contains('dark');
            themeIcon.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
        }
    },
    
    load() {
        this.init();
    }
};

    // ========== FIREBASE MANAGER ==========
    const firebaseManager = {
        async init() {
            try {
                const firebase = await loadFirebase();
                const app = firebase.initializeApp({
                    apiKey: "YOUR_FIREBASE_WEB_API_KEY",
                    authDomain: "YOUR_FIREBASE_PROJECT_ID.firebaseapp.com",
                    databaseURL: "https://YOUR_FIREBASE_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app",
                    projectId: "YOUR_FIREBASE_PROJECT_ID",
                    storageBucket: "YOUR_FIREBASE_PROJECT_ID.firebasestorage.app",
                    messagingSenderId: "YOUR_FIREBASE_MESSAGING_SENDER_ID",
                    appId: "YOUR_FIREBASE_APP_ID",
                    measurementId: "YOUR_FIREBASE_MEASUREMENT_ID"
                }, "signupApp");
                state.db = firebase.firestore(app);
                console.log('Firebase Initialized');
                return true;
            } catch (error) {
                console.error('Firebase Error:', error);
                const classifiedError = ErrorManager.classify(error, 'firebase_init');
                uiManager.showMessage(createMessageWithIcon('error', classifiedError.message), 'error');
                return false;
            }
        },

        generateToken() {
            return window.BreathSafeSecurity.generateApiToken();
        }
    };

    // ========== SHAKE ANIMATION ==========
    const shakeInput = (input) => {
        if (!input) return;
        input.classList.add('shake-error');
        setTimeout(() => {
            input.classList.remove('shake-error');
        }, 500);
    };

    const criticalShakeInput = (input) => {
        if (!input) return;
        input.classList.add('critical-shake');
        setTimeout(() => {
            input.classList.remove('critical-shake');
        }, 1000);
    };
    // ========== DATA MANAGER ==========
    const dataManager = {
        async checkUsername(username) {
            if (!state.db || !username || username.length < APP_CONFIG.VALIDATION.USERNAME.MIN_LENGTH) {
                return null;
            }
            
            const cacheKey = `username_${username}`;
            
            try {
                return await dedupedRequest(cacheKey, async () => {
                    // Check if username exists in users or admins
                    const [usersSnapshot, adminsSnapshot] = await Promise.all([
                        state.db.collection('users').where('username', '==', username).limit(1).get(),
                        state.db.collection('admins').where('username', '==', username).limit(1).get()
                    ]);
                    
                    if (!usersSnapshot.empty || !adminsSnapshot.empty) {
                        return false; // Username taken
                    }
                    
                    // ========== CRITICAL: Check if username matches any existing API token ==========
                    const upperUsername = username.toUpperCase();
                    
                    // Check user API tokens
                    const userTokenCheck = await state.db.collection('users')
                        .where('apiToken', '==', upperUsername)
                        .limit(1)
                        .get();
                    
                    if (!userTokenCheck.empty) {
                        console.warn('⚠️ Username matches existing USER API token!');
                        return 'API_TOKEN_EXISTS';
                    }
                    
                    // Check admin API tokens
                    const adminTokenCheck = await state.db.collection('admins')
                        .where('apiToken', '==', upperUsername)
                        .limit(1)
                        .get();
                    
                    if (!adminTokenCheck.empty) {
                        console.warn('⚠️ Username matches existing ADMIN API token!');
                        return 'API_TOKEN_EXISTS';
                    }
                    // ========== END CRITICAL CHECK ==========
                    
                    return true; // Username available
                });
            } catch (error) {
                console.error('Check username error:', error);
                return null;
            }
        },

        async checkEmail(email) {
            if (!state.db || !email) return null;
            
            const cacheKey = `email_${email}`;
            
            try {
                return await dedupedRequest(cacheKey, async () => {
                    const [usersSnapshot, adminsSnapshot] = await Promise.all([
                        state.db.collection('users').where('email', '==', email).limit(1).get(),
                        state.db.collection('admins').where('email', '==', email).limit(1).get()
                    ]);
                    
                    return usersSnapshot.empty && adminsSnapshot.empty;
                });
            } catch (error) {
                return null;
            }
        },

        async checkPhoneNumber(phoneNumber) {
            if (!state.db || !phoneNumber) return null;
            
            const cacheKey = `phone_${phoneNumber}`;
            
            try {
                return await dedupedRequest(cacheKey, async () => {
                    const fullNumber = phoneNumber.startsWith('+962') ? phoneNumber : '+962' + phoneNumber;
                    
                    const [usersSnapshot, adminsSnapshot] = await Promise.all([
                        state.db.collection('users').where('phoneNumber', '==', fullNumber).limit(1).get(),
                        state.db.collection('admins').where('phoneNumber', '==', fullNumber).limit(1).get()
                    ]);
                    
                    if (!usersSnapshot.empty) {
                        const userData = usersSnapshot.docs[0].data();
                        return {
                            available: false,
                            userType: 'user',
                            email: userData.email,
                            username: userData.username
                        };
                    }
                    
                    if (!adminsSnapshot.empty) {
                        const adminData = adminsSnapshot.docs[0].data();
                        return {
                            available: false,
                            userType: 'admin',
                            email: adminData.email,
                            username: adminData.username
                        };
                    }
                    
                    return { available: true };
                });
            } catch (error) {
                console.error('Unable to check the phone number right now.');
                return null;
            }
        },

        async register(userData) {
            if (!state.db) throw new Error('Database not initialized');
            
            try {
                
                const validation = {
                    username: InputValidator.validateUsername(userData.username),
                    firstName: InputValidator.validateName(userData.firstName, 'First Name'),
                    lastName: InputValidator.validateName(userData.lastName, 'Last Name'),
                    email: InputValidator.validateEmail(userData.email),
                    phone: InputValidator.validatePhone(userData.phoneNumber)
                };
                
                const errors = Object.entries(validation).filter(([_, result]) => !result.valid);
                if (errors.length > 0) {
                    return {
                        success: false,
                        message: createMessageWithIcon('error', errors[0][1].message)
                    };
                }
                
                const sanitizedData = {
                    username: validation.username.sanitized,
                    firstName: validation.firstName.sanitized,
                    lastName: validation.lastName.sanitized,
                    email: validation.email.sanitized,
                    phoneNumber: '+962' + validation.phone.sanitized
                };
                
                const [usernameAvailable, emailAvailable, phoneCheck] = await Promise.all([
                    this.checkUsername(sanitizedData.username),
                    this.checkEmail(sanitizedData.email),
                    this.checkPhoneNumber(validation.phone.sanitized)
                ]);
                
                if (usernameAvailable === false) {
                    return { success: false, message: createMessageWithIcon('error', 'Username already exists') };
                }
                
                if (usernameAvailable === 'API_TOKEN_EXISTS') {
                    return { success: false, message: createMessageWithIcon('error', '⚠️ SECURITY ERROR: This username matches an existing API Token!') };
                }
                
                if (emailAvailable === false) {
                    return { success: false, message: createMessageWithIcon('error', 'Email already registered') };
                }
                
                if (phoneCheck && !phoneCheck.available) {
                    let message = `Phone number already registered`;
                    if (phoneCheck.email && phoneCheck.email !== sanitizedData.email) {
                        const maskedEmail = phoneCheck.email.substring(0, 3) + '***@gmail.com';
                        message = `Phone number already registered with email ${maskedEmail}`;
                    }
                    return { success: false, message: createMessageWithIcon('error', message) };
                }
                
                let apiToken = firebaseManager.generateToken();
                let isUnique = false;
                let attempts = 0;
                
                while (!isUnique && attempts < 10) {
                    const [tokenQueryUsers, tokenQueryAdmins] = await Promise.all([
                        state.db.collection('users').where('apiToken', '==', apiToken).limit(1).get(),
                        state.db.collection('admins').where('apiToken', '==', apiToken).limit(1).get()
                    ]);
                    
                    if (tokenQueryUsers.empty && tokenQueryAdmins.empty) {
                        isUnique = true;
                    } else {
                        apiToken = firebaseManager.generateToken();
                        attempts++;
                    }
                }
                
                if (!isUnique) {
                    throw new Error('Failed to generate unique API token');
                }
                
                await state.db.collection('users').doc(sanitizedData.username).set({
                    username: sanitizedData.username,
                    firstName: sanitizedData.firstName,
                    lastName: sanitizedData.lastName,
                    email: sanitizedData.email,
                    phoneNumber: sanitizedData.phoneNumber,
                    apiToken: apiToken,
                    role: 'user',
                    status: 'pending',
                    assignedSensorTypes: [],
                    welcomeCompleted: false,
                    sensorLocation: null,
                    userLocation: null,
                    setupCompletedAt: null,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    activatedAt: null,
                    activatedBy: null,
                    lastLogin: null,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                    metadata: {
                        registrationIP: await this.getIPAddress().catch(() => 'Unknown'),
                        deviceInfo: navigator.userAgent,
                        registeredAt: new Date().toISOString()
                    }
                });
                cache.clear();
                
                return {
                    success: true,
                    message: createMessageWithIcon('success', 'Account created successfully!'),
                    userId: sanitizedData.username,
                    apiToken: apiToken,
                    username: sanitizedData.username
                };
                
            } catch (error) {
                console.error('Registration error:', error);
                const classifiedError = ErrorManager.classify(error, 'register');
                throw new Error(classifiedError.message);
            }
        },

        async getIPAddress() {
            try {
                const controller = new AbortController();
                setTimeout(() => controller.abort(), 3000);
                const response = await fetch('https://api.ipify.org?format=json', { 
                    signal: controller.signal 
                });
                const data = await response.json();
                return data.ip || 'Unknown';
            } catch {
                return 'Unknown';
            }
        }      
    };

    // ========== UI MANAGER ==========
    const uiManager = {
        showMessage(msg, type) {
            const messageDiv = document.getElementById('message');
            if (!messageDiv) return;
            
            messageDiv.innerHTML = msg;
            messageDiv.className = 'modern-message ' + type;
            messageDiv.style.display = 'block';
        },

        clearMessage() {
            const messageDiv = document.getElementById('message');
            if (messageDiv) {
                messageDiv.style.display = 'none';
                messageDiv.innerHTML = '';
                messageDiv.className = 'modern-message';
            }
        },

        showSuccessModal(username, apiToken) {
            const modal = `
                <div style="
                    position: fixed;
                    inset: 0;
                    background: rgba(0,0,0,0.8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                    padding: 20px;
                    backdrop-filter: blur(5px);
                    animation: fadeIn 0.3s ease;
                " id="successModal">
                    <div style="
                        background: var(--panel);
                        border-radius: 24px;
                        padding: 40px;
                        max-width: 500px;
                        width: 100%;
                        text-align: center;
                        border: 1px solid var(--border);
                        box-shadow: 0 24px 48px rgba(0,0,0,0.3);
                        animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                    ">
                        <div style="
                            width: 80px;
                            height: 80px;
                            background: linear-gradient(135deg, #10b981, #059669);
                            border-radius: 50%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            margin: 0 auto 24px;
                            box-shadow: 0 8px 24px rgba(16,185,129,0.3);
                        ">
                            <i class="fas fa-check" style="font-size: 2.5rem; color: white;"></i>
                        </div>
                        <h2 style="font-size: 1.75rem; font-weight: 700; color: var(--text); margin-bottom: 12px;">
                            Registration Successful
                        </h2>
                        <p style="color: var(--text-muted); margin-bottom: 28px; font-size: 0.95rem;">
                            Your account has been created. Save your API token below.
                        </p>
                        
                        <div style="
                            background: var(--accent-bg);
                            border: 2px solid var(--primary);
                            border-radius: 12px;
                            padding: 20px;
                            margin-bottom: 24px;
                        ">
                            <label style="
                                display: block;
                                font-size: 0.8rem;
                                font-weight: 600;
                                color: var(--text-muted);
                                margin-bottom: 8px;
                                text-transform: uppercase;
                                letter-spacing: 0.5px;
                            ">
                                <i class="fas fa-key"></i> Your API Token
                            </label>
                            <code style="
                                display: block;
                                font-family: 'Monaco', 'Courier New', monospace;
                                font-size: 1.1rem;
                                font-weight: 700;
                                color: var(--primary);
                                background: var(--panel);
                                padding: 14px;
                                border-radius: 8px;
                                margin-bottom: 12px;
                                word-break: break-all;
                            ">${InputSanitizer.escapeHtml(apiToken)}</code>
                            <button onclick="
                                navigator.clipboard.writeText('${apiToken}');
                                this.innerHTML='<i class=\\'fas fa-check\\'></i> Copied!';
                                this.style.background='#10b981';
                                setTimeout(()=>{
                                    this.innerHTML='<i class=\\'fas fa-copy\\'></i> Copy Token';
                                    this.style.background='';
                                }, 2000);
                            " style="
                                width: 100%;
                                padding: 12px;
                                background: var(--primary);
                                color: white;
                                border: none;
                                border-radius: 8px;
                                font-weight: 600;
                                cursor: pointer;
                                transition: all 0.3s;
                                font-family: inherit;
                                font-size: 0.9rem;
                            ">
                                <i class="fas fa-copy"></i> Copy Token
                            </button>
                        </div>
                        
                        <div style="
                            background: rgba(239,68,68,0.1);
                            border: 1px solid rgba(239,68,68,0.3);
                            border-radius: 12px;
                            padding: 16px;
                            margin-bottom: 24px;
                            text-align: left;
                        ">
                            <p style="
                                font-size: 0.875rem;
                                color: var(--text);
                                margin: 0;
                                line-height: 1.6;
                            ">
                                <i class="fas fa-exclamation-triangle" style="color: var(--danger);"></i>
                                <strong>Important:</strong> Save this token! You'll need it to login.
                                Your account is pending admin activation.
                            </p>
                        </div>
                        
                        <button onclick="window.location.href='../index.html'" style="
                            width: 100%;
                            padding: 14px;
                            background: linear-gradient(135deg, #10b981, #059669);
                            color: white;
                            border: none;
                            border-radius: 12px;
                            font-weight: 600;
                            cursor: pointer;
                            font-family: inherit;
                            font-size: 1rem;
                            transition: all 0.3s;
                        ">
                            <i class="fas fa-sign-in-alt"></i> Go to Login
                        </button>
                    </div>
                </div>
                
                <style>
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    @keyframes slideUp {
                        from {
                            opacity: 0;
                            transform: translateY(30px) scale(0.95);
                        }
                        to {
                            opacity: 1;
                            transform: translateY(0) scale(1);
                        }
                    }
                </style>
            `;
            
            document.body.insertAdjacentHTML('beforeend', modal);
        },

        // ===== VISUAL STATE HELPERS =====
        setInputSuccess(input, hint, indicator, message) {
            if (input) {
                input.style.borderColor = 'var(--primary)';
                input.style.background = '';
            }
            if (hint) {
                hint.innerHTML = createMessageWithIcon('check', message);
                hint.style.color = 'var(--primary)';
            }
            if (indicator) {
                indicator.className = 'input-indicator valid';
                indicator.innerHTML = '<i class="fas fa-check"></i>';
                indicator.style.display = 'flex';
                indicator.style.color = 'var(--primary)';
            }
        },

        setInputError(input, hint, indicator, message) {
            if (input) {
                input.style.borderColor = 'var(--danger)';
                input.style.background = '';
            }
            if (hint) {
                hint.innerHTML = createMessageWithIcon('times', message);
                hint.style.color = 'var(--danger)';
            }
            if (indicator) {
                indicator.className = 'input-indicator invalid';
                indicator.innerHTML = '<i class="fas fa-times"></i>';
                indicator.style.display = 'flex';
                indicator.style.color = 'var(--danger)';
            }
        },

        setInputNeutral(input, hint, indicator, message) {
            if (input) {
                input.style.borderColor = '';
                input.style.background = '';
            }
            if (hint) {
                hint.innerHTML = createMessageWithIcon('info', message);
                hint.style.color = '';
            }
            if (indicator) {
                indicator.style.display = 'none';
            }
        },

        setInputChecking(indicator) {
            if (indicator) {
                indicator.className = 'input-indicator checking';
                indicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                indicator.style.display = 'flex';
                indicator.style.color = '';
            }
        },

        setInputCriticalError(input, hint, indicator, message, counter) {
            if (input) {
                input.value = '';
                input.style.borderColor = '#dc2626';
                input.style.background = 'rgba(220, 38, 38, 0.1)';
                criticalShakeInput(input);
            }
            if (hint) {
                hint.innerHTML = `<span style="color: #dc2626; font-weight: 700; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-exclamation-triangle"></i>
                    ${message}
                </span>`;
                hint.style.color = '#dc2626';
            }
            if (indicator) {
                indicator.className = 'input-indicator critical';
                indicator.innerHTML = '<i class="fas fa-ban" style="color: #dc2626;"></i>';
                indicator.style.display = 'flex';
                indicator.style.color = '#dc2626';
            }
            if (counter) {
                counter.textContent = `0/${APP_CONFIG.VALIDATION.USERNAME.MAX_LENGTH}`;
            }
            
            // Show critical message
            this.showMessage(`
                <div style="display: flex; align-items: flex-start; gap: 12px;">
                    <i class="fas fa-shield-alt" style="font-size: 24px; color: #dc2626;"></i>
                    <div>
                        <strong style="color: #dc2626;">SECURITY VIOLATION</strong><br>
                        <span style="font-size: 0.9em;">API Tokens cannot be used as usernames. The input has been cleared for your security.</span>
                    </div>
                </div>
            `, 'error');
            
            // Clear background after animation
            setTimeout(() => {
                if (input) input.style.background = '';
            }, 1000);
        }
    };

    // ========== USERNAME ALTERNATIVES ==========
    const usernameAlternatives = {
        generateSync(baseUsername) {
            const suggestions = [];
            const maxLength = APP_CONFIG.VALIDATION.USERNAME.MAX_LENGTH;
            const config = APP_CONFIG.VALIDATION.USERNAME;
            
            const cleanBase = baseUsername
                .toLowerCase()
                .replace(/[^a-z0-9_.]/g, '')
                .substring(0, maxLength);
            
            if (cleanBase.length < config.MIN_LENGTH) {
                return [];
            }
            
            const isValidSuggestion = (suggestion) => {
                if (!suggestion || suggestion.length < config.MIN_LENGTH || suggestion.length > maxLength) {
                    return false;
                }
                const validation = InputValidator.validateUsername(suggestion);
                return validation.valid && suggestion !== baseUsername && suggestion !== cleanBase;
            };
            
            // 1. Period separators
            if (cleanBase.length >= 4) {
                const mid = Math.floor(cleanBase.length / 2);
                const middleSplit = cleanBase.slice(0, mid) + '.' + cleanBase.slice(mid);
                if (isValidSuggestion(middleSplit)) suggestions.push(middleSplit);
                
                if (cleanBase.length >= 6) {
                    const third = Math.floor(cleanBase.length / 3);
                    const twoThird = Math.floor((cleanBase.length * 2) / 3);
                    
                    const thirdSplit = cleanBase.slice(0, third) + '.' + cleanBase.slice(third);
                    if (isValidSuggestion(thirdSplit)) suggestions.push(thirdSplit);
                    
                    const twoThirdSplit = cleanBase.slice(0, twoThird) + '.' + cleanBase.slice(twoThird);
                    if (isValidSuggestion(twoThirdSplit)) suggestions.push(twoThirdSplit);
                }
            }
            
            // 2. Underscore separators
            if (cleanBase.length >= 4) {
                const mid = Math.floor(cleanBase.length / 2);
                const underscoreSplit = cleanBase.slice(0, mid) + '_' + cleanBase.slice(mid);
                if (isValidSuggestion(underscoreSplit)) suggestions.push(underscoreSplit);
            }
            
            // 3. Prefixes
            const prefixes = ['my', 'im', 'the', 'real', 'mr', 'ms'];
            for (const prefix of prefixes) {
                if (suggestions.length >= 12) break;
                
                const withPeriod = prefix + '.' + cleanBase;
                if (isValidSuggestion(withPeriod)) suggestions.push(withPeriod);
                
                const withUnderscore = prefix + '_' + cleanBase;
                if (isValidSuggestion(withUnderscore)) suggestions.push(withUnderscore);
            }
            
            // 4. Suffixes
            const year = new Date().getFullYear().toString().slice(-2);
            const suffixes = [year, '00', '01', '99', 'x', 'v2', 'pro'];
            
            for (const suffix of suffixes) {
                if (suggestions.length >= 12) break;
                
                const spaceForBase = maxLength - suffix.length - 1;
                if (spaceForBase < config.MIN_LENGTH) continue;
                
                const truncatedBase = cleanBase.substring(0, spaceForBase);
                
                const withPeriod = truncatedBase + '.' + suffix;
                if (isValidSuggestion(withPeriod)) suggestions.push(withPeriod);
                
                const withUnderscore = truncatedBase + '_' + suffix;
                if (isValidSuggestion(withUnderscore)) suggestions.push(withUnderscore);
            }
            
            // 5. Number substitutions
            const subs = { 'a': '4', 'e': '3', 'i': '1', 'o': '0', 's': '5' };
            for (const [letter, number] of Object.entries(subs)) {
                if (suggestions.length >= 12) break;
                if (cleanBase.includes(letter)) {
                    const subbed = cleanBase.replace(new RegExp(letter, 'gi'), number);
                    if (isValidSuggestion(subbed)) {
                        suggestions.push(subbed);
                        break;
                    }
                }
            }
            
            // 6. Condensed (remove vowels)
            if (cleanBase.length >= 6) {
                const noVowels = cleanBase[0] + cleanBase.slice(1).replace(/[aeiou]/gi, '');
                if (isValidSuggestion(noVowels) && noVowels.length >= config.MIN_LENGTH) {
                    suggestions.push(noVowels);
                }
            }
            
            // 7. Numbers at end
            const nums = ['123', '321', '007', '777'];
            for (const num of nums) {
                if (suggestions.length >= 12) break;
                const spaceForBase = maxLength - num.length;
                if (spaceForBase >= config.MIN_LENGTH) {
                    const withNum = cleanBase.substring(0, spaceForBase) + num;
                    if (isValidSuggestion(withNum)) suggestions.push(withNum);
                }
            }
            
            const unique = [...new Set(suggestions)];
            unique.sort((a, b) => a.length - b.length);
            return unique.slice(0, 12);
        },

        async verify(alternatives) {
            if (!alternatives || alternatives.length === 0) return [];
            
            try {
                const checks = alternatives.map(alt => 
                    dataManager.checkUsername(alt).then(available => ({
                        username: alt,
                        available: available === true
                    }))
                );
                
                const results = await Promise.all(checks);
                return results.filter(r => r.available).map(r => r.username).slice(0, 12);
            } catch (error) {
                console.error('Error verifying alternatives:', error);
                return alternatives.slice(0, 12);
            }
        },

        display(alternatives) {
            const container = document.getElementById('usernameAlternatives');
            if (container) container.remove();
            
            if (!alternatives || alternatives.length === 0) return;
            
            const usernameInput = document.getElementById('username');
            if (!usernameInput) return;
            
            const newContainer = document.createElement('div');
            newContainer.id = 'usernameAlternatives';
            newContainer.className = 'username-alternatives-container';
            
            const header = document.createElement('div');
            header.className = 'alternatives-header';
            header.innerHTML = `
                <i class="fas fa-lightbulb"></i>
                <span>Available Suggestions (${alternatives.length})</span>
            `;
            newContainer.appendChild(header);
            
            const grid = document.createElement('div');
            grid.className = 'alternatives-grid';
            
            alternatives.forEach((alt, index) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'alternative-btn';
                btn.style.animationDelay = `${index * 0.05}s`;
                
                let icon = 'fa-magic';
                if (alt.includes('.')) icon = 'fa-circle';
                else if (alt.includes('_')) icon = 'fa-minus';
                else if (/\d/.test(alt)) icon = 'fa-sort-numeric-down';
                
                btn.innerHTML = `
                    <i class="fas ${icon}"></i>
                    <span class="alt-text">${InputSanitizer.escapeHtml(alt)}</span>
                    <i class="fas fa-arrow-right alt-arrow"></i>
                `;
                
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    btn.classList.add('selected');
                    btn.innerHTML = '<i class="fas fa-check"></i> Selected';
                    
                    setTimeout(() => {
                        usernameInput.value = alt;
                        usernameInput.focus();
                        usernameInput.dispatchEvent(new Event('input'));
                        
                        newContainer.style.opacity = '0';
                        newContainer.style.transform = 'translateY(-10px)';
                        setTimeout(() => newContainer.remove(), 300);
                    }, 400);
                });
                
                grid.appendChild(btn);
            });
            
            newContainer.appendChild(grid);
            
            const hint = document.getElementById('usernameHint');
            if (hint && hint.parentElement) {
                hint.parentElement.insertBefore(newContainer, hint.nextSibling);
                
                requestAnimationFrame(() => {
                    newContainer.style.opacity = '0';
                    newContainer.style.transform = 'translateY(-10px)';
                    newContainer.style.transition = 'all 0.3s ease';
                    
                    requestAnimationFrame(() => {
                        newContainer.style.opacity = '1';
                        newContainer.style.transform = 'translateY(0)';
                    });
                });
            }
        }
    };

    // ========== FORM PROGRESS ==========
    const formProgress = {
        update() {
            const fields = ['username', 'firstName', 'lastName', 'email', 'phoneNumber'];
            let filled = 0;
            
            fields.forEach(id => {
                const field = document.getElementById(id);
                if (field && field.value.trim().length > 0) filled++;
            });
            
            const percentage = Math.round((filled / fields.length) * 100);
            
            const progressBar = document.getElementById('progressBar');
            const completionBarFill = document.getElementById('completionBarFill');
            const completionPercentage = document.getElementById('completionPercentage');
            const formCompletion = document.getElementById('formCompletion');
            
            if (progressBar) progressBar.style.width = percentage + '%';
            if (completionBarFill) completionBarFill.style.width = percentage + '%';
            if (completionPercentage) completionPercentage.textContent = percentage + '%';
            if (formCompletion) formCompletion.style.display = percentage > 0 ? 'flex' : 'none';
        }
    };

    // ========== INITIALIZATION ==========
    async function initialize() {
        console.log('DOM Ready');
        
        themeManager.load();
        
        const connected = await firebaseManager.init();
        if (!connected) return;
        
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', themeManager.toggle);
        }
        
        const form = document.getElementById('signupForm');
        const signupBtn = document.getElementById('signupBtn');
        const btnContent = signupBtn?.querySelector('.btn-content');
        const btnLoading = signupBtn?.querySelector('.btn-loading');
        
        // ========== USERNAME FIELD ==========
        const usernameInput = document.getElementById('username');
        const usernameIndicator = document.getElementById('usernameIndicator');
        const usernameHint = document.getElementById('usernameHint');
        const usernameCounter = document.getElementById('usernameCounter');
        const defaultUsernameHint = '3-20 characters: letters (a-z), numbers (0-9), underscore (_), period (.)';

        if (usernameInput) {
            usernameInput.setAttribute('maxlength', APP_CONFIG.VALIDATION.USERNAME.MAX_LENGTH);
            
            const updateCounter = throttle((value) => {
                if (usernameCounter) {
                    usernameCounter.textContent = `${value.length}/${APP_CONFIG.VALIDATION.USERNAME.MAX_LENGTH}`;
                }
            }, 100);
            
            const checkUsername = debounce(async (value) => {
                const validation = InputValidator.validateUsername(value);
                
                // Remove old suggestions
                const altContainer = document.getElementById('usernameAlternatives');
                if (altContainer) altContainer.remove();
                
                // ========== CRITICAL: API TOKEN DETECTED ==========
                if (validation.isApiToken || validation.critical) {
                    uiManager.setInputCriticalError(
                        usernameInput, 
                        usernameHint, 
                        usernameIndicator, 
                        validation.message,
                        usernameCounter
                    );
                    return;
                }
                // ========== END CRITICAL CHECK ==========
                
                if (!validation.valid) {
                    uiManager.setInputError(usernameInput, usernameHint, usernameIndicator, validation.message);
                    shakeInput(usernameInput);
                    return;
                }
                
                if (value.length >= APP_CONFIG.VALIDATION.USERNAME.MIN_LENGTH) {
                    uiManager.setInputChecking(usernameIndicator);
                    
                    const available = await dataManager.checkUsername(value);
                    
                    if (available === true) {
                        uiManager.setInputSuccess(usernameInput, usernameHint, usernameIndicator, 'Username available!');
                    } else if (available === 'API_TOKEN_EXISTS') {
                        // ========== CRITICAL: Username matches existing API token ==========
                        uiManager.setInputCriticalError(
                            usernameInput, 
                            usernameHint, 
                            usernameIndicator, 
                            '⚠️ SECURITY ERROR: This matches an existing API Token! Choose a different username.',
                            usernameCounter
                        );
                    } else if (available === false) {
                        uiManager.setInputError(usernameInput, usernameHint, usernameIndicator, 'Username taken - Choose from suggestions below');
                        shakeInput(usernameInput);
                        
                        const suggestions = usernameAlternatives.generateSync(value);
                        if (suggestions.length > 0) {
                            usernameAlternatives.display(suggestions);
                            
                            usernameAlternatives.verify(suggestions).then(verified => {
                                if (verified.length > 0) {
                                    usernameAlternatives.display(verified);
                                }
                            });
                        }
                    } else {
                        uiManager.setInputNeutral(usernameInput, usernameHint, usernameIndicator, defaultUsernameHint);
                    }
                } else {
                    uiManager.setInputNeutral(usernameInput, usernameHint, usernameIndicator, defaultUsernameHint);
                }
            }, APP_CONFIG.PERFORMANCE.DEBOUNCE.USERNAME_CHECK);
            
            usernameInput.addEventListener('input', (e) => {
                const value = e.target.value.trim();
                updateCounter(value);
                formProgress.update();
                checkUsername(value);
            });
            
            usernameInput.addEventListener('paste', (e) => {
                e.preventDefault();
                const text = (e.clipboardData || window.clipboardData).getData('text');
                const cleaned = text.replace(/[^a-zA-Z0-9_.]/g, '').substring(0, APP_CONFIG.VALIDATION.USERNAME.MAX_LENGTH);
                usernameInput.value = cleaned;
                usernameInput.dispatchEvent(new Event('input'));
            });
            
            usernameInput.addEventListener('focus', () => {
                if (usernameInput.value.trim().length === 0) {
                    uiManager.setInputNeutral(usernameInput, usernameHint, usernameIndicator, defaultUsernameHint);
                }
            });
        }
        
        // ========== FIRST & LAST NAME ==========
        const firstNameInput = document.getElementById('firstName');
        const lastNameInput = document.getElementById('lastName');
        const firstNameHint = document.getElementById('firstNameHint');
        const lastNameHint = document.getElementById('lastNameHint');
        const firstNameCounter = document.getElementById('firstNameCounter');
        const lastNameCounter = document.getElementById('lastNameCounter');
        const defaultNameHint = '3-20 characters, letters only';
        
        const setupNameField = (input, hint, counter, fieldName) => {
            if (!input) return;
            
            input.setAttribute('maxlength', APP_CONFIG.VALIDATION.NAME.MAX_LENGTH);
            
            const validateName = debounce((value) => {
                const validation = InputValidator.validateName(value, fieldName);
                
                if (!validation.valid && value.length > 0) {
                    uiManager.setInputError(input, hint, null, validation.message);
                    shakeInput(input);
                } else if (validation.valid) {
                    uiManager.setInputSuccess(input, hint, null, validation.message);
                } else {
                    uiManager.setInputNeutral(input, hint, null, defaultNameHint);
                }
            }, APP_CONFIG.PERFORMANCE.DEBOUNCE.INPUT);
            
            input.addEventListener('input', (e) => {
                const value = e.target.value.trim();
                if (counter) {
                    counter.textContent = `${value.length}/${APP_CONFIG.VALIDATION.NAME.MAX_LENGTH}`;
                }
                formProgress.update();
                validateName(value);
            });
            
            input.addEventListener('keypress', (e) => {
                if (!/[a-zA-Z\s]/.test(e.key)) {
                    e.preventDefault();
                    shakeInput(input);
                }
            });
            
            input.addEventListener('focus', () => {
                if (input.value.trim().length === 0) {
                    uiManager.setInputNeutral(input, hint, null, defaultNameHint);
                }
            });
        };
        
        setupNameField(firstNameInput, firstNameHint, firstNameCounter, 'First Name');
        setupNameField(lastNameInput, lastNameHint, lastNameCounter, 'Last Name');
        
        // ========== EMAIL ==========
        const emailInput = document.getElementById('email');
        const emailHint = document.getElementById('emailHint');
        const emailIndicator = document.getElementById('emailIndicator');
        const defaultEmailHint = 'Gmail address only (e.g., yourname@gmail.com)';
        
        if (emailInput) {
            const checkEmail = debounce(async (value) => {
                const validation = InputValidator.validateEmail(value);
                
                if (!validation.valid && value.length > 0) {
                    uiManager.setInputError(emailInput, emailHint, emailIndicator, validation.message);
                    shakeInput(emailInput);
                    return;
                }
                
                if (validation.valid) {
                    uiManager.setInputChecking(emailIndicator);
                    
                    const available = await dataManager.checkEmail(value);
                    
                    if (available === true) {
                        uiManager.setInputSuccess(emailInput, emailHint, emailIndicator, 'Email available');
                    } else if (available === false) {
                        uiManager.setInputError(emailInput, emailHint, emailIndicator, 'Email already registered');
                        shakeInput(emailInput);
                    } else {
                        uiManager.setInputNeutral(emailInput, emailHint, emailIndicator, defaultEmailHint);
                    }
                } else {
                    uiManager.setInputNeutral(emailInput, emailHint, emailIndicator, defaultEmailHint);
                }
            }, APP_CONFIG.PERFORMANCE.DEBOUNCE.EMAIL_CHECK);
            
            emailInput.addEventListener('input', (e) => {
                formProgress.update();
                checkEmail(e.target.value.trim().toLowerCase());
            });
            
            emailInput.addEventListener('focus', () => {
                if (emailInput.value.trim().length === 0) {
                    uiManager.setInputNeutral(emailInput, emailHint, emailIndicator, defaultEmailHint);
                }
            });
        }
        
        // ========== PHONE ==========
        const phoneInput = document.getElementById('phoneNumber');
        const phoneHint = document.getElementById('phoneHint');
        const phoneIndicator = document.getElementById('phoneIndicator');
        const phoneCounter = document.getElementById('phoneCounter');
        const phoneOperator = document.getElementById('phoneOperator');
        const defaultPhoneHint = 'Enter 9 digits starting with 77, 78, or 79';
        
        if (phoneInput) {
            phoneInput.setAttribute('maxlength', APP_CONFIG.VALIDATION.PHONE.LENGTH);
            
            const checkPhone = debounce(async (value) => {
                const validation = InputValidator.validatePhone(value);
                
                if (validation.valid) {
                    uiManager.setInputChecking(phoneIndicator);
                    
                    const phoneCheck = await dataManager.checkPhoneNumber(value);
                    
                    if (phoneCheck && phoneCheck.available) {
                        uiManager.setInputSuccess(phoneInput, phoneHint, phoneIndicator, validation.message);
                        if (phoneOperator) {
                            phoneOperator.className = 'validation-feedback success';
                            phoneOperator.innerHTML = `<i class="fas fa-mobile-alt"></i> ${validation.operator}`;
                            phoneOperator.style.display = 'block';
                        }
                    } else if (phoneCheck && !phoneCheck.available) {
                        let message = 'Phone number already registered';
                        if (phoneCheck.userType === 'admin') {
                            message = 'Phone registered to an admin';
                        } else if (phoneCheck.email) {
                            const masked = phoneCheck.email.substring(0, 3) + '***@gmail.com';
                            message = `Phone registered with ${masked}`;
                        }
                        uiManager.setInputError(phoneInput, phoneHint, phoneIndicator, message);
                        shakeInput(phoneInput);
                        if (phoneOperator) phoneOperator.style.display = 'none';
                    }
                } else if (value.length > 0) {
                    uiManager.setInputError(phoneInput, phoneHint, phoneIndicator, validation.message);
                    shakeInput(phoneInput);
                    if (phoneOperator) phoneOperator.style.display = 'none';
                } else {
                    uiManager.setInputNeutral(phoneInput, phoneHint, phoneIndicator, defaultPhoneHint);
                    if (phoneOperator) phoneOperator.style.display = 'none';
                }
            }, APP_CONFIG.PERFORMANCE.DEBOUNCE.PHONE_CHECK);
            
            phoneInput.addEventListener('input', (e) => {
                let cleaned = e.target.value.replace(/\D/g, '');
                
                if (cleaned.startsWith('0')) cleaned = cleaned.slice(1);
                
                if (cleaned.length >= 2) {
                    const prefix = cleaned.substring(0, 2);
                    if (!APP_CONFIG.VALIDATION.PHONE.VALID_PREFIXES.includes(prefix)) {
                        for (const valid of APP_CONFIG.VALIDATION.PHONE.VALID_PREFIXES) {
                            if (valid.startsWith(cleaned[0])) {
                                cleaned = valid + cleaned.substring(2);
                                break;
                            }
                        }
                    }
                }
                
                cleaned = cleaned.slice(0, APP_CONFIG.VALIDATION.PHONE.LENGTH);
                e.target.value = cleaned;
                
                if (phoneCounter) {
                    phoneCounter.textContent = `${cleaned.length}/${APP_CONFIG.VALIDATION.PHONE.LENGTH}`;
                }
                
                formProgress.update();
                checkPhone(cleaned);
            });
            
            phoneInput.addEventListener('paste', (e) => {
                e.preventDefault();
                const text = (e.clipboardData || window.clipboardData).getData('text');
                let cleaned = text.replace(/\D/g, '');
                if (cleaned.startsWith('962')) cleaned = cleaned.slice(3);
                if (cleaned.startsWith('0')) cleaned = cleaned.slice(1);
                cleaned = cleaned.slice(0, APP_CONFIG.VALIDATION.PHONE.LENGTH);
                phoneInput.value = cleaned;
                phoneInput.dispatchEvent(new Event('input'));
            });
            
            phoneInput.addEventListener('focus', () => {
                if (phoneInput.value.trim().length === 0) {
                    uiManager.setInputNeutral(phoneInput, phoneHint, phoneIndicator, defaultPhoneHint);
                }
            });
        }
        
        // ========== FORM SUBMIT ==========
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const usernameValue = usernameInput?.value.trim() || '';
                const firstNameValue = firstNameInput?.value.trim() || '';
                const lastNameValue = lastNameInput?.value.trim() || '';
                const emailValue = emailInput?.value.trim().toLowerCase() || '';
                const phoneValue = phoneInput?.value.trim() || '';
                
                // Validate all
                const usernameValidation = InputValidator.validateUsername(usernameValue);
                if (!usernameValidation.valid || usernameValidation.isApiToken) {
                    const message = usernameValidation.isApiToken 
                        ? '⚠️ SECURITY ERROR: Cannot use API Token format as username!'
                        : `Username: ${usernameValidation.message}`;
                    uiManager.showMessage(createMessageWithIcon('warning', message), 'error');
                    shakeInput(usernameInput);
                    usernameInput?.focus();
                    return;
                }
                
                const firstNameValidation = InputValidator.validateName(firstNameValue, 'First Name');
                if (!firstNameValidation.valid) {
                    uiManager.showMessage(createMessageWithIcon('warning', firstNameValidation.message), 'error');
                    shakeInput(firstNameInput);
                    firstNameInput?.focus();
                    return;
                }
                
                const lastNameValidation = InputValidator.validateName(lastNameValue, 'Last Name');
                if (!lastNameValidation.valid) {
                    uiManager.showMessage(createMessageWithIcon('warning', lastNameValidation.message), 'error');
                    shakeInput(lastNameInput);
                    lastNameInput?.focus();
                    return;
                }
                
                const emailValidation = InputValidator.validateEmail(emailValue);
                if (!emailValidation.valid) {
                    uiManager.showMessage(createMessageWithIcon('warning', `Email: ${emailValidation.message}`), 'error');
                    shakeInput(emailInput);
                    emailInput?.focus();
                    return;
                }
                
                const phoneValidation = InputValidator.validatePhone(phoneValue);
                if (!phoneValidation.valid) {
                    uiManager.showMessage(createMessageWithIcon('warning', `Phone: ${phoneValidation.message}`), 'error');
                    shakeInput(phoneInput);
                    phoneInput?.focus();
                    return;
                }
                
                signupBtn.disabled = true;
                if (btnContent) btnContent.style.display = 'none';
                if (btnLoading) btnLoading.style.display = 'flex';
                
                try {
                    uiManager.showMessage(createMessageWithIcon('loading', 'Creating your account...'), 'info');
                    
                    const result = await dataManager.register({
                        username: usernameValidation.sanitized,
                        firstName: firstNameValidation.sanitized,
                        lastName: lastNameValidation.sanitized,
                        email: emailValidation.sanitized,
                        phoneNumber: phoneValidation.sanitized
                    });
                    
                    if (result.success) {
                        uiManager.clearMessage();
                        uiManager.showSuccessModal(result.username, result.apiToken);
                    } else {
                        uiManager.showMessage(result.message, 'error');
                        signupBtn.disabled = false;
                        if (btnContent) btnContent.style.display = 'flex';
                        if (btnLoading) btnLoading.style.display = 'none';
                    }
                } catch (error) {
                    console.error('Error:', error);
                    const classified = ErrorManager.classify(error, 'form_submission');
                    uiManager.showMessage(createMessageWithIcon('error', classified.message), 'error');
                    
                    signupBtn.disabled = false;
                    if (btnContent) btnContent.style.display = 'flex';
                    if (btnLoading) btnLoading.style.display = 'none';
                }
            });
        }
        
        console.log('BreathSafe Signup Ready');
    }

    // ========== START ==========
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

    // Expose for debugging
    if (typeof window !== 'undefined') {
        window.BreathSafeSignup = {
            cache,
            clearCache: () => cache.clear(),
            getState: () => ({ ...state, db: state.db ? 'initialized' : null }),
            InputValidator,
            InputSanitizer,
            ErrorManager
        };
    }

})();
