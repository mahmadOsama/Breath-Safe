// validators/inputValidator.js
// Input Validation System

import { APP_CONFIG } from '../config/constants.js';
import { InputSanitizer } from '../utils/inputSanitizer.js';

export class InputValidator {
    /**
     * Validate username
     * @param {string} username - Username to validate
     * @returns {Object} - Validation result
    */
    static validateUsername(username) {
        try {
            if (!username) {
                return {
                    valid: false,
                    message: 'Username is required',
                    code: 'EMPTY'
                };
            }
            
            // Sanitize first
            const sanitized = InputSanitizer.sanitizeUsername(username);
            
            const config = APP_CONFIG.VALIDATION.USERNAME;
            
            if (sanitized.length < config.MIN_LENGTH) {
                return {
                    valid: false,
                    message: `Username must be at least ${config.MIN_LENGTH} characters`,
                    code: 'TOO_SHORT'
                };
            }
            
            if (sanitized.length > config.MAX_LENGTH) {
                return {
                    valid: false,
                    message: `Username cannot exceed ${config.MAX_LENGTH} characters`,
                    code: 'TOO_LONG'
                };
            }
            
            if (!config.START_PATTERN.test(sanitized)) {
                return {
                    valid: false,
                    message: 'Username must start with a letter or number',
                    code: 'INVALID_START'
                };
            }
            
            if (config.NO_ALL_NUMBERS.test(sanitized)) {
                return {
                    valid: false,
                    message: 'Username cannot contain only numbers',
                    code: 'ALL_NUMBERS'
                };
            }
            
            const letterCount = (sanitized.match(/[a-zA-Z]/g) || []).length;
            if (letterCount < config.MIN_LETTERS) {
                return {
                    valid: false,
                    message: `Username must contain at least ${config.MIN_LETTERS} letters`,
                    code: 'INSUFFICIENT_LETTERS'
                };
            }
            
            return {
                valid: true,
                message: 'Valid username format',
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

    /**
     * Validate name (first name, last name)
     * @param {string} name - Name to validate
     * @param {string} fieldName - Field name for messages
     * @returns {Object} - Validation result
    */
    static validateName(name, fieldName = 'Name') {
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
            
            if (sanitized.length > config.MAX_LENGTH) {
                return {
                    valid: false,
                    message: `${fieldName} cannot exceed ${config.MAX_LENGTH} characters`,
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
    }

    /**
     * Validate email address
     * @param {string} email - Email to validate
     * @returns {Object} - Validation result
    */
    static validateEmail(email) {
        try {
            if (!email) {
                return {
                    valid: false,
                    message: 'Email is required',
                    code: 'EMPTY'
                };
            }
            
            const config = APP_CONFIG.VALIDATION.EMAIL;
            const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
            
            if (!normalized.includes('@')) {
                return {
                    valid: false,
                    message: 'Email must contain @',
                    code: 'MISSING_AT'
                };
            }
            
            if (!normalized.endsWith('@gmail.com')) {
                return {
                    valid: false,
                    message: 'Only Gmail addresses allowed (@gmail.com)',
                    code: 'NOT_GMAIL'
                };
            }
            
            if (!config.PATTERN.test(normalized)) {
                return {
                    valid: false,
                    message: 'Invalid Gmail format',
                    code: 'INVALID_FORMAT'
                };
            }

            const sanitized = InputSanitizer.sanitizeEmail(normalized);
            
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
    }

    /**
     * Validate phone number
     * @param {string} phone - Phone number to validate
     * @returns {Object} - Validation result
    */
    static validatePhone(phone) {
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
                    message: `Phone number must be exactly ${config.LENGTH} digits`,
                    operator: null,
                    code: 'INVALID_LENGTH'
                };
            }
            
            if (!config.PATTERN.test(sanitized)) {
                return {
                    valid: false,
                    message: 'Phone number can only contain digits',
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
            
            // Check for all same digits
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

    /**
     * Validate API token format
     * @param {string} token - Token to validate
     * @returns {Object} - Validation result
    */
    static validateApiToken(token) {
        try {
            if (!token) {
                return {
                    valid: false,
                    message: 'API token is required',
                    code: 'EMPTY'
                };
            }
            
            const config = APP_CONFIG.VALIDATION.API_TOKEN;
            const normalized = typeof token === 'string' ? token.trim().toUpperCase() : '';
            
            if (!config.PATTERN.test(normalized)) {
                return {
                    valid: false,
                    message: 'Invalid token format (expected 64 hexadecimal characters)',
                    code: 'INVALID_FORMAT'
                };
            }

            const sanitized = InputSanitizer.sanitizeApiToken(normalized);
            
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

    /**
     * Validate password strength
     * @param {string} password - Password to validate
     * @returns {Object} - Validation result
    */
    static validatePassword(password) {
        try {
            if (!password) {
                return {
                    valid: false,
                    message: 'Password is required',
                    code: 'EMPTY',
                    strength: 'none'
                };
            }
            
            const config = APP_CONFIG.SECURITY.PASSWORD;
            if (typeof password === 'string' && password.length < config.MIN_LENGTH) {
                return {
                    valid: false,
                    message: `Password must be at least ${config.MIN_LENGTH} characters`,
                    code: 'TOO_SHORT',
                    strength: 'weak'
                };
            }

            const sanitized = InputSanitizer.sanitizePassword(password);
            
            if (sanitized.length < config.MIN_LENGTH) {
                return {
                    valid: false,
                    message: `Password must be at least ${config.MIN_LENGTH} characters`,
                    code: 'TOO_SHORT',
                    strength: 'weak'
                };
            }
            
            let strength = 'weak';
            let missingRequirements = [];
            
            if (config.REQUIRE_UPPERCASE && !/[A-Z]/.test(sanitized)) {
                missingRequirements.push('uppercase letter');
            } else {
                strength = 'fair';
            }
            
            if (config.REQUIRE_LOWERCASE && !/[a-z]/.test(sanitized)) {
                missingRequirements.push('lowercase letter');
            }
            
            if (config.REQUIRE_NUMBERS && !/\d/.test(sanitized)) {
                missingRequirements.push('number');
            }
            
            if (config.REQUIRE_SPECIAL && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(sanitized)) {
                missingRequirements.push('special character');
            }
            
            if (missingRequirements.length > 0) {
                return {
                    valid: false,
                    message: `Password must include: ${missingRequirements.join(', ')}`,
                    code: 'WEAK_PASSWORD',
                    strength: 'weak',
                    missingRequirements
                };
            }
            
            strength = 'strong';
            
            return {
                valid: true,
                message: 'Strong password',
                code: 'VALID',
                strength: strength,
                sanitized: sanitized
            };
        } catch (error) {
            return {
                valid: false,
                message: error.message,
                code: 'SANITIZATION_ERROR',
                strength: 'none'
            };
        }
    }

    /**
     * Validate all form fields
     * @param {Object} formData - Form data to validate
     * @returns {Object} - Validation results
    */
    static validateForm(formData) {
        const results = {
            valid: true,
            errors: {},
            sanitized: {}
        };
        
        if (formData.username !== undefined) {
            const usernameResult = this.validateUsername(formData.username);
            if (!usernameResult.valid) {
                results.valid = false;
                results.errors.username = usernameResult;
            } else {
                results.sanitized.username = usernameResult.sanitized;
            }
        }
        
        if (formData.firstName !== undefined) {
            const firstNameResult = this.validateName(formData.firstName, 'First Name');
            if (!firstNameResult.valid) {
                results.valid = false;
                results.errors.firstName = firstNameResult;
            } else {
                results.sanitized.firstName = firstNameResult.sanitized;
            }
        }
        
        if (formData.lastName !== undefined) {
            const lastNameResult = this.validateName(formData.lastName, 'Last Name');
            if (!lastNameResult.valid) {
                results.valid = false;
                results.errors.lastName = lastNameResult;
            } else {
                results.sanitized.lastName = lastNameResult.sanitized;
            }
        }
        
        if (formData.email !== undefined) {
            const emailResult = this.validateEmail(formData.email);
            if (!emailResult.valid) {
                results.valid = false;
                results.errors.email = emailResult;
            } else {
                results.sanitized.email = emailResult.sanitized;
            }
        }
        
        if (formData.phoneNumber !== undefined) {
            const phoneResult = this.validatePhone(formData.phoneNumber);
            if (!phoneResult.valid) {
                results.valid = false;
                results.errors.phoneNumber = phoneResult;
            } else {
                results.sanitized.phoneNumber = phoneResult.sanitized;
            }
        }
        
        if (formData.apiToken !== undefined) {
            const tokenResult = this.validateApiToken(formData.apiToken);
            if (!tokenResult.valid) {
                results.valid = false;
                results.errors.apiToken = tokenResult;
            } else {
                results.sanitized.apiToken = tokenResult.sanitized;
            }
        }
        
        if (formData.password !== undefined) {
            const passwordResult = this.validatePassword(formData.password);
            if (!passwordResult.valid) {
                results.valid = false;
                results.errors.password = passwordResult;
            } else {
                results.sanitized.password = passwordResult.sanitized;
            }
        }
        
        return results;
    }
}
