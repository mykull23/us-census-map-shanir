// ============================================================================
// MAP VISUALIZATION ENGINE
// ============================================================================

/**
 * Advanced map visualization engine for ACS data
 */
class ACSMapVisualizer {
    constructor(containerId, options = {}) {
        // Configuration
        this.config = {
            containerId: containerId,
            minZoom: 3,
            maxZoom: 18,
            defaultZoom: 4,
            defaultCenter: [39.8283, -98.5795], // Center of US
            tileLayer: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            attribution: '© OpenStreetMap contributors',
            clusterRadius: 50,
            maxClusterZoom: 14,
            enableClustering: true,
            animationDuration: 300,
            highlightDuration: 1000,
            ...options
        };

        // State
        this.map = null;
        this.markerLayer = null;
        this.markerCluster = null;
        this.legend = null;
        this.currentData = null;
        this.highlightedMarker = null;
        this.markers = new Map();
        this.colorScale = null;
        this.currentVariable = null;

        // Pin styling
        this.pinStyles = {
            default: {
                radius: 6,
                fillColor: "#3388ff",
                color: "#000",
                weight: 1.5,
                opacity: 1,
                fillOpacity: 0.8,
                className: 'acs-marker'
            },
            highlighted: {
                radius: 10,
                fillColor: "#ff4444",
                color: "#000",
                weight: 3,
                opacity: 1,
                fillOpacity: 0.9,
                className: 'acs-marker-highlighted'
            },
            selected: {
                radius: 8,
                fillColor: "#ffaa00",
                color: "#000",
                weight: 2.5,
                opacity: 1,
                fillOpacity: 0.9,
                className: 'acs-marker-selected'
            }
        };

        // Color scales
        this.colorScales = {
            sequential: d3.scaleSequential(d3.interpolateViridis),
            diverging: d3.scaleDiverging(d3.interpolateRdBu),
            categorical: d3.scaleOrdinal(d3.schemeCategory10),
            plasma: d3.scaleSequential(d3.interpolatePlasma),
            rainbow: d3.scaleSequential(d3.interpolateRainbow)
        };

        this.currentScaleType = 'sequential';
        this.colorScale = this.colorScales[this.currentScaleType];

        // Initialize
        this.initMap();
        this.initEventListeners();
    }

    // ============================================================================
    // INITIALIZATION
    // ============================================================================

    /**
     * Initialize the map
     */
    initMap() {
        const container = document.getElementById(this.config.containerId);
        if (!container) {
            throw new Error(`Map container not found: ${this.config.containerId}`);
        }

        // Create map instance
        this.map = L.map(container, {
            center: this.config.defaultCenter,
            zoom: this.config.defaultZoom,
            minZoom: this.config.minZoom,
            maxZoom: this.config.maxZoom,
            zoomControl: false,
            fadeAnimation: true,
            markerZoomAnimation: true
        });

        // Add tile layer
        L.tileLayer(this.config.tileLayer, {
            attribution: this.config.attribution,
            maxZoom: 19,
            detectRetina: true
        }).addTo(this.map);

        // Add zoom control
        L.control.zoom({
            position: 'topright'
        }).addTo(this.map);

        // Add scale control
        L.control.scale({
            imperial: true,
            metric: true,
            position: 'bottomleft'
        }).addTo(this.map);

        // Initialize marker layer
        this.markerLayer = L.layerGroup().addTo(this.map);

        // Fit to US bounds
        this.map.fitBounds([
            [24.396308, -124.848974],
            [49.384358, -66.885444]
        ]);

        console.log('Map initialized successfully');
    }

    /**
     * Initialize event listeners
     */
    initEventListeners() {
        // Map click to clear selection
        this.map.on('click', () => {
            this.clearHighlight();
        });

        // Map move end for bounds-based filtering
        this.map.on('moveend', () => {
            this.emit('mapMoveEnd', {
                bounds: this.map.getBounds(),
                zoom: this.map.getZoom()
            });
        });

        // Zoom change
        this.map.on('zoomend', () => {
            this.emit('zoomChange', {
                zoom: this.map.getZoom()
            });
        });
    }

    // ============================================================================
    // DATA VISUALIZATION
    // ============================================================================

