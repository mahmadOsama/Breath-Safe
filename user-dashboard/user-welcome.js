// ==========================================
// BREATHSAFE USER WELCOME - PREMIUM v3.0
// Complete Interactive Experience
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.5.0/firebase-app.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    updateDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-firestore.js";
import { 
    getDatabase, 
    ref, 
    set 
} from "https://www.gstatic.com/firebasejs/10.5.0/firebase-database.js";

// ==========================================
// FIREBASE CONFIGURATION
// ==========================================
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

// Initialize Firebase
let app = null;
let db = null;
let rtdb = null;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    rtdb = getDatabase(app);
    console.log('✅ Firebase initialized successfully');
} catch (error) {
    console.error('❌ Firebase initialization error:', error);
}

// ==========================================
// GLOBAL STATE
// ==========================================
const State = {
    currentStep: 1,
    totalSteps: 4,
    userData: null,
    assignedSensorTypes: [],
    hasSensors: false,
    selectedRoom: null,
    customRoomName: '',
    userLocation: null,
    locationGranted: false,
    autoRefreshTimer: null,
    soundEnabled: true,
    isTransitioning: false,
    particlesCreated: false
};

// ==========================================
// SOUND MANAGER
// ==========================================
const SoundManager = {
    sounds: {},
    
    init() {
        // Create audio context for better sound handling
        this.audioContext = null;
        
        // Preload sounds
        this.sounds = {
            click: document.getElementById('soundClick'),
            success: document.getElementById('soundSuccess'),
            error: document.getElementById('soundError')
        };
        
        // Create additional sounds programmatically
        this.createSounds();
    },
    
    createSounds() {
        // Create whoosh sound for transitions
        this.sounds.whoosh = this.createToneSound(400, 0.1, 'sine', 0.05);
        // Create pop sound for selections
        this.sounds.pop = this.createToneSound(600, 0.08, 'sine', 0.1);
        // Create complete sound
        this.sounds.complete = this.createToneSound(800, 0.2, 'sine', 0.15);
    },
    
    createToneSound(frequency, duration, type = 'sine', volume = 0.1) {
        // Create a simple oscillator-based sound
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.type = type;
        oscillator.frequency.value = frequency;
        gainNode.gain.value = volume;
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        return {
            play: () => {
                try {
                    const ctx = new (window.AudioContext || window.webkitAudioContext)();
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    
                    osc.type = type;
                    osc.frequency.value = frequency;
                    gain.gain.value = volume;
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
                    
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    
                    osc.start(ctx.currentTime);
                    osc.stop(ctx.currentTime + duration);
                } catch (e) {
                // Silently fail if audio not supported
                }
            }
        };
    },
    
    play(soundName) {
        if (!State.soundEnabled) return;
        
        try {
            const sound = this.sounds[soundName];
            if (sound) {
                if (sound.play) {
                    if (sound instanceof HTMLAudioElement) {
                        sound.currentTime = 0;
                        sound.volume = 0.3;
                        sound.play().catch(() => {});
                    } else {
                        sound.play();
                    }
                }
            }
        } catch (e) {
        // Silently fail
        }
    },
    
    playClick() {
        this.play('pop');
    },
    
    playSuccess() {
        this.play('complete');
    },
    
    playError() {
        this.play('error');
    },
    
    playTransition() {
        this.play('whoosh');
    }
};

