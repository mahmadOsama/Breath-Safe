/* ==========================================
BREATHSAFE USER AVATAR PICKER v2.0
Ultra-Fast Performance & Full Features
========================================== */

(function() {
    'use strict';

    // ============ STORAGE KEY ============
    const STORAGE_KEY = 'breathsafe_user_avatar_v1';

    // ============ CONFIG ============
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
            { name: 'Slate', primary: '#64748b', secondary: '#475569' },
            { name: 'Indigo', primary: '#6366f1', secondary: '#4f46e5' },
            { name: 'Teal', primary: '#14b8a6', secondary: '#0d9488' },
            { name: 'Rose', primary: '#f43f5e', secondary: '#e11d48' }
        ],

        iconCategories: {
            safety: {
                name: '🛡️ Safety',
                icons: [
                    'fa-shield-halved', 'fa-shield', 'fa-user-shield', 'fa-helmet-safety',
                    'fa-wind', 'fa-fan', 'fa-lungs', 'fa-mask-face', 'fa-fire',
                    'fa-temperature-high', 'fa-gauge', 'fa-bell', 'fa-heart-pulse'
                ]
            },
            initials: { 
                name: '✏️ Initials', 
                icons: [] 
            },
            faces: {
                name: '😊 Faces',
                icons: [
                    'fa-face-smile', 'fa-face-grin', 'fa-face-laugh', 'fa-face-grin-stars',
                    'fa-face-grin-beam', 'fa-face-smile-wink', 'fa-face-kiss-wink-heart',
                    'fa-face-laugh-beam', 'fa-face-grin-hearts', 'fa-face-surprise'
                ]
            },
            people: {
                name: '👤 People',
                icons: [
                    'fa-user', 'fa-user-astronaut', 'fa-user-ninja', 'fa-user-secret',
                    'fa-user-tie', 'fa-user-graduate', 'fa-user-doctor', 'fa-person',
                    'fa-robot', 'fa-ghost'
                ]
            },
            nature: {
                name: '🌿 Nature',
                icons: [
                    'fa-leaf', 'fa-seedling', 'fa-tree', 'fa-clover', 'fa-sun',
                    'fa-moon', 'fa-star', 'fa-cloud', 'fa-snowflake', 'fa-rainbow',
                    'fa-mountain', 'fa-water'
                ]
            },
            animals: {
                name: '🐾 Animals',
                icons: [
                    'fa-cat', 'fa-dog', 'fa-fish', 'fa-dove', 'fa-dragon',
                    'fa-horse', 'fa-frog', 'fa-crow', 'fa-spider', 'fa-paw'
                ]
            },
            objects: {
                name: '⭐ Objects',
                icons: [
                    'fa-gem', 'fa-crown', 'fa-bolt', 'fa-rocket', 'fa-gamepad',
                    'fa-music', 'fa-trophy', 'fa-medal', 'fa-gift', 'fa-heart'
                ]
            },
            tech: {
                name: '💻 Tech',
                icons: [
                    'fa-microchip', 'fa-laptop', 'fa-desktop', 'fa-mobile',
                    'fa-wifi', 'fa-server', 'fa-database', 'fa-code', 'fa-terminal'
                ]
            }
        },

        defaults: { 
            bgColor: '#10b981', 
            bgGradient: true 
        }
    };

    // ============ STATE ============
    const State = {
        isOpen: false,
        currentTab: 'safety',
        selectedIcon: null,
        selectedColor: '#10b981',
        useGradient: true,
        originalData: {},
        userInitials: 'U',
        hasChanges: false,
        isInitialized: false,
        isSaving: false
    };

    // ============ DOM CACHE ============
    const DOM = {};
    
    // ============ STORAGE ============
    const Storage = {
        save(icon, color, gradient, initials) {
            const data = { 
                icon, 
                color, 
                gradient, 
                initials, 
                timestamp: Date.now() 
            };
            
            try { 
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); 
            } catch (e) {
                console.warn('⚠️ LocalStorage save failed:', e);
            }
            
            try {
                const session = JSON.parse(sessionStorage.getItem('breathsafeUser') || '{}');
                if (icon) session.avatarIcon = icon;
                else delete session.avatarIcon;
                session.avatarBgColor = color;
                session.avatarBgGradient = gradient;
                sessionStorage.setItem('breathsafeUser', JSON.stringify(session));
            } catch (e) {
                console.warn('⚠️ SessionStorage save failed:', e);
            }
            
            try { 
                localStorage.setItem('breathsafe_avatar_changed', Date.now().toString()); 
            } catch (e) {}
            
            return data;
        },

        load() {
            try {
                const saved = localStorage.getItem(STORAGE_KEY);
                if (saved) return JSON.parse(saved);
            } catch (e) {}
            
            try {
                const session = JSON.parse(sessionStorage.getItem('breathsafeUser') || '{}');
                return {
                    icon: session.avatarIcon || null,
                    color: session.avatarBgColor || '#10b981',
                    gradient: session.avatarBgGradient !== false,
                    initials: ((session.firstName?.[0] || '') + (session.lastName?.[0] || '')).toUpperCase() || 'U'
                };
            } catch (e) {
                return { 
                    icon: null, 
                    color: '#10b981', 
                    gradient: true, 
                    initials: 'U' 
                };
            }
        }
    };

    // ============ UTILITIES ============
    const Utils = {
        getInitials() {
            try {
                const session = JSON.parse(sessionStorage.getItem('breathsafeUser') || '{}');
                const f = (session.firstName || '')[0] || '';
                const l = (session.lastName || '')[0] || '';
                return (f + l).toUpperCase() || session.username?.substring(0, 2).toUpperCase() || 'U';
            } catch (e) {
                return 'U';
            }
        },

        getUserId() {
            try {
                const session = JSON.parse(sessionStorage.getItem('breathsafeUser') || '{}');
                return session.userId || session.id || session.uid || null;
            } catch (e) {
                return null;
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
                window.showToast(message, '', type);
                return;
            }
            
            const toast = document.createElement('div');
            toast.className = `avatar-toast ${type}`;
            toast.innerHTML = `
                <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
                <span>${message}</span>
            `;
            document.body.appendChild(toast);
            
            requestAnimationFrame(() => {
                toast.classList.add('show');
            });
            
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }
    };

    // ============ RENDERER ============
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
                initialsElement.className = 'avatar-initials';
                initialsElement.textContent = typeof initials === 'string' ? initials.slice(0, 4) : 'U';
                el.replaceChildren(initialsElement);
                el.classList.remove('avatar--has-icon');
            }
        },

        updateAll() {
            const { selectedIcon, userInitials, selectedColor, useGradient } = State;
            
            const avatarSelectors = [
                '#profileAvatar',
                '#avatarPreview',
                '#headerAvatar',
                '#dropdownAvatar',
                '.user-avatar-display'
            ];
            
            // Batch update using requestAnimationFrame
            requestAnimationFrame(() => {
                avatarSelectors.forEach(selector => {
                    const el = document.querySelector(selector);
                    if (el) {
                        this.updateAvatar(el, selectedIcon, userInitials, selectedColor, useGradient);
                    }
                });
                
                const initialsEl = document.getElementById('avatarInitials');
                if (initialsEl && !State.selectedIcon) {
                    initialsEl.textContent = userInitials;
                }
            });
        }
    };

    // ============ MODAL ============
    const Modal = {
        init() {
            if (State.isInitialized) return;
            
            this.loadState();
            this.create();
            this.cacheDOMElements();
            this.bindEvents();
            this.addEditButton();
            
            State.isInitialized = true;
            console.log('✅ UserAvatarPicker v2.0 Ready');
        },

        loadState() {
            const saved = Storage.load();
            State.userInitials = Utils.getInitials() || saved.initials || 'U';
            State.selectedIcon = saved.icon;
            State.selectedColor = saved.color || '#10b981';
            State.useGradient = saved.gradient !== false;
            State.originalData = { 
                icon: State.selectedIcon, 
                color: State.selectedColor, 
                gradient: State.useGradient 
            };
            Renderer.updateAll();
        },

        create() {
            if (document.getElementById('userAvatarPickerModal')) return;

            const html = `
                <div class="avatar-picker-modal" id="userAvatarPickerModal">
                    <div class="avatar-picker-backdrop" id="avatarPickerBackdrop"></div>
                    <div class="avatar-picker-dialog">
                        <div class="avatar-picker-header">
                            <div class="avatar-picker-title">
                                <i class="fas fa-palette"></i>
                                <span>Customize Avatar</span>
                            </div>
                            <button class="avatar-picker-close" id="avatarPickerClose" type="button">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        
                        <div class="avatar-picker-body">
                            <div class="avatar-preview-section">
                                <div class="avatar-preview-container">
                                    <div class="avatar-preview" id="avatarPreview">
                                        <span class="avatar-initials">${State.userInitials}</span>
                                    </div>
                                    <div class="avatar-preview-rings">
                                        <span></span>
                                        <span></span>
                                    </div>
                                </div>
                                <span class="avatar-preview-label">Preview</span>
                            </div>

                            <div class="avatar-section">
                                <label class="avatar-section-label">
                                    <i class="fas fa-fill-drip"></i>
                                    Background Style
                                </label>
                                <div class="avatar-style-toggle">
                                    <button type="button" class="avatar-style-btn ${!State.useGradient ? 'active' : ''}" data-style="solid">
                                        <i class="fas fa-square"></i>
                                        <span>Solid</span>
                                    </button>
                                    <button type="button" class="avatar-style-btn ${State.useGradient ? 'active' : ''}" data-style="gradient">
                                        <i class="fas fa-fill"></i>
                                        <span>Gradient</span>
                                    </button>
                                </div>
                            </div>

                            <div class="avatar-section">
                                <label class="avatar-section-label">
                                    <i class="fas fa-palette"></i>
                                    Color
                                </label>
                                <div class="avatar-color-grid" id="avatarColorGrid"></div>
                            </div>

                            <div class="avatar-section">
                                <label class="avatar-section-label">
                                    <i class="fas fa-icons"></i>
                                    Icon
                                </label>
                                <div class="avatar-tabs-wrapper">
                                    <button class="avatar-tabs-scroll avatar-tabs-scroll--left" id="tabScrollLeft" type="button">
                                        <i class="fas fa-chevron-left"></i>
                                    </button>
                                    <div class="avatar-tabs" id="avatarTabs"></div>
                                    <button class="avatar-tabs-scroll avatar-tabs-scroll--right" id="tabScrollRight" type="button">
                                        <i class="fas fa-chevron-right"></i>
                                    </button>
                                </div>
                                <div class="avatar-icon-grid" id="avatarIconGrid"></div>
                            </div>
                        </div>

                        <div class="avatar-picker-footer">
                            <button type="button" class="avatar-btn avatar-btn--reset" id="avatarResetBtn">
                                <i class="fas fa-undo"></i>
                                <span>Reset</span>
                            </button>
                            <div class="avatar-picker-actions">
                                <button type="button" class="avatar-btn avatar-btn--cancel" id="avatarCancelBtn">
                                    Cancel
                                </button>
                                <button type="button" class="avatar-btn avatar-btn--save" id="avatarSaveBtn">
                                    <i class="fas fa-check"></i>
                                    <span>Save</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', html);
        },

        cacheDOMElements() {
            DOM.modal = document.getElementById('userAvatarPickerModal');
            DOM.backdrop = document.getElementById('avatarPickerBackdrop');
            DOM.close = document.getElementById('avatarPickerClose');
            DOM.preview = document.getElementById('avatarPreview');
            DOM.colorGrid = document.getElementById('avatarColorGrid');
            DOM.tabs = document.getElementById('avatarTabs');
            DOM.iconGrid = document.getElementById('avatarIconGrid');
            DOM.tabScrollLeft = document.getElementById('tabScrollLeft');
            DOM.tabScrollRight = document.getElementById('tabScrollRight');
            DOM.resetBtn = document.getElementById('avatarResetBtn');
            DOM.cancelBtn = document.getElementById('avatarCancelBtn');
            DOM.saveBtn = document.getElementById('avatarSaveBtn');
        },

        renderColors() {
            if (!DOM.colorGrid) return;

            const fragment = document.createDocumentFragment();
            
            CONFIG.colors.forEach(c => {
                const selected = c.primary === State.selectedColor;
                const bg = State.useGradient 
                    ? `linear-gradient(135deg, ${c.primary}, ${c.secondary})` 
                    : c.primary;
                
                const button = document.createElement('button');
                button.type = 'button';
                button.className = `avatar-color ${selected ? 'selected' : ''}`;
                button.dataset.color = c.primary;
                button.dataset.secondary = c.secondary;
                button.style.background = bg;
                button.title = c.name;
                button.innerHTML = '<i class="fas fa-check"></i>';
                
                fragment.appendChild(button);
            });
            
            DOM.colorGrid.innerHTML = '';
            DOM.colorGrid.appendChild(fragment);
        },

        renderTabs() {
            if (!DOM.tabs) return;

            const fragment = document.createDocumentFragment();
            
            Object.entries(CONFIG.iconCategories).forEach(([key, cat]) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = `avatar-tab ${key === State.currentTab ? 'active' : ''}`;
                button.dataset.category = key;
                button.textContent = cat.name;
                fragment.appendChild(button);
            });
            
            DOM.tabs.innerHTML = '';
            DOM.tabs.appendChild(fragment);
        },

        renderIcons(category) {
            if (!DOM.iconGrid) return;

            State.currentTab = category;
            const fragment = document.createDocumentFragment();

            if (category === 'initials') {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = `avatar-icon avatar-icon--initials ${!State.selectedIcon ? 'selected' : ''}`;
                button.dataset.icon = '';
                button.textContent = State.userInitials;
                fragment.appendChild(button);
            } else {
                const icons = CONFIG.iconCategories[category]?.icons || [];
                icons.forEach(icon => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = `avatar-icon ${State.selectedIcon === icon ? 'selected' : ''}`;
                    button.dataset.icon = icon;
                    button.innerHTML = `<i class="fas ${icon}"></i>`;
                    fragment.appendChild(button);
                });
            }

            DOM.iconGrid.innerHTML = '';
            DOM.iconGrid.appendChild(fragment);

            // Update active tab
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
                btn.style.background = State.useGradient 
                    ? `linear-gradient(135deg, ${color}, ${secondary})` 
                    : color;
            });
        },

        addEditButton() {
            const container = document.querySelector('.avatar-wrapper.profile-avatar');
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
            // Use event delegation for better performance
            document.addEventListener('click', (e) => {
                const target = e.target.closest('button, [role="button"]');
                if (!target) return;

                // Open modal
                if (target.id === 'avatarEditBtn') { 
                    e.preventDefault(); 
                    this.open(); 
                    return; 
                }
                
                // Close modal
                if (target.id === 'avatarPickerClose' || 
                    target.id === 'avatarCancelBtn' || 
                    target === DOM.backdrop) { 
                    this.close(); 
                    return; 
                }
                
                // Reset
                if (target.id === 'avatarResetBtn') { 
                    e.preventDefault(); 
                    this.reset(); 
                    return; 
                }
                
                // Save
                if (target.id === 'avatarSaveBtn') { 
                    e.preventDefault(); 
                    this.save(); 
                    return; 
                }

                // Tab selection
                if (target.classList.contains('avatar-tab')) { 
                    e.preventDefault(); 
                    this.renderIcons(target.dataset.category); 
                    return; 
                }

                // Icon selection
                if (target.classList.contains('avatar-icon')) { 
                    e.preventDefault(); 
                    this.selectIcon(target.dataset.icon); 
                    return; 
                }

                // Color selection
                if (target.classList.contains('avatar-color')) { 
                    e.preventDefault(); 
                    this.selectColor(target.dataset.color); 
                    return; 
                }

                // Style toggle
                if (target.classList.contains('avatar-style-btn')) { 
                    e.preventDefault(); 
                    this.setStyle(target.dataset.style === 'gradient'); 
                    return; 
                }

                // Tab scroll buttons
                if (target.id === 'tabScrollLeft') {
                    DOM.tabs?.scrollBy({ left: -120, behavior: 'smooth' });
                    return;
                }
                if (target.id === 'tabScrollRight') {
                    DOM.tabs?.scrollBy({ left: 120, behavior: 'smooth' });
                    return;
                }
            });

            // Escape key to close
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && State.isOpen) this.close();
            });
        },

        open() {
            if (!DOM.modal) return;

            State.originalData = { 
                icon: State.selectedIcon, 
                color: State.selectedColor, 
                gradient: State.useGradient 
            };
            State.hasChanges = false;

            this.renderColors();
            this.renderTabs();
            this.renderIcons(State.currentTab);
            this.updateStyleButtons();
            Renderer.updateAll();

            requestAnimationFrame(() => {
                DOM.modal.classList.add('active');
                State.isOpen = true;
                document.body.style.overflow = 'hidden';
            });
        },

        close() {
            if (!DOM.modal) return;

            if (State.hasChanges) {
                State.selectedIcon = State.originalData.icon;
                State.selectedColor = State.originalData.color;
                State.useGradient = State.originalData.gradient;
                Renderer.updateAll();
            }

            DOM.modal.classList.remove('active');
            State.isOpen = false;
            document.body.style.overflow = '';
        },

        selectIcon(icon) {
            State.selectedIcon = icon || null;
            State.hasChanges = true;

            // Batch DOM updates
            requestAnimationFrame(() => {
                document.querySelectorAll('.avatar-icon').forEach(btn => {
                    const btnIcon = btn.dataset.icon;
                    btn.classList.toggle('selected', (btnIcon === icon) || (btnIcon === '' && !icon));
                });
                
                Renderer.updateAll();
            });
        },

        selectColor(color) {
            State.selectedColor = color;
            State.hasChanges = true;

            requestAnimationFrame(() => {
                document.querySelectorAll('.avatar-color').forEach(btn => {
                    btn.classList.toggle('selected', btn.dataset.color === color);
                });
                
                Renderer.updateAll();
            });
        },

        setStyle(useGradient) {
            State.useGradient = useGradient;
            State.hasChanges = true;
            
            requestAnimationFrame(() => {
                this.updateStyleButtons();
                this.updateColorStyles();
                Renderer.updateAll();
            });
        },

        reset() {
            State.selectedIcon = null;
            State.selectedColor = CONFIG.defaults.bgColor;
            State.useGradient = CONFIG.defaults.bgGradient;
            State.hasChanges = true;
            State.currentTab = 'initials';

            requestAnimationFrame(() => {
                this.renderColors();
                this.renderIcons('initials');
                this.renderTabs();
                this.updateStyleButtons();
                Renderer.updateAll();
            });
        },

        async save() {
            if (State.isSaving) return;

            if (!DOM.saveBtn) return;

            State.isSaving = true;
            DOM.saveBtn.disabled = true;
            DOM.saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

            try {
                const userId = Utils.getUserId();
                
                // Update Firestore if available
                if (userId && typeof firebase !== 'undefined') {
                    try {
                        const db = firebase.firestore();
                        
                        const updateData = { 
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp() 
                        };
                        
                        if (State.selectedIcon) {
                            updateData.avatarIcon = State.selectedIcon;
                        } else {
                            updateData.avatarIcon = firebase.firestore.FieldValue.delete();
                        }
                        updateData.avatarBgColor = State.selectedColor;
                        updateData.avatarBgGradient = State.useGradient;

                        await db.collection('users').doc(userId).update(updateData);
                        console.log('✅ Avatar saved to Firestore');
                        
                    } catch (firebaseError) {
                        console.warn('⚠️ Firestore save failed:', firebaseError);
                    }
                }

                // Save to storage
                Storage.save(
                    State.selectedIcon, 
                    State.selectedColor, 
                    State.useGradient, 
                    State.userInitials
                );

                // Update original data
                State.originalData = { 
                    icon: State.selectedIcon, 
                    color: State.selectedColor, 
                    gradient: State.useGradient 
                };
                State.hasChanges = false;

                // Mark profile as updated for dashboard sync
                sessionStorage.setItem('profileUpdated', 'true');

                Utils.showToast('Avatar saved successfully!', 'success');

                // Close modal
                setTimeout(() => {
                    if (DOM.modal) DOM.modal.classList.remove('active');
                    State.isOpen = false;
                    document.body.style.overflow = '';
                }, 300);

            } catch (error) {
                console.error('❌ Save failed:', error);
                Utils.showToast('Failed to save avatar', 'error');
            } finally {
                State.isSaving = false;
                DOM.saveBtn.disabled = false;
                DOM.saveBtn.innerHTML = '<i class="fas fa-check"></i> <span>Save</span>';
            }
        }
    };

    // ============ INITIALIZATION ============
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                requestAnimationFrame(() => Modal.init());
            });
        } else {
            requestAnimationFrame(() => Modal.init());
        }
    }

    // Auto-initialize
    init();

    // ============ PUBLIC API ============
    window.UserAvatarPicker = {
        init: () => Modal.init(),
        open: () => Modal.open(),
        close: () => Modal.close(),
        refresh: () => {
            Modal.loadState();
            Renderer.updateAll();
        },
        getState: () => ({ ...State }),
        storage: Storage
    };

    console.log('✅ UserAvatarPicker v2.0 Loaded - Optimized');

})();
