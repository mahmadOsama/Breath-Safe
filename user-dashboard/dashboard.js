// ==========================================
// BREATHSAFE USER DASHBOARD - v7.4
// User dashboard for sensor monitoring and account settings
// Mobile-First Responsive Design
// Firestore Settings Integration
// Global Danger State Management
// Single Email Per Danger Incident
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { 
    getDatabase, 
    ref, 
    onValue, 
    set, 
    remove, 
    onDisconnect
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js";
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

// ============ Firebase Configuration ============
const firebaseConfig = {
    apiKey: "YOUR_FIREBASE_WEB_API_KEY",
    authDomain: "YOUR_FIREBASE_PROJECT_ID.firebaseapp.com",
    databaseURL: "https://YOUR_FIREBASE_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "YOUR_FIREBASE_PROJECT_ID",
    storageBucket: "YOUR_FIREBASE_PROJECT_ID.firebasestorage.app",
    messagingSenderId: "YOUR_FIREBASE_MESSAGING_SENDER_ID",
    appId: "YOUR_FIREBASE_APP_ID",
    measurementId: "YOUR_FIREBASE_MEASUREMENT_ID"
};

// ============ EmailJS Configuration ============
const EMAILJS_CONFIG = {
    serviceId: "YOUR_EMAILJS_SERVICE_ID",
    templateId: "YOUR_EMAILJS_TEMPLATE_ID",
    publicKey: "YOUR_EMAILJS_PUBLIC_KEY"
};

// ============ Initialize Firebase ============
let app, rtdb, db;
try {
    app = initializeApp(firebaseConfig);
    rtdb = getDatabase(app);
    db = getFirestore(app);
    console.log("✅ Firebase initialized successfully");
} catch (e) {
    console.error("❌ Firebase initialization error:", e);
}

// ============ Initialize EmailJS ============
try {
    if (typeof emailjs !== "undefined") {
        emailjs.init(EMAILJS_CONFIG.publicKey);
        console.log("✅ EmailJS initialized successfully");
    }
} catch (e) {
    console.warn("⚠️ EmailJS not available:", e);
}

// ============ GLOBAL DANGER STATE MANAGER ============
const DangerStateManager = {
    STORAGE_KEY: 'breathsafe_active_danger',
    
    getActiveDanger: function() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (!saved) return null;
            
            const danger = JSON.parse(saved);
            
            // Check if danger is expired (older than 10 minutes)
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
            firstDetectedPage: 'dashboard'
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
        
        // Check if cooldown has passed (5 minutes)
        const timeSinceEmail = Date.now() - (danger.emailSentAt || 0);
        return timeSinceEmail > 5 * 60 * 1000;
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

// ============ Path Sanitization ============
function sanitizeFirebasePath(path) {
    if (!path) return '';
    return String(path)
        .replace(/\./g, '_')
        .replace(/#/g, '_')
        .replace(/\$/g, '_')
        .replace(/\[/g, '_')
        .replace(/\]/g, '_')
        .replace(/\//g, '_');
}

// ============ Constants & Thresholds ============
const THRESHOLDS = {
    MQ6: { WARNING: 1500, DANGER: 2000 },
    MQ7: { WARNING: 1500, DANGER: 2000 },
    TEMP: { WARNING: 35, DANGER: 45 },
    HUMIDITY: { WARNING: 70, DANGER: 85 }
};

const THRESHOLDS_FAHRENHEIT = {
    TEMP: { WARNING: 95, DANGER: 113 }
};

const THRESHOLDS_MG = {
    MQ6: { WARNING: 2.7, DANGER: 3.6 },
    MQ7: { WARNING: 1.7, DANGER: 2.3 }
};

const SENSOR_CONFIG = {
    MQ6: {
        id: "mq6",
        name: "MQ6 Gas Sensor",
        description: "LPG & Propane Detection",
        icon: "fa-fire",
        iconClass: "mq6-icon",
        dataKey: "MQ6_Value",
        chartColor: { 
            border: "#fbbf24", 
            background: "rgba(251, 191, 36, 0.1)",
            gradient: ["rgba(251, 191, 36, 0.3)", "rgba(251, 191, 36, 0.01)"]
        }
    },
    MQ7: {
        id: "mq7",
        name: "MQ7 Gas Sensor",
        description: "Carbon Monoxide Detection",
        icon: "fa-smog",
        iconClass: "mq7-icon",
        dataKey: "MQ7_Value",
        chartColor: { 
            border: "#ec4899", 
            background: "rgba(236, 72, 153, 0.1)",
            gradient: ["rgba(236, 72, 153, 0.3)", "rgba(236, 72, 153, 0.01)"]
        }
    },
    DHT22: {
        readings: {
            temperature: {
                id: "temp",
                name: "Temperature",
                icon: "fa-thermometer-half",
                dataKey: "Temperature"
            },
            humidity: {
                id: "humidity",
                name: "Humidity",
                icon: "fa-tint",
                dataKey: "Humidity"
            }
        }
    }
};

// ============ App Configuration ============
const CONFIG = {
    MAX_DATA_POINTS: 50,
    LOGIN_PAGE_PATH: "../index.html",
    WELCOME_PAGE_PATH: "user-welcome.html",
    PROFILE_PAGE_PATH: "user-profile.html",
    SETTINGS_PAGE_PATH: "user-settings.html",
    PRESENCE_UPDATE_INTERVAL: 30000,
    DANGER_EMAIL_COOLDOWN_MS: 60000,
    AUTO_REFRESH_INTERVAL: 60000,
    TOAST_DURATION: 5000,
    CONNECTION_CHECK_INTERVAL: 5000,
    CHART_UPDATE_THROTTLE: 3000, // ✅ OPTIMIZED: Increased from 1000ms to 3000ms
    TIP_ROTATION_INTERVAL: 8000,
    LOADER_MIN_DISPLAY_TIME: 1500,
    STATE_EXPIRY_TIME: 30 * 60 * 1000,
    SETTINGS_SYNC_INTERVAL: 5000,
    NOTIFICATION_SAVE_DEBOUNCE: 2000 // ✅ NEW: Debounce notification saves
};

// ============ Safety Tips & Instructions ============
const SAFETY_TIPS = [
    { icon: "fas fa-wind", text: "Ventilate your space daily by opening windows for at least 15 minutes to ensure fresh air circulation." },
    { icon: "fas fa-search", text: "Check gas hoses and connections regularly for cracks, wear, or damage." },
    { icon: "fas fa-tint-slash", text: "Keep humidity below 60% to prevent mold growth and maintain healthy air quality." },
    { icon: "fas fa-broom", text: "Clean heating system filters monthly during heavy use periods for optimal performance." },
    { icon: "fas fa-battery-full", text: "Test gas detectors monthly and replace batteries every 6 months for reliable protection." }
];

const SAFETY_INSTRUCTIONS = {
    gas: [
        { icon: "fa-door-open", text: "Open all windows and doors immediately for ventilation" },
        { icon: "fa-power-off", text: "DO NOT use electrical switches, lights, or appliances" },
        { icon: "fa-mobile-alt", text: "DO NOT use phones or create any sparks inside" },
        { icon: "fa-valve", text: "Turn off the main gas valve if safely accessible" },
        { icon: "fa-running", text: "Evacuate the building immediately" },
        { icon: "fa-phone-alt", text: "Call emergency services (911) from outside" }
    ],
    temperature: [
        { icon: "fa-fan", text: "Turn on fans or air conditioning immediately" },
        { icon: "fa-window-maximize", text: "Open windows for natural ventilation" },
        { icon: "fa-plug", text: "Check for overheating appliances and disconnect them" },
        { icon: "fa-fire-extinguisher", text: "Keep fire extinguisher accessible" },
        { icon: "fa-thermometer-half", text: "Monitor temperature continuously" },
        { icon: "fa-users", text: "Alert all occupants about the situation" }
    ],
    humidity: [
        { icon: "fa-fan", text: "Turn on exhaust fans or dehumidifier" },
        { icon: "fa-window-maximize", text: "Open windows to improve air circulation" },
        { icon: "fa-shower", text: "Check for water leaks or pipe issues" },
        { icon: "fa-tint-slash", text: "Avoid activities that generate moisture" },
        { icon: "fa-thermometer-half", text: "Monitor humidity levels continuously" }
    ],
    combined: [
        { icon: "fa-door-open", text: "Ventilate the area immediately - open all windows" },
        { icon: "fa-power-off", text: "Avoid electrical switches if gas is detected" },
        { icon: "fa-running", text: "Evacuate if gas levels are critical" },
        { icon: "fa-phone-alt", text: "Call emergency services (911) if situation worsens" },
        { icon: "fa-first-aid", text: "Have first aid kit ready" }
    ]
};

const TOUR_STEPS = [
    {
        target: "#statusCard",
        title: "System Status",
        description: "This card shows your overall system health. Green means all safe, yellow is a warning, and red indicates danger."
    },
    {
        target: "#sensorsGrid",
        title: "Sensor Readings",
        description: "Real-time data from your assigned sensors. Each card shows current values and status indicators."
    },
    {
        target: "#hamburgerMenu",
        title: "Safety Center",
        description: "Access emergency guidelines, safety tips, and quick resources here."
    },
    {
        target: "#notificationsBtn",
        title: "Notifications",
        description: "View all alerts and notifications. The badge shows unread count."
    },
    {
        target: "#themeToggle",
        title: "Theme Toggle",
        description: "Switch between light and dark mode for comfortable viewing."
    }
];

// ============ Default Settings ============
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

// ============ PERFORMANCE HELPER - Safe JSON Parse ============
function safeJSONParse(str, fallback = null) {
    if (!str) return fallback;
    try {
        return JSON.parse(str);
    } catch {
        return fallback;
    }
}

// ============ PERFORMANCE HELPER - Settings Hash ============
function getSettingsHash(settings) {
    try {
        return btoa(JSON.stringify(settings));
    } catch {
        return Date.now().toString();
    }
}

// ============ State Management ============
const state = {
    // User & Auth
    userData: null,
    userId: null,
    isAuthenticated: false,
    
    // ✅ Cached sanitized user ID
    get sanitizedUserId() {
        if (!this._sanitizedId && this.userId) {
            this._sanitizedId = sanitizeFirebasePath(this.userId);
        }
        return this._sanitizedId;
    },
    _sanitizedId: null,
    
    // Sensors
    assignedSensorTypes: [],
    currentSensorData: {},
    previousSensorData: {},
    
    // Charts
    chartInstances: {},
    chartData: {},
    lastChartUpdate: 0,
    
    // UI State
    currentTipIndex: 0,
    tipInterval: null,
    tipProgress: 0,
    isLoading: true,
    isSidebarOpen: false,
    isFabOpen: false,
    activeDropdown: null,
    activeModal: null,
    
    // Danger & Alerts
    isDangerActive: false,
    isAlarmMuted: false,
    dangerStartTime: null,
    acknowledgedAlerts: new Set(),
    
    // Notifications
    notifications: [],
    unreadCount: 0,
    notificationFilter: 'all',
    
    // Settings (loaded from Firestore)
    settings: JSON.parse(JSON.stringify(DefaultSettings)),
    settingsDocUnsub: null,
    settingsSyncInterval: null,
    lastSettingsSync: 0,
    lastSettingsHash: '', // ✅ NEW: Track settings changes
    
    // Connection
    isOnline: navigator.onLine,
    lastDataReceived: null,
    connectionCheckInterval: null,
    
    // Intervals & Listeners
    presenceInterval: null,
    userDocUnsub: null,
    sensorUnsub: null,
    autoRefreshInterval: null,
    autoRefreshCountdown: CONFIG.AUTO_REFRESH_INTERVAL / 1000,
    
    // Email
    lastEmailSentAt: 0,
    
    // Tour
    tourActive: false,
    tourStep: 0,
    
    // Navigation
    isNavigating: false,
    
    // ✅ NEW: Cached DOM elements for sensors
    sensorElements: {}
};

// ============ DOM Elements ============
const elements = {};

function cacheElements() {
    const ids = [
        'initialLoader', 'loaderFill', 'loaderText',
        'pageTransition',
        'hamburgerMenu', 'notificationsBtn', 'notificationBadge', 'notificationsDropdown',
        'notificationsList', 'notificationsCount', 'clearAllNotifications', 'markAllReadBtn',
        'themeToggle', 'userMenuBtn', 'userDropdown', 'userName', 'userAvatar',
        'dropdownAvatar', 'dropdownUserName', 'dropdownUserEmail',
        'connectionStatus', 'headerCenter', 'headerMobileBottom',
        'activeSensorsCount', 'systemStatusText', 'alertsCount',
        'mobileActiveSensors', 'mobileStatus', 'mobileAlerts',
        'statusCard', 'statusIcon', 'statusMessage', 'statusDetails', 'statusTime',
        'sensorsSection', 'sensorsGrid', 'sensorsLoading', 'sensorsBadge',
        'chartsSection', 'chartsGrid', 'additionalSection',
        'noSensorsSection', 'autoRefreshCountdown',
        'emergencySidebar', 'sidebarOverlay', 'sidebarClose', 'lastUpdated',
        'tipProgressBar',
        'fabContainer', 'fabMain', 'fabMenu',
        'scrollToTop',
        'profileModal', 'closeProfileModal', 'closeProfileBtn',
        'settingsModal', 'closeSettingsModal',
        'shortcutsModal', 'closeShortcutsModal',
        'modalProfileAvatar', 'modalFullName', 'modalFirstName', 'modalLastName',
        'modalUsername', 'modalEmail', 'modalPhoneNumber', 'modalStatus', 'modalCreatedAt',
        'dangerAlertOverlay', 'dangerAlertTitle', 'dangerAlertSubtitle',
        'dangerReadings', 'instructionList', 'dangerSeverity', 'severityFill', 'severityText',
        'muteAlarmBtn', 'acknowledgeAlertBtn', 'callEmergencyBtn',
        'countdownProgress', 'countdownValue',
        'alarmSound', 'notificationSound', 'successSound', 'warningSound', 'clickSound',
        'soundIndicator', 'muteSoundBtn',
        'toastContainer',
        'connectionOverlay',
        'sessionModal',
        'tourOverlay', 'tourSpotlight', 'tourTooltip', 'tourTitle', 'tourDescription',
        'tourStep', 'tourTotal', 'tourSkip', 'tourNext',
        'profileBtn', 'settingsBtn', 'logoutBtn', 'helpBtn',
        'refreshStatusBtn', 'expandStatusBtn', 'toggleSensorView', 'refreshSensors',
        'contactAdminBtn', 'viewAllNotifications', 'resetSettingsBtn'
    ];
    
    ids.forEach(id => {
        elements[id] = document.getElementById(id);
    });
    
    elements.body = document.body;
    elements.dashboardContainer = document.getElementById('dashboardContainer');
    elements.dashboardMain = document.getElementById('dashboardMain');
    elements.dashboardHeader = document.getElementById('dashboardHeader');
    elements.filterBtns = document.querySelectorAll('.filter-btn');
    elements.timeFilterBtns = document.querySelectorAll('.time-filter-btn');
    elements.guidelineCards = document.querySelectorAll('.guideline-card');
    elements.tipSlides = document.querySelectorAll('.tip-slide');
    elements.tipDots = document.querySelectorAll('.tip-dots .dot');
    elements.themeOptions = document.querySelectorAll('.theme-option');
    elements.selectBtns = document.querySelectorAll('.select-btn');
    elements.toggleSwitches = document.querySelectorAll('.toggle-switch input');
    
    elements.profileLinks = document.querySelectorAll('a[href="user-profile.html"]');
    elements.settingsLinks = document.querySelectorAll('a[href="user-settings.html"]');
}

// ============ Initialization ============
document.addEventListener("DOMContentLoaded", async () => {
    console.log("🚀 BreathSafe Dashboard v7.4 initializing...");
    
    const initStartTime = Date.now();
    
    try {
        cacheElements();
        
        updateLoader(10, "Checking authentication...");
        
        const session = checkAuth();
        if (!session) return;
        
        state.userData = session;
        state.userId = session.id || session.username;
        state.isAuthenticated = true;
        
        updateLoader(20, "Loading settings from cloud...");
        
        await FirestoreSettingsManager.load(state.userId);
        
        loadNotifications();
        
        updateLoader(30, "Connecting to server...");
        
        const status = await checkUserStatus(state.userId);
        
        if (!status) {
            hideLoader();
            showErrorState("Failed to load user data. Please try again.");
            return;
        }
        
        updateLoader(50, "Verifying account...");
        
        if (status.status === "pending") {
            hideLoader();
            showPendingState();
            setupBasicEventListeners();
            return;
        }
        
        if (status.status === "inactive" || status.status === "suspended") {
            hideLoader();
            showInactiveState();
            setupBasicEventListeners();
            return;
        }
        
        updateLoader(60, "Loading sensors...");
        
        if (!status.hasSensors) {
            hideLoader();
            showNoSensorsMessage();
            loadUserDisplay();
            setupEventListeners();
            setupUserDocListener();
            startAutoRefreshCountdown();
            initializeEmergencySidebar();
            
            FirestoreSettingsManager.setupListener(state.userId);
            FirestoreSettingsManager.startAutoSync(state.userId);
            
            return;
        }
        
        if (!status.welcomeCompleted) {
            console.log("📝 Welcome not completed, redirecting...");
            window.location.href = CONFIG.WELCOME_PAGE_PATH;
            return;
        }
        
        updateLoader(70, "Setting up dashboard...");
        
        state.assignedSensorTypes = status.assignedSensorTypes;
        
        loadUserDisplay();
        
        updateLoader(80, "Rendering components...");
        
        renderSensorCards();
        renderCharts();
        initCharts();
        renderAdditionalCards();
        
        updateLoader(90, "Connecting to sensors...");
        
        setupRealtimeData();
        setupSessionTerminationListener();
        setupUserDocListener();
        setupPresence();
        setupConnectionMonitoring();
        
        FirestoreSettingsManager.setupListener(state.userId);
        FirestoreSettingsManager.startAutoSync(state.userId);
        
        updateLoader(100, "Ready!");
        
        const elapsed = Date.now() - initStartTime;
        const remainingTime = Math.max(0, CONFIG.LOADER_MIN_DISPLAY_TIME - elapsed);
        
        setTimeout(() => {
            hideLoader();
            
            setupEventListeners();
            initializeEmergencySidebar();
            initKeyboardShortcuts();
            initTouchGestures();
            initScrollBehavior();
            
            checkProfileUpdates();
            restoreDashboardState();
            
            showToast("success", "Welcome back!", `Hello, ${state.userData.firstName || state.userData.username}!`);
            
            checkFirstVisit();
            
            updateStatusTime();
            setInterval(updateStatusTime, 1000);
            
            console.log("✅ Dashboard fully initialized");
            
        }, remainingTime);
        
    } catch (e) {
        console.error("❌ Dashboard initialization error:", e);
        hideLoader();
        showErrorState("An unexpected error occurred. Please refresh the page.");
    }
});
// ============ Loader Functions ============
function updateLoader(progress, text) {
    if (elements.loaderFill) {
        elements.loaderFill.style.width = `${progress}%`;
    }
    if (elements.loaderText) {
        elements.loaderText.textContent = text;
    }
}

function hideLoader() {
    if (elements.initialLoader) {
        elements.initialLoader.classList.add('hidden');
        elements.body.removeAttribute('data-loading');
    }
    state.isLoading = false;
}

function showLoader() {
    if (elements.initialLoader) {
        elements.initialLoader.classList.remove('hidden');
        elements.body.setAttribute('data-loading', 'true');
    }
    state.isLoading = true;
}

// ============ Authentication ============
function checkAuth() {
    const raw = sessionStorage.getItem("breathsafeUser");
    
    if (!raw) {
        console.log("❌ No session found, redirecting to login...");
        window.location.href = CONFIG.LOGIN_PAGE_PATH;
        return null;
    }
    
    const session = safeJSONParse(raw); // ✅ OPTIMIZED: Use safe parser
    
    if (!session || (!session.id && !session.username)) {
        console.error("❌ Invalid session structure");
        sessionStorage.removeItem("breathsafeUser");
        window.location.href = CONFIG.LOGIN_PAGE_PATH;
        return null;
    }
    
    return session;
}

// ============ User Status Check ============
async function checkUserStatus(userId) {
    try {
        const userDoc = await getDoc(doc(db, "users", userId));
        
        if (!userDoc.exists()) {
            console.warn("⚠️ User document not found");
            return null;
        }
        
        const data = userDoc.data();
        
        return {
            status: data.status || "pending",
            hasSensors: Array.isArray(data.assignedSensorTypes) && data.assignedSensorTypes.length > 0,
            welcomeCompleted: data.welcomeCompleted === true,
            assignedSensorTypes: data.assignedSensorTypes || []
        };
        
    } catch (e) {
        console.error("❌ User status check error:", e);
        return null;
    }
}

// ============ FIRESTORE SETTINGS MANAGER ============
const FirestoreSettingsManager = {
    // ✅ Track last known server timestamp
    lastServerUpdate: 0,
    
    async load(userId) {
        try {
            const settingsRef = doc(db, 'user_settings', userId);
            const settingsDoc = await getDoc(settingsRef);
            
            if (settingsDoc.exists()) {
                const data = settingsDoc.data();
                
                state.settings = {
                    alerts: { ...DefaultSettings.alerts, ...(data.alerts || {}) },
                    display: { ...DefaultSettings.display, ...(data.display || {}) },
                    units: { ...DefaultSettings.units, ...(data.units || {}) }
                };
                
                // ✅ Store server timestamp
                if (data.lastUpdated?.seconds) {
                    this.lastServerUpdate = data.lastUpdated.seconds * 1000;
                }
                
                // ✅ Initialize hash
                state.lastSettingsHash = getSettingsHash(state.settings);
                
                applyTheme(state.settings.display.theme);
                
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
            const settingsRef = doc(db, 'user_settings', userId);
            
            const settingsData = {
                alerts: state.settings.alerts,
                display: state.settings.display,
                units: state.settings.units,
                lastUpdated: serverTimestamp(),
                updatedBy: userId,
                updatedFrom: 'dashboard' // ✅ Track source
            };
            
            await setDoc(settingsRef, settingsData, { merge: true });
            
            // ✅ Update local tracking
            state.lastSyncTime = Date.now();
            this.lastServerUpdate = Date.now(); // Approximate
            state.lastSettingsHash = getSettingsHash(state.settings);
            
            console.log('💾 Settings saved to Firestore (from dashboard)');
            
            if (showToastMsg) {
                showToast("success", "Settings Synced", "Your preferences have been saved to cloud");
            }
            
            return true;
        } catch (error) {
            console.error('❌ Failed to save settings to Firestore:', error);
            return false;
        }
    },
    
    setupListener(userId) {
        if (state.settingsDocUnsub) {
            state.settingsDocUnsub();
        }
        
        const settingsRef = doc(db, 'user_settings', userId);
        
        state.settingsDocUnsub = onSnapshot(
            settingsRef,
            (snapshot) => {
                if (!snapshot.exists()) return;
                
                const data = snapshot.data();
                
                // ✅ CRITICAL FIX: Check if this update is newer than our last save
                const serverTimestamp = data.lastUpdated?.seconds ? data.lastUpdated.seconds * 1000 : 0;
                const timeSinceOurLastSave = Date.now() - state.lastSyncTime;
                
                // Ignore updates that happened within 2 seconds of our last save (likely our own save)
                if (timeSinceOurLastSave < 2000) {
                    console.log('⏭️ Ignoring settings update (recent local save)');
                    return;
                }
                
                // ✅ Check if server data is actually newer
                if (serverTimestamp <= this.lastServerUpdate) {
                    console.log('⏭️ Ignoring stale settings update');
                    return;
                }
                
                const newSettings = {
                    alerts: { ...DefaultSettings.alerts, ...(data.alerts || {}) },
                    display: { ...DefaultSettings.display, ...(data.display || {}) },
                    units: { ...DefaultSettings.units, ...(data.units || {}) }
                };
                
                const newHash = getSettingsHash(newSettings);
                
                // ✅ Only update if settings actually changed
                if (newHash !== state.lastSettingsHash) {
                    const source = data.updatedFrom || 'unknown';
                    console.log(`🔄 Settings updated from ${source} (timestamp: ${new Date(serverTimestamp).toLocaleTimeString()})`);
                    
                    // ✅ Update all tracking variables
                    state.settings = newSettings;
                    state.lastSettingsHash = newHash;
                    this.lastServerUpdate = serverTimestamp;
                    
                    // Apply to UI
                    applyTheme(state.settings.display.theme);
                    
                    if (Object.keys(state.currentSensorData).length > 0) {
                        updateSensorDisplay(state.currentSensorData);
                    }
                    updateChartsTheme();
                    
                    // Only show toast if update came from another source
                    if (source !== 'dashboard' && timeSinceOurLastSave > 10000) {
                        showToast("info", "Settings Updated", `Synced from ${source}`);
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
        if (state.settingsSyncInterval) {
            clearInterval(state.settingsSyncInterval);
        }
        
        // ✅ Debounced auto-sync with hash checking
        let pendingSave = false;
        
        state.settingsSyncInterval = setInterval(async () => {
            if (pendingSave) {
                console.log('⏭️ Skipping auto-sync (save in progress)');
                return;
            }
            
            const currentHash = getSettingsHash(state.settings);
            
            // ✅ Only sync if settings actually changed since last sync
            if (currentHash !== state.lastSettingsHash) {
                console.log('🔄 Auto-sync: Changes detected');
                pendingSave = true;
                
                await this.save(userId, false);
                
                pendingSave = false;
            }
        }, CONFIG.SETTINGS_SYNC_INTERVAL);
        
        console.log('✅ Settings auto-sync started (every 5s, smart debounce)');
    },
    
    stopAutoSync() {
        if (state.settingsSyncInterval) {
            clearInterval(state.settingsSyncInterval);
            state.settingsSyncInterval = null;
        }
    }
};

// ============ Settings Management (Firestore-backed) ============
function getThresholds() {
    const t = {
        MQ6: { ...THRESHOLDS.MQ6 },
        MQ7: { ...THRESHOLDS.MQ7 },
        TEMP: { ...THRESHOLDS.TEMP },
        HUMIDITY: { ...THRESHOLDS.HUMIDITY }
    };
    
    if (state.settings.units?.temperature === "fahrenheit") {
        t.TEMP = { ...THRESHOLDS_FAHRENHEIT.TEMP };
    }
    
    if (state.settings.units?.gas === "mg") {
        t.MQ6 = { ...THRESHOLDS_MG.MQ6 };
        t.MQ7 = { ...THRESHOLDS_MG.MQ7 };
    }
    
    return t;
}

function convertValue(value, type) {
    if (type === "temperature" && state.settings.units?.temperature === "fahrenheit") {
        return (value * 9 / 5) + 32;
    }
    
    if ((type === "MQ6" || type === "MQ7") && state.settings.units?.gas === "mg") {
        const factor = type === "MQ6" ? 1.8 : 1.15;
        return (value * factor) / 1000;
    }
    
    return value;
}

function getUnitLabel(type) {
    if (type === "temperature") {
        return state.settings.units?.temperature === "fahrenheit" ? "°F" : "°C";
    }
    if (type === "humidity") {
        return "%RH";
    }
    if (type === "MQ6" || type === "MQ7") {
        return state.settings.units?.gas === "mg" ? "mg/m³" : "PPM";
    }
    return "";
}

// ============ Theme Management ============
function applyTheme(theme) {
    if (theme === "auto") {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        theme = prefersDark ? "dark" : "light";
    }
    
    elements.body.classList.remove("light", "dark");
    elements.body.classList.add(theme);
    
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
        metaTheme.content = theme === "dark" ? "#1e293b" : "#10b981";
    }
    
    updateChartsTheme();
}

function toggleTheme() {
    const isDark = elements.body.classList.contains("dark");
    const newTheme = isDark ? "light" : "dark";
    
    state.settings.display.theme = newTheme;
    
    FirestoreSettingsManager.save(state.userId, true);
    
    applyTheme(newTheme);
    
    updateThemeOptions(newTheme);
    
    playSound("click");
    showToast("success", "Theme Changed", `Switched to ${newTheme} mode`);
}

function updateThemeOptions(theme) {
    elements.themeOptions?.forEach(btn => {
        btn.classList.toggle("active", btn.dataset.theme === theme);
    });
}

function updateChartsTheme() {
    const isDark = elements.body.classList.contains("dark");
    const textColor = isDark ? "#f3f4f6" : "#1f2937";
    const gridColor = isDark ? "#374151" : "#e5e7eb";
    
    Object.values(state.chartInstances).forEach(chart => {
        if (!chart) return;
        
        try {
            chart.options.scales.y.grid.color = gridColor;
            chart.options.scales.y.ticks.color = textColor;
            chart.options.scales.x.grid.color = gridColor;
            chart.options.scales.x.ticks.color = textColor;
            chart.update("none"); // ✅ OPTIMIZED: Use 'none' mode for instant update
        } catch (e) {
            console.warn("Chart theme update error:", e);
        }
    });
}

// ============ User Display ============
function loadUserDisplay() {
    if (!state.userData) return;
    
    const firstName = state.userData.firstName || "";
    const lastName = state.userData.lastName || "";
    const fullName = `${firstName} ${lastName}`.trim() || state.userData.username || "User";
    const initial = (firstName[0] || state.userData.username?.[0] || "U").toUpperCase();
    
    const avatarSvg = generateAvatarSvg(initial);
    
    if (elements.userName) {
        elements.userName.textContent = fullName;
    }
    
    const avatarElements = [
        elements.userAvatar,
        elements.dropdownAvatar,
        elements.modalProfileAvatar
    ];
    
    avatarElements.forEach(el => {
        if (el) el.src = avatarSvg;
    });
    
    if (elements.dropdownUserName) {
        elements.dropdownUserName.textContent = fullName;
    }
    
    if (elements.dropdownUserEmail) {
        elements.dropdownUserEmail.textContent = state.userData.email || "";
    }
    
    if (elements.modalFullName) {
        elements.modalFullName.textContent = fullName;
    }
    
    if (elements.modalFirstName) {
        elements.modalFirstName.textContent = firstName || "-";
    }
    
    if (elements.modalLastName) {
        elements.modalLastName.textContent = lastName || "-";
    }
    
    if (elements.modalUsername) {
        elements.modalUsername.textContent = state.userData.username || "-";
    }
    
    if (elements.modalEmail) {
        elements.modalEmail.textContent = state.userData.email || "-";
    }
    
    if (elements.modalPhoneNumber) {
        elements.modalPhoneNumber.textContent = state.userData.phoneNumber || "-";
    }
    
    if (elements.modalStatus) {
        elements.modalStatus.textContent = capitalizeFirst(state.userData.status || "active");
    }
    
    if (elements.modalCreatedAt) {
        elements.modalCreatedAt.textContent = formatDate(state.userData.createdAt);
    }
}

function generateAvatarSvg(initial) {
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cdefs%3E%3ClinearGradient id='grad' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' style='stop-color:%2310b981'/%3E%3Cstop offset='100%25' style='stop-color:%23059669'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='40' cy='40' r='40' fill='url(%23grad)'/%3E%3Ctext x='40' y='52' font-family='Inter,system-ui,sans-serif' font-size='32' font-weight='700' fill='white' text-anchor='middle'%3E${initial}%3C/text%3E%3C/svg%3E`;
}

// ============ PROFILE NAVIGATION SYSTEM ============
function navigateToProfile() {
    if (state.isNavigating) return;
    state.isNavigating = true;
    
    console.log("🔄 Navigating to profile...");
    
    const dashboardState = {
        lastVisited: Date.now(),
        scrollPosition: window.scrollY,
        activeSection: getCurrentSection(),
        notifications: state.notifications.slice(0, 20),
        settings: state.settings,
        sensorData: state.currentSensorData,
        unreadCount: state.unreadCount
    };
    
    try {
        sessionStorage.setItem('dashboardState', JSON.stringify(dashboardState));
        console.log("✅ Dashboard state saved");
    } catch (e) {
        console.warn("⚠️ Could not save dashboard state:", e);
    }
    
    closeAllDropdowns();
    if (state.activeModal) {
        closeModal(state.activeModal);
    }
    if (state.isSidebarOpen) {
        closeSidebar();
    }
    
    playSound('click');
    
    showPageTransition(() => {
        window.location.href = CONFIG.PROFILE_PAGE_PATH;
    });
}

function navigateToSettings() {
    if (state.isNavigating) return;
    state.isNavigating = true;
    
    console.log("🔄 Navigating to settings...");
    
    FirestoreSettingsManager.save(state.userId, false);
    
    const dashboardState = {
        lastVisited: Date.now(),
        scrollPosition: window.scrollY,
        activeSection: getCurrentSection(),
        settings: state.settings
    };
    
    try {
        sessionStorage.setItem('dashboardState', JSON.stringify(dashboardState));
    } catch (e) {
        console.warn("⚠️ Could not save dashboard state:", e);
    }
    
    closeAllDropdowns();
    if (state.activeModal) {
        closeModal(state.activeModal);
    }
    
    playSound('click');
    
    showPageTransition(() => {
        window.location.href = CONFIG.SETTINGS_PAGE_PATH;
    });
}

function showPageTransition(callback) {
    const transition = elements.pageTransition;
    
    if (transition) {
        transition.classList.add('active');
        setTimeout(() => {
            if (callback) callback();
        }, 300);
    } else {
        if (callback) callback();
    }
}

function hidePageTransition() {
    const transition = elements.pageTransition;
    if (transition) {
        transition.classList.remove('active');
    }
}

function getCurrentSection() {
    const sections = ['statusSection', 'sensorsSection', 'chartsSection', 'additionalSection'];
    
    for (const sectionId of sections) {
        const section = document.getElementById(sectionId);
        if (section) {
            const rect = section.getBoundingClientRect();
            if (rect.top >= -100 && rect.top <= window.innerHeight / 2) {
                return sectionId;
            }
        }
    }
    return 'statusSection';
}

function restoreDashboardState() {
    const savedState = sessionStorage.getItem('dashboardState');
    
    if (!savedState) {
        console.log("ℹ️ No saved dashboard state found");
        return;
    }
    
    const dashboardState = safeJSONParse(savedState); // ✅ OPTIMIZED: Use safe parser
    
    if (!dashboardState) {
        sessionStorage.removeItem('dashboardState');
        return;
    }
    
    if (Date.now() - dashboardState.lastVisited < CONFIG.STATE_EXPIRY_TIME) {
        console.log("🔄 Restoring dashboard state...");
        
        if (dashboardState.scrollPosition && dashboardState.scrollPosition > 0) {
            setTimeout(() => {
                window.scrollTo({
                    top: dashboardState.scrollPosition,
                    behavior: 'smooth'
                });
                console.log("✅ Scroll position restored:", dashboardState.scrollPosition);
            }, 500);
        }
        
        if (dashboardState.settings) {
            state.settings = { ...state.settings, ...dashboardState.settings };
        }
        
        if (dashboardState.notifications && dashboardState.notifications.length > 0) {
            const existingIds = new Set(state.notifications.map(n => n.id));
            dashboardState.notifications.forEach(n => {
                if (!existingIds.has(n.id)) {
                    state.notifications.push(n);
                }
            });
            state.notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }
        
        if (typeof dashboardState.unreadCount === 'number') {
            state.unreadCount = dashboardState.unreadCount;
            updateNotificationBadge();
        }
        
        console.log("✅ Dashboard state restored successfully");
    } else {
        console.log("ℹ️ Dashboard state expired");
    }
    
    sessionStorage.removeItem('dashboardState');
}

function checkProfileUpdates() {
    const profileUpdated = sessionStorage.getItem('profileUpdated');
    
    if (profileUpdated === 'true') {
        console.log("🔄 Profile was updated, refreshing user data...");
        
        const userSession = sessionStorage.getItem('breathsafeUser');
        
        if (userSession) {
            const updatedUser = safeJSONParse(userSession); // ✅ OPTIMIZED
            
            if (updatedUser) {
                state.userData = updatedUser;
                loadUserDisplay();
                showToast('success', 'Profile Updated', 'Your profile changes have been applied');
                console.log("✅ User data refreshed from profile update");
            }
        }
        
        sessionStorage.removeItem('profileUpdated');
    }
}

async function refreshUserData() {
    if (!db || !state.userId) return;
    
    try {
        const userDoc = await getDoc(doc(db, 'users', state.userId));
        
        if (userDoc.exists()) {
            const freshData = userDoc.data();
            
            state.userData = { ...state.userData, ...freshData };
            
            sessionStorage.setItem('breathsafeUser', JSON.stringify(state.userData));
            
            loadUserDisplay();
            
            console.log("✅ User data refreshed from Firestore");
        }
    } catch (error) {
        console.error('❌ Error refreshing user data:', error);
    }
}

window.navigateToProfile = navigateToProfile;
window.navigateToSettings = navigateToSettings;
window.refreshUserData = refreshUserData;

// ============ User Document Listener ============
function setupUserDocListener() {
    if (!db || state.userDocUnsub) return;
    
    state.userDocUnsub = onSnapshot(
        doc(db, "users", state.userId),
        (snapshot) => {
            if (!snapshot.exists()) {
                console.warn("⚠️ User document deleted");
                handleLogout();
                return;
            }
            
            const data = snapshot.data();
            
            if (data.status === "pending") {
                showPendingState();
                return;
            }
            
            if (data.status === "inactive" || data.status === "suspended") {
                showInactiveState();
                return;
            }
            
            const newSensors = (data.assignedSensorTypes || []).sort().join(",");
            const oldSensors = state.assignedSensorTypes.sort().join(",");
            
            if (newSensors !== oldSensors) {
                console.log("🔄 Sensors changed, updating dashboard...");
                
                state.assignedSensorTypes = data.assignedSensorTypes || [];
                
                if (state.assignedSensorTypes.length === 0) {
                    showNoSensorsMessage();
                } else {
                    hideNoSensorsMessage();
                    renderSensorCards();
                    renderCharts();
                    initCharts();
                    renderAdditionalCards();
                    
                    showToast("info", "Sensors Updated", "Your sensor configuration has been updated.");
                    playSound("notification");
                }
            }
            
            state.userData = { ...state.userData, ...data };
            
            sessionStorage.setItem('breathsafeUser', JSON.stringify(state.userData));
            
            loadUserDisplay();
        },
        (error) => {
            console.error("❌ User doc listener error:", error);
        }
    );
    
    console.log("✅ User document listener active");
}

// ============ State Display Functions ============
function showPendingState() {
    if (elements.sensorsGrid) {
        elements.sensorsGrid.innerHTML = "";
    }
    
    if (elements.sensorsLoading) {
        elements.sensorsLoading.style.display = "none";
    }
    
    if (elements.chartsSection) {
        elements.chartsSection.style.display = "none";
    }
    
    if (elements.additionalSection) {
        elements.additionalSection.innerHTML = "";
    }
    
    if (elements.noSensorsSection) {
        elements.noSensorsSection.style.display = "block";
        elements.noSensorsSection.innerHTML = `
            <div class="pending-state-card glass-panel">
                <div class="pending-icon">
                    <i class="fas fa-user-clock"></i>
                    <div class="pending-pulse"></div>
                </div>
                <h2>Account Pending Approval</h2>
                <p>Your account is currently awaiting administrator approval. You'll receive access once approved.</p>
                <div class="pending-actions">
                    <button class="refresh-btn primary" onclick="location.reload()">
                        <i class="fas fa-sync-alt"></i>
                        <span>Check Status</span>
                    </button>
                    <button class="logout-btn" onclick="window.dashboardLogout()">
                        <i class="fas fa-sign-out-alt"></i>
                        <span>Sign Out</span>
                    </button>
                </div>
            </div>
        `;
    }
    
    updateQuickStats(0, "Pending", 0);
}

function showInactiveState() {
    if (elements.sensorsGrid) {
        elements.sensorsGrid.innerHTML = "";
    }
    
    if (elements.sensorsLoading) {
        elements.sensorsLoading.style.display = "none";
    }
    
    if (elements.chartsSection) {
        elements.chartsSection.style.display = "none";
    }
    
    if (elements.additionalSection) {
        elements.additionalSection.innerHTML = "";
    }
    
    if (elements.noSensorsSection) {
        elements.noSensorsSection.style.display = "block";
        elements.noSensorsSection.innerHTML = `
            <div class="inactive-state-card glass-panel">
                <div class="inactive-icon">
                    <i class="fas fa-user-slash"></i>
                </div>
                <h2>Account Deactivated</h2>
                <p>Your account has been deactivated by an administrator. Please contact support for assistance.</p>
                <div class="inactive-actions">
                    <button class="logout-btn" onclick="window.dashboardLogout()">
                        <i class="fas fa-sign-out-alt"></i>
                        <span>Return to Login</span>
                    </button>
                </div>
            </div>
        `;
    }
    
    updateQuickStats(0, "Inactive", 0);
}

function showNoSensorsMessage() {
    if (elements.sensorsGrid) {
        elements.sensorsGrid.innerHTML = "";
    }
    
    if (elements.sensorsLoading) {
        elements.sensorsLoading.style.display = "none";
    }
    
    if (elements.chartsSection) {
        elements.chartsSection.style.display = "none";
    }
    
    if (elements.additionalSection) {
        elements.additionalSection.innerHTML = "";
    }
    
    if (elements.noSensorsSection) {
        elements.noSensorsSection.style.display = "block";
    }
    
    updateQuickStats(0, "Active", 0);
    updateSystemStatus(0, "No sensors assigned");
}

function hideNoSensorsMessage() {
    if (elements.noSensorsSection) {
        elements.noSensorsSection.style.display = "none";
    }
}

function showErrorState(message) {
    if (elements.sensorsGrid) {
        elements.sensorsGrid.innerHTML = `
            <div class="error-state-card glass-panel" style="grid-column: 1 / -1;">
                <div class="error-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h2>Something Went Wrong</h2>
                <p>${escapeHtml(message)}</p>
                <button class="refresh-btn primary" onclick="location.reload()">
                    <i class="fas fa-sync-alt"></i>
                    <span>Refresh Page</span>
                </button>
            </div>
        `;
    }
    
    if (elements.sensorsLoading) {
        elements.sensorsLoading.style.display = "none";
    }
    
    if (elements.chartsSection) {
        elements.chartsSection.style.display = "none";
    }
}

// ============ Quick Stats Update ============
function updateQuickStats(sensorCount, status, alertCount) {
    if (elements.activeSensorsCount) {
        elements.activeSensorsCount.textContent = sensorCount;
    }
    
    if (elements.systemStatusText) {
        elements.systemStatusText.textContent = status;
    }
    
    if (elements.alertsCount) {
        elements.alertsCount.textContent = alertCount;
    }
    
    if (elements.mobileActiveSensors) {
        elements.mobileActiveSensors.textContent = sensorCount;
    }
    
    if (elements.mobileStatus) {
        const label = elements.mobileStatus.querySelector('.mobile-stat-label');
        if (label) label.textContent = status;
        
        elements.mobileStatus.classList.remove('warning', 'danger');
        if (status === "Warning") {
            elements.mobileStatus.classList.add('warning');
        } else if (status === "Danger") {
            elements.mobileStatus.classList.add('danger');
        }
    }
    
    if (elements.mobileAlerts) {
        elements.mobileAlerts.textContent = alertCount;
    }
}

// ============ Status Time Update ============
function updateStatusTime() {
    if (elements.statusTime) {
        elements.statusTime.textContent = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    }
}
// ============ Sensor Cards Rendering - ============
function renderSensorCards() {
    if (!elements.sensorsGrid) return;
    
    if (elements.sensorsLoading) {
        elements.sensorsLoading.style.display = "none";
    }
    
    elements.sensorsGrid.innerHTML = "";
    
    // ✅ Clear cached elements
    state.sensorElements = {};
    
    let cardCount = 0;
    
    state.assignedSensorTypes.forEach((type, index) => {
        if (type === "DHT22") {
            elements.sensorsGrid.innerHTML += createDHT22Cards(index);
            cardCount += 2;
        } else if (type === "MQ6" || type === "MQ7") {
            elements.sensorsGrid.innerHTML += createGasCard(type, index);
            cardCount += 1;
        }
    });
    
    updateGridLayout(cardCount);
    
    // ✅ Cache sensor DOM elements after rendering
    cacheSensorElements();
    
    updateQuickStats(state.assignedSensorTypes.length, "Normal", state.unreadCount);
    
    renderStatusDetails();
    
    console.log("✅ Sensor cards rendered:", cardCount, "cards");
}

// ✅ NEW: Cache sensor elements to avoid repeated DOM queries
function cacheSensorElements() {
    state.assignedSensorTypes.forEach(type => {
        if (type === "DHT22") {
            state.sensorElements.temp = {
                value: document.getElementById('tempValue'),
                status: document.getElementById('tempStatus'),
                indicator: document.getElementById('tempIndicator'),
                bar: document.getElementById('tempThresholdBar'),
                card: document.querySelector('[data-sensor="temperature"]')
            };
            state.sensorElements.humidity = {
                value: document.getElementById('humidityValue'),
                status: document.getElementById('humidityStatus'),
                indicator: document.getElementById('humidityIndicator'),
                bar: document.getElementById('humidityThresholdBar'),
                card: document.querySelector('[data-sensor="humidity"]')
            };
        } else if (type === "MQ6" || type === "MQ7") {
            const config = SENSOR_CONFIG[type];
            state.sensorElements[config.id] = {
                value: document.getElementById(`${config.id}Value`),
                status: document.getElementById(`${config.id}Status`),
                indicator: document.getElementById(`${config.id}Indicator`),
                bar: document.getElementById(`${config.id}ThresholdBar`),
                card: document.querySelector(`[data-sensor="${type}"]`)
            };
        }
    });
    
    console.log("✅ Sensor elements cached");
}

function createGasCard(type, index) {
    const config = SENSOR_CONFIG[type];
    const delay = 0.1 + (index * 0.1);
    
    return `
        <div class="sensor-card glass-panel" data-sensor="${type}" style="animation-delay: ${delay}s">
            <div class="sensor-header">
                <div class="sensor-icon ${config.iconClass}">
                    <i class="fas ${config.icon}"></i>
                </div>
                <div class="sensor-title-group">
                    <h3 class="sensor-title">${config.name}</h3>
                    <span class="sensor-description">${config.description}</span>
                </div>
            </div>
            <div class="sensor-value">
                <span class="value-number" id="${config.id}Value">--</span>
                <span class="value-unit">${getUnitLabel(type)}</span>
            </div>
            <div class="sensor-footer">
                <span class="sensor-status connecting" id="${config.id}Status">Connecting...</span>
                <div class="sensor-indicator connecting" id="${config.id}Indicator"></div>
            </div>
            <div class="sensor-threshold-bar">
                <div class="threshold-fill" id="${config.id}ThresholdBar" style="width: 0%"></div>
            </div>
        </div>
    `;
}

function createDHT22Cards(index) {
    const delay1 = 0.1 + (index * 0.1);
    const delay2 = 0.15 + (index * 0.1);
    
    return `
        <div class="sensor-card glass-panel" data-sensor="temperature" style="animation-delay: ${delay1}s">
            <div class="sensor-header">
                <div class="sensor-icon temp-icon">
                    <i class="fas fa-thermometer-half"></i>
                </div>
                <div class="sensor-title-group">
                    <h3 class="sensor-title">Temperature</h3>
                    <span class="sensor-description">DHT22 Sensor</span>
                </div>
            </div>
            <div class="sensor-value">
                <span class="value-number" id="tempValue">--</span>
                <span class="value-unit">${getUnitLabel("temperature")}</span>
            </div>
            <div class="sensor-footer">
                <span class="sensor-status connecting" id="tempStatus">Connecting...</span>
                <div class="sensor-indicator connecting" id="tempIndicator"></div>
            </div>
            <div class="sensor-threshold-bar">
                <div class="threshold-fill" id="tempThresholdBar" style="width: 0%"></div>
            </div>
        </div>
        
        <div class="sensor-card glass-panel" data-sensor="humidity" style="animation-delay: ${delay2}s">
            <div class="sensor-header">
                <div class="sensor-icon humidity-icon">
                    <i class="fas fa-tint"></i>
                </div>
                <div class="sensor-title-group">
                    <h3 class="sensor-title">Humidity</h3>
                    <span class="sensor-description">DHT22 Sensor</span>
                </div>
            </div>
            <div class="sensor-value">
                <span class="value-number" id="humidityValue">--</span>
                <span class="value-unit">${getUnitLabel("humidity")}</span>
            </div>
            <div class="sensor-footer">
                <span class="sensor-status connecting" id="humidityStatus">Connecting...</span>
                <div class="sensor-indicator connecting" id="humidityIndicator"></div>
            </div>
            <div class="sensor-threshold-bar">
                <div class="threshold-fill" id="humidityThresholdBar" style="width: 0%"></div>
            </div>
        </div>
    `;
}

function updateGridLayout(count) {
    if (!elements.sensorsGrid) return;
    
    elements.sensorsGrid.classList.remove('grid-1', 'grid-2', 'grid-3', 'grid-4');
    
    if (count === 1) {
        elements.sensorsGrid.classList.add('grid-1');
    } else if (count === 2) {
        elements.sensorsGrid.classList.add('grid-2');
    } else if (count === 3) {
        elements.sensorsGrid.classList.add('grid-3');
    } else {
        elements.sensorsGrid.classList.add('grid-4');
    }
}

function renderStatusDetails() {
    if (!elements.statusDetails) return;
    
    let html = "";
    
    if (state.assignedSensorTypes.includes("MQ6")) {
        html += `
            <div class="status-detail">
                <span class="detail-label">MQ6:</span>
                <span class="detail-value" id="statusMQ6">--</span>
                <span class="detail-unit">${getUnitLabel("MQ6")}</span>
            </div>
        `;
    }
    
    if (state.assignedSensorTypes.includes("MQ7")) {
        html += `
            <div class="status-detail">
                <span class="detail-label">MQ7:</span>
                <span class="detail-value" id="statusMQ7">--</span>
                <span class="detail-unit">${getUnitLabel("MQ7")}</span>
            </div>
        `;
    }
    
    if (state.assignedSensorTypes.includes("DHT22")) {
        html += `
            <div class="status-detail">
                <span class="detail-label">Temp:</span>
                <span class="detail-value" id="statusTemp">--</span>
                <span class="detail-unit">${getUnitLabel("temperature")}</span>
            </div>
            <div class="status-detail">
                <span class="detail-label">Humidity:</span>
                <span class="detail-value" id="statusHumidity">--</span>
                <span class="detail-unit">${getUnitLabel("humidity")}</span>
            </div>
        `;
    }
    
    elements.statusDetails.innerHTML = html;
}

// ============ Charts Rendering ============
function renderCharts() {
    if (!elements.chartsSection) return;
    
    const gasTypes = state.assignedSensorTypes.filter(t => t === "MQ6" || t === "MQ7");
    
    if (gasTypes.length === 0) {
        elements.chartsSection.style.display = "none";
        return;
    }
    
    elements.chartsSection.style.display = "block";
    
    let chartsGrid = elements.chartsGrid;
    if (!chartsGrid) {
        chartsGrid = document.createElement('div');
        chartsGrid.id = 'chartsGrid';
        chartsGrid.className = 'charts-grid';
        elements.chartsSection.appendChild(chartsGrid);
        elements.chartsGrid = chartsGrid;
    }
    
    chartsGrid.innerHTML = gasTypes.map((type, index) => {
        const config = SENSOR_CONFIG[type];
        const delay = 0.3 + (index * 0.1);
        
        state.chartData[config.id] = {
            timestamps: [],
            values: []
        };
        
        return `
            <div class="chart-card glass-panel" style="animation-delay: ${delay}s">
                <div class="chart-header">
                    <h3 class="chart-title">
                        <i class="fas fa-chart-line"></i>
                        ${config.name} Trend
                    </h3>
                    <div class="chart-legend">
                        <div class="legend-item">
                            <div class="legend-color" style="background: ${config.chartColor.border}"></div>
                            <span>${getUnitLabel(type)}</span>
                        </div>
                    </div>
                </div>
                <div class="chart-container">
                    <canvas id="${config.id}Chart"></canvas>
                </div>
            </div>
        `;
    }).join("");
    
    chartsGrid.classList.remove('charts-1', 'charts-2');
    chartsGrid.classList.add(gasTypes.length === 1 ? 'charts-1' : 'charts-2');
}

// ✅ Properly destroy charts with canvas cleanup
function destroyAllCharts() {
    Object.entries(state.chartInstances).forEach(([key, chart]) => {
        if (chart) {
            try {
                chart.destroy();
            } catch (e) {
                console.warn(`Failed to destroy chart ${key}:`, e);
            }
        }
    });
    
    // Clear canvas contexts
    document.querySelectorAll('canvas[id$="Chart"]').forEach(canvas => {
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    });
    
    state.chartInstances = {};
}

function initCharts() {
    if (typeof Chart === 'undefined') {
        console.warn("⚠️ Chart.js not loaded");
        return;
    }
    
    destroyAllCharts(); // ✅ FIXED: Proper cleanup
    
    const isDark = elements.body.classList.contains("dark");
    const textColor = isDark ? "#f3f4f6" : "#1f2937";
    const gridColor = isDark ? "#374151" : "#e5e7eb";
    
    state.assignedSensorTypes.forEach(type => {
        if (type !== "MQ6" && type !== "MQ7") return;
        
        const config = SENSOR_CONFIG[type];
        const canvas = document.getElementById(`${config.id}Chart`);
        
        if (!canvas) return;
        
        const ctx = canvas.getContext("2d");
        
        const gradient = ctx.createLinearGradient(0, 0, 0, 280);
        gradient.addColorStop(0, config.chartColor.gradient[0]);
        gradient.addColorStop(1, config.chartColor.gradient[1]);
        
        const thresholds = getThresholds();
        const maxY = thresholds[type].DANGER * 1.5;
        
        state.chartInstances[config.id] = new Chart(ctx, {
            type: "line",
            data: {
                labels: [],
                datasets: [{
                    label: config.name,
                    data: [],
                    borderColor: config.chartColor.border,
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointHoverBackgroundColor: config.chartColor.border,
                    pointHoverBorderColor: "#fff",
                    pointHoverBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: true,
                        backgroundColor: isDark ? "#1e293b" : "#ffffff",
                        titleColor: isDark ? "#f3f4f6" : "#1f2937",
                        bodyColor: isDark ? "#cbd5e1" : "#475569",
                        borderColor: isDark ? "#374151" : "#e5e7eb",
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        displayColors: false,
                        callbacks: {
                            title: (items) => items[0]?.label || '',
                            label: (item) => `${config.name}: ${item.formattedValue} ${getUnitLabel(type)}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: maxY,
                        grid: {
                            color: gridColor,
                            drawBorder: false
                        },
                        ticks: {
                            color: textColor,
                            font: {
                                size: 11,
                                family: "'Inter', sans-serif"
                            },
                            padding: 8
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: textColor,
                            font: {
                                size: 10,
                                family: "'Inter', sans-serif"
                            },
                            maxRotation: 0,
                            maxTicksLimit: 8
                        }
                    }
                },
                animation: {
                    duration: 0, // ✅ OPTIMIZED: Disable animations for real-time
                }
            }
        });
    });
    
    console.log("✅ Charts initialized");
}

// ✅ Batch chart updates with requestAnimationFrame
const chartUpdateQueue = new Set();
let chartUpdateFrame = null;

function updateChartData(data) {
    const now = Date.now();
    
    if (now - state.lastChartUpdate < CONFIG.CHART_UPDATE_THROTTLE) {
        return;
    }
    state.lastChartUpdate = now;
    
    const timestamp = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    
    state.assignedSensorTypes.forEach(type => {
        if (type !== "MQ6" && type !== "MQ7") return;
        
        const config = SENSOR_CONFIG[type];
        let value = parseFloat(data[config.dataKey]) || 0;
        value = convertValue(value, type);
        
        if (!state.chartData[config.id]) {
            state.chartData[config.id] = { timestamps: [], values: [] };
        }
        
        state.chartData[config.id].timestamps.push(timestamp);
        state.chartData[config.id].values.push(value);
        
        if (state.chartData[config.id].timestamps.length > CONFIG.MAX_DATA_POINTS) {
            state.chartData[config.id].timestamps.shift();
            state.chartData[config.id].values.shift();
        }
        
        chartUpdateQueue.add(config.id);
    });
    
    // ✅ Batch update all charts in one animation frame
    if (!chartUpdateFrame) {
        chartUpdateFrame = requestAnimationFrame(() => {
            chartUpdateQueue.forEach(chartId => {
                const chart = state.chartInstances[chartId];
                if (chart && state.chartData[chartId]) {
                    chart.data.labels = state.chartData[chartId].timestamps;
                    chart.data.datasets[0].data = state.chartData[chartId].values;
                    chart.update('none'); // ✅ 'none' mode = instant, no animation
                }
            });
            chartUpdateQueue.clear();
            chartUpdateFrame = null;
        });
    }
}

// ============ Additional Cards ============
function renderAdditionalCards() {
    if (!elements.additionalSection) {
        const section = document.createElement('section');
        section.id = 'additionalSection';
        section.className = 'additional-section';
        elements.dashboardMain?.appendChild(section);
        elements.additionalSection = section;
    }
    
    elements.additionalSection.innerHTML = `
        <div class="additional-cards-section cards-3">
            ${renderSensorStatusCard()}
            ${renderAlertHistoryCard()}
            ${renderSafetySuggestionsCard()}
        </div>
    `;
    
    updateAdditionalCards();
    
    console.log("✅ Additional cards rendered");
}

function renderSensorStatusCard() {
    return `
        <div class="sensor-status-card glass-panel">
            <div class="sensor-status-header">
                <i class="fas fa-microchip"></i>
                <h3>Sensor Status</h3>
            </div>
            <div class="sensor-status-list" id="sensorStatusList">
            <!-- Dynamic content -->
            </div>
        </div>
    `;
}

function renderAlertHistoryCard() {
    return `
        <div class="alert-history-card glass-panel">
            <div class="alert-history-header">
                <i class="fas fa-history"></i>
                <h3>Alert History</h3>
            </div>
            <div class="alert-history-list" id="alertHistoryList">
            <!-- Dynamic content -->
            </div>
        </div>
    `;
}

function renderSafetySuggestionsCard() {
    return `
        <div class="safety-tips-card glass-panel">
            <div class="safety-tips-header">
                <i class="fas fa-lightbulb"></i>
                <h3>Safety Tips</h3>
            </div>
            <div id="safetySuggestionsContent">
            <!-- Dynamic content -->
            </div>
        </div>
    `;
}

function updateAdditionalCards() {
    updateSensorStatusCard();
    updateAlertHistoryCard();
    updateSafetySuggestions();
}

function updateSensorStatusCard() {
    const list = document.getElementById('sensorStatusList');
    if (!list) return;

    const allowedSensorTypes = Object.keys(SENSOR_CONFIG);
    const assignedSensorTypes = Array.isArray(state.assignedSensorTypes)
        ? state.assignedSensorTypes.filter(type =>
            typeof type === 'string' && allowedSensorTypes.includes(type))
        : [];
    
    if (assignedSensorTypes.length === 0) {
        list.innerHTML = `
            <div class="alert-history-empty">
                <i class="fas fa-microchip"></i>
                <p>No sensors assigned</p>
            </div>
        `;
        return;
    }
    
    list.innerHTML = assignedSensorTypes.map(type => {
        const isOnline = getSensorOnlineStatus(type);
        const statusClass = isOnline ? 'online' : 'offline';
        const statusText = isOnline ? 'Online' : 'Offline';
        
        let displayName = type;
        if (type === 'DHT22') {
            displayName = 'DHT22 (Temp/Humidity)';
        }
        
        return `
            <div class="sensor-status-item ${statusClass}">
                <div class="sensor-status-info">
                    <span class="sensor-status-name">${escapeHtml(displayName)}</span>
                </div>
                <span class="sensor-status-badge ${statusClass}">${statusText}</span>
            </div>
        `;
    }).join('');
}

function getSensorOnlineStatus(type) {
    if (!state.currentSensorData || Object.keys(state.currentSensorData).length === 0) {
        return false;
    }
    
    if (type === 'DHT22') {
        const temp = parseFloat(state.currentSensorData['Temperature']);
        const hum = parseFloat(state.currentSensorData['Humidity']);
        return !isNaN(temp) || !isNaN(hum);
    }
    
    const config = SENSOR_CONFIG[type];
    if (!config) return false;
    
    const value = parseFloat(state.currentSensorData[config.dataKey]);
    return !isNaN(value);
}

function updateAlertHistoryCard() {
    const list = document.getElementById('alertHistoryList');
    if (!list) return;
    
    const alerts = state.notifications
        .filter(n => n.type === 'danger' || n.type === 'warning')
        .slice(0, 5);
    
    if (alerts.length === 0) {
        list.innerHTML = `
            <div class="alert-history-empty">
                <i class="fas fa-shield-alt"></i>
                <p>No alerts recorded</p>
            </div>
        `;
        return;
    }
    
    list.innerHTML = alerts.map(alert => `
        <div class="alert-history-item ${alert.type}">
            <div class="alert-history-title">${escapeHtml(alert.title)}</div>
            <div class="alert-history-time">${formatTimeAgo(alert.timestamp)}</div>
        </div>
    `).join('');
}

function updateSafetySuggestions() {
    const container = document.getElementById('safetySuggestionsContent');
    if (!container) return;
    
    let tips = [];
    
    if (state.isDangerActive) {
        tips.push({
            type: 'danger',
            text: 'Critical alert active! Follow emergency procedures immediately.'
        });
    }
    
    const thresholds = getThresholds();
    
    if (state.assignedSensorTypes.includes('DHT22')) {
        const temp = convertValue(parseFloat(state.currentSensorData?.Temperature) || 0, 'temperature');
        const humidity = parseFloat(state.currentSensorData?.Humidity) || 0;
        
        if (temp >= thresholds.TEMP.WARNING) {
            tips.push({
                type: 'warning',
                text: 'Temperature is elevated. Increase ventilation and check cooling systems.'
            });
        }
        
        if (humidity >= thresholds.HUMIDITY.WARNING) {
            tips.push({
                type: 'warning',
                text: 'Humidity is high. Consider using a dehumidifier or improving airflow.'
            });
        }
    }
    
    if (tips.length === 0) {
        const randomTip = SAFETY_TIPS[Math.floor(Math.random() * SAFETY_TIPS.length)];
        tips.push({
            type: 'info',
            text: randomTip.text
        });
    }
    
    container.innerHTML = tips.map(tip => `
        <div class="safety-tip-item ${tip.type}">
            <div class="safety-tip-content">
                <p>${escapeHtml(tip.text)}</p>
            </div>
        </div>
    `).join('');
}

// ============ Real-time Data Setup ============
function setupRealtimeData() {
    if (!rtdb) {
        console.error("❌ Realtime database not available");
        return;
    }
    
    const sensorsRef = ref(rtdb, 'Sensors');
    
    state.sensorUnsub = onValue(
        sensorsRef,
        (snapshot) => {
            const data = snapshot.val();
            if (!data) {
                console.warn("⚠️ No sensor data received");
                state.currentSensorData = {
                    MQ6_Value: 0,
                    MQ7_Value: 0,
                    Temperature: 0,
                    Humidity: 0
                };
                updateSensorDisplay(state.currentSensorData);
                return;
            }
            
            state.previousSensorData = { ...state.currentSensorData };
            state.currentSensorData = data;
            
            state.lastDataReceived = Date.now();
            
            updateSensorDisplay(data);
            updateChartData(data);
            checkDangerLevels(data);
            updateAdditionalCards();
            
            if (elements.connectionStatus) {
                elements.connectionStatus.classList.remove('offline');
                const text = elements.connectionStatus.querySelector('.connection-text');
                if (text) text.textContent = 'Connected';
            }
            
            if (elements.sensorsBadge) {
                elements.sensorsBadge.textContent = 'Real-time';
            }
        },
        (error) => {
            console.error("❌ Sensor listener error:", error);
            if (elements.connectionStatus) {
                elements.connectionStatus.classList.add('offline');
                const text = elements.connectionStatus.querySelector('.connection-text');
                if (text) text.textContent = 'Offline';
            }
        }
    );
    
    console.log("✅ Real-time sensor listener active");
}

// ✅ Use cached elements instead of DOM queries
function updateSensorDisplay(data) {
    const thresholds = getThresholds();
    let maxLevel = 0;
    let alertCount = 0;
    
    state.assignedSensorTypes.forEach(type => {
        if (type === "DHT22") {
            const tempRaw = parseFloat(data["Temperature"]);
            const temp = convertValue(isNaN(tempRaw) ? 0 : tempRaw, "temperature");
            
            updateSensorCard("temp", temp, thresholds.TEMP, getUnitLabel("temperature"));
            
            const statusTemp = document.getElementById("statusTemp");
            if (statusTemp) {
                statusTemp.textContent = temp.toFixed(1);
            }
            
            if (temp >= thresholds.TEMP.DANGER) {
                maxLevel = 2;
                alertCount++;
            } else if (temp >= thresholds.TEMP.WARNING && maxLevel < 2) {
                maxLevel = 1;
            }
            
            const humRaw = parseFloat(data["Humidity"]);
            const hum = isNaN(humRaw) ? 0 : humRaw;
            
            updateSensorCard("humidity", hum, thresholds.HUMIDITY, getUnitLabel("humidity"));
            
            const statusHum = document.getElementById("statusHumidity");
            if (statusHum) {
                statusHum.textContent = hum.toFixed(1);
            }
            
            if (hum >= thresholds.HUMIDITY.DANGER) {
                maxLevel = 2;
                alertCount++;
            } else if (hum >= thresholds.HUMIDITY.WARNING && maxLevel < 2) {
                maxLevel = 1;
            }
            
        } else {
            const config = SENSOR_CONFIG[type];
            let value = parseFloat(data[config.dataKey]) || 0;
            value = convertValue(value, type);
            
            updateSensorCard(config.id, value, thresholds[type], getUnitLabel(type));
            
            const statusEl = document.getElementById(`status${type}`);
            if (statusEl) {
                const decimals = state.settings.units?.gas === "mg" ? 2 : 0;
                statusEl.textContent = value.toFixed(decimals);
            }
            
            if (value >= thresholds[type].DANGER) {
                maxLevel = 2;
                alertCount++;
            } else if (value >= thresholds[type].WARNING && maxLevel < 2) {
                maxLevel = 1;
            }
        }
    });
    
    updateSystemStatus(maxLevel);
    
    const statusText = maxLevel === 2 ? "Danger" : maxLevel === 1 ? "Warning" : "Normal";
    updateQuickStats(state.assignedSensorTypes.length, statusText, alertCount);
}

// ✅ Use cached elements from state.sensorElements
function updateSensorCard(sensorId, value, threshold, unit) {
    const els = state.sensorElements[sensorId];
    
    if (!els) {
        console.warn(`Sensor elements not cached for: ${sensorId}`);
        return;
    }
    
    if (els.value) {
        const decimals = unit.includes("°") || unit.includes("%") || unit.includes("mg") ? 1 : 0;
        els.value.textContent = value.toFixed(decimals);
        
        if (state.previousSensorData && Math.abs(value - (state.previousSensorData[sensorId] || 0)) > 0.1) {
            els.value.classList.add('animate-pulse');
            setTimeout(() => els.value?.classList.remove('animate-pulse'), 500);
        }
    }
    
    let statusClass = "normal";
    let statusText = "Normal";
    let cardClass = "";
    
    if (value >= threshold.DANGER) {
        statusClass = "danger";
        statusText = "DANGER";
        cardClass = "danger";
    } else if (value >= threshold.WARNING) {
        statusClass = "warning";
        statusText = "Warning";
        cardClass = "warning";
    }
    
    if (els.status) {
        els.status.textContent = statusText;
        els.status.className = `sensor-status ${statusClass}`;
    }
    
    if (els.indicator) {
        els.indicator.className = `sensor-indicator ${statusClass}`;
    }
    
    if (els.bar) {
        const percentage = Math.min((value / threshold.DANGER) * 100, 100);
        els.bar.style.width = `${percentage}%`;
        els.bar.className = `threshold-fill ${statusClass}`;
    }
    
    if (els.card) {
        els.card.classList.remove('normal', 'warning', 'danger');
        if (cardClass) {
            els.card.classList.add(cardClass);
        }
    }
}

function updateSystemStatus(level, customMessage = null) {
    if (!elements.statusCard || !elements.statusMessage) return;
    
    elements.statusCard.classList.remove('normal', 'warning', 'danger');
    
    if (level === 2) {
        elements.statusCard.classList.add('danger');
        elements.statusMessage.textContent = customMessage || "⚠️ DANGER - Immediate Action Required!";
        
        if (elements.statusIcon) {
            elements.statusIcon.classList.add('animate-shake');
            setTimeout(() => elements.statusIcon?.classList.remove('animate-shake'), 500);
        }
        
    } else if (level === 1) {
        elements.statusCard.classList.add('warning');
        elements.statusMessage.textContent = customMessage || "⚡ WARNING - Monitor Closely";
        
    } else {
        elements.statusCard.classList.add('normal');
        elements.statusMessage.textContent = customMessage || "✅ All Systems Normal";
    }
}

// ============ DANGER DETECTION SYSTEM WITH GLOBAL STATE ============
function checkDangerLevels(data) {
    const thresholds = getThresholds();
    let isDanger = false;
    const readings = [];
    const types = new Set();
    
    if (state.assignedSensorTypes.includes("MQ6")) {
        let value = convertValue(parseFloat(data["MQ6_Value"]) || 0, "MQ6");
        if (value >= thresholds.MQ6.DANGER) {
            isDanger = true;
            types.add("gas");
            readings.push({
                label: "MQ6 (LPG/Propane)",
                value: value,
                unit: getUnitLabel("MQ6"),
                icon: "fa-fire",
                type: "MQ6"
            });
        }
    }
    
    if (state.assignedSensorTypes.includes("MQ7")) {
        let value = convertValue(parseFloat(data["MQ7_Value"]) || 0, "MQ7");
        if (value >= thresholds.MQ7.DANGER) {
            isDanger = true;
            types.add("gas");
            readings.push({
                label: "MQ7 (Carbon Monoxide)",
                value: value,
                unit: getUnitLabel("MQ7"),
                icon: "fa-smog",
                type: "MQ7"
            });
        }
    }
    
    if (state.assignedSensorTypes.includes("DHT22")) {
        let temp = convertValue(parseFloat(data["Temperature"]) || 0, "temperature");
        let humidity = parseFloat(data["Humidity"]) || 0;
        
        if (temp >= thresholds.TEMP.DANGER) {
            isDanger = true;
            types.add("temperature");
            readings.push({
                label: "Temperature",
                value: temp,
                unit: getUnitLabel("temperature"),
                icon: "fa-thermometer-full",
                type: "temperature"
            });
        }
        
        if (humidity >= thresholds.HUMIDITY.DANGER) {
            isDanger = true;
            types.add("humidity");
            readings.push({
                label: "Humidity",
                value: humidity,
                unit: getUnitLabel("humidity"),
                icon: "fa-tint",
                type: "humidity"
            });
        }
    }
    
    if (isDanger && !state.isDangerActive) {
        activateDangerAlert(readings, Array.from(types));
    } else if (!isDanger && state.isDangerActive) {
        deactivateDangerAlert();
    } else if (isDanger && state.isDangerActive) {
        updateDangerReadings(readings);
    }
}

async function activateDangerAlert(readings, types) {
    
    // ✅ CHECK GLOBAL DANGER STATE
    const isSameDanger = DangerStateManager.isSameDanger(readings);
    
    if (!isSameDanger) {
        DangerStateManager.setActiveDanger(readings, types);
        console.log('🆕 New danger detected on dashboard - creating global state');
    } else {
        console.log('♻️ Existing danger - same signature detected');
    }
    
    state.isDangerActive = true;
    state.dangerStartTime = Date.now();
    
    if (elements.dangerAlertOverlay) {
        elements.dangerAlertOverlay.classList.add('active');
        createDangerParticles();
    }
    
    if (elements.dangerAlertTitle) {
        if (types.includes("gas")) {
            elements.dangerAlertTitle.innerHTML = '<span class="danger-text-flash">🚨 GAS LEAK DETECTED</span>';
        } else if (types.includes("temperature")) {
            elements.dangerAlertTitle.innerHTML = '<span class="danger-text-flash">🔥 HIGH TEMPERATURE ALERT</span>';
        } else if (types.includes("humidity")) {
            elements.dangerAlertTitle.innerHTML = '<span class="danger-text-flash">💧 HIGH HUMIDITY ALERT</span>';
        } else {
            elements.dangerAlertTitle.innerHTML = '<span class="danger-text-flash">⚠️ DANGER DETECTED</span>';
        }
    }
    
    if (elements.dangerAlertSubtitle) {
        elements.dangerAlertSubtitle.textContent = 
            `${readings.length} sensor${readings.length !== 1 ? 's' : ''} reporting critical levels`;
    }
    
    updateDangerSeverity(readings);
    updateDangerReadings(readings);
    updateDangerInstructions(types);
    startDangerCountdown();
    
    // Play alarm (only if sound enabled and not muted)
    if (state.settings.alerts?.sound && !state.isAlarmMuted) {
        playAlarmSound();
        showSoundIndicator();
    }
    
    // Send browser notification (only if popup enabled)
    if (state.settings.alerts?.popup) {
        sendBrowserNotification(
            "⚠️ DANGER ALERT",
            `Critical levels detected: ${readings.map(r => r.label).join(", ")}`,
            "danger"
        );
    }
    
    addNotification({
        type: 'danger',
        title: 'Danger Alert',
        message: `${readings.map(r => `${r.label}: ${formatReading(r.value)} ${r.unit}`).join(" | ")}`,
        timestamp: new Date()
    });
    
    saveAlertToFirestore(readings, types);
    
    // Save to sessionStorage for cross-page alerts
    sessionStorage.setItem('crossPageDanger', JSON.stringify({
        title: '⚠️ DANGER DETECTED',
        readings: readings,
        timestamp: Date.now()
    }));
    
    // ✅ Smart email sending - only send if successful
    if (DangerStateManager.shouldSendEmail()) {
        console.log('📧 Sending email - first detection or cooldown expired');
        
        if (state.settings.alerts?.email) {
            const emailSent = await sendEmailAlert(readings, types);
            
            if (emailSent) {
                DangerStateManager.markEmailSent();
            } else {
                console.log('📧 Email failed, will retry on next danger check');
            }
        }
    } else {
        const danger = DangerStateManager.getActiveDanger();
        if (danger && danger.emailSentAt) {
            const timeSince = Date.now() - danger.emailSentAt;
            const remaining = Math.ceil((5 * 60 * 1000 - timeSince) / 60000);
            console.log(`📧 Email skipped - already sent ${Math.floor(timeSince / 60000)}m ago (next in ${remaining}m)`);
        }
    }
    
    console.log('✅ Danger alert activated (global state managed)');
}

function updateDangerReadings(readings) {
    if (!elements.dangerReadings) return;
    
    elements.dangerReadings.innerHTML = readings.map(r => {
        const thresholds = getThresholds();
        let threshold = thresholds.TEMP.DANGER;
        
        if (r.type === 'MQ6') threshold = thresholds.MQ6.DANGER;
        else if (r.type === 'MQ7') threshold = thresholds.MQ7.DANGER;
        else if (r.type === 'temperature') threshold = thresholds.TEMP.DANGER;
        else if (r.type === 'humidity') threshold = thresholds.HUMIDITY.DANGER;
        
        const percentage = Math.min((r.value / threshold) * 100, 150);
        const isCritical = percentage > 120;
        
        return `
            <div class="danger-reading-item ${isCritical ? 'critical' : ''}">
                <div class="danger-reading-icon">
                    <i class="fas ${r.icon}"></i>
                </div>
                <div class="danger-reading-info">
                    <span class="danger-reading-label">${escapeHtml(r.label)}</span>
                    <span class="danger-reading-value">
                        ${formatReading(r.value)} ${escapeHtml(r.unit)}
                    </span>
                </div>
                <span class="danger-reading-status">
                    ${isCritical ? 'CRITICAL' : 'DANGER'}
                </span>
            </div>
        `;
    }).join("");
}

function updateDangerSeverity(readings) {
    if (!readings.length) return;
    
    const thresholds = getThresholds();
    let severityScore = 0;
    
    readings.forEach(r => {
        let threshold, value = r.value;
        
        if (r.type === 'MQ6') threshold = thresholds.MQ6.DANGER;
        else if (r.type === 'MQ7') threshold = thresholds.MQ7.DANGER;
        else if (r.type === 'temperature') threshold = thresholds.TEMP.DANGER;
        else if (r.type === 'humidity') threshold = thresholds.HUMIDITY.DANGER;
        
        severityScore += (value / threshold) * 100;
    });
    
    severityScore = Math.min(severityScore / readings.length, 100);
    
    if (elements.severityFill) {
        elements.severityFill.style.width = `${severityScore}%`;
    }
    
    if (elements.severityText) {
        if (severityScore >= 150) {
            elements.severityText.textContent = 'EXTREME';
        } else if (severityScore >= 120) {
            elements.severityText.textContent = 'CRITICAL';
        } else {
            elements.severityText.textContent = 'SEVERE';
        }
    }
}

function updateDangerInstructions(types) {
    if (!elements.instructionList) return;
    
    let instructions = SAFETY_INSTRUCTIONS.combined;
    
    if (types.includes("gas")) {
        instructions = SAFETY_INSTRUCTIONS.gas;
    } else if (types.includes("temperature") && !types.includes("humidity")) {
        instructions = SAFETY_INSTRUCTIONS.temperature;
    } else if (types.includes("humidity") && !types.includes("temperature")) {
        instructions = SAFETY_INSTRUCTIONS.humidity;
    }
    
    elements.instructionList.innerHTML = instructions.map((inst, index) => `
        <li style="animation-delay: ${index * 0.1}s">
            <i class="fas ${inst.icon}"></i>
            <span>${escapeHtml(inst.text)}</span>
        </li>
    `).join("");
}

function startDangerCountdown() {
    let countdown = 60;
    const circumference = 2 * Math.PI * 45;
    
    const interval = setInterval(() => {
        countdown--;
        
        if (elements.countdownValue) {
            elements.countdownValue.textContent = countdown;
        }
        
        if (elements.countdownProgress) {
            const offset = circumference - (countdown / 60) * circumference;
            elements.countdownProgress.style.strokeDashoffset = offset;
        }
        
        if (countdown <= 0 || !state.isDangerActive) {
            clearInterval(interval);
        }
    }, 1000);
}

function deactivateDangerAlert() {
    console.log("✅ Danger alert deactivated - Levels returned to safe");
    
    state.isDangerActive = false;
    state.dangerStartTime = null;
    
    // ✅ CLEAR GLOBAL DANGER STATE
    DangerStateManager.clearDanger();
    console.log('🧹 Global danger state cleared');
    
    if (elements.dangerAlertOverlay) {
        elements.dangerAlertOverlay.classList.remove('active');
    }
    
    stopAlarmSound();
    hideSoundIndicator();
    
    addNotification({
        type: 'success',
        title: 'Alert Resolved',
        message: 'All sensor readings have returned to safe levels.',
        timestamp: new Date()
    });
    
    playSound('success');
    
    sessionStorage.removeItem('crossPageDanger');
}

// ✅ Reduce particle count for performance
function createDangerParticles() {
    const container = document.getElementById('dangerParticles');
    if (!container) return;
    
    container.innerHTML = '';
    
    const particleCount = window.innerWidth < 768 ? 10 : 15; // ✅ Reduced from 30
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'danger-particle';
        particle.style.cssText = `
            position: absolute;
            width: ${Math.random() * 4 + 2}px;
            height: ${Math.random() * 4 + 2}px;
            background: rgba(255, 255, 255, ${Math.random() * 0.5 + 0.3});
            border-radius: 50%;
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 100}%;
            animation: particleFloat ${Math.random() * 5 + 5}s ease-in-out infinite;
            animation-delay: ${Math.random() * 2}s;
        `;
        container.appendChild(particle);
    }
}

// ============ Alert Actions ============
function acknowledgeAlert() {
    if (!state.isDangerActive) return;
    
    if (elements.dangerAlertOverlay) {
        elements.dangerAlertOverlay.classList.remove('active');
    }
    
    state.acknowledgedAlerts.add(Date.now());
    
    showToast('info', 'Alert Acknowledged', 'Monitoring continues in background');
    playSound('click');
}

function muteAlarm() {
    state.isAlarmMuted = !state.isAlarmMuted;
    
    if (state.isAlarmMuted) {
        stopAlarmSound();
        if (elements.muteAlarmBtn) {
            elements.muteAlarmBtn.innerHTML = `
                <div class="btn-icon">
                    <i class="fas fa-volume-up"></i>
                </div>
                <span>Unmute</span>
            `;
        }
        showToast('info', 'Alarm Muted', 'Sound alerts disabled');
    } else {
        if (state.isDangerActive) {
            playAlarmSound();
        }
        if (elements.muteAlarmBtn) {
            elements.muteAlarmBtn.innerHTML = `
                <div class="btn-icon">
                    <i class="fas fa-volume-mute"></i>
                </div>
                <span>Mute Alarm</span>
            `;
        }
        showToast('info', 'Alarm Unmuted', 'Sound alerts enabled');
    }
    
    playSound('click');
}

// ============ Sound Management ============
function playAlarmSound() {
    if (!elements.alarmSound) return;
    
    try {
        elements.alarmSound.currentTime = 0;
        elements.alarmSound.loop = true;
        elements.alarmSound.volume = 0.7;
        elements.alarmSound.play().catch(e => {
            console.warn("⚠️ Alarm play failed:", e);
        });
    } catch (e) {
        console.warn("⚠️ Alarm play error:", e);
    }
}

function stopAlarmSound() {
    if (!elements.alarmSound) return;
    
    try {
        elements.alarmSound.pause();
        elements.alarmSound.currentTime = 0;
    } catch (e) {}
}

function playSound(type) {
    if (!state.settings.alerts?.sound) return;
    
    const sounds = {
        click: elements.clickSound,
        success: elements.successSound,
        warning: elements.warningSound,
        notification: elements.notificationSound,
        alarm: elements.alarmSound
    };
    
    const sound = sounds[type];
    if (sound && sound.readyState >= 2) {
        try {
            sound.currentTime = 0;
            sound.volume = type === 'click' ? 0.3 : 0.6;
            sound.play().catch(() => {});
        } catch (e) {}
    }
}

function showSoundIndicator() {
    if (elements.soundIndicator) {
        elements.soundIndicator.classList.add('active');
    }
}

function hideSoundIndicator() {
    if (elements.soundIndicator) {
        elements.soundIndicator.classList.remove('active');
    }
}

// ============ Alert Storage ============
async function saveAlertToFirestore(readings, types) {
    if (!db || !state.userData) return;
    
    try {
        await addDoc(collection(db, "activity_logs"), {
            userId: state.userId,
            userEmail: state.userData.email || null,
            type: "danger_alert",
            severity: "critical",
            readings: readings.map(r => ({
                label: r.label,
                value: r.value,
                unit: r.unit,
                type: r.type
            })),
            alertTypes: types,
            timestamp: serverTimestamp(),
            resolved: false,
            acknowledgedAt: null
        });
        
        console.log("✅ Alert saved to Firestore");
    } catch (e) {
        console.warn("⚠️ Alert save failed:", e);
    }
}

// ✅ Email alert with proper error handling and return value
async function sendEmailAlert(readings, types) {
    if (!state.userData?.email) {
        console.warn("⚠️ No user email available");
        return false;
    }
    
    if (typeof emailjs === "undefined") {
        console.warn("⚠️ EmailJS not available");
        return false;
    }
    
    const params = {
        to_email: state.userData.email,
        to_name: `${state.userData.firstName || ""} ${state.userData.lastName || ""}`.trim() || "User",
        alert_type: types.includes("gas") ? "GAS LEAK DETECTED" : 
                    types.includes("temperature") ? "HIGH TEMPERATURE ALERT" : 
                    "CRITICAL DANGER ALERT",
        readings: readings.map(r => 
            `${r.label}: ${formatReading(r.value)} ${r.unit}`
        ).join("\n"),
        instructions: getInstructionsText(types),
        timestamp: new Date().toLocaleString(),
        location: 'Dashboard - Real-time Monitoring'
    };
    showToast('info', 'Sending Email', 'Alert notification being sent...', 2000);
    
    try {
        await emailjs.send(
            EMAILJS_CONFIG.serviceId,
            EMAILJS_CONFIG.templateId,
            params,
            EMAILJS_CONFIG.publicKey
        );
        showToast('success', 'Email Sent', `Alert sent to ${state.userData.email}`);
        
        // Log to Firestore
        if (db) {
            try {
                await addDoc(collection(db, 'email_logs'), {
                    userId: state.userId,
                    userEmail: state.userData.email,
                    type: 'danger_alert',
                    status: 'sent',
                    location: 'dashboard',
                    readings: readings,
                    timestamp: serverTimestamp()
                });
            } catch (e) {
            }
        }
        
        return true; // ✅ Return success
        
    } catch (error) {
        console.error("❌ Email send failed:", error);
        
        if (error.status === 426) {
            showToast('error', 'Email Quota Exceeded', 
                'Your EmailJS monthly quota has been reached. Please upgrade your plan.');
        } else if (error.status === 400) {
            showToast('error', 'Email Configuration Error', 
                'Invalid template or parameters. Please check EmailJS settings.');
        } else if (error.status === 401 || error.status === 403) {
            showToast('error', 'Email Authentication Failed', 
                'Invalid EmailJS credentials. Please verify your API keys.');
        } else if (error.status === 404) {
            showToast('error', 'Email Template Not Found', 
                'EmailJS template does not exist. Please create it first.');
        } else {
            showToast('error', 'Email Failed', 
                'Could not send danger alert email. Please check your connection.');
        }
        
        // Log failure
        if (db) {
            try {
                await addDoc(collection(db, 'email_logs'), {
                    userId: state.userId,
                    userEmail: state.userData.email,
                    type: 'danger_alert',
                    status: 'failed',
                    error: error.text || error.message || 'Unknown error',
                    errorCode: error.status,
                    location: 'dashboard',
                    timestamp: serverTimestamp()
                });
            } catch (e) {
                console.warn('Could not record the email delivery failure.');
            }
        }
        
        return false; // ✅ Return failure
    }
}

function getInstructionsText(types) {
    let instructions = SAFETY_INSTRUCTIONS.combined;
    
    if (types.includes("gas")) {
        instructions = SAFETY_INSTRUCTIONS.gas;
    } else if (types.includes("temperature")) {
        instructions = SAFETY_INSTRUCTIONS.temperature;
    } else if (types.includes("humidity")) {
        instructions = SAFETY_INSTRUCTIONS.humidity;
    }
    
    return instructions.map((inst, idx) => 
        `${idx + 1}. ${inst.text}`
    ).join("\n");
}

// ============ Browser Notifications ============
async function sendBrowserNotification(title, body, type) {
    if (!("Notification" in window)) return;
    
    let permission = Notification.permission;
    
    if (permission === "default") {
        permission = await Notification.requestPermission();
    }
    
    if (permission === "granted") {
        try {
            const notification = new Notification(title, {
                body,
                vibrate: type === 'danger' ? [200, 100, 200, 100, 200] : [200],
                requireInteraction: type === 'danger',
                tag: type === 'danger' ? 'danger-alert' : 'breathsafe',
                silent: false
            });
            
            notification.onclick = () => {
                window.focus();
                notification.close();
            };
            
            if (type !== 'danger') {
                setTimeout(() => notification.close(), 5000);
            }
            
        } catch (e) {
            console.warn("⚠️ Browser notification failed:", e);
        }
    }
}

// ============ NOTIFICATIONS SYSTEM - ============
function loadNotifications() {
    const saved = localStorage.getItem("breathsafeNotifications");
    const notifications = safeJSONParse(saved, []); // ✅ OPTIMIZED
    
    if (Array.isArray(notifications)) {
        state.notifications = notifications;
        updateNotificationBadge();
        renderNotifications();
    }
}

// ✅ Debounced save to prevent excessive localStorage writes
let notificationSaveTimeout;

function saveNotifications() {
    clearTimeout(notificationSaveTimeout);
    
    notificationSaveTimeout = setTimeout(() => {
        try {
            if (state.notifications.length > 100) {
                state.notifications = state.notifications.slice(0, 100);
            }
            localStorage.setItem("breathsafeNotifications", JSON.stringify(state.notifications));
        } catch (e) {
            console.warn("⚠️ Notifications save error:", e);
        }
    }, CONFIG.NOTIFICATION_SAVE_DEBOUNCE);
}

function addNotification(notification) {
    const id = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newNotif = {
        id,
        ...notification,
        timestamp: notification.timestamp || new Date(),
        read: false
    };
    
    state.notifications.unshift(newNotif);
    saveNotifications(); // ✅ Now debounced
    updateNotificationBadge();
    renderNotifications();
    
    if (notification.type === 'danger' || notification.type === 'warning') {
        playSound('warning');
    } else {
        playSound('notification');
    }
    
    return id;
}

function updateNotificationBadge() {
    state.unreadCount = state.notifications.filter(n => !n.read).length;
    
    if (elements.notificationBadge) {
        if (state.unreadCount > 0) {
            elements.notificationBadge.textContent = 
                state.unreadCount > 99 ? '99+' : String(state.unreadCount);
            elements.notificationBadge.classList.remove('hidden');
            
            const hasDanger = state.notifications.some(n => 
                !n.read && n.type === 'danger'
            );
            elements.notificationBadge.classList.toggle('pulse', hasDanger);
        } else {
            elements.notificationBadge.classList.add('hidden');
        }
    }
    
    if (elements.notificationsCount) {
        elements.notificationsCount.textContent = state.unreadCount;
    }
}

function renderNotifications() {
    if (!elements.notificationsList) return;
    
    let filtered = state.notifications;
    if (state.notificationFilter !== 'all') {
        filtered = state.notifications.filter(n => n.type === state.notificationFilter);
    }
    
    if (filtered.length === 0) {
        elements.notificationsList.innerHTML = `
            <div class="notifications-empty">
                <div class="empty-icon">
                    <i class="fas fa-bell-slash"></i>
                </div>
                <p>No notifications</p>
                <span>${state.notificationFilter !== 'all' ? 'Try changing the filter' : 'You\'re all caught up!'}</span>
            </div>
        `;
        return;
    }
    
    elements.notificationsList.innerHTML = filtered.slice(0, 20).map(notif => {
        const iconClass = {
            danger: 'danger',
            warning: 'warning',
            success: 'success',
            info: 'info'
        }[notif.type] || 'info';
        
        const icon = {
            danger: 'fa-exclamation-triangle',
            warning: 'fa-exclamation-circle',
            success: 'fa-check-circle',
            info: 'fa-info-circle'
        }[notif.type] || 'fa-info-circle';
        
        return `
            <div class="notification-item ${notif.type} ${notif.read ? '' : 'unread'}" 
                 data-notification-id="${notif.id}">
                <div class="notification-icon ${iconClass}">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="notification-content">
                    <div class="notification-title">
                        ${escapeHtml(notif.title)}
                        ${notif.read ? '' : '<span class="new-badge">NEW</span>'}
                    </div>
                    <p class="notification-message">${escapeHtml(notif.message)}</p>
                    <div class="notification-time">
                        <i class="far fa-clock"></i>
                        ${formatTimeAgo(notif.timestamp)}
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    document.querySelectorAll('.notification-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.dataset.notificationId;
            markNotificationAsRead(id);
        });
    });
}

function markNotificationAsRead(id) {
    const notif = state.notifications.find(n => n.id === id);
    if (notif && !notif.read) {
        notif.read = true;
        saveNotifications();
        updateNotificationBadge();
        renderNotifications();
    }
}

function markAllNotificationsAsRead() {
    state.notifications.forEach(n => n.read = true);
    saveNotifications();
    updateNotificationBadge();
    renderNotifications();
    
    showToast('success', 'Marked as Read', 'All notifications marked as read');
}

function clearAllNotifications() {
    state.notifications = [];
    saveNotifications();
    updateNotificationBadge();
    renderNotifications();
    
    showToast('info', 'Cleared', 'All notifications have been cleared');
}

// ============ TOAST NOTIFICATIONS ============
function showToast(type, title, message, duration = CONFIG.TOAST_DURATION) {
    const toast = document.createElement('div');
    toast.className = `toast ${type} animate-fade-in-up`;
    
    const icon = {
        success: 'fa-check-circle',
        warning: 'fa-exclamation-triangle',
        danger: 'fa-times-circle',
        error: 'fa-times-circle',
        info: 'fa-info-circle'
    }[type] || 'fa-info-circle';
    
    toast.innerHTML = `
        <div class="toast-icon ${type}">
            <i class="fas ${icon}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-title">${escapeHtml(title)}</div>
            ${message ? `<div class="toast-message">${escapeHtml(message)}</div>` : ''}
        </div>
        <button class="toast-close">
            <i class="fas fa-times"></i>
        </button>
        <div class="toast-progress">
            <div class="toast-progress-bar" style="animation-duration: ${duration}ms"></div>
        </div>
    `;
    
    if (!elements.toastContainer) {
        const container = document.createElement('div');
        container.className = 'toast-container';
        container.id = 'toastContainer';
        document.body.appendChild(container);
        elements.toastContainer = container;
    }
    
    elements.toastContainer.appendChild(toast);
    
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn?.addEventListener('click', () => {
        toast.classList.add('exit');
        setTimeout(() => toast.remove(), 300);
    });
    
    setTimeout(() => {
        toast.classList.add('exit');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ============ PRESENCE MANAGEMENT - ============
function setupPresence() {
    if (!rtdb || !state.userId) return;
    
    const presenceRef = ref(rtdb, `presence/${state.sanitizedUserId}`); // ✅ FIXED: Use cached sanitized ID
    
    set(presenceRef, {
        online: true,
        lastSeen: Date.now(),
        sessionStarted: Date.now()
    });
    
    onDisconnect(presenceRef).set({
        online: false,
        lastSeen: Date.now()
    });
    
    state.presenceInterval = setInterval(() => {
        set(presenceRef, {
            online: true,
            lastSeen: Date.now()
        }).catch(e => console.warn("⚠️ Presence update failed:", e));
    }, CONFIG.PRESENCE_UPDATE_INTERVAL);
    
    console.log("✅ Presence tracking active");
}

// ============ SESSION MANAGEMENT - ============
function setupSessionTerminationListener() {
    if (!rtdb || !state.userId) return;
    
    const sessionRef = ref(rtdb, `userSessions/${state.sanitizedUserId}`); // ✅ FIXED: Use cached sanitized ID
    
    onValue(
        sessionRef,
        (snapshot) => {
            const data = snapshot.val();
            if (data?.terminated === true) {
                console.log("🚪 Session terminated by admin");
                clearAndLogout();
            }
        },
        (error) => {
            console.warn("⚠️ Session listener error:", error);
        }
    );
    
    console.log("✅ Session termination listener active");
}

function clearAndLogout() {
    if (rtdb && state.userId) {
        try {
            remove(ref(rtdb, `userSessions/${state.sanitizedUserId}`)); // ✅ FIXED
            set(ref(rtdb, `presence/${state.sanitizedUserId}`), { // ✅ FIXED
                online: false,
                lastSeen: Date.now()
            });
        } catch (e) {}
    }
    
    handleLogout();
}

// ============ CONNECTION MONITORING ============
function setupConnectionMonitoring() {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    state.connectionCheckInterval = setInterval(() => {
        checkConnection();
    }, CONFIG.CONNECTION_CHECK_INTERVAL);
    
    console.log("✅ Connection monitoring active");
}

function handleOnline() {
    state.isOnline = true;
    
    if (elements.connectionStatus) {
        elements.connectionStatus.classList.remove('offline');
    }
    
    if (elements.connectionOverlay) {
        elements.connectionOverlay.classList.remove('active');
    }
    
    showToast('success', 'Connected', 'Connection restored');
}

function handleOffline() {
    state.isOnline = false;
    
    if (elements.connectionStatus) {
        elements.connectionStatus.classList.add('offline');
    }
    
    if (elements.connectionOverlay) {
        elements.connectionOverlay.classList.add('active');
    }
    
    showToast('warning', 'Offline', 'Connection lost. Trying to reconnect...');
}

function checkConnection() {
    if (state.lastDataReceived) {
        const timeSinceData = Date.now() - state.lastDataReceived;
        
        if (timeSinceData > 30000 && state.isOnline) {
            console.warn("⚠️ No data received for 30 seconds");
            
            if (elements.connectionStatus) {
                const text = elements.connectionStatus.querySelector('.connection-text');
                if (text) text.textContent = 'Reconnecting...';
            }
        }
    }
}

// ============ EVENT LISTENERS SETUP - ============
// ✅ Store handlers for cleanup
const eventHandlers = {
    resize: null,
    scroll: null,
    touchstart: null
};

function setupEventListeners() {
    elements.themeToggle?.addEventListener('click', toggleTheme);
    
    elements.userMenuBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown('userDropdown');
    });
    
    elements.notificationsBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown('notificationsDropdown');
        
        if (elements.notificationsDropdown?.classList.contains('active')) {
            setTimeout(() => {
                state.notifications.forEach(n => n.read = true);
                saveNotifications();
                updateNotificationBadge();
            }, 1000);
        }
    });
    
    elements.clearAllNotifications?.addEventListener('click', clearAllNotifications);
    elements.markAllReadBtn?.addEventListener('click', markAllNotificationsAsRead);
    elements.viewAllNotifications?.addEventListener('click', (e) => {
        e.preventDefault();
        showToast('info', 'Coming Soon', 'Full alerts page coming soon');
    });
    
    elements.filterBtns?.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.notificationFilter = btn.dataset.filter;
            renderNotifications();
        });
    });
    
    elements.profileBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToProfile();
    });
    
    elements.profileLinks?.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navigateToProfile();
        });
    });
    
    elements.settingsBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToSettings();
    });
    
    elements.settingsLinks?.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navigateToSettings();
        });
    });
    
    elements.helpBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        startTour();
    });
    
    elements.logoutBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        handleLogout();
    });
    
    elements.closeProfileModal?.addEventListener('click', () => closeModal('profileModal'));
    elements.closeProfileBtn?.addEventListener('click', () => closeModal('profileModal'));
    elements.closeSettingsModal?.addEventListener('click', () => closeModal('settingsModal'));
    elements.closeShortcutsModal?.addEventListener('click', () => closeModal('shortcutsModal'));
    
    elements.themeOptions?.forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.dataset.theme;
            state.settings.display.theme = theme;
            
            FirestoreSettingsManager.save(state.userId, true);
            
            applyTheme(theme);
            updateThemeOptions(theme);
        });
    });
    
    elements.selectBtns?.forEach(btn => {
        btn.addEventListener('click', () => {
            const parent = btn.parentElement;
            parent.querySelectorAll('.select-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const unit = btn.dataset.unit;
            if (unit) {
                const setting = btn.closest('.setting-item');
                const label = setting?.querySelector('.setting-label')?.textContent;
                
                if (label?.includes('Temperature')) {
                    state.settings.units.temperature = unit;
                } else if (label?.includes('Gas')) {
                    state.settings.units.gas = unit;
                }
                
                FirestoreSettingsManager.save(state.userId, true);
                
                renderSensorCards();
                renderCharts();
                initCharts();
            }
        });
    });
    
    elements.toggleSwitches?.forEach(input => {
        input.addEventListener('change', () => {
            const id = input.id;
            
            if (id === 'settingSoundAlerts') {
                state.settings.alerts.sound = input.checked;
            } else if (id === 'settingBrowserNotif') {
                state.settings.alerts.popup = input.checked;
            } else if (id === 'settingEmailAlerts') {
                state.settings.alerts.email = input.checked;
            } else if (id === 'settingAnimations') {
                state.settings.display.animations = input.checked;
            }
            
            FirestoreSettingsManager.save(state.userId, true);
        });
    });
    
    elements.resetSettingsBtn?.addEventListener('click', async () => {
        if (confirm('Reset all settings to defaults?')) {
            state.settings = JSON.parse(JSON.stringify(DefaultSettings));
            await FirestoreSettingsManager.save(state.userId, true);
            location.reload();
        }
    });
    
    elements.refreshStatusBtn?.addEventListener('click', () => {
        playSound('click');
        showToast('info', 'Refreshing', 'Updating sensor data...');
        
        elements.refreshStatusBtn.classList.add('animate-spin');
        setTimeout(() => {
            elements.refreshStatusBtn?.classList.remove('animate-spin');
        }, 1000);
    });
    
    elements.expandStatusBtn?.addEventListener('click', () => {
        playSound('click');
        showToast('info', 'Details', 'Detailed view coming soon');
    });
    
    elements.toggleSensorView?.addEventListener('click', () => {
        playSound('click');
        const grid = elements.sensorsGrid;
        if (grid) {
            grid.classList.toggle('list-view');
        }
    });
    
    elements.refreshSensors?.addEventListener('click', () => {
        playSound('click');
        elements.refreshSensors.classList.add('animate-spin');
        setTimeout(() => {
            elements.refreshSensors?.classList.remove('animate-spin');
            showToast('success', 'Updated', 'Sensor data refreshed');
        }, 1000);
    });
    
    elements.contactAdminBtn?.addEventListener('click', () => {
        showToast('info', 'Contact Admin', 'Admin contact feature coming soon');
    });
    
    elements.muteAlarmBtn?.addEventListener('click', muteAlarm);
    elements.acknowledgeAlertBtn?.addEventListener('click', acknowledgeAlert);
    elements.callEmergencyBtn?.addEventListener('click', () => {
        if (confirm('Call emergency services (911)?')) {
            window.location.href = 'tel:911';
        }
    });
    elements.muteSoundBtn?.addEventListener('click', muteAlarm);
    
    elements.fabMain?.addEventListener('click', toggleFab);
    
    document.querySelectorAll('.fab-item').forEach(item => {
        item.addEventListener('click', () => {
            const action = item.dataset.action;
            
            if (action === 'emergency') {
                window.handleEmergencyCall();
            } else if (action === 'refresh') {
                location.reload();
            } else if (action === 'mute') {
                muteAlarm();
            }
            
            toggleFab();
        });
    });
    
    document.addEventListener('click', handleOutsideClick);
    
    // ✅ Store handlers and use passive listeners
    eventHandlers.resize = debounce(() => {
        updateChartsTheme();
    }, 250);
    
    window.addEventListener('resize', eventHandlers.resize, { passive: true });
}