// ==========================================
// PARTICLE SYSTEM
// ==========================================
const ParticleSystem = {
    particles: [],
    
    init() {
        this.createBackgroundParticles();
    },
    
    createBackgroundParticles() {
        const container = document.getElementById('particleField');
        if (!container || State.particlesCreated) return;
        
        const particleCount = window.innerWidth > 1024 ? 40 : 20;
        
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            
            const size = 2 + Math.random() * 4;
            const x = Math.random() * 100;
            const duration = 15 + Math.random() * 25;
            const delay = Math.random() * 15;
            
            particle.style.cssText = `
                width: ${size}px;
                height: ${size}px;
                left: ${x}%;
                top: ${100 + Math.random() * 20}%;
                opacity: ${0.2 + Math.random() * 0.4};
                animation: particleFloat ${duration}s linear ${delay}s infinite;
            `;
            
            container.appendChild(particle);
        }
        
        State.particlesCreated = true;
        
        // Add particle animation keyframes
        this.addParticleStyles();
    },
    
    addParticleStyles() {
        if (document.getElementById('particleStyles')) return;
        
        const style = document.createElement('style');
        style.id = 'particleStyles';
        style.textContent = `
            @keyframes particleFloat {
                0% {
                    transform: translateY(0) translateX(0) rotate(0deg);
                    opacity: 0;
                }
                10% {
                    opacity: 0.6;
                }
                90% {
                    opacity: 0.6;
                }
                100% {
                    transform: translateY(-120vh) translateX(${Math.random() > 0.5 ? '' : '-'}${20 + Math.random() * 30}px) rotate(360deg);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    },
    
    createCelebrationParticles() {
        const container = document.getElementById('celebrationParticles');
        if (!container) return;
        
        container.innerHTML = '';
        
        const colors = ['#10b981', '#34d399', '#fbbf24', '#f472b6', '#60a5fa', '#a78bfa'];
        const particleCount = 50;
        
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'celebration-particle';
            
            const color = colors[Math.floor(Math.random() * colors.length)];
            const size = 6 + Math.random() * 8;
            const x = 40 + Math.random() * 20;
            const duration = 1 + Math.random() * 2;
            const delay = Math.random() * 0.5;
            const angle = -60 + Math.random() * 120;
            const distance = 100 + Math.random() * 200;
            
            particle.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                background: ${color};
                border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
                left: ${x}%;
                top: 50%;
                transform: rotate(${Math.random() * 360}deg);
                animation: celebrationBurst ${duration}s ease-out ${delay}s forwards;
                --angle: ${angle}deg;
                --distance: ${distance}px;
            `;
            
            container.appendChild(particle);
        }
        
        // Add celebration animation if not exists
        if (!document.getElementById('celebrationStyles')) {
            const style = document.createElement('style');
            style.id = 'celebrationStyles';
            style.textContent = `
                @keyframes celebrationBurst {
                    0% {
                        transform: translate(0, 0) rotate(0deg) scale(1);
                        opacity: 1;
                    }
                    100% {
                        transform: translate(
                            calc(cos(var(--angle)) * var(--distance)),
                            calc(sin(var(--angle)) * var(--distance) - 100px)
                        ) rotate(720deg) scale(0);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }
    },
    
    createConfetti() {
        const container = document.getElementById('confettiBurst');
        if (!container) return;
        
        container.innerHTML = '';
        
        const colors = ['#10b981', '#34d399', '#fbbf24', '#f472b6', '#60a5fa', '#a78bfa', '#f87171'];
        
        for (let i = 0; i < 100; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti-piece';
            
            const color = colors[Math.floor(Math.random() * colors.length)];
            const x = Math.random() * 100;
            const delay = Math.random() * 0.5;
            const duration = 2 + Math.random() * 2;
            const rotation = Math.random() * 360;
            
            confetti.style.cssText = `
                left: ${x}%;
                top: -20px;
                background: ${color};
                width: ${5 + Math.random() * 10}px;
                height: ${5 + Math.random() * 10}px;
                border-radius: ${Math.random() > 0.5 ? '50%' : '0'};
                transform: rotate(${rotation}deg);
                animation: confettiFall ${duration}s ease-out ${delay}s forwards;
            `;
            
            container.appendChild(confetti);
        }
    }
};

// ==========================================
// LOADING MANAGER
// ==========================================
const LoadingManager = {
    show() {
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.classList.remove('hidden');
        }
    },
    
    hide() {
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            setTimeout(() => {
                loadingScreen.classList.add('hidden');
                document.body.classList.add('loaded');
            }, 2000); // Wait for loading animation to complete
        }
    }
};

// ==========================================
// TOAST NOTIFICATION SYSTEM
// ==========================================
const Toast = {
    container: null,
    
    init() {
        this.container = document.getElementById('toastContainer');
    },
    
    show(message, type = 'info', duration = 4000) {
        if (!this.container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-times-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        
        toast.innerHTML = `
            <div class="toast-icon">
                <i class="fas ${icons[type] || icons.info}"></i>
            </div>
            <span class="toast-message"></span>
            <button class="toast-close" aria-label="Close notification">
                <i class="fas fa-times"></i>
            </button>
        `;
        toast.querySelector('.toast-message').textContent = String(message ?? '');
        
        // Close button handler
        toast.querySelector('.toast-close').addEventListener('click', () => {
            this.dismiss(toast);
        });
        
        this.container.appendChild(toast);
        
        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });
        
        // Auto dismiss
        setTimeout(() => {
            this.dismiss(toast);
        }, duration);
        
        // Play sound based on type
        if (type === 'success') {
            SoundManager.playSuccess();
        } else if (type === 'error') {
            SoundManager.playError();
        }
        
        return toast;
    },
    
    dismiss(toast) {
        if (!toast) return;
        
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    },
    
    success(message) {
        return this.show(message, 'success');
    },
    
    error(message) {
        return this.show(message, 'error');
    },
    
    warning(message) {
        return this.show(message, 'warning');
    },
    
    info(message) {
        return this.show(message, 'info');
    }
};

// ==========================================
// PROGRESS MANAGER
// ==========================================
const ProgressManager = {
    update(step) {
        // Update desktop vertical progress
        this.updateVerticalProgress(step);
        
        // Update mobile progress bar
        this.updateMobileProgress(step);
        
        // Update progress fill
        this.updateProgressFill(step);
    },
    
    updateVerticalProgress(step) {
        const steps = document.querySelectorAll('.progress-step');
        
        steps.forEach((stepEl, index) => {
            const stepNum = index + 1;
            
            stepEl.classList.remove('active', 'completed');
            stepEl.removeAttribute('aria-current');
            
            if (stepNum < step) {
                stepEl.classList.add('completed');
            } else if (stepNum === step) {
                stepEl.classList.add('active');
                stepEl.setAttribute('aria-current', 'step');
            }
        });
    },
    
    updateMobileProgress(step) {
        const progressFill = document.getElementById('mobileProgressFill');
        const progressText = document.getElementById('mobileProgressText');
        
        if (progressFill) {
            const percentage = (step / State.totalSteps) * 100;
            progressFill.style.width = `${percentage}%`;
        }
        
        if (progressText) {
            progressText.textContent = `Step ${step} of ${State.totalSteps}`;
        }
    },
    
    updateProgressFill(step) {
        const verticalFill = document.getElementById('progressFillVertical');
        
        if (verticalFill) {
            const percentage = (step / State.totalSteps) * 100;
            verticalFill.style.height = `${percentage}%`;
        }
    }
};

// ==========================================
// ILLUSTRATION MANAGER
// ==========================================
const IllustrationManager = {
    currentScene: 1,
    
    switchTo(step) {
        if (this.currentScene === step) return;
        
        const scenes = document.querySelectorAll('.stage-scene');
        
        scenes.forEach(scene => {
            const sceneStep = parseInt(scene.dataset.step);
            
            if (sceneStep === step) {
                scene.classList.add('active');
                this.animateSceneIn(scene);
            } else {
                scene.classList.remove('active');
            }
        });
        
        this.currentScene = step;
    },
    
    animateSceneIn(scene) {
        const step = parseInt(scene.dataset.step);
        
        switch (step) {
            case 1:
                this.animateWelcomeScene(scene);
                break;
            case 2:
                this.animateLocationScene(scene);
                break;
            case 3:
                this.animateSensorsScene(scene);
                break;
            case 4:
                this.animateSuccessScene(scene);
                break;
        }
    },
    
    animateWelcomeScene(scene) {
        const floatingIcons = scene.querySelectorAll('.float-icon');
        floatingIcons.forEach((icon, index) => {
            icon.style.animationDelay = `${index * 0.5}s`;
        });
    },
    
    animateLocationScene(scene) {
        const pin = scene.querySelector('.location-pin');
        if (pin) {
            pin.style.animation = 'none';
            requestAnimationFrame(() => {
                pin.style.animation = '';
            });
        }
    },
    
    animateSensorsScene(scene) {
        const nodes = scene.querySelectorAll('.sensor-node');
        nodes.forEach((node, index) => {
            node.style.opacity = '0';
            node.style.transform = 'scale(0)';
            
            setTimeout(() => {
                node.style.transition = 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)';
                node.style.opacity = '1';
                node.style.transform = 'scale(1)';
            }, 200 + index * 150);
        });
    },
    
    animateSuccessScene(scene) {
        // Trigger celebration particles
        setTimeout(() => {
            ParticleSystem.createCelebrationParticles();
            ParticleSystem.createConfetti();
        }, 500);
    }
};

// ==========================================
// STEP NAVIGATION
// ==========================================
const StepNavigator = {
    async goTo(step) {
        if (State.isTransitioning) return;
        if (step < 1 || step > State.totalSteps) return;
        if (step === State.currentStep) return;
        
        State.isTransitioning = true;
        
        // Play transition sound
        SoundManager.playTransition();
        
        const currentStepEl = document.querySelector(`.content-step[data-step="${State.currentStep}"]`);
        const nextStepEl = document.querySelector(`.content-step[data-step="${step}"]`);
        
        if (!currentStepEl || !nextStepEl) {
            State.isTransitioning = false;
            return;
        }
        
        const direction = step > State.currentStep ? 1 : -1;
        
        // Animate out current step
        currentStepEl.style.animation = direction > 0 
            ? 'stepSlideOutLeft 0.4s ease forwards'
            : 'stepSlideOutRight 0.4s ease forwards';
        
        // Wait for animation
        await this.wait(350);
        
        // Hide current, show next
        currentStepEl.classList.remove('active');
        currentStepEl.style.animation = '';
        
        nextStepEl.classList.add('active');
        nextStepEl.style.animation = direction > 0
            ? 'stepSlideInRight 0.4s ease forwards'
            : 'stepSlideInLeft 0.4s ease forwards';
        
        // Update state
        State.currentStep = step;
        
        // Update progress indicators
        ProgressManager.update(step);
        
        // Switch illustration
        IllustrationManager.switchTo(step);
        
        // Scroll content to top
        const contentWrapper = document.getElementById('contentWrapper');
        if (contentWrapper) {
            contentWrapper.scrollTop = 0;
        }
        
        // Special handling for step 4
        if (step === 4) {
            this.onCompleteStep();
        }
        
        // Clear animation after complete
        await this.wait(400);
        nextStepEl.style.animation = '';
        
        State.isTransitioning = false;
    },
    
    next() {
        if (State.currentStep < State.totalSteps) {
            this.goTo(State.currentStep + 1);
        }
    },
    
    prev() {
        if (State.currentStep > 1) {
            this.goTo(State.currentStep - 1);
        }
    },
    
    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    
    onCompleteStep() {
        // Update summary
        SummaryManager.update();
        
        // Play success sound
        setTimeout(() => {
            SoundManager.playSuccess();
        }, 500);
    },
    
    addAnimationStyles() {
        if (document.getElementById('stepAnimationStyles')) return;
        
        const style = document.createElement('style');
        style.id = 'stepAnimationStyles';
        style.textContent = `
            @keyframes stepSlideOutLeft {
                from { opacity: 1; transform: translateX(0); }
                to { opacity: 0; transform: translateX(-50px); }
            }
            @keyframes stepSlideOutRight {
                from { opacity: 1; transform: translateX(0); }
                to { opacity: 0; transform: translateX(50px); }
            }
            @keyframes stepSlideInRight {
                from { opacity: 0; transform: translateX(50px); }
                to { opacity: 1; transform: translateX(0); }
            }
            @keyframes stepSlideInLeft {
                from { opacity: 0; transform: translateX(-50px); }
                to { opacity: 1; transform: translateX(0); }
            }
        `;
        document.head.appendChild(style);
    }
};


// ==========================================
// LOCATION MANAGER
// Multiple fallback methods for location detection
// ==========================================
const LocationManager = {
    // API endpoints for IP-based geolocation (free services)
    geoAPIs: [
        {
            name: 'ipapi',
            url: 'https://ipapi.co/json/',
            parse: (data) => ({
                latitude: data.latitude,
                longitude: data.longitude,
                accuracy: 5000, // City-level accuracy (~5km)
                city: data.city,
                region: data.region,
                country: data.country_name,
                source: 'IP Geolocation (ipapi)'
            })
        },
        {
            name: 'ip-api',
            url: 'http://ip-api.com/json/?fields=status,message,country,regionName,city,lat,lon',
            parse: (data) => {
                if (data.status === 'fail') throw new Error(data.message);
                return {
                    latitude: data.lat,
                    longitude: data.lon,
                    accuracy: 5000,
                    city: data.city,
                    region: data.regionName,
                    country: data.country,
                    source: 'IP Geolocation (ip-api)'
                };
            }
        },
        {
            name: 'ipwho',
            url: 'https://ipwho.is/',
            parse: (data) => {
                if (!data.success) throw new Error('Location lookup failed');
                return {
                    latitude: data.latitude,
                    longitude: data.longitude,
                    accuracy: 5000,
                    city: data.city,
                    region: data.region,
                    country: data.country,
                    source: 'IP Geolocation (ipwho)'
                };
            }
        },
        {
            name: 'geoplugin',
            url: 'http://www.geoplugin.net/json.gp',
            parse: (data) => {
                if (!data.geoplugin_latitude) throw new Error('No location data');
                return {
                    latitude: parseFloat(data.geoplugin_latitude),
                    longitude: parseFloat(data.geoplugin_longitude),
                    accuracy: 5000,
                    city: data.geoplugin_city,
                    region: data.geoplugin_region,
                    country: data.geoplugin_countryName,
                    source: 'IP Geolocation (geoplugin)'
                };
            }
        },
        {
            name: 'ipinfo',
            url: 'https://ipinfo.io/json',
            parse: (data) => {
                if (!data.loc) throw new Error('No location data');
                const [lat, lon] = data.loc.split(',');
                return {
                    latitude: parseFloat(lat),
                    longitude: parseFloat(lon),
                    accuracy: 5000,
                    city: data.city,
                    region: data.region,
                    country: data.country,
                    source: 'IP Geolocation (ipinfo)'
                };
            }
        }
    ],
    
    // Current attempt tracking
    currentAttempt: 0,
    maxBrowserAttempts: 2,
    locationMethod: null,
    
    // Main request function
    async requestLocation() {
        const locationBtn = document.getElementById('btnLocation');
        
        // Show loading state
        this.showState('loading');
        this.updateLoadingMessage('Detecting your location...');
        
        if (locationBtn) {
            locationBtn.disabled = true;
            locationBtn.innerHTML = `
                <span class="btn-content">
                    <div class="loading-spinner-sm" style="width:20px;height:20px;border-width:2px;"></div>
                    <span class="btn-text">Detecting...</span>
                </span>
            `;
        }
        
        // Try browser geolocation first
        const browserResult = await this.tryBrowserGeolocation();
        
        if (browserResult.success) {
            this.handleSuccess(browserResult.data, 'browser');
            return;
        }
        
        console.log('⚠️ Browser geolocation failed:', browserResult.error);
        this.updateLoadingMessage('Trying alternative methods...');
        
        // Try IP-based geolocation as fallback
        const ipResult = await this.tryIPGeolocation();
        
        if (ipResult.success) {
            this.handleSuccess(ipResult.data, 'ip');
            return;
        }
        
        console.log('⚠️ IP geolocation failed:', ipResult.error);
        
        // All methods failed
        this.handleError('Unable to detect location. You can skip this step.');
    },
    
    // Browser Geolocation API
    tryBrowserGeolocation() {
        return new Promise((resolve) => {
            // Check if geolocation is supported
            if (!navigator.geolocation) {
                resolve({ success: false, error: 'Geolocation not supported' });
                return;
            }
            
            // Set timeout for the entire operation
            const timeoutId = setTimeout(() => {
                resolve({ success: false, error: 'Browser geolocation timed out' });
            }, 10000);
            
            // Try high accuracy first
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    clearTimeout(timeoutId);
                    resolve({
                        success: true,
                        data: {
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                            accuracy: position.coords.accuracy,
                            source: 'Browser GPS'
                        }
                    });
                },
                (error) => {
                    // If high accuracy fails, try low accuracy
                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            clearTimeout(timeoutId);
                            resolve({
                                success: true,
                                data: {
                                    latitude: position.coords.latitude,
                                    longitude: position.coords.longitude,
                                    accuracy: position.coords.accuracy,
                                    source: 'Browser Location'
                                }
                            });
                        },
                        (error2) => {
                            clearTimeout(timeoutId);
                            resolve({ 
                                success: false, 
                                error: this.getBrowserErrorMessage(error2) 
                            });
                        },
                        {
                            enableHighAccuracy: false,
                            timeout: 5000,
                            maximumAge: 300000 // Accept cached position up to 5 minutes
                        }
                    );
                },
                {
                    enableHighAccuracy: true,
                    timeout: 5000,
                    maximumAge: 0
                }
            );
        });
    },
    
    // IP-based Geolocation (multiple providers)
    async tryIPGeolocation() {
        for (const api of this.geoAPIs) {
            try {
                console.log(`📍 Trying ${api.name}...`);
                this.updateLoadingMessage(`Trying ${api.name}...`);
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                
                const response = await fetch(api.url, {
                    signal: controller.signal,
                    headers: {
                        'Accept': 'application/json'
                    }
                });
                
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                const data = await response.json();
                const parsed = api.parse(data);
                
                if (parsed.latitude && parsed.longitude) {
                    console.log(`✅ ${api.name} succeeded`);
                    return { success: true, data: parsed };
                }
                
            } catch (error) {
                console.log(`❌ ${api.name} failed:`, error.message);
                continue;
            }
        }
        
        return { success: false, error: 'All IP geolocation services failed' };
    },
    
    // Handle successful location detection
    handleSuccess(locationData, method) {
        State.userLocation = {
            latitude: locationData.latitude,
            longitude: locationData.longitude,
            accuracy: locationData.accuracy,
            source: locationData.source,
            city: locationData.city || null,
            region: locationData.region || null,
            country: locationData.country || null
        };
        State.locationGranted = true;
        this.locationMethod = method;
        
        // Update UI with location details
        const latEl = document.getElementById('latValue');
        const lngEl = document.getElementById('lngValue');
        const accEl = document.getElementById('accValue');
        
        if (latEl) latEl.textContent = locationData.latitude.toFixed(6);
        if (lngEl) lngEl.textContent = locationData.longitude.toFixed(6);
        if (accEl) {
            if (locationData.accuracy >= 1000) {
                accEl.textContent = `~${(locationData.accuracy / 1000).toFixed(1)}km`;
            } else {
                accEl.textContent = `±${Math.round(locationData.accuracy)}m`;
            }
        }
        
        // Show success state
        this.showState('success');
        
        // Update the success message based on method
        this.updateSuccessMessage(locationData);
        
        // Update button to "Continue" - ONLY MANUAL ACTION
        const locationBtn = document.getElementById('btnLocation');
        if (locationBtn) {
            locationBtn.innerHTML = `
                <span class="btn-content">
                    <span class="btn-text">Continue</span>
                    <i class="fas fa-arrow-right btn-icon"></i>
                </span>
                <div class="btn-ripple"></div>
                <div class="btn-shine"></div>
            `;
            locationBtn.disabled = false;
            locationBtn.onclick = () => StepNavigator.next();
        }
        
        // Show appropriate toast
        if (method === 'browser') {
            Toast.success('Precise location captured!');
        } else {
            Toast.success(`Location detected via ${locationData.source}`);
        }
        
        SoundManager.playSuccess();
        
        // REMOVED AUTO-ADVANCE - User must click Continue button
    },
    
    // Handle location detection failure
    handleError(message) {
        State.locationGranted = false;
        
        const errorTitle = document.getElementById('locationErrorTitle');
        const errorMsg = document.getElementById('locationErrorMsg');
        
        if (errorTitle) errorTitle.textContent = 'Location Detection Failed';
        if (errorMsg) errorMsg.textContent = message;
        
        this.showState('error');
        
        // Update button to skip
        const locationBtn = document.getElementById('btnLocation');
        if (locationBtn) {
            locationBtn.innerHTML = `
                <span class="btn-content">
                    <span class="btn-text">Skip & Continue</span>
                    <i class="fas fa-arrow-right btn-icon"></i>
                </span>
                <div class="btn-ripple"></div>
            `;
            locationBtn.disabled = false;
            locationBtn.onclick = () => StepNavigator.next();
        }
        
        Toast.warning('Location skipped - you can enable it later in settings');
    },
    
    // Show specific state
    showState(state) {
        const states = ['Default', 'Loading', 'Success', 'Error'];
        
        states.forEach(s => {
            const el = document.getElementById(`location${s}`);
            if (el) {
                if (s.toLowerCase() === state) {
                    el.classList.remove('hidden');
                } else {
                    el.classList.add('hidden');
                }
            }
        });
        
        // Update card styling based on state
        const card = document.getElementById('locationCard');
        if (card) {
            card.className = 'location-card';
            if (state === 'success') {
                card.classList.add('location-success');
            } else if (state === 'error') {
                card.classList.add('location-error');
            }
        }
    },
    
    // Update loading message
    updateLoadingMessage(message) {
        const loadingState = document.getElementById('locationLoading');
        if (loadingState) {
            const contentEl = loadingState.querySelector('.state-content p');
            if (contentEl) {
                contentEl.textContent = message;
            }
        }
    },
    
    // Update success message with location details
    updateSuccessMessage(locationData) {
        const successState = document.getElementById('locationSuccess');
        if (!successState) return;
        
        const titleEl = successState.querySelector('.state-content h4');
        
        // Build location string
        let locationString = 'Location Captured!';
        
        if (locationData.city || locationData.region || locationData.country) {
            const parts = [];
            if (locationData.city) parts.push(locationData.city);
            if (locationData.region) parts.push(locationData.region);
            if (locationData.country) parts.push(locationData.country);
            locationString = parts.join(', ');
        }
        
        if (titleEl) {
            titleEl.textContent = locationString;
        }
        
        // Add source indicator
        const coordsDisplay = successState.querySelector('.coords-display');
        if (coordsDisplay && locationData.source) {
            // Check if source indicator already exists
            let sourceEl = coordsDisplay.querySelector('.location-source');
            if (!sourceEl) {
                sourceEl = document.createElement('div');
                sourceEl.className = 'location-source';
                coordsDisplay.appendChild(sourceEl);
            }
            
            // Determine icon based on source
            let icon = 'fa-globe';
            if (locationData.source.includes('GPS')) {
                icon = 'fa-satellite';
            } else if (locationData.source.includes('IP')) {
                icon = 'fa-network-wired';
            }
            
            sourceEl.innerHTML = `
                <i class="fas ${icon}"></i>
                <span>${locationData.source}</span>
            `;
        }
    },
    
    // Get browser error message
    getBrowserErrorMessage(error) {
        switch (error.code) {
            case error.PERMISSION_DENIED:
                return 'Location permission denied';
            case error.POSITION_UNAVAILABLE:
                return 'Location unavailable';
            case error.TIMEOUT:
                return 'Location request timed out';
            default:
                return 'Unknown location error';
        }
    },
    
    // Manual location entry (optional feature)
    enableManualEntry() {
        const errorState = document.getElementById('locationError');
        if (!errorState) return;
        
        const manualEntryHTML = `
            <div class="manual-location-entry">
                <p class="manual-hint">Or enter your location manually:</p>
                <div class="manual-inputs">
                    <div class="manual-input-group">
                        <label for="manualCity">City</label>
                        <input type="text" id="manualCity" placeholder="e.g., New York">
                    </div>
                    <div class="manual-input-group">
                        <label for="manualCountry">Country</label>
                        <input type="text" id="manualCountry" placeholder="e.g., USA">
                    </div>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" id="btnSaveManualLocation">
                    <i class="fas fa-save"></i>
                    <span>Save Location</span>
                </button>
            </div>
        `;
        
        // Add manual entry UI
        const existingManual = errorState.querySelector('.manual-location-entry');
        if (!existingManual) {
            errorState.insertAdjacentHTML('beforeend', manualEntryHTML);
            
            // Add handler
            document.getElementById('btnSaveManualLocation')?.addEventListener('click', () => {
                this.saveManualLocation();
            });
        }
    },
    
    // Save manual location
    saveManualLocation() {
        const city = document.getElementById('manualCity')?.value.trim();
        const country = document.getElementById('manualCountry')?.value.trim();
        
        if (!city && !country) {
            Toast.warning('Please enter at least a city or country');
            return;
        }
        
        State.userLocation = {
            latitude: null,
            longitude: null,
            accuracy: null,
            source: 'Manual Entry',
            city: city || null,
            country: country || null,
            manualEntry: true
        };
        State.locationGranted = true;
        
        Toast.success('Location saved!');
        StepNavigator.next();
    },
    
    // Retry location detection
    retry() {
        this.currentAttempt = 0;
        this.requestLocation();
    }
};
// ==========================================
// SENSOR MANAGER
// ==========================================
const SensorManager = {
    sensorInfo: {
        'MQ6': {
            name: 'MQ6 Sensor',
            description: 'LPG & Propane Gas Detection',
            icon: 'fa-fire',
            color: '#f59e0b'
        },
        'MQ7': {
            name: 'MQ7 Sensor',
            description: 'Carbon Monoxide Detection',
            icon: 'fa-smog',
            color: '#ec4899'
        },
        'DHT22': {
            name: 'DHT22 Sensor',
            description: 'Temperature & Humidity',
            icon: 'fa-thermometer-half',
            color: '#10b981'
        }
    },
    
    display() {
        const container = document.getElementById('sensorGrid');
        if (!container) return;
        
        if (!State.assignedSensorTypes || State.assignedSensorTypes.length === 0) {
            container.innerHTML = `
                <div class="no-sensors-message">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>No sensors assigned yet</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = State.assignedSensorTypes.map((type, index) => {
            const info = this.sensorInfo[type];
            if (!info) return '';
            
            return `
                <div class="sensor-card-item" data-sensor="${type}" style="animation-delay: ${index * 100}ms; --sensor-color: ${info.color}">
                    <div class="sensor-icon-wrap">
                        <i class="fas ${info.icon}"></i>
                    </div>
                    <div class="sensor-info">
                        <h4>${info.name}</h4>
                        <p>${info.description}</p>
                    </div>
                </div>
            `;
        }).join('');
        
        // Display feature announcement
        this.displayFeatureAnnouncement();
        
        // Animate sensor nodes in illustration
        this.highlightIllustrationNodes();
    },
    
    displayFeatureAnnouncement() {
        const container = document.getElementById('featureAnnouncement');
        if (!container) return;
        
        const hasAllSensors = 
            State.assignedSensorTypes.includes('MQ6') &&
            State.assignedSensorTypes.includes('MQ7') &&
            State.assignedSensorTypes.includes('DHT22');
        
        if (hasAllSensors) {
            container.className = 'feature-announcement full-feature';
            container.innerHTML = `
                <div class="announcement-icon">
                    <i class="fas fa-shield-alt"></i>
                </div>
                <h4 class="announcement-title">
                    <i class="fas fa-check-circle"></i>
                    Advanced Gas Detection
                    <span class="badge">Unlocked</span>
                </h4>
                <p class="announcement-description">
                    With all three sensors, you have access to our most advanced multi-sensor fusion technology.
                </p>
                <div class="feature-highlights">
                    <div class="highlight-item">
                        <i class="fas fa-bolt"></i>
                        <span>Real-time</span>
                    </div>
                    <div class="highlight-item">
                        <i class="fas fa-brain"></i>
                        <span>Smart Analysis</span>
                    </div>
                    <div class="highlight-item">
                        <i class="fas fa-bell"></i>
                        <span>Instant Alerts</span>
                    </div>
                </div>
            `;
        } else {
            const missingSensors = [];
            if (!State.assignedSensorTypes.includes('MQ6')) missingSensors.push('MQ6');
            if (!State.assignedSensorTypes.includes('MQ7')) missingSensors.push('MQ7');
            if (!State.assignedSensorTypes.includes('DHT22')) missingSensors.push('DHT22');
            
            container.className = 'feature-announcement upgrade-notice';
            container.innerHTML = `
                <div class="announcement-icon">
                    <i class="fas fa-arrow-up"></i>
                </div>
                <div class="announcement-text">
                    <h4 class="announcement-title">
                        <i class="fas fa-lightbulb"></i>
                        Upgrade Available
                    </h4>
                    <p class="announcement-description">
                        Add <strong>${missingSensors.join(', ')}</strong> for Advanced Detection.
                    </p>
                </div>
                <i class="fas fa-chevron-right upgrade-arrow"></i>
            `;
        }
        
        container.style.display = 'block';
    },
    
    highlightIllustrationNodes() {
        State.assignedSensorTypes.forEach(type => {
            const node = document.querySelector(`.sensor-node[data-sensor="${type}"]`);
            if (node) {
                node.classList.add('active');
            }
        });
    }
};
// ==========================================
// ROOM SELECTION MANAGER
// ==========================================
const RoomManager = {
    rooms: {
        'living-room': 'Living Room',
        'kitchen': 'Kitchen',
        'bedroom': 'Bedroom',
        'bathroom': 'Bathroom',
        'garage': 'Garage',
        'basement': 'Basement',
        'office': 'Office',
        'hallway': 'Hallway',
        'other': 'Other'
    },
    
    init() {
        const roomButtons = document.querySelectorAll('.room-btn');
        const customInput = document.getElementById('customLocationInput');
        
        roomButtons.forEach(btn => {
            btn.addEventListener('click', () => this.selectRoom(btn));
            
            // Keyboard support
            btn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.selectRoom(btn);
                }
            });
        });
        
        if (customInput) {
            customInput.addEventListener('input', (e) => this.handleCustomInput(e));
            customInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && State.customRoomName) {
                    e.preventDefault();
                    const continueBtn = document.getElementById('btnContinue3');
                    if (continueBtn && !continueBtn.disabled) {
                        continueBtn.click();
                    }
                }
            });
        }
    },
    
    selectRoom(btn) {
        const room = btn.dataset.room;
        const roomButtons = document.querySelectorAll('.room-btn');
        
        // Deselect all
        roomButtons.forEach(b => {
            b.classList.remove('selected');
            b.setAttribute('aria-checked', 'false');
        });
        
        // Select clicked
        btn.classList.add('selected');
        btn.setAttribute('aria-checked', 'true');
        
        State.selectedRoom = room;
        
        // Play sound
        SoundManager.playClick();
        
        // Handle custom input visibility
        const customInputWrap = document.getElementById('customInputWrap');
        const customInput = document.getElementById('customLocationInput');
        
        if (room === 'other') {
            if (customInputWrap) {
                customInputWrap.style.display = 'block';
                setTimeout(() => {
                    if (customInput) customInput.focus();
                }, 100);
            }
            State.customRoomName = customInput?.value.trim() || '';
        } else {
            if (customInputWrap) {
                customInputWrap.style.display = 'none';
            }
            State.customRoomName = '';
        }
        
        // Update UI
        this.updateSelectedDisplay();
        this.updateContinueButton();
        
        // Add ripple effect
        this.createRipple(btn);
    },
    
    handleCustomInput(e) {
        const value = e.target.value;
        State.customRoomName = value.trim();
        
        // Update character count
        const charCount = document.getElementById('charCount');
        if (charCount) {
            charCount.textContent = value.length;
        }
        
        this.updateSelectedDisplay();
        this.updateContinueButton();
    },
    
    updateSelectedDisplay() {
        const display = document.getElementById('selectedLocation');
        const nameEl = document.getElementById('selectedLocationName');
        
        if (!display || !nameEl) return;
        
        let displayName = '';
        
        if (State.selectedRoom === 'other') {
            displayName = State.customRoomName;
        } else if (State.selectedRoom) {
            displayName = this.rooms[State.selectedRoom] || State.selectedRoom;
        }
        
        if (displayName) {
            nameEl.textContent = displayName;
            display.style.display = 'flex';
        } else {
            display.style.display = 'none';
        }
    },
    
    updateContinueButton() {
        const btn = document.getElementById('btnContinue3');
        if (!btn) return;
        
        let isValid = false;
        
        if (State.selectedRoom === 'other') {
            isValid = State.customRoomName.length > 0;
        } else {
            isValid = !!State.selectedRoom;
        }
        
        btn.disabled = !isValid;
        
        // Add pulse effect when enabled
        if (isValid) {
            btn.classList.add('btn-glow');
        } else {
            btn.classList.remove('btn-glow');
        }
    },
    
    getSelectedRoomName() {
        if (State.selectedRoom === 'other') {
            return State.customRoomName;
        }
        return this.rooms[State.selectedRoom] || State.selectedRoom || 'Not specified';
    },
    
    createRipple(element) {
        const ripple = document.createElement('div');
        ripple.className = 'btn-ripple-effect';
        
        const rect = element.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        
        ripple.style.cssText = `
            position: absolute;
            width: ${size}px;
            height: ${size}px;
            background: rgba(16, 185, 129, 0.3);
            border-radius: 50%;
            transform: scale(0);
            animation: rippleEffect 0.6s ease-out forwards;
            pointer-events: none;
            left: 50%;
            top: 50%;
            margin-left: -${size / 2}px;
            margin-top: -${size / 2}px;
        `;
        
        element.style.position = 'relative';
        element.style.overflow = 'hidden';
        element.appendChild(ripple);
        
        setTimeout(() => ripple.remove(), 600);
    }
};

