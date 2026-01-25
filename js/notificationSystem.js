// ============================================================================
// NOTIFICATION SYSTEM
// ============================================================================

/**
 * Comprehensive notification system with multiple display types
 */
class NotificationSystem {
    constructor(options = {}) {
        this.config = {
            position: 'top-right',
            maxNotifications: 5,
            autoClose: true,
            autoCloseDelay: 5000,
            animationDuration: 300,
            showProgress: true,
            ...options
        };

        this.notifications = new Map();
        this.container = null;
        this.queue = [];
        this.isProcessingQueue = false;

        this.init();
    }

    // ============================================================================
    // INITIALIZATION
    // ============================================================================

    /**
     * Initialize notification system
     */
    init() {
        this.createContainer();
        this.setupEventListeners();
        this.setupStyles();
    }

    /**
     * Create notification container
     */
    createContainer() {
        this.container = document.createElement('div');
        this.container.className = 'notification-container';
        
        const positionClasses = {
            'top-right': 'notification-top-right',
            'top-left': 'notification-top-left',
            'bottom-right': 'notification-bottom-right',
            'bottom-left': 'notification-bottom-left',
            'top-center': 'notification-top-center',
            'bottom-center': 'notification-bottom-center'
        };

        this.container.classList.add(positionClasses[this.config.position] || 'notification-top-right');
        
        this.container.style.cssText = `
            position: fixed;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-width: 400px;
            pointer-events: none;
        `;

        document.body.appendChild(this.container);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Global event listener for notifications
        window.addEventListener('show-notification', (e) => {
            if (e.detail) {
                this.show(e.detail.message, e.detail.type, e.detail.options);
            }
        });

        // Listen for application events
        window.addEventListener('app-notification', (e) => {
            if (e.detail) {
                this.show(e.detail.message, e.detail.type);
            }
        });

        // Listen for API errors
        window.addEventListener('acs-api-error', (e) => {
            if (e.detail) {
                this.show(`API Error: ${e.detail.message}`, 'error', {
                    duration: 10000,
                    showProgress: true
                });
            }
        });

        // Listen for network status
        window.addEventListener('online', () => {
            this.show('Connection restored', 'success', { duration: 3000 });
        });

        window.addEventListener('offline', () => {
            this.show('No internet connection', 'error', { duration: 0 });
        });
    }

    /**
     * Setup dynamic styles
     */
    setupStyles() {
        if (!document.querySelector('#notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.textContent = this.getStyles();
            document.head.appendChild(style);
        }
    }

    // ============================================================================
    // NOTIFICATION API
    // ============================================================================

    /**
     * Show notification
     */
    show(message, type = 'info', options = {}) {
        const notificationId = this.generateId();
        
        const notificationOptions = {
            id: notificationId,
            message,
            type,
            duration: options.duration || (type === 'loading' ? 0 : this.config.autoCloseDelay),
            showProgress: options.showProgress !== undefined ? options.showProgress : this.config.showProgress,
            actions: options.actions || [],
            title: options.title || this.getDefaultTitle(type),
            icon: options.icon || this.getDefaultIcon(type),
            persistent: options.persistent || false,
            onClose: options.onClose,
            onClick: options.onClick,
            data: options.data
        };

        // Add to queue if at max capacity
        if (this.notifications.size >= this.config.maxNotifications) {
            this.queue.push(notificationOptions);
            return notificationId;
        }

        this.createNotification(notificationOptions);
        return notificationId;
    }

    /**
     * Create notification element
     */
    createNotification(options) {
        const notification = document.createElement('div');
        notification.id = `notification-${options.id}`;
        notification.className = `notification notification-${options.type}`;
        
        notification.innerHTML = this.getNotificationHTML(options);
        notification.setAttribute('role', 'alert');
        notification.setAttribute('aria-live', 'polite');
        
        // Add styles
        Object.assign(notification.style, this.getNotificationStyles(options.type));
        
        // Add to container
        this.container.appendChild(notification);
        this.notifications.set(options.id, { element: notification, options });
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
            notification.style.opacity = '1';
        }, 10);
        
