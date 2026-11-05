// tests/validators.test.js
// Unit Tests for Validators and Security Functions

import { beforeEach, describe, expect, test } from '@jest/globals';

import { InputValidator } from '../validators/inputValidator.js';
import { InputSanitizer } from '../utils/inputSanitizer.js';
import { LockoutManager } from '../security/lockoutManager.js';
import { ErrorManager } from '../utils/errorManager.js';
import '../security/secureToken.js';

const generateApiToken = globalThis.BreathSafeSecurity.generateApiToken;

// Mock localStorage for testing
class MockLocalStorage {
    constructor() {
        this.store = {};
    }
    
    getItem(key) {
        return this.store[key] || null;
    }
    
    setItem(key, value) {
        this.store[key] = value.toString();
    }
    
    removeItem(key) {
        delete this.store[key];
    }
    
    clear() {
        this.store = {};
    }
}

// Replace global localStorage
global.localStorage = new MockLocalStorage();

describe('InputValidator', () => {
    describe('validateUsername', () => {
        test('should accept valid username', () => {
            const result = InputValidator.validateUsername('testuser123');
            expect(result.valid).toBe(true);
            expect(result.code).toBe('VALID');
        });
        
        test('should reject empty username', () => {
            const result = InputValidator.validateUsername('');
            expect(result.valid).toBe(false);
            expect(result.code).toBe('EMPTY');
        });
        
        test('should reject username too short', () => {
            const result = InputValidator.validateUsername('ab');
            expect(result.valid).toBe(false);
            expect(result.code).toBe('TOO_SHORT');
        });
        
        test('should reject username with insufficient letters', () => {
            const result = InputValidator.validateUsername('test12');
            expect(result.valid).toBe(false);
            expect(result.code).toBe('INSUFFICIENT_LETTERS');
        });
        
        test('should reject username with spaces', () => {
            const result = InputValidator.validateUsername('test user');
            expect(result.valid).toBe(false);
        });
        
        test('should reject all-number username', () => {
            const result = InputValidator.validateUsername('123456789');
            expect(result.valid).toBe(false);
            expect(result.code).toBe('ALL_NUMBERS');
        });
    });

    describe('validateEmail', () => {
        test('should accept valid Gmail', () => {
            const result = InputValidator.validateEmail('test@gmail.com');
            expect(result.valid).toBe(true);
            expect(result.code).toBe('VALID');
        });
        
        test('should reject non-Gmail', () => {
            const result = InputValidator.validateEmail('test@yahoo.com');
            expect(result.valid).toBe(false);
            expect(result.code).toBe('NOT_GMAIL');
        });
        
        test('should reject empty email', () => {
            const result = InputValidator.validateEmail('');
            expect(result.valid).toBe(false);
            expect(result.code).toBe('EMPTY');
        });
        
        test('should reject email without @', () => {
            const result = InputValidator.validateEmail('testgmail.com');
            expect(result.valid).toBe(false);
            expect(result.code).toBe('MISSING_AT');
        });
    });

    describe('validatePhone', () => {
        test('should accept valid Orange number', () => {
            const result = InputValidator.validatePhone('779876543');
            expect(result.valid).toBe(true);
            expect(result.operator).toBe('Orange');
        });
        
        test('should accept valid Umniah number', () => {
            const result = InputValidator.validatePhone('789876543');
            expect(result.valid).toBe(true);
            expect(result.operator).toBe('Umniah');
        });
        
        test('should accept valid Zain number', () => {
            const result = InputValidator.validatePhone('799876543');
            expect(result.valid).toBe(true);
            expect(result.operator).toBe('Zain');
        });
        
        test('should reject empty phone', () => {
            const result = InputValidator.validatePhone('');
            expect(result.valid).toBe(false);
            expect(result.code).toBe('EMPTY');
        });
        
        test('should reject invalid prefix', () => {
            const result = InputValidator.validatePhone('809876543');
            expect(result.valid).toBe(false);
            expect(result.code).toBe('INVALID_PREFIX');
        });
        
        test('should reject all same digits', () => {
            const result = InputValidator.validatePhone('777777777');
            expect(result.valid).toBe(false);
            expect(result.code).toBe('INVALID_PATTERN');
        });
        
        test('should reject wrong length', () => {
            const result = InputValidator.validatePhone('7798765');
            expect(result.valid).toBe(false);
            expect(result.code).toBe('INVALID_LENGTH');
        });
    });

    describe('validateApiToken', () => {
        test('should accept valid token format', () => {
            const result = InputValidator.validateApiToken('A'.repeat(64));
            expect(result.valid).toBe(true);
            expect(result.code).toBe('VALID');
        });
        
        test('should accept lowercase input', () => {
            const result = InputValidator.validateApiToken('a'.repeat(64));
            expect(result.valid).toBe(true);
        });
        
        test('should reject empty token', () => {
            const result = InputValidator.validateApiToken('');
            expect(result.valid).toBe(false);
            expect(result.code).toBe('EMPTY');
        });
        
        test('should reject invalid format', () => {
            const result = InputValidator.validateApiToken(`${'A'.repeat(64)}ZZ`);
            expect(result.valid).toBe(false);
            expect(result.code).toBe('INVALID_FORMAT');
        });
    });

    describe('validatePassword', () => {
        test('should accept strong password', () => {
            const result = InputValidator.validatePassword('MyPassword123!@#');
            expect(result.valid).toBe(true);
            expect(result.strength).toBe('strong');
        });
        
        test('should reject short password', () => {
            const result = InputValidator.validatePassword('Pass1!');
            expect(result.valid).toBe(false);
            expect(result.code).toBe('TOO_SHORT');
        });
        
        test('should reject password without uppercase', () => {
            const result = InputValidator.validatePassword('password123!@#');
            expect(result.valid).toBe(false);
            expect(result.missingRequirements).toContain('uppercase letter');
        });
        
        test('should reject password without lowercase', () => {
            const result = InputValidator.validatePassword('PASSWORD123!@#');
            expect(result.valid).toBe(false);
            expect(result.missingRequirements).toContain('lowercase letter');
        });
        
        test('should reject password without numbers', () => {
            const result = InputValidator.validatePassword('MyPassword!@#');
            expect(result.valid).toBe(false);
            expect(result.missingRequirements).toContain('number');
        });
    });

    describe('validateForm', () => {
        test('should validate complete form', () => {
            const result = InputValidator.validateForm({
                username: 'testuser123',
                firstName: 'John',
                lastName: 'Doe',
                email: 'john@gmail.com',
                phoneNumber: '779876543',
                apiToken: 'A'.repeat(64)
            });
            
            expect(result.valid).toBe(true);
            expect(Object.keys(result.errors)).toHaveLength(0);
        });
        
        test('should collect multiple errors', () => {
            const result = InputValidator.validateForm({
                username: 'ab', // Too short
                email: 'invalid', // Not Gmail
                phoneNumber: '999' // Invalid
            });
            
            expect(result.valid).toBe(false);
            expect(result.errors.username).toBeDefined();
            expect(result.errors.email).toBeDefined();
            expect(result.errors.phoneNumber).toBeDefined();
        });
    });
});

