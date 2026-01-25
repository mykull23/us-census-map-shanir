// ============================================================================
// ZIP CODE INDEXING SERVICE
// ============================================================================

/**
 * Robust ZIP code indexing with spatial search capabilities
 */
class ZIPCodeIndex {
    constructor() {
        this.zips = new Map();
        this.stateIndex = new Map();
        this.cityIndex = new Map();
        this.countyIndex = new Map();
        this.spatialIndex = new Map();
        this.loaded = false;
        this.totalRecords = 0;
        
        // Performance metrics
        this.metrics = {
            loadTime: 0,
            parseTime: 0,
            indexTime: 0
        };
    }

    /**
     * Load ZIP code data from CSV file
     * @param {string} csvUrl - URL to CSV file
     * @param {Object} options - Loading options
     * @returns {Promise<boolean>}
     */
    // Update js/zipCodeIndex.js - replace loadFromCSV with:
async loadFromJSON(jsonUrl) {
    try {
        const response = await fetch(jsonUrl);
        const data = await response.json();
        
        // If it's an array
        if (Array.isArray(data)) {
            data.forEach(record => this.indexRecord(record));
        } 
        // If it's an index object {zip: data}
        else {
            Object.values(data).forEach(record => this.indexRecord(record));
        }
        
        this.loaded = true;
        this.totalRecords = this.zips.size;
        this.buildSpatialIndex();
        
        console.log(`Loaded ${this.totalRecords} ZIP codes from JSON`);
        return true;
        
    } catch (error) {
        console.error('Failed to load JSON:', error);
        throw error;
    }
}

