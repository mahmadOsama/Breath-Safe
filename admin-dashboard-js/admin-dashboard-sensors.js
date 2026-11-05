// ================================
// BREATHSAFE ADMIN DASHBOARD - SENSORS
// Real-time Sensor Monitoring & Charts with Alerts
// ================================

console.log(" BreathSafe Sensors Loading...");

// ========== FIREBASE CONFIG ==========
// This should already be correct, but double-check:
const realtimeConfig = {
    apiKey: "YOUR_FIREBASE_WEB_API_KEY",
    authDomain: "YOUR_FIREBASE_PROJECT_ID.firebaseapp.com",
    databaseURL: "https://YOUR_FIREBASE_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "YOUR_FIREBASE_PROJECT_ID",
    storageBucket: "YOUR_FIREBASE_PROJECT_ID.firebasestorage.app",
    messagingSenderId: "YOUR_FIREBASE_MESSAGING_SENDER_ID",
    appId: "YOUR_FIREBASE_APP_ID",
    measurementId: "YOUR_FIREBASE_MEASUREMENT_ID"
};

// ========== SENSOR THRESHOLDS ==========
const thresholds = {
    MQ6: { warning: 1500, danger: 2000 },
    MQ7: { warning: 1500, danger: 2000 },
    Temperature: { warning: 35, danger: 45 }, // °C
    Humidity: { warning: 70, danger: 85 }     // %
};

// ========== GLOBAL STATE ==========
let rtdb = null;
let sensorChart = null;
let chartPaused = false;
let previousSensorData = { 
    MQ6_Value: 0, 
    MQ7_Value: 0,
    Temperature: 0,
    Humidity: 0
};

const sensorHistory = {
    labels: [],
    mq6Data: [],
    mq7Data: [],
    maxPoints: 30
};

// ========== INITIALIZE REALTIME DB ==========
function initRealtimeDB() {
    try {
        const realtimeApp = firebase.initializeApp(realtimeConfig, "realtimeApp");
        rtdb = firebase.database(realtimeApp);
        
        // CRITICAL: Expose rtdb globally for Analytics
        window.rtdb = rtdb; 
        
        console.log(" Realtime DB Ready");
        return true;
    } catch (error) {
        console.error(" Realtime DB Error:", error);
        return false;
    }
}
// ========== GLOBAL VARIABLES FOR THROTTLING ==========
let lastActivityUpdate = 0;
let lastStatusStr = "";
// ========== LISTEN TO SENSOR DATA ==========
function listenToSensorData() {
    if (!rtdb) return;
    
    rtdb.ref('Sensors').on('value', snapshot => {
        const data = snapshot.val();
        if (data) {
            updateSensorDisplay(data);
            updateAirQuality(data); // This calculates status
            if (!chartPaused) updateChart(data);
            
            // Update "Last Update" text on dashboard card
            const lastUpdateEl = document.getElementById('cardLastUpdate');
            if (lastUpdateEl) lastUpdateEl.textContent = 'Just now';
        }
    });
}
// ========== UPDATE SENSOR DISPLAY ==========
function updateSensorDisplay(data) {
    const mq6 = data.MQ6_Value || 0;
    const mq7 = data.MQ7_Value || 0;
    const temperature = data.Temperature || 0;
    const humidity = data.Humidity || 0;

    const mq6ValueEl = document.getElementById('mq6Value');
    const mq7ValueEl = document.getElementById('mq7Value');
    const tempValueEl = document.getElementById('temperatureValue');
    const humidityValueEl = document.getElementById('humidityValue');

    if (mq6ValueEl) mq6ValueEl.textContent = mq6;
    if (mq7ValueEl) mq7ValueEl.textContent = mq7;
    if (tempValueEl) tempValueEl.textContent = temperature;
    if (humidityValueEl) humidityValueEl.textContent = humidity;

    // ===== UPDATE TREND ARROWS =====
    updateTrend('mq6Trend', mq6, previousSensorData.MQ6_Value);
    updateTrend('mq7Trend', mq7, previousSensorData.MQ7_Value);
    updateTrend('tempTrend', temperature, previousSensorData.Temperature);
    updateTrend('humidityTrend', humidity, previousSensorData.Humidity);

    previousSensorData = { MQ6_Value: mq6, MQ7_Value: mq7, Temperature: temperature, Humidity: humidity };
}

// ========== UPDATE TREND ARROWS ==========
function updateTrend(id, current, previous) {
    const el = document.getElementById(id);
    if (!el) return;
    
    if (current > previous) el.innerHTML = '<i class="fas fa-arrow-up" style="color: var(--danger);"></i>';
    else if (current < previous) el.innerHTML = '<i class="fas fa-arrow-down" style="color: var(--primary);"></i>';
    else el.innerHTML = '<i class="fas fa-minus" style="color: var(--muted);"></i>';
}

