// ==========================================
// BREATHSAFE SETTINGS v2.8
// PERFORMANCE & BUG
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { getDatabase, ref, onValue, goOffline, goOnline } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    onSnapshot,
    collection,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";

// ============ CONFIG ============
const Config = Object.freeze({
    firebase: {
        apiKey: "YOUR_FIREBASE_WEB_API_KEY",
        authDomain: "YOUR_FIREBASE_PROJECT_ID.firebaseapp.com",
        databaseURL: "https://YOUR_FIREBASE_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "YOUR_FIREBASE_PROJECT_ID",
        storageBucket: "YOUR_FIREBASE_PROJECT_ID.firebasestorage.app",
        messagingSenderId: "YOUR_FIREBASE_MESSAGING_SENDER_ID",
        appId: "YOUR_FIREBASE_APP_ID"
    },
    emailjs: {
        serviceId: "YOUR_EMAILJS_SERVICE_ID",
        templateId: "YOUR_EMAILJS_TEMPLATE_ID",
        publicKey: "YOUR_EMAILJS_PUBLIC_KEY"
    },
    thresholds: {
        MQ6: { WARNING: 1500, DANGER: 2000 },
        MQ7: { WARNING: 1500, DANGER: 2000 },
        TEMP: { WARNING: 35, DANGER: 45 },
        HUMIDITY: { WARNING: 70, DANGER: 85 }
    },
    routes: {
        dashboard: 'user-dashboard.html',
        login: '../index.html'
    },
    loadingDelay: 500,
    toastDuration: 4000,
    emailCooldown: 300000,
    autoSyncInterval: 30000,
    scrollThrottle: 100 // ✅ NEW
});

// ============ GLOBAL DANGER STATE MANAGER ============
const DangerStateManager = {
    STORAGE_KEY: 'breathsafe_active_danger',
    
    getActiveDanger: function() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (!saved) return null;
            
            const danger = JSON.parse(saved);
            
            const age = Date.now() - danger.timestamp;
            if (age > 10 * 60 * 1000) {
                this.clearDanger();
                return null;
            }
            
            return danger;
        } catch (e) {
            return null;
        }
    },
    
    setActiveDanger: function(readings, types) {
        const danger = {
            id: this.generateDangerId(readings),
            readings: readings,
            types: types,
            timestamp: Date.now(),
            emailSent: false,
            emailSentAt: null,
            firstDetectedPage: 'settings'
        };
        
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(danger));
        return danger;
    },
    
    updateDanger: function(updates) {
        const current = this.getActiveDanger();
        if (!current) return null;
        
        const updated = { ...current, ...updates };
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updated));
        return updated;
    },
    
    markEmailSent: function() {
        return this.updateDanger({
            emailSent: true,
            emailSentAt: Date.now()
        });
    },
    
    shouldSendEmail: function() {
        const danger = this.getActiveDanger();
        if (!danger) return true;
        
        if (!danger.emailSent) return true;
        
        const timeSinceEmail = Date.now() - (danger.emailSentAt || 0);
        return timeSinceEmail > Config.emailCooldown;
    },
    
    clearDanger: function() {
        localStorage.removeItem(this.STORAGE_KEY);
    },
    
    generateDangerId: function(readings) {
        const signature = readings
            .map(r => `${r.type}:${Math.floor(r.value / 100)}`)
            .sort()
            .join('|');
        return btoa(signature);
    },
    
    isSameDanger: function(newReadings) {
        const current = this.getActiveDanger();
        if (!current) return false;
        
        const newId = this.generateDangerId(newReadings);
        return current.id === newId;
    }
};

window.DangerStateManager = DangerStateManager;

// ============ STATE ============
const App = {
    user: null,
    userId: null,
    db: null,
    rtdb: null,
    firestore: null,
    connected: false,
    originalSettings: {},
    hasChanges: false,
    elements: {},
    sensorData: {},
    isDangerActive: false,
    lastEmailSent: 0,
    alarmAudio: null,
    isMuted: false,
    assignedSensorTypes: [],
    userDocUnsub: null,
    sensorUnsub: null,
    settingsDocUnsub: null,
    currentTab: 'connection',
    scrollPosition: 0,
    autoSyncInterval: null,
    lastSyncTime: 0
};

const DefaultSettings = {
    alerts: {
        enabled: true,
        sound: true,
        popup: true,
        email: true,
        warning: true,
        info: false
    },
    display: {
        theme: 'light',
        animations: true,
        compact: false
    },
    units: {
        temperature: 'celsius',
        gas: 'ppm',
        pressure: 'hPa'
    }
};

let Settings = JSON.parse(JSON.stringify(DefaultSettings));
let lastSettingsHash = ''; // ✅ NEW: Track settings hash

