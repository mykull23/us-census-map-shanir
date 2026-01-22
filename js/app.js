/**
 * Main Application Controller - Simplified Version
 */
class CensusMapApp {
    constructor() {
        this.map = null;
        this.markerClusterer = null;
        this.data = {};
        this.markers = { education: [], income: [] };
        this.layerVisibility = { education: true, income: true };
        this.uiElements = {};
        this.currentInfoWindow = null;
        this.PIN_THRESHOLD = 1000; // Each pin represents this many people/households
    }

    async initialize() {
        try {
            console.log('Initializing Census Map Application...');
            this.cacheUIElements();
            this.setupEventListeners();
            await this.initMap();
            await this.loadData();
            this.isInitialized = true;
            console.log('Application initialized successfully');
        } catch (error) {
            console.error('Failed to initialize:', error);
            this.showError(`Initialization failed: ${error.message}`);
        } finally {
            this.hideLoadingOverlay();
        }
    }

    cacheUIElements() {
        const ids = [
            'loading-overlay', 'loading-text', 'loading-progress',
            'map', 'toggle-education', 'toggle-income', 'zoom-level',
            'zoom-slider', 'total-zips', 'total-pins', 'education-total',
            'income-total', 'update-time', 'stats-education', 'stats-income',
            'reset-view', 'clear-markers', 'zoom-in', 'zoom-out',
            'lat-coord', 'lng-coord', 'fullscreen-btn', 'help-btn'
        ];
        
        ids.forEach(id => {
            this.uiElements[id] = document.getElementById(id);
        });
    }

    setupEventListeners() {
        // Layer toggles
        if (this.uiElements['toggle-education']) {
            this.uiElements['toggle-education'].addEventListener('change', () => this.updateLayer('education'));
        }
        if (this.uiElements['toggle-income']) {
            this.uiElements['toggle-income'].addEventListener('change', () => this.updateLayer('income'));
        }
        
        // Map controls
        if (this.uiElements['reset-view']) {
            this.uiElements['reset-view'].addEventListener('click', () => this.resetMapView());
        }
        if (this.uiElements['clear-markers']) {
            this.uiElements['clear-markers'].addEventListener('click', () => this.clearAllMarkers());
        }
        if (this.uiElements['zoom-in']) {
            this.uiElements['zoom-in'].addEventListener('click', () => this.map.setZoom(this.map.getZoom() + 1));
        }
        if (this.uiElements['zoom-out']) {
            this.uiElements['zoom-out'].addEventListener('click', () => this.map.setZoom(this.map.getZoom() - 1));
        }
        if (this.uiElements['zoom-slider']) {
            this.uiElements['zoom-slider'].addEventListener('input', (e) => {
                this.map.setZoom(parseInt(e.target.value));
            });
        }
        
        // Buttons
        if (this.uiElements['fullscreen-btn']) {
            this.uiElements['fullscreen-btn'].addEventListener('click', () => this.toggleFullscreen());
        }
        if (this.uiElements['help-btn']) {
            this.uiElements['help-btn'].addEventListener('click', () => this.showHelp());
        }
    }

