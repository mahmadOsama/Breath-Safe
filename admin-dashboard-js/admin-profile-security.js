/* ==========================================
BREATHSAFE ADMIN SECURITY v3.0
Password Management & Access Control
With Activity Logging Integration
========================================== */

(function() {
    'use strict';

    console.log('🔐 SecurityModule v3.0 Loading...');

    // ========== CONFIG ==========
    const CONFIG = {
        MIN_PASSWORD_LENGTH: 8,
        MAX_PASSWORD_LENGTH: 128,
        DEBOUNCE_DELAY: 150,
        STRENGTH_LEVELS: ['very-weak', 'weak', 'fair', 'strong', 'very-strong'],
        STRENGTH_LABELS: ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong']
    };

    // ========== STATE ==========
    const STATE = {
        isModalOpen: false,
        adminRole: null,
        passwordStrength: 0,
        requirements: {
            length: false,
            uppercase: false,
            lowercase: false,
            number: false,
            special: false
        },
        initialized: false
    };

    // ========== DOM CACHE ==========
    const DOM = {
        cache: new Map(),
        get(id) {
            if (!this.cache.has(id)) this.cache.set(id, document.getElementById(id));
            return this.cache.get(id);
        },
        clear() { this.cache.clear(); }
    };

    // ========== UTILITIES ==========
    const debounce = (fn, ms) => {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), ms);
        };
    };

    const batch = (updates) => {
        requestAnimationFrame(() => updates.forEach(fn => { try { fn(); } catch{} }));
    };

    // ========== PASSWORD ANALYZER ==========
    const Analyzer = {
        analyze(password) {
            if (!password) {
                return {
                    score: 0,
                    level: 'very-weak',
                    label: 'Very Weak',
                    requirements: this.defaultRequirements(),
                    suggestions: []
                };
            }

            const requirements = this.checkRequirements(password);
            const score = this.calculateScore(password, requirements);
            const levelIndex = Math.min(Math.floor(score / 20), 4);

            return {
                score,
                level: CONFIG.STRENGTH_LEVELS[levelIndex],
                label: CONFIG.STRENGTH_LABELS[levelIndex],
                requirements,
                suggestions: this.getSuggestions(password, requirements)
            };
        },

        defaultRequirements() {
            return { length: false, uppercase: false, lowercase: false, number: false, special: false };
        },

        checkRequirements(password) {
            return {
                length: password.length >= CONFIG.MIN_PASSWORD_LENGTH,
                uppercase: /[A-Z]/.test(password),
                lowercase: /[a-z]/.test(password),
                number: /[0-9]/.test(password),
                special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)
            };
        },

        calculateScore(password, requirements) {
            let score = Math.min(password.length * 2, 25);
            score += Object.values(requirements).filter(Boolean).length * 10;
            if (password.length > 12) score += 10;
            if (password.length > 16) score += 10;
            
            const unique = new Set(password).size;
            if (unique > password.length * 0.7) score += 5;
            
            // Penalties
            if (/^[a-z]+$/i.test(password)) score -= 10;
            if (/^[0-9]+$/.test(password)) score -= 15;
            if (/(.)\1{2,}/.test(password)) score -= 10;
            if (/^(password|123456|qwerty|admin)/i.test(password)) score -= 30;
            
            return Math.max(0, Math.min(100, score));
        },

        getSuggestions(password, requirements) {
            const suggestions = [];
            if (!requirements.length) suggestions.push(`Add ${CONFIG.MIN_PASSWORD_LENGTH - password.length} more characters`);
            if (!requirements.uppercase) suggestions.push('Add uppercase letters (A-Z)');
            if (!requirements.lowercase) suggestions.push('Add lowercase letters (a-z)');
            if (!requirements.number) suggestions.push('Add numbers (0-9)');
            if (!requirements.special) suggestions.push('Add special characters (!@#$%^&*)');
            if (password.length < 12 && requirements.length) suggestions.push('Consider 12+ characters');
            return suggestions;
        }
    };

    // ========== USERNAME PROTECTION ==========
    const UsernameProtection = {
        intervalId: null,

        init() {
            this.lock();
            this.watch();
            this.addIndicator();
        },

        lock() {
            const input = DOM.get('username');
            if (!input) return;
            input.disabled = true;
            input.readOnly = true;
            input.classList.add('username-locked');
            input.setAttribute('data-protected', 'true');
        },

        watch() {
            this.intervalId = setInterval(() => {
                if (STATE.adminRole !== 'executive') {
                    const input = DOM.get('username');
                    if (input && (!input.disabled || !input.readOnly)) {
                        this.lock();
                    }
                }
            }, 300);
        },

        addIndicator() {
            const input = DOM.get('username');
            if (!input) return;
            
            const group = input.closest('.form-group');
            if (group && !group.querySelector('.username-lock-indicator')) {
                const indicator = document.createElement('div');
                indicator.className = 'username-lock-indicator';
                indicator.innerHTML = `<i class="fas fa-lock"></i><span>Username changes require Executive privileges</span>`;
                group.appendChild(indicator);
            }
            
            const notice = DOM.get('usernameNotice');
            if (notice) notice.style.display = 'flex';
        },

        destroy() {
            if (this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
            }
        }
    };

    // ========== UI CONTROLLER ==========
    const UI = {
        init() {
            if (STATE.initialized) return;
            
            this.loadRole();
            this.bindEvents();
            this.updateLastChanged();
            
            STATE.initialized = true;
        },

        loadRole() {
            const session = sessionStorage.getItem('breathsafeAdmin');
            if (!session) return;
            
            try {
                const admin = JSON.parse(session);
                STATE.adminRole = admin.role || 'regular';
                if (STATE.adminRole !== 'executive') {
                    UsernameProtection.init();
                }
            } catch {
                STATE.adminRole = 'regular';
                UsernameProtection.init();
            }
        },

        bindEvents() {
            // Change password button
            DOM.get('changePasswordBtn')?.addEventListener('click', () => this.openModal());

            // Close buttons
            ['closePasswordModal', 'cancelPasswordChange', 'changePasswordBackdrop'].forEach(id => {
                DOM.get(id)?.addEventListener('click', () => this.closeModal());
            });

            // Toggle requirements
            DOM.get('requirementsToggle')?.addEventListener('click', () => this.toggleRequirements());

            // Form submit
            DOM.get('changePasswordForm')?.addEventListener('submit', (e) => this.handleSubmit(e));

            // Password toggles
            document.querySelectorAll('.password-toggle').forEach(btn => {
                btn.addEventListener('click', (e) => this.toggleVisibility(e));
            });

            // Password inputs
            DOM.get('newPassword')?.addEventListener('input', debounce((e) => this.handlePasswordInput(e), CONFIG.DEBOUNCE_DELAY));
            DOM.get('confirmPassword')?.addEventListener('input', debounce(() => this.checkMatch(), CONFIG.DEBOUNCE_DELAY));
            DOM.get('currentPassword')?.addEventListener('input', () => {
                this.clearError('currentPassword');
                this.validateForm();
            });

            // Escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && STATE.isModalOpen) this.closeModal();
            });
        },

        toggleRequirements() {
            const toggle = DOM.get('requirementsToggle');
            const list = DOM.get('requirementsList');
            if (toggle && list) {
                const expanded = !toggle.classList.contains('expanded');
                toggle.classList.toggle('expanded', expanded);
                list.classList.toggle('show', expanded);
            }
        },

        openModal() {
            const modal = DOM.get('changePasswordModal');
            if (!modal) return;
            
            modal.classList.add('active');
            STATE.isModalOpen = true;
            document.body.style.overflow = 'hidden';
            
            this.resetForm();
            setTimeout(() => DOM.get('currentPassword')?.focus(), 100);
        },

        closeModal() {
            const modal = DOM.get('changePasswordModal');
            if (!modal) return;
            
            modal.classList.remove('active');
            STATE.isModalOpen = false;
            document.body.style.overflow = '';
            this.resetForm();
        },

        resetForm() {
            const form = DOM.get('changePasswordForm');
            if (form) form.reset();

            ['currentPassword', 'newPassword', 'confirmPassword'].forEach(f => {
                this.clearError(f);
                const input = DOM.get(f);
                if (input) input.value = '';
            });

            this.updateStrengthMeter({ score: 0, level: 'very-weak', label: '--', requirements: Analyzer.defaultRequirements() });
            this.updateRequirements(Analyzer.defaultRequirements());

            const match = DOM.get('passwordMatch');
            if (match) match.style.display = 'none';

            const saveBtn = DOM.get('savePasswordBtn');
            if (saveBtn) saveBtn.disabled = true;

            const suggestions = DOM.get('passwordSuggestions');
            if (suggestions) suggestions.style.display = 'none';

            const toggle = DOM.get('requirementsToggle');
            const list = DOM.get('requirementsList');
            if (toggle) toggle.classList.remove('expanded');
            if (list) list.classList.remove('show');

            document.querySelectorAll('.password-toggle').forEach(btn => {
                const input = DOM.get(btn.dataset.target);
                if (input) input.type = 'password';
                const icon = btn.querySelector('i');
                if (icon) icon.className = 'fas fa-eye';
            });
        },

        toggleVisibility(e) {
            const btn = e.currentTarget;
            const input = DOM.get(btn.dataset.target);
            const icon = btn.querySelector('i');

            if (input && icon) {
                const isPassword = input.type === 'password';
                input.type = isPassword ? 'text' : 'password';
                icon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
                
                if (!isPassword) return;
                setTimeout(() => {
                    if (input.type === 'text') {
                        input.type = 'password';
                        icon.className = 'fas fa-eye';
                    }
                }, 3000);
            }
        },

        handlePasswordInput(e) {
            const password = e.target.value;
            const analysis = Analyzer.analyze(password);

            this.updateStrengthMeter(analysis);
            this.updateRequirements(analysis.requirements);
            this.updateSuggestions(analysis.suggestions);
            this.checkMatch();
            this.validateForm();
        },

        updateStrengthMeter(analysis) {
            batch([() => {
                const fill = DOM.get('strengthFill');
                const score = DOM.get('strengthScore');
                if (fill) fill.className = 'password-strength__fill ' + analysis.level;
                if (score) {
                    score.textContent = analysis.label;
                    score.className = 'password-strength__score ' + analysis.level;
                }
            }]);
            STATE.passwordStrength = analysis.score;
        },

        updateRequirements(requirements) {
            const metCount = Object.values(requirements).filter(Boolean).length;
            const total = Object.keys(requirements).length;
            
            batch([() => {
                Object.entries(requirements).forEach(([key, met]) => {
                    const el = document.querySelector(`[data-requirement="${key}"]`);
                    if (el) el.classList.toggle('met', met);
                });
                
                const countEl = DOM.get('requirementsCount');
                if (countEl) {
                    countEl.textContent = `${metCount}/${total}`;
                    countEl.classList.toggle('complete', metCount === total);
                }
                
                const toggle = DOM.get('requirementsToggle');
                const list = DOM.get('requirementsList');
                if (toggle && list) {
                    if (metCount === total) {
                        toggle.classList.remove('expanded');
                        list.classList.remove('show');
                    } else if (metCount > 0) {
                        toggle.classList.add('expanded');
                        list.classList.add('show');
                    }
                }
            }]);

            STATE.requirements = requirements;
        },

        updateSuggestions(suggestions) {
            const container = DOM.get('passwordSuggestions');
            const list = DOM.get('suggestionsList');
            if (!container || !list) return;

            batch([() => {
                if (suggestions.length > 0 && STATE.passwordStrength < 80) {
                    const items = suggestions.map((suggestion) => {
                        const item = document.createElement('li');
                        item.textContent = suggestion;
                        return item;
                    });
                    list.replaceChildren(...items);
                    container.style.display = 'block';
                } else {
                    container.style.display = 'none';
                }
            }]);
        },

        checkMatch() {
            const newPwd = DOM.get('newPassword')?.value || '';
            const confirmPwd = DOM.get('confirmPassword')?.value || '';
            const indicator = DOM.get('passwordMatch');
            if (!indicator) return;

            batch([() => {
                if (!confirmPwd) {
                    indicator.style.display = 'none';
                } else if (newPwd === confirmPwd) {
                    indicator.style.display = 'flex';
                    indicator.classList.remove('no-match');
                    indicator.innerHTML = '<i class="fas fa-check-circle"></i><span>Passwords match</span>';
                } else {
                    indicator.style.display = 'flex';
                    indicator.classList.add('no-match');
                    indicator.innerHTML = '<i class="fas fa-times-circle"></i><span>Passwords do not match</span>';
                }
            }]);

            this.validateForm();
        },

        validateForm() {
            const currentPwd = DOM.get('currentPassword')?.value || '';
            const newPwd = DOM.get('newPassword')?.value || '';
            const confirmPwd = DOM.get('confirmPassword')?.value || '';
            const saveBtn = DOM.get('savePasswordBtn');
            if (!saveBtn) return;

            const allMet = Object.values(STATE.requirements).every(Boolean);
            const match = newPwd === confirmPwd && confirmPwd.length > 0;
            const hasCurrent = currentPwd.length > 0;
            const isStrong = STATE.passwordStrength >= 40;

            saveBtn.disabled = !(hasCurrent && allMet && match && isStrong);
        },

        showError(fieldId, message) {
            batch([() => {
                const input = DOM.get(fieldId);
                const error = DOM.get(fieldId + 'Error');
                if (input) input.classList.add('error');
                if (error) { error.textContent = message; error.style.display = 'block'; }
            }]);
        },

        clearError(fieldId) {
            batch([() => {
                const input = DOM.get(fieldId);
                const error = DOM.get(fieldId + 'Error');
                if (input) input.classList.remove('error');
                if (error) { error.textContent = ''; error.style.display = 'none'; }
            }]);
        },

        async handleSubmit(e) {
            e.preventDefault();

            const currentPwd = DOM.get('currentPassword')?.value || '';
            const newPwd = DOM.get('newPassword')?.value || '';
            const confirmPwd = DOM.get('confirmPassword')?.value || '';
            const saveBtn = DOM.get('savePasswordBtn');

            ['currentPassword', 'newPassword', 'confirmPassword'].forEach(f => this.clearError(f));

            let hasError = false;
            if (!currentPwd) { this.showError('currentPassword', 'Current password required'); hasError = true; }
            if (!Object.values(STATE.requirements).every(Boolean)) { this.showError('newPassword', 'Requirements not met'); hasError = true; }
            if (newPwd !== confirmPwd) { this.showError('confirmPassword', 'Passwords do not match'); hasError = true; }
            if (newPwd === currentPwd) { this.showError('newPassword', 'Must be different from current'); hasError = true; }

            if (hasError) return;

            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
            }

            try {
                await PasswordManager.change(currentPwd, newPwd);
                this.closeModal();
                this.showToast('Password updated successfully!', 'success');
                this.updateLastChanged();
            } catch (error) {
                if (error.message.includes('incorrect') || error.message.includes('wrong')) {
                    this.showError('currentPassword', 'Current password is incorrect');
                } else {
                    this.showToast(error.message || 'Failed to update password', 'error');
                }
            } finally {
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="fas fa-save"></i> Update Password';
                }
            }
        },

        updateLastChanged() {
            const el = DOM.get('passwordLastChanged');
            if (!el) return;

            try {
                const session = JSON.parse(sessionStorage.getItem('breathsafeAdmin') || '{}');
                if (session.passwordChangedAt) {
                    const date = new Date(session.passwordChangedAt);
                    el.textContent = `Last changed: ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
                    el.classList.remove('never-changed');
                    el.classList.add('recently-changed');
                    return;
                }
            } catch {}

            el.textContent = 'Last changed: Never';
            el.classList.add('never-changed');
        },

        showToast(message, type = 'info') {
            if (window.ProfileManager?.showToast) {
                window.ProfileManager.showToast(message, type);
                return;
            }
            
            const toast = DOM.get('toast');
            if (toast) {
                toast.textContent = message;
                toast.className = `toast ${type}`;
                toast.style.display = 'block';
                setTimeout(() => { toast.style.display = 'none'; }, 4000);
            }
        }
    };

    // ========== PASSWORD MANAGER ==========
    const PasswordManager = {
        async change(currentPassword, newPassword) {
            const session = sessionStorage.getItem('breathsafeAdmin');
            if (!session) throw new Error('No active session');

            const admin = JSON.parse(session);
            if (!admin.id) throw new Error('Invalid session');

            // Get Firebase
            let db;
            try { db = firebase.firestore(firebase.app("profileApp")); }
            catch { try { db = firebase.firestore(); } catch { throw new Error('Database unavailable'); } }

            // Verify current password
            const adminDoc = await db.collection('admins').doc(admin.id).get();
            if (!adminDoc.exists) throw new Error('Account not found');

            const adminData = adminDoc.data();
            if (adminData.password !== currentPassword) {
                throw new Error('Current password is incorrect');
            }

            // Update password
            await db.collection('admins').doc(admin.id).update({
                password: newPassword,
                passwordChangedAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Update session
            const updatedSession = { ...admin, passwordChangedAt: new Date().toISOString() };
            sessionStorage.setItem('breathsafeAdmin', JSON.stringify(updatedSession));

            // ========== LOG ACTIVITY ==========
            if (window.BreathSafeLogger) {
                window.BreathSafeLogger.logPasswordChange();
            } else {
                // Fallback: log directly
                try {
                    await db.collection('activity_logs').add({
                        action: 'password_change',
                        adminId: admin.id,
                        adminUsername: admin.username,
                        adminFullName: [admin.firstName, admin.lastName].filter(Boolean).join(' ') || admin.username,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                        details: {
                            description: 'Changed account password',
                            browser: navigator.userAgent.includes('Chrome') ? 'Chrome' : 
                                     navigator.userAgent.includes('Firefox') ? 'Firefox' : 'Other',
                            device: /Mobi/.test(navigator.userAgent) ? 'Mobile' : 'Desktop'
                        }
                    });
                } catch {}
            }
            // ========== END LOG ==========

            return true;
        }
    };

    // ========== INIT ==========
    function init() {
        const checkReady = () => {
            if (document.readyState === 'complete' || document.readyState === 'interactive') {
                setTimeout(() => UI.init(), 200);
            } else {
                document.addEventListener('DOMContentLoaded', () => setTimeout(() => UI.init(), 200), { once: true });
            }
        };
        checkReady();
    }

    init();

    // ========== CLEANUP ==========
    window.addEventListener('beforeunload', () => {
        UsernameProtection.destroy();
        DOM.clear();
    });

    // ========== EXPORTS ==========
    window.SecurityModule = Object.freeze({
        canEditUsername: () => STATE.adminRole === 'executive',
        getRole: () => STATE.adminRole,
        reapplyProtection: () => {
            if (STATE.adminRole !== 'executive') {
                UsernameProtection.lock();
            }
        }
    });

    console.log('✅ SecurityModule v3.0 Loaded');

})();
