/**
 * Main Application Controller
 * Handles map initialization, UI interactions, and data visualization
 */

class CensusMapApp {
    constructor() {
        // Core components
        this.map = null;
        this.markerClusterer = null;
        this.dataFetcher = new CensusDataFetcher();
        
        // Data storage
        this.zipCentroids = {};
        this.censusData = {};
        this.markers = {
            education: [],
            income: []
        };
        
        // State
        this.layerVisibility = {
            education: true,
            income: true
        };
        
        this.isInitialized = false;
        this.currentZoom = 4;
        
        // Bind methods
        this.initialize = this.initialize.bind(this);
        this.initMap = this.initMap.bind(this);
        this.loadData = this.loadData.bind(this);
        this.createMarkers = this.createMarkers.bind(this);
        this.updateLayer = this.updateLayer.bind(this);
        this.showError = this.showError.bind(this);
        
        // UI Elements cache
        this.uiElements = {};
    }

    /**
     * Initialize the entire application
     */
    async initialize() {
        try {
            console.log('Initializing Census Map Application...');
            
            // Cache UI elements
            this.cacheUIElements();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Initialize Google Maps
            await this.initMap();
            
            // Load ZIP centroids
            await this.loadZipCentroids();
            
            // Load Census data
            await this.loadData();
            
            this.isInitialized = true;
            console.log('Application initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize application:', error);
            this.showError(`Initialization failed: ${error.message}`);
        } finally {
            // Hide loading overlay
            this.hideLoadingOverlay();
        }
    }

