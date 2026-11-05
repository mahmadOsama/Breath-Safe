// ==========================================
// BREATHSAFE BLOCKED SCREEN - REDIRECT VERSION
// Redirects to dedicated blocked screen page
// With Unblock Detection Support
// ==========================================

const BlockedScreen = {
    blockInfo: null,
    deviceInfo: null,

    getBlockedScreenPath() {
        // Get the base path and normalize it
        const currentPath = window.location.pathname;
        const originUrl = window.location.origin;
        
        // Always use absolute path to /Login-codes/blocked-screen.html
        // This ensures consistent behavior regardless of current location
        return originUrl + '/Login-codes/blocked-screen.html';
    },

    show(blockInfo) {
        this.blockInfo = blockInfo;
        this.deviceInfo = window.DeviceFingerprint?.getQuick() || {};
        
        console.log('🚫 Redirecting to blocked screen page');
        console.log('📋 Block info:', blockInfo);
        
        // Store comprehensive block info for the blocked page
        try {
            const blockData = {
                reason: blockInfo.reason || 'Security restriction',
                blockedAt: new Date().toISOString(),
                blockType: blockInfo.blockType || 'device',
                ipAddress: blockInfo.ipAddress || this.deviceInfo?.ipAddress || 'Unknown',
                deviceId: blockInfo.deviceId || this.deviceInfo?.id || 'Unknown',
                deviceName: blockInfo.deviceName || this.deviceInfo?.name || 'Unknown Device',
                blockedBy: blockInfo.blockedBy || null,
                // Store original deviceInfo for appeal submission
                fullDeviceInfo: this.deviceInfo
            };
            
            localStorage.setItem('breathsafe_block_info', JSON.stringify(blockData));
            console.log('✅ Block info stored:', blockData);
        } catch (error) {
            console.warn('⚠️ Failed to store block info:', error);
        }

        // Redirect to blocked screen page with dynamic path
        const blockedPath = this.getBlockedScreenPath();
        console.log('📂 Redirecting to:', blockedPath);
        window.location.href = blockedPath;
    },

    // Legacy method for backward compatibility
    showBlockedMessage(blockInfo) {
        this.show(blockInfo);
    }
};