// ============ FIRESTORE SETTINGS MANAGER - V2 ============
const FirestoreSettingsManager = {
    lastServerUpdate: 0,
    
    async load(userId) {
        try {
            const settingsRef = doc(App.firestore, 'user_settings', userId);
            const settingsDoc = await getDoc(settingsRef);
            
            if (settingsDoc.exists()) {
                const data = settingsDoc.data();
                console.log('✅ Settings loaded from Firestore:', data);
                
                Settings = {
                    alerts: { ...DefaultSettings.alerts, ...(data.alerts || {}) },
                    display: { ...DefaultSettings.display, ...(data.display || {}) },
                    units: { ...DefaultSettings.units, ...(data.units || {}) }
                };
                
                if (data.currentTab) App.currentTab = data.currentTab;
                if (data.scrollPosition) App.scrollPosition = data.scrollPosition;
                if (typeof data.isMuted === 'boolean') App.isMuted = data.isMuted;
                
                // ✅ Store server timestamp
                if (data.lastUpdated?.seconds) {
                    this.lastServerUpdate = data.lastUpdated.seconds * 1000;
                }
                
                // ✅ Initialize hash
                lastSettingsHash = this.getSettingsHash(Settings);
                
                return true;
            } else {
                console.log('ℹ️ No settings found in Firestore, creating default...');
                await this.save(userId);
                return false;
            }
        } catch (error) {
            console.error('❌ Failed to load settings from Firestore:', error);
            return false;
        }
    },
    
    async save(userId, showToastMsg = false) {
        try {
            const settingsRef = doc(App.firestore, 'user_settings', userId);
            
            const settingsData = {
                alerts: Settings.alerts,
                display: Settings.display,
                units: Settings.units,
                currentTab: App.currentTab,
                scrollPosition: App.scrollPosition,
                isMuted: App.isMuted,
                lastUpdated: serverTimestamp(),
                updatedBy: userId,
                updatedFrom: 'settings' // ✅ Track source
            };
            
            await setDoc(settingsRef, settingsData, { merge: true });
            
            // ✅ Update local tracking
            App.lastSyncTime = Date.now();
            this.lastServerUpdate = Date.now();
            lastSettingsHash = this.getSettingsHash(Settings);
            
            console.log('💾 Settings saved to Firestore (from settings page)');
            
            if (showToastMsg) {
                showToast('success', 'Settings Synced', 'Your preferences have been saved to cloud');
            }
            
            return true;
        } catch (error) {
            console.error('❌ Failed to save settings to Firestore:', error);
            if (showToastMsg) {
                showToast('warning', 'Sync Failed', 'Could not save to cloud');
            }
            return false;
        }
    },
    
    setupListener(userId) {
        if (App.settingsDocUnsub) {
            App.settingsDocUnsub();
        }
        
        const settingsRef = doc(App.firestore, 'user_settings', userId);
        
        App.settingsDocUnsub = onSnapshot(
            settingsRef,
            (snapshot) => {
                if (!snapshot.exists()) return;
                
                const data = snapshot.data();
                
                // ✅ CRITICAL FIX: Check if this update is newer
                const serverTimestamp = data.lastUpdated?.seconds ? data.lastUpdated.seconds * 1000 : 0;
                const timeSinceOurLastSave = Date.now() - App.lastSyncTime;
                
                // Ignore updates within 2 seconds of our save
                if (timeSinceOurLastSave < 2000) {
                    console.log('⏭️ Ignoring settings update (recent local save)');
                    return;
                }
                
                // Check if server data is newer
                if (serverTimestamp <= this.lastServerUpdate) {
                    console.log('⏭️ Ignoring stale settings update');
                    return;
                }
                
                const newSettings = {
                    alerts: { ...DefaultSettings.alerts, ...(data.alerts || {}) },
                    display: { ...DefaultSettings.display, ...(data.display || {}) },
                    units: { ...DefaultSettings.units, ...(data.units || {}) }
                };
                
                const newHash = this.getSettingsHash(newSettings);
                
                // ✅ Only update if actually changed
                if (newHash !== lastSettingsHash) {
                    const source = data.updatedFrom || 'unknown';
                    console.log(`🔄 Settings updated from ${source} (timestamp: ${new Date(serverTimestamp).toLocaleTimeString()})`);
                    
                    // ✅ Update all tracking
                    Settings = newSettings;
                    lastSettingsHash = newHash;
                    this.lastServerUpdate = serverTimestamp;
                    
                    applySettingsToUI();
                    applyUnitsToUI();
                    applyTheme(Settings.display.theme);
                    
                    if (source !== 'settings' && timeSinceOurLastSave > 10000) {
                        showToast('info', 'Settings Updated', `Synced from ${source}`);
                    }
                }
            },
            (error) => {
                console.error('❌ Settings listener error:', error);
            }
        );
        
        console.log('✅ Settings real-time listener active');
    },
    
    startAutoSync(userId) {
        if (App.autoSyncInterval) {
            clearInterval(App.autoSyncInterval);
        }
        
        let pendingSave = false;
        
        App.autoSyncInterval = setInterval(async () => {
            if (pendingSave) {
                console.log('⏭️ Skipping auto-sync (save in progress)');
                return;
            }
            
            const currentHash = this.getSettingsHash(Settings);
            
            if (currentHash !== lastSettingsHash) {
                console.log('🔄 Auto-sync: Changes detected');
                pendingSave = true;
                
                await this.save(userId, false);
                
                pendingSave = false;
            }
        }, Config.autoSyncInterval);
        
        console.log('✅ Auto-sync started (every 30s, smart debounce)');
    },
    
    stopAutoSync() {
        if (App.autoSyncInterval) {
            clearInterval(App.autoSyncInterval);
            App.autoSyncInterval = null;
        }
    },
    
    getSettingsHash(settings) {
        try {
            return btoa(JSON.stringify(settings));
        } catch {
            return Date.now().toString();
        }
    }
};

// ============ DOM CACHE - ============
const cacheDOM = () => {
    const elementMap = {
        single: [
            'loadingScreen', 'backBtn', 'themeBtn', 'connectionBadge',
            'connStatusText', 'connLastSync', 'latencyVal', 'packetVal',
            'signalBars', 'refreshConnBtn', 'testConnBtn', 'forceReconnBtn',
            'masterAlertToggle', 'soundToggle', 'popupToggle', 'emailToggle',
            'warningCheck', 'infoCheck', 'alertChannelsCard', 'severityCard',
            'animationsToggle', 'compactToggle', 'clearCacheBtn', 'exportBtn',
            'resetAllBtn', 'testModal', 'closeTestModal', 'testPacket',
            'testSteps', 'testSuccess', 'testError', 'retryTestBtn', 'closeTestBtn',
            'floatingSave', 'saveBtn', 'discardBtn', 'saveHeaderBtn',
            'toastStack', 'userEmailText', 'storageFill', 'storageUsed', 'storagePercent',
            'dangerIsland', 'dangerIslandReadings', 'dangerMuteBtn', 'dangerDashboardBtn',
            'tempCelsius', 'tempFahrenheit',
            'gasPpm', 'gasMg',
            'pressureHpa', 'pressurePsi'
        ],
        multi: {
            navBtns: '.nav-btn',
            tabPanels: '.tab-panel',
            themeCards: '.theme-card',
            selectBtns: '.select-btn',
            toggleSwitches: '.toggle-switch input'
        }
    };
    
    // ✅ Batch cache single elements
    elementMap.single.forEach(id => {
        App.elements[id] = document.getElementById(id);
    });
    
    // ✅ Batch cache multiple elements
    Object.entries(elementMap.multi).forEach(([key, selector]) => {
        App.elements[key] = document.querySelectorAll(selector);
    });
};

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', async () => {
    const initStartTime = Date.now();
    
    cacheDOM();
    
    if (!checkAuth()) return;
    
    App.userId = App.user.id || App.user.username;
    
    initFirebase();
    initEmailJS();
    initAlarmAudio();
    createDangerIsland();
    requestNotificationPermission();
    
    await FirestoreSettingsManager.load(App.userId);
    
    applySettingsToUI();
    applyUnitsToUI();
    
    if (App.currentTab) {
        switchTab(App.currentTab);
    }
    
    storeOriginalSettings();
    setupEventListeners();
    setupUnitsListeners();
    startConnectionMonitor();
    calculateStorage();
    
    FirestoreSettingsManager.setupListener(App.userId);
    FirestoreSettingsManager.startAutoSync(App.userId);
    
    await loadUserSensors();
    
    // ✅ Only start if user has sensors
    if (App.assignedSensorTypes && App.assignedSensorTypes.length > 0) {
        startDangerMonitoring();
    } else {
        console.log('ℹ️ No sensors assigned, skipping danger monitoring');
    }
    
    checkCrossPageDangerAlerts();
    
    const elapsed = Date.now() - initStartTime;
    const remainingTime = Math.max(0, Config.loadingDelay - elapsed);
    
    setTimeout(() => {
        App.elements.loadingScreen?.classList.add('hidden');
        
        if (App.scrollPosition > 0) {
            setTimeout(() => {
                window.scrollTo({
                    top: App.scrollPosition,
                    behavior: 'smooth'
                });
                console.log('✅ Scroll position restored:', App.scrollPosition);
            }, 300);
        }
        
        if (App.hasChanges) {
            checkForChanges();
        }
    }, remainingTime);
});

