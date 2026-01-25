// ============================================================================
// ACS API SERVICE WITH ADVANCED CACHING
// ============================================================================

/**
 * Census ACS API Service with caching, rate limiting, and retry logic
 */
class ACSAPIService {
    constructor(apiKey, options = {}) {
        // Configuration
        this.apiKey = apiKey;
        this.baseUrl = options.baseUrl || 'https://api.census.gov/data';
        this.year = options.year || '2022';
        this.dataset = options.dataset || 'acs/acs5';
        
        // Rate limiting
        this.maxRetries = options.maxRetries || 3;
        this.timeout = options.timeout || 30000;
        this.batchSize = options.batchSize || 10;
        this.requestsPerMinute = options.requestsPerMinute || 50;
        
        // Caching
        this.cacheVersion = options.cacheVersion || '1.0';
        this.cachePrefix = `acs_cache_v${this.cacheVersion}_`;
        this.cacheDuration = 30 * 24 * 60 * 60 * 1000; // 30 days
        
        // State
        this.requestQueue = [];
        this.isProcessingQueue = false;
        this.requestTimestamps = [];
        this.activeRequests = new Set();
        
        // Statistics
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            cacheHits: 0,
            cacheMisses: 0,
            totalTime: 0,
            avgResponseTime: 0
        };
        
        // Error tracking
        this.errorLog = [];
        this.maxErrorLogSize = 100;
        
        // Event system
        this.eventHandlers = new Map();
        