// Also update LoginSecurityCheck if it exists
if (window.LoginSecurityCheck) {
    console.log('🔧 Updating existing LoginSecurityCheck with redirect functionality');
    
    // Override the showBlockedMessage method
    const originalShowBlockedMessage = window.LoginSecurityCheck.showBlockedMessage;
    
    window.LoginSecurityCheck.showBlockedMessage = function(blockInfo) {
        console.log('🚫 LoginSecurityCheck: Redirecting to blocked screen page');
        console.log('📋 Block details:', blockInfo);
        
        // Get device info if available
        const deviceInfo = this.deviceInfo || window.DeviceFingerprint?.getQuick() || {};
        
        // Store comprehensive block info for the blocked page
        try {
            const blockData = {
                reason: blockInfo.reason || 'Security restriction',
                blockedAt: new Date().toISOString(),
                blockType: blockInfo.blockType || 'device',
                ipAddress: blockInfo.ipAddress || deviceInfo?.ipAddress || 'Unknown',
                deviceId: blockInfo.deviceId || deviceInfo?.id || 'Unknown',
                deviceName: blockInfo.deviceName || deviceInfo?.name || 'Unknown Device',
                blockedBy: blockInfo.blockedBy || null,
                fullDeviceInfo: deviceInfo
            };
            
            localStorage.setItem('breathsafe_block_info', JSON.stringify(blockData));
            console.log('✅ Block info stored for blocked screen');
        } catch (error) {
            console.warn('⚠️ Failed to store block info:', error);
        }

        // Redirect to blocked screen page with absolute path
        const originUrl = window.location.origin;
        const blockedPath = originUrl + '/Login-codes/blocked-screen.html';
        console.log('📂 Redirecting to:', blockedPath);
        window.location.href = blockedPath;
    };
    
} else {
    console.log('🔧 Creating LoginSecurityCheck with redirect functionality');
    
    // Create LoginSecurityCheck with the redirect functionality
    window.LoginSecurityCheck = {
        db: null,
        initialized: false,
        deviceInfo: null,
        
        // Configuration
        DETECTION_CONFIG: {
            TRACKING_WINDOW: 24 * 60 * 60 * 1000, // 24 hours
            REQUIRE_LOGIN_ATTEMPT: true,
            WHITELIST_IPS: [] // Add trusted IPs here if needed
        },

        async init() {
            if (this.initialized) {
                console.log('✅ Security already initialized');
                return true;
            }
            
            try {
                console.log('🔧 Initializing Security Check...');
                
                if (typeof firebase === 'undefined') {
                    console.error('❌ Firebase not loaded');
                    return false;
                }
                
                let app;
                try {
                    app = firebase.app('securityApp');
                    console.log('✅ Using existing Firebase app');
                } catch (e) {
                    console.log('🔧 Creating new Firebase app for security...');
                    app = firebase.initializeApp({
                        apiKey: "YOUR_FIREBASE_WEB_API_KEY",
                        authDomain: "YOUR_FIREBASE_PROJECT_ID.firebaseapp.com",
                        projectId: "YOUR_FIREBASE_PROJECT_ID",
                        storageBucket: "YOUR_FIREBASE_PROJECT_ID.firebasestorage.app",
                        messagingSenderId: "YOUR_FIREBASE_MESSAGING_SENDER_ID",
                        appId: "YOUR_FIREBASE_APP_ID"
                    }, 'securityApp');
                }
                
                this.db = firebase.firestore(app);
                
                // Try to generate device fingerprint
                try {
                    if (window.DeviceFingerprint) {
                        this.deviceInfo = await window.DeviceFingerprint.getFullDeviceInfo();
                        console.log('📱 Device identified:', this.deviceInfo.name, this.deviceInfo.shortId);
                    } else {
                        console.warn('⚠️ DeviceFingerprint not available, using fallback');
                        this.deviceInfo = await this.getFallbackDeviceInfo();
                    }
                } catch (error) {
                    console.warn('⚠️ Device fingerprint failed, using fallback:', error);
                    this.deviceInfo = await this.getFallbackDeviceInfo();
                }
                
                this.initialized = true;
                console.log('✅ Security Check initialized');
                return true;
                
            } catch (error) {
                console.error('❌ Failed to initialize security check:', error);
                return false;
            }
        },

        async getFallbackDeviceInfo() {
            const ip = await this.getIPAddress();
            const ua = navigator.userAgent;
            const fallbackId = btoa(ua + navigator.language + screen.width + screen.height)
                .replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
            
            return {
                id: fallbackId,
                name: this.getSimpleDeviceName(),
                shortId: fallbackId.substring(0, 8).toUpperCase(),
                ipAddress: ip,
                isFallback: true,
                components: {},
                generatedAt: Date.now()
            };
        },

        getSimpleDeviceName() {
            const ua = navigator.userAgent;
            if (/iPhone/i.test(ua)) return 'iPhone';
            if (/iPad/i.test(ua)) return 'iPad';
            if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Android Phone' : 'Android Tablet';
            if (/Macintosh/i.test(ua)) return 'Mac';
            if (/Windows/i.test(ua)) return 'Windows PC';
            if (/Linux/i.test(ua)) return 'Linux PC';
            return 'Unknown Device';
        },

        async checkBlockedDevice() {
            console.log('🔍 Checking block status...');
            
            try {
                const initSuccess = await this.init();
                if (!initSuccess) {
                    console.warn('⚠️ Security check not initialized, allowing access');
                    return { blocked: false };
                }
                
                const deviceId = this.deviceInfo.id;
                const ipAddress = this.deviceInfo.ipAddress;
                
                console.log('🔍 Checking device:', deviceId);
                console.log('🔍 Checking IP:', ipAddress);
                
                // 1. Check device block (new system)
                try {
                    const deviceBlock = await this.db.collection('blocked_devices')
                        .where('deviceId', '==', deviceId)
                        .where('isActive', '==', true)
                        .limit(1)
                        .get();

                    if (!deviceBlock.empty) {
                        const blockData = deviceBlock.docs[0].data();
                        console.log('🚫 Device is blocked:', blockData);
                        return {
                            blocked: true,
                            blockType: 'device',
                            reason: blockData.reason,
                            deviceName: this.deviceInfo.name,
                            blockedAt: blockData.blockedAt?.toDate(),
                            blockedBy: blockData.blockedBy,
                            deviceId: deviceId,
                            ipAddress: ipAddress
                        };
                    }
                } catch (error) {
                    console.warn('⚠️ Device block check failed:', error);
                }

                // 2. Check IP block (old system) - only if IP is available
                if (ipAddress && ipAddress !== 'Unknown') {
                    try {
                        const ipBlock = await this.db.collection('blocked_ips')
                            .where('ipAddress', '==', ipAddress)
                            .where('isActive', '==', true)
                            .limit(1)
                            .get();

                        if (!ipBlock.empty) {
                            const blockData = ipBlock.docs[0].data();
                            
                            // Check if this specific device is whitelisted
                            if (blockData.whitelistedDevices?.includes(deviceId)) {
                                console.log('✅ Device whitelisted on blocked IP');
                                return { blocked: false };
                            }
                            
                            console.log('🚫 IP is blocked (legacy):', blockData);
                            return {
                                blocked: true,
                                blockType: 'ip',
                                reason: blockData.reason,
                                blockedAt: blockData.blockedAt?.toDate(),
                                blockedBy: blockData.blockedBy,
                                deviceId: deviceId,
                                ipAddress: ipAddress,
                                deviceName: this.deviceInfo.name
                            };
                        }
                    } catch (error) {
                        console.warn('⚠️ IP block check failed:', error);
                    }
                }

                console.log('✅ Device/IP not blocked');
                return { blocked: false };
                
            } catch (error) {
                console.error('❌ Error checking blocked status:', error);
                // If check fails, allow access (fail open for user experience)
                return { blocked: false };
            }
        },

        async getIPAddress() {
            try {
                const services = [
                    'https://api.ipify.org?format=json',
                    'https://api.my-ip.io/ip.json',
                    'https://ipapi.co/json/'
                ];
                
                for (const service of services) {
                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 5000);
                        
                        const response = await fetch(service, { signal: controller.signal });
                        clearTimeout(timeoutId);
                        
                        const data = await response.json();
                        const ip = data.ip || data.IPv4 || data.query;
                        if (ip) {
                            console.log('✅ IP obtained:', ip);
                            return ip;
                        }
                    } catch (e) {
                        console.warn('⚠️ IP service failed, trying next...', e.message);
                        continue;
                    }
                }
                
                console.warn('⚠️ All IP services failed');
                return 'Unknown';
            } catch (error) {
                console.error('❌ Error getting IP:', error);
                return 'Unknown';
            }
        },

        showBlockedMessage(blockInfo) {
            console.log('🚫 Redirecting to blocked screen page');
            console.log('📋 Block info:', blockInfo);
            
            // Store comprehensive block info for the blocked page
            try {
                const blockData = {
                    reason: blockInfo.reason || 'Security restriction',
                    blockedAt: new Date().toISOString(),
                    blockType: blockInfo.blockType || 'device',
                    ipAddress: blockInfo.ipAddress || this.deviceInfo?.ipAddress || 'Unknown',
                    deviceId: blockInfo.deviceId || this.deviceInfo?.id || 'Unknown',
                    deviceName: blockInfo.deviceName || this.deviceInfo?.name || 'Unknown Device',
                    blockedBy: blockInfo.blockedBy || null,
                    fullDeviceInfo: this.deviceInfo
                };
                
                localStorage.setItem('breathsafe_block_info', JSON.stringify(blockData));
                console.log('✅ Block info stored successfully');
            } catch (error) {
                console.warn('⚠️ Failed to store block info:', error);
            }

            // Redirect to blocked screen page with absolute path
            const originUrl = window.location.origin;
            const blockedPath = originUrl + '/Login-codes/blocked-screen.html';
            console.log('📂 Redirecting to:', blockedPath);
            window.location.href = blockedPath;
        }
    };
}

// Auto-initialize and check on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Starting security check on page load...');
    
    // Only run on login pages (not on blocked screen itself)
    if (window.location.pathname.includes('blocked-screen.html')) {
        console.log('ℹ️ Already on blocked screen, skipping check');
        return;
    }
    
    if (window.LoginSecurityCheck && typeof window.LoginSecurityCheck.checkBlockedDevice === 'function') {
        try {
            const result = await window.LoginSecurityCheck.checkBlockedDevice();
            
            if (result.blocked) {
                console.log('🚫 Access blocked - redirecting to blocked screen');
                window.LoginSecurityCheck.showBlockedMessage(result);
            } else {
                console.log('✅ Access allowed');
            }
        } catch (error) {
            console.error('❌ Security check error:', error);
            // Allow access on error
        }
    } else {
        console.log('ℹ️ LoginSecurityCheck not available yet');
    }
});

// Make globally available
window.BlockedScreen = BlockedScreen;
console.log('✅ BlockedScreen module loaded (Enhanced Redirect Version)');