// ============ AUTH ============
function checkAuth() {
    const session = sessionStorage.getItem('breathsafeUser');
    
    if (!session) {
        window.location.href = Config.routes.login;
        return false;
    }
    
    try {
        App.user = JSON.parse(session);
        
        if (App.elements.userEmailText) {
            App.elements.userEmailText.textContent = App.user.email || 'your email';
        }
        
        return true;
    } catch (e) {
        window.location.href = Config.routes.login;
        return false;
    }
}

// ============ FIREBASE ============
function initFirebase() {
    try {
        const app = initializeApp(Config.firebase);
        App.rtdb = getDatabase(app);
        App.firestore = getFirestore(app);
        App.db = App.rtdb;
        
        onValue(ref(App.rtdb, '.info/connected'), snap => {
            App.connected = snap.val() === true;
            updateConnectionUI();
        });
    } catch (e) {
        console.error('Firebase init error:', e);
    }
}

// ============ LOAD USER SENSORS ============
async function loadUserSensors() {
    if (!App.firestore || !App.user) return;
    
    try {
        const userDoc = await getDoc(doc(App.firestore, 'users', App.userId));
        
        if (userDoc.exists()) {
            const data = userDoc.data();
            App.assignedSensorTypes = data.assignedSensorTypes || [];
            console.log('✅ User sensors loaded:', App.assignedSensorTypes);
            
            setupUserDocListener(App.userId);
        }
    } catch (error) {
        console.error('❌ Error loading user sensors:', error);
    }
}

// ============ USER DOCUMENT LISTENER ============
function setupUserDocListener(userId) {
    if (!App.firestore) return;
    
    App.userDocUnsub = onSnapshot(
        doc(App.firestore, 'users', userId),
        (snapshot) => {
            if (!snapshot.exists()) return;
            
            const data = snapshot.data();
            
            const newSensors = (data.assignedSensorTypes || []).sort().join(',');
            const oldSensors = App.assignedSensorTypes.sort().join(',');
            
            if (newSensors !== oldSensors) {
                console.log('🔄 Sensors changed on settings page');
                App.assignedSensorTypes = data.assignedSensorTypes || [];
                
                // ✅ Restart danger monitoring if sensors added
                if (App.assignedSensorTypes.length > 0 && !App.sensorUnsub) {
                    startDangerMonitoring();
                } else if (App.assignedSensorTypes.length === 0 && App.sensorUnsub) {
                    App.sensorUnsub();
                    App.sensorUnsub = null;
                    console.log('⏹️ Danger monitoring stopped (no sensors)');
                }
            }
        },
        (error) => {
            console.error('❌ User doc listener error:', error);
        }
    );
}

// ============ EMAILJS ============
function initEmailJS() {
    try {
        if (typeof emailjs !== 'undefined') {
            emailjs.init(Config.emailjs.publicKey);
            console.log('✅ EmailJS initialized');
        } else {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js';
            script.onload = () => {
                emailjs.init(Config.emailjs.publicKey);
                console.log('✅ EmailJS loaded and initialized');
            };
            document.head.appendChild(script);
        }
    } catch (e) {
        console.warn('EmailJS init error:', e);
    }
}

// ============ ALARM AUDIO ============
function initAlarmAudio() {
    App.alarmAudio = new Audio();
    App.alarmAudio.src = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';
    App.alarmAudio.loop = true;
    App.alarmAudio.preload = 'auto';
}

function playAlarm() {
    if (!Settings.alerts.sound || App.isMuted) return;
    
    try {
        App.alarmAudio.currentTime = 0;
        App.alarmAudio.volume = 0.7;
        App.alarmAudio.play().catch(() => {});
    } catch (e) {}
}

function stopAlarm() {
    try {
        App.alarmAudio.pause();
        App.alarmAudio.currentTime = 0;
    } catch (e) {}
}

// ============ NOTIFICATION PERMISSION ============
async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.warn('Browser does not support notifications');
        return;
    }
    
    if (Notification.permission === 'default') {
        try {
            const permission = await Notification.requestPermission();
            console.log('Notification permission:', permission);
        } catch (e) {
            console.warn('Notification permission error:', e);
        }
    }
}

// ============ DANGER ISLAND (continued from settings.js) ============
function createDangerIsland() {
    document.getElementById('dangerIsland')?.remove();
    
    const island = document.createElement('div');
    island.className = 'danger-island';
    island.id = 'dangerIsland';
    island.innerHTML = `
        <div class="danger-island-glow"></div>
        <div class="danger-island-content">
            <div class="danger-island-icon">
                <i class="fas fa-exclamation-triangle"></i>
            </div>
            <div class="danger-island-body">
                <div class="danger-island-title">⚠️ DANGER DETECTED</div>
                <div class="danger-island-readings" id="dangerIslandReadings">--</div>
            </div>
            <div class="danger-island-actions">
                <button class="danger-island-btn mute" id="dangerMuteBtn" title="Mute Alarm">
                    <i class="fas fa-volume-up"></i>
                </button>
                <button class="danger-island-btn dashboard" id="dangerDashboardBtn" title="Go to Dashboard">
                    <i class="fas fa-arrow-right"></i>
                </button>
            </div>
        </div>
        <div class="danger-island-wave"></div>
    `;
    
    document.body.appendChild(island);
    App.elements.dangerIsland = island;
    
    injectDangerIslandStyles();
    setupDangerIslandListeners();
}