// Add ripple animation
const rippleStyle = document.createElement('style');
rippleStyle.textContent = `
    @keyframes rippleEffect {
        to {
            transform: scale(2);
            opacity: 0;
        }
    }
`;
document.head.appendChild(rippleStyle);

// ==========================================
// SUMMARY MANAGER
// ==========================================
const SummaryManager = {
    update() {
        this.updateLocation();
        this.updateRoom();
        this.updateSensors();
    },
    
    updateLocation() {
        const el = document.getElementById('summaryLocation');
        if (!el) return;
        
        if (State.locationGranted && State.userLocation) {
            el.textContent = 'Enabled';
            el.parentElement.parentElement.querySelector('.summary-status i').className = 'fas fa-check-circle';
        } else {
            el.textContent = 'Skipped';
            el.parentElement.parentElement.querySelector('.summary-status i').className = 'fas fa-minus';
        }
    },
    
    updateRoom() {
        const el = document.getElementById('summaryRoom');
        if (!el) return;
        
        el.textContent = RoomManager.getSelectedRoomName();
    },
    
    updateSensors() {
        const el = document.getElementById('summarySensors');
        if (!el) return;
        
        const count = State.assignedSensorTypes.length;
        el.textContent = `${count} sensor${count !== 1 ? 's' : ''} active`;
    }
};