        // Setup interactions
        this.setupNotificationInteractions(notification, options);
        
        // Auto close if enabled
        if (this.config.autoClose && options.duration > 0 && options.type !== 'loading') {
            this.setupAutoClose(notification, options);
        }
        
        // Emit event
        this.emit('notificationShown', options);
    }

    /**
     * Setup notification interactions
     */
    setupNotificationInteractions(notification, options) {
        // Close button
        const closeBtn = notification.querySelector('.notification-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.close(options.id);
            });
        }
        
        // Click handler
        if (options.onClick) {
            notification.style.cursor = 'pointer';
            notification.addEventListener('click', () => {
                options.onClick(options.data);
            });
        }
        
        // Action buttons
        const actionButtons = notification.querySelectorAll('.notification-action');
        actionButtons.forEach((btn, index) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (options.actions && options.actions[index]) {
                    options.actions[index].handler(options.data);
                }
            });
        });
    }

    /**
     * Setup auto close
     */
    setupAutoClose(notification, options) {
        if (options.showProgress) {
            const progressBar = notification.querySelector('.notification-progress-bar');
            if (progressBar) {
                progressBar.style.transition = `width ${options.duration}ms linear`;
                setTimeout(() => {
                    progressBar.style.width = '0%';
                }, 10);
            }
        }
        
        const timeoutId = setTimeout(() => {
            if (this.notifications.has(options.id)) {
                this.close(options.id);
            }
        }, options.duration);
        
        // Store timeout ID
        const notificationData = this.notifications.get(options.id);
        if (notificationData) {
            notificationData.timeoutId = timeoutId;
        }
    }

    /**
     * Close notification
     */
    close(notificationId) {
        const notificationData = this.notifications.get(notificationId);
        if (!notificationData) return;
        
        const { element, options, timeoutId } = notificationData;
        
        // Clear timeout if exists
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        
        // Animate out
        element.style.transform = this.getExitTransform();
        element.style.opacity = '0';
        
        // Remove after animation
        setTimeout(() => {
            if (element.parentElement) {
                element.parentElement.removeChild(element);
            }
            this.notifications.delete(notificationId);
            
            // Call onClose callback
            if (options.onClose) {
                options.onClose(options.data);
            }
            
            // Emit event
            this.emit('notificationClosed', options);
            
            // Process queue
            this.processQueue();
            
        }, this.config.animationDuration);
    }

    /**
     * Close all notifications
     */
    closeAll() {
        this.notifications.forEach((_, id) => this.close(id));
    }

    /**
     * Update notification
     */
    update(notificationId, updates) {
        const notificationData = this.notifications.get(notificationId);
        if (!notificationData) return;
        
        const { element, options } = notificationData;
        
        // Merge updates
        Object.assign(options, updates);
        
        // Update element
        if (updates.message !== undefined) {
            const messageEl = element.querySelector('.notification-message');
            if (messageEl) messageEl.textContent = updates.message;
        }
        
        if (updates.type !== undefined) {
            element.className = `notification notification-${updates.type}`;
            Object.assign(element.style, this.getNotificationStyles(updates.type));
            
            const iconEl = element.querySelector('.notification-icon');
            if (iconEl) iconEl.textContent = this.getDefaultIcon(updates.type);
        }
        
        if (updates.progress !== undefined) {
            const progressEl = element.querySelector('.notification-progress');
            if (progressEl) {
                progressEl.style.width = `${updates.progress}%`;
            }
        }
        
        this.emit('notificationUpdated', { id: notificationId, updates });
    }

    /**
     * Show loading notification
     */
    showLoading(message, options = {}) {
        return this.show(message, 'loading', {
            duration: 0,
            showProgress: true,
            ...options
        });
    }

    /**
     * Update loading notification
     */
    updateLoading(notificationId, message, progress = null) {
        const updates = { message };
        if (progress !== null) {
            updates.progress = progress;
        }
        this.update(notificationId, updates);
    }

    /**
     * Show success notification
     */
    showSuccess(message, options = {}) {
        return this.show(message, 'success', options);
    }

    /**
     * Show error notification
     */
    showError(message, options = {}) {
        return this.show(message, 'error', {
            duration: 10000,
            ...options
        });
    }

    /**
     * Show warning notification
     */
    showWarning(message, options = {}) {
        return this.show(message, 'warning', options);
    }

    /**
     * Show info notification
     */
    showInfo(message, options = {}) {
        return this.show(message, 'info', options);
    }

    // ============================================================================
    // QUEUE MANAGEMENT
    // ============================================================================

    /**
     * Process notification queue
     */
    processQueue() {
        if (this.isProcessingQueue || this.queue.length === 0) return;
        
        this.isProcessingQueue = true;
        
        while (this.queue.length > 0 && this.notifications.size < this.config.maxNotifications) {
            const options = this.queue.shift();
            this.createNotification(options);
        }
        
        this.isProcessingQueue = false;
    }

    /**
     * Clear queue
     */
    clearQueue() {
        this.queue = [];
    }

    // ============================================================================
    // UTILITY METHODS
    // ============================================================================

    /**
     * Generate notification ID
     */
    generateId() {
        return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get default icon for type
     */
    getDefaultIcon(type) {
        const icons = {
            info: 'ℹ️',
            success: '✅',
            warning: '⚠️',
            error: '❌',
            loading: '⏳'
        };
        return icons[type] || icons.info;
    }

    /**
     * Get default title for type
     */
    getDefaultTitle(type) {
        const titles = {
            info: 'Information',
            success: 'Success',
            warning: 'Warning',
            error: 'Error',
            loading: 'Loading'
        };
        return titles[type] || 'Notification';
    }

    /**
     * Get notification HTML
     */
    getNotificationHTML(options) {
        return `
            <div class="notification-content">
                <div class="notification-icon">${options.icon}</div>
                <div class="notification-body">
                    ${options.title ? `<div class="notification-title">${options.title}</div>` : ''}
                    <div class="notification-message">${options.message}</div>
                    ${options.actions.length > 0 ? `
                        <div class="notification-actions">
                            ${options.actions.map((action, i) => `
                                <button class="notification-action" data-action="${action.id}">
                                    ${action.label}
                                </button>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
                ${options.type !== 'loading' ? `
                    <button class="notification-close" aria-label="Close">
                        ×
                    </button>
                ` : ''}
            </div>
            ${options.showProgress && options.duration > 0 ? `
                <div class="notification-progress">
                    <div class="notification-progress-bar"></div>
                </div>
            ` : ''}
        `;
    }

    /**
     * Get notification styles
     */
    getNotificationStyles(type) {
        const baseStyles = {
            transform: this.getEnterTransform(),
            opacity: '0',
            transition: `all ${this.config.animationDuration}ms ease-out`,
            pointerEvents: 'auto'
        };
        
        const typeStyles = {
            info: {
                background: 'linear-gradient(135deg, #e3f2fd, #bbdefb)',
                color: '#1565c0',
                borderLeft: '4px solid #2196F3'
            },
            success: {
                background: 'linear-gradient(135deg, #e8f5e9, #c8e6c9)',
                color: '#2e7d32',
                borderLeft: '4px solid #4CAF50'
            },
            warning: {
                background: 'linear-gradient(135deg, #fff3e0, #ffcc80)',
                color: '#f57c00',
                borderLeft: '4px solid #FF9800'
            },
            error: {
                background: 'linear-gradient(135deg, #ffebee, #ffcdd2)',
                color: '#c62828',
                borderLeft: '4px solid #F44336'
            },
            loading: {
                background: 'linear-gradient(135deg, #f5f5f5, #e0e0e0)',
                color: '#616161',
                borderLeft: '4px solid #9E9E9E'
            }
        };
        
        return { ...baseStyles, ...(typeStyles[type] || typeStyles.info) };
    }

    /**
     * Get enter transform based on position
     */
    getEnterTransform() {
        const transforms = {
            'top-right': 'translateX(100%)',
            'top-left': 'translateX(-100%)',
            'bottom-right': 'translateX(100%)',
            'bottom-left': 'translateX(-100%)',
            'top-center': 'translateY(-100%)',
            'bottom-center': 'translateY(100%)'
        };
        return transforms[this.config.position] || 'translateX(100%)';
    }

    /**
     * Get exit transform based on position
     */
    getExitTransform() {
        const transforms = {
            'top-right': 'translateX(100%)',
            'top-left': 'translateX(-100%)',
            'bottom-right': 'translateX(100%)',
            'bottom-left': 'translateX(-100%)',
            'top-center': 'translateY(-100%)',
            'bottom-center': 'translateY(100%)'
        };
        return transforms[this.config.position] || 'translateX(100%)';
    }

    /**
     * Get CSS styles
     */
    getStyles() {
        return `
            .notification {
                padding: 16px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                backdrop-filter: blur(10px);
                display: flex;
                flex-direction: column;
                min-width: 300px;
                max-width: 400px;
            }
            
            .notification-content {
                display: flex;
                align-items: flex-start;
                gap: 12px;
            }
            
            .notification-icon {
                font-size: 20px;
                flex-shrink: 0;
            }
            
            .notification-body {
                flex: 1;
                min-width: 0;
            }
            
            .notification-title {
                font-weight: 600;
                font-size: 14px;
                margin-bottom: 4px;
            }
            
            .notification-message {
                font-size: 14px;
                line-height: 1.5;
                word-break: break-word;
            }
            
            .notification-close {
                background: none;
                border: none;
                color: inherit;
                font-size: 20px;
                cursor: pointer;
                padding: 0;
                margin-left: 8px;
                opacity: 0.7;
                transition: opacity 0.2s;
                flex-shrink: 0;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
            }
            
            .notification-close:hover {
                opacity: 1;
                background: rgba(0, 0, 0, 0.1);
            }
            
            .notification-progress {
                height: 3px;
                background: rgba(0, 0, 0, 0.1);
                margin-top: 12px;
                border-radius: 1.5px;
                overflow: hidden;
            }
            
            .notification-progress-bar {
                height: 100%;
                background: currentColor;
                opacity: 0.5;
                width: 100%;
                border-radius: 1.5px;
            }
            
            .notification-actions {
                display: flex;
                gap: 8px;
                margin-top: 12px;
            }
            
            .notification-action {
                padding: 4px 12px;
                background: rgba(255, 255, 255, 0.2);
                border: 1px solid currentColor;
                border-radius: 4px;
                color: inherit;
                font-size: 12px;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .notification-action:hover {
                background: rgba(255, 255, 255, 0.3);
            }
            
            /* Position classes */
            .notification-top-right {
                top: 20px;
                right: 20px;
                align-items: flex-end;
            }
            
            .notification-top-left {
                top: 20px;
                left: 20px;
                align-items: flex-start;
            }
            
            .notification-bottom-right {
                bottom: 20px;
                right: 20px;
                align-items: flex-end;
            }
            
            .notification-bottom-left {
                bottom: 20px;
                left: 20px;
                align-items: flex-start;
            }
            
            .notification-top-center {
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                align-items: center;
            }
            
            .notification-bottom-center {
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                align-items: center;
            }
        `;
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            active: this.notifications.size,
            queued: this.queue.length,
            position: this.config.position,
            maxNotifications: this.config.maxNotifications
        };
    }

    // ============================================================================
    // EVENT SYSTEM
    // ============================================================================

    eventHandlers = new Map();

    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, new Set());
        }
        this.eventHandlers.get(event).add(handler);
    }

    off(event, handler) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).delete(handler);
        }
    }

    emit(event, data) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in event handler for ${event}:`, error);
                }
            });
        }
    }
}

// Make available globally
window.NotificationSystem = NotificationSystem;