    /**
     * Visualize ACS data on map
     */
    async visualizeData(zipData, acsData, variable, options = {}) {
        const startTime = performance.now();
        
        try {
            this.emit('visualizationStart', { variable, dataCount: Object.keys(acsData).length });

            // Clear previous visualization
            this.clear();

            // Store current data
            this.currentData = { zipData, acsData, variable };
            this.currentVariable = variable;

            // Filter and prepare data
            const dataPoints = this.prepareDataPoints(zipData, acsData, variable);
            
            if (dataPoints.length === 0) {
                this.emit('visualizationComplete', {
                    success: false,
                    message: 'No valid data points to visualize',
                    duration: performance.now() - startTime
                });
                return;
            }

            // Set up color scale
            this.setupColorScale(dataPoints, variable);

            // Create markers
            const markers = this.createMarkers(dataPoints, variable, options);

            // Add markers to map
            if (this.config.enableClustering && markers.length > 100) {
                this.addClusteredMarkers(markers);
            } else {
                this.addMarkers(markers);
            }

            // Add legend
            if (options.showLegend !== false) {
                this.addLegend(dataPoints, variable);
            }

            // Fit bounds if requested
            if (options.fitBounds !== false && markers.length > 0) {
                this.fitToMarkers(markers, options.padding);
            }

            const duration = performance.now() - startTime;
            
            this.emit('visualizationComplete', {
                success: true,
                dataPoints: dataPoints.length,
                markers: markers.length,
                duration
            });

            console.log(`Visualized ${dataPoints.length} data points in ${duration.toFixed(0)}ms`);

        } catch (error) {
            const duration = performance.now() - startTime;
            
            this.emit('visualizationError', {
                error,
                duration
            });
            
            console.error('Visualization failed:', error);
            throw error;
        }
    }

    /**
     * Prepare data points for visualization
     */
    prepareDataPoints(zipData, acsData, variable) {
        const dataPoints = [];

        for (const [zip, acsRecord] of Object.entries(acsData)) {
            const zipInfo = zipData.get(zip);
            if (!zipInfo) continue;

            const value = acsRecord.data[variable];
            if (value === null || isNaN(value)) continue;

            dataPoints.push({
                zip,
                value,
                lat: zipInfo.lat,
                lng: zipInfo.lng,
                info: zipInfo,
                metadata: acsRecord.metadata
            });
        }

        return dataPoints;
    }

    /**
     * Set up color scale for data
     */
    setupColorScale(dataPoints, variable) {
        const values = dataPoints.map(d => d.value);
        const [min, max] = d3.extent(values);
        
        // Use appropriate scale based on data distribution
        if (this.currentScaleType === 'diverging') {
            const mid = (min + max) / 2;
            this.colorScale.domain([min, mid, max]);
        } else {
            this.colorScale.domain([min, max]);
        }
    }

    /**
     * Create markers from data points
     */
    createMarkers(dataPoints, variable, options) {
        const markers = [];

        for (const point of dataPoints) {
            const marker = this.createMarker(point, variable, options);
            if (marker) {
                markers.push(marker);
                this.markers.set(point.zip, marker);
            }
        }

        return markers;
    }

    /**
     * Create a single marker
     */
    createMarker(point, variable, options) {
        if (point.lat === null || point.lng === null) {
            return null;
        }

        // Calculate radius based on value (log scale for better distribution)
        const baseRadius = options.pinSize || this.pinStyles.default.radius;
        const radius = this.calculateMarkerRadius(point.value, baseRadius);

        // Calculate color based on value
        const color = this.colorScale(point.value);
        const borderColor = this.getContrastColor(color);

        // Create marker
        const marker = L.circleMarker([point.lat, point.lng], {
            ...this.pinStyles.default,
            radius,
            fillColor: color,
            color: borderColor
        });

        // Store data on marker
        marker.data = point;
        marker.variable = variable;

        // Add popup
        const popupContent = this.createPopupContent(point, variable);
        marker.bindPopup(popupContent, {
            maxWidth: 350,
            minWidth: 300,
            className: 'acs-popup',
            autoPan: true,
            closeButton: true,
            autoClose: false,
            closeOnEscapeKey: true
        });

        // Add interactions
        this.addMarkerInteractions(marker);

        return marker;
    }