// ==========================================
// WAITING STATE MANAGER
// ==========================================
const WaitingManager = {
    show() {
        const overlay = document.getElementById('waitingOverlay');
        const welcomeLayout = document.getElementById('welcomeLayout');
        const userNameEl = document.getElementById('waitingUserName');
        
        if (overlay) {
            overlay.style.display = 'flex';
        }
        
        if (welcomeLayout) {
            welcomeLayout.style.display = 'none';
        }
        
        if (userNameEl && State.userData) {
            userNameEl.textContent = State.userData.firstName || State.userData.username || 'User';
        }
        
        // Start auto-refresh
        this.startAutoRefresh();
    },
    
    hide() {
        const overlay = document.getElementById('waitingOverlay');
        const welcomeLayout = document.getElementById('welcomeLayout');
        
        if (overlay) {
            overlay.style.display = 'none';
        }
        
        if (welcomeLayout) {
            welcomeLayout.style.display = 'flex';
        }
        
        // Stop auto-refresh
        this.stopAutoRefresh();
    },
    
    startAutoRefresh() {
        this.stopAutoRefresh();
        
        State.autoRefreshTimer = setInterval(async () => {
            console.log('🔄 Auto-checking for sensors...');
            await this.checkForSensors(true);
        }, 10000);
    },
    
    stopAutoRefresh() {
        if (State.autoRefreshTimer) {
            clearInterval(State.autoRefreshTimer);
            State.autoRefreshTimer = null;
        }
    },
    
    async checkForSensors(silent = false) {
        const btn = document.getElementById('btnCheckSensors');
        
        if (btn && !silent) {
            btn.disabled = true;
            btn.innerHTML = `
                <div class="mini-spinner"></div>
                <span>Checking...</span>
            `;
        }
        
        try {
            if (!db || !State.userData?.id) {
                throw new Error('Database not available');
            }
            
            const userRef = doc(db, 'users', State.userData.id);
            const userSnap = await getDoc(userRef);
            
            if (userSnap.exists()) {
                const data = userSnap.data();
                const sensors = data.assignedSensorTypes || [];
                
                if (sensors.length > 0) {
                    // Sensors found!
                    this.stopAutoRefresh();
                    
                    State.assignedSensorTypes = sensors;
                    State.hasSensors = true;
                    
                    Toast.success('Sensors assigned! Continuing setup...');
                    SoundManager.playSuccess();
                    
                    // Reload to show welcome flow
                    setTimeout(() => {
                        window.location.reload();
                    }, 1500);
                    
                    return;
                }
            }
            
            if (!silent) {
                Toast.info('No sensors assigned yet. Please wait...');
            }
            
        } catch (error) {
            console.error('Check sensors error:', error);
            if (!silent) {
                Toast.error('Connection error. Please try again.');
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `
                    <i class="fas fa-sync-alt"></i>
                    <span>Check for Sensors</span>
                `;
            }
        }
    }
};

