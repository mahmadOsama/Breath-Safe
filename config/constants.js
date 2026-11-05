// config/constants.js
// Centralized Configuration for BreathSafe Project

export const APP_CONFIG = {
    // Application Info
    APP: {
        NAME: 'BreathSafe',
        VERSION: '1.0.0',
        ENVIRONMENT: typeof process !== 'undefined' ? process.env.NODE_ENV : 'development'
    },

    // Validation Rules
    VALIDATION: {
        USERNAME: {
            MIN_LENGTH: 3,
            MAX_LENGTH: 12,
            MIN_LETTERS: 6,
            ALLOWED_CHARS: /^[a-zA-Z0-9_#$]+$/,
            START_PATTERN: /^[a-zA-Z0-9]/,
            NO_ALL_NUMBERS: /^\d+$/
        },
        NAME: {
            MAX_LENGTH: 12,
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
        },
        API_TOKEN: {
            PATTERN: /^[A-F0-9]{64}$/i
        }
    },

    // Security Settings
    SECURITY: {
        LOCKOUT: {
            USER: {
                INITIAL_ATTEMPTS: 5,
                SUBSEQUENT_ATTEMPTS: 3,
                DURATION: 15 * 60 * 1000,
                STORAGE_KEY: 'breathsafe_login_attempts'
            },
            ADMIN: {
                INITIAL_ATTEMPTS: 3,
                SUBSEQUENT_ATTEMPTS: 2,
                DURATION: 20 * 60 * 1000,
                STORAGE_KEY: 'breathsafe_admin_lockout'
            }
        },
        RATE_LIMIT: {
            EMAIL_SEND: {
                DURATION: 5 * 60 * 1000, // 5 minutes
                KEY: 'breathsafe_email_rate_limit'
            },
            LOGIN_ATTEMPTS: 15 * 60 * 1000 // 15 minutes
        },
        PASSWORD: {
            MIN_LENGTH: 8,
            REQUIRE_UPPERCASE: true,
            REQUIRE_LOWERCASE: true,
            REQUIRE_NUMBERS: true,
            REQUIRE_SPECIAL: true
        }
    },

    // Performance Settings
    PERFORMANCE: {
        DEBOUNCE: {
            INPUT: 300,
            USERNAME_CHECK: 400,
            EMAIL_CHECK: 500,
            PHONE_CHECK: 800,
            VALIDATION: 300
        },
        CACHE: {
            TTL: 5 * 60 * 1000, // 5 minutes
            MAX_SIZE: 100
        },
        THROTTLE: {
            SCROLL: 100,
            RESIZE: 250
        }
    },

    // UI Settings
    UI: {
        ANIMATION: {
            DURATION: 300,
            EASING: 'cubic-bezier(0.4, 0, 0.2, 1)'
        },
        MESSAGES: {
            AUTO_HIDE_DELAY: 5000,
            SUCCESS_REDIRECT_DELAY: 1500
        },
        THEME: {
            DEFAULT: 'light',
            STORAGE_KEY: 'breathsafe_theme'
        }
    },

    // API Settings
    API: {
        TIMEOUT: 10000, // 10 seconds
        RETRY_ATTEMPTS: 3,
        RETRY_DELAY: 1000
    },

    // EmailJS Configuration
    EMAIL_JS: {
        PUBLIC_KEY: "YOUR_EMAILJS_PUBLIC_KEY",
        SERVICE_ID: "YOUR_EMAILJS_SERVICE_ID",
        TEMPLATE_ID: "YOUR_EMAILJS_TEMPLATE_ID"
    },

    // Error Messages
    ERRORS: {
        NETWORK: 'Connection lost. Please check your internet and try again.',
        PERMISSION: 'Access denied. Please contact support.',
        NOT_FOUND: 'Account not found. Please check your credentials.',
        VALIDATION: 'Please check your input and try again.',
        GENERIC: 'An unexpected error occurred. Please try again.',
        LOCKOUT: 'Account temporarily locked for security. Please wait.',
        RATE_LIMIT: 'Too many requests. Please wait before trying again.'
    },

    // Success Messages
    SUCCESS: {
        REGISTRATION: 'Account created successfully!',
        LOGIN: 'Welcome back! Redirecting...',
        EMAIL_SENT: 'Email sent successfully!',
        PASSWORD_RESET: 'Password reset successfully!'
    }
};

// Validation helper
export const validateConfig = () => {
    const required = [
        'VALIDATION.USERNAME.MIN_LENGTH',
        'SECURITY.LOCKOUT.USER.INITIAL_ATTEMPTS',
        'PERFORMANCE.DEBOUNCE.INPUT'
    ];
    
    const missing = required.filter(path => {
        const value = path.split('.').reduce((obj, key) => obj?.[key], APP_CONFIG);
        return value === undefined || value === null;
    });
    
    if (missing.length > 0) {
        console.error('Missing required configuration:', missing);
        return false;
    }
    
    return true;
};

// Initialize validation
if (!validateConfig()) {
    console.warn('⚠️ Configuration validation failed');
}
