/* ==========================================
BREATHSAFE AVATAR PICKER v5.0
High-Performance Avatar Management
With Activity Logging Integration
========================================== */

(function() {
    'use strict';

    console.log('🎨 AvatarPicker v5.0 Loading...');

    // ========== STORAGE KEY ==========
    const STORAGE_KEY = 'breathsafe_avatar_v4';

    // ========== CONFIG ==========
    const CONFIG = {
        colors: [
            { name: 'Green', primary: '#10b981', secondary: '#059669' },
            { name: 'Blue', primary: '#3b82f6', secondary: '#2563eb' },
            { name: 'Purple', primary: '#8b5cf6', secondary: '#7c3aed' },
            { name: 'Red', primary: '#ef4444', secondary: '#dc2626' },
            { name: 'Orange', primary: '#f59e0b', secondary: '#d97706' },
            { name: 'Pink', primary: '#ec4899', secondary: '#db2777' },
            { name: 'Cyan', primary: '#06b6d4', secondary: '#0891b2' },
            { name: 'Yellow', primary: '#eab308', secondary: '#ca8a04' },
            { name: 'Dark', primary: '#374151', secondary: '#1f2937' },
            { name: 'Slate', primary: '#64748b', secondary: '#475569' },
            { name: 'Indigo', primary: '#6366f1', secondary: '#4f46e5' },
            { name: 'Teal', primary: '#14b8a6', secondary: '#0d9488' }
        ],

        iconCategories: {
            breathsafe: {
                name: '🌬️ BreathSafe',
                icons: [
                    'fa-wind', 'fa-fan', 'fa-lungs', 'fa-head-side-mask', 'fa-mask-face',
                    'fa-fire', 'fa-fire-flame-curved', 'fa-smog', 'fa-shield', 'fa-shield-halved',
                    'fa-user-shield', 'fa-helmet-safety', 'fa-gauge', 'fa-gauge-high',
                    'fa-temperature-high', 'fa-thermometer', 'fa-bell', 'fa-triangle-exclamation',
                    'fa-heart-pulse', 'fa-heart', 'fa-leaf', 'fa-seedling', 'fa-droplet'
                ]
            },
            initials: { name: '✏️ Initials', icons: [] },
            faces: {
                name: '😊 Faces',
                icons: [
                    'fa-face-smile', 'fa-face-grin', 'fa-face-laugh', 'fa-face-grin-stars',
                    'fa-face-grin-hearts', 'fa-face-kiss-wink-heart', 'fa-face-surprise',
                    'fa-face-laugh-beam', 'fa-face-grin-beam', 'fa-face-smile-wink'
                ]
            },
            animals: {
                name: '🐾 Animals',
                icons: [
                    'fa-cat', 'fa-dog', 'fa-dragon', 'fa-horse', 'fa-hippo',
                    'fa-fish', 'fa-crow', 'fa-spider', 'fa-frog', 'fa-dove', 'fa-paw'
                ]
            },
            people: {
                name: '👤 People',
                icons: [
                    'fa-user', 'fa-user-ninja', 'fa-user-astronaut', 'fa-user-secret',
                    'fa-user-tie', 'fa-user-graduate', 'fa-user-doctor', 'fa-robot', 'fa-ghost'
                ]
            },
            objects: {
                name: '⭐ Objects',
                icons: [
                    'fa-star', 'fa-crown', 'fa-gem', 'fa-bolt', 'fa-moon', 'fa-sun',
                    'fa-rocket', 'fa-gamepad', 'fa-music', 'fa-trophy', 'fa-medal'
                ]
            },
            nature: {
                name: '🌿 Nature',
                icons: [
                    'fa-tree', 'fa-leaf', 'fa-seedling', 'fa-clover', 'fa-snowflake',
                    'fa-cloud', 'fa-mountain', 'fa-water', 'fa-rainbow'
                ]
            },
            tech: {
                name: '💻 Tech',
                icons: [
                    'fa-laptop', 'fa-desktop', 'fa-mobile', 'fa-microchip', 'fa-server',
                    'fa-database', 'fa-wifi', 'fa-code', 'fa-terminal'
                ]
            }
        },

        defaults: { bgColor: '#10b981', bgGradient: true }
    };

    // ========== STATE ==========
    const State = {
        isOpen: false,
        currentTab: 'breathsafe',
        selectedIcon: null,
        selectedColor: '#10b981',
        useGradient: true,
        originalData: {},
        adminInitials: 'AD',
        hasChanges: false,
        isInitialized: false,
        isSaving: false
    };

    // ========== STORAGE ==========
    const Storage = {
        save(icon, color, gradient, initials) {
            const data = { icon, color, gradient, initials, timestamp: Date.now() };
            
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
            
            try {
                const session = JSON.parse(sessionStorage.getItem('breathsafeAdmin') || '{}');
                if (icon) session.avatarIcon = icon;
                else delete session.avatarIcon;
                session.avatarBgColor = color;
                session.avatarBgGradient = gradient;
                sessionStorage.setItem('breathsafeAdmin', JSON.stringify(session));
            } catch {}
            
            try { localStorage.setItem('breathsafe_avatar_changed', Date.now().toString()); } catch {}
            
            return data;
        },

        load() {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) return JSON.parse(saved);
            } catch {}
            
            try {
                const session = JSON.parse(sessionStorage.getItem('breathsafeAdmin') || '{}');
                return {
                    icon: session.avatarIcon || null,
                    color: session.avatarBgColor || '#10b981',
                    gradient: session.avatarBgGradient !== false,
                    initials: ((session.firstName?.[0] || '') + (session.lastName?.[0] || '')).toUpperCase() || 'AD'
                };
            } catch {
                return { icon: null, color: '#10b981', gradient: true, initials: 'AD' };
            }
        }
    };

    // ========== UTILITIES ==========
    const Utils = {
        getInitials() {
            try {
                const session = JSON.parse(sessionStorage.getItem('breathsafeAdmin') || '{}');
                const f = (session.firstName || '')[0] || '';
                const l = (session.lastName || '')[0] || '';
                return (f + l).toUpperCase() || session.username?.substring(0, 2).toUpperCase() || 'AD';
            } catch {
                return 'AD';
            }
        },

        getGradient(color, useGradient) {
            if (!CONFIG.colors.some(option => option.primary === color)) color = '#10b981';
            if (!useGradient) return color;
            const c = CONFIG.colors.find(c => c.primary === color);
            return `linear-gradient(135deg, ${c.primary}, ${c.secondary})`;
        },

        showToast(message, type = 'success') {
            if (typeof window.showToast === 'function') {
                window.showToast(message, type);
                return;
            }
            const toast = document.getElementById('toast');
            if (toast) {
                toast.textContent = message;
                toast.className = `toast ${type}`;
                toast.style.display = 'block';
                setTimeout(() => { toast.style.display = 'none'; }, 4000);
            }
        }
    };

    // ========== RENDERER ==========
    const Renderer = {
        updateAvatar(el, icon, initials, color, gradient) {
            if (!el) return;
            el.style.background = Utils.getGradient(color, gradient);
            if (typeof icon === 'string' && /^fa-[a-z0-9-]+$/i.test(icon)) {
                const iconElement = document.createElement('i');
                iconElement.className = `fas ${icon}`;
                el.replaceChildren(iconElement);
                el.classList.add('avatar--has-icon');
            } else {
                const initialsElement = document.createElement('span');
                initialsElement.textContent = typeof initials === 'string' ? initials.slice(0, 4) : 'AD';
                el.replaceChildren(initialsElement);
                el.classList.remove('avatar--has-icon');
            }
        },

        updateAll() {
            const { selectedIcon, adminInitials, selectedColor, useGradient } = State;
            ['profileAvatar', 'headerAvatar', 'dropdownAvatar', 'avatarPreview'].forEach(id => {
                this.updateAvatar(document.getElementById(id), selectedIcon, adminInitials, selectedColor, useGradient);
            });
        }
    };

    // ========== MODAL ==========
    const Modal = {
        init() {
            if (State.isInitialized) return;
            
            this.loadState();
            this.create();
            this.bindEvents();
            this.addEditButton();
            
            State.isInitialized = true;
            console.log('✅ AvatarPicker v5.0 Ready');
        },

        loadState() {
            const saved = Storage.load();
            State.adminInitials = Utils.getInitials() || saved.initials || 'AD';
            State.selectedIcon = saved.icon;
            State.selectedColor = saved.color || '#10b981';
            State.useGradient = saved.gradient !== false;
            State.originalData = { icon: State.selectedIcon, color: State.selectedColor, gradient: State.useGradient };
            Renderer.updateAll();
        },

        create() {
            if (document.getElementById('avatarPickerModal')) return;

            const html = `
                <div class="avatar-modal" id="avatarPickerModal">
                    <div class="avatar-modal__backdrop" id="avatarModalBackdrop"></div>
                    <div class="avatar-modal__dialog">
                        <div class="avatar-modal__header">
                            <h3 class="avatar-modal__title"><i class="fas fa-palette"></i> Customize Avatar</h3>
                            <button class="avatar-modal__close" id="avatarModalClose" type="button"><i class="fas fa-times"></i></button>
                        </div>
                        
                        <div class="avatar-modal__body">
                            <div class="avatar-preview-section">
                                <div class="avatar-preview" id="avatarPreview"><span>${State.adminInitials}</span></div>
                                <span class="avatar-preview-label">Preview</span>
                            </div>

                            <div class="avatar-style-section">
                                <label class="avatar-section-label"><i class="fas fa-fill-drip"></i> Background Style</label>
                                <div class="avatar-style-toggle">
                                    <button type="button" class="avatar-style-btn ${!State.useGradient ? 'active' : ''}" data-style="solid">
                                        <i class="fas fa-square"></i> Solid
                                    </button>
                                    <button type="button" class="avatar-style-btn ${State.useGradient ? 'active' : ''}" data-style="gradient">
                                        <i class="fas fa-fill"></i> Gradient
                                    </button>
                                </div>
                            </div>

                            <div class="avatar-section">
                                <label class="avatar-section-label"><i class="fas fa-palette"></i> Color</label>
                                <div class="avatar-color-grid" id="avatarColorGrid"></div>
                            </div>

                            <div class="avatar-section">
                                <label class="avatar-section-label"><i class="fas fa-icons"></i> Icon</label>
                                <div class="avatar-tabs-wrapper">
                                    <button class="avatar-tabs-scroll avatar-tabs-scroll--left" id="tabScrollLeft" type="button"><i class="fas fa-chevron-left"></i></button>
                                    <div class="avatar-tabs" id="avatarTabs"></div>
                                    <button class="avatar-tabs-scroll avatar-tabs-scroll--right" id="tabScrollRight" type="button"><i class="fas fa-chevron-right"></i></button>
                                </div>
                                <div class="avatar-icon-grid" id="avatarIconGrid"></div>
                            </div>
                        </div>

                        <div class="avatar-modal__footer">
                            <button type="button" class="avatar-btn avatar-btn--reset" id="avatarResetBtn"><i class="fas fa-undo"></i> Reset</button>
                            <div class="avatar-modal__actions">
                                <button type="button" class="avatar-btn avatar-btn--cancel" id="avatarCancelBtn">Cancel</button>
                                <button type="button" class="avatar-btn avatar-btn--save" id="avatarSaveBtn"><i class="fas fa-check"></i> Save</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', html);
            this.renderColors();
            this.renderTabs();
            this.renderIcons(State.currentTab);
        },

        renderColors() {
            const grid = document.getElementById('avatarColorGrid');
            if (!grid) return;

            grid.innerHTML = CONFIG.colors.map(c => {
                const selected = c.primary === State.selectedColor;
                const bg = State.useGradient ? `linear-gradient(135deg, ${c.primary}, ${c.secondary})` : c.primary;
                return `<button type="button" class="avatar-color ${selected ? 'selected' : ''}" data-color="${c.primary}" data-secondary="${c.secondary}" style="background: ${bg}" title="${c.name}"><i class="fas fa-check"></i></button>`;
            }).join('');
        },

        renderTabs() {
            const container = document.getElementById('avatarTabs');
            if (!container) return;

            container.innerHTML = Object.entries(CONFIG.iconCategories).map(([key, cat]) =>
                `<button type="button" class="avatar-tab ${key === State.currentTab ? 'active' : ''}" data-category="${key}">${cat.name}</button>`
            ).join('');
        },

        renderIcons(category) {
            const grid = document.getElementById('avatarIconGrid');
            if (!grid) return;

            State.currentTab = category;

            if (category === 'initials') {
                grid.innerHTML = `<button type="button" class="avatar-icon avatar-icon--initials ${!State.selectedIcon ? 'selected' : ''}" data-icon=""><span></span></button>`;
                grid.querySelector('span').textContent = State.adminInitials;
            } else {
                const icons = CONFIG.iconCategories[category]?.icons || [];
                grid.innerHTML = icons.map(icon =>
                    `<button type="button" class="avatar-icon ${State.selectedIcon === icon ? 'selected' : ''}" data-icon="${icon}"><i class="fas ${icon}"></i></button>`
                ).join('');
            }

            document.querySelectorAll('.avatar-tab').forEach(tab => {
                tab.classList.toggle('active', tab.dataset.category === category);
            });
        },

        updateStyleButtons() {
            document.querySelectorAll('.avatar-style-btn').forEach(btn => {
                btn.classList.toggle('active', (btn.dataset.style === 'gradient') === State.useGradient);
            });
        },

        updateColorStyles() {
            document.querySelectorAll('.avatar-color').forEach(btn => {
                const { color, secondary } = btn.dataset;
                btn.style.background = State.useGradient ? `linear-gradient(135deg, ${color}, ${secondary})` : color;
            });
        },

        addEditButton() {
            const container = document.querySelector('.profile-avatar');
            if (!container || container.querySelector('.avatar-edit-btn')) return;

            const btn = document.createElement('button');
            btn.className = 'avatar-edit-btn';
            btn.id = 'avatarEditBtn';
            btn.type = 'button';
            btn.innerHTML = '<i class="fas fa-pencil-alt"></i>';
            btn.title = 'Customize Avatar';
            container.appendChild(btn);
        },

        bindEvents() {
            document.addEventListener('click', (e) => {
                const target = e.target;

                if (target.closest('#avatarEditBtn')) { e.preventDefault(); this.open(); return; }
                if (target.closest('#avatarModalClose') || target.closest('#avatarCancelBtn') || target.id === 'avatarModalBackdrop') { this.close(); return; }
                if (target.closest('#avatarResetBtn')) { e.preventDefault(); this.reset(); return; }
                if (target.closest('#avatarSaveBtn')) { e.preventDefault(); this.save(); return; }

                const tab = target.closest('.avatar-tab');
                if (tab) { e.preventDefault(); this.renderIcons(tab.dataset.category); return; }

                const iconBtn = target.closest('.avatar-icon');
                if (iconBtn) { e.preventDefault(); this.selectIcon(iconBtn.dataset.icon); return; }

                const colorBtn = target.closest('.avatar-color');
                if (colorBtn) { e.preventDefault(); this.selectColor(colorBtn.dataset.color); return; }

                const styleBtn = target.closest('.avatar-style-btn');
                if (styleBtn) { e.preventDefault(); this.setStyle(styleBtn.dataset.style === 'gradient'); return; }

                if (target.closest('#tabScrollLeft')) {
                    document.getElementById('avatarTabs')?.scrollBy({ left: -120, behavior: 'smooth' });
                    return;
                }
                if (target.closest('#tabScrollRight')) {
                    document.getElementById('avatarTabs')?.scrollBy({ left: 120, behavior: 'smooth' });
                    return;
                }
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && State.isOpen) this.close();
            });
        },

        open() {
            const modal = document.getElementById('avatarPickerModal');
            if (!modal) return;

            State.originalData = { icon: State.selectedIcon, color: State.selectedColor, gradient: State.useGradient };
            State.hasChanges = false;

            this.renderColors();
            this.renderIcons(State.currentTab);
            this.updateStyleButtons();
            Renderer.updateAll();

            modal.classList.add('active');
            State.isOpen = true;
            document.body.style.overflow = 'hidden';
        },

        close() {
            const modal = document.getElementById('avatarPickerModal');
            if (!modal) return;

            if (State.hasChanges) {
                State.selectedIcon = State.originalData.icon;
                State.selectedColor = State.originalData.color;
                State.useGradient = State.originalData.gradient;
                Renderer.updateAll();
            }

            modal.classList.remove('active');
            State.isOpen = false;
            document.body.style.overflow = '';
        },

        selectIcon(icon) {
            State.selectedIcon = icon || null;
            State.hasChanges = true;

            document.querySelectorAll('.avatar-icon').forEach(btn => {
                const btnIcon = btn.dataset.icon;
                btn.classList.toggle('selected', (btnIcon === icon) || (btnIcon === '' && !icon));
            });

            Renderer.updateAll();
        },

        selectColor(color) {
            State.selectedColor = color;
            State.hasChanges = true;

            document.querySelectorAll('.avatar-color').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.color === color);
            });

            Renderer.updateAll();
        },

        setStyle(useGradient) {
            State.useGradient = useGradient;
            State.hasChanges = true;
            this.updateStyleButtons();
            this.updateColorStyles();
            Renderer.updateAll();
        },

        reset() {
            State.selectedIcon = null;
            State.selectedColor = CONFIG.defaults.bgColor;
            State.useGradient = CONFIG.defaults.bgGradient;
            State.hasChanges = true;
            State.currentTab = 'initials';

            this.renderColors();
            this.renderIcons('initials');
            this.updateStyleButtons();
            Renderer.updateAll();
        },

        async save() {
            if (State.isSaving) return;

            const saveBtn = document.getElementById('avatarSaveBtn');
            if (!saveBtn) return;

            State.isSaving = true;
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

            try {
                // Get Firebase
                let db;
                try { db = firebase.firestore(firebase.app("profileApp")); }
                catch { try { db = firebase.firestore(); } catch { throw new Error('Firebase unavailable'); } }

                const session = JSON.parse(sessionStorage.getItem('breathsafeAdmin') || '{}');
                if (!session.id) throw new Error('No valid session');

                // Prepare update
                const updateData = { updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
                if (State.selectedIcon) {
                    updateData.avatarIcon = State.selectedIcon;
                } else {
                    updateData.avatarIcon = firebase.firestore.FieldValue.delete();
                }
                updateData.avatarBgColor = State.selectedColor;
                updateData.avatarBgGradient = State.useGradient;

                // Save to Firebase
                await db.collection('admins').doc(session.id).update(updateData);

                // ========== LOG ACTIVITY ==========
                if (window.BreathSafeLogger) {
                    window.BreathSafeLogger.logAvatarChange(
                        {
                            icon: State.originalData.icon,
                            color: State.originalData.color,
                            gradient: State.originalData.gradient
                        },
                        {
                            icon: State.selectedIcon,
                            color: State.selectedColor,
                            gradient: State.useGradient
                        }
                    );
                } else {
                    // Fallback: log directly
                    try {
                        const changes = [];
                        if (State.originalData.icon !== State.selectedIcon) {
                            changes.push(State.selectedIcon ? `icon to ${State.selectedIcon}` : 'removed icon');
                        }
                        if (State.originalData.color !== State.selectedColor) {
                            changes.push(`color to ${State.selectedColor}`);
                        }
                        if (State.originalData.gradient !== State.useGradient) {
                            changes.push(State.useGradient ? 'enabled gradient' : 'disabled gradient');
                        }

                        if (changes.length > 0) {
                            await db.collection('activity_logs').add({
                                action: 'avatar_change',
                                adminId: session.id,
                                adminUsername: session.username,
                                adminFullName: [session.firstName, session.lastName].filter(Boolean).join(' ') || session.username,
                                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                                details: {
                                    description: `Changed avatar: ${changes.join(', ')}`,
                                    oldIcon: State.originalData.icon,
                                    newIcon: State.selectedIcon,
                                    oldColor: State.originalData.color,
                                    newColor: State.selectedColor,
                                    oldGradient: State.originalData.gradient,
                                    newGradient: State.useGradient,
                                    iconChanged: State.originalData.icon !== State.selectedIcon,
                                    colorChanged: State.originalData.color !== State.selectedColor,
                                    gradientChanged: State.originalData.gradient !== State.useGradient
                                }
                            });
                        }
                    } catch {}
                }
                // ========== END LOG ==========

                // Save to storage
                Storage.save(State.selectedIcon, State.selectedColor, State.useGradient, State.adminInitials);

                // Update state
                State.originalData = { icon: State.selectedIcon, color: State.selectedColor, gradient: State.useGradient };
                State.hasChanges = false;

                Utils.showToast('Avatar saved successfully!', 'success');

                // Close modal
                const modal = document.getElementById('avatarPickerModal');
                if (modal) modal.classList.remove('active');
                State.isOpen = false;
                document.body.style.overflow = '';

            } catch (error) {
                console.error('Save failed:', error);
                Utils.showToast('Save failed: ' + error.message, 'error');
            } finally {
                State.isSaving = false;
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<i class="fas fa-check"></i> Save';
            }
        }
    };

    // ========== INIT ==========
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(() => Modal.init(), 100));
        } else {
            setTimeout(() => Modal.init(), 100);
        }
    }

    init();

    // ========== EXPORTS ==========
    window.AvatarPicker = {
        open: () => Modal.open(),
        close: () => Modal.close(),
        refresh: () => Modal.loadState(),
        storage: Storage,
        getState: () => ({ ...State })
    };

    console.log('✅ AvatarPicker v5.0 Loaded');

})();
