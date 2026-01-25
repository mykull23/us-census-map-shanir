// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

// Application entry point
document.addEventListener('DOMContentLoaded', async () => {
    console.log('ACS Data Visualization Application Loading...');
    
    try {
        // Initialize application
        window.acsApp = new ACSApplication();
        
        // Make services available globally for debugging
        window.acsApp.getServices = () => ({
            zipIndex: window.acsApp.zipIndex,
            apiService: window.acsApp.apiService,
            mapVisualizer: window.acsApp.mapVisualizer,
            notifications: window.acsApp.notificationSystem
        });
        
        // Global helper functions
        window.zoomToMarker = (zip) => {
            if (window.acsApp?.mapVisualizer) {
                window.acsApp.mapVisualizer.zoomToMarker(zip);
            }
        };
        
        window.exportMarkerData = (zip) => {
            if (window.acsApp?.mapVisualizer) {
                window.acsApp.mapVisualizer.exportMarkerData(zip);
            }
        };
        
        window.acsMap = window.acsApp?.mapVisualizer;
        
        console.log('Application ready!');
        console.log('Global objects available: acsApp, zoomToMarker(), exportMarkerData()');
        
    } catch (error) {
        console.error('Failed to start application:', error);
        
        // Show error to user
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            padding: 20px;
            text-align: center;
            font-family: Arial, sans-serif;
        `;
        
        errorDiv.innerHTML = `
            <h1 style="color: #ff4444; margin-bottom: 20px;">❌ Application Failed to Load</h1>
            <p style="margin-bottom: 10px; font-size: 18px;">${error.message}</p>
            <p style="margin-bottom: 20px; font-size: 14px; color: #aaa;">Check the console for details</p>
            <button onclick="location.reload()" style="
                padding: 10px 20px;
                background: #2196F3;
                color: white;
                border: none;
                border-radius: 4px;
                font-size: 16px;
                cursor: pointer;
            ">
                🔄 Reload Application
            </button>
        `;
        
        document.body.appendChild(errorDiv);
    }
});

// Handle beforeunload to save state
window.addEventListener('beforeunload', () => {
    if (window.acsApp) {
        const state = window.acsApp.getCurrentState();
        localStorage.setItem('acs_app_last_state', JSON.stringify(state));
    }
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && window.acsApp) {
        // Page became visible, update cache status
        window.acsApp.updateCacheStatus();
    }
});

// Global error handler
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    
    if (window.acsApp?.notificationSystem) {
        window.acsApp.notificationSystem.showError(
            `Application error: ${event.error.message}`,
            { duration: 10000 }
        );
    }
});

// Unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    
    if (window.acsApp?.notificationSystem) {
        window.acsApp.notificationSystem.showError(
            `Async error: ${event.reason.message || String(event.reason)}`,
            { duration: 8000 }
        );
    }
});

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ACSApplication };
}