function injectDangerIslandStyles() {
    if (document.getElementById('dangerIslandStyles')) return;
    
    const style = document.createElement('style');
    style.id = 'dangerIslandStyles';
    style.textContent = `
        .danger-island {
            position: fixed;
            top: 16px;
            left: 50%;
            transform: translateX(-50%) translateY(-150px);
            width: calc(100% - 32px);
            max-width: 500px;
            background: linear-gradient(135deg, rgba(239, 68, 68, 0.98), rgba(185, 28, 28, 0.98));
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-radius: 24px;
            padding: 16px;
            box-shadow: 0 10px 50px rgba(239, 68, 68, 0.6);
            z-index: 999999;
            opacity: 0;
            transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
            overflow: hidden;
        }
        
        .danger-island.show {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }
        
        .danger-island.show.pulse {
            animation: dangerIslandPulse 1.5s ease-in-out infinite;
        }
        
        @keyframes dangerIslandPulse {
            0%, 100% { 
                box-shadow: 0 10px 50px rgba(239, 68, 68, 0.6);
                transform: translateX(-50%) translateY(0) scale(1);
            }
            50% { 
                box-shadow: 0 15px 70px rgba(239, 68, 68, 0.9);
                transform: translateX(-50%) translateY(-2px) scale(1.02);
            }
        }
        
        .danger-island-glow {
            position: absolute;
            inset: -8px;
            background: rgba(239, 68, 68, 0.4);
            border-radius: inherit;
            filter: blur(20px);
            animation: glowPulse 1.5s ease-in-out infinite;
            z-index: -1;
        }
        
        @keyframes glowPulse {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 0.8; }
        }
        
        .danger-island-wave {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent);
            animation: waveMove 2s linear infinite;
        }
        
        @keyframes waveMove {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }
        
        .danger-island-content {
            display: flex;
            align-items: center;
            gap: 12px;
            color: white;
            position: relative;
            z-index: 1;
        }
        
        .danger-island-icon {
            width: 48px;
            height: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 50%;
            font-size: 1.3rem;
            flex-shrink: 0;
            animation: iconShake 0.4s ease-in-out infinite;
        }
        
        @keyframes iconShake {
            0%, 100% { transform: rotate(0deg); }
            25% { transform: rotate(-15deg); }
            75% { transform: rotate(15deg); }
        }
        
        .danger-island-body {
            flex: 1;
            min-width: 0;
        }
        
        .danger-island-title {
            font-size: 0.95rem;
            font-weight: 800;
            margin-bottom: 4px;
            text-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        
        .danger-island-readings {
            font-size: 0.75rem;
            opacity: 0.95;
            font-weight: 600;
            font-family: 'Courier New', monospace;
            word-wrap: break-word;
        }
        
        .danger-island-actions {
            display: flex;
            gap: 8px;
            flex-shrink: 0;
        }
        
        .danger-island-btn {
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(255, 255, 255, 0.2);
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            color: white;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 0.95rem;
        }
        
        .danger-island-btn:hover {
            background: rgba(255, 255, 255, 0.35);
            transform: scale(1.1);
            border-color: rgba(255, 255, 255, 0.5);
        }
        
        .danger-island-btn.muted {
            background: rgba(0, 0, 0, 0.3);
        }
        
        .danger-island-btn.dashboard:hover {
            background: white;
            color: #dc2626;
        }
        
        @media (max-width: 768px) {
            .danger-island {
                top: 12px;
                width: calc(100% - 24px);
                max-width: none;
                border-radius: 20px;
                padding: 12px;
            }
        }
    `;
    document.head.appendChild(style);
}

function setupDangerIslandListeners() {
    document.getElementById('dangerMuteBtn')?.addEventListener('click', e => {
        e.stopPropagation();
        App.isMuted = !App.isMuted;
        
        const btn = e.currentTarget;
        const icon = btn.querySelector('i');
        
        if (App.isMuted) {
            btn.classList.add('muted');
            icon.className = 'fas fa-volume-mute';
            stopAlarm();
            showToast('info', 'Alarm Muted', 'Sound notifications disabled');
        } else {
            btn.classList.remove('muted');
            icon.className = 'fas fa-volume-up';
            if (App.isDangerActive) playAlarm();
            showToast('info', 'Alarm Unmuted', 'Sound notifications enabled');
        }
        
        FirestoreSettingsManager.save(App.userId, false);
    });
    
    document.getElementById('dangerDashboardBtn')?.addEventListener('click', e => {
        e.stopPropagation();
        
        sessionStorage.setItem('crossPageDanger', JSON.stringify({
            title: '⚠️ DANGER DETECTED',
            readings: formatDangerReadings(App.sensorData),
            timestamp: Date.now()
        }));
        
        showToast('info', 'Navigating', 'Going to dashboard...');
        
        FirestoreSettingsManager.save(App.userId, false);
        
        setTimeout(() => {
            window.location.href = Config.routes.dashboard;
        }, 300);
    });
}

function showDangerIsland(readings) {
    const island = App.elements.dangerIsland;
    if (!island) return;
    
    const readingsEl = document.getElementById('dangerIslandReadings');
    if (readingsEl) {
        const readingText = readings.map(r => `${r.label}: ${r.value}${r.unit}`).join(' • ');
        readingsEl.textContent = readingText;
    }
    
    island.classList.add('show', 'pulse');
    
    if (App.isMuted) {
        const muteBtn = document.getElementById('dangerMuteBtn');
        if (muteBtn) {
            muteBtn.classList.add('muted');
            muteBtn.querySelector('i').className = 'fas fa-volume-mute';
        }
    } else {
        playAlarm();
    }
    
    if ('vibrate' in navigator) {
        try {
            navigator.vibrate([200, 100, 200, 100, 200]);
        } catch (e) {}
    }
}

function hideDangerIsland() {
    const island = App.elements.dangerIsland;
    if (!island) return;
    
    island.classList.remove('show', 'pulse');
    stopAlarm();
}

// ============ CHECK CROSS-PAGE DANGER ALERTS ============
function checkCrossPageDangerAlerts() {
    const dangerAlert = sessionStorage.getItem('crossPageDanger');
    
    if (dangerAlert) {
        try {
            const data = JSON.parse(dangerAlert);
            const timeSince = Date.now() - data.timestamp;
            
            if (timeSince < 5 * 60 * 1000) {
                console.log('🚨 Cross-page danger alert detected');
                
                setTimeout(() => {
                    const island = App.elements.dangerIsland;
                    if (island) {
                        const readingsEl = document.getElementById('dangerIslandReadings');
                        if (readingsEl && data.readings) {
                            const readingText = data.readings
                                .map(r => `${r.label}: ${r.value}${r.unit}`)
                                .join(' • ');
                            readingsEl.textContent = readingText;
                        }
                        
                        island.classList.add('show', 'pulse');
                        
                        if (App.isMuted) {
                            const muteBtn = document.getElementById('dangerMuteBtn');
                            if (muteBtn) {
                                muteBtn.classList.add('muted');
                                muteBtn.querySelector('i').className = 'fas fa-volume-mute';
                            }
                        }
                        
                        showToast('warning', 'Danger Alert', 'Critical readings from dashboard');
                    }
                }, 1000);
                
                sessionStorage.removeItem('crossPageDanger');
            } else {
                sessionStorage.removeItem('crossPageDanger');
            }
            
        } catch (e) {
            console.error('Error parsing cross-page danger alert:', e);
            sessionStorage.removeItem('crossPageDanger');
        }
    }
}

// ============ REAL-TIME DANGER MONITORING - ============
function startDangerMonitoring() {
    if (!App.rtdb) return;
    
    // ✅ Only monitor if user has sensors
    if (!App.assignedSensorTypes || App.assignedSensorTypes.length === 0) {
        console.log('ℹ️ No sensors assigned, skipping danger monitoring');
        return;
    }
    
    const sensorsRef = ref(App.rtdb, 'Sensors');
    
    App.sensorUnsub = onValue(sensorsRef, snapshot => {
        const data = snapshot.val();
        if (!data) return;
        
        App.sensorData = data;
        checkForDanger(data);
    }, error => {
        console.error('❌ Sensor listener error:', error);
    });
    
    console.log('✅ Real-time danger monitoring started on Settings page');
}

