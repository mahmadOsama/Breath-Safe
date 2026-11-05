/* ==========================================
BREATHSAFE ADMIN PROFILE v3.0
High-Performance Profile Management
With Activity Logging Integration
========================================== */

(function() {
    'use strict';

    console.log('👤 AdminProfile v3.0 Loading...');

    // ========== FIREBASE CONFIG ==========
    const FIREBASE_CONFIG = {
        apiKey: "YOUR_FIREBASE_WEB_API_KEY",
        authDomain: "YOUR_FIREBASE_PROJECT_ID.firebaseapp.com",
        databaseURL: "https://YOUR_FIREBASE_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "YOUR_FIREBASE_PROJECT_ID",
        storageBucket: "YOUR_FIREBASE_PROJECT_ID.firebasestorage.app",
        messagingSenderId: "YOUR_FIREBASE_MESSAGING_SENDER_ID",
        appId: "YOUR_FIREBASE_APP_ID",
        measurementId: "YOUR_FIREBASE_MEASUREMENT_ID"
    };

    // ========== PERFORMANCE UTILITIES ==========
    const perf = {
        raf: (fn) => requestAnimationFrame(fn),
        
        debounce(fn, ms) {
            let timer;
            return function(...args) {
                clearTimeout(timer);
                timer = setTimeout(() => fn.apply(this, args), ms);
            };
        },
        
        throttle(fn, ms) {
            let last = 0;
            return function(...args) {
                const now = Date.now();
                if (now - last >= ms) {
                    last = now;
                    fn.apply(this, args);
                }
            };
        }
    };

    // ========== DOM UTILITIES ==========
    const DOM = {
        cache: new Map(),
        
        get(id) {
            if (!this.cache.has(id)) {
                this.cache.set(id, document.getElementById(id));
            }
            return this.cache.get(id);
        },
        
        clear() {
            this.cache.clear();
        },
        
        batch(updates) {
            perf.raf(() => {
                updates.forEach(fn => { try { fn(); } catch(e) {} });
            });
        }
    };

    // ========== STATE ==========
    const STATE = {
        db: null,
        currentAdmin: null,
        originalData: {},
        isEditMode: false,
        initialized: false,
        adminRole: 'regular'
    };

    // ========== AVATAR COLORS ==========
    const AVATAR_COLORS = {
        '#10b981': '#059669', '#3b82f6': '#2563eb', '#8b5cf6': '#7c3aed',
        '#ef4444': '#dc2626', '#f59e0b': '#d97706', '#ec4899': '#db2777',
        '#06b6d4': '#0891b2', '#eab308': '#ca8a04', '#374151': '#1f2937',
        '#64748b': '#475569', '#6366f1': '#4f46e5', '#14b8a6': '#0d9488'
    };

    // ========== SESSION CHECK ==========
    function checkSession() {
        const session = sessionStorage.getItem('breathsafeAdmin');
        
        if (!session) {
            window.location.href = './Login-codes/breathsafe-admin-login.html';
            return null;
        }
        
        try {
            const data = JSON.parse(session);
            if (!data.username || !data.id) {
                sessionStorage.removeItem('breathsafeAdmin');
                window.location.href = './Login-codes/breathsafe-admin-login.html';
                return null;
            }
            STATE.adminRole = data.role || 'regular';
            return data;
        } catch (e) {
            sessionStorage.removeItem('breathsafeAdmin');
            window.location.href = './Login-codes/breathsafe-admin-login.html';
            return null;
        }
    }

    // ========== UTILITIES ==========
    const Utils = {
        getInitials(user) {
            if (user.firstName && user.lastName) {
                return (user.firstName[0] + user.lastName[0]).toUpperCase();
            }
            return (user.username || 'AD').substring(0, 2).toUpperCase();
        },

        formatDate(timestamp) {
            if (!timestamp) return 'N/A';
            try {
                const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
                return date.toLocaleDateString('en-US', {
                    month: 'long', day: 'numeric', year: 'numeric'
                });
            } catch {
                return 'N/A';
            }
        },

        showToast: perf.debounce(function(message, type = 'info') {
            const toast = DOM.get('toast');
            if (!toast) return;
            
            DOM.batch([
                () => {
                    toast.textContent = message;
                    toast.className = `toast ${type}`;
                    toast.style.display = 'block';
                }
            ]);
            
            setTimeout(() => {
                DOM.batch([() => { toast.style.display = 'none'; }]);
            }, 4000);
        }, 100),

        clearError(fieldId) {
            DOM.batch([() => {
                const input = DOM.get(fieldId);
                const error = DOM.get(`${fieldId}Error`);
                if (input) input.classList.remove('error');
                if (error) { error.textContent = ''; error.style.display = 'none'; }
            }]);
        },

        showError(fieldId, message) {
            DOM.batch([() => {
                const input = DOM.get(fieldId);
                const error = DOM.get(`${fieldId}Error`);
                if (input) input.classList.add('error');
                if (error) { error.textContent = message; error.style.display = 'block'; }
            }]);
        },

        isValidEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
        isValidPhone: (phone) => !phone || /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/.test(phone),
        canEditUsername: () => STATE.adminRole === 'executive',
        
        getAvatarBackground(color, gradient) {
            if (!gradient) return color;
            const secondary = AVATAR_COLORS[color];
            return secondary ? `linear-gradient(135deg, ${color}, ${secondary})` : color;
        }
    };

    // ========== FIREBASE ==========
    const Firebase = {
        async init() {
            try {
                let app;
                try { app = firebase.app("profileApp"); } 
                catch { app = firebase.initializeApp(FIREBASE_CONFIG, "profileApp"); }
                STATE.db = firebase.firestore(app);
                return true;
            } catch (error) {
                console.error('Firebase init failed:', error);
                Utils.showToast('Database connection failed', 'error');
                return false;
            }
        }
    };

    // ========== PROFILE MANAGER ==========
    const Profile = {
        async load() {
            const session = checkSession();
            if (!session || !STATE.db) return;
            
            try {
                let adminDoc = null;
                
                if (session.id) {
                    adminDoc = await STATE.db.collection('admins').doc(session.id).get();
                }
                
                if (!adminDoc?.exists) {
                    const snapshot = await STATE.db.collection('admins')
                        .where('username', '==', session.username)
                        .limit(1).get();
                    if (!snapshot.empty) adminDoc = snapshot.docs[0];
                }
                
                if (!adminDoc?.exists) {
                    Utils.showToast('Account not found', 'error');
                    return;
                }
                
                STATE.currentAdmin = { id: adminDoc.id, ...adminDoc.data() };
                STATE.adminRole = STATE.currentAdmin.role || 'regular';
                STATE.originalData = { ...STATE.currentAdmin };
                
                // Update session
                const updatedSession = {
                    ...session,
                    id: STATE.currentAdmin.id,
                    username: STATE.currentAdmin.username,
                    email: STATE.currentAdmin.email,
                    firstName: STATE.currentAdmin.firstName || '',
                    lastName: STATE.currentAdmin.lastName || '',
                    phoneNumber: STATE.currentAdmin.phoneNumber || '',
                    role: STATE.currentAdmin.role || 'regular',
                    avatarIcon: STATE.currentAdmin.avatarIcon,
                    avatarBgColor: STATE.currentAdmin.avatarBgColor,
                    avatarBgGradient: STATE.currentAdmin.avatarBgGradient
                };
                sessionStorage.setItem('breathsafeAdmin', JSON.stringify(updatedSession));
                
                this.display();
                
                // Notify other modules
                if (window.SecurityModule?.reapplyProtection) {
                    window.SecurityModule.reapplyProtection();
                }
                
            } catch (error) {
                console.error('Profile load failed:', error);
                Utils.showToast('Failed to load profile', 'error');
            }
        },

        display: perf.throttle(function() {
            if (!STATE.currentAdmin) return;
            
            const admin = STATE.currentAdmin;
            const initials = Utils.getInitials(admin);
            const fullName = [admin.firstName, admin.lastName].filter(Boolean).join(' ') || admin.username || 'Admin';
            
            // Avatar config
            const avatarIcon = admin.avatarIcon || null;
            const avatarColor = admin.avatarBgColor || '#10b981';
            const avatarGradient = admin.avatarBgGradient !== false;
            const avatarBg = Utils.getAvatarBackground(avatarColor, avatarGradient);
            const avatarContent = avatarIcon ? `<i class="fas ${avatarIcon}"></i>` : `<span>${initials}</span>`;
            
            DOM.batch([
                // Update avatars
                () => {
                    ['headerAvatar', 'dropdownAvatar', 'profileAvatar'].forEach(id => {
                        const el = DOM.get(id);
                        if (el) {
                            el.className = `avatar${id === 'profileAvatar' ? ' avatar--large' : ''}${avatarIcon ? ' avatar--has-icon' : ''}`;
                            el.innerHTML = avatarContent;
                            el.style.background = avatarBg;
                        }
                    });
                },
                
                // Update text elements
                () => {
                    const elements = {
                        headerUsername: admin.username || 'Admin',
                        dropdownUsername: fullName,
                        dropdownEmail: admin.email || 'No email',
                        profileName: fullName,
                        profileEmail: admin.email || 'No email',
                        memberSince: Utils.formatDate(admin.createdAt),
                        apiTokenPreview: admin.apiToken ? admin.apiToken.substring(0, 3) + '-***-***' : '***-***-***'
                    };
                    
                    Object.entries(elements).forEach(([id, value]) => {
                        const el = DOM.get(id);
                        if (el) el.textContent = value;
                    });
                },
                
                // Fill form fields
                () => {
                    const fields = {
                        firstName: admin.firstName || '',
                        lastName: admin.lastName || '',
                        username: admin.username || '',
                        email: admin.email || '',
                        phoneNumber: admin.phoneNumber || ''
                    };
                    
                    Object.entries(fields).forEach(([id, value]) => {
                        const input = DOM.get(id);
                        if (input) input.value = value;
                    });
                }
            ]);
            
            // Notify avatar picker
            if (window.AvatarPicker?.refresh) {
                window.AvatarPicker.refresh();
            }
        }, 50),

        enterEditMode() {
            STATE.isEditMode = true;
            
            DOM.batch([
                () => {
                    const editableFields = ['firstName', 'lastName', 'email', 'phoneNumber'];
                    if (Utils.canEditUsername()) editableFields.push('username');
                    
                    editableFields.forEach(field => {
                        const input = DOM.get(field);
                        if (input) {
                            input.disabled = false;
                            input.classList.remove('username-locked');
                        }
                    });
                    
                    // Lock username for non-executive
                    if (!Utils.canEditUsername()) {
                        const usernameInput = DOM.get('username');
                        if (usernameInput) {
                            usernameInput.disabled = true;
                            usernameInput.classList.add('username-locked');
                        }
                    }
                    
                    const editBtn = DOM.get('editBtn');
                    const saveBtn = DOM.get('saveBtn');
                    const cancelBtn = DOM.get('cancelBtn');
                    const indicator = DOM.get('editIndicator');
                    
                    if (editBtn) editBtn.style.display = 'none';
                    if (saveBtn) saveBtn.style.display = 'inline-flex';
                    if (cancelBtn) cancelBtn.style.display = 'inline-flex';
                    if (indicator) indicator.style.display = 'flex';
                }
            ]);
            
            Utils.showToast('Edit mode activated', 'info');
        },

        cancelEditMode() {
            STATE.isEditMode = false;
            
            DOM.batch([
                () => {
                    ['firstName', 'lastName', 'username', 'email', 'phoneNumber'].forEach(field => {
                        const input = DOM.get(field);
                        if (input) {
                            input.disabled = true;
                            input.value = STATE.originalData[field] || '';
                        }
                        Utils.clearError(field);
                    });
                    
                    const editBtn = DOM.get('editBtn');
                    const saveBtn = DOM.get('saveBtn');
                    const cancelBtn = DOM.get('cancelBtn');
                    const indicator = DOM.get('editIndicator');
                    
                    if (editBtn) editBtn.style.display = 'inline-flex';
                    if (saveBtn) saveBtn.style.display = 'none';
                    if (cancelBtn) cancelBtn.style.display = 'none';
                    if (indicator) indicator.style.display = 'none';
                }
            ]);
            
            Utils.showToast('Changes cancelled', 'info');
        },

        async validate(data) {
            ['firstName', 'lastName', 'username', 'email', 'phoneNumber'].forEach(f => Utils.clearError(f));
            
            let hasError = false;
            
            if (!data.firstName?.trim()) { Utils.showError('firstName', 'First name is required'); hasError = true; }
            if (!data.lastName?.trim()) { Utils.showError('lastName', 'Last name is required'); hasError = true; }
            if (!data.username?.trim()) { Utils.showError('username', 'Username is required'); hasError = true; }
            if (!data.email?.trim()) { Utils.showError('email', 'Email is required'); hasError = true; }
            else if (!Utils.isValidEmail(data.email)) { Utils.showError('email', 'Invalid email format'); hasError = true; }
            if (data.phoneNumber?.trim() && !Utils.isValidPhone(data.phoneNumber)) { 
                Utils.showError('phoneNumber', 'Invalid phone format'); hasError = true; 
            }
            
            return !hasError;
        },

        async checkUniqueness(field, value, currentValue) {
            if (value === currentValue) return true;
            
            try {
                // Check admins
                const adminQuery = await STATE.db.collection('admins').where(field, '==', value).get();
                if (!adminQuery.empty && adminQuery.docs[0].id !== STATE.currentAdmin.id) {
                    Utils.showError(field, `${field} already exists`);
                    return false;
                }
                
                // Check users
                const userQuery = await STATE.db.collection('users').where(field, '==', value).get();
                if (!userQuery.empty) {
                    Utils.showError(field, `${field} already exists`);
                    return false;
                }
                
                return true;
            } catch {
                return true;
            }
        },

        save: perf.debounce(async function(formData) {
            // Force original username for non-executive
            if (!Utils.canEditUsername()) {
                formData.username = STATE.originalData.username;
            }
            
            if (!await Profile.validate(formData)) {
                Utils.showToast('Please fix the errors', 'error');
                return;
            }
            
            const saveBtn = DOM.get('saveBtn');
            const originalText = saveBtn?.innerHTML || '';
            
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            }
            
            try {
                // Check uniqueness
                if (Utils.canEditUsername() && formData.username !== STATE.originalData.username) {
                    if (!await Profile.checkUniqueness('username', formData.username, STATE.originalData.username)) {
                        throw new Error('Username taken');
                    }
                }
                
                if (formData.email !== STATE.originalData.email) {
                    if (!await Profile.checkUniqueness('email', formData.email, STATE.originalData.email)) {
                        throw new Error('Email taken');
                    }
                }
                
                // Build update data
                const updateData = {
                    firstName: formData.firstName.trim(),
                    lastName: formData.lastName.trim(),
                    email: formData.email.trim(),
                    phoneNumber: formData.phoneNumber?.trim() || '',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                
                if (Utils.canEditUsername()) {
                    updateData.username = formData.username.trim();
                }
                
                // Save to Firebase
                await STATE.db.collection('admins').doc(STATE.currentAdmin.id).update(updateData);
                
                // ========== LOG ACTIVITY ==========
                const changes = {};
                if (formData.firstName !== STATE.originalData.firstName) {
                    changes.firstName = { old: STATE.originalData.firstName || '', new: formData.firstName };
                }
                if (formData.lastName !== STATE.originalData.lastName) {
                    changes.lastName = { old: STATE.originalData.lastName || '', new: formData.lastName };
                }
                if (formData.email !== STATE.originalData.email) {
                    changes.email = { old: STATE.originalData.email, new: formData.email };
                }
                if (formData.phoneNumber !== (STATE.originalData.phoneNumber || '')) {
                    changes.phoneNumber = { old: STATE.originalData.phoneNumber || '', new: formData.phoneNumber || '' };
                }
                if (Utils.canEditUsername() && formData.username !== STATE.originalData.username) {
                    changes.username = { old: STATE.originalData.username, new: formData.username };
                }
                
                if (Object.keys(changes).length > 0 && window.BreathSafeLogger) {
                    window.BreathSafeLogger.logProfileUpdate(changes);
                }
                // ========== END LOG ==========
                
                // Update local state
                STATE.currentAdmin = {
                    ...STATE.currentAdmin,
                    ...updateData,
                    username: Utils.canEditUsername() ? formData.username : STATE.originalData.username
                };
                STATE.originalData = { ...STATE.currentAdmin };
                
                // Update session
                const session = JSON.parse(sessionStorage.getItem('breathsafeAdmin') || '{}');
                Object.assign(session, {
                    email: formData.email,
                    firstName: formData.firstName,
                    lastName: formData.lastName,
                    phoneNumber: formData.phoneNumber || ''
                });
                if (Utils.canEditUsername()) session.username = formData.username;
                sessionStorage.setItem('breathsafeAdmin', JSON.stringify(session));
                
                Profile.cancelEditMode();
                Profile.display();
                
                Utils.showToast('✅ Profile updated successfully!', 'success');
                
            } catch (error) {
                console.error('Save failed:', error);
                if (!error.message.includes('taken')) {
                    Utils.showToast('Failed to update profile', 'error');
                }
            } finally {
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = originalText;
                }
            }
        }, 300)
    };

    // ========== MODALS ==========
    const Modals = {
        openToken() {
            const token = STATE.currentAdmin?.apiToken || 'No token available';
            const fullTokenEl = DOM.get('fullApiToken');
            const modal = DOM.get('apiTokenModal');
            
            if (fullTokenEl) fullTokenEl.textContent = token;
            if (modal) modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        },

        closeToken() {
            const modal = DOM.get('apiTokenModal');
            if (modal) modal.classList.remove('active');
            document.body.style.overflow = '';
        },

        copyToken() {
            const token = DOM.get('fullApiToken')?.textContent;
            if (!token || token === 'No token available') {
                Utils.showToast('No token to copy', 'error');
                return;
            }
            
            navigator.clipboard.writeText(token)
                .then(() => {
                    Utils.showToast('✅ Token copied!', 'success');
                    const btn = DOM.get('copyTokenBtn');
                    if (btn) {
                        const original = btn.innerHTML;
                        btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                        btn.style.background = 'var(--success)';
                        setTimeout(() => {
                            btn.innerHTML = original;
                            btn.style.background = '';
                        }, 2000);
                    }
                })
                .catch(() => Utils.showToast('Failed to copy', 'error'));
        }
    };

    // ========== UI ==========
    const UI = {
        toggleUserMenu: perf.throttle(function() {
            const menu = DOM.get('userMenu');
            if (menu) menu.classList.toggle('active');
        }, 100),

        toggleTheme() {
            DOM.batch([
                () => {
                    document.body.classList.toggle('dark');
                    document.body.classList.toggle('light');
                    const isDark = document.body.classList.contains('dark');
                    localStorage.setItem('theme', isDark ? 'dark' : 'light');
                    const icon = document.querySelector('#themeToggle i');
                    if (icon) icon.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
                }
            ]);
        },

        loadTheme() {
            const theme = localStorage.getItem('theme') || 'light';
            DOM.batch([
                () => {
                    document.body.classList.remove('light', 'dark');
                    document.body.classList.add(theme);
                    const icon = document.querySelector('#themeToggle i');
                    if (icon) icon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
                }
            ]);
        }
    };

    // ========== EVENTS ==========
    const Events = {
        initialized: false,
        
        init() {
            if (this.initialized) return;
            this.initialized = true;
            
            // Delegated click handler
            document.addEventListener('click', (e) => {
                const target = e.target;
                
                // User menu trigger
                if (target.closest('.user-menu__trigger') || target.closest('#userMenu')) {
                    e.stopPropagation();
                    UI.toggleUserMenu();
                    return;
                }
                
                // Close user menu on outside click
                const menu = DOM.get('userMenu');
                if (menu && !menu.contains(target)) {
                    menu.classList.remove('active');
                }
                
                const btn = target.closest('button, [data-action]');
                if (!btn) return;
                
                const id = btn.id;
                
                switch(id) {
                    case 'themeToggle': UI.toggleTheme(); break;
                    case 'editBtn': Profile.enterEditMode(); break;
                    case 'cancelBtn': Profile.cancelEditMode(); break;
                    case 'viewTokenBtn': Modals.openToken(); break;
                    case 'closeApiTokenModal':
                    case 'closeApiTokenBtn': Modals.closeToken(); break;
                    case 'copyTokenBtn': Modals.copyToken(); break;
                    case 'logoutBtn':
                        e.preventDefault();
                        if (confirm('Are you sure you want to logout?')) {
                            sessionStorage.removeItem('breathsafeAdmin');
                            sessionStorage.removeItem('breathsafeAdminToken');
                            localStorage.removeItem('breathsafe_avatar_v4');
                            window.location.href = './Login-codes/breathsafe-admin-login.html';
                        }
                        break;
                }
                
                if (target.id === 'apiTokenBackdrop') Modals.closeToken();
            });
            
            // Form submit
            const form = DOM.get('profileForm');
            if (form) {
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    Profile.save({
                        firstName: DOM.get('firstName')?.value.trim() || '',
                        lastName: DOM.get('lastName')?.value.trim() || '',
                        username: DOM.get('username')?.value.trim() || '',
                        email: DOM.get('email')?.value.trim() || '',
                        phoneNumber: DOM.get('phoneNumber')?.value.trim() || ''
                    });
                });
            }
            
            // Input validation on change
            ['firstName', 'lastName', 'username', 'email', 'phoneNumber'].forEach(field => {
                const input = DOM.get(field);
                if (input) {
                    input.addEventListener('input', perf.debounce(() => Utils.clearError(field), 150));
                }
            });
            
            // Escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    const modal = DOM.get('apiTokenModal');
                    if (modal?.classList.contains('active')) Modals.closeToken();
                }
            });
        }
    };

    // ========== INIT ==========
    async function init() {
        if (STATE.initialized) return;
        
        console.log('🚀 Initializing AdminProfile...');
        
        UI.loadTheme();
        
        if (!await Firebase.init()) return;
        
        Events.init();
        await Profile.load();
        
        STATE.initialized = true;
        console.log('✅ AdminProfile v3.0 Ready');
    }

    // ========== START ==========
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        requestAnimationFrame(init);
    }

    // ========== CLEANUP ==========
    window.addEventListener('beforeunload', () => DOM.clear(), { once: true });

    // ========== EXPORTS ==========
    window.ProfileManager = Profile;
    window.ProfileModals = Modals;
    window.ProfileUI = UI;
    window.ProfileState = {
        getRole: () => STATE.adminRole,
        canEditUsername: () => Utils.canEditUsername()
    };

    console.log('✅ AdminProfile v3.0 Loaded');

})();