// utils/inputSanitizer.js
// Input Sanitization and Validation Utilities

import { APP_CONFIG } from '../config/constants.js';

export class InputSanitizer {
    /**
     * Sanitize username input
     * @param {string} username - Raw username input
     * @returns {string} - Sanitized username
     * @throws {Error} - If input is invalid
    */
    static sanitizeUsername(username) {
        if (!username || typeof username !== 'string') {
            throw new Error('Username must be a valid string');
        }

        // Remove dangerous characters and trim
        const sanitized = username
            .trim()
            .replace(/[<>\"'%;()&+\\/]/g, '') // Remove dangerous chars
            .substring(0, APP_CONFIG.VALIDATION.USERNAME.MAX_LENGTH);

        if (!sanitized) {
            throw new Error('Username cannot be empty after sanitization');
        }

        // Validate against allowed characters
        if (!APP_CONFIG.VALIDATION.USERNAME.ALLOWED_CHARS.test(sanitized)) {
            throw new Error('Username contains invalid characters. Only letters, numbers, _, #, and $ are allowed');
        }

        return sanitized;
    }

    /**
     * Sanitize name input (first name, last name)
     * @param {string} name - Raw name input
     * @returns {string} - Sanitized name
     * @throws {Error} - If input is invalid
    */
    static sanitizeName(name) {
        if (!name || typeof name !== 'string') {
            throw new Error('Name must be a valid string');
        }

        // Remove dangerous characters, keep only letters and spaces
        const sanitized = name
            .trim()
            .replace(/[^a-zA-Z\s]/g, '') // Only letters and spaces
            .replace(/\s+/g, ' ') // Normalize multiple spaces
            .substring(0, APP_CONFIG.VALIDATION.NAME.MAX_LENGTH);

        if (!sanitized || sanitized.length === 0) {
            throw new Error('Name cannot be empty after sanitization');
        }

        // Validate against pattern
        if (!APP_CONFIG.VALIDATION.NAME.ALLOWED_CHARS.test(sanitized)) {
            throw new Error('Name can only contain letters and spaces');
        }

        return sanitized;
    }

    /**
     * Sanitize email input
     * @param {string} email - Raw email input
     * @returns {string} - Sanitized email
     * @throws {Error} - If input is invalid
    */
    static sanitizeEmail(email) {
        if (!email || typeof email !== 'string') {
            throw new Error('Email must be a valid string');
        }

        // Trim and convert to lowercase
        const sanitized = email
            .trim()
            .toLowerCase()
            .substring(0, APP_CONFIG.VALIDATION.EMAIL.MAX_LENGTH);

        if (!sanitized) {
            throw new Error('Email cannot be empty');
        }

        // Basic email validation
        if (!sanitized.includes('@') || !sanitized.includes('.')) {
            throw new Error('Email must contain @ and domain');
        }

        // Validate Gmail format
        if (!APP_CONFIG.VALIDATION.EMAIL.PATTERN.test(sanitized)) {
            throw new Error('Only Gmail addresses are allowed (@gmail.com)');
        }

        return sanitized;
    }

    /**
     * Sanitize phone number input
     * @param {string} phone - Raw phone input
     * @returns {string} - Sanitized phone number
     * @throws {Error} - If input is invalid
    */
    static sanitizePhone(phone) {
        if (!phone || typeof phone !== 'string') {
            throw new Error('Phone number must be a valid string');
        }

        // Remove all non-digit characters
        let sanitized = phone.replace(/\D/g, '');

        // Remove leading zero if present
        if (sanitized.startsWith('0')) {
            sanitized = sanitized.substring(1);
        }

        // Limit to expected length
        sanitized = sanitized.substring(0, APP_CONFIG.VALIDATION.PHONE.LENGTH);

        if (!sanitized) {
            throw new Error('Phone number cannot be empty');
        }

        // Validate pattern (digits only)
        if (!APP_CONFIG.VALIDATION.PHONE.PATTERN.test(sanitized)) {
            throw new Error('Phone number can only contain digits');
        }

        return sanitized;
    }

    /**
     * Sanitize API token input
     * @param {string} token - Raw token input
     * @returns {string} - Sanitized token
     * @throws {Error} - If input is invalid
    */
    static sanitizeApiToken(token) {
        if (!token || typeof token !== 'string') {
            throw new Error('API token must be a valid string');
        }

        const sanitized = token.trim().toUpperCase();

        if (!sanitized) {
            throw new Error('API token cannot be empty');
        }

        // Validate token format
        if (!APP_CONFIG.VALIDATION.API_TOKEN.PATTERN.test(sanitized)) {
            throw new Error('Invalid API token format. Expected 64 hexadecimal characters.');
        }

        return sanitized;
    }

    /**
     * Sanitize password input (for admin)
     * @param {string} password - Raw password input
     * @returns {string} - Sanitized password
     * @throws {Error} - If input is invalid
    */
    static sanitizePassword(password) {
        if (!password || typeof password !== 'string') {
            throw new Error('Password must be a valid string');
        }

        // Don't trim passwords as spaces might be intentional
        const sanitized = password.substring(0, 128); // Reasonable max length

        if (!sanitized) {
            throw new Error('Password cannot be empty');
        }

        // Basic length check
        if (sanitized.length < APP_CONFIG.SECURITY.PASSWORD.MIN_LENGTH) {
            throw new Error(`Password must be at least ${APP_CONFIG.SECURITY.PASSWORD.MIN_LENGTH} characters long`);
        }

        return sanitized;
    }

    /**
     * Sanitize general text input
     * @param {string} text - Raw text input
     * @param {number} maxLength - Maximum allowed length
     * @returns {string} - Sanitized text
    */
    static sanitizeText(text, maxLength = 1000) {
        if (!text || typeof text !== 'string') {
            return '';
        }

        return text
            .trim()
            .replace(/[<>\"'%;()&+\\/]/g, '') // Remove dangerous chars
            .substring(0, maxLength);
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} - HTML-escaped text
    */
    static escapeHtml(text) {
        if (!text || typeof text !== 'string') {
            return '';
        }

        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Validate and sanitize all form data
     * @param {Object} formData - Raw form data
     * @returns {Object} - Sanitized form data
    */
    static sanitizeFormData(formData) {
        const sanitized = {};

        try {
            if (formData.username) {
                sanitized.username = this.sanitizeUsername(formData.username);
            }

            if (formData.firstName) {
                sanitized.firstName = this.sanitizeName(formData.firstName);
            }

            if (formData.lastName) {
                sanitized.lastName = this.sanitizeName(formData.lastName);
            }

            if (formData.email) {
                sanitized.email = this.sanitizeEmail(formData.email);
            }

            if (formData.phoneNumber) {
                sanitized.phoneNumber = this.sanitizePhone(formData.phoneNumber);
            }

            if (formData.apiToken) {
                sanitized.apiToken = this.sanitizeApiToken(formData.apiToken);
            }

            if (formData.password) {
                sanitized.password = this.sanitizePassword(formData.password);
            }

            return sanitized;
        } catch (error) {
            throw new Error(`Form validation failed: ${error.message}`);
        }
    }
}

// Export individual functions for convenience
export const {
    sanitizeUsername,
    sanitizeName,
    sanitizeEmail,
    sanitizePhone,
    sanitizeApiToken,
    sanitizePassword,
    sanitizeText,
    escapeHtml,
    sanitizeFormData
} = InputSanitizer;