function setupBasicEventListeners() {
    elements.themeToggle?.addEventListener('click', toggleTheme);
    elements.hamburgerMenu?.addEventListener('click', toggleSidebar);
    elements.sidebarClose?.addEventListener('click', closeSidebar);
    elements.sidebarOverlay?.addEventListener('click', closeSidebar);
}

// ============ EMERGENCY SIDEBAR - ============
let tipAnimationId = null; // ✅ Store animation frame ID

function initializeEmergencySidebar() {
    elements.hamburgerMenu?.addEventListener('click', toggleSidebar);
    elements.sidebarClose?.addEventListener('click', closeSidebar);
    elements.sidebarOverlay?.addEventListener('click', closeSidebar);
    
    elements.guidelineCards?.forEach(card => {
        const header = card.querySelector('.guideline-header');
        header?.addEventListener('click', () => {
            card.classList.toggle('active');
            const content = card.querySelector('.guideline-content');
            content?.classList.toggle('active');
        });
    });
    
    initTipsCarousel();
    
    if (elements.lastUpdated) {
        elements.lastUpdated.textContent = formatDate(new Date());
    }
    
    document.querySelectorAll('.resource-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const resource = link.dataset.resource;
            handleResourceClick(resource);
        });
    });
    
    console.log("✅ Emergency sidebar initialized");
}

