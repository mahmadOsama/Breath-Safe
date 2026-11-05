// Generate high-entropy bearer tokens with the browser's cryptographic RNG.
(function attachBreathSafeSecurity(global) {
    'use strict';

    function generateApiToken() {
        const cryptoApi = global.crypto;
        if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
            throw new Error('A secure random number generator is unavailable');
        }

        const bytes = new Uint8Array(32);
        cryptoApi.getRandomValues(bytes);
        return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
    }

    global.BreathSafeSecurity = Object.freeze({ generateApiToken });
})(globalThis);