    /**
     * Cache frequently used UI elements
     */
    cacheUIElements() {
        this.uiElements = {
            loadingOverlay: document.getElementById('loading-overlay'),
            loadingText: document.getElementById('loading-text'),
            loadingProgress: document.getElementById('loading-progress'),
            map: document.getElementById('map'),
            toggleEducation: document.getElementById('toggle-education'),
            toggleIncome: document.getElementById('toggle-income'),
            zoomLevel: document.getElementById('zoom-level'),
            zoomSlider: document.getElementById('zoom-slider'),
            totalZips: document.getElementById('total-zips'),
            totalPins: document.getElementById('total-pins'),
            educationTotal: document.getElementById('education-total'),
            incomeTotal: document.getElementById('income-total'),
            updateTime: document.getElementById('update-time'),
            statsEducation: document.getElementById('stats-education'),
            statsIncome: document.getElementById('stats-income'),
            resetView: document.getElementById('reset-view'),
            clearMarkers: document.getElementById('clear-markers'),
            refreshData: document.getElementById('refresh-data'),
            zoomIn: document.getElementById('zoom-in'),
            zoomOut: document.getElementById('zoom-out'),
            latCoord: document.getElementById('lat-coord'),
            lngCoord: document.getElementById('lng-coord')
        };
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Layer toggles
        if (this.uiElements.toggleEducation) {
            this.uiElements.toggleEducation.addEventListener('change', () => {
                this.updateLayer('education');
            });
        }
        
        if (this.uiElements.toggleIncome) {
            this.uiElements.toggleIncome.addEventListener('change', () => {
                this.updateLayer('income');
            });
        }
        
        // Map controls
        if (this.uiElements.resetView) {
            this.uiElements.resetView.addEventListener('click', () => {
                this.resetMapView();
            });
        }
        
        if (this.uiElements.clearMarkers) {
            this.uiElements.clearMarkers.addEventListener('click', () => {
                this.clearAllMarkers();
            });
        }
        
        if (this.uiElements.refreshData) {
            this.uiElements.refreshData.addEventListener('click', () => {
                this.refreshData();
            });
        }
        
        // Zoom controls
        if (this.uiElements.zoomIn) {
            this.uiElements.zoomIn.addEventListener('click', () => {
                this.map.setZoom(this.map.getZoom() + 1);
            });
        }
        
        if (this.uiElements.zoomOut) {
            this.uiElements.zoomOut.addEventListener('click', () => {
                this.map.setZoom(this.map.getZoom() - 1);
            });
        }
        
        // Zoom slider
        if (this.uiElements.zoomSlider) {
            this.uiElements.zoomSlider.addEventListener('input', (e) => {
                const zoom = parseInt(e.target.value);
                this.map.setZoom(zoom);
            });
        }
        
        // Fullscreen button
        const fullscreenBtn = document.getElementById('fullscreen-btn');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', () => {
                this.toggleFullscreen();
            });
        }
        
        // Help button
        const helpBtn = document.getElementById('help-btn');
        if (helpBtn) {
            helpBtn.addEventListener('click', () => {
                this.showHelp();
            });
        }
        
        // Footer links
        const links = ['privacy', 'data', 'github', 'issue'];
        links.forEach(link => {
            const element = document.getElementById(`${link}-link`);
            if (element) {
                element.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.handleFooterLink(link);
                });
            }
        });
    }

    /**
     * Initialize Google Maps
     */
    initMap() {
        return new Promise((resolve, reject) => {
            try {
                console.log('Initializing Google Maps...');
                
                // Check if Google Maps is available
                if (!window.google || !window.google.maps) {
                    throw new Error('Google Maps API not loaded');
                }
                
                // Create map
                this.map = new google.maps.Map(this.uiElements.map, {
                    zoom: this.currentZoom,
                    center: { lat: 39.8283, lng: -98.5795 }, // Center of US
                    mapTypeId: 'terrain',
                    mapTypeControl: true,
                    streetViewControl: false,
                    fullscreenControl: false,
                    zoomControl: false,
                    styles: [
                        {
                            featureType: "poi",
                            elementType: "labels",
                            stylers: [{ visibility: "off" }]
                        },
                        {
                            featureType: "transit",
                            elementType: "labels",
                            stylers: [{ visibility: "off" }]
                        }
                    ]
                });
                
                // Set up map event listeners
                this.map.addListener('zoom_changed', () => {
                    this.handleZoomChange();
                });
                
                this.map.addListener('mousemove', (event) => {
                    this.updateCoordinates(event.latLng);
                });
                
                this.map.addListener('click', (event) => {
                    // You could add click functionality here
                    console.log('Map clicked at:', event.latLng.toString());
                });
                
                console.log('Google Maps initialized successfully');
                resolve();
                
            } catch (error) {
                console.error('Failed to initialize Google Maps:', error);
                reject(error);
            }
        });
    }

    /**
     * Load ZIP code centroids
     */
    async loadZipCentroids() {
        try {
            console.log('Loading ZIP code centroids...');
            
            // For development, use a small sample
            // In production, load from a JSON file
            this.zipCentroids = {
                "10001": { lat: 40.7506, lng: -73.9976 },
                "90210": { lat: 34.1030, lng: -118.4108 },
                "60614": { lat: 41.9230, lng: -87.6490 },
                "94107": { lat: 37.7813, lng: -122.3934 },
                "78701": { lat: 30.2672, lng: -97.7431 },
                "33131": { lat: 25.7617, lng: -80.1918 },
                "98101": { lat: 47.6062, lng: -122.3321 },
                "20001": { lat: 38.9072, lng: -77.0369 },
                "30303": { lat: 33.7490, lng: -84.3880 },
                "75201": { lat: 32.7767, lng: -96.7970 }
            };
            
            console.log(`Loaded ${Object.keys(this.zipCentroids).length} ZIP centroids`);
            
            // Uncomment for production to load from file:
            // const response = await fetch('data/zip-centroids.json');
            // this.zipCentroids = await response.json();
            
        } catch (error) {
            console.warn('Failed to load ZIP centroids:', error);
            // Continue with sample data
        }
    }

    /**
     * Load Census data
     */
    async loadData() {
        try {
            console.log('Loading Census data...');
            
            // Show loading state
            this.updateLoadingStatus('Loading Census data...', 20);
            
            // For GitHub Pages static hosting, use pre-fetched data
            // For development with API access, use live data
            
            if (window.location.hostname.includes('github.io')) {
                // Static hosting - load from JSON files
                this.censusData = await this.dataFetcher.loadFromStaticFiles();
            } else {
                // Development - fetch from API
                // Limit to ZIPs we have centroids for
                const zipCodes = Object.keys(this.zipCentroids);
                this.censusData = await this.dataFetcher.getAllData(zipCodes);
            }
            
            this.updateLoadingStatus('Creating map markers...', 80);
            
            // Create markers
            await this.createMarkers();
            
            // Update UI with data
            this.updateUIWithData();
            
            this.updateLoadingStatus('Map ready!', 100);
            
            console.log('Data loaded successfully');
            
        } catch (error) {
            console.error('Failed to load data:', error);
            this.showError(`Data loading failed: ${error.message}`);
        }
    }

    /**
     * Create markers for all data points
     */
    async createMarkers() {
        try {
            console.log('Creating map markers...');
            
            // Clear existing markers
            this.clearAllMarkers();
            
            const educationMarkers = [];
            const incomeMarkers = [];
            
            // Process each ZIP code with data
            for (const [zip, data] of Object.entries(this.censusData)) {
                if (!data.hasData) continue;
                
                const centroid = this.zipCentroids[zip];
                if (!centroid) continue;
                
                // Create education markers
                if (data.education && data.education.total > 0) {
                    const markers = this.createDataMarkers(
                        centroid,
                        data.education.total,
                        'education',
                        '#1a73e8',
                        zip,
                        data.education
                    );
                    educationMarkers.push(...markers);
                }
                
                // Create income markers
                if (data.income && data.income.total > 0) {
                    const markers = this.createDataMarkers(
                        centroid,
                        data.income.total,
                        'income',
                        '#34a853',
                        zip,
                        data.income
                    );
                    incomeMarkers.push(...markers);
                }
            }
            
            // Store markers
            this.markers.education = educationMarkers;
            this.markers.income = incomeMarkers;
            
            // Apply clustering with current visibility
            this.applyClustering();
            
            console.log(`Created ${educationMarkers.length} education markers and ${incomeMarkers.length} income markers`);
            
        } catch (error) {
            console.error('Failed to create markers:', error);
            throw error;
        }
    }

    /**
     * Create markers for a single data point
     */
    createDataMarkers(centroid, count, type, color, zip, rawData) {
        const markers = [];
        const pinsCount = Math.max(1, Math.round(count / 1000)); // One pin per 1,000
        
        for (let i = 0; i < pinsCount; i++) {
            // Add slight random offset (~500m radius)
            const offset = {
                lat: (Math.random() - 0.5) * 0.005,
                lng: (Math.random() - 0.5) * 0.005
            };
            
            const position = {
                lat: centroid.lat + offset.lat,
                lng: centroid.lng + offset.lng
            };
            
            // Create marker
            const marker = new google.maps.Marker({
                position: position,
                map: null, // Will be set by applyClustering
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    fillColor: color,
                    fillOpacity: 0.7,
                    strokeWeight: 1,
                    strokeColor: '#ffffff',
                    scale: 8
                },
                title: `${zip}: ${count.toLocaleString()} ${type}`,
                zIndex: type === 'education' ? 1 : 2
            });
            
            // Create info window content
            const infoContent = this.createInfoWindowContent(zip, type, count, rawData);
            const infoWindow = new google.maps.InfoWindow({
                content: infoContent,
                maxWidth: 300
            });
            
            // Add click listener
            marker.addListener('click', () => {
                // Close any open info windows
                this.closeAllInfoWindows();
                
                // Open this info window
                infoWindow.open(this.map, marker);
                this.currentInfoWindow = infoWindow;
            });
            
            markers.push(marker);
        }
        
        return markers;
    }

    /**
     * Create info window content
     */
    createInfoWindowContent(zip, type, count, rawData) {
        let detailsHTML = '';
        
        if (type === 'education') {
            detailsHTML = `
                <div class="info-details">
                    <h4>Education Breakdown (Age 25+)</h4>
                    <ul>
                        <li>Bachelor's Degree: <strong>${rawData.breakdown.bachelors.toLocaleString()}</strong></li>
                        <li>Master's Degree: <strong>${rawData.breakdown.masters.toLocaleString()}</strong></li>
                        <li>Professional Degree: <strong>${rawData.breakdown.professional.toLocaleString()}</strong></li>
                        <li>Doctorate Degree: <strong>${rawData.breakdown.doctorate.toLocaleString()}</strong></li>
                    </ul>
                </div>
            `;
        } else {
            detailsHTML = `
                <div class="info-details">
                    <h4>Income Breakdown (Households)</h4>
                    <ul>
                        <li>$100k - $125k: <strong>${rawData.breakdown['100k_125k'].toLocaleString()}</strong></li>
                        <li>$125k - $150k: <strong>${rawData.breakdown['125k_150k'].toLocaleString()}</strong></li>
                        <li>$150k - $200k: <strong>${rawData.breakdown['150k_200k'].toLocaleString()}</strong></li>
                        <li>$200k+: <strong>${rawData.breakdown['200k_plus'].toLocaleString()}</strong></li>
                    </ul>
                </div>
            `;
        }
        
        return `
            <div class="info-window">
                <div class="info-header">
                    <h3>ZIP Code: ${zip}</h3>
                    <p class="info-subtitle">${type === 'education' ? 'Residents with Bachelor\'s Degree or Higher' : 'Households with Income ≥ $100k'}</p>
                </div>
                <div class="info-stats">
                    <div class="stat-item">
                        <span class="stat-label">Total Count:</span>
                        <span class="stat-value">${count.toLocaleString()}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Map Pins:</span>
                        <span class="stat-value">${Math.round(count / 1000)} (≈1,000 each)</span>
                    </div>
                </div>
                ${detailsHTML}
                <div class="info-footer">
                    <small>Source: US Census ACS ${this.dataFetcher.year} 5-Year Estimates</small>
                </div>
            </div>
        `;
    }

    /**
     * Apply marker clustering based on layer visibility
     */
    applyClustering() {
        // Clear existing clusterer
        if (this.markerClusterer) {
            this.markerClusterer.clearMarkers();
        }
        
        // Collect visible markers
        const visibleMarkers = [];
        
        // Add education markers if visible
        if (this.layerVisibility.education) {
            this.markers.education.forEach(marker => {
                marker.setMap(this.map);
                visibleMarkers.push(marker);
            });
        } else {
            this.markers.education.forEach(marker => marker.setMap(null));
        }
        
        // Add income markers if visible
        if (this.layerVisibility.income) {
            this.markers.income.forEach(marker => {
                marker.setMap(this.map);
                visibleMarkers.push(marker);
            });
        } else {
            this.markers.income.forEach(marker => marker.setMap(null));
        }
        
        // Create new clusterer
        if (visibleMarkers.length > 0) {
            this.markerClusterer = new markerClusterer.MarkerClusterer({
                map: this.map,
                markers: visibleMarkers,
                algorithmOptions: {
                    maxZoom: 15
                },
                renderer: {
                    render: ({ count, position }) => {
                        const color = this.getClusterColor(count);
                        return new google.maps.Marker({
                            position,
                            icon: {
                                path: google.maps.SymbolPath.CIRCLE,
                                fillColor: color,
                                fillOpacity: 0.8,
                                strokeColor: '#ffffff',
                                strokeWeight: 2,
                                scale: Math.min(10 + Math.sqrt(count) * 2, 40)
                            },
                            label: {
                                text: count.toString(),
                                color: 'white',
                                fontSize: '12px',
                                fontWeight: 'bold'
                            }
                        });
                    }
                }
            });
        }
        
        // Update total pins display
        this.updateTotalPinsCount();
    }

    /**
     * Get color for cluster based on size
     */
    getClusterColor(count) {
        if (count < 10) return '#4299e1'; // Blue
        if (count < 50) return '#ed8936'; // Orange
        return '#e53e3e'; // Red for large clusters
    }

    /**
     * Update layer visibility
     */
    updateLayer(layerType) {
        if (!this.layerVisibility.hasOwnProperty(layerType)) {
            console.error(`Unknown layer type: ${layerType}`);
            return;
        }
        
        // Toggle visibility
        this.layerVisibility[layerType] = !this.layerVisibility[layerType];
        
        // Update checkbox state
        const checkbox = this.uiElements[`toggle${layerType.charAt(0).toUpperCase() + layerType.slice(1)}`];
        if (checkbox) {
            checkbox.checked = this.layerVisibility[layerType];
        }
        
        // Reapply clustering with new visibility
        this.applyClustering();
        
        console.log(`${layerType} layer ${this.layerVisibility[layerType] ? 'enabled' : 'disabled'}`);
    }

    /**
     * Handle zoom changes
     */
    handleZoomChange() {
        const zoom = this.map.getZoom();
        this.currentZoom = zoom;
        
        // Update UI
        if (this.uiElements.zoomLevel) {
            this.uiElements.zoomLevel.textContent = zoom;
        }
        
        if (this.uiElements.zoomSlider) {
            this.uiElements.zoomSlider.value = zoom;
        }
        
        // You could add additional zoom-based logic here
        // For example, adjust marker density or clustering
    }

    /**
     * Update coordinates display
     */
    updateCoordinates(latLng) {
        if (this.uiElements.latCoord && this.uiElements.lngCoord) {
            this.uiElements.latCoord.textContent = latLng.lat().toFixed(4);
            this.uiElements.lngCoord.textContent = latLng.lng().toFixed(4);
        }
    }

    /**
     * Update UI with loaded data
     */
    updateUIWithData() {
        if (!this.censusData || Object.keys(this.censusData).length === 0) {
            return;
        }
        
        // Calculate totals
        let educationTotal = 0;
        let incomeTotal = 0;
        let zipsWithEducation = 0;
        let zipsWithIncome = 0;
        
        Object.values(this.censusData).forEach(data => {
            if (data.education) {
                educationTotal += data.education.total;
                zipsWithEducation++;
            }
            if (data.income) {
                incomeTotal += data.income.total;
                zipsWithIncome++;
            }
        });
        
        // Update UI elements
        if (this.uiElements.totalZips) {
            this.uiElements.totalZips.textContent = Object.keys(this.censusData).length.toLocaleString();
        }
        
        if (this.uiElements.educationTotal) {
            this.uiElements.educationTotal.textContent = educationTotal.toLocaleString();
        }
        
        if (this.uiElements.incomeTotal) {
            this.uiElements.incomeTotal.textContent = incomeTotal.toLocaleString();
        }
        
        if (this.uiElements.statsEducation) {
            this.uiElements.statsEducation.innerHTML = `
                Total: <strong>${educationTotal.toLocaleString()}</strong><br>
                ZIPs: <strong>${zipsWithEducation}</strong>
            `;
        }
        
        if (this.uiElements.statsIncome) {
            this.uiElements.statsIncome.innerHTML = `
                Total: <strong>${incomeTotal.toLocaleString()}</strong><br>
                ZIPs: <strong>${zipsWithIncome}</strong>
            `;
        }
        
        if (this.uiElements.updateTime) {
            const now = new Date();
            this.uiElements.updateTime.textContent = now.toLocaleString();
        }
    }

    /**
     * Update total pins count
     */
    updateTotalPinsCount() {
        let totalPins = 0;
        
        if (this.layerVisibility.education) {
            totalPins += this.markers.education.length;
        }
        
        if (this.layerVisibility.income) {
            totalPins += this.markers.income.length;
        }
        
        if (this.uiElements.totalPins) {
            this.uiElements.totalPins.textContent = totalPins.toLocaleString();
        }
    }

    /**
     * Reset map view to default
     */
    resetMapView() {
        this.map.setCenter({ lat: 39.8283, lng: -98.5795 });
        this.map.setZoom(4);
        console.log('Map view reset');
    }

    /**
     * Clear all markers from the map
     */
    clearAllMarkers() {
        // Clear from map
        this.markers.education.forEach(marker => marker.setMap(null));
        this.markers.income.forEach(marker => marker.setMap(null));
        
        // Clear arrays
        this.markers.education = [];
        this.markers.income = [];
        
        // Clear clusterer
        if (this.markerClusterer) {
            this.markerClusterer.clearMarkers();
        }
        
        // Update UI
        this.updateTotalPinsCount();
        
        console.log('All markers cleared');
    }

    /**
     * Refresh data (clear cache and reload)
     */
    async refreshData() {
        try {
            // Clear cache
            this.dataFetcher.clearCache();
            
            // Show loading
            this.updateLoadingStatus('Refreshing data...', 10);
            
            // Reload data
            await this.loadData();
            
            console.log('Data refreshed successfully');
            
        } catch (error) {
            console.error('Failed to refresh data:', error);
            this.showError(`Refresh failed: ${error.message}`);
        }
    }

    /**
     * Toggle fullscreen mode
     */
    toggleFullscreen() {
        const elem = document.documentElement;
        
        if (!document.fullscreenElement) {
            if (elem.requestFullscreen) {
                elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) { /* Safari */
                elem.webkitRequestFullscreen();
            } else if (elem.msRequestFullscreen) { /* IE11 */
                elem.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) { /* Safari */
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) { /* IE11 */
                document.msExitFullscreen();
            }
        }
    }

    /**
     * Show help information
     */
    showHelp() {
        const helpMessage = `
            US Census ACS Data Explorer Help:
            
            • Toggle layers using switches in sidebar
            • Click on pins to see detailed data
            • Zoom in/out using buttons or mouse wheel
            • Clusters show number of markers in area
            • Each pin represents ≈1,000 people/households
            • Data source: US Census ACS 2022 5-Year Estimates
            
            Need more help? Contact support.
        `;
        
        alert(helpMessage);
    }

    /**
     * Handle footer link clicks
     */
    handleFooterLink(linkType) {
        const urls = {
            privacy: '#',
            data: 'https://www.census.gov/data/developers/data-sets/acs-5year.html',
            github: 'https://github.com',
            issue: '#'
        };
        
        if (linkType === 'data' || linkType === 'github') {
            window.open(urls[linkType], '_blank');
        } else {
            // For modal or other actions
            console.log(`Clicked ${linkType} link`);
        }
    }

    /**
     * Close all open info windows
     */
    closeAllInfoWindows() {
        if (this.currentInfoWindow) {
            this.currentInfoWindow.close();
            this.currentInfoWindow = null;
        }
    }

    /**
     * Update loading status
     */
    updateLoadingStatus(message, progress) {
        if (this.uiElements.loadingText) {
            this.uiElements.loadingText.textContent = message;
        }
        
        if (this.uiElements.loadingProgress) {
            this.uiElements.loadingProgress.style.width = `${progress}%`;
        }
    }

    /**
     * Hide loading overlay
     */
    hideLoadingOverlay() {
        if (this.uiElements.loadingOverlay) {
            // Fade out and remove
            this.uiElements.loadingOverlay.style.opacity = '0';
            setTimeout(() => {
                this.uiElements.loadingOverlay.style.display = 'none';
            }, 300);
        }
    }

    /**
     * Show error message
     */
    showError(message) {
        console.error('Application error:', message);
        
        const errorContainer = document.getElementById('error-container');
        if (errorContainer) {
            errorContainer.innerHTML = `
                <div class="error-message">
                    <h3>❌ Error</h3>
                    <p>${message}</p>
                    <p>Please check your configuration and try again.</p>
                    <button onclick="location.reload()">Reload Page</button>
                </div>
            `;
            errorContainer.style.display = 'block';
            
            // Auto-hide after 10 seconds
            setTimeout(() => {
                errorContainer.style.display = 'none';
            }, 10000);
        } else {
            alert(`Error: ${message}`);
        }
    }

    /**
     * Get application status
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            dataLoaded: Object.keys(this.censusData).length > 0,
            markers: {
                education: this.markers.education.length,
                income: this.markers.income.length
            },
            layers: this.layerVisibility,
            zoom: this.currentZoom
        };
    }
}

// Global error handler
window.addEventListener('error', function(event) {
    console.error('Global error:', event.error);
    
    const errorDiv = document.getElementById('error-container');
    if (errorDiv) {
        errorDiv.innerHTML = `
            <div class="error-message">
                <h3>⚠️ Unexpected Error</h3>
                <p>${event.message}</p>
                <p>Check console for details.</p>
                <button onclick="location.reload()">Reload Page</button>
            </div>
        `;
        errorDiv.style.display = 'block';
    }
});

// Export for debugging
window.CensusMapApp = CensusMapApp;