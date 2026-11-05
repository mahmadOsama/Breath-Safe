// ==========================================
// BREATHSAFE LOGIN SECURITY CHECK - BACKWARD COMPATIBLE
// Device-Based Blocking with IP Fallback Support
// with Unblock Detection Integration
// ==========================================

const LoginSecurityCheck = {
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
            console.log('🔧 Initializing Backward Compatible Security...');
            
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
            
            // Try to generate device fingerprint, but don't fail if it doesn't work
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
            console.log('✅ Backward Compatible Security initialized');
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
        console.log('🔍 Checking block status (backward compatible)...');
        
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

    async recordLockoutAttempt(userType, username) {
        console.log(`🔒 Recording lockout attempt for ${userType}: ${username}`);
        
        try {
            const initSuccess = await this.init();
            if (!initSuccess) {
                console.error('❌ Cannot record lockout - security not initialized');
                return null;
            }
            
            const deviceId = this.deviceInfo.id;
            const deviceName = this.deviceInfo.name;
            const shortId = this.deviceInfo.shortId;
            const ipAddress = this.deviceInfo.ipAddress;
            
            console.log('📊 Lockout details:', { 
                device: deviceName, 
                deviceId: shortId,
                ip: ipAddress 
            });

            // Get lockout history for this DEVICE (preferred) or IP (fallback)
            const cutoff = new Date(Date.now() - this.DETECTION_CONFIG.TRACKING_WINDOW);
            console.log('📖 Fetching lockout history since:', cutoff);
            
            let historySnapshot;
            try {
                // Try device-based history first
                historySnapshot = await this.db.collection('lockout_history')
                    .where('deviceId', '==', deviceId)
                    .where('timestamp', '>', cutoff)
                    .orderBy('timestamp', 'desc')
                    .get();
            } catch (error) {
                console.warn('⚠️ Device history failed, trying IP-based:', error);
                // Fallback to IP-based history
                if (ipAddress && ipAddress !== 'Unknown') {
                    try {
                        historySnapshot = await this.db.collection('lockout_history')
                            .where('ipAddress', '==', ipAddress)
                            .where('timestamp', '>', cutoff)
                            .orderBy('timestamp', 'desc')
                            .get();
                    } catch (e) {
                        console.warn('⚠️ IP history also failed:', e);
                        historySnapshot = { size: 0, empty: true, forEach: () => {} };
                    }
                } else {
                    historySnapshot = { size: 0, empty: true, forEach: () => {} };
                }
            }

            const consecutiveLockouts = historySnapshot.size + 1;
            console.log(`📊 Consecutive lockouts: ${consecutiveLockouts}`);

            // Determine severity
            let severity = 'warning';
            if (consecutiveLockouts >= 3) {
                severity = 'critical';
                console.warn('🚨 CRITICAL: 3rd lockout detected!');
            } else if (consecutiveLockouts >= 2) {
                severity = 'suspicious';
                console.warn('⚠️ SUSPICIOUS: 2nd lockout detected!');
            }

            // Create security log entry with both device and IP info
            console.log('💾 Creating security log entry...');
            const securityLogData = {
                action: 'lockout',
                actionCategory: 'security',
                userType: userType,
                username: username,
                
                // Device info (if available)
                deviceId: deviceId,
                deviceName: deviceName,
                deviceShortId: shortId,
                
                // IP info (always include for backward compatibility)
                ipAddress: ipAddress,
                
                // Browser/Device details
                device: this.getDeviceInfo(),
                browser: this.getBrowserInfo(),
                userAgent: navigator.userAgent,
                
                // Tracking
                consecutiveLockouts: consecutiveLockouts,
                severity: severity,
                isSuspicious: consecutiveLockouts >= 2,
                isCritical: consecutiveLockouts >= 3,
                
                // Status
                isBlocked: false,
                blockedBy: null,
                blockedAt: null,
                unblockedBy: null,
                unblockedAt: null,
                unblockReason: null,
                
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                reviewed: false,
                reviewedBy: null,
                reviewedAt: null,
                notes: null,
                
                // Compatibility flag
                isBackwardCompatible: this.deviceInfo.isFallback || false
            };
            
            const logRef = await this.db.collection('security_logs').add(securityLogData);
            console.log('✅ Security log created:', logRef.id);

            // Add to lockout history
            console.log('💾 Adding to lockout history...');
            const historyData = {
                deviceId: deviceId,
                deviceName: deviceName,
                deviceShortId: shortId,
                ipAddress: ipAddress,
                username: username,
                userType: userType,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                securityLogId: logRef.id
            };
            
            const historyRef = await this.db.collection('lockout_history').add(historyData);
            console.log('✅ Lockout history created:', historyRef.id);

// AUTO-BLOCK ON THIRD LOCKOUT
// AUTO-BLOCK ON THIRD LOCKOUT
if (consecutiveLockouts >= 3) {
    console.warn('🚨 AUTO-BLOCKING after 3 lockouts...');
    
    // Block immediately without waiting
    const blockPromises = [];
    
    // Prefer device blocking, fallback to IP blocking
    if (!this.deviceInfo.isFallback) {
        // Block device
        const blockData = {
            deviceId: deviceId,
            deviceName: deviceName,
            deviceShortId: shortId,
            ipAddress: ipAddress,
            reason: `Auto-blocked: ${consecutiveLockouts} consecutive failed login attempts by ${userType} "${username}"`,
            blockedBy: { 
                id: 'system', 
                username: 'Auto-Block System', 
                role: 'system' 
            },
            blockedAt: firebase.firestore.FieldValue.serverTimestamp(),
            isActive: true,
            autoBlocked: true,
            relatedUsername: username,
            relatedUserType: userType,
            lockoutCount: consecutiveLockouts
        };
        
        blockPromises.push(
            this.db.collection('blocked_devices').add(blockData)
                .then(ref => console.log('✅ Device blocked:', ref.id))
        );
    } else {
        // Fallback to IP blocking
        const blockData = {
            ipAddress: ipAddress,
            reason: `Auto-blocked: ${consecutiveLockouts} consecutive failed login attempts by ${userType} "${username}" (fallback mode)`,
            blockedBy: { 
                id: 'system', 
                username: 'Auto-Block System', 
                role: 'system' 
            },
            blockedAt: firebase.firestore.FieldValue.serverTimestamp(),
            isActive: true,
            autoBlocked: true,
            relatedUsername: username,
            relatedUserType: userType,
            lockoutCount: consecutiveLockouts,
            whitelistedDevices: []
        };
        
        blockPromises.push(
            this.db.collection('blocked_ips').add(blockData)
                .then(ref => console.log('✅ IP blocked (fallback):', ref.id))
        );
    }

    // Update security log
    blockPromises.push(
        logRef.update({
            isBlocked: true,
            blockedAt: firebase.firestore.FieldValue.serverTimestamp(),
            blockedBy: { id: 'system', username: 'Auto-Block System', role: 'system' }
        })
    );

    // Create admin alert if needed
    if (userType === 'admin') {
        blockPromises.push(
            this.createAdminDisableAlert(username, ipAddress, consecutiveLockouts)
        );
    }
    
    // Wait for all blocks to complete, then redirect IMMEDIATELY
    Promise.all(blockPromises).then(() => {
        console.log('🚨 AUTO-BLOCK COMPLETE - Redirecting NOW...');
        
        // Show blocked screen immediately (no timeout)
        if (window.BlockedScreen) {
            window.BlockedScreen.show({
                reason: `Auto-blocked after ${consecutiveLockouts} failed attempts`,
                blockedAt: new Date().toISOString(),
                blockType: this.deviceInfo.isFallback ? 'ip' : 'device',
                deviceId: deviceId,
                deviceName: deviceName,
                ipAddress: ipAddress,
                blockedBy: 'system'
            });
        } else {
            // Fallback: force reload
            window.location.reload();
        }
    }).catch(err => {
        console.error('❌ Block failed:', err);
        // Force reload anyway
        window.location.reload();
    });
}

            console.log('✅ Lockout recorded successfully');

            return {
                logId: logRef.id,
                consecutiveLockouts,
                severity,
                blocked: consecutiveLockouts >= 3,
                deviceId: shortId
            };

        } catch (error) {
            console.error('❌ Failed to record lockout:', error);
            console.error('Error details:', error.message);
            return null;
        }
    },

    async createAdminDisableAlert(adminUsername, ipAddress, lockoutCount) {
        if (!this.db) return;
        
        try {
            await this.db.collection('admin_alerts').add({
                type: 'admin_security_risk',
                adminUsername: adminUsername,
                ipAddress: ipAddress,
                lockoutCount: lockoutCount,
                message: `Admin "${adminUsername}" has been locked out ${lockoutCount} times. Consider disabling admin role.`,
                severity: 'critical',
                requiresAction: true,
                actionType: 'disable_admin',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                resolved: false,
                resolvedBy: null,
                resolvedAt: null
            });
            
            console.log(`🚨 Admin security alert created for: ${adminUsername}`);
        } catch (error) {
            console.error('Failed to create admin alert:', error);
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

    getDeviceInfo() {
        const ua = navigator.userAgent;
        let deviceType = 'desktop';
        let deviceName = 'Unknown Device';
        let deviceIcon = 'fa-desktop';
        let os = 'Unknown';
        let osVersion = '';

        if (/iPhone/i.test(ua)) {
            deviceType = 'mobile';
            deviceName = 'iPhone';
            deviceIcon = 'fa-mobile-alt';
            os = 'iOS';
            osVersion = ua.match(/OS (\d+[._]\d+)/)?.[1]?.replace('_', '.') || '';
        } else if (/iPad/i.test(ua)) {
            deviceType = 'tablet';
            deviceName = 'iPad';
            deviceIcon = 'fa-tablet-alt';
            os = 'iPadOS';
            osVersion = ua.match(/OS (\d+[._]\d+)/)?.[1]?.replace('_', '.') || '';
        } else if (/Android/i.test(ua)) {
            if (/Mobile/i.test(ua)) {
                deviceType = 'mobile';
                deviceName = 'Android Phone';
                deviceIcon = 'fa-mobile-alt';
            } else {
                deviceType = 'tablet';
                deviceName = 'Android Tablet';
                deviceIcon = 'fa-tablet-alt';
            }
            os = 'Android';
            osVersion = ua.match(/Android (\d+\.?\d*)/)?.[1] || '';
        } else if (/Macintosh|Mac OS X/i.test(ua)) {
            deviceType = 'desktop';
            deviceName = 'Mac';
            deviceIcon = 'fa-laptop';
            os = 'macOS';
            osVersion = ua.match(/Mac OS X (\d+[._]\d+)/)?.[1]?.replace('_', '.') || '';
        } else if (/Windows/i.test(ua)) {
            deviceType = 'desktop';
            deviceName = 'Windows PC';
            deviceIcon = 'fa-desktop';
            os = 'Windows';
            const winVersion = ua.match(/Windows NT (\d+\.\d+)/)?.[1];
            if (winVersion === '10.0') osVersion = '10/11';
            else if (winVersion === '6.3') osVersion = '8.1';
            else if (winVersion === '6.2') osVersion = '8';
            else if (winVersion === '6.1') osVersion = '7';
        } else if (/Linux/i.test(ua)) {
            deviceType = 'desktop';
            deviceName = 'Linux PC';
            deviceIcon = 'fa-desktop';
            os = 'Linux';
        }

        return {
            type: deviceType,
            name: deviceName,
            icon: deviceIcon,
            os: os,
            osVersion: osVersion,
            fullName: `${deviceName} (${os}${osVersion ? ' ' + osVersion : ''})`
        };
    },

    getBrowserInfo() {
        const ua = navigator.userAgent;
        let browserName = 'Unknown';
        let browserVersion = '';
        let browserIcon = 'fa-globe';

        if (ua.indexOf('Firefox') > -1) {
            browserName = 'Firefox';
            browserVersion = ua.match(/Firefox\/(\d+\.?\d*)/)?.[1] || '';
            browserIcon = 'fa-firefox-browser';
        } else if (ua.indexOf('Edg') > -1) {
            browserName = 'Edge';
            browserVersion = ua.match(/Edg\/(\d+\.?\d*)/)?.[1] || '';
            browserIcon = 'fa-edge';
        } else if (ua.indexOf('Chrome') > -1 && ua.indexOf('Edg') === -1) {
            browserName = 'Chrome';
            browserVersion = ua.match(/Chrome\/(\d+\.?\d*)/)?.[1] || '';
            browserIcon = 'fa-chrome';
        } else if (ua.indexOf('Safari') > -1 && ua.indexOf('Chrome') === -1) {
            browserName = 'Safari';
            browserVersion = ua.match(/Version\/(\d+\.?\d*)/)?.[1] || '';
            browserIcon = 'fa-safari';
        } else if (ua.indexOf('Opera') > -1 || ua.indexOf('OPR') > -1) {
            browserName = 'Opera';
            browserVersion = ua.match(/(?:Opera|OPR)\/(\d+\.?\d*)/)?.[1] || '';
            browserIcon = 'fa-opera';
        }

        return {
            name: browserName,
            version: browserVersion,
            icon: browserIcon,
            fullName: browserVersion ? `${browserName} ${browserVersion}` : browserName
        };
    },

    showBlockedMessage(blockInfo) {
        console.log('🚫 Showing blocked screen');
        console.log('📋 Block info:', blockInfo);
        
        // Hide login form
        const loginCard = document.querySelector('.login-card');
        if (loginCard) {
            loginCard.style.display = 'none';
        }

        // Use the new BlockedScreen module
        if (window.BlockedScreen) {
            // Enhance blockInfo with device details
            const enhancedBlockInfo = {
                ...blockInfo,
                ipAddress: blockInfo.ipAddress || this.deviceInfo?.ipAddress || 'Unknown',
                deviceId: blockInfo.deviceId || this.deviceInfo?.id || 'Unknown',
                deviceName: blockInfo.deviceName || this.deviceInfo?.name || 'Unknown Device',
                fullDeviceInfo: this.deviceInfo
            };
            
            console.log('📤 Redirecting with enhanced block info:', enhancedBlockInfo);
            window.BlockedScreen.show(enhancedBlockInfo);
        } else {
            console.warn('⚠️ BlockedScreen module not available, using fallback');
            // Fallback to simple message
            const overlay = document.createElement('div');
            overlay.className = 'blocked-device-banner';
            overlay.innerHTML = `
                <div class="blocked-device-content">
                    <div class="blocked-device-icon">
                        <i class="fas fa-ban"></i>
                    </div>
                    <h2 class="blocked-device-title">Access Blocked</h2>
                    <p class="blocked-device-message">
                        Your access has been temporarily blocked due to security concerns.
                    </p>
                    <div class="blocked-device-contact">
                        <p>Contact: <a href="mailto:security@breathsafe.com">security@breathsafe.com</a></p>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
        }
    }
};

// Auto-initialize and check on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Starting security check on page load...');
    
    // Skip if already on blocked screen
    const pathname = window.location.pathname;
    if (pathname.includes('blocked-screen') || pathname.includes('blocked-screen.html')) {
        console.log('ℹ️ Already on blocked screen, skipping check');
        return;
    }
    
    // Skip if not on login pages
    const isLoginPage = pathname.includes('index.html') ||
                        pathname.includes('login') || 
                        pathname.includes('admin-login') ||
                        pathname.endsWith('/') ||
                        pathname === '';
    
    if (!isLoginPage) {
        console.log('ℹ️ Not on login page, skipping check');
        return;
    }
    
    try {
        const result = await LoginSecurityCheck.checkBlockedDevice();
        
        if (result.blocked) {
            console.log('🚫 Access blocked - redirecting immediately');
            // Prevent any further execution
            window.stop?.(); // Stop page loading
            LoginSecurityCheck.showBlockedMessage(result);
        } else {
            console.log('✅ Access allowed');
        }
    } catch (error) {
        console.error('❌ Security check error:', error);
        // Allow access on error for better user experience
    }
});

// Make globally available
window.LoginSecurityCheck = LoginSecurityCheck;
console.log('✅ LoginSecurityCheck module loaded (Backward Compatible with Enhanced Integration)');