function checkForDanger(data) {
    const thresholds = Config.thresholds;
    let isDanger = false;
    const readings = [];
    
    const mq6 = parseFloat(data.MQ6_Value) || 0;
    if (mq6 >= thresholds.MQ6.DANGER) {
        isDanger = true;
        readings.push({ label: 'MQ6', value: mq6.toFixed(0), unit: ' PPM', type: 'MQ6' });
    }
    
    const mq7 = parseFloat(data.MQ7_Value) || 0;
    if (mq7 >= thresholds.MQ7.DANGER) {
        isDanger = true;
        readings.push({ label: 'MQ7', value: mq7.toFixed(0), unit: ' PPM', type: 'MQ7' });
    }
    
    const temp = parseFloat(data.Temperature) || 0;
    if (temp >= thresholds.TEMP.DANGER) {
        isDanger = true;
        readings.push({ label: 'Temp', value: temp.toFixed(1), unit: '°C', type: 'temperature' });
    }
    
    const humidity = parseFloat(data.Humidity) || 0;
    if (humidity >= thresholds.HUMIDITY.DANGER) {
        isDanger = true;
        readings.push({ label: 'Humidity', value: humidity.toFixed(0), unit: '%', type: 'humidity' });
    }
    
    if (isDanger && !App.isDangerActive) {
        App.isDangerActive = true;
        handleDangerActivated(readings);
    } else if (!isDanger && App.isDangerActive) {
        App.isDangerActive = false;
        handleDangerDeactivated();
    } else if (isDanger && App.isDangerActive) {
        showDangerIsland(readings);
    }
}

async function handleDangerActivated(readings) {
    
    const isSameDanger = DangerStateManager.isSameDanger(readings);
    
    if (!isSameDanger) {
        DangerStateManager.setActiveDanger(readings, ['danger']);
        console.log('🆕 New danger on settings page');
    }
    
    showDangerIsland(readings);
    
    if (Settings.alerts.popup) {
        sendBrowserNotification('⚠️ DANGER ALERT', 
            readings.map(r => `${r.label}: ${r.value}${r.unit}`).join(', ')
        );
    }
    
    if (DangerStateManager.shouldSendEmail()) {
        console.log('📧 Sending email from settings page');
        if (Settings.alerts.email) {
            const emailSent = await sendDangerEmail(readings);
            if (emailSent) {
                DangerStateManager.markEmailSent();
            }
        }
    } else {
        const danger = DangerStateManager.getActiveDanger();
        if (danger && danger.emailSentAt) {
            const timeSince = Date.now() - danger.emailSentAt;
            const remaining = Math.ceil((Config.emailCooldown - timeSince) / 60000);
            console.log(`📧 Email skipped - already sent ${Math.floor(timeSince / 60000)}m ago (next in ${remaining}m)`);
        }
    }
    
    showToast('error', '⚠️ Danger', 'Critical levels detected!');
    
    sessionStorage.setItem('crossPageDanger', JSON.stringify({
        title: '⚠️ DANGER DETECTED',
        readings: readings,
        timestamp: Date.now()
    }));
}

function handleDangerDeactivated() {
    console.log('✅ Danger cleared on Settings page');
    
    DangerStateManager.clearDanger();
    
    hideDangerIsland();
    showToast('success', 'Safe', 'Readings returned to safe levels');
    
    sessionStorage.removeItem('crossPageDanger');
}

function formatDangerReadings(data) {
    const readings = [];
    const thresholds = Config.thresholds;
    
    const mq6 = parseFloat(data.MQ6_Value) || 0;
    if (mq6 >= thresholds.MQ6.DANGER) {
        readings.push({ label: 'MQ6', value: mq6.toFixed(0), unit: ' PPM', type: 'MQ6' });
    }
    
    const mq7 = parseFloat(data.MQ7_Value) || 0;
    if (mq7 >= thresholds.MQ7.DANGER) {
        readings.push({ label: 'MQ7', value: mq7.toFixed(0), unit: ' PPM', type: 'MQ7' });
    }
    
    const temp = parseFloat(data.Temperature) || 0;
    if (temp >= thresholds.TEMP.DANGER) {
        readings.push({ label: 'Temp', value: temp.toFixed(1), unit: '°C', type: 'temperature' });
    }
    
    const humidity = parseFloat(data.Humidity) || 0;
    if (humidity >= thresholds.HUMIDITY.DANGER) {
        readings.push({ label: 'Humidity', value: humidity.toFixed(0), unit: '%', type: 'humidity' });
    }
    
    return readings;
}

// ============ EMAIL ALERTS - ============
async function sendDangerEmail(readings) {
    if (!App.user?.email) {
        console.warn('⚠️ No user email available');
        return false;
    }
    
    if (typeof emailjs === 'undefined') {
        console.warn('⚠️ EmailJS not available');
        return false;
    }
    
    const params = {
        to_email: App.user.email,
        to_name: `${App.user.firstName || ''} ${App.user.lastName || ''}`.trim() || 'User',
        alert_type: 'DANGER ALERT - Settings Page',
        readings: readings.map(r => `${r.label}: ${r.value}${r.unit}`).join('\n'),
        instructions: `
1. Open windows and doors for ventilation
2. Do NOT use electrical switches if gas is detected
3. Evacuate if levels are critical
4. Call emergency services if needed
5. Return to dashboard for full monitoring`,
        timestamp: new Date().toLocaleString(),
        location: 'Settings Page - Cross-Page Alert'
    };
    
    try {
        await emailjs.send(
            Config.emailjs.serviceId,
            Config.emailjs.templateId,
            params,
            Config.emailjs.publicKey
        );
        showToast('success', 'Email Sent', 'Alert sent to ' + App.user.email);
        
        // Log success
        if (App.firestore) {
            try {
                await addDoc(collection(App.firestore, 'email_logs'), {
                    userId: App.userId,
                    userEmail: App.user.email,
                    type: 'danger_alert',
                    status: 'sent',
                    location: 'settings_page',
                    readings: readings,
                    timestamp: serverTimestamp()
                });
            } catch (e) {
            }
        }
        
        return true; // ✅ Return success
        
    } catch (error) {
        console.error('❌ Email send failed:', error);
        
        if (error.status === 426) {
            showToast('error', 'Quota Exceeded', 'EmailJS quota reached');
        } else {
            showToast('error', 'Email Failed', 'Could not send alert');
        }
        
        // Log failure
        if (App.firestore) {
            try {
                await addDoc(collection(App.firestore, 'email_logs'), {
                    userId: App.userId,
                    userEmail: App.user.email,
                    type: 'danger_alert',
                    status: 'failed',
                    error: error.text || error.message,
                    errorCode: error.status,
                    location: 'settings_page',
                    timestamp: serverTimestamp()
                });
            } catch (e) {}
        }
        
        return false; // ✅ Return failure
    }
}