describe('secure API token generation', () => {
    test('generates 256-bit hexadecimal bearer tokens', () => {
        const token = generateApiToken();

        expect(token).toMatch(/^[A-F0-9]{64}$/);
    });

    test('generates distinct tokens for separate calls', () => {
        expect(generateApiToken()).not.toBe(generateApiToken());
    });
});

describe('InputSanitizer', () => {
    describe('sanitizeUsername', () => {
        test('should sanitize valid username', () => {
            const result = InputSanitizer.sanitizeUsername('  testuser123  ');
            expect(result).toBe('testuser123');
        });
        
        test('should remove dangerous characters', () => {
            const result = InputSanitizer.sanitizeUsername('test<script>user');
            expect(result).not.toContain('<');
            expect(result).not.toContain('>');
        });
        
        test('should throw on invalid type', () => {
            expect(() => {
                InputSanitizer.sanitizeUsername(123);
            }).toThrow();
        });
    });
    
    describe('sanitizeEmail', () => {
        test('should sanitize email', () => {
            const result = InputSanitizer.sanitizeEmail('  Test@Gmail.COM  ');
            expect(result).toBe('test@gmail.com');
        });
        
        test('should throw on invalid email', () => {
            expect(() => {
                InputSanitizer.sanitizeEmail('notanemail');
            }).toThrow();
        });
    });
});

describe('LockoutManager', () => {
    beforeEach(() => {
        global.localStorage.clear();
    });
    
    test('should not be locked initially', () => {
        const lockout = new LockoutManager('test_lockout');
        expect(lockout.isLocked()).toBe(false);
    });
    
    test('should lock after max attempts', () => {
        const lockout = new LockoutManager('test_lockout', {
            initialAttempts: 3
        });
        
        lockout.recordFailedAttempt();
        lockout.recordFailedAttempt();
        const result = lockout.recordFailedAttempt();
        
        expect(result.locked).toBe(true);
        expect(lockout.isLocked()).toBe(true);
    });
    
    test('should track lockout count', () => {
        const lockout = new LockoutManager('test_lockout', {
            initialAttempts: 2,
            duration: 100 // 100ms for testing
        });
        
        lockout.recordFailedAttempt();
        const result1 = lockout.recordFailedAttempt();
        
        expect(result1.lockoutCount).toBe(1);
    });
    
    test('should reset on successful login', () => {
        const lockout = new LockoutManager('test_lockout', {
            initialAttempts: 3
        });
        
        lockout.recordFailedAttempt();
        lockout.recordFailedAttempt();
        lockout.recordSuccessfulLogin();
        
        const status = lockout.getStatus();
        expect(status.attempts).toBe(0);
        expect(status.lockoutCount).toBe(0);
    });
    
    test('should return correct status', () => {
        const lockout = new LockoutManager('test_lockout');
        const status = lockout.getStatus();
        
        expect(status.isLocked).toBe(false);
        expect(status.attempts).toBe(0);
        expect(status.remainingAttempts).toBeGreaterThan(0);
    });
});

describe('ErrorManager', () => {
    test('should classify network errors', () => {
        const error = new Error('Network connection failed');
        const classified = ErrorManager.classify(error, 'test');
        
        expect(classified.type).toBe(ErrorManager.ERROR_TYPES.NETWORK);
    });
    
    test('should classify validation errors', () => {
        const error = new Error('Validation failed: Invalid format');
        const classified = ErrorManager.classify(error, 'test');
        
        expect(classified.type).toBe(ErrorManager.ERROR_TYPES.VALIDATION);
    });
    
    test('should classify auth errors', () => {
        const error = new Error('Invalid credentials');
        const classified = ErrorManager.classify(error, 'test');
        
        expect(classified.type).toBe(ErrorManager.ERROR_TYPES.AUTHENTICATION);
    });
    
    test('should include context in classified error', () => {
        const error = new Error('Test error');
        const classified = ErrorManager.classify(error, 'login');
        
        expect(classified.details.context).toBe('login');
    });
});

// Export test utilities
export { MockLocalStorage };
