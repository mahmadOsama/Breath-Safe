// utils/errorManager.js
// Error Management and Classification System

import { APP_CONFIG } from '../config/constants.js';

export class AppError extends Error {
    constructor(message, type, code, details = {}) {
        super(message);
        this.name = 'AppError';
        this.type = type;
        this.code = code;
        this.details = details;
        this.timestamp = new Date().toISOString();
        this.userMessage = message; // User-friendly message
    }
}

export class ErrorManager {
    static ERROR_TYPES = {
        NETWORK: 'NETWORK_ERROR',
        VALIDATION: 'VALIDATION_ERROR',
        PERMISSION: 'PERMISSION_ERROR',
        AUTHENTICATION: 'AUTHENTICATION_ERROR',
        RATE_LIMIT: 'RATE_LIMIT_ERROR',
        LOCKOUT: 'LOCKOUT_ERROR',
        NOT_FOUND: 'NOT_FOUND_ERROR',
        SERVER: 'SERVER_ERROR',
        UNKNOWN: 'UNKNOWN_ERROR'
    };

    /**
     * Classify error based on error object
     * @param {Error} error - Original error
     * @param {string} context - Context where error occurred
     * @returns {AppError} - Classified error
    */
    static classify(error, context = 'unknown') {
        // Firebase specific errors
        if (error.code) {
            return this.classifyFirebaseError(error, context);
        }
        
        // Network errors
        if (this.isNetworkError(error)) {
            return new AppError(
                APP_CONFIG.ERRORS.NETWORK,
                this.ERROR_TYPES.NETWORK,
                'NETWORK_UNAVAILABLE',
                { originalError: error.message, context }
            );
        }
        
        // Authentication errors
        if (this.isAuthError(error)) {
            return new AppError(
                'Invalid credentials. Please check your username and password.',
                this.ERROR_TYPES.AUTHENTICATION,
                'AUTH_FAILED',
                { originalError: error.message, context }
            );
        }

        // Validation errors
        if (this.isValidationError(error)) {
            return new AppError(
                error.message || APP_CONFIG.ERRORS.VALIDATION,
                this.ERROR_TYPES.VALIDATION,
                'VALIDATION_FAILED',
                { originalError: error.message, context }
            );
        }
        
        // Generic error
        return new AppError(
            APP_CONFIG.ERRORS.GENERIC,
            this.ERROR_TYPES.UNKNOWN,
            'GENERIC_ERROR',
            { originalError: error.message, context }
        );
    }

    /**
     * Classify Firebase-specific errors
     * @param {Error} error - Firebase error
     * @param {string} context - Context
     * @returns {AppError} - Classified error
    */
    static classifyFirebaseError(error, context) {
        switch (error.code) {
            case 'unavailable':
            case 'deadline-exceeded':
                return new AppError(
                    APP_CONFIG.ERRORS.NETWORK,
                    this.ERROR_TYPES.NETWORK,
                    'FIREBASE_UNAVAILABLE',
                    { firebaseCode: error.code, context }
                );
                
            case 'permission-denied':
                return new AppError(
                    APP_CONFIG.ERRORS.PERMISSION,
                    this.ERROR_TYPES.PERMISSION,
                    'FIREBASE_PERMISSION',
                    { firebaseCode: error.code, context }
                );
                
            case 'not-found':
                return new AppError(
                    APP_CONFIG.ERRORS.NOT_FOUND,
                    this.ERROR_TYPES.NOT_FOUND,
                    'FIREBASE_NOT_FOUND',
                    { firebaseCode: error.code, context }
                );
                
            case 'already-exists':
                return new AppError(
                    'This record already exists. Please use different values.',
                    this.ERROR_TYPES.VALIDATION,
                    'FIREBASE_ALREADY_EXISTS',
                    { firebaseCode: error.code, context }
                );
                
            case 'resource-exhausted':
                return new AppError(
                    APP_CONFIG.ERRORS.RATE_LIMIT,
                    this.ERROR_TYPES.RATE_LIMIT,
                    'FIREBASE_QUOTA_EXCEEDED',
                    { firebaseCode: error.code, context }
                );
                
            case 'unauthenticated':
                return new AppError(
                    'Authentication required. Please login again.',
                    this.ERROR_TYPES.AUTHENTICATION,
                    'FIREBASE_UNAUTHENTICATED',
                    { firebaseCode: error.code, context }
                );
                
            default:
                return new AppError(
                    `Firebase error: ${error.message}`,
                    this.ERROR_TYPES.SERVER,
                    'FIREBASE_UNKNOWN',
                    { firebaseCode: error.code, context }
                );
        }
    }