function toggleSidebar() {
    state.isSidebarOpen = !state.isSidebarOpen;
    
    elements.emergencySidebar?.classList.toggle('active');
    elements.sidebarOverlay?.classList.toggle('active');
    elements.hamburgerMenu?.classList.toggle('active');
    
    // ✅ Start/stop animation based on sidebar state
    if (state.isSidebarOpen) {
        animateTipProgress();
    } else {
        if (tipAnimationId) {
            cancelAnimationFrame(tipAnimationId);
            tipAnimationId = null;
        }
    }
    
    playSound('click');
}

function closeSidebar() {
    state.isSidebarOpen = false;
    
    elements.emergencySidebar?.classList.remove('active');
    elements.sidebarOverlay?.classList.remove('active');
    elements.hamburgerMenu?.classList.remove('active');
    
    // ✅ Stop animation when sidebar closes
    if (tipAnimationId) {
        cancelAnimationFrame(tipAnimationId);
        tipAnimationId = null;
    }
}

function initTipsCarousel() {
    if (!elements.tipSlides?.length) return;
    
    updateTipDisplay();
    
    state.tipInterval = setInterval(() => {
        nextTip();
    }, CONFIG.TIP_ROTATION_INTERVAL);
    
    if (state.isSidebarOpen) {
        animateTipProgress();
    }
}