// ==========================================
// SETUP COMPLETION
// ==========================================
const SetupManager = {
    async complete() {
        const btn = document.getElementById('btnLaunch');
        
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `
                <span class="btn-content">
                    <div class="loading-spinner-sm" style="width:24px;height:24px;border-width:3px;border-color:rgba(255,255,255,0.3);border-top-color:white;"></div>
                    <span class="btn-text">Launching...</span>
                </span>
            `;
        }
        
        const roomName = RoomManager.getSelectedRoomName();
        
        try {
            if (!db) throw new Error('Database not connected');
            if (!State.userData?.id) throw new Error('User session invalid');
            
            // Build update data
            const updateData = {
                welcomeCompleted: true,
                setupCompletedAt: serverTimestamp(),
                sensorLocation: roomName,
                lastUpdated: serverTimestamp()
            };
            
            if (State.userLocation) {
                updateData.userLocation = {
                    latitude: State.userLocation.latitude,
                    longitude: State.userLocation.longitude,
                    accuracy: State.userLocation.accuracy
                };
            }
            
            // Update Firestore
            const userRef = doc(db, 'users', State.userData.id);
            await updateDoc(userRef, updateData);
            
            console.log('✅ Firestore updated successfully');
            
            // Update Realtime Database presence
            if (rtdb) {
                try {
                    const presenceRef = ref(rtdb, 'presence/' + State.userData.id);
                    await set(presenceRef, {
                        online: true,
                        lastSeen: Date.now(),
                        location: State.userLocation || null
                    });
                } catch (e) {
                    console.warn('RTDB update failed:', e);
                }
            }
            
            // Update local storage
            localStorage.setItem('hasSeenWelcome', 'true');
            localStorage.setItem('userSensorLocation', roomName);
            
            // Update session
            State.userData.welcomeCompleted = true;
            State.userData.sensorLocation = roomName;
            sessionStorage.setItem('breathsafeUser', JSON.stringify(State.userData));
            
            // Success feedback
            if (btn) {
                btn.innerHTML = `
                    <span class="btn-content">
                        <i class="fas fa-check btn-icon-left"></i>
                        <span class="btn-text">Success!</span>
                    </span>
                `;
                btn.classList.add('btn-success');
            }
            
            Toast.success('Setup complete! Launching dashboard...');
            SoundManager.playSuccess();
            
            // Redirect
            setTimeout(() => {
                window.location.href = 'user-dashboard.html';
            }, 1500);
            
        } catch (error) {
            console.error('❌ Setup completion error:', error);
            Toast.error('Error: ' + error.message);
            SoundManager.playError();
            
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `
                    <span class="btn-content">
                        <i class="fas fa-redo btn-icon-left"></i>
                        <span class="btn-text">Try Again</span>
                    </span>
                    <div class="btn-ripple"></div>
                `;
            }
        }
    }
};

