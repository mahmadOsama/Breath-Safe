// ================================
// TABLE CONTROLS SYSTEM
// ================================

console.log('Loading Fixed Table Controls...');

const TableControls = {
    focusMode: false,
    zoomLevel: 100,
    initialized: false,

    init() {
        if (this.initialized) return;
        
        console.log(' Initializing Table Controls...');
        
        // Load saved state
        this.loadState();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Apply saved state
        this.applyState();
        
        this.initialized = true;
        console.log(' Table Controls Ready');
    },

    loadState() {
        const savedZoom = localStorage.getItem('table_zoom_level');
        const savedFocus = localStorage.getItem('table_focus_mode');
        
        this.zoomLevel = savedZoom ? parseInt(savedZoom) : 100;
        this.focusMode = savedFocus === 'true';
        
        console.log(` Loaded state: Zoom=${this.zoomLevel}%, Focus=${this.focusMode}`);
    },

    saveState() {
        localStorage.setItem('table_zoom_level', this.zoomLevel);
        localStorage.setItem('table_focus_mode', this.focusMode);
    },

    applyState() {
        // Apply zoom
        document.body.classList.remove(
            'table-zoom-60', 'table-zoom-80', 'table-zoom-100', 
            'table-zoom-120', 'table-zoom-140'
        );
        document.body.classList.add(`table-zoom-${this.zoomLevel}`);
        
        // Apply focus mode
        if (this.focusMode) {
            document.body.classList.add('table-focus');
        } else {
            document.body.classList.remove('table-focus');
        }
        
        this.updateButtons();
    },

    setupEventListeners() {
        // Focus toggle
        const focusBtn = document.getElementById('toggleTableFocus');
        if (focusBtn) {
            focusBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleFocus();
            });
        }

        // Zoom controls
        const zoomInBtn = document.getElementById('zoomInTable');
        const zoomOutBtn = document.getElementById('zoomOutTable');
        
        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.zoomIn();
            });
        }

        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.zoomOut();
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
            
            if (e.key === 'f' || e.key === 'F') {
                e.preventDefault();
                this.toggleFocus();
            } else if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                this.zoomIn();
            } else if (e.key === '-') {
                e.preventDefault();
                this.zoomOut();
            } else if (e.key === '0') {
                e.preventDefault();
                this.resetZoom();
            }
        });
    },

    toggleFocus() {
        this.focusMode = !this.focusMode;
        this.saveState();
        this.applyState();
        
        const message = this.focusMode ? 'Focus Mode Activated' : 'Focus Mode Deactivated';
        this.showToast(message, 'info');
        
        console.log(` Focus Mode: ${this.focusMode ? 'ON' : 'OFF'}`);
    },

    zoomIn() {
        if (this.zoomLevel >= 140) {
            this.showToast('Maximum zoom reached', 'warning');
            return;
        }
        
        this.zoomLevel += 20;
        this.saveState();
        this.applyState();
        this.showToast(`Zoom: ${this.zoomLevel}%`, 'success');
        
        console.log(` Zoom In: ${this.zoomLevel}%`);
    },

    zoomOut() {
        if (this.zoomLevel <= 60) {
            this.showToast('Minimum zoom reached', 'warning');
            return;
        }
        
        this.zoomLevel -= 20;
        this.saveState();
        this.applyState();
        this.showToast(`Zoom: ${this.zoomLevel}%`, 'success');
        
        console.log(` Zoom Out: ${this.zoomLevel}%`);
    },

    resetZoom() {
        this.zoomLevel = 100;
        this.saveState();
        this.applyState();
        this.showToast('Zoom reset to 100%', 'info');
        
        console.log(' Zoom Reset: 100%');
    },

    updateButtons() {
        const focusBtn = document.getElementById('toggleTableFocus');
        const zoomInBtn = document.getElementById('zoomInTable');
        const zoomOutBtn = document.getElementById('zoomOutTable');
        
        // Update focus button
        if (focusBtn) {
            const icon = focusBtn.querySelector('i');
            if (this.focusMode) {
                focusBtn.classList.add('active-toggle');
                if (icon) icon.className = 'fas fa-compress';
                focusBtn.title = 'Exit Focus Mode (F)';
            } else {
                focusBtn.classList.remove('active-toggle');
                if (icon) icon.className = 'fas fa-expand';
                focusBtn.title = 'Enable Focus Mode (F)';
            }
        }
        
        // Update zoom buttons
        if (zoomInBtn) {
            zoomInBtn.disabled = this.zoomLevel >= 140;
            zoomInBtn.classList.toggle('disabled-btn', this.zoomLevel >= 140);
            zoomInBtn.title = this.zoomLevel >= 140 ? 'Maximum Zoom' : `Zoom In (+) - ${this.zoomLevel}%`;
        }
        
        if (zoomOutBtn) {
            zoomOutBtn.disabled = this.zoomLevel <= 60;
            zoomOutBtn.classList.toggle('disabled-btn', this.zoomLevel <= 60);
            zoomOutBtn.title = this.zoomLevel <= 60 ? 'Minimum Zoom' : `Zoom Out (-) - ${this.zoomLevel}%`;
        }
    },

    showToast(message, type) {
        if (typeof showToast === 'function') {
            showToast(message, type);
        } else {
            console.log(`Toast: ${message} (${type})`);
        }
    }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => TableControls.init(), 100);
    });
} else {
    setTimeout(() => TableControls.init(), 100);
}

// Export globally
window.TableControls = TableControls;

console.log(' Fixed Table Controls Loaded');