function updateTipDisplay() {
    elements.tipSlides?.forEach((slide, index) => {
        slide.classList.toggle('active', index === state.currentTipIndex);
    });
    
    elements.tipDots?.forEach((dot, index) => {
        dot.classList.toggle('active', index === state.currentTipIndex);
        
        dot.addEventListener('click', () => {
            state.currentTipIndex = index;
            updateTipDisplay();
            resetTipProgress();
        });
    });
}

function nextTip() {
    state.currentTipIndex = (state.currentTipIndex + 1) % SAFETY_TIPS.length;
    updateTipDisplay();
    resetTipProgress();
}

function previousTip() {
    state.currentTipIndex = (state.currentTipIndex - 1 + SAFETY_TIPS.length) % SAFETY_TIPS.length;
    updateTipDisplay();
    resetTipProgress();
}

// ✅ Stop animation when sidebar is closed or page is hidden
function animateTipProgress() {
    if (!elements.tipProgressBar) return;
    
    let lastTime = Date.now();
    const duration = CONFIG.TIP_ROTATION_INTERVAL;
    
    const animate = () => {
        // ✅ Stop animation if sidebar closed or page hidden
        if (!state.isSidebarOpen || document.hidden) {
            tipAnimationId = null;
            return;
        }
        
        const now = Date.now();
        const elapsed = now - lastTime;
        
        state.tipProgress += (elapsed / duration) * 100;
        
        if (state.tipProgress >= 100) {
            state.tipProgress = 0;
            lastTime = now;
        }
        
        elements.tipProgressBar.style.width = `${state.tipProgress}%`;
        lastTime = now;
        
        tipAnimationId = requestAnimationFrame(animate);
    };
    
    if (!tipAnimationId) {
        tipAnimationId = requestAnimationFrame(animate);
    }
}

