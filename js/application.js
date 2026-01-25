// ============================================================================
// MAIN APPLICATION CONTROLLER
// ============================================================================

/**
 * Main application controller that orchestrates all components
 */
class ACSApplication {
    constructor() {
        // Services
        this.zipIndex = null;
        this.apiService = null;
        this.mapVisualizer = null;
        this.notificationSystem = null;
        
        // State
        this.currentVariable = 'B01003_001E';
        this.currentZips = [];
        this.isInitialized = false;
        this.apiKey = null;
        
        // UI Elements
        this.uiElements = {};
        
        // Statistics
        this.stats = {
            totalRequests: 0,
            successfulVisualizations: 0,
            errors: 0,
            startTime: Date.now()
        };
        
        // Initialize
        this.init();
    }

    // ============================================================================
    // INITIALIZATION
    // ============================================================================

   async init() {
    try {
        // Initialize services first
        await this.initializeServices();
        
        // NOW show loading since notificationSystem exists
        this.showLoading('Initializing application...');
            
            // Setup UI
            this.setupUI();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Load initial data
            await this.loadInitialData();
            
            this.isInitialized = true;
            this.stats.initializationTime = Date.now() - this.stats.startTime;
            
            this.showSuccess('Application initialized successfully');
            console.log('ACS Application initialized in', this.stats.initializationTime, 'ms');
            
        } catch (error) {
            console.error('Failed to initialize application:', error);
            this.showError(`Initialization failed: ${error.message}`);
            throw error;
        }
    }

    async initializeServices() {
        // 1. Initialize notification system
        this.notificationSystem = new NotificationSystem({
            position: 'top-right',
            maxNotifications: 5,
            autoClose: true,
            autoCloseDelay: 5000
        });
        
        // 2. Load ZIP code index
        this.showLoading('Loading ZIP code database...');
        this.zipIndex = new ZIPCodeIndex();
        
        try {
            await this.zipIndex.loadFromJSON('data/uszips.json', {
                progressCallback: (progress) => {
                    if (progress.loaded % 50000 === 0) {
                        this.showInfo(`Loaded ${progress.loaded} ZIP codes...`);
                    }
                },
                errorCallback: (error, line) => {
                    console.warn('CSV parse error:', error, 'Line:', line);
                }
            });
            
            const zipStats = this.zipIndex.getStats();
            this.showSuccess(`Loaded ${zipStats.totalRecords.toLocaleString()} ZIP codes`);
            
        } catch (error) {
            this.showError(`Failed to load ZIP codes: ${error.message}`);
            throw error;
        }
        
        // 3. Initialize API service
        this.apiKey = await this.getAPIKey();
        
        if (!this.apiKey) {
            this.showError('API key is required');
            throw new Error('No API key provided');
        }
        
        this.apiService = new ACSAPIService(this.apiKey, {
            dataset: 'acs/acs5',
            year: '2022',
            batchSize: 10,
            maxRetries: 3,
            requestsPerMinute: 45 // Stay under Census limit
        });
        
        // Setup API event listeners
        this.setupAPIEvents();
        
        // 4. Initialize map visualizer
        this.mapVisualizer = new ACSMapVisualizer('mapContainer', {
            defaultZoom: 4,
            clusterRadius: 60,
            enableClustering: true
        });
        
        // Setup map event listeners
        this.setupMapEvents();
        
        // Validate API key
        this.showLoading('Validating API key...');
        const validation = await this.apiService.validateAPIKey();
        
        if (!validation.valid) {
            this.showWarning(`API key validation: ${validation.message}`);
        } else {
            this.showSuccess('API key validated successfully');
        }
    }