// ==========================================
// BUTTON EFFECTS
// ==========================================
const ButtonEffects = {
    init() {
        // Add hover effects to all buttons
        document.querySelectorAll('.btn').forEach(btn => {
            btn.addEventListener('mouseenter', (e) => this.handleMouseEnter(e));
            btn.addEventListener('mouseleave', (e) => this.handleMouseLeave(e));
            btn.addEventListener('click', (e) => this.handleClick(e));
        });
        
        // Add hover effects to feature cards
        document.querySelectorAll('.feature-card').forEach(card => {
            card.addEventListener('mousemove', (e) => this.handleCardHover(e, card));
        });
    },
    
    handleMouseEnter(e) {
        const btn = e.currentTarget;
        if (btn.disabled) return;
        
        // Add subtle scale
        btn.style.transform = 'translateY(-2px)';
    },
    
    handleMouseLeave(e) {
        const btn = e.currentTarget;
        btn.style.transform = '';
    },
    
    handleClick(e) {
        const btn = e.currentTarget;
        if (btn.disabled) return;
        
        // Play click sound
        SoundManager.playClick();
        
        // Create ripple
        this.createRipple(e, btn);
    },
    
    createRipple(e, btn) {
        const rippleContainer = btn.querySelector('.btn-ripple');
        if (!rippleContainer) return;
        
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const ripple = document.createElement('span');
        ripple.className = 'ripple-circle';
        ripple.style.cssText = `
            position: absolute;
            width: 0;
            height: 0;
            background: rgba(255, 255, 255, 0.4);
            border-radius: 50%;
            transform: translate(-50%, -50%);
            left: ${x}px;
            top: ${y}px;
            animation: rippleExpand 0.6s ease-out forwards;
        `;
        
        rippleContainer.appendChild(ripple);
        
        setTimeout(() => ripple.remove(), 600);
    },
    
    handleCardHover(e, card) {
        const rect = card.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        
        card.style.setProperty('--mouse-x', `${x}%`);
        card.style.setProperty('--mouse-y', `${y}%`);
    }
};