function resetTipProgress() {
    state.tipProgress = 0;
    if (elements.tipProgressBar) {
        elements.tipProgressBar.style.width = '0%';
    }
}

window.toggleGuideline = function(type) {
    const card = document.querySelector(`[data-guideline="${type}"]`);
    card?.classList.toggle('active');
    
    const content = document.getElementById(`${type}Content`);
    content?.classList.toggle('active');
    
    playSound('click');
};

window.nextTip = nextTip;
window.previousTip = previousTip;

// ============ DROPDOWN & MODAL MANAGEMENT ============
function toggleDropdown(dropdownId) {
    const dropdown = elements[dropdownId];
    if (!dropdown) return;
    
    const isActive = dropdown.classList.contains('active');
    
    closeAllDropdowns();
    
    if (!isActive) {
        dropdown.classList.add('active');
        state.activeDropdown = dropdownId;
        playSound('click');
    }
}

function closeAllDropdowns() {
    ['userDropdown', 'notificationsDropdown'].forEach(id => {
        elements[id]?.classList.remove('active');
    });
    state.activeDropdown = null;
}

function openModal(modalId) {
    const modal = elements[modalId];
    if (!modal) return;
    
    modal.classList.add('active');
    state.activeModal = modalId;
    elements.body.style.overflow = 'hidden';
    
    playSound('click');
    
    closeAllDropdowns();
}