    setupUI() {
        // Cache UI elements
        this.uiElements = {
            searchInput: document.getElementById('searchInput'),
            searchType: document.getElementById('searchType'),
            searchBtn: document.getElementById('searchBtn'),
            variableSelect: document.getElementById('variableSelect'),
            resultsLimit: document.getElementById('resultsLimit'),
            radiusControls: document.getElementById('radiusControls'),
            radiusInput: document.getElementById('radiusInput'),
            radiusValue: document.getElementById('radiusValue'),
            clearCacheBtn: document.getElementById('clearCacheBtn'),
            exportDataBtn: document.getElementById('exportDataBtn'),
            clearMapBtn: document.getElementById('clearMapBtn'),
            zoomInBtn: document.getElementById('zoomInBtn'),
            zoomOutBtn: document.getElementById('zoomOutBtn'),
            fitBoundsBtn: document.getElementById('fitBoundsBtn'),
            statusIndicator: document.getElementById('statusIndicator'),
            apiStatusText: document.getElementById('apiStatusText'),
            zipCount: document.getElementById('zipCount'),
            apiRequests: document.getElementById('apiRequests'),
            cacheHits: document.getElementById('cacheHits'),
            dataPoints: document.getElementById('dataPoints'),
            cacheStatus: document.getElementById('cacheStatus'),
            lastUpdated: document.getElementById('lastUpdated'),
            resultsContent: document.getElementById('resultsContent')
        };
        
        // Update UI with initial data
        this.updateUI();
    }