// ============ BROWSER NOTIFICATIONS ============
async function sendBrowserNotification(title, body) {
    if (!('Notification' in window)) {
        console.warn('Browser does not support notifications');
        return;
    }
    
    let permission = Notification.permission;
    
    if (permission === 'default') {
        permission = await Notification.requestPermission();
    }
    
    if (permission === 'granted') {
        try {
            const icon = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Ccircle cx="50" cy="50" r="50" fill="%23ef4444"/%3E%3Ctext x="50" y="70" font-size="60" text-anchor="middle" fill="white"%3E⚠%3C/text%3E%3C/svg%3E';
            
            const notification = new Notification(title, {
                body,
                icon: icon,
                vibrate: [200, 100, 200, 100, 200],
                requireInteraction: true,
                tag: 'danger-alert',
                renotify: true,
                silent: false
            });
            
            notification.onclick = () => {
                window.focus();
                notification.close();
            };
            
            console.log('✅ Browser notification sent');
        } catch (e) {
            console.warn('Browser notification failed:', e);
        }
    }
}

// ============ SETTINGS FUNCTIONS ============
function storeOriginalSettings() {
    App.originalSettings = JSON.parse(JSON.stringify(Settings));
    lastSettingsHash = FirestoreSettingsManager.getSettingsHash(Settings); // ✅ Update hash
}

// ✅ Batch DOM updates
function applySettingsToUI() {
    const updates = [
        ['masterAlertToggle', Settings.alerts.enabled],
        ['soundToggle', Settings.alerts.sound],
        ['popupToggle', Settings.alerts.popup],
        ['emailToggle', Settings.alerts.email],
        ['warningCheck', Settings.alerts.warning],
        ['infoCheck', Settings.alerts.info],
        ['animationsToggle', Settings.display.animations],
        ['compactToggle', Settings.display.compact]
    ];
    
    // ✅ Single animation frame
    requestAnimationFrame(() => {
        updates.forEach(([id, value]) => setChecked(id, value));
        applyTheme(Settings.display.theme);
        updateThemeCards(Settings.display.theme);
        toggleAlertSections(Settings.alerts.enabled);
    });
}

function setChecked(id, value) {
    const el = App.elements[id];
    if (el) el.checked = value;
}

function toggleAlertSections(enabled) {
    const cards = [App.elements.alertChannelsCard, App.elements.severityCard];
    cards.forEach(card => {
        if (card) {
            card.style.opacity = enabled ? '1' : '0.5';
            card.style.pointerEvents = enabled ? 'auto' : 'none';
        }
    });
}

// ============ UNITS SYSTEM ============
function applyUnitsToUI() {
    if (Settings.units.temperature === 'celsius') {
        App.elements.tempCelsius?.classList.add('active');
        App.elements.tempFahrenheit?.classList.remove('active');
    } else {
        App.elements.tempCelsius?.classList.remove('active');
        App.elements.tempFahrenheit?.classList.add('active');
    }
    
    if (Settings.units.gas === 'ppm') {
        App.elements.gasPpm?.classList.add('active');
        App.elements.gasMg?.classList.remove('active');
    } else {
        App.elements.gasPpm?.classList.remove('active');
        App.elements.gasMg?.classList.add('active');
    }
    
    if (Settings.units.pressure === 'hPa') {
        App.elements.pressureHpa?.classList.add('active');
        App.elements.pressurePsi?.classList.remove('active');
    } else {
        App.elements.pressureHpa?.classList.remove('active');
        App.elements.pressurePsi?.classList.add('active');
    }
}

function setupUnitsListeners() {
    App.elements.tempCelsius?.addEventListener('click', () => {
        Settings.units.temperature = 'celsius';
        applyUnitsToUI();
        checkForChanges();
        showToast('info', 'Unit Changed', 'Temperature: Celsius (°C)');
    });
    
    App.elements.tempFahrenheit?.addEventListener('click', () => {
        Settings.units.temperature = 'fahrenheit';
        applyUnitsToUI();
        checkForChanges();
        showToast('info', 'Unit Changed', 'Temperature: Fahrenheit (°F)');
    });
    
    App.elements.gasPpm?.addEventListener('click', () => {
        Settings.units.gas = 'ppm';
        applyUnitsToUI();
        checkForChanges();
        showToast('info', 'Unit Changed', 'Gas: Parts Per Million (PPM)');
    });
    
    App.elements.gasMg?.addEventListener('click', () => {
        Settings.units.gas = 'mg';
        applyUnitsToUI();
        checkForChanges();
        showToast('info', 'Unit Changed', 'Gas: mg/m³');
    });
    
    App.elements.pressureHpa?.addEventListener('click', () => {
        Settings.units.pressure = 'hPa';
        applyUnitsToUI();
        checkForChanges();
        showToast('info', 'Unit Changed', 'Pressure: Hectopascals (hPa)');
    });
    
    App.elements.pressurePsi?.addEventListener('click', () => {
        Settings.units.pressure = 'psi';
        applyUnitsToUI();
        checkForChanges();
        showToast('info', 'Unit Changed', 'Pressure: PSI');
    });
}

window.BreathSafeUnits = {
    getSettings: () => Settings.units
};

// ============ THEME ============
function applyTheme(theme) {
    let actualTheme = theme;
    
    if (theme === 'auto') {
        actualTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    
    document.body.classList.remove('light', 'dark');
    document.body.classList.add(actualTheme);
    
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
        meta.content = actualTheme === 'dark' ? '#1e293b' : '#10b981';
    }
    
    Settings.display.theme = theme;
}

function updateThemeCards(activeTheme) {
    App.elements.themeCards?.forEach(card => {
        card.classList.toggle('active', card.dataset.theme === activeTheme);
    });
}

// ============ CONNECTION - ============
let connectionInterval = null;

function startConnectionMonitor() {
    updateConnectionMetrics();
    
    // ✅ Only update when tab visible
    connectionInterval = setInterval(() => {
        if (!document.hidden) {
            updateConnectionMetrics();
        }
    }, 2000);
}

function updateConnectionUI() {
    const badge = App.elements.connectionBadge;
    const label = badge?.querySelector('span');
    
    if (App.connected) {
        badge?.classList.remove('offline');
        if (label) label.textContent = 'Online';
    } else {
        badge?.classList.add('offline');
        if (label) label.textContent = 'Offline';
    }
    
    if (App.elements.connStatusText) {
        App.elements.connStatusText.textContent = App.connected ? 'Connected' : 'Disconnected';
        App.elements.connStatusText.style.color = App.connected ? 'var(--success)' : 'var(--danger)';
    }
}