    /**
     * Calculate marker radius based on value
     */
    calculateMarkerRadius(value, baseRadius) {
        // Use log scale to handle large value ranges
        const logValue = Math.log10(value + 1);
        const radius = baseRadius + logValue * 2;
        return Math.min(20, Math.max(4, radius));
    }

    /**
     * Create popup content
     */
    createPopupContent(point, variable) {
        const variableNames = {
            'B01003_001E': 'Total Population',
            'B19013_001E': 'Median Household Income',
            'B25077_001E': 'Median Home Value',
            'B25001_001E': 'Housing Units',
            'B08301_001E': 'Means of Transportation',
            'B19001_001E': 'Household Income',
            'B25003_001E': 'Tenure'
        };

        const formatValue = (val, varName) => {
            if (val === null || isNaN(val)) return 'N/A';
            
            if (varName.includes('B190') || varName.includes('B25077')) {
                return `$${val.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
            } else if (varName.includes('B01003')) {
                return val.toLocaleString('en-US', { maximumFractionDigits: 0 });
            } else {
                return val.toLocaleString('en-US', { maximumFractionDigits: 2 });
            }
        };

        return `
            <div class="acs-popup-content">
                <h4>${point.info.city || 'Unknown'}, ${point.info.state_id} ${point.zip}</h4>
                
                <div class="popup-section">
                    <h5>${variableNames[variable] || variable}</h5>
                    <p class="data-value">${formatValue(point.value, variable)}</p>
                </div>
                
                <div class="popup-section">
                    <h5>Location Information</h5>
                    <table class="popup-table">
                        <tr><td>County:</td><td>${point.info.county_name || 'N/A'}</td></tr>
                        <tr><td>Population:</td><td>${point.info.population?.toLocaleString() || 'N/A'}</td></tr>
                        <tr><td>Density:</td><td>${point.info.density?.toFixed(1) || 'N/A'} per sq mi</td></tr>
                        <tr><td>Timezone:</td><td>${point.info.timezone || 'N/A'}</td></tr>
                    </table>
                </div>
                
                <div class="popup-section">
                    <h5>Data Source</h5>
                    <table class="popup-table">
                        <tr><td>Source:</td><td>${point.metadata.source || 'ACS'}</td></tr>
                        <tr><td>Year:</td><td>${point.metadata.year || 'N/A'}</td></tr>
                        <tr><td>Fetched:</td><td>${new Date(point.metadata.fetchedAt).toLocaleDateString()}</td></tr>
                    </table>
                </div>
                
                <div class="popup-actions">
                    <button class="popup-btn zoom-btn" onclick="window.acsMap?.zoomToMarker('${point.zip}')">
                        🔍 Zoom
                    </button>
                    <button class="popup-btn highlight-btn" onclick="window.acsMap?.highlightMarker('${point.zip}')">
                        ✨ Highlight
                    </button>
                    <button class="popup-btn export-btn" onclick="window.acsMap?.exportMarkerData('${point.zip}')">
                        📥 Export
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Add marker interactions
     */
    addMarkerInteractions(marker) {
        // Mouse over
        marker.on('mouseover', (e) => {
            this.onMarkerMouseOver(marker);
        });

        // Mouse out
        marker.on('mouseout', (e) => {
            this.onMarkerMouseOut(marker);
        });

        // Click
        marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            this.onMarkerClick(marker);
        });
    }

    /**
     * Handle marker mouse over
     */
    onMarkerMouseOver(marker) {
        if (this.highlightedMarker !== marker) {
            marker.setStyle({
                ...marker.options,
                weight: 2.5,
                fillOpacity: 0.9
            });
            marker.bringToFront();
            this.emit('markerHover', { marker: marker.data });
        }
    }

    /**
     * Handle marker mouse out
     */
    onMarkerMouseOut(marker) {
        if (this.highlightedMarker !== marker) {
            marker.setStyle(marker.options);
            this.emit('markerHoverEnd', { marker: marker.data });
        }
    }

    /**
     * Handle marker click
     */
    onMarkerClick(marker) {
        this.highlightMarker(marker);
        marker.openPopup();
        this.emit('markerClick', { marker: marker.data });
    }

    // ============================================================================
    // MARKER MANAGEMENT
    // ============================================================================

    /**
     * Add markers to map
     */
    addMarkers(markers) {
        markers.forEach(marker => {
            marker.addTo(this.markerLayer);
        });
    }

    /**
     * Add clustered markers
     */
    addClusteredMarkers(markers) {
        if (this.markerCluster) {
            this.markerCluster.clearLayers();
        }

        this.markerCluster = L.markerClusterGroup({
            maxClusterRadius: this.config.clusterRadius,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            disableClusteringAtZoom: this.config.maxClusterZoom,
            animate: true,
            animateAddingMarkers: true
        });

        markers.forEach(marker => {
            this.markerCluster.addLayer(marker);
        });

        this.markerCluster.addTo(this.map);
    }

    /**
     * Highlight a specific marker
     */
    highlightMarker(marker) {
        // Clear previous highlight
        this.clearHighlight();

        // Highlight new marker
        this.highlightedMarker = marker;
        marker.setStyle(this.pinStyles.highlighted);
        marker.bringToFront();

        // Pan to marker if not in view
        if (!this.map.getBounds().contains(marker.getLatLng())) {
            this.map.panTo(marker.getLatLng(), {
                animate: true,
                duration: 0.5
            });
        }

        // Auto-remove highlight after duration
        setTimeout(() => {
            if (this.highlightedMarker === marker) {
                this.clearHighlight();
            }
        }, this.config.highlightDuration);
    }

    /**
     * Clear highlight
     */
    clearHighlight() {
        if (this.highlightedMarker) {
            this.highlightedMarker.setStyle(this.highlightedMarker.options);
            this.highlightedMarker.closePopup();
            this.highlightedMarker = null;
        }
    }

    /**
     * Zoom to specific marker
     */
    zoomToMarker(zip) {
        const marker = this.markers.get(zip);
        if (marker) {
            this.map.setView(marker.getLatLng(), 12, {
                animate: true,
                duration: 1
            });
            this.highlightMarker(marker);
        }
    }

    // ============================================================================
    // LEGEND
    // ============================================================================

    /**
     * Add legend to map
     */
    addLegend(dataPoints, variable) {
        // Remove existing legend
        if (this.legend) {
            this.legend.remove();
            this.legend = null;
        }

        const values = dataPoints.map(d => d.value);
        const [min, max] = d3.extent(values);
        const grades = this.generateLegendGrades(min, max, 5);

        const legend = L.control({ position: 'bottomright' });

        legend.onAdd = () => {
            const div = L.DomUtil.create('div', 'info legend acs-legend');
            
            div.innerHTML = `
                <div class="legend-header">
                    <h4>${this.getVariableName(variable)}</h4>
                    <button class="legend-close" onclick="window.acsMap?.removeLegend()">×</button>
                </div>
                <div class="legend-scale">
                    ${grades.map((grade, i) => {
                        const nextGrade = grades[i + 1];
                        if (nextGrade !== undefined) {
                            const color = this.colorScale(grade);
                            return `
                                <div class="legend-item">
                                    <i style="background:${color}"></i>
                                    <span>${this.formatValue(grade, variable)} - ${this.formatValue(nextGrade, variable)}</span>
                                </div>
                            `;
                        }
                        return '';
                    }).join('')}
                </div>
                <div class="legend-stats">
                    <p>📊 Showing ${dataPoints.length} locations</p>
                    <p>📈 Range: ${this.formatValue(min, variable)} - ${this.formatValue(max, variable)}</p>
                    <p>🎨 Scale: ${this.currentScaleType}</p>
                </div>
            `;

            return div;
        };

        this.legend = legend;
        legend.addTo(this.map);
    }

    /**
     * Remove legend
     */
    removeLegend() {
        if (this.legend) {
            this.legend.remove();
            this.legend = null;
        }
    }

    /**
     * Generate legend grades
     */
    generateLegendGrades(min, max, steps) {
        const grades = [];
        const step = (max - min) / steps;
        
        for (let i = 0; i <= steps; i++) {
            grades.push(min + (step * i));
        }
        
        return grades;
    }

    // ============================================================================
    // UTILITY METHODS
    // ============================================================================

    /**
     * Format value based on variable type
     */
    formatValue(value, variable) {
        if (value === null || isNaN(value)) return 'N/A';
        
        const formatters = {
            'B01003_001E': (v) => v.toLocaleString('en-US', { maximumFractionDigits: 0 }),
            'B19013_001E': (v) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
            'B25077_001E': (v) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
            default: (v) => v.toLocaleString('en-US', { maximumFractionDigits: 2 })
        };
        
        const formatter = formatters[variable] || formatters.default;
        return formatter(value);
    }

    /**
     * Get variable display name
     */
    getVariableName(variable) {
        const names = {
            'B01003_001E': 'Population',
            'B19013_001E': 'Median Income',
            'B25077_001E': 'Home Value',
            'B25001_001E': 'Housing Units',
            'B08301_001E': 'Transportation'
        };
        return names[variable] || variable;
    }

    /**
     * Get contrast color for borders
     */
    getContrastColor(hexColor) {
        if (!hexColor || !hexColor.startsWith('#')) return '#000';
        
        // Convert hex to RGB
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);
        
        // Calculate luminance
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        
        return luminance > 0.5 ? '#000000' : '#ffffff';
    }