        // Initialize
        this.cleanCache();
    }

    // ============================================================================
    // PUBLIC API METHODS
    // ============================================================================

    /**
     * Fetch ACS data for multiple ZIP codes
     */
    async fetchDataForZips(zipCodes, variables, options = {}) {
        const startTime = performance.now();
        const requestId = this.generateRequestId();
        
        try {
            this.emit('requestStart', { requestId, zipCodes, variables });
            
            if (!Array.isArray(variables)) {
                variables = [variables];
            }

            // Validate input
            if (!zipCodes || zipCodes.length === 0) {
                throw new Error('No ZIP codes provided');
            }

            if (!variables || variables.length === 0) {
                throw new Error('No variables specified');
            }

            // Prepare results
            const results = new Map();
            const missingZips = [];
            
            // Check cache first
            for (const zip of zipCodes) {
                const cached = this.getFromCache(zip, variables);
                if (cached) {
                    results.set(zip, cached);
                    this.stats.cacheHits++;
                } else {
                    missingZips.push(zip);
                    this.stats.cacheMisses++;
                }
            }

            // Fetch missing data
            if (missingZips.length > 0) {
                const batches = this.chunkArray(missingZips, this.batchSize);
                const batchPromises = [];
                
                for (const batch of batches) {
                    batchPromises.push(
                        this.fetchBatchWithRetry(batch, variables, options)
                    );
                }
                
                const batchResults = await Promise.allSettled(batchPromises);
                
                // Process batch results
                for (const result of batchResults) {
                    if (result.status === 'fulfilled') {
                        for (const [zip, data] of Object.entries(result.value)) {
                            results.set(zip, data);
                            this.cacheData(zip, variables, data);
                        }
                    } else {
                        console.error('Batch fetch failed:', result.reason);
                        this.logError('Batch fetch failed', result.reason);
                    }
                }
            }

            const elapsedTime = performance.now() - startTime;
            this.stats.totalTime += elapsedTime;
            this.stats.avgResponseTime = this.stats.totalTime / this.stats.totalRequests;
            
            this.emit('requestComplete', {
                requestId,
                duration: elapsedTime,
                total: zipCodes.length,
                cached: zipCodes.length - missingZips.length,
                fetched: missingZips.length
            });

            return Object.fromEntries(results);

        } catch (error) {
            const elapsedTime = performance.now() - startTime;
            this.stats.failedRequests++;
            
            this.emit('requestError', {
                requestId,
                error,
                duration: elapsedTime
            });
            
            this.logError(`Failed to fetch data for request ${requestId}`, error);
            throw error;
        }
    }

    /**
     * Fetch data for a single ZIP code
     */
    async fetchSingleZip(zip, variables, options = {}) {
        const result = await this.fetchDataForZips([zip], variables, options);
        return result[zip] || null;
    }

    // ============================================================================
    // CACHE MANAGEMENT
    // ============================================================================

    /**
     * Get data from cache
     */
    getFromCache(zip, variables) {
        try {
            const cacheKey = this.getCacheKey(zip, variables);
            const cached = localStorage.getItem(cacheKey);
            
            if (!cached) return null;

            const { data, metadata, expiry } = JSON.parse(cached);
            
            if (Date.now() > expiry) {
                localStorage.removeItem(cacheKey);
                return null;
            }

            return { data, metadata };

        } catch (error) {
            console.warn('Cache read error:', error);
            return null;
        }
    }

    /**
     * Cache data
     */
    cacheData(zip, variables, data) {
        try {
            const cacheKey = this.getCacheKey(zip, variables);
            const expiry = Date.now() + this.cacheDuration;
            
            const cacheEntry = {
                data: data.data,
                metadata: {
                    ...data.metadata,
                    cachedAt: new Date().toISOString(),
                    cacheVersion: this.cacheVersion
                },
                expiry
            };

            localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
            
            // Manage cache size
            this.manageCacheSize();

        } catch (error) {
            console.warn('Cache write error:', error);
            
            if (error.name === 'QuotaExceededError') {
                this.clearOldestCacheEntries(20);
                // Retry caching
                setTimeout(() => this.cacheData(zip, variables, data), 0);
            }
        }
    }

    /**
     * Clean expired cache entries
     */
    cleanCache() {
        const now = Date.now();
        let cleaned = 0;
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            
            if (key.startsWith(this.cachePrefix)) {
                try {
                    const cached = JSON.parse(localStorage.getItem(key));
                    if (cached.expiry && now > cached.expiry) {
                        localStorage.removeItem(key);
                        cleaned++;
                    }
                } catch (e) {
                    localStorage.removeItem(key);
                    cleaned++;
                }
            }
        }
        
        if (cleaned > 0) {
            console.log(`Cleaned ${cleaned} expired cache entries`);
            this.emit('cacheCleaned', { cleaned });
        }
    }

    /**
     * Clear all cache entries
     */
    clearCache() {
        let cleared = 0;
        
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key.startsWith(this.cachePrefix)) {
                localStorage.removeItem(key);
                cleared++;
            }
        }
        
        this.emit('cacheCleared', { cleared });
        return cleared;
    }

    /**
     * Clear oldest cache entries
     */
    clearOldestCacheEntries(count) {
        const entries = [];
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(this.cachePrefix)) {
                try {
                    const cached = JSON.parse(localStorage.getItem(key));
                    entries.push({
                        key,
                        cachedAt: new Date(cached.metadata?.cachedAt || 0).getTime()
                    });
                } catch (e) {
                    entries.push({ key, cachedAt: 0 });
                }
            }
        }
        
        entries.sort((a, b) => a.cachedAt - b.cachedAt);
        
        entries.slice(0, count).forEach(entry => {
            localStorage.removeItem(entry.key);
        });
        
        console.log(`Cleared ${Math.min(count, entries.length)} oldest cache entries`);
    }

    /**
     * Manage cache size
     */
    manageCacheSize(maxSizeMB = 50) {
        const maxSizeBytes = maxSizeMB * 1024 * 1024;
        let totalSize = 0;
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);
            totalSize += key.length + value.length;
        }
        
        if (totalSize > maxSizeBytes) {
            const toClear = Math.ceil((totalSize - maxSizeBytes * 0.8) / (1024 * 1024));
            const entriesToClear = Math.max(50, Math.ceil(toClear * 10));
            this.clearOldestCacheEntries(entriesToClear);
        }
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        let count = 0;
        let totalSize = 0;
        const now = Date.now();
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(this.cachePrefix)) {
                const value = localStorage.getItem(key);
                totalSize += key.length + value.length;
                count++;
            }
        }
        
        return {
            count,
            sizeKB: Math.round(totalSize / 1024),
            sizeMB: Math.round(totalSize / (1024 * 1024)),
            expired: this.getExpiredCacheCount()
        };
    }

    /**
     * Get count of expired cache entries
     */
    getExpiredCacheCount() {
        const now = Date.now();
        let expired = 0;
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(this.cachePrefix)) {
                try {
                    const cached = JSON.parse(localStorage.getItem(key));
                    if (cached.expiry && now > cached.expiry) {
                        expired++;
                    }
                } catch (e) {
                    // Ignore parse errors
                }
            }
        }
        
        return expired;
    }

    // ============================================================================
    // API REQUEST MANAGEMENT
    // ============================================================================

    /**
     * Fetch batch with retry logic
     */
    async fetchBatchWithRetry(zipCodes, variables, options) {
        let lastError;
        
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                // Wait before retry (exponential backoff)
                if (attempt > 1) {
                    const delay = Math.pow(2, attempt - 1) * 1000;
                    await this.sleep(delay);
                }
                
                // Enforce rate limit
                await this.enforceRateLimit();
                
                return await this.fetchBatchFromAPI(zipCodes, variables, options);
                
            } catch (error) {
                lastError = error;
                console.warn(`Attempt ${attempt}/${this.maxRetries} failed:`, error);
                
                if (attempt === this.maxRetries) {
                    this.logError(`Max retries exceeded for batch`, error);
                    throw error;
                }
            }
        }
        
        throw lastError;
    }

    /**
     * Fetch batch from ACS API
     */
    async fetchBatchFromAPI(zipCodes, variables, options) {
        const startTime = performance.now();
        const requestId = this.generateRequestId();
        
        this.emit('apiRequestStart', { requestId, zipCodes });
        
        try {
            // Track request
            this.requestTimestamps.push(startTime);
            this.activeRequests.add(requestId);
            this.stats.totalRequests++;
            
            // Build URL
            const variablesStr = variables.join(',');
            const zipsStr = zipCodes.join(',');
            
            const url = `${this.baseUrl}/${this.year}/${this.dataset}` +
                       `?get=NAME,${variablesStr}` +
                       `&for=zip%20code%20tabulation%20area:${zipsStr}` +
                       `&key=${this.apiKey}`;
            
            // Set up abort controller
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);
            
            // Make request
            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache'
                },
                ...options.fetchOptions
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            const data = await response.json();
            const elapsedTime = performance.now() - startTime;
            
            this.stats.successfulRequests++;
            
            this.emit('apiRequestComplete', {
                requestId,
                duration: elapsedTime,
                count: zipCodes.length
            });
            
            return this.parseAPIResponse(data, variables, zipCodes);
            
        } catch (error) {
            const elapsedTime = performance.now() - startTime;
            this.stats.failedRequests++;
            
            this.emit('apiRequestError', {
                requestId,
                error,
                duration: elapsedTime
            });
            
            throw error;
            
        } finally {
            this.activeRequests.delete(requestId);
            this.cleanOldTimestamps();
        }
    }

    /**
     * Parse API response
     */
    parseAPIResponse(data, variables, requestedZips) {
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('Invalid API response format');
        }
        
        const headers = data[0];
        const results = {};
        const requestedSet = new Set(requestedZips);
        
        // Map variable indices
        const variableIndices = {};
        variables.forEach(variable => {
            const index = headers.indexOf(variable);
            if (index !== -1) {
                variableIndices[variable] = index;
            }
        });
        
        const zipIndex = headers.indexOf('zip code tabulation area');
        const nameIndex = headers.indexOf('NAME');
        
        // Process rows
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            const zip = row[zipIndex];
            
            if (requestedSet.has(zip)) {
                const result = {
                    data: {},
                    metadata: {
                        fetchedAt: new Date().toISOString(),
                        name: row[nameIndex],
                        source: 'api',
                        dataset: this.dataset,
                        year: this.year,
                        requestId: this.generateRequestId()
                    }
                };
                
                // Extract variable values
                Object.entries(variableIndices).forEach(([variable, index]) => {
                    const value = row[index];
                    result.data[variable] = value === null || value === '' ? 
                        null : parseFloat(value);
                });
                
                results[zip] = result;
                requestedSet.delete(zip);
            }
        }
        
        // Log missing ZIPs
        if (requestedSet.size > 0) {
            console.warn(`API did not return data for ZIPS:`, Array.from(requestedSet));
            this.emit('missingData', { missingZips: Array.from(requestedSet) });
        }
        
        return results;
    }

    // ============================================================================
    // RATE LIMITING
    // ============================================================================

    /**
     * Enforce rate limiting
     */
    async enforceRateLimit() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        
        // Clean old timestamps
        this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneMinuteAgo);
        
        // Check if we're at the limit
        if (this.requestTimestamps.length >= this.requestsPerMinute) {
            const oldest = this.requestTimestamps[0];
            const waitTime = 60000 - (now - oldest) + 100;
            
            console.log(`Rate limit reached, waiting ${Math.ceil(waitTime/1000)}s`);
            
            await this.sleep(waitTime);
            return this.enforceRateLimit();
        }
        
        return true;
    }

    /**
     * Clean old timestamps
     */
    cleanOldTimestamps() {
        const oneMinuteAgo = Date.now() - 60000;
        this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneMinuteAgo);
    }

    // ============================================================================
    // EVENT SYSTEM
    // ============================================================================

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

    // ============================================================================
    // UTILITY METHODS
    // ============================================================================

    /**
     * Generate cache key
     */
    getCacheKey(zip, variables) {
        const varsHash = this.hashString(variables.sort().join(','));
        return `${this.cachePrefix}${zip}_${varsHash}`;
    }

    /**
     * Generate request ID
     */
    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Simple string hash
     */
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).padStart(8, '0');
    }

    /**
     * Sleep function
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Chunk array
     */
    chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * Log error
     */
    logError(message, error) {
        const errorEntry = {
            timestamp: new Date().toISOString(),
            message,
            error: error?.message || String(error),
            stack: error?.stack,
            stats: { ...this.stats }
        };
        
        this.errorLog.push(errorEntry);
        
        if (this.errorLog.length > this.maxErrorLogSize) {
            this.errorLog.shift();
        }
        
        // Store in localStorage
        try {
            const storedErrors = JSON.parse(localStorage.getItem('acs_api_errors') || '[]');
            storedErrors.push(errorEntry);
            if (storedErrors.length > 50) storedErrors.shift();
            localStorage.setItem('acs_api_errors', JSON.stringify(storedErrors));
        } catch (e) {
            // Ignore storage errors
        }
        
        console.error(message, error);
    }

    /**
     * Get error log
     */
    getErrorLog(limit = 20) {
        return this.errorLog.slice(-limit);
    }

    /**
     * Clear error log
     */
    clearErrorLog() {
        this.errorLog = [];
        localStorage.removeItem('acs_api_errors');
    }

    /**
     * Get service statistics
     */
    getStats() {
        return {
            ...this.stats,
            activeRequests: this.activeRequests.size,
            requestQueue: this.requestQueue.length,
            cacheStats: this.getCacheStats(),
            lastError: this.errorLog[this.errorLog.length - 1] || null
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            cacheHits: 0,
            cacheMisses: 0,
            totalTime: 0,
            avgResponseTime: 0
        };
    }

    /**
     * Validate API key
     */
    async validateAPIKey() {
        try {
            const testZip = '10001';
            const testVariable = 'B01003_001E';
            
            const url = `${this.baseUrl}/${this.year}/${this.dataset}` +
                       `?get=${testVariable}&for=zip%20code%20tabulation%20area:${testZip}` +
                       `&key=${this.apiKey}`;
            
            const response = await fetch(url, { timeout: 10000 });
            
            if (response.status === 200) {
                return { valid: true, message: 'API key is valid' };
            } else if (response.status === 403) {
                return { valid: false, message: 'Invalid API key' };
            } else if (response.status === 429) {
                return { valid: false, message: 'Rate limited' };
            } else {
                return { valid: false, message: `API error: ${response.status}` };
            }
        } catch (error) {
            return { valid: false, message: `Network error: ${error.message}` };
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ACSAPIService };
}