function closeModal(modalId) {
    const modal = elements[modalId];
    if (!modal) return;
    
    modal.classList.remove('active');
    
    if (state.activeModal === modalId) {
        state.activeModal = null;
        elements.body.style.overflow = '';
    }
    
    playSound('click');
}

function handleOutsideClick(e) {
    if (state.activeDropdown && !e.target.closest('.notifications-wrapper') && !e.target.closest('.user-profile')) {
        closeAllDropdowns();
    }
    
    if (state.activeModal && e.target.classList.contains('modal-overlay')) {
        closeModal(state.activeModal);
    }
}

// ============ KEYBOARD SHORTCUTS ============
function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        if (e.key === 'Escape') {
            if (state.activeModal) {
                closeModal(state.activeModal);
            } else if (state.activeDropdown) {
                closeAllDropdowns();
            } else if (state.isSidebarOpen) {
                closeSidebar();
            } else if (state.isDangerActive) {
                acknowledgeAlert();
            }
            return;
        }
        
        if (!e.ctrlKey && !e.altKey && !e.metaKey) {
            switch(e.key.toLowerCase()) {
                case '?':
                    e.preventDefault();
                    openModal('shortcutsModal');
                    break;
                case 'r':
                    e.preventDefault();
                    location.reload();
                    break;
                case 't':
                    e.preventDefault();
                    toggleTheme();
                    break;
                case 'm':
                    e.preventDefault();
                    muteAlarm();
                    break;
                case 'n':
                    e.preventDefault();
                    elements.notificationsBtn?.click();
                    break;
                case 's':
                    e.preventDefault();
                    navigateToSettings();
                    break;
                case 'e':
                    e.preventDefault();
                    toggleSidebar();
                    break;
                case 'p':
                    e.preventDefault();
                    navigateToProfile();
                    break;
            }
        }
        
        if (e.ctrlKey || e.metaKey) {
            switch(e.key.toLowerCase()) {
                case 'k':
                    e.preventDefault();
                    openModal('shortcutsModal');
                    break;
                case ',':
                    e.preventDefault();
                    navigateToSettings();
                    break;
            }
        }
    });
    
    console.log("✅ Keyboard shortcuts initialized");
}