    initMap() {
        return new Promise((resolve, reject) => {
            try {
                if (!window.google?.maps) {
                    throw new Error('Google Maps API not loaded');
                }
                
                this.map = new google.maps.Map(this.uiElements.map, {
                    zoom: 4,
                    center: { lat: 39.8283, lng: -98.5795 },
                    mapTypeId: 'terrain',
                    mapTypeControl: true,
                    streetViewControl: false,
                    fullscreenControl: false,
                    zoomControl: false
                });
                
                this.map.addListener('zoom_changed', () => this.handleZoomChange());
                this.map.addListener('mousemove', (event) => this.updateCoordinates(event.latLng));
                
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    async loadData() {
        try {
            this.updateLoadingStatus('Loading data...', 30);
            
            // Load all data files directly
            const [zipResponse, eduResponse, incResponse] = await Promise.all([
                fetch('data/zip-centroids.json'),
                fetch('data/education-data.json'),
                fetch('data/income-data.json')
            ]);
            
            const [zipCentroids, educationData, incomeData] = await Promise.all([
                zipResponse.json(),
                eduResponse.json(),
                incResponse.json()
            ]);
            
            this.updateLoadingStatus('Creating markers...', 70);
            
            // Combine and process data
            this.data = this.processData(zipCentroids, educationData, incomeData);
            
            // Create markers
            this.createMarkers();
            
            // Update UI
            this.updateUI();
            
            this.updateLoadingStatus('Map ready!', 100);
            
        } catch (error) {
            console.error('Failed to load data:', error);
            throw error;
        }
    }

    processData(zipCentroids, educationData, incomeData) {
        const processedData = {};
        const allZips = new Set([
            ...Object.keys(zipCentroids),
            ...Object.keys(educationData),
            ...Object.keys(incomeData)
        ]);
        
        allZips.forEach(zip => {
            processedData[zip] = {
                centroid: zipCentroids[zip],
                education: educationData[zip],
                income: incomeData[zip]
            };
        });
        
        return processedData;
    }

    createMarkers() {
        this.clearAllMarkers();
        
        const educationMarkers = [];
        const incomeMarkers = [];
        
        Object.entries(this.data).forEach(([zip, data]) => {
            if (!data.centroid) return;
            
            // Education markers
            if (data.education?.total > 0) {
                const markers = this.createMarkersForData(
                    data.centroid,
                    data.education.total,
                    'education',
                    '#1a73e8',
                    zip,
                    data.education
                );
                educationMarkers.push(...markers);
            }
            
            // Income markers
            if (data.income?.total > 0) {
                const markers = this.createMarkersForData(
                    data.centroid,
                    data.income.total,
                    'income',
                    '#34a853',
                    zip,
                    data.income
                );
                incomeMarkers.push(...markers);
            }
        });
        
        this.markers.education = educationMarkers;
        this.markers.income = incomeMarkers;
        
        this.applyClustering();
        
        console.log(`Created ${educationMarkers.length} education and ${incomeMarkers.length} income markers`);
    }

    createMarkersForData(centroid, count, type, color, zip, rawData) {
        const markers = [];
        const pinsCount = Math.max(1, Math.round(count / this.PIN_THRESHOLD));
        
        for (let i = 0; i < pinsCount; i++) {
            const offset = {
                lat: (Math.random() - 0.5) * 0.005,
                lng: (Math.random() - 0.5) * 0.005
            };
            
            const marker = new google.maps.Marker({
                position: {
                    lat: centroid.lat + offset.lat,
                    lng: centroid.lng + offset.lng
                },
                map: null,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    fillColor: color,
                    fillOpacity: 0.7,
                    strokeWeight: 1,
                    strokeColor: '#ffffff',
                    scale: 8
                },
                title: `${zip}: ${count.toLocaleString()} ${type}`
            });
            
            const infoWindow = new google.maps.InfoWindow({
                content: this.createInfoWindowContent(zip, type, count, rawData),
                maxWidth: 300
            });
            
            marker.addListener('click', () => {
                if (this.currentInfoWindow) this.currentInfoWindow.close();
                infoWindow.open(this.map, marker);
                this.currentInfoWindow = infoWindow;
            });
            
            markers.push(marker);
        }
        
        return markers;
    }

    createInfoWindowContent(zip, type, count, rawData) {
        return `
            <div class="info-window">
                <h3>ZIP Code: ${zip}</h3>
                <p><strong>${type === 'education' ? 'College Graduates' : 'High-Income Households'}:</strong> ${count.toLocaleString()}</p>
                <p>Map pins: ${Math.round(count / this.PIN_THRESHOLD)} (≈${this.PIN_THRESHOLD.toLocaleString()} each)</p>
                <hr>
                <p><small>Source: US Census ACS 2022</small></p>
            </div>
        `;
    }

    applyClustering() {
        if (this.markerClusterer) {
            this.markerClusterer.clearMarkers();
        }
        
        const visibleMarkers = [];
        
        if (this.layerVisibility.education) {
            this.markers.education.forEach(marker => {
                marker.setMap(this.map);
                visibleMarkers.push(marker);
            });
        } else {
            this.markers.education.forEach(marker => marker.setMap(null));
        }
        
        if (this.layerVisibility.income) {
            this.markers.income.forEach(marker => {
                marker.setMap(this.map);
                visibleMarkers.push(marker);
            });
        } else {
            this.markers.income.forEach(marker => marker.setMap(null));
        }
        
        if (visibleMarkers.length > 0) {
            this.markerClusterer = new markerClusterer.MarkerClusterer({
                map: this.map,
                markers: visibleMarkers
            });
        }
        
        this.updateTotalPinsCount();
    }

    updateLayer(layerType) {
        if (!this.layerVisibility.hasOwnProperty(layerType)) return;
        
        this.layerVisibility[layerType] = !this.layerVisibility[layerType];
        const checkbox = this.uiElements[`toggle-${layerType}`];
        if (checkbox) checkbox.checked = this.layerVisibility[layerType];
        
        this.applyClustering();
    }

    handleZoomChange() {
        const zoom = this.map.getZoom();
        if (this.uiElements['zoom-level']) {
            this.uiElements['zoom-level'].textContent = zoom;
        }
        if (this.uiElements['zoom-slider']) {
            this.uiElements['zoom-slider'].value = zoom;
        }
    }

    updateCoordinates(latLng) {
        if (this.uiElements['lat-coord'] && this.uiElements['lng-coord']) {
            this.uiElements['lat-coord'].textContent = latLng.lat().toFixed(4);
            this.uiElements['lng-coord'].textContent = latLng.lng().toFixed(4);
        }
    }

    updateUI() {
        if (!this.data) return;
        
        let educationTotal = 0;
        let incomeTotal = 0;
        let zipsWithEducation = 0;
        let zipsWithIncome = 0;
        
        Object.values(this.data).forEach(data => {
            if (data.education) {
                educationTotal += data.education.total || 0;
                zipsWithEducation++;
            }
            if (data.income) {
                incomeTotal += data.income.total || 0;
                zipsWithIncome++;
            }
        });
        
        // Update UI elements
        const updates = {
            'total-zips': Object.keys(this.data).length,
            'education-total': educationTotal,
            'income-total': incomeTotal,
            'update-time': new Date().toLocaleString()
        };
        
        Object.entries(updates).forEach(([id, value]) => {
            if (this.uiElements[id]) {
                this.uiElements[id].textContent = typeof value === 'number' ? 
                    value.toLocaleString() : value;
            }
        });
        
        // Update stats
        if (this.uiElements['stats-education']) {
            this.uiElements['stats-education'].innerHTML = 
                `Total: <strong>${educationTotal.toLocaleString()}</strong><br>ZIPs: <strong>${zipsWithEducation}</strong>`;
        }
        if (this.uiElements['stats-income']) {
            this.uiElements['stats-income'].innerHTML = 
                `Total: <strong>${incomeTotal.toLocaleString()}</strong><br>ZIPs: <strong>${zipsWithIncome}</strong>`;
        }
    }

    updateTotalPinsCount() {
        let totalPins = 0;
        if (this.layerVisibility.education) totalPins += this.markers.education.length;
        if (this.layerVisibility.income) totalPins += this.markers.income.length;
        
        if (this.uiElements['total-pins']) {
            this.uiElements['total-pins'].textContent = totalPins.toLocaleString();
        }
    }

    resetMapView() {
        this.map.setCenter({ lat: 39.8283, lng: -98.5795 });
        this.map.setZoom(4);
    }

    clearAllMarkers() {
        this.markers.education.forEach(marker => marker.setMap(null));
        this.markers.income.forEach(marker => marker.setMap(null));
        this.markers.education = [];
        this.markers.income = [];
        
        if (this.markerClusterer) {
            this.markerClusterer.clearMarkers();
        }
        
        this.updateTotalPinsCount();
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    showHelp() {
        alert(`US Census ACS Data Explorer\n\n• Toggle layers using switches\n• Click pins for details\n• Zoom in/out with buttons or slider\n• Each pin ≈1,000 people/households\n\nData source: US Census ACS 2022`);
    }

    updateLoadingStatus(message, progress) {
        if (this.uiElements['loading-text']) {
            this.uiElements['loading-text'].textContent = message;
        }
        if (this.uiElements['loading-progress']) {
            this.uiElements['loading-progress'].style.width = `${progress}%`;
        }
    }

    hideLoadingOverlay() {
        if (this.uiElements['loading-overlay']) {
            setTimeout(() => {
                this.uiElements['loading-overlay'].style.opacity = '0';
                setTimeout(() => {
                    this.uiElements['loading-overlay'].style.display = 'none';
                }, 300);
            }, 500);
        }
    }

    showError(message) {
        console.error('Error:', message);
        
        const errorContainer = document.getElementById('error-container');
        if (errorContainer) {
            errorContainer.innerHTML = `
                <div class="error-message">
                    <h3>❌ Error</h3>
                    <p>${message}</p>
                    <button onclick="location.reload()">Reload Page</button>
                </div>
            `;
            errorContainer.style.display = 'block';
        }
    }
}