    /**
     * Check if error is network-related
     * @param {Error} error - Error to check
     * @returns {boolean} - Is network error
    */
    static isNetworkError(error) {
        const networkIndicators = [
            'network',
            'connection',
            'timeout',
            'offline',
            'fetch',
            'cors'
        ];
        
        const message = error.message?.toLowerCase() || '';
        return networkIndicators.some(indicator => message.includes(indicator));
    }

    /**
     * Check if error is validation-related
     * @param {Error} error - Error to check
     * @returns {boolean} - Is validation error
    */
    static isValidationError(error) {
        const validationIndicators = [
            'validation',
            'invalid',
            'required',
            'format',
            'length',
            'characters'
        ];
        
        const message = error.message?.toLowerCase() || '';
        return validationIndicators.some(indicator => message.includes(indicator));
    }

    /**
     * Check if error is authentication-related
     * @param {Error} error - Error to check
     * @returns {boolean} - Is auth error
    */
    static isAuthError(error) {
        const authIndicators = [
            'credentials',
            'password',
            'username',
            'token',
            'unauthorized',
            'forbidden'
        ];
        
        const message = error.message?.toLowerCase() || '';
        return authIndicators.some(indicator => message.includes(indicator));
    }

    /**
     * Handle error with proper logging and user notification
     * @param {Error} error - Original error
     * @param {string} context - Context where error occurred
     * @param {Function} uiCallback - UI callback function
     * @returns {AppError} - Classified error
    */
    static handleError(error, context, uiCallback = null) {
        const classifiedError = this.classify(error, context);
        
        // Log for debugging (only in development)
        if (APP_CONFIG.APP.ENVIRONMENT === 'development') {
            console.warn('Application operation failed.', {
                context,
                type: classifiedError.type,
                code: classifiedError.code
            });
        }
        
        // Production logging (send to monitoring service)
        if (APP_CONFIG.APP.ENVIRONMENT === 'production') {
            this.logToMonitoring(classifiedError, context);
        }
        
        // Show user-friendly message
        if (uiCallback && typeof uiCallback === 'function') {
            const messageType = this.getMessageType(classifiedError.type);
            uiCallback(classifiedError.userMessage, messageType);
        }
        
        return classifiedError;
    }

    /**
     * Get UI message type based on error type
     * @param {string} errorType - Error type
     * @returns {string} - UI message type
    */
    static getMessageType(errorType) {
        switch (errorType) {
            case this.ERROR_TYPES.VALIDATION:
                return 'warning';
            case this.ERROR_TYPES.NETWORK:
            case this.ERROR_TYPES.SERVER:
                return 'error';
            case this.ERROR_TYPES.PERMISSION:
            case this.ERROR_TYPES.AUTHENTICATION:
                return 'error';
            case this.ERROR_TYPES.RATE_LIMIT:
            case this.ERROR_TYPES.LOCKOUT:
                return 'warning';
            default:
                return 'error';
        }
    }

    /**
     * Log error to monitoring service (placeholder)
     * @param {AppError} error - Classified error
     * @param {string} context - Context
    */
    static logToMonitoring(error, context) {
        // Do not print raw provider messages or request details to the browser console.
        console.warn('Application operation failed.', {
            context,
            type: error.type,
            code: error.code
        });
    }

    /**
     * Create user-friendly error message with icon
     * @param {string} type - Error type
     * @param {string} message - Error message
     * @returns {string} - Formatted message with icon
    */
    static createMessageWithIcon(type, message) {
        const icons = {
            error: '<i class="fas fa-exclamation-circle"></i>',
            warning: '<i class="fas fa-exclamation-triangle"></i>',
            info: '<i class="fas fa-info-circle"></i>',
            success: '<i class="fas fa-check-circle"></i>'
        };
        
        return `${icons[type] || icons.error} ${message}`;
    }

    /**
     * Retry function with exponential backoff
     * @param {Function} fn - Function to retry
     * @param {number} maxAttempts - Maximum retry attempts
     * @param {number} baseDelay - Base delay in ms
     * @returns {Promise} - Result of function
    */
    static async retryWithBackoff(fn, maxAttempts = 3, baseDelay = 1000) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                
                // Don't retry on certain error types
                if (this.isValidationError(error) || 
                    error.code === 'permission-denied' ||
                    error.code === 'unauthenticated') {
                    throw error;
                }
                
                // If this was the last attempt, throw the error
                if (attempt === maxAttempts) {
                    throw error;
                }
                
                // Wait before retrying (exponential backoff)
                const delay = baseDelay * Math.pow(2, attempt - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
                
                console.warn(`Retry attempt ${attempt}/${maxAttempts} after ${delay}ms`);
            }
        }
        
        throw lastError;
    }
}

// Export convenience functions
export const {
    classify,
    handleError,
    createMessageWithIcon,
    retryWithBackoff
} = ErrorManager;
