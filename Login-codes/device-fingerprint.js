// ==========================================
// BREATHSAFE DEVICE FINGERPRINT - ULTRA
// High-Performance Device Identification
// Version: 2.0.0
// ==========================================

(function(global) {
    'use strict';

    // ========== CONSTANTS ==========
    const CACHE_KEY = 'bs_device_fp';
    const CACHE_TTL = 300000; // 5 minutes
    const IP_TIMEOUT = 3000;
    const IP_SERVICES = [
        'https://api.ipify.org?format=json',
        'https://api.my-ip.io/ip.json'
    ];

    // ========== PRE-COMPUTED VALUES ==========
    const UA = navigator.userAgent;
    const PLATFORM = navigator.platform || 'unknown';
    const LANG = navigator.language || 'en';
    const SCREEN_W = screen.width;
    const SCREEN_H = screen.height;
    const PIXEL_RATIO = window.devicePixelRatio || 1;
    const CORES = navigator.hardwareConcurrency || 2;
    const MEMORY = navigator.deviceMemory || 4;
    const TOUCH_POINTS = navigator.maxTouchPoints || 0;
    const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const TZ_OFFSET = new Date().getTimezoneOffset();

    // ========== DEVICE DETECTION (Pre-computed) ==========
    const DEVICE_INFO = (function() {
        let type = 'desktop', brand = 'PC', name = 'Computer', icon = 'fa-desktop';

        if (/iPhone/i.test(UA)) {
            type = 'mobile'; brand = 'Apple'; name = 'iPhone'; icon = 'fa-mobile-alt';
        } else if (/iPad/i.test(UA)) {
            type = 'tablet'; brand = 'Apple'; name = 'iPad'; icon = 'fa-tablet-alt';
        } else if (/Android/i.test(UA)) {
            if (/Mobile/i.test(UA)) {
                type = 'mobile'; name = 'Android Phone'; icon = 'fa-mobile-alt';
            } else {
                type = 'tablet'; name = 'Android Tablet'; icon = 'fa-tablet-alt';
            }
            const match = UA.match(/;\s*([^;)]+)\s+Build/i);
            if (match) {
                const model = match[1].trim();
                if (model.startsWith('SM')) brand = 'Samsung';
                else if (/Pixel/i.test(model)) brand = 'Google';
                else if (/MI|Redmi|POCO/i.test(model)) brand = 'Xiaomi';
                else if (/ONEPLUS/i.test(model)) brand = 'OnePlus';
                else if (/OPPO/i.test(model)) brand = 'OPPO';
                else if (/vivo/i.test(model)) brand = 'Vivo';
                else if (/realme/i.test(model)) brand = 'Realme';
                else if (/HUAWEI/i.test(model)) brand = 'Huawei';
                else brand = model.split(' ')[0];
            } else {
                brand = 'Android';
            }
        } else if (/Macintosh/i.test(UA)) {
            brand = 'Apple'; name = 'Mac'; icon = 'fa-laptop';
            if (TOUCH_POINTS > 1) name = 'Mac (Apple Silicon)';
        } else if (/Windows/i.test(UA)) {
            name = 'Windows PC';
            if (/Windows NT 10/i.test(UA)) name = 'Windows 10/11 PC';
        } else if (/Linux/i.test(UA)) {
            name = 'Linux PC';
            if (/Ubuntu/i.test(UA)) name = 'Ubuntu PC';
        } else if (/CrOS/i.test(UA)) {
            name = 'Chromebook'; brand = 'Chrome OS';
        }

        return { type, brand, name, icon };
    })();

    // ========== BROWSER DETECTION (Pre-computed) ==========
    const BROWSER_INFO = (function() {
        let name = 'Unknown', version = '', icon = 'fa-globe';

        if (/Firefox/i.test(UA)) {
            name = 'Firefox';
            version = (UA.match(/Firefox\/(\d+)/) || [])[1] || '';
            icon = 'fa-firefox-browser';
        } else if (/Edg/i.test(UA)) {
            name = 'Edge';
            version = (UA.match(/Edg\/(\d+)/) || [])[1] || '';
            icon = 'fa-edge';
        } else if (/Chrome/i.test(UA) && !/Edg/i.test(UA)) {
            name = 'Chrome';
            version = (UA.match(/Chrome\/(\d+)/) || [])[1] || '';
            icon = 'fa-chrome';
        } else if (/Safari/i.test(UA) && !/Chrome/i.test(UA)) {
            name = 'Safari';
            version = (UA.match(/Version\/(\d+)/) || [])[1] || '';
            icon = 'fa-safari';
        } else if (/Opera|OPR/i.test(UA)) {
            name = 'Opera';
            version = (UA.match(/(?:Opera|OPR)\/(\d+)/) || [])[1] || '';
            icon = 'fa-opera';
        }

        return { 
            name, 
            version, 
            icon, 
            fullName: version ? `${name} ${version}` : name 
        };
    })();

    // ========== FAST HASH FUNCTION ==========
    function fastHash(str) {
        let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
        for (let i = 0, len = str.length; i < len; i++) {
            const ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
        h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        return ((h2 ^ (h2 >>> 16)) >>> 0).toString(36) + ((h1 ^ (h1 >>> 16)) >>> 0).toString(36);
    }

    // ========== CANVAS FINGERPRINT ==========
    function getCanvasHash() {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return 'no-canvas';

            canvas.width = 200;
            canvas.height = 50;

            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillStyle = '#f60';
            ctx.fillRect(100, 1, 62, 20);
            ctx.fillStyle = '#069';
            ctx.fillText('BreathSafe🔐', 2, 15);
            ctx.fillStyle = 'rgba(102,204,0,0.7)';
            ctx.fillText('Security', 4, 35);

            return fastHash(canvas.toDataURL());
        } catch (e) {
            return 'canvas-err';
        }
    }

    // ========== WEBGL FINGERPRINT ==========
    function getWebGLHash() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (!gl) return 'no-webgl';

            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unknown';
            const vendor = gl.getParameter(gl.VENDOR);

            return fastHash(vendor + renderer + gl.getParameter(gl.VERSION));
        } catch (e) {
            return 'webgl-err';
        }
    }

    // ========== AUDIO FINGERPRINT (Lightweight) ==========
    function getAudioHash() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return 'no-audio';
            return fastHash(AudioContext.toString() + (new AudioContext()).sampleRate);
        } catch (e) {
            return 'audio-err';
        }
    }

    // ========== GENERATE COMPONENTS ==========
    function generateComponents() {
        return {
            screen: {
                width: SCREEN_W,
                height: SCREEN_H,
                colorDepth: screen.colorDepth,
                pixelRatio: PIXEL_RATIO
            },
            browser: {
                userAgent: fastHash(UA),
                language: LANG,
                cookieEnabled: navigator.cookieEnabled,
                doNotTrack: navigator.doNotTrack,
                platform: PLATFORM
            },
            system: {
                cores: CORES,
                memory: MEMORY,
                touchPoints: TOUCH_POINTS
            },
            timezone: `${TIMEZONE}|${TZ_OFFSET}`,
            canvas: getCanvasHash(),
            webgl: getWebGLHash(),
            audio: getAudioHash()
        };
    }

    // ========== GENERATE FINGERPRINT ID ==========
    function generateFingerprintId(components) {
        const str = [
            components.screen.width,
            components.screen.height,
            components.screen.pixelRatio,
            components.system.cores,
            components.system.memory,
            components.system.touchPoints,
            components.browser.platform,
            components.browser.language,
            components.timezone,
            components.canvas,
            components.webgl,
            components.audio
        ].join('|');

        return fastHash(str);
    }

    // ========== GENERATE DEVICE NAME ==========
    function generateDeviceName() {
        return `${DEVICE_INFO.brand} ${DEVICE_INFO.name} (${BROWSER_INFO.name}) - ${SCREEN_W}x${SCREEN_H}`;
    }

    // ========== CACHE MANAGEMENT ==========
    function getCachedData() {
        try {
            const cached = sessionStorage.getItem(CACHE_KEY);
            if (cached) {
                const data = JSON.parse(cached);
                if (Date.now() - data.generatedAt < CACHE_TTL) {
                    return data;
                }
            }
        } catch (e) {}
        return null;
    }

    function setCachedData(data) {
        try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch (e) {}
    }

    // ========== IP ADDRESS FETCHER ==========
    async function fetchIPAddress() {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), IP_TIMEOUT);

        try {
            const requests = IP_SERVICES.map(url =>
                fetch(url, { signal: controller.signal })
                    .then(r => r.json())
                    .then(d => d.ip || d.IPv4 || d.query)
                    .catch(() => null)
            );

            const results = await Promise.race([
                Promise.race(requests.map(p => p.then(ip => ip ? ip : Promise.reject()))),
                new Promise((_, reject) => setTimeout(() => reject('timeout'), IP_TIMEOUT))
            ]);

            clearTimeout(timeout);
            return results || 'Unknown';
        } catch (e) {
            clearTimeout(timeout);
            return 'Unknown';
        }
    }

    // ========== MAIN API ==========
    const DeviceFingerprint = {
        _cache: null,
        _ipPromise: null,

        /**
         * Get fingerprint synchronously (no IP)
         * @returns {Object} Fingerprint data
        */
        getQuick() {
            // Return memory cache if available
            if (this._cache) return this._cache;

            // Check session storage cache
            const cached = getCachedData();
            if (cached) {
                this._cache = cached;
                return cached;
            }

            // Generate new fingerprint
            const components = generateComponents();
            const id = generateFingerprintId(components);

            const data = {
                id: id,
                shortId: id.substring(0, 12).toUpperCase(),
                name: generateDeviceName(),
                components: components,
                ipAddress: null,
                isFallback: false,
                generatedAt: Date.now()
            };

            this._cache = data;
            setCachedData(data);

            return data;
        },

        /**
         * Get full device info with IP (async)
         * @returns {Promise<Object>} Full fingerprint data
        */
        async getFullDeviceInfo() {
            const data = this.getQuick();

            // If IP already fetched, return immediately
            if (data.ipAddress && data.ipAddress !== 'Unknown') {
                return data;
            }

            // Fetch IP
            const ip = await this.getIPAddress();
            data.ipAddress = ip;

            // Update caches
            this._cache = data;
            setCachedData(data);

            return data;
        },

        /**
         * Alias for getFullDeviceInfo (backward compatibility)
        */
        async generate() {
            return this.getFullDeviceInfo();
        },

        /**
         * Get IP address
         * @returns {Promise<string>} IP address
        */
        async getIPAddress() {
            // Reuse pending promise if exists
            if (this._ipPromise) {
                return this._ipPromise;
            }

            // Check if already cached
            if (this._cache?.ipAddress && this._cache.ipAddress !== 'Unknown') {
                return this._cache.ipAddress;
            }

            this._ipPromise = fetchIPAddress().finally(() => {
                this._ipPromise = null;
            });

            return this._ipPromise;
        },

        /**
         * Get device info object
         * @returns {Object} Device information
        */
        getDeviceInfo() {
            return {
                type: DEVICE_INFO.type,
                name: DEVICE_INFO.name,
                icon: DEVICE_INFO.icon,
                os: PLATFORM,
                osVersion: '',
                fullName: `${DEVICE_INFO.name} (${PLATFORM})`
            };
        },

        /**
         * Get browser info object
         * @returns {Object} Browser information
        */
        getBrowserInfo() {
            return { ...BROWSER_INFO };
        },

        /**
         * Clear all caches
        */
        clearCache() {
            this._cache = null;
            this._ipPromise = null;
            try {
                sessionStorage.removeItem(CACHE_KEY);
            } catch (e) {}
        },

        /**
         * Compare two fingerprints
         * @param {Object} fp1 First fingerprint
         * @param {Object} fp2 Second fingerprint
         * @returns {number} Match percentage (0-100)
        */
        compare(fp1, fp2) {
            if (!fp1 || !fp2) return 0;
            if (fp1.id === fp2.id) return 100;

            let score = 0;
            const c1 = fp1.components || {};
            const c2 = fp2.components || {};

            // Screen match (30%)
            if (c1.screen && c2.screen) {
                if (c1.screen.width === c2.screen.width && c1.screen.height === c2.screen.height) {
                    score += 20;
                }
                if (c1.screen.pixelRatio === c2.screen.pixelRatio) {
                    score += 10;
                }
            }

            // Canvas match (25%)
            if (c1.canvas === c2.canvas && c1.canvas !== 'canvas-err') {
                score += 25;
            }

            // WebGL match (25%)
            if (c1.webgl === c2.webgl && c1.webgl !== 'webgl-err') {
                score += 25;
            }

            // System match (20%)
            if (c1.system && c2.system) {
                if (c1.system.cores === c2.system.cores) score += 10;
                if (c1.system.touchPoints === c2.system.touchPoints) score += 10;
            }

            return score;
        }
    };

    // ========== EARLY INITIALIZATION ==========
    // Generate fingerprint immediately (non-blocking)
    DeviceFingerprint.getQuick();

    // Fetch IP in background when browser is idle
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => DeviceFingerprint.getFullDeviceInfo(), { timeout: 2000 });
    } else {
        setTimeout(() => DeviceFingerprint.getFullDeviceInfo(), 50);
    }

    // ========== EXPORT ==========
    global.DeviceFingerprint = DeviceFingerprint;

    console.log('🔐 DeviceFingerprint v2.0 ready:', DeviceFingerprint.getQuick().shortId);

})(typeof window !== 'undefined' ? window : this);