// Add ripple expand animation
const rippleExpandStyle = document.createElement('style');
rippleExpandStyle.textContent = `
    @keyframes rippleExpand {
        to {
            width: 300px;
            height: 300px;
            opacity: 0;
        }
    }
`;
document.head.appendChild(rippleExpandStyle);

// ==========================================
// EVENT HANDLERS SETUP
// ==========================================
const EventHandlers = {
    init() {
        // Step 1: Get Started
        const btnStart = document.getElementById('btnStart');
        if (btnStart) {
            btnStart.addEventListener('click', () => StepNavigator.next());
        }
        
        // Step 2: Location
        const btnLocation = document.getElementById('btnLocation');
        if (btnLocation) {
            btnLocation.addEventListener('click', () => LocationManager.requestLocation());
        }
        
        const btnBack2 = document.getElementById('btnBack2');
        if (btnBack2) {
            btnBack2.addEventListener('click', () => StepNavigator.prev());
        }
        
        // Step 3: Sensors
        const btnContinue3 = document.getElementById('btnContinue3');
        if (btnContinue3) {
            btnContinue3.addEventListener('click', () => StepNavigator.next());
        }
        
        const btnBack3 = document.getElementById('btnBack3');
        if (btnBack3) {
            btnBack3.addEventListener('click', () => StepNavigator.prev());
        }
        
        // Step 4: Complete
        const btnLaunch = document.getElementById('btnLaunch');
        if (btnLaunch) {
            btnLaunch.addEventListener('click', () => SetupManager.complete());
        }
        
        // Waiting state
        const btnCheckSensors = document.getElementById('btnCheckSensors');
        if (btnCheckSensors) {
            btnCheckSensors.addEventListener('click', () => WaitingManager.checkForSensors(false));
        }
        
        // Help button
        const helpBtn = document.getElementById('helpBtn');
        if (helpBtn) {
            helpBtn.addEventListener('click', () => {
                Toast.info('Need help? Contact support@breathsafe.com');
            });
        }
        
        // Progress step clicks (desktop)
        document.querySelectorAll('.progress-step').forEach(step => {
            step.addEventListener('click', () => {
                const stepNum = parseInt(step.dataset.step);
                // Only allow going to completed or current steps
                if (stepNum <= State.currentStep) {
                    StepNavigator.goTo(stepNum);
                }
            });
        });
        
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            // Escape to go back
            if (e.key === 'Escape' && State.currentStep > 1) {
                StepNavigator.prev();
            }
        });
        
        // Visibility change - pause/resume auto-refresh
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                WaitingManager.stopAutoRefresh();
            } else if (!State.hasSensors && State.userData) {
                WaitingManager.startAutoRefresh();
            }
        });
        
        // Before unload - cleanup
        window.addEventListener('beforeunload', () => {
            WaitingManager.stopAutoRefresh();
        });
    }
};