    /**
     * Fit map to markers
     */
    fitToMarkers(markers, padding = 0.1) {
        if (markers.length === 0) return;
        
        const bounds = L.latLngBounds(markers.map(m => m.getLatLng()));
        this.map.fitBounds(bounds, {
            padding: [padding * 100, padding * 100],
            animate: true,
            duration: 1
        });
    }

    /**
     * Set color scheme
     */
    setColorScheme(scheme) {
        if (this.colorScales[scheme]) {
            this.currentScaleType = scheme;
            this.colorScale = this.colorScales[scheme];
            
            // Redraw if we have data
            if (this.currentData) {
                this.redraw();
            }
        }
    }

    /**
     * Redraw markers with current settings
     */
    redraw() {
        if (this.currentData) {
            this.visualizeData(
                this.currentData.zipData,
                this.currentData.acsData,
                this.currentVariable,
                { fitBounds: false, showLegend: false }
            );
        }
    }

    /**
     * Clear all map elements
     */
    clear() {
        // Clear markers
        if (this.markerCluster) {
            this.markerCluster.clearLayers();
            this.markerCluster = null;
        }
        
        if (this.markerLayer) {
            this.markerLayer.clearLayers();
        }
        
        // Clear legend
        this.removeLegend();
        
        // Clear state
        this.markers.clear();
        this.currentData = null;
        this.highlightedMarker = null;
        
        this.emit('mapCleared');
    }