// ========== UPDATE AIR QUALITY WITH ACTIVITY LOG ==========
function updateAirQuality(data) {
    // ... (Keep your existing threshold logic for status calculation) ...
    
    const mq6 = data.MQ6_Value || 0;
    const mq7 = data.MQ7_Value || 0;
    const temperature = data.Temperature || 0;
    const humidity = data.Humidity || 0;

    // Thresholds (ensure these match your constants)
    // ...
    
    // Determine Status
    let status = 'normal';
    if (mq6 > 2000 || mq7 > 2000) status = 'danger';
    else if (mq6 > 1500 || mq7 > 1500) status = 'warning';

    // ... (Keep your existing UI updates for Orb/Text) ...

    // NEW: Update Activity Feed based on Status Change
    const currentStatusStr = status.charAt(0).toUpperCase() + status.slice(1);
    
    // Logic: Only add to activity log if status CHANGED or if it's a "Normal" check every few minutes
    const now = Date.now();
    
    if (window.ActivityManager) {
        // 1. Status Changed?
        if (lastStatusStr !== "" && lastStatusStr !== currentStatusStr) {
            const type = status === 'normal' ? 'system' : 'alert';
            window.ActivityManager.add(type, `System Status: ${currentStatusStr}`, 'Just now');
        }
        // 2. Periodic "Normal" check (e.g., every 2 minutes)
        else if (status === 'normal' && (now - lastActivityUpdate > 2 * 60 * 1000)) {
            window.ActivityManager.add('system', 'System Status: Normal', '2 minutes ago');
            lastActivityUpdate = now;
        }
    }
    
    lastStatusStr = currentStatusStr;
    
    // Update Quick Stats on Homepage
    const quickStatus = document.getElementById('quickSystemStatus');
    if (quickStatus) {
        quickStatus.textContent = currentStatusStr;
        quickStatus.className = `quick-stat-value ${status === 'normal' ? 'text-success' : 'text-danger'}`;
    }
}
// ========== INITIALIZE CHART ==========
function initializeChart() {
    const ctx = document.getElementById('sensorChart');
    if (!ctx) return;
    
    sensorChart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: sensorHistory.labels,
            datasets: [
                {
                    label: 'MQ6 (LPG)',
                    data: sensorHistory.mq6Data,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.08)',
                    borderWidth: 2.5,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHoverRadius: 5
                },
                {
                    label: 'MQ7 (CO)',
                    data: sensorHistory.mq7Data,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.08)',
                    borderWidth: 2.5,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHoverRadius: 5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'bottom', labels: { usePointStyle: true, padding: 15, font: { size: 12, weight: 600 } } }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });
}

// ========== UPDATE CHART ==========
function updateChart(data) {
    if (!sensorChart) return;
    
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    sensorHistory.labels.push(time);
    sensorHistory.mq6Data.push(data.MQ6_Value || 0);
    sensorHistory.mq7Data.push(data.MQ7_Value || 0);
    
    if (sensorHistory.labels.length > sensorHistory.maxPoints) {
        sensorHistory.labels.shift();
        sensorHistory.mq6Data.shift();
        sensorHistory.mq7Data.shift();
    }
    
    sensorChart.update('none');
}

// ========== TOGGLE CHART ==========
function toggleChart() {
    chartPaused = !chartPaused;
    const btn = document.getElementById('pauseChart');
    if (btn) btn.innerHTML = chartPaused ? '<i class="fas fa-play"></i>' : '<i class="fas fa-pause"></i>';
}

// ========== CLEAR CHART ==========
function clearChart() {
    sensorHistory.labels = [];
    sensorHistory.mq6Data = [];
    sensorHistory.mq7Data = [];
    if (sensorChart) sensorChart.update();
}

// ========== EVENT LISTENERS ==========
function setupSensorEventListeners() {
    const pauseChart = document.getElementById('pauseChart');
    const clearChartBtn = document.getElementById('clearChart');
    
    if (pauseChart) pauseChart.addEventListener('click', toggleChart);
    if (clearChartBtn) clearChartBtn.addEventListener('click', clearChart);
}

// ========== INITIALIZE SENSORS ==========
function initSensors() {
    console.log(" Sensors Initializing...");
    initRealtimeDB();
    setupSensorEventListeners();
    listenToSensorData();
    initializeChart();
    console.log(" Sensors Ready");
}

console.log(" BreathSafe Sensors Loaded");
