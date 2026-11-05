// ================================
// BREATHSAFE ADMIN DASHBOARD - CORE v3.2
// Logout modal (no duplicate confirmations)
// Regular Admin can delete users but NOT admins
// ================================

console.log("🚀 BreathSafe Core v3.2 Loading (Logout Modal Fixed)...");

const AdminCore = (() => {
    'use strict';

    // ==========================================
    // FIREBASE CONFIG
    // ==========================================
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

    // ==========================================
    // PERFORMANCE UTILITIES
    // ==========================================
    const raf = window.requestAnimationFrame || (fn => setTimeout(fn, 16));
    const rIC = window.requestIdleCallback || (fn => setTimeout(fn, 1));
    const now = Date.now;

    const debounce = (fn, ms) => {
        let t;
        return function(...a) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, a), ms);
        };
    };

    const throttle = (fn, ms) => {
        let last = 0, pending;
        return function(...a) {
            const n = now();
            if (n - last >= ms) {
                last = n;
                fn.apply(this, a);
            } else if (!pending) {
                pending = setTimeout(() => {
                    last = now();
                    pending = null;
                    fn.apply(this, a);
                }, ms - (n - last));
            }
        };
    };

    // ==========================================
    // PRIVATE STATE
    // ==========================================
    const _state = {
        db: null,
        rtdb: null,
        allUsers: [],
        filteredUsers: [],
        selectedUsers: new Set(),
        userCache: new Map(),
        currentAdminId: null,
        currentAdminUsername: null,
        currentAdminData: null,
        initialized: false,
        isLoading: false,
        renderPending: false,
        lastRenderTime: 0,
        minRenderInterval: 50,
        cache: new Map(),
        cacheExpiry: 60000,
        visibleRange: { start: 0, end: 50 },
        worker: null,
        workerReady: false,
        workerCallbacks: new Map(),
        deferredInit: false,
        criticalOnly: true,
        _dom: {},
        _lazyLoadStarted: false
    };

    // ==========================================
    // DOM CACHE (Reduces queries)
    // ==========================================
    const getEl = (id) => {
        if (!_state._dom[id]) {
            _state._dom[id] = document.getElementById(id);
        }
        return _state._dom[id];
    };

    const clearDomCache = () => {
        _state._dom = {};
    };

    // ==========================================
    // LAZY LOADING UTILITIES
    // ==========================================
    const lazyLoad = (fn, delay = 100) => {
        if (document.hidden) {
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) {
                    setTimeout(fn, delay);
                }
            }, { once: true });
        } else {
            rIC(() => fn(), { timeout: delay });
        }
    };

    // ==========================================
    // MEMOIZED UTILITIES
    // ==========================================
    const _avatarCache = new Map();
    const getAvatarVariant = (str) => {
        if (!str) return 'variant-1';
        let v = _avatarCache.get(str);
        if (v) return v;
        
        const code = str.charCodeAt(0) + (str.length > 1 ? str.charCodeAt(str.length - 1) : 0);
        v = 'variant-' + ((code % 5) + 1);
        
        if (_avatarCache.size > 200) {
            const first = _avatarCache.keys().next().value;
            _avatarCache.delete(first);
        }
        _avatarCache.set(str, v);
        return v;
    };

    const getInitials = (user) => {
        if (user.firstName && user.lastName) {
            return (user.firstName[0] + user.lastName[0]).toUpperCase();
        }
        return user.username ? user.username.substring(0, 2).toUpperCase() : 'U';
    };

    const _dateCache = new Map();
    const formatDate = (timestamp) => {
        if (!timestamp) return 'N/A';
        const key = timestamp.seconds || timestamp;
        let result = _dateCache.get(key);
        if (result) return result;
        
        try {
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            result = date.toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch {
            result = 'N/A';
        }
        
        if (_dateCache.size > 500) {
            const first = _dateCache.keys().next().value;
            _dateCache.delete(first);
        }
        _dateCache.set(key, result);
        return result;
    };

    const formatDateShort = (timestamp) => {
        if (!timestamp) return 'N/A';
        try {
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } catch {
            return 'N/A';
        }
    };

    const _escapeEl = document.createElement('div');
    const escapeHtml = (str) => {
        if (!str) return '';
        _escapeEl.textContent = str;
        return _escapeEl.innerHTML;
    };

    // ==========================================
    // PERMISSION CHECKER
    // ==========================================
    const hasPermission = (permission) => {
        if (!_state.currentAdminData) return false;
        
        // Executive has all permissions
        if (_state.currentAdminData.role === 'executive') return true;
        
        // Check specific permission
        return _state.currentAdminData.permissions?.[permission] === true;
    };

    const canDeleteUser = (user) => {
        if (!user) return false;
        
        // Cannot delete yourself
        if (user.id === _state.currentAdminId || user.username === _state.currentAdminUsername) {
            return false;
        }
        
        const isAdmin = user.role === 'admin' || user.role === 'executive' || user.isAdmin;
        
        // Regular admin can delete users but NOT admins
        if (_state.currentAdminData?.role === 'regular') {
            return !isAdmin;
        }
        
        // Executive can delete anyone except other executives (safety measure)
        if (_state.currentAdminData?.role === 'executive') {
            return user.role !== 'executive';
        }
        
        return false;
    };

    // ==========================================
    // WEB WORKER (Deferred)
    // ==========================================
    const workerCode = `
self.onmessage=function(e){var t=e.data,r=t.type,d=t.data,i=t.id,o;switch(r){case'filter':o=d.users.filter(function(u){var s=(d.search||'').toLowerCase(),m=!s||(u.username&&u.username.toLowerCase().includes(s))||(u.email&&u.email.toLowerCase().includes(s))||(u.firstName&&u.firstName.toLowerCase().includes(s))||(u.lastName&&u.lastName.toLowerCase().includes(s)),st=d.status==='all'||(u.status||'pending').toLowerCase()===d.status,a=u.role==='admin'||u.role==='executive'||u.isAdmin,rl=d.role==='all'||(d.role==='admin'&&a)||(d.role==='user'&&!a);return m&&st&&rl});break;case'processStats':o={total:d.users.length,active:d.users.filter(function(u){return u.status==='active'}).length,pending:d.users.filter(function(u){return!u.status||u.status==='pending'}).length,inactive:d.users.filter(function(u){return u.status==='inactive'}).length};break;default:o=d}self.postMessage({id:i,data:o})}`;

    const initWorker = () => {
        if (_state.worker || !window.Worker) return;
        lazyLoad(() => {
            try {
                const blob = new Blob([workerCode], { type: 'application/javascript' });
                _state.worker = new Worker(URL.createObjectURL(blob));
                _state.workerReady = true;
                
                _state.worker.onmessage = (e) => {
                    const cb = _state.workerCallbacks.get(e.data.id);
                    if (cb) {
                        cb(e.data.data);
                        _state.workerCallbacks.delete(e.data.id);
                    }
                };
                _state.worker.onerror = () => { _state.workerReady = false; };
            } catch (e) {
                _state.workerReady = false;
            }
        }, 500);
    };

    const workerTask = (type, data) => new Promise(resolve => {
        if (!_state.workerReady) {
            resolve(mainThreadTask(type, data));
            return;
        }
        const id = Math.random().toString(36).substr(2, 9);
        _state.workerCallbacks.set(id, resolve);
        _state.worker.postMessage({ type, data, id });
        setTimeout(() => {
            if (_state.workerCallbacks.has(id)) {
                _state.workerCallbacks.delete(id);
                resolve(mainThreadTask(type, data));
            }
        }, 200);
    });

    const mainThreadTask = (type, data) => {
        if (type === 'filter') {
            return filterUsersSync(data.users, data.search, data.role, data.status);
        }
        if (type === 'processStats') {
            const users = data.users;
            let active = 0, pending = 0, inactive = 0;
            for (let i = 0; i < users.length; i++) {
                const s = users[i].status;
                if (s === 'active') active++;
                else if (s === 'inactive') inactive++;
                else pending++;
            }
            return { total: users.length, active, pending, inactive };
        }
        return data;
    };

    const filterUsersSync = (users, search, role, status) => {
        const s = (search || '').toLowerCase();
        const result = [];
        for (let i = 0; i < users.length; i++) {
            const u = users[i];
            const matchSearch = !s || 
                (u.username && u.username.toLowerCase().includes(s)) ||
                (u.email && u.email.toLowerCase().includes(s)) ||
                (u.firstName && u.firstName.toLowerCase().includes(s)) ||
                (u.lastName && u.lastName.toLowerCase().includes(s));
            
            if (!matchSearch) continue;
            
            const uStatus = (u.status || 'pending').toLowerCase();
            if (status !== 'all' && uStatus !== status) continue;
            
            const isAdmin = u.role === 'admin' || u.role === 'executive' || u.isAdmin;
            if (role !== 'all') {
                if (role === 'admin' && !isAdmin) continue;
                if (role === 'user' && isAdmin) continue;
            }
            
            result.push(u);
        }
        return result;
    };

    // ==========================================
    // CACHE
    // ==========================================
    const cache = {
        get(key) {
            const item = _state.cache.get(key);
            if (!item || now() > item.expiry) {
                _state.cache.delete(key);
                return null;
            }
            return item.value;
        },
        set(key, value, ttl = _state.cacheExpiry) {
            if (_state.cache.size > 100) {
                const first = _state.cache.keys().next().value;
                _state.cache.delete(first);
            }
            _state.cache.set(key, { value, expiry: now() + ttl });
        },
        invalidate(pattern) {
            if (!pattern) { _state.cache.clear(); return; }
            for (const key of _state.cache.keys()) {
                if (key.includes(pattern)) _state.cache.delete(key);
            }
        }
    };

    // ==========================================
    // TOAST
    // ==========================================
    const showToast = (message, type = 'info') => {
        if (window.SharedState?.notify) {
            SharedState.notify(message, type);
        } else {
            console.log(`[Toast ${type}] ${message}`);
        }
    };

    // ==========================================
    // FIREBASE INITIALIZATION (CRITICAL)
    // ==========================================
    const initFirestore = () => {
        if (_state.db) return true;
        
        if (window.SharedState?.db && window.SharedState?.rtdb) {
            _state.db = window.SharedState.db;
            _state.rtdb = window.SharedState.rtdb;
            console.log("✅ Core: Using SharedState Firebase instances.");
            return true;
        }
        
        console.error("❌ Core: SharedState Firebase instances not available. Core cannot function.");
        return false;
    };

    // ==========================================
    // ADMIN SESSION (CRITICAL)
    // ==========================================
    const loadAdminInfo = () => {
        if (window.SharedState?.currentAdmin) {
            const admin = window.SharedState.currentAdmin;
            _state.currentAdminId = admin.id || admin.username;
            _state.currentAdminUsername = admin.username;
            _state.currentAdminData = admin;
            raf(() => updateAdminUI(admin));
            console.log('✅ Core: Admin loaded from SharedState:', _state.currentAdminUsername, '(Role:', admin.role + ')');
            
            updateUIForPermissions();
            return;
        }
        console.error("❌ Core: Admin data not available from SharedState.");
    };

    const updateAdminUI = (admin) => {
        const initials = getInitials(admin);
        const fullName = [admin.firstName, admin.lastName].filter(Boolean).join(' ') || admin.username || 'Admin User';
        
        const updates = [
            ['headerAvatarText', initials],
            ['headerUsername', admin.username || 'Admin'],
            ['dropdownAvatarText', initials],
            ['dropdownUsername', fullName],
            ['dropdownEmail', admin.email || 'admin@breathsafe.com']
        ];
        
        for (let i = 0; i < updates.length; i++) {
            const el = getEl(updates[i][0]);
            if (el) el.textContent = updates[i][1];
        }
    };

    const updateUIForPermissions = () => {
        const addAdminBtn = getEl('addAdminBtn');
        if (addAdminBtn) {
            if (!hasPermission('canCreateAdmins')) {
                addAdminBtn.style.display = 'none';
            } else {
                addAdminBtn.style.display = '';
            }
        }
    };

    const getAdminFullName = () => {
        if (window.SharedState?.getAdminFullName) return window.SharedState.getAdminFullName();
        if (!_state.currentAdminData) return 'Administrator';
        const first = _state.currentAdminData.firstName || '';
        const last = _state.currentAdminData.lastName || '';
        return `${first} ${last}`.trim() || _state.currentAdminData.username || 'Administrator';
    };

    // ==========================================
    // ACTIVITY LOGGING (Centralized)
    // ==========================================
    const logActivity = async (action, target = null, details = {}) => {
        if (window.BreathSafeLogger && typeof window.BreathSafeLogger.log === 'function') {
            try {
                return await window.BreathSafeLogger.log(action, details, target || '');
            } catch (e) {
                console.error('BreathSafeLogger failed, falling back:', e);
            }
        }
        if (window.SharedState?.logActivity) {
            return await window.SharedState.logActivity(action, target, details);
        }
        console.error("❌ Core: Logging system not available.");
        return null;
    };

    // ==========================================
    // LOAD USERS ()
    // ==========================================
    const loadUsers = async () => {
        if (_state.isLoading) return;
        _state.isLoading = true;
        
        console.log("📥 Loading users...");
        
        const tbody = getEl('usersTableBody');
        if (!tbody) { 
            _state.isLoading = false; 
            return; 
        }
        
        tbody.innerHTML = '<tr><td colspan="8" class="loading-cell"><div class="spinner"></div><span class="muted">Loading users...</span></td></tr>';
        
        const db = _state.db || window.SharedState?.db;
        if (!db) {
            tbody.innerHTML = '<tr><td colspan="8" class="loading-cell"><i class="fas fa-exclamation-triangle" style="font-size:2rem;color:var(--warning);margin-bottom:1rem;display:block;"></i><span class="muted">Database not connected</span></td></tr>';
            _state.isLoading = false;
            return;
        }
        
        try {
            _state.allUsers = [];
            _state.userCache.clear();
            
            const [usersSnap, adminsSnap] = await Promise.all([
                db.collection('users').get(),
                db.collection('admins').get()
            ]);
            
            usersSnap.forEach(doc => {
                const data = doc.data();
                const user = { 
                    id: doc.id, 
                    username: data.username || '',
                    email: data.email || '',
                    firstName: data.firstName || '',
                    lastName: data.lastName || '',
                    phoneNumber: data.phoneNumber || '',
                    status: data.status || 'pending',
                    createdAt: data.createdAt,
                    activatedAt: data.activatedAt,
                    apiToken: data.apiToken || '',
                    assignedSensorTypes: data.assignedSensorTypes || [],
                    isAdmin: false,
                    role: 'user'
                };
                _state.allUsers.push(user);
                _state.userCache.set(doc.id, user);
            });
            
            adminsSnap.forEach(doc => {
                const d = doc.data();
                const admin = {
                    id: doc.id, 
                    username: d.username || doc.id, 
                    email: d.email || '',
                    firstName: d.firstName || '', 
                    lastName: d.lastName || '',
                    phoneNumber: d.phoneNumber || '', 
                    status: 'active',
                    createdAt: d.createdAt, 
                    activatedAt: d.createdAt,
                    apiToken: d.apiToken || '', 
                    role: d.role || 'admin', 
                    permissions: d.permissions || {}, 
                    isAdmin: true,
                    assignedSensorTypes: []
                };
                _state.allUsers.push(admin);
                _state.userCache.set(doc.id, admin);
            });
            
            console.log(`✅ Loaded ${_state.allUsers.length} (${usersSnap.size} users + ${adminsSnap.size} admins)`);
            
            _state.filteredUsers = _state.allUsers.slice();
            cache.invalidate('stats');
            
            rIC(() => updateStats());
            scheduleRender();
            
        } catch (error) {
            console.error("❌ Load error:", error);
            tbody.innerHTML = '<tr><td colspan="8" class="loading-cell"><i class="fas fa-exclamation-circle" style="font-size:2rem;color:var(--danger);margin-bottom:1rem;display:block;"></i><span class="muted">Failed to load users.</span><br><br><button onclick="AdminCore.loadUsers()" class="btn-primary">Retry</button></td></tr>';
        } finally {
            _state.isLoading = false;
        }
    };

    // ==========================================
    // UPDATE STATS ()
    // ==========================================
    const updateStats = async () => {
        let stats = cache.get('stats');
        
        if (!stats) {
            stats = mainThreadTask('processStats', { users: _state.allUsers });
            cache.set('stats', stats, 10000);
        }
        
        console.log(`📊 Stats - Total: ${stats.total}, Active: ${stats.active}, Pending: ${stats.pending}`);
        
        raf(() => {
            const updates = [
                ['totalUsers', stats.total],
                ['activeUsers', stats.active],
                ['pendingUsers', stats.pending + stats.inactive],
                ['cardUserCount', stats.total],
                ['cardActiveUsers', stats.active],
                ['quickTotalUsers', stats.total]
            ];
            
            for (let i = 0; i < updates.length; i++) {
                const el = getEl(updates[i][0]);
                if (el && el.textContent !== String(updates[i][1])) {
                    el.textContent = updates[i][1];
                }
            }
        });
    };

    // ==========================================
    // RENDER USERS (HIGHLY )
    // ==========================================
    const scheduleRender = () => {
        if (_state.renderPending) return;
        
        const elapsed = now() - _state.lastRenderTime;
        if (elapsed >= _state.minRenderInterval) {
            _state.renderPending = true;
            raf(() => {
                _state.renderPending = false;
                _state.lastRenderTime = now();
                renderUsers();
            });
        } else {
            _state.renderPending = true;
            setTimeout(() => {
                _state.renderPending = false;
                _state.lastRenderTime = now();
                renderUsers();
            }, _state.minRenderInterval - elapsed);
        }
    };

    const renderUsers = () => {
        const tbody = getEl('usersTableBody');
        if (!tbody) return;
        
        const users = _state.filteredUsers;
        const len = users.length;
        
        if (len === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="loading-cell"><i class="fas fa-users" style="font-size:3rem;color:var(--muted);margin-bottom:1rem;display:block;"></i><span class="muted">No users found</span></td></tr>';
            return;
        }
        
        const adminRole = _state.currentAdminData?.role || 'executive';
        const adminId = _state.currentAdminId;
        const adminUsername = _state.currentAdminUsername;
        const selected = _state.selectedUsers;
        
        const fragment = document.createDocumentFragment();
        const usersToRender = len > 100 ? users.slice(0, 100) : users;
        
        for (let i = 0; i < usersToRender.length; i++) {
            const u = usersToRender[i];
            const tr = document.createElement('tr');
            tr.dataset.userId = u.id;
            
            const initials = getInitials(u);
            const variant = getAvatarVariant(u.username);
            const isAdmin = u.role === 'admin' || u.role === 'executive' || u.isAdmin;
            const isExec = u.role === 'executive';
            const isCurrent = (adminId && u.id === adminId) || (adminUsername && u.username === adminUsername);
            const isSelected = selected.has(u.id);
            
            const canDelete = canDeleteUser(u);
            const canToggle = !isCurrent && !(isExec && adminRole !== 'executive') && !isAdmin;
            
            const status = u.status || 'pending';
            const sensorCount = u.assignedSensorTypes?.length || 0;
            
            if (isCurrent) tr.className = 'current-admin-row';
            
            tr.innerHTML = `
<td onclick="event.stopPropagation()">${canDelete ? `<input type="checkbox" class="user-checkbox" data-user-id="${u.id}"${isSelected ? ' checked' : ''}>` : '<input type="checkbox" disabled style="opacity:.3;cursor:not-allowed;" title="Cannot delete this user">'}</td>
<td><div class="user-cell"><div class="user-avatar-table"><div class="user-initials-table ${variant}">${initials}</div>${isAdmin ? '<span class="admin-badge-table"><i class="fas fa-shield-alt"></i></span>' : ''}</div><div class="user-name-wrapper"><span class="user-name-text">${escapeHtml(u.username || 'Unknown')}</span>${isCurrent ? '<span class="you-badge">You</span>' : ''}</div></div></td>
<td>${escapeHtml(u.email || 'N/A')}</td>
<td><span class="role-badge ${isAdmin ? 'admin' : 'user'}">${isAdmin ? '<i class="fas fa-shield-alt"></i>' : '<i class="fas fa-user"></i>'}${isExec ? 'Executive' : isAdmin ? 'Admin' : 'User'}</span></td>
<td><span class="status-badge ${status}"${canToggle ? ` onclick="AdminCore.toggleUserStatus(event,'${u.id}')" style="cursor:pointer;"` : ' style="cursor:not-allowed;opacity:.7;"'} title="${canToggle ? 'Click to toggle' : 'Cannot change'}"><i class="fas fa-circle"></i>${status.charAt(0).toUpperCase() + status.slice(1)}</span></td>
<td>${sensorCount > 0 ? `<span class="sensor-count-badge" title="${u.assignedSensorTypes.join(', ')}">${sensorCount} sensors</span>` : '<span class="sensor-count-badge empty">No sensors</span>'}</td>
<td class="muted">${formatDateShort(u.createdAt)}</td>
<td onclick="event.stopPropagation()">${status !== 'active' && canToggle ? `<button class="table-action-btn" onclick="AdminCore.activateUser('${u.id}')">Activate</button>` : status === 'active' && !isAdmin ? '<span style="color:var(--primary);font-size:1.2rem;">✓</span>' : ''}</td>`;
            
            fragment.appendChild(tr);
        }
        
        tbody.innerHTML = '';
        tbody.appendChild(fragment);
        attachRowListeners(tbody);
    };

    const attachRowListeners = (tbody) => {
        tbody.onclick = (e) => {
            const row = e.target.closest('tr[data-user-id]');
            if (!row) return;
            if (e.target.closest('input[type="checkbox"]') || e.target.closest('.status-badge') || e.target.closest('button')) return;
            showUserDetails(row.dataset.userId);
        };
        
        const checkboxes = tbody.querySelectorAll('.user-checkbox:not([disabled])');
        for (let i = 0; i < checkboxes.length; i++) {
            checkboxes[i].onchange = (e) => {
                const id = e.target.dataset.userId;
                if (e.target.checked) _state.selectedUsers.add(id);
                else _state.selectedUsers.delete(id);
            };
        }
    };

    // ==========================================
    // FILTER USERS (Debounced)
    // ==========================================
    const filterUsers = debounce(async () => {
        const search = getEl('searchUsers')?.value || '';
        const role = getEl('filterRole')?.value || 'all';
        const status = getEl('filterStatus')?.value || 'all';
        
        _state.filteredUsers = filterUsersSync(_state.allUsers, search, role, status);
        scheduleRender();
    }, 150);

    // ==========================================
    // USER STATUS ACTIONS
    // ==========================================
    const toggleUserStatus = async (event, userId) => {
        event.stopPropagation();
        
        const user = _state.userCache.get(userId);
        if (!user || user.isAdmin || userId === _state.currentAdminId) {
            showToast(user?.isAdmin ? 'Cannot change admin status' : 'User not found', 'error');
            return;
        }
        
        const oldStatus = user.status || 'pending';
        const newStatus = oldStatus === 'active' ? 'inactive' : oldStatus === 'inactive' ? 'pending' : 'active';
        
        user.status = newStatus;
        scheduleRender();
        
        const db = _state.db || window.SharedState?.db;
        if (db && typeof firebase !== 'undefined') {
            try {
                const updateData = {
                    status: newStatus,
                    statusUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    statusUpdatedBy: _state.currentAdminId,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                    welcomeCompleted: false
                };
                
                if (newStatus === 'active') {
                    updateData.activatedAt = firebase.firestore.FieldValue.serverTimestamp();
                    updateData.activatedBy = _state.currentAdminId;
                }
                
                if (newStatus === 'inactive' || newStatus === 'pending') {
                    const rtdb = _state.rtdb || window.SharedState?.rtdb;
                    if (rtdb) {
                        rtdb.ref(`presence/${userId}`).update({ online: false, lastSeen: firebase.database.ServerValue.TIMESTAMP }).catch(() => {});
                        rtdb.ref(`userSessions/${userId}`).set({
                            terminated: true,
                            sessionId: now() + '_status',
                            reason: `Status changed to ${newStatus}`,
                            terminatedBy: _state.currentAdminUsername || 'Admin',
                            timestamp: firebase.database.ServerValue.TIMESTAMP
                        }).catch(() => {});
                    }
                }
                
                await db.collection('users').doc(userId).update(updateData);
                rIC(() => logActivity('status_change', user.username, { oldStatus, newStatus, type: 'user' }));
                
            } catch (error) {
                user.status = oldStatus;
                scheduleRender();
                showToast('Failed: ' + error.message, 'error');
                return;
            }
        }
        
        cache.invalidate('stats');
        rIC(() => updateStats());
        
        const sensors = user.assignedSensorTypes?.length ? ` (${user.assignedSensorTypes.length} sensors preserved)` : '';
        showToast(`${user.username} ${newStatus === 'active' ? 'activated' : newStatus === 'inactive' ? 'deactivated' : 'set to pending'}${sensors}`, 'success');
    };

    const activateUser = async (userId) => {
        const user = _state.userCache.get(userId);
        if (!user || user.status === 'active') {
            showToast(user?.status === 'active' ? 'Already active' : 'User not found', user?.status === 'active' ? 'info' : 'error');
            return;
        }
        
        const oldStatus = user.status || 'pending';
        user.status = 'active';
        scheduleRender();
        
        const db = _state.db || window.SharedState?.db;
        if (db && typeof firebase !== 'undefined') {
            try {
                await db.collection('users').doc(userId).update({
                    status: 'active',
                    activatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    activatedBy: _state.currentAdminId,
                    statusUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                    welcomeCompleted: false
                });
                rIC(() => logActivity('status_change', user.username, { oldStatus, newStatus: 'active', type: 'user' }));
            } catch (error) {
                user.status = oldStatus;
                scheduleRender();
                showToast('Failed: ' + error.message, 'error');
                return;
            }
        }
        
        cache.invalidate('stats');
        rIC(() => updateStats());
        showToast(`${user.username} activated`, 'success');
    };

    // ==========================================
    // USER DETAILS MODAL
    // ==========================================
    const showUserDetails = (userId) => {
        const user = _state.userCache.get(userId);
        if (!user) return;
        
        const isAdmin = user.role === 'admin' || user.role === 'executive' || user.isAdmin;
        const initials = getInitials(user);
        const variant = getAvatarVariant(user.username);
        const status = user.status || 'pending';
        
        raf(() => {
            const updates = [
                ['userDetailsInitials', initials],
                ['userDetailsName', [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Unknown'],
                ['userDetailsEmail', user.email || 'No email'],
                ['detailUsername', user.username || 'N/A'],
                ['detailFirstName', user.firstName || 'N/A'],
                ['detailLastName', user.lastName || 'N/A'],
                ['detailEmail', user.email || 'N/A'],
                ['detailPhone', user.phoneNumber || 'N/A'],
                ['detailCreatedAt', formatDate(user.createdAt)],
                ['detailActivatedAt', formatDate(user.activatedAt)],
                ['detailApiToken', user.apiToken || 'Not generated']
            ];
            
            for (let i = 0; i < updates.length; i++) {
                const el = getEl(updates[i][0]);
                if (el) el.textContent = updates[i][1];
            }
            
            const avatar = getEl('userDetailsAvatar');
            if (avatar) avatar.className = 'avatar-circle-large ' + variant;
            
            const badge = getEl('userDetailsBadge');
            if (badge) {
                if (isAdmin) {
                    badge.innerHTML = '<i class="fas fa-shield-alt"></i>';
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
            
            const roleEl = getEl('detailRole');
            if (roleEl) {
                const roleText = isAdmin ? (user.role === 'executive' ? 'Executive Administrator' : 'Administrator') : 'User';
                const roleBadge = document.createElement('span');
                roleBadge.className = `role-badge ${isAdmin ? 'admin' : 'user'}`;
                const roleIcon = document.createElement('i');
                roleIcon.className = `fas fa-${isAdmin ? 'shield-alt' : 'user'}`;
                roleBadge.append(roleIcon, document.createTextNode(` ${roleText}`));
                roleEl.replaceChildren(roleBadge);
            }
            
            const statusEl = getEl('detailStatus');
            if (statusEl) {
                const allowedStatuses = new Set(['active', 'pending', 'blocked', 'online', 'offline', 'locked', 'inactive']);
                const rawStatus = String(status || 'unknown').toLowerCase();
                const safeStatus = allowedStatuses.has(rawStatus) ? rawStatus : 'unknown';
                const statusBadge = document.createElement('span');
                statusBadge.className = `status-badge ${safeStatus}`;
                const statusIcon = document.createElement('i');
                statusIcon.className = 'fas fa-circle';
                statusBadge.append(statusIcon, document.createTextNode(` ${safeStatus[0].toUpperCase()}${safeStatus.slice(1)}`));
                statusEl.replaceChildren(statusBadge);
            }
            
            const copyBtn = getEl('copyTokenBtn');
            if (copyBtn) copyBtn.dataset.token = user.apiToken || '';
            
            const modal = getEl('userDetailsModal');
            if (modal) {
                modal.classList.add('active');
                document.body.style.overflow = 'hidden';
            }
        });
    };

    const closeUserDetails = () => {
        const modal = getEl('userDetailsModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    };

    // ==========================================
    // COPY TOKEN
    // ==========================================
    const copyApiToken = () => {
        const btn = getEl('copyTokenBtn');
        const token = btn?.dataset.token;
        
        if (!token || token === 'Not generated') {
            showToast('No token to copy', 'error');
            return;
        }
        
        if (navigator.clipboard) {
            navigator.clipboard.writeText(token).then(() => {
                showToast('API Token copied!', 'success');
                if (btn) {
                    const orig = btn.innerHTML;
                    btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                    setTimeout(() => { btn.innerHTML = orig; }, 2000);
                }
            }).catch(() => fallbackCopy(token));
        } else {
            fallbackCopy(token);
        }
    };

    const fallbackCopy = (text) => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            showToast('API Token copied!', 'success');
        } catch {
            showToast('Failed to copy', 'error');
        }
        document.body.removeChild(ta);
    };

    // ==========================================
    // DELETE USERS (UPDATED WITH PERMISSION CHECK)
    // ==========================================
    const deleteSelected = () => {
        _state.selectedUsers.delete(_state.currentAdminId);
        
        const deletableUsers = Array.from(_state.selectedUsers).filter(id => {
            const user = _state.userCache.get(id);
            return canDeleteUser(user);
        });
        
        _state.selectedUsers = new Set(deletableUsers);
        
        if (_state.selectedUsers.size === 0) {
            showToast('No deletable users selected. Regular admins cannot delete administrators.', 'error');
            return;
        }
        
        openDeleteConfirmModal();
    };

    const openDeleteConfirmModal = () => {
        const countEl = getEl('deleteCount');
        if (countEl) countEl.textContent = _state.selectedUsers.size;
        const modal = getEl('deleteConfirmModal');
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    };

    const closeDeleteConfirmModal = () => {
        const modal = getEl('deleteConfirmModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    };

    const confirmDelete = async () => {
        const btn = getEl('confirmDeleteBtn');
        const origText = btn?.innerHTML || '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
        }
        
        const ids = [..._state.selectedUsers];
        const usernames = ids.map(id => _state.userCache.get(id)?.username || 'Unknown');
        const count = ids.length;
        
        const db = _state.db || window.SharedState?.db;
        if (db && typeof firebase !== 'undefined') {
            try {
                const batch = db.batch();
                for (let i = 0; i < ids.length; i++) {
                    const user = _state.userCache.get(ids[i]);
                    
                    if (!canDeleteUser(user)) {
                        continue;
                    }
                    
                    const coll = user?.isAdmin ? 'admins' : 'users';
                    batch.delete(db.collection(coll).doc(ids[i]));
                }
                await batch.commit();
                
                const rtdb = _state.rtdb || window.SharedState?.rtdb;
                if (rtdb) {
                    for (let i = 0; i < ids.length; i++) {
                        rtdb.ref(`presence/${ids[i]}`).remove().catch(() => {});
                        rtdb.ref(`userSessions/${ids[i]}`).remove().catch(() => {});
                    }
                }
                
                rIC(() => logActivity('delete', count === 1 ? usernames[0] : null, { usernames, count, type: 'user' }));
            } catch (error) {
                showToast('Failed to delete: ' + error.message, 'error');
                if (btn) { btn.disabled = false; btn.innerHTML = origText; }
                return;
            }
        }
        
        _state.allUsers = _state.allUsers.filter(u => !_state.selectedUsers.has(u.id));
        ids.forEach(id => _state.userCache.delete(id));
        _state.selectedUsers.clear();
        
        filterUsers();
        cache.invalidate('stats');
        rIC(() => updateStats());
        closeDeleteConfirmModal();
        
        if (btn) { btn.disabled = false; btn.innerHTML = origText; }
        showToast(`${count} user(s) deleted`, 'success');
    };

    // ==========================================
    // EXPORT CSV
    // ==========================================
    const exportCSV = () => {
        if (_state.filteredUsers.length === 0) {
            showToast('No users to export', 'error');
            return;
        }
        
        rIC(() => {
            const csvCell = value => {
                let cell = String(value ?? '');
                if (/^[\u0000-\u0020]*[=+\-@]/.test(cell)) cell = `'${cell}`;
                return `"${cell.replace(/"/g, '""')}"`;
            };
            const headers = ['Username', 'First Name', 'Last Name', 'Email', 'Phone', 'Role', 'Status', 'Sensors', 'Created At'];
            const rows = [headers.join(',')];
            
            for (let i = 0; i < _state.filteredUsers.length; i++) {
                const u = _state.filteredUsers[i];
                const isAdmin = u.role === 'admin' || u.role === 'executive' || u.isAdmin;
                const values = [
                    u.username || '', u.firstName || '', u.lastName || '', u.email || '',
                    u.phoneNumber || '', isAdmin ? 'Administrator' : 'User',
                    u.status || 'pending', (u.assignedSensorTypes || []).join(';'),
                    formatDate(u.createdAt)
                ];
                rows.push(values.map(csvCell).join(','));
            }
            
            const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `breathsafe-users-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(a.href);
            
            showToast('CSV exported', 'success');
        });
    };

    // ==========================================
    // ADD ADMIN MODAL (ONLY FOR EXECUTIVE)
    // ==========================================
    const openAddAdminModal = () => {
        if (!hasPermission('canCreateAdmins')) {
            showToast('You do not have permission to create administrators', 'error');
            return;
        }
        
        const modal = getEl('addAdminModal');
        if (modal) {
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    };

    const closeAddAdminModal = () => {
        const modal = getEl('addAdminModal');
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
        getEl('addAdminForm')?.reset();
    };

    const handleAddAdmin = async (e) => {
        e.preventDefault();
        
        if (!hasPermission('canCreateAdmins')) {
            showToast('You do not have permission to create administrators', 'error');
            return;
        }
        
        const username = getEl('adminUsername')?.value.trim();
        const firstName = getEl('adminFirstName')?.value.trim();
        const lastName = getEl('adminLastName')?.value.trim();
        const email = getEl('adminEmail')?.value.trim();
        const phone = getEl('adminPhone')?.value.trim();
        const password = getEl('adminPassword')?.value;
        const role = getEl('adminRole')?.value || 'regular';
        
        if (!username || !email || !password || !firstName || !lastName) {
            showToast('Please fill all required fields', 'error');
            return;
        }
        
        const db = _state.db || window.SharedState?.db;
        if (!db) {
            showToast('Database not connected', 'error');
            return;
        }
        
        const btn = e.target.querySelector('button[type="submit"]');
        const origText = btn?.innerHTML || '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
        }
        
        try {
            const [existAdmin, existUser] = await Promise.all([
                db.collection('admins').where('username', '==', username).get(),
                db.collection('users').where('username', '==', username).get()
            ]);
            
            if (!existAdmin.empty || !existUser.empty) {
                showToast('Username already exists', 'error');
                if (btn) { btn.disabled = false; btn.innerHTML = origText; }
                return;
            }
            
            const apiToken = window.BreathSafeSecurity.generateApiToken();
            
            const permissions = role === 'executive' ? {
                canManageUsers: true,
                canActivateUsers: true,
                canSuspendUsers: true,
                canDeleteUsers: true,
                canAssignSensors: true,
                canManageAdmins: true,
                canCreateAdmins: true,
                canDeleteAdmins: true,
                canViewLogs: true,
                canManageSensors: true
            } : {
                canManageUsers: true,
                canActivateUsers: true,
                canSuspendUsers: true,
                canDeleteUsers: true,
                canAssignSensors: true,
                canManageAdmins: false,
                canCreateAdmins: false,
                canDeleteAdmins: false,
                canViewLogs: true,
                canManageSensors: false
            };
            
            await db.collection('admins').doc(username).set({
                username, firstName, lastName, email, phoneNumber: phone || '',
                password, apiToken, role, permissions,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: _state.currentAdminId
            });
            
            rIC(() => logActivity('create', username, { type: 'admin', userType: 'administrator', role }));
            await loadUsers();
            closeAddAdminModal();
            
            showToast(`${role === 'executive' ? 'Executive ' : ''}Administrator "${username}" created`, 'success');
        } catch (error) {
            showToast('Failed: ' + error.message, 'error');
        }
        
        if (btn) { btn.disabled = false; btn.innerHTML = origText; }
    };

    // ==========================================
    // THEME
    // ==========================================
    const toggleTheme = () => {
        const isDark = document.body.classList.toggle('dark');
        document.body.classList.toggle('light', !isDark);
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        const icon = document.querySelector('#themeToggle i');
        if (icon) icon.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
    };

    const loadTheme = () => {
        const theme = localStorage.getItem('theme') || 'light';
        document.body.classList.remove('light', 'dark');
        document.body.classList.add(theme);
        const icon = document.querySelector('#themeToggle i');
        if (icon) icon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
    };

    // ==========================================
    // LOGOUT SYSTEM - v3.2
    // No duplicate browser confirm dialogs
    // ==========================================
    
    // Internal logout (no confirmation - used by modal)
    const performLogout = async () => {
        console.log('🔓 Performing logout...');
        
        // Log the logout
        if (window.BreathSafeLogger && typeof window.BreathSafeLogger.logLogout === 'function') {
            try {
                await window.BreathSafeLogger.logLogout();
            } catch (e) {
                console.error("Logout logging failed:", e);
            }
        }
        
        // Clear all session data
        sessionStorage.removeItem('breathsafeAdmin');
        sessionStorage.removeItem('breathsafeAdminToken');
        sessionStorage.clear();
        
        // Show notification
        if (window.SharedState && typeof window.SharedState.notify === 'function') {
            window.SharedState.notify('Logged out successfully', 'success');
        }
        
        // Redirect
        setTimeout(() => {
            window.location.href = './Login-codes/breathsafe-admin-login.html';
        }, 500);
    };

    // Public logout function (shows modal confirmation)
    const secureLogout = () => {
        // Use the modern modal instead of browser confirm
        if (typeof window.showLogoutConfirmation === 'function') {
            window.showLogoutConfirmation();
        } else {
            // Fallback if modal system not loaded
            console.warn('⚠️ Logout modal not available, using fallback');
            if (confirm('Are you sure you want to logout?')) {
                performLogout();
            }
        }
    };

    // ==========================================
    // EVENT LISTENERS (CRITICAL + DEFERRED)
    // ==========================================
    const setupCriticalListeners = () => {
        const userMenu = getEl('userMenu');
        if (userMenu) {
            userMenu.onclick = (e) => { e.stopPropagation(); userMenu.classList.toggle('active'); };
        }
        document.addEventListener('click', () => { userMenu?.classList.remove('active'); }, { passive: true });
        
        getEl('themeToggle')?.addEventListener('click', toggleTheme, { passive: true });
        
        // Logout button - uses modal system
        const logoutBtn = getEl('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => { 
                e.preventDefault(); 
                secureLogout(); 
            });
        }
    };

    const setupDeferredListeners = () => {
        getEl('searchUsers')?.addEventListener('input', filterUsers, { passive: true });
        getEl('filterRole')?.addEventListener('change', filterUsers, { passive: true });
        getEl('filterStatus')?.addEventListener('change', filterUsers, { passive: true });
        
        getEl('exportCsvBtn')?.addEventListener('click', exportCSV, { passive: true });
        getEl('deleteSelectedBtn')?.addEventListener('click', deleteSelected, { passive: true });
        
        getEl('selectAll')?.addEventListener('change', (e) => {
            if (e.target.checked) {
                for (let i = 0; i < _state.filteredUsers.length; i++) {
                    const u = _state.filteredUsers[i];
                    if (canDeleteUser(u)) {
                        _state.selectedUsers.add(u.id);
                    }
                }
            } else {
                _state.selectedUsers.clear();
            }
            scheduleRender();
        });
        
        getEl('refreshBtn')?.addEventListener('click', () => location.reload(), { passive: true });
        
        getEl('addAdminBtn')?.addEventListener('click', openAddAdminModal, { passive: true });
        getEl('closeModal')?.addEventListener('click', closeAddAdminModal, { passive: true });
        getEl('cancelBtn')?.addEventListener('click', closeAddAdminModal, { passive: true });
        getEl('modalBackdrop')?.addEventListener('click', closeAddAdminModal, { passive: true });
        getEl('addAdminForm')?.addEventListener('submit', handleAddAdmin);
        
        getEl('closeUserDetailsModal')?.addEventListener('click', closeUserDetails, { passive: true });
        getEl('closeUserDetailsBtn')?.addEventListener('click', closeUserDetails, { passive: true });
        getEl('userDetailsBackdrop')?.addEventListener('click', closeUserDetails, { passive: true });
        getEl('copyTokenBtn')?.addEventListener('click', copyApiToken, { passive: true });
        
        getEl('closeDeleteModal')?.addEventListener('click', closeDeleteConfirmModal, { passive: true });
        getEl('cancelDeleteBtn')?.addEventListener('click', closeDeleteConfirmModal, { passive: true });
        getEl('deleteBackdrop')?.addEventListener('click', closeDeleteConfirmModal, { passive: true });
        getEl('confirmDeleteBtn')?.addEventListener('click', confirmDelete);
    };

    // ==========================================
    // ERROR HANDLING
    // ==========================================
    const setupErrorHandling = () => {
        window.addEventListener('error', (e) => {
            console.error('Global error:', e.error);
        }, { passive: true });
        
        window.addEventListener('unhandledrejection', (e) => {
            e.preventDefault();
        });
    };

    // ==========================================
    // INITIALIZATION ()
    // ==========================================
    const init = () => {
        if (_state.initialized) return;
        
        console.log("🚀 Core Initializing (v3.2 Logout Modal Fixed)...");
        const startTime = now();
        
        loadTheme();
        setupErrorHandling();
        
        if (!initFirestore()) {
            showToast("Critical Error: Database not available.", "error");
            return;
        }
        
        loadAdminInfo();
        setupCriticalListeners();
        
        rIC(() => {
            setupDeferredListeners();
            initWorker();
        }, { timeout: 100 });
        
        setTimeout(() => {
            loadUsers();
        }, 50);
        
        _state.initialized = true;
        console.log(`✅ Core Ready v3.2 (${now() - startTime}ms) - Logout modal integrated`);
    };

    // ==========================================
    // PUBLIC API
    // ==========================================
    return {
        init,
        loadUsers,
        filterUsers,
        toggleUserStatus,
        activateUser,
        showUserDetails,
        closeUserDetails,
        copyApiToken,
        deleteSelected,
        confirmDelete,
        closeDeleteConfirmModal,
        exportCSV,
        openAddAdminModal,
        closeAddAdminModal,
        handleAddAdmin,
        toggleTheme,
        secureLogout,
        performLogout,
        showToast,
        logActivity,
        hasPermission,
        canDeleteUser,
        getInitials,
        get db() { return _state.db; },
        get rtdb() { return _state.rtdb; },
        get allUsers() { return _state.allUsers; },
        get filteredUsers() { return _state.filteredUsers; },
        get selectedUsers() { return _state.selectedUsers; },
        get userCache() { return _state.userCache; },
        get currentAdminId() { return _state.currentAdminId; },
        get currentAdminUsername() { return _state.currentAdminUsername; },
        get currentAdminData() { return _state.currentAdminData; },
        get initialized() { return _state.initialized; }
    };
})();

// Function to add System Log link for Executive Admins
function addSystemLogLink() {
    const adminSession = sessionStorage.getItem('breathsafeAdmin');
    if (!adminSession) return;

    try {
        const admin = JSON.parse(adminSession);
        
        if (admin.role === 'executive') {
            const dropdown = document.getElementById('userDropdown');
            if (!dropdown) return;

            const profileLink = Array.from(dropdown.querySelectorAll('.dropdown-item'))
                .find(el => el.href.includes('admin-profile.html'));
            
            if (profileLink && !document.getElementById('systemLogLink')) {
                const link = document.createElement('a');
                link.href = 'admin-system-log.html';
                link.className = 'dropdown-item';
                link.id = 'systemLogLink';
                link.innerHTML = `
                    <i class="fas fa-clipboard-list"></i>
                    <span>System Event Log</span>
                `;
                profileLink.parentNode.insertBefore(link, profileLink.nextSibling);
            }
        }
    } catch (e) {
        console.error('Error adding system log link:', e);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addSystemLogLink);
} else {
    addSystemLogLink();
}

// ==========================================
// GLOBAL EXPORTS
// ==========================================
window.STATE = {
    get db() { return AdminCore.db; },
    get rtdb() { return AdminCore.rtdb; },
    get allUsers() { return AdminCore.allUsers; },
    get filteredUsers() { return AdminCore.filteredUsers; },
    get selectedUsers() { return AdminCore.selectedUsers; },
    get userCache() { return AdminCore.userCache; },
    get currentAdminId() { return AdminCore.currentAdminId; },
    get currentAdminUsername() { return AdminCore.currentAdminUsername; },
    get currentAdminData() { return AdminCore.currentAdminData; },
    get initialized() { return AdminCore.initialized; }
};
window.AdminCore = AdminCore;
window.showToast = AdminCore.showToast;
window.loadUsers = AdminCore.loadUsers;
window.initCore = AdminCore.init;
window.toggleUserStatus = AdminCore.toggleUserStatus;
window.activateUser = AdminCore.activateUser;

console.log("✅ BreathSafe Core v3.2 - Logout modal integrated, no duplicate confirmations");