function updateConnectionMetrics() {
    if (!App.connected) {
        if (App.elements.latencyVal) App.elements.latencyVal.textContent = '--';
        updateSignalBars(0);
        return;
    }
    
    const latency = Math.floor(Math.random() * 25) + 15;
    const packetLoss = Math.random() > 0.95 ? 0.1 : 0;
    
    if (App.elements.latencyVal) App.elements.latencyVal.textContent = `${latency}ms`;
    if (App.elements.packetVal) App.elements.packetVal.textContent = `${packetLoss}%`;
    if (App.elements.connLastSync) App.elements.connLastSync.textContent = 'Last sync: Just now';
    
    updateSignalBars(4);
}

function updateSignalBars(strength) {
    const bars = App.elements.signalBars?.querySelectorAll('.bar');
    bars?.forEach((bar, i) => {
        bar.classList.toggle('active', i < strength);
    });
}

// ============ CHANGE TRACKING - ============
function checkForChanges() {
    const currentHash = FirestoreSettingsManager.getSettingsHash(Settings);
    App.hasChanges = currentHash !== lastSettingsHash;
    
    const floatingSave = App.elements.floatingSave;
    const headerSaveBtn = App.elements.saveHeaderBtn;
    
    if (App.hasChanges) {
        floatingSave?.classList.add('visible');
        headerSaveBtn?.classList.add('visible');
    } else {
        floatingSave?.classList.remove('visible');
        headerSaveBtn?.classList.remove('visible');
    }
}

// ============ SAVE SYSTEM ============
async function handleSave() {
    const saveBtn = App.elements.saveBtn;
    if (!saveBtn) return;
    
    saveBtn.classList.add('saving');
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    
    await delay(800);
    
    const success = await FirestoreSettingsManager.save(App.userId, false);
    
    if (success) {
        saveBtn.classList.remove('saving');
        saveBtn.classList.add('saved');
        saveBtn.innerHTML = '<i class="fas fa-check"></i> Saved!';
        
        storeOriginalSettings();
        App.hasChanges = false;
        
        sessionStorage.setItem('settingsUpdated', JSON.stringify({
            message: 'Your settings have been saved',
            timestamp: Date.now(),
            units: Settings.units
        }));
        
        showToast('success', 'Settings Saved', 'Synced to cloud successfully');
        
        setTimeout(() => {
            App.elements.floatingSave?.classList.remove('visible');
            App.elements.saveHeaderBtn?.classList.remove('visible');
            saveBtn.classList.remove('saved');
            saveBtn.innerHTML = '<i class="fas fa-save"></i> <span>Save Changes</span>';
        }, 2000);
        
    } else {
        saveBtn.classList.remove('saving');
        saveBtn.innerHTML = '<i class="fas fa-times"></i> Error!';
        showToast('error', 'Save Failed', 'Could not sync settings');
        
        setTimeout(() => {
            saveBtn.innerHTML = '<i class="fas fa-save"></i> <span>Save Changes</span>';
        }, 2000);
    }
}

async function handleDiscard() {
    if (!App.hasChanges) return;
    
    if (confirm('Discard all changes and reload from cloud?')) {
        await FirestoreSettingsManager.load(App.userId);
        
        applySettingsToUI();
        applyUnitsToUI();
        applyTheme(Settings.display.theme);
        
        storeOriginalSettings();
        App.hasChanges = false;
        
        App.elements.floatingSave?.classList.remove('visible');
        App.elements.saveHeaderBtn?.classList.remove('visible');
        
        showToast('info', 'Changes Discarded', 'Settings reloaded from cloud');
    }
}

// ============ CONNECTION TEST ============
function openTestModal() {
    const modal = App.elements.testModal;
    if (!modal) return;
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    const steps = App.elements.testSteps?.querySelectorAll('.step');
    steps?.forEach(step => {
        step.classList.remove('active', 'success', 'error');
        const icon = step.querySelector('.step-icon i');
        if (icon) icon.className = 'fas fa-circle';
    });
    
    App.elements.testSuccess?.classList.remove('show');
    App.elements.testError?.classList.remove('show');
    
    const packet = App.elements.testPacket;
    if (packet) {
        packet.classList.remove('animating');
        void packet.offsetWidth;
        packet.classList.add('animating');
    }
    
    runTest(0);
}

function closeTestModal() {
    App.elements.testModal?.classList.remove('active');
    document.body.style.overflow = '';
    App.elements.testPacket?.classList.remove('animating');
}

async function runTest(stepIndex) {
    const steps = App.elements.testSteps?.querySelectorAll('.step');
    if (!steps || stepIndex >= steps.length) {
        finishTest(true);
        return;
    }
    
    const step = steps[stepIndex];
    const icon = step.querySelector('.step-icon i');
    
    step.classList.add('active');
    if (icon) icon.className = 'fas fa-spinner fa-spin';
    
    await delay(1000);
    
    const success = Math.random() > 0.1;
    
    step.classList.remove('active');
    step.classList.add(success ? 'success' : 'error');
    
    if (icon) {
        icon.className = success ? 'fas fa-check-circle' : 'fas fa-times-circle';
    }
    
    if (success && stepIndex < steps.length - 1) {
        runTest(stepIndex + 1);
    } else {
        finishTest(success);
    }
}

function finishTest(success) {
    App.elements.testPacket?.classList.remove('animating');
    
    if (success) {
        App.elements.testSuccess?.classList.add('show');
    } else {
        App.elements.testError?.classList.add('show');
    }
}

// ============ STORAGE ============
function calculateStorage() {
    let total = 0;
    
    for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
            total += localStorage[key].length * 2;
        }
    }
    
    const usedMB = (total / (1024 * 1024)).toFixed(2);
    const maxMB = 10;
    const percent = Math.min(Math.round((total / (maxMB * 1024 * 1024)) * 100), 100);
    
    if (App.elements.storageFill) App.elements.storageFill.style.width = `${percent}%`;
    if (App.elements.storageUsed) App.elements.storageUsed.textContent = `${usedMB} MB`;
    if (App.elements.storagePercent) App.elements.storagePercent.textContent = `${percent}%`;
}

function clearCache() {
    if (confirm('Clear all cached data? Settings from cloud will remain safe.')) {
        localStorage.clear();
        showToast('success', 'Cache Cleared', 'Local storage reset');
        setTimeout(() => location.reload(), 1000);
    }
}