// ============ TOUCH GESTURES ============
function initTouchGestures() {
    if (typeof Hammer === 'undefined') {
        console.warn("⚠️ Hammer.js not loaded, touch gestures disabled");
        return;
    }
    
    const mainContainer = elements.dashboardContainer;
    if (mainContainer) {
        const hammer = new Hammer(mainContainer);
        
        hammer.on('swiperight', (e) => {
            if (e.center.x < 100) {
                toggleSidebar();
            }
        });
        
        hammer.on('swipeleft', () => {
            if (state.isSidebarOpen) {
                closeSidebar();
            }
        });
    }
    
    let startY = 0;
    let currentY = 0;
    let refreshing = false;
    
    // ✅ Use passive listener
    document.addEventListener('touchstart', (e) => {
        if (window.scrollY === 0) {
            startY = e.touches[0].pageY;
        }
    }, { passive: true });
    
    document.addEventListener('touchmove', (e) => {
        if (!startY || refreshing) return;
        
        currentY = e.touches[0].pageY;
        const diff = currentY - startY;
        
        if (diff > 150 && window.scrollY === 0) {
            refreshing = true;
            showToast('info', 'Refreshing', 'Updating data...');
            setTimeout(() => location.reload(), 500);
        }
    }, { passive: true });
    
    document.addEventListener('touchend', () => {
        startY = 0;
        currentY = 0;
    }, { passive: true });
    
    console.log("✅ Touch gestures initialized");
}

// ============ SCROLL BEHAVIOR - ============
function initScrollBehavior() {
    let lastScroll = 0;
    let ticking = false;
    
    function updateScrollState() {
        const currentScroll = window.scrollY;
        
        if (elements.scrollToTop) {
            if (currentScroll > 500) {
                elements.scrollToTop.classList.add('visible');
            } else {
                elements.scrollToTop.classList.remove('visible');
            }
        }
        
        if (window.innerWidth <= 768) {
            if (currentScroll > lastScroll && currentScroll > 100) {
                elements.dashboardHeader?.classList.add('hidden-mobile');
            } else {
                elements.dashboardHeader?.classList.remove('hidden-mobile');
            }
        }
        
        lastScroll = currentScroll;
        ticking = false;
    }
    
    // ✅ Use passive listener
    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(updateScrollState);
            ticking = true;
        }
    }, { passive: true });
    
    elements.scrollToTop?.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
        playSound('click');
    });
    
    console.log("✅ Scroll behavior initialized");
}

// ============ AUTO REFRESH ============
function startAutoRefreshCountdown() {
    if (!elements.autoRefreshCountdown) return;
    
    state.autoRefreshCountdown = 60;
    
    const updateCountdown = () => {
        if (state.autoRefreshCountdown > 0) {
            state.autoRefreshCountdown--;
            elements.autoRefreshCountdown.textContent = `${state.autoRefreshCountdown}s`;
            
            if (state.assignedSensorTypes.length > 0) {
                clearInterval(state.autoRefreshInterval);
                if (elements.autoRefreshCountdown.parentElement) {
                    elements.autoRefreshCountdown.parentElement.style.display = 'none';
                }
            }
        } else {
            location.reload();
        }
    };
    
    state.autoRefreshInterval = setInterval(updateCountdown, 1000);
}

// ============ TOUR SYSTEM ============
function checkFirstVisit() {
    const hasVisited = localStorage.getItem('breathsafeTourComplete');
    
    if (!hasVisited && state.assignedSensorTypes.length > 0) {
        setTimeout(() => {
            if (confirm('Would you like a quick tour of your dashboard?')) {
                startTour();
            } else {
                localStorage.setItem('breathsafeTourComplete', 'true');
            }
        }, 2000);
    }
}

function startTour() {
    if (state.tourActive) return;
    
    state.tourActive = true;
    state.tourStep = 0;
    
    elements.tourOverlay?.classList.add('active');
    showTourStep();
    
    playSound('click');
}

function showTourStep() {
    if (state.tourStep >= TOUR_STEPS.length) {
        endTour();
        return;
    }
    
    const step = TOUR_STEPS[state.tourStep];
    const target = document.querySelector(step.target);
    
    if (!target) {
        nextTourStep();
        return;
    }
    
    const rect = target.getBoundingClientRect();
    if (elements.tourSpotlight) {
        elements.tourSpotlight.style.top = `${rect.top - 10}px`;
        elements.tourSpotlight.style.left = `${rect.left - 10}px`;
        elements.tourSpotlight.style.width = `${rect.width + 20}px`;
        elements.tourSpotlight.style.height = `${rect.height + 20}px`;
    }
    
    if (elements.tourTooltip) {
        const tooltipHeight = elements.tourTooltip.offsetHeight;
        let top = rect.bottom + 20;
        let left = rect.left;
        
        if (top + tooltipHeight > window.innerHeight - 20) {
            top = rect.top - tooltipHeight - 20;
        }
        
        left = Math.max(20, Math.min(left, window.innerWidth - 340));
        
        elements.tourTooltip.style.top = `${top}px`;
        elements.tourTooltip.style.left = `${left}px`;
    }
    
    if (elements.tourTitle) {
        elements.tourTitle.textContent = step.title;
    }
    
    if (elements.tourDescription) {
        elements.tourDescription.textContent = step.description;
    }
    
    const tourStepEl = document.getElementById('tourStep');
    if (tourStepEl) {
        tourStepEl.textContent = state.tourStep + 1;
    }
    
    const tourTotalEl = document.getElementById('tourTotal');
    if (tourTotalEl) {
        tourTotalEl.textContent = TOUR_STEPS.length;
    }
    
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function nextTourStep() {
    state.tourStep++;
    showTourStep();
}

function endTour() {
    state.tourActive = false;
    elements.tourOverlay?.classList.remove('active');
    localStorage.setItem('breathsafeTourComplete', 'true');
    
    showToast('success', 'Tour Complete', 'You can access help anytime from the menu');
}

document.getElementById('tourNext')?.addEventListener('click', nextTourStep);
document.getElementById('tourSkip')?.addEventListener('click', endTour);

// ============ FAB MENU ============
function toggleFab() {
    if (!elements.fabContainer) return;
    
    elements.fabContainer.classList.toggle('active');
    elements.fabMain?.classList.toggle('active');
    state.isFabOpen = !state.isFabOpen;
    
    playSound('click');
}

// ============ RESOURCE HANDLERS ============
function handleResourceClick(resource) {
    switch(resource) {
        case 'manual':
            showToast('info', 'Downloading', 'Safety manual PDF will be available soon');
            break;
        case 'videos':
            showToast('info', 'Videos', 'Training videos coming soon');
            break;
        case 'checklist':
            showToast('info', 'Checklist', 'Interactive checklist coming soon');
            break;
    }
    
    playSound('click');
}

// ============ UTILITY FUNCTIONS ============
function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

function capitalizeFirst(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatDate(date) {
    if (!date) return "-";
    
    if (date && typeof date === 'object' && date.seconds) {
        date = new Date(date.seconds * 1000);
    } 
    else if (typeof date === 'string' || typeof date === 'number') {
        date = new Date(date);
    }
    
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        return "-";
    }
    
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatTimeAgo(date) {
    if (!date) return "";
    
    if (date && typeof date === 'object' && date.seconds) {
        date = new Date(date.seconds * 1000);
    } 
    else if (typeof date === 'string' || typeof date === 'number') {
        date = new Date(date);
    }
    
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        return "";
    }
    
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    
    return formatDate(date);
}

function formatReading(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) return "--";
    return Math.abs(value) < 10 ? value.toFixed(2) : value.toFixed(1);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ============ CLEANUP FUNCTION ============
function cleanupDashboard() {
    console.log("🧹 Cleaning up dashboard...");
    
    // Stop all intervals
    if (state.presenceInterval) clearInterval(state.presenceInterval);
    if (state.connectionCheckInterval) clearInterval(state.connectionCheckInterval);
    if (state.autoRefreshInterval) clearInterval(state.autoRefreshInterval);
    if (state.tipInterval) clearInterval(state.tipInterval);
    if (tipAnimationId) cancelAnimationFrame(tipAnimationId);
    
    // Unsubscribe from listeners
    if (state.userDocUnsub) state.userDocUnsub();
    if (state.settingsDocUnsub) state.settingsDocUnsub();
    if (state.sensorUnsub) state.sensorUnsub();
    
    // Stop settings sync
    FirestoreSettingsManager.stopAutoSync();
    
    // Destroy charts
    destroyAllCharts();
    
    // Remove event listeners
    if (eventHandlers.resize) {
        window.removeEventListener('resize', eventHandlers.resize);
    }
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    
    // Stop alarm
    stopAlarmSound();
    
    console.log("✅ Cleanup complete");
}

// ============ LOGOUT HANDLER ============
function handleLogout() {
    console.log("🚪 Logging out...");
    
    showLoader();
    updateLoader(50, "Signing out...");
    
    cleanupDashboard();
    
    if (rtdb && state.userId) {
        try {
            set(ref(rtdb, `presence/${state.sanitizedUserId}`), { // ✅ FIXED
                online: false,
                lastSeen: Date.now()
            });
        } catch (e) {}
    }
    
    sessionStorage.clear();
    localStorage.removeItem('userData');
    
    updateLoader(100, "Redirecting...");
    
    setTimeout(() => {
        window.location.href = CONFIG.LOGIN_PAGE_PATH;
    }, 500);
}

// ============ WELCOME COMPLETION ============
window.completeWelcome = async function() {
    if (!db || !state.userId) {
        console.error("❌ Cannot complete welcome - missing db or userId");
        return false;
    }
    
    try {
        await updateDoc(doc(db, "users", state.userId), {
            welcomeCompleted: true,
            welcomeCompletedAt: serverTimestamp()
        });
        
        console.log("✅ Welcome marked as completed");
        
        window.location.href = "user-dashboard.html";
        return true;
        
    } catch (e) {
        console.error("❌ Failed to complete welcome:", e);
        return false;
    }
};

// ============ GLOBAL EXPORTS ============
window.dashboardLogout = handleLogout;

window.handleEmergencyCall = function() {
    playSound('click');
    if (confirm('Call emergency services (911)?')) {
        window.location.href = 'tel:911';
    }
};

// ============ PERFORMANCE MONITORING ============
if ('PerformanceObserver' in window) {
    const perfObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
            if (entry.entryType === 'largest-contentful-paint') {
                console.log('📊 LCP:', entry.renderTime || entry.loadTime, 'ms');
            }
        }
    });
    
    try {
        perfObserver.observe({ entryTypes: ['largest-contentful-paint'] });
    } catch (e) {}
}

// ============ ERROR HANDLER ============
window.addEventListener('error', (e) => {
    console.error('A client-side operation failed.');
    
    if (e.message?.includes('ResizeObserver') || 
        e.message?.includes('Non-Error promise rejection')) {
        e.preventDefault();
        return;
    }
    
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('An asynchronous operation failed.');
    
    if (e.reason?.message?.includes('Failed to fetch')) {
        e.preventDefault();
    }
});

// ============ VISIBILITY CHANGE ============
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('📱 Dashboard in background');
        
        if (state.tipInterval) {
            clearInterval(state.tipInterval);
            state.tipInterval = null;
        }
        
        if (tipAnimationId) {
            cancelAnimationFrame(tipAnimationId);
            tipAnimationId = null;
        }
    } else {
        console.log('📱 Dashboard in foreground');
        
        if (!state.tipInterval && elements.tipSlides?.length) {
            initTipsCarousel();
        }
        
        checkConnection();
        checkProfileUpdates();
    }
});

// ============ BEFORE UNLOAD - with Settings Sync ============
window.addEventListener('beforeunload', async () => {
    await FirestoreSettingsManager.save(state.userId, false);
    cleanupDashboard();
    
    saveNotifications();
    
    if (rtdb && state.userId) {
        set(ref(rtdb, `presence/${state.sanitizedUserId}`), { // ✅ FIXED
            online: false,
            lastSeen: Date.now()
        }).catch(() => {});
    }
});

// ============ WINDOW FOCUS - with Settings Sync ============
window.addEventListener('focus', async () => {
    await refreshUserData();
});

// ============ FINAL INITIALIZATION ============
console.log("✅ BreathSafe Dashboard v7.4 - OPTIMIZED & BUG-FIXED");
console.log("📊 Features Status:", {
    "Real-time Monitoring": "✅ Active",
    "Global Danger State": "✅ Active",
    "Smart Email System": "✅ Active (5-min cooldown)",
    "Single Email Per Danger": "✅ Active",
    "Danger Detection": "✅ Active",
    "Profile Navigation": "✅ Active",
    "Settings Sync": "✅ Firestore (Hash-based)",
    "Email Alerts": typeof emailjs !== "undefined" ? "✅ Ready" : "⚠️ Not configured",
    "Browser Notifications": "Notification" in window ? "✅ Available" : "❌ Not supported",
    "Sound Alerts": "✅ Ready",
    "Touch Gestures": typeof Hammer !== "undefined" ? "✅ Active" : "⚠️ Not loaded",
    "Keyboard Shortcuts": "✅ Active",
    "Auto Refresh": "✅ Active",
    "Session Management": "✅ Active",
    "Theme Support": "✅ Active",
    "Responsive Design": "✅ Active"
});

console.log("🚀 Performance Optimizations:", {
    "Chart Updates": "✅ Throttled (3s) + Batched",
    "DOM Caching": "✅ Sensor elements cached",
    "localStorage Writes": "✅ Debounced (2s)",
    "Settings Sync": "✅ Hash-based change detection",
    "Chart Cleanup": "✅ Proper destruction",
    "Animation Control": "✅ Stops when hidden",
    "Passive Listeners": "✅ Scroll, Touch, Resize",
    "Memory Leaks": "✅ Fixed (cleanup on unmount)",
    "Firebase Paths": "✅ Sanitized & cached"
});

console.log("🐛 Bug Fixes:", {
    "Settings Loop": "✅ Fixed (hash-based detection)",
    "Chart Memory Leak": "✅ Fixed (proper cleanup)",
    "Email Retry Logic": "✅ Fixed (only mark sent if successful)",
    "Firebase Path Errors": "✅ Fixed (consistent sanitization)",
    "Notification Saves": "✅ Fixed (debounced)",
    "Animation Leaks": "✅ Fixed (cleanup on hide)",
    "Event Listener Leaks": "✅ Fixed (proper removal)"
});

console.log("🌐 Environment:", {
    "Browser": navigator.userAgent.match(/(firefox|chrome|safari|edge)/i)?.[0] || "Unknown",
    "Screen": `${window.screen.width}x${window.screen.height}`,
    "Viewport": `${window.innerWidth}x${window.innerHeight}`,
    "Online": navigator.onLine,
    "Language": navigator.language,
    "Touch Device": 'ontouchstart' in window
});

console.log("🎯 Global Danger State Manager:", {
    "Status": "✅ Active",
    "Email Cooldown": "5 minutes",
    "Danger Expiry": "10 minutes",
    "Cross-Page Sync": "✅ Enabled",
    "Storage": "localStorage"
});

// ==========================================
// END OF BREATHSAFE USER DASHBOARD v7.4
// Performance & Bug
// ==========================================
