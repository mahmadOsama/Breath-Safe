// security/lockoutManager.js
// Lockout Management System

import { APP_CONFIG } from '../config/constants.js';

export class LockoutManager {
    constructor(storageKey, options = {}) {
        this.storageKey = storageKey;
        this.options = {
            initialAttempts: options.initialAttempts || 5,
            subsequentAttempts: options.subsequentAttempts || 3,
            duration: options.duration || 15 * 60 * 1000,
            ...options
        };
        this.timer = null;
    }

    /**
     * Get lockout data from storage
     * @returns {Object} - Lockout data
    */
    getData() {
        try {
            const data = localStorage.getItem(this.storageKey);
            if (!data) {
                return this.getDefaultData();
            }
            
            const parsed = JSON.parse(data);
            
            // Validate data structure
            if (!this.isValidData(parsed)) {
                console.warn('Invalid lockout data, resetting');
                return this.getDefaultData();
            }
            
            return parsed;
                } catch (error) {
            console.error('Unable to read local lockout data.');
            return this.getDefaultData();
        }
    }

    /**
     * Get default lockout data structure
     * @returns {Object} - Default data
    */
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

    /**
     * Validate lockout data structure
     * @param {Object} data - Data to validate
     * @returns {boolean} - Is valid
    */
    isValidData(data) {
        return (
            typeof data === 'object' &&
            typeof data.attempts === 'number' &&
            (data.lockedUntil === null || typeof data.lockedUntil === 'number') &&
            typeof data.lockoutCount === 'number'
        );
    }

    /**
     * Save lockout data to storage
     * @param {Object} data - Data to save
    */
    saveData(data) {
        try {
            // Validate before saving
            if (!this.isValidData(data)) {
                throw new Error('Invalid lockout data structure');
            }
            
            // Add timestamp
            data.updatedAt = new Date().toISOString();
            
            localStorage.setItem(this.storageKey, JSON.stringify(data));
        } catch (error) {
            console.error('Error saving lockout data:', error);
        }
    }

    /**
     * Check if currently locked
     * @returns {boolean} - Is locked
    */
    isLocked() {
        const data = this.getData();
        
        if (!data.lockedUntil) {
            return false;
        }
        
        const now = Date.now();
        if (now < data.lockedUntil) {
            return true;
        }
        
        // Lock expired, reset for next cycle
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

    /**
     * Get remaining lock time in milliseconds
     * @returns {number} - Remaining time, 0 if not locked
    */
    getRemainingLockTime() {
        const data = this.getData();
        
        if (!data.lockedUntil) {
            return 0;
        }
        
        const remaining = data.lockedUntil - Date.now();
        return remaining > 0 ? remaining : 0;
    }

    /**
     * Get maximum attempts allowed
     * @returns {number} - Max attempts
    */
    getMaxAttempts() {
        const data = this.getData();
        
        // If had successful login after lockout, reset to initial
        if (data.lastSuccessfulLogin && data.lockoutCount > 0) {
            const timeSinceSuccess = Date.now() - data.lastSuccessfulLogin;
            if (timeSinceSuccess < this.options.duration) {
                return this.options.initialAttempts;
            }
        }
        
        // Use fewer attempts if already locked out
        return data.lockoutCount > 0 ? 
            this.options.subsequentAttempts : 
            this.options.initialAttempts;
    }

    /**
     * Record a failed login attempt
     * @returns {Object} - Lockout status
    */
    recordFailedAttempt() {
        const data = this.getData();
        data.attempts += 1;
        
        const maxAttempts = this.getMaxAttempts();
        
        if (data.attempts >= maxAttempts) {
            // Lock the account
            data.lockedUntil = Date.now() + this.options.duration;
            data.lockoutCount += 1;
            data.attempts = 0;
            
            this.saveData(data);
            
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

    /**
     * Record successful login
    */
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

    /**
     * Reset attempts without recording successful login
    */
    resetAttempts() {
        const data = this.getData();
        data.attempts = 0;
        this.saveData(data);
    }

    /**
     * Clear all lockout data
    */
    clearAll() {
        localStorage.removeItem(this.storageKey);
    }

    /**
     * Get current status
     * @returns {Object} - Current status
    */
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
            remainingSeconds: Math.ceil(remaining / 1000),
            lastSuccessfulLogin: data.lastSuccessfulLogin ? new Date(data.lastSuccessfulLogin) : null
        };
    }

    /**
     * Start countdown timer with callback
     * @param {Function} callback - Callback function
     * @returns {number} - Timer ID
    */
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

    /**
     * Stop countdown timer
    */
    stopCountdown() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /**
     * Format remaining time as readable string
     * @returns {string} - Formatted time
    */
    formatRemainingTime() {
        const remaining = this.getRemainingLockTime();
        
        if (remaining <= 0) {
            return 'No active lockout';
        }
        
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    /**
     * Get detailed JSON representation
     * @returns {string} - JSON string
    */
    toJSON() {
        return JSON.stringify({
            storageKey: this.storageKey,
            status: this.getStatus(),
            data: this.getData(),
            configuration: this.options
        }, null, 2);
    }
}
