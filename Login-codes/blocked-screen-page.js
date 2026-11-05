// ==========================================
// BREATHSAFE BLOCKED SCREEN PAGE
// Dedicated page for blocked users
// With Real-time Unblock Detection
// ==========================================

const BlockedScreenPage = {
    deviceInfo: null,
    blockInfo: null,
    db: null,
    
    // Listeners for real-time updates
    deviceUnblockListener: null,
    ipUnblockListener: null,
    notificationListener: null,
    periodicCheckInterval: null,
    
    // State
    isUnblocked: false,

    async init() {
        // Validate required fields
        if (!fullName) {
            this.showFormError('Please enter your full name');
            fullNameEl?.focus();
            return;
        }

        if (!email) {
            this.showFormError('Please enter your email address');
            emailEl?.focus();
            return;
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            this.showFormError('Please enter a valid email address');
            emailEl?.focus();
            return;
        }

        if (!description) {
            this.showFormError('Please describe what happened');
            descriptionEl?.focus();
            return;
        }

        // Update button state
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
            submitBtn.disabled = true;
        }

        try {
            // Generate reference number
            const referenceNumber = 'APL-' + Date.now().toString(36).toUpperCase() + '-' + 
                                    Math.random().toString(36).substring(2, 6).toUpperCase();

            const appealData = {
                referenceNumber: referenceNumber,
                fullName: fullName,
                email: email,
                username: username,
                description: description,
                deviceId: formDeviceId,
                deviceName: formDeviceName,
                ipAddress: formIPAddress,
                blockType: formBlockType,
                blockReason: this.blockInfo?.reason || 'Unknown',
                status: 'pending',
                submittedAt: new Date().toISOString(),
                userAgent: navigator.userAgent,
                resolved: false,
                viewed: false,
                resolvedBy: null,
                resolvedAt: null,
                resolution: null,
                adminNotes: null
            };

            // Save to Firebase
            await this.saveAppealToFirebase(appealData);
            
            // Show success
            this.showReportSuccess(referenceNumber);

        } catch (error) {
            
            if (submitBtn) {
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Appeal';
                submitBtn.disabled = false;
            }
            
            this.showFormError('Failed to submit appeal. Please try again or contact support@breathsafe.com');
        }
    },

    showFormError(message) {
        let errorEl = document.getElementById('formErrorMessage');
        
        if (!errorEl) {
            errorEl = document.createElement('div');
            errorEl.id = 'formErrorMessage';
            errorEl.style.cssText = `
                background: rgba(239, 68, 68, 0.1);
                border: 1px solid rgba(239, 68, 68, 0.3);
                border-radius: 8px;
                padding: 12px 16px;
                margin-bottom: 16px;
                color: #ef4444;
                font-size: 14px;
                display: flex;
                align-items: center;
                gap: 10px;
                animation: fadeIn 0.3s ease;
            `;
            
            const formBody = document.querySelector('.report-form-body');
            if (formBody) {
                formBody.insertBefore(errorEl, formBody.firstChild);
            }
        }
        
        errorEl.innerHTML = '<i class="fas fa-exclamation-circle"></i> ';
        errorEl.appendChild(document.createTextNode(String(message ?? '')));
        errorEl.style.display = 'flex';
        
        // Auto hide after 5 seconds
        setTimeout(() => {
            if (errorEl) errorEl.style.display = 'none';
        }, 5000);
    },

    async saveAppealToFirebase(appealData) {
        console.log('🔥 Saving appeal to Firebase...');
        
        try {
            if (!this.db) {
                await this.initFirebase();
            }

            if (!this.db) {
                throw new Error('Database not available');
            }
            
            console.log('💾 Adding document to block_appeals collection...');
            
            const docRef = await this.db.collection('block_appeals').add({
                ...appealData,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            console.log('✅ Appeal saved with ID:', docRef.id);
            return docRef.id;
        } catch (error) {
            console.error('❌ Firebase save error:', error);
            throw error;
        }
    },

    showReportSuccess(referenceNumber) {
        const formCard = document.querySelector('.report-form-card');
        if (!formCard) return;

        formCard.innerHTML = `
            <div class="report-success">
                <div class="report-success-icon">
                    <i class="fas fa-check"></i>
                </div>
                <h2 class="report-success-title">Appeal Submitted Successfully</h2>
                <p class="report-success-message">
                    Thank you for submitting your appeal. Our security team will review your case 
                    and respond to your email within 24 hours.
                </p>
                <div class="report-success-ref">
                    <span>Reference Number</span>
                    <code>${referenceNumber}</code>
                </div>
                <div class="report-success-note">
                    <i class="fas fa-bell"></i>
                    <span>This page will automatically notify you when your access is restored.</span>
                </div>
                <button class="action-link primary" style="margin-top: 24px; width: 100%; justify-content: center;" onclick="BlockedScreenPage.hideReportForm()">
                    <i class="fas fa-check"></i>
                    <span>Done</span>
                </button>
            </div>
        `;

        // Add note styling
        const noteStyle = document.createElement('style');
        noteStyle.textContent = `
            .report-success-note {
                display: flex;
                align-items: center;
                gap: 10px;
                background: rgba(59, 130, 246, 0.1);
                border: 1px solid rgba(59, 130, 246, 0.2);
                border-radius: 10px;
                padding: 12px 16px;
                margin-top: 20px;
                font-size: 13px;
                color: #3b82f6;
            }
            
            body.dark .report-success-note {
                background: rgba(59, 130, 246, 0.15);
                border-color: rgba(59, 130, 246, 0.3);
                color: #60a5fa;
            }
        `;
        document.head.appendChild(noteStyle);
    },

    // ==========================================
    // CLEANUP
    // ==========================================

    destroy() {
        console.log('🧹 Cleaning up BlockedScreenPage...');
        this.stopAllListeners();
        this.isUnblocked = false;
    }
};

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    BlockedScreenPage.init();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    BlockedScreenPage.destroy();
});

// Make globally available
window.BlockedScreenPage = BlockedScreenPage;

console.log('🛑 BlockedScreenPage module loaded with real-time unblock detection');