    /**
     * Export marker data
     */
    exportMarkerData(zip) {
        const marker = this.markers.get(zip);
        if (marker && marker.data) {
            const exportData = {
                ...marker.data,
                timestamp: new Date().toISOString(),
                variable: this.currentVariable
            };
            
            const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                type: 'application/json'
            });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `acs_${zip}_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.emit('dataExported', { zip, data: exportData });
        }
    }

    /**
     * Export all data
     */
    exportAllData() {
        if (!this.currentData) return;
        
        const exportData = {
            timestamp: new Date().toISOString(),
            variable: this.currentVariable,
            data: []
        };
        
        Object.entries(this.currentData.acsData).forEach(([zip, acsData]) => {
            const zipInfo = this.currentData.zipData.get(zip);
            if (zipInfo) {
                exportData.data.push({
                    zip,
                    ...zipInfo,
                    acs_value: acsData.data[this.currentVariable],
                    metadata: acsData.metadata
                });
            }
        });
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json'
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `acs_data_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.emit('allDataExported', { count: exportData.data.length });
    }

    /**
     * Get map statistics
     */
    getStats() {
        return {
            markers: this.markers.size,
            hasData: !!this.currentData,
            currentVariable: this.currentVariable,
            bounds: this.map.getBounds(),
            zoom: this.map.getZoom(),
            center: this.map.getCenter()
        };
    }

    // ============================================================================
    // EVENT SYSTEM
    // ============================================================================

    /**
     * Event handlers
     */
    eventHandlers = new Map();

    /**
     * Add event listener
     */
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, new Set());
        }
        this.eventHandlers.get(event).add(handler);
    }

    /**
     * Remove event listener
     */
    off(event, handler) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).delete(handler);
        }
    }

    /**
     * Emit event
     */
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
window.ACSMapVisualizer = ACSMapVisualizer;