// ==========================================
// INITIALIZATION
// ==========================================
async function initialize() {
    console.log('🚀 Initializing BreathSafe Welcome...');
    
    // Show loading screen
    LoadingManager.show();
    
    // Initialize components
    SoundManager.init();
    Toast.init();
    ParticleSystem.init();
    StepNavigator.addAnimationStyles();
    
    // Check user session
    const sessionData = sessionStorage.getItem('breathsafeUser');
    
    if (!sessionData) {
        console.error('❌ No user session found');
        Toast.error('Session expired. Redirecting to login...');
        setTimeout(() => {
            window.location.href = '../index.html';
        }, 2000);
        return;
    }
    
    try {
        State.userData = JSON.parse(sessionData);
    } catch (e) {
        console.error('❌ Session parse error');
        window.location.href = '../index.html';
        return;
    }
    
    // Update user name displays
    const userNameEls = document.querySelectorAll('.user-name-display, #userName');
    userNameEls.forEach(el => {
        if (el) {
            el.textContent = State.userData.firstName || State.userData.username || 'User';
        }
    });
    
    // Fetch user data from Firestore
    if (db && State.userData.id) {
        try {
            const userRef = doc(db, 'users', State.userData.id);
            const userSnap = await getDoc(userRef);
            
            if (userSnap.exists()) {
                const firestoreData = userSnap.data();
                console.log('📄 Firestore data loaded');
                
                // Get sensors
                State.assignedSensorTypes = firestoreData.assignedSensorTypes || [];
                State.hasSensors = State.assignedSensorTypes.length > 0;
                
                // Check status
                const userStatus = firestoreData.status || 'active';
                
                if (userStatus === 'pending') {
                    console.log('⏳ User pending activation');
                    Toast.warning('Account pending activation');
                    setTimeout(() => {
                        sessionStorage.clear();
                        window.location.href = '../index.html';
                    }, 2000);
                    return;
                }
                
                // Check if already completed
                if (firestoreData.welcomeCompleted === true && State.hasSensors) {
                    console.log('✅ Welcome already completed');
                    window.location.href = 'user-dashboard.html';
                    return;
                }
                
                // No sensors - show waiting state
                if (!State.hasSensors) {
                    console.log('⚠️ No sensors assigned');
                    LoadingManager.hide();
                    WaitingManager.show();
                    return;
                }
                
                console.log('🔧 Sensors found:', State.assignedSensorTypes);
                
            } else {
                console.warn('⚠️ User document not found');
                LoadingManager.hide();
                WaitingManager.show();
                return;
            }
            
        } catch (error) {
            console.error('❌ Firestore error:', error);
            Toast.error('Failed to load user data');
            return;
        }
    }
    
    // Initialize UI components
    RoomManager.init();
    EventHandlers.init();
    ButtonEffects.init();
    
    // Display sensors
    SensorManager.display();
    
    // Update progress
    ProgressManager.update(1);
    
    // Hide loading screen
    LoadingManager.hide();
    
    console.log('✅ Initialization complete!');
}

// ==========================================
// DOM READY
// ==========================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

// ==========================================
// GLOBAL EXPORTS (for debugging)
// ==========================================
window.BreathSafe = {
    State,
    StepNavigator,
    LocationManager,
    SensorManager,
    RoomManager,
    WaitingManager,
    SetupManager,
    Toast,
    SoundManager
};

console.log('✅ user-welcome.js v3.0 loaded');