    setupEventListeners() {
        const ui = this.uiElements;
        
        // Search
        ui.searchBtn.addEventListener('click', () => this.handleSearch());
        ui.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });
        
        // Search type change
        ui.searchType.addEventListener('change', (e) => {
            this.handleSearchTypeChange(e.target.value);
        });
        
        // Radius slider
        ui.radiusInput.addEventListener('input', (e) => {
            ui.radiusValue.textContent = `${e.target.value} miles`;
        });
        
        // Variable change
        ui.variableSelect.addEventListener('change', (e) => {
            this.currentVariable = e.target.value;
            if (this.currentZips.length > 0) {
                this.fetchAndVisualize(this.currentZips);
            }
        });
        
        // Controls
        ui.clearCacheBtn.addEventListener('click', () => this.clearCache());
        ui.exportDataBtn.addEventListener('click', () => this.exportAllData());
        ui.clearMapBtn.addEventListener('click', () => this.clearMap());
        
        // Map controls
        ui.zoomInBtn.addEventListener('click', () => {
            this.mapVisualizer.map.zoomIn();
        });
        
        ui.zoomOutBtn.addEventListener('click', () => {
            this.mapVisualizer.map.zoomOut();
        });
        
        ui.fitBoundsBtn.addEventListener('click', () => {
            this.fitToUS();
        });
        
        // Update stats periodically
        setInterval(() => this.updateStats(), 2000);
    }

    setupAPIEvents() {
        if (!this.apiService) return;
        
        this.apiService.on('requestStart', (data) => {
            this.showLoading(`Fetching data for ${data.zipCodes.length} locations...`);
        });
        
        this.apiService.on('requestComplete', (data) => {
            this.stats.totalRequests++;
            this.stats.successfulVisualizations++;
        });
        
        this.apiService.on('requestError', (data) => {
            this.stats.errors++;
            this.showError(`Request failed: ${data.error.message}`);
        });
        
        this.apiService.on('cacheCleaned', (data) => {
            this.showInfo(`Cleaned ${data.cleaned} expired cache entries`);
        });
        
        this.apiService.on('missingData', (data) => {
            if (data.missingZips.length > 0) {
                this.showWarning(`No data for ${data.missingZips.length} ZIP codes`);
            }
        });
    }

    setupMapEvents() {
        if (!this.mapVisualizer) return;
        
        this.mapVisualizer.on('visualizationStart', (data) => {
            this.showLoading(`Visualizing ${data.dataCount} data points...`);
        });
        
        this.mapVisualizer.on('visualizationComplete', (data) => {
            if (data.success) {
                this.showSuccess(`Visualized ${data.dataPoints} data points`);
            }
        });
        
        this.mapVisualizer.on('markerClick', (data) => {
            this.showMarkerInfo(data.marker);
        });
        
        this.mapVisualizer.on('mapCleared', () => {
            this.currentZips = [];
            this.updateResultsPanel([]);
        });
    }

    // ============================================================================
    // DATA MANAGEMENT
    // ============================================================================

    async loadInitialData() {
        // Load sample data for major cities
        const sampleZips = [
            '10001', '90210', '94102', '60601', '75201', // NYC, LA, SF, Chicago, Dallas
            '33101', '98101', '19102', '77001', '85001',  // Miami, Seattle, Philly, Houston, Phoenix
            '20001', '80202', '92101', '73101', '46201'   // DC, Denver, San Diego, OKC, Indianapolis
        ];
        
        await this.fetchAndVisualize(sampleZips);
        
        // Update cache status
        this.updateCacheStatus();
    }

    async fetchAndVisualize(zipCodes, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Application not initialized');
        }
        
        if (!zipCodes || zipCodes.length === 0) {
            this.showWarning('No ZIP codes provided');
            return;
        }
        
        // Limit results
        const limit = parseInt(this.uiElements.resultsLimit.value) || 100;
        const limitedZips = zipCodes.slice(0, limit);
        this.currentZips = limitedZips;
        
        const notificationId = this.notificationSystem.showLoading(
            `Fetching ACS data for ${limitedZips.length} locations...`,
            { persistent: true }
        );
        
        try {
            // Fetch ACS data
            const acsData = await this.apiService.fetchDataForZips(
                limitedZips,
                [this.currentVariable, 'B01003_001E']
            );
            
            // Check if we got any valid data
            const validData = Object.values(acsData).filter(d => 
                d.data[this.currentVariable] !== null && !isNaN(d.data[this.currentVariable])
            );
            
            if (validData.length === 0) {
                this.notificationSystem.close(notificationId);
                this.showError('No valid data available from ACS API');
                return;
            }
            
            // Update notification
            this.notificationSystem.updateLoading(
                notificationId,
                `Visualizing ${validData.length} data points...`
            );
            
            // Visualize data
            await this.mapVisualizer.visualizeData(
                this.zipIndex.zips,
                acsData,
                this.currentVariable,
                {
                    cluster: limitedZips.length > 10,
                    fitBounds: true,
                    showLegend: true,
                    ...options
                }
            );
            
            // Close loading notification
            this.notificationSystem.close(notificationId);
            
            // Update results panel
            this.updateResultsPanel(limitedZips, validData.length);
            
            // Update statistics
            this.updateStats();
            
            // Show success
            this.showSuccess(`Loaded data for ${validData.length} locations`);
            
        } catch (error) {
            this.notificationSystem.close(notificationId);
            
            console.error('Fetch and visualize failed:', error);
            
            // Check for cached data
            const cachedZips = limitedZips.filter(zip => {
                const cached = this.apiService.getFromCache(zip, [this.currentVariable]);
                return cached !== null;
            });
            
            if (cachedZips.length > 0) {
                this.showWarning(
                    `Using cached data for ${cachedZips.length} locations (API unavailable)`
                );
                
                // Fetch cached data
                const cachedData = {};
                cachedZips.forEach(zip => {
                    cachedData[zip] = this.apiService.getFromCache(zip, [this.currentVariable]);
                });
                
                await this.mapVisualizer.visualizeData(
                    this.zipIndex.zips,
                    cachedData,
                    this.currentVariable,
                    { cluster: cachedZips.length > 10 }
                );
                
                this.updateResultsPanel(cachedZips, cachedZips.length);
                
            } else {
                this.showError(`Failed to fetch data: ${error.message}`);
            }
        }
    }

    // ============================================================================
    // SEARCH HANDLERS
    // ============================================================================

    async handleSearch() {
        const searchType = this.uiElements.searchType.value;
        const input = this.uiElements.searchInput.value.trim();
        
        if (!input) {
            this.showWarning('Please enter a search term');
            return;
        }
        
        let zips = [];
        
        switch (searchType) {
            case 'zip':
                zips = this.handleZipSearch(input);
                break;
                
            case 'radius':
                zips = await this.handleRadiusSearch(input);
                break;
                
            case 'state':
                zips = this.handleStateSearch(input);
                break;
                
            case 'city':
                zips = this.handleCitySearch(input);
                break;
                
            default:
                this.showError('Invalid search type');
                return;
        }
        
        if (zips.length === 0) {
            this.showWarning('No locations found');
            return;
        }
        
        await this.fetchAndVisualize(zips);
    }

    handleZipSearch(input) {
        // Support multiple ZIPs separated by commas, spaces, or newlines
        const zipPattern = /\b\d{5}\b/g;
        const matches = input.match(zipPattern);
        
        if (!matches) {
            this.showWarning('No valid 5-digit ZIP codes found');
            return [];
        }
        
        // Filter valid ZIPs
        const validZips = matches.filter(zip => {
            const info = this.zipIndex.get(zip);
            return info !== null;
        });
        
        if (validZips.length === 0) {
            this.showWarning('No valid ZIP codes found in database');
        }
        
        return validZips;
    }

    async handleRadiusSearch(input) {
        // Try to parse as ZIP code for center
        const centerZip = input.match(/\b\d{5}\b/);
        
        if (!centerZip) {
            this.showWarning('Enter a ZIP code for radius search center');
            return [];
        }
        
        const centerInfo = this.zipIndex.get(centerZip[0]);
        if (!centerInfo) {
            this.showWarning('Center ZIP code not found');
            return [];
        }
        
        const radiusMiles = parseInt(this.uiElements.radiusInput.value) || 10;
        const radiusKm = radiusMiles * 1.60934;
        
        const results = this.zipIndex.searchByRadius(
            centerInfo.lat,
            centerInfo.lng,
            radiusKm,
            parseInt(this.uiElements.resultsLimit.value) || 100
        );
        
        return results.map(r => r.zip);
    }

    handleStateSearch(input) {
        const stateId = input.toUpperCase().trim();
        const results = this.zipIndex.getByState(
            stateId,
            parseInt(this.uiElements.resultsLimit.value) || 100
        );
        
        return results.map(r => r.zip);
    }

    handleCitySearch(input) {
        // Try to extract state from input (e.g., "New York, NY")
        let cityName = input;
        let stateId = null;
        
        const commaIndex = input.indexOf(',');
        if (commaIndex !== -1) {
            cityName = input.substring(0, commaIndex).trim();
            stateId = input.substring(commaIndex + 1).trim().toUpperCase();
        }
        
        const results = this.zipIndex.searchByCity(
            cityName,
            stateId,
            parseInt(this.uiElements.resultsLimit.value) || 50
        );
        
        return results.map(r => r.zip);
    }

    handleSearchTypeChange(type) {
        const radiusControls = this.uiElements.radiusControls;
        radiusControls.style.display = type === 'radius' ? 'block' : 'none';
        
        // Update placeholder
        const placeholders = {
            zip: 'e.g., 10001 or 10001, 10002, 10003',
            radius: 'e.g., 10001 (center ZIP)',
            state: 'e.g., NY or California',
            city: 'e.g., New York or New York, NY'
        };
        
        this.uiElements.searchInput.placeholder = placeholders[type] || 'Enter search term';
    }

    // ============================================================================
    // UI UPDATES
    // ============================================================================

    updateUI() {
        if (!this.zipIndex) return;
        
        const zipStats = this.zipIndex.getStats();
        this.uiElements.zipCount.textContent = zipStats.totalRecords.toLocaleString();
        
        this.updateStatusIndicator();
        this.updateCacheStatus();
        this.updateLastUpdated();
    }

    updateStats() {
        if (!this.apiService) return;
        
        const apiStats = this.apiService.getStats();
        const cacheStats = this.apiService.getCacheStats();
        
        this.uiElements.apiRequests.textContent = apiStats.totalRequests;
        this.uiElements.cacheHits.textContent = apiStats.cacheHits;
        
        if (this.mapVisualizer) {
            const mapStats = this.mapVisualizer.getStats();
            this.uiElements.dataPoints.textContent = mapStats.markers;
        }
        
        this.uiElements.cacheStatus.textContent = 
            `${cacheStats.count} entries (${cacheStats.sizeKB} KB)`;
    }

    updateStatusIndicator() {
        const indicator = this.uiElements.statusIndicator;
        const statusText = this.uiElements.apiStatusText;
        
        if (this.isInitialized) {
            indicator.className = 'status-indicator online';
            statusText.textContent = 'Online';
            statusText.style.color = '#4CAF50';
        } else {
            indicator.className = 'status-indicator offline';
            statusText.textContent = 'Offline';
            statusText.style.color = '#F44336';
        }
    }

    updateCacheStatus() {
        if (!this.apiService) return;
        
        const cacheStats = this.apiService.getCacheStats();
        this.uiElements.cacheStatus.textContent = 
            `${cacheStats.count} entries (${cacheStats.sizeKB} KB)`;
    }

    updateLastUpdated() {
        const now = new Date();
        this.uiElements.lastUpdated.textContent = now.toLocaleString();
    }

    updateResultsPanel(requestedZips, receivedCount = null) {
        const content = this.uiElements.resultsContent;
        
        if (!requestedZips || requestedZips.length === 0) {
            content.innerHTML = '<p class="no-results">No results to display</p>';
            return;
        }
        
        const rows = requestedZips.slice(0, 20).map(zip => {
            const info = this.zipIndex.get(zip);
            return `
                <tr>
                    <td>${zip}</td>
                    <td>${info?.city || 'N/A'}, ${info?.state_id || 'N/A'}</td>
                    <td>${info?.county_name || 'N/A'}</td>
                    <td>${info?.population ? info.population.toLocaleString() : 'N/A'}</td>
                </tr>
            `;
        }).join('');
        
        const summary = receivedCount !== null ?
            `<p class="results-summary">Showing ${receivedCount} of ${requestedZips.length} locations</p>` :
            `<p class="results-summary">Showing ${Math.min(20, requestedZips.length)} of ${requestedZips.length} locations</p>`;
        
        content.innerHTML = `
            ${summary}
            <table class="results-table">
                <thead>
                    <tr>
                        <th>ZIP</th>
                        <th>Location</th>
                        <th>County</th>
                        <th>Population</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
            ${requestedZips.length > 20 ? 
                `<p class="results-more">...and ${requestedZips.length - 20} more</p>` : ''}
        `;
    }

    showMarkerInfo(marker) {
        // Could be extended to show detailed marker info in sidebar
        console.log('Marker clicked:', marker);
    }

    // ============================================================================
    // ACTIONS
    // ============================================================================

    async clearCache() {
        if (!confirm('Clear all cached ACS data? This will force fresh API requests.')) {
            return;
        }
        
        const cleared = this.apiService.clearCache();
        this.showSuccess(`Cleared ${cleared} cache entries`);
        this.updateCacheStatus();
    }

    exportAllData() {
        if (!this.mapVisualizer || !this.currentData) {
            this.showWarning('No data to export');
            return;
        }
        
        this.mapVisualizer.exportAllData();
        this.showSuccess('Data export started');
    }

    clearMap() {
        if (!confirm('Clear all markers from the map?')) {
            return;
        }
        
        this.mapVisualizer.clear();
        this.currentZips = [];
        this.updateResultsPanel([]);
        this.showInfo('Map cleared');
    }

    fitToUS() {
        this.mapVisualizer.map.fitBounds([
            [24.396308, -124.848974],
            [49.384358, -66.885444]
        ]);
    }

    // ============================================================================
    // UTILITIES
    // ============================================================================

    async getAPIKey() {
        // Try to get API key from localStorage
        let apiKey = localStorage.getItem('census_api_key');
        
        if (!apiKey) {
            // Prompt user for API key
            const input = prompt(
                'Enter your Census API key:\n\nGet one at: https://api.census.gov/data/key_signup.html',
                ''
            );
            
            if (input && input.trim()) {
                apiKey = input.trim();
                localStorage.setItem('census_api_key', apiKey);
                this.showSuccess('API key saved to localStorage');
            } else {
                this.showError('API key is required to fetch ACS data');
                return null;
            }
        }
        
        return apiKey;
    }

    showLoading(message) {
        this.notificationSystem.showLoading(message);
    }

    showSuccess(message) {
        this.notificationSystem.showSuccess(message);
    }

    showError(message) {
        this.notificationSystem.showError(message);
    }

    showWarning(message) {
        this.notificationSystem.showWarning(message);
    }

    showInfo(message) {
        this.notificationSystem.showInfo(message);
    }

    // ============================================================================
    // PUBLIC API
    // ============================================================================

    getStats() {
        return {
            ...this.stats,
            initialized: this.isInitialized,
            zipCount: this.zipIndex?.getStats().totalRecords || 0,
            apiStats: this.apiService?.getStats() || {},
            cacheStats: this.apiService?.getCacheStats() || {},
            mapStats: this.mapVisualizer?.getStats() || {}
        };
    }

    getCurrentState() {
        return {
            variable: this.currentVariable,
            zips: [...this.currentZips],
            mapCenter: this.mapVisualizer?.map.getCenter(),
            mapZoom: this.mapVisualizer?.map.getZoom()
        };
    }

    exportState() {
        const state = this.getCurrentState();
        const blob = new Blob([JSON.stringify(state, null, 2)], {
            type: 'application/json'
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `acs_state_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Make available globally
window.ACSApplication = ACSApplication;