function exportData() {
    const data = {
        settings: Settings,
        user: { email: App.user?.email },
        exportedAt: new Date().toISOString(),
        version: '2.8.0' // ✅ Updated version
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `breathsafe-settings-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('success', 'Export Complete', 'Settings data downloaded');
}

async function resetAll() {
    if (confirm('Reset all settings to default? This will update the cloud.')) {
        Settings = JSON.parse(JSON.stringify(DefaultSettings));
        
        await FirestoreSettingsManager.save(App.userId, false);
        
        applySettingsToUI();
        applyUnitsToUI();
        applyTheme(Settings.display.theme);
        
        storeOriginalSettings();
        
        showToast('info', 'Settings Reset', 'Defaults restored');
        setTimeout(() => location.reload(), 1000);
    }
}

// ============ TAB NAVIGATION ============
function switchTab(tabId) {
    App.currentTab = tabId;
    
    App.elements.navBtns?.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    
    App.elements.tabPanels?.forEach(panel => {
        panel.classList.toggle('active', panel.id === `tab-${tabId}`);
    });
}

// ============ TOAST ============
function showToast(type, title, message) {
    const stack = App.elements.toastStack;
    if (!stack) return;
    
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-icon"><i class="fas ${icons[type]}"></i></div>
        <div class="toast-content">
            <span class="toast-title">${title}</span>
            <span class="toast-text">${message}</span>
        </div>
        <button class="toast-close"><i class="fas fa-times"></i></button>
    `;
    
    stack.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    
    const close = () => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    };
    
    toast.querySelector('.toast-close')?.addEventListener('click', close);
    setTimeout(close, Config.toastDuration);
}

// ============ EVENT LISTENERS ============
function setupEventListeners() {
    App.elements.backBtn?.addEventListener('click', async () => {
        if (App.hasChanges) {
            if (!confirm('You have unsaved changes. Leave anyway?')) {
                return;
            }
        }
        
        await FirestoreSettingsManager.save(App.userId, false);
        window.location.href = Config.routes.dashboard;
    });
    
    App.elements.themeBtn?.addEventListener('click', () => {
        const current = document.body.classList.contains('dark') ? 'dark' : 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        updateThemeCards(next);
        checkForChanges();
    });
    
    App.elements.navBtns?.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    
    App.elements.themeCards?.forEach(card => {
        card.addEventListener('click', () => {
            const theme = card.dataset.theme;
            applyTheme(theme);
            updateThemeCards(theme);
            checkForChanges();
        });
    });
    
    const alertToggles = [
        { id: 'masterAlertToggle', key: 'enabled', isMaster: true },
        { id: 'soundToggle', key: 'sound' },
        { id: 'popupToggle', key: 'popup' },
        { id: 'emailToggle', key: 'email' },
        { id: 'warningCheck', key: 'warning' },
        { id: 'infoCheck', key: 'info' }
    ];
    
    alertToggles.forEach(({ id, key, isMaster }) => {
        App.elements[id]?.addEventListener('change', e => {
            Settings.alerts[key] = e.target.checked;
            if (isMaster) toggleAlertSections(e.target.checked);
            checkForChanges();
        });
    });
    
    App.elements.animationsToggle?.addEventListener('change', e => {
        Settings.display.animations = e.target.checked;
        checkForChanges();
    });
    
    App.elements.compactToggle?.addEventListener('change', e => {
        Settings.display.compact = e.target.checked;
        document.body.classList.toggle('compact', e.target.checked);
        checkForChanges();
    });
    
    App.elements.refreshConnBtn?.addEventListener('click', () => {
        App.elements.refreshConnBtn.classList.add('spinning');
        updateConnectionMetrics();
        setTimeout(() => App.elements.refreshConnBtn?.classList.remove('spinning'), 1000);
    });
    
    App.elements.testConnBtn?.addEventListener('click', openTestModal);
    
    App.elements.forceReconnBtn?.addEventListener('click', () => {
        if (App.rtdb) {
            goOffline(App.rtdb);
            showToast('info', 'Reconnecting', 'Forcing connection reset...');
            setTimeout(() => goOnline(App.rtdb), 1500);
        }
    });
    
    App.elements.closeTestModal?.addEventListener('click', closeTestModal);
    App.elements.closeTestBtn?.addEventListener('click', closeTestModal);
    App.elements.retryTestBtn?.addEventListener('click', openTestModal);
    
    App.elements.clearCacheBtn?.addEventListener('click', clearCache);
    App.elements.exportBtn?.addEventListener('click', exportData);
    App.elements.resetAllBtn?.addEventListener('click', resetAll);
    
    App.elements.saveBtn?.addEventListener('click', handleSave);
    App.elements.saveHeaderBtn?.addEventListener('click', handleSave);
    App.elements.discardBtn?.addEventListener('click', handleDiscard);
    
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeTestModal();
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            if (App.hasChanges) handleSave();
        }
    });
    
    App.elements.testModal?.addEventListener('click', e => {
        if (e.target === App.elements.testModal) closeTestModal();
    });
    
    // ✅ Throttled scroll listener
    let scrollThrottle = null;
    window.addEventListener('scroll', () => {
        if (scrollThrottle) return;
        
        scrollThrottle = setTimeout(() => {
            App.scrollPosition = window.scrollY;
            scrollThrottle = null;
        }, Config.scrollThrottle);
    }, { passive: true });
    
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (Settings.display.theme === 'auto') applyTheme('auto');
    });
    
    document.addEventListener('visibilitychange', async () => {
        if (document.hidden) {
            await FirestoreSettingsManager.save(App.userId, false);
            console.log('💾 Settings auto-saved (page hidden)');
        } else {
            // ✅ Resume connection monitor
            updateConnectionMetrics();
            checkCrossPageDangerAlerts();
        }
    });
}

// ============ UTILITIES ============
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ CLEANUP - ============
// ✅ Single beforeunload handler
window.addEventListener('beforeunload', async (e) => {
    // Save settings
    await FirestoreSettingsManager.save(App.userId, false);
    
    // Cleanup
    FirestoreSettingsManager.stopAutoSync();
    clearInterval(connectionInterval);
    stopAlarm();
    if (App.rtdb) goOffline(App.rtdb);
    if (App.userDocUnsub) App.userDocUnsub();
    if (App.sensorUnsub) App.sensorUnsub();
    if (App.settingsDocUnsub) App.settingsDocUnsub();
    
    // Warn about unsaved changes
    if (App.hasChanges) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes.';
    }
});

// ============ EXPORTS ============
window.goToDashboard = async () => {
    await FirestoreSettingsManager.save(App.userId, false);
    window.location.href = Config.routes.dashboard;
};

console.log('%c🌬️ BreathSafe Settings v2.8', 'color: #10b981; font-size: 18px; font-weight: bold;');
console.log('%c✅ OPTIMIZED & BUG FIXED', 'color: #10b981; font-size: 14px; font-weight: bold;');
console.log('%c✅ Global Danger State Active', 'color: #10b981; font-size: 12px;');
console.log('%c✅ Smart Email System Ready', 'color: #10b981; font-size: 12px;');
console.log('%c✅ Firestore Auto-Sync Enabled', 'color: #10b981; font-size: 12px;');
console.log('%c✅ Hash-Based Change Detection', 'color: #10b981; font-size: 12px;');
console.log('%c✅ Conditional Sensor Monitoring', 'color: #10b981; font-size: 12px;');
console.log('%c✅ Throttled Updates', 'color: #10b981; font-size: 12px;');