    /**
     * Parse CSV headers
     */
    parseCSVHeaders(headerLine) {
        return headerLine.split(',').map(h => h.trim().replace(/"/g, ''));
    }

    /**
     * Parse a single CSV record
     */
    parseCSVRecord(line, headers) {
        const regex = /(?:,|^)(?:"([^"]*(?:""[^"]*)*)"|([^",]*))/g;
        const fields = [];
        let match;
        
        while ((match = regex.exec(line + ',')) !== null) {
            fields.push((match[1] || match[2] || '').replace(/""/g, '"'));
        }
        
        // Remove trailing empty field
        fields.pop();

        if (fields.length !== headers.length) {
            throw new Error(`Field count mismatch: expected ${headers.length}, got ${fields.length}`);
        }

        const record = {};
        
        headers.forEach((header, index) => {
            const value = fields[index];
            
            switch (header) {
                case 'zip':
                    record.zip = value.padStart(5, '0');
                    break;
                case 'lat':
                case 'lng':
                    const num = parseFloat(value);
                    record[header] = isNaN(num) ? null : num;
                    break;
                case 'population':
                case 'density':
                    const int = parseInt(value);
                    record[header] = isNaN(int) ? 0 : int;
                    break;
                case 'zcta':
                    record[header] = value === 'TRUE';
                    break;
                default:
                    record[header] = value || '';
            }
        });

        // Validate required fields
        if (!record.zip || record.lat === null || record.lng === null) {
            throw new Error('Missing required fields (zip, lat, lng)');
        }

        return record;
    }

    /**
     * Index a single record
     */
    indexRecord(record) {
        // Store in main map
        this.zips.set(record.zip, record);

        // Index by state
        if (record.state_id) {
            if (!this.stateIndex.has(record.state_id)) {
                this.stateIndex.set(record.state_id, new Set());
            }
            this.stateIndex.get(record.state_id).add(record.zip);
        }

        // Index by city
        if (record.city) {
            const cityKey = `${record.city.toLowerCase()},${record.state_id}`;
            if (!this.cityIndex.has(cityKey)) {
                this.cityIndex.set(cityKey, new Set());
            }
            this.cityIndex.get(cityKey).add(record.zip);
        }

        // Index by county
        if (record.county_fips) {
            if (!this.countyIndex.has(record.county_fips)) {
                this.countyIndex.set(record.county_fips, new Set());
            }
            this.countyIndex.get(record.county_fips).add(record.zip);
        }
    }

    /**
     * Build spatial index for radius searches
     */
    buildSpatialIndex() {
        const GRID_SIZE = 0.5; // Degrees
        
        for (const [zip, record] of this.zips) {
            if (record.lat !== null && record.lng !== null) {
                const gridKey = this.getGridKey(record.lat, record.lng, GRID_SIZE);
                
                if (!this.spatialIndex.has(gridKey)) {
                    this.spatialIndex.set(gridKey, []);
                }
                
                this.spatialIndex.get(gridKey).push({
                    zip,
                    lat: record.lat,
                    lng: record.lng
                });
            }
        }
        
        console.log(`Built spatial index with ${this.spatialIndex.size} grid cells`);
    }

    /**
     * Get grid key for spatial indexing
     */
    getGridKey(lat, lng, gridSize) {
        const latGrid = Math.floor(lat / gridSize);
        const lngGrid = Math.floor(lng / gridSize);
        return `${latGrid},${lngGrid}`;
    }

    // ============================================================================
    // PUBLIC API
    // ============================================================================

    /**
     * Get ZIP code information
     */
    get(zip) {
        return this.zips.get(zip.padStart(5, '0')) || null;
    }

    /**
     * Search ZIP codes by state
     */
    getByState(stateId, limit = 100) {
        const zipSet = this.stateIndex.get(stateId.toUpperCase()) || new Set();
        const results = [];
        
        for (const zip of zipSet) {
            results.push(this.get(zip));
            if (results.length >= limit) break;
        }
        
        return results;
    }

    /**
     * Search ZIP codes by city
     */
    searchByCity(cityName, stateId = null, limit = 50) {
        const results = [];
        const searchTerm = cityName.toLowerCase();
        
        for (const [cityKey, zipSet] of this.cityIndex) {
            const [city, state] = cityKey.split(',');
            
            if (city.includes(searchTerm) && (!stateId || state === stateId.toUpperCase())) {
                for (const zip of zipSet) {
                    results.push(this.get(zip));
                    if (results.length >= limit) break;
                }
            }
            
            if (results.length >= limit) break;
        }
        
        return results;
    }

    /**
     * Search ZIP codes by county
     */
    getByCounty(countyFips, limit = 100) {
        const zipSet = this.countyIndex.get(countyFips) || new Set();
        const results = [];
        
        for (const zip of zipSet) {
            results.push(this.get(zip));
            if (results.length >= limit) break;
        }
        
        return results;
    }

    /**
     * Search ZIP codes within radius
     */
    searchByRadius(lat, lng, radiusKm, limit = 100) {
        const results = [];
        const earthRadius = 6371; // km
        
        // Calculate bounding box
        const latDelta = radiusKm / 111.32;
        const lngDelta = radiusKm / (111.32 * Math.cos(lat * Math.PI / 180));
        
        const minLat = lat - latDelta;
        const maxLat = lat + latDelta;
        const minLng = lng - lngDelta;
        const maxLng = lng + lngDelta;
        
        // Grid size for spatial indexing
        const GRID_SIZE = 0.5;
        const minLatGrid = Math.floor(minLat / GRID_SIZE);
        const maxLatGrid = Math.floor(maxLat / GRID_SIZE);
        const minLngGrid = Math.floor(minLng / GRID_SIZE);
        const maxLngGrid = Math.floor(maxLng / GRID_SIZE);
        
        // Check relevant grid cells
        for (let latGrid = minLatGrid; latGrid <= maxLatGrid; latGrid++) {
            for (let lngGrid = minLngGrid; lngGrid <= maxLngGrid; lngGrid++) {
                const gridKey = `${latGrid},${lngGrid}`;
                const cells = this.spatialIndex.get(gridKey) || [];
                
                for (const cell of cells) {
                    if (cell.lat >= minLat && cell.lat <= maxLat &&
                        cell.lng >= minLng && cell.lng <= maxLng) {
                        
                        // Calculate exact distance
                        const dLat = (cell.lat - lat) * Math.PI / 180;
                        const dLng = (cell.lng - lng) * Math.PI / 180;
                        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                                 Math.cos(lat * Math.PI / 180) * 
                                 Math.cos(cell.lat * Math.PI / 180) *
                                 Math.sin(dLng/2) * Math.sin(dLng/2);
                        const distance = earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                        
                        if (distance <= radiusKm) {
                            const record = this.get(cell.zip);
                            if (record) {
                                results.push({
                                    ...record,
                                    distance
                                });
                            }
                            
                            if (results.length >= limit) {
                                return results.sort((a, b) => a.distance - b.distance);
                            }
                        }
                    }
                }
            }
        }
        
        return results.sort((a, b) => a.distance - b.distance);
    }

    /**
     * Search ZIP codes by bounding box
     */
    searchByBoundingBox(bounds, limit = 200) {
        const results = [];
        const [minLat, minLng, maxLat, maxLng] = bounds;
        
        for (const [zip, record] of this.zips) {
            if (record.lat >= minLat && record.lat <= maxLat &&
                record.lng >= minLng && record.lng <= maxLng) {
                results.push(record);
                
                if (results.length >= limit) break;
            }
        }
        
        return results;
    }

    /**
     * Get random sample of ZIP codes
     */
    getRandomSample(count = 10) {
        const allZips = Array.from(this.zips.keys());
        const sample = [];
        
        for (let i = 0; i < Math.min(count, allZips.length); i++) {
            const randomIndex = Math.floor(Math.random() * allZips.length);
            sample.push(this.get(allZips[randomIndex]));
        }
        
        return sample;
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            totalRecords: this.totalRecords,
            states: this.stateIndex.size,
            cities: this.cityIndex.size,
            counties: this.countyIndex.size,
            spatialCells: this.spatialIndex.size,
            loaded: this.loaded,
            metrics: { ...this.metrics }
        };
    }

    /**
     * Export data for debugging
     */
    exportData(limit = 1000) {
        const data = [];
        let count = 0;
        
        for (const [zip, record] of this.zips) {
            data.push(record);
            count++;
            if (count >= limit) break;
        }
        
        return data;
    }

    /**
     * Clear all data
     */
    clear() {
        this.zips.clear();
        this.stateIndex.clear();
        this.cityIndex.clear();
        this.countyIndex.clear();
        this.spatialIndex.clear();
        this.loaded = false;
        this.totalRecords = 0;
        this.metrics = {
            loadTime: 0,
            parseTime: 0,
            indexTime: 0
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ZIPCodeIndex };
}