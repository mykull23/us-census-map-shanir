/**
 * US Census Data Fetcher and Processor
 * Handles API calls, data parsing, and caching
 */

class CensusDataFetcher {
    constructor() {
        this.baseURL = 'https://api.census.gov/data';
        this.year = '2022';
        this.survey = 'acs/acs5';
        this.cachedData = {
            education: null,
            income: null
        };
        this.isFetching = false;
        this.fetchQueue = [];
    }

    /**
     * Main method to get all Census data
     * @param {Array} zipCodes - Optional array of specific ZIP codes
     * @returns {Promise<Object>} Combined data object
     */
    async getAllData(zipCodes = null) {
        try {
            this.updateLoadingStatus('Fetching data from US Census API...', 10);
            
            // Try to get cached data first
            const cached = this.getCachedData();
            if (cached && Object.keys(cached).length > 0) {
                console.log('Using cached data');
                this.updateLoadingStatus('Using cached data...', 50);
                return cached;
            }

            // Fetch from API
            const [educationData, incomeData] = await Promise.all([
                this.fetchWithRetry(() => this.fetchEducationData(zipCodes), 'education'),
                this.fetchWithRetry(() => this.fetchIncomeData(zipCodes), 'income')
            ]);

            this.updateLoadingStatus('Processing Census data...', 70);
            
            // Process and combine
            const combinedData = this.combineDatasets(educationData, incomeData);
            
            // Cache results
            this.cacheData('education', educationData);
            this.cacheData('income', incomeData);
            
            this.updateLoadingStatus('Data processing complete!', 100);
            
            console.log(`Successfully loaded data for ${Object.keys(combinedData).length} ZIP codes`);
            return combinedData;
            
        } catch (error) {
            console.error('Error in getAllData:', error);
            throw new Error(`Failed to load Census data: ${error.message}`);
        }
    }

    /**
     * Fetch education data (B15003 fields 022-025)
     */
    async fetchEducationData(zipCodes = null) {
        const fields = [
            'NAME',
            'B15003_022E', // Bachelor's degree
            'B15003_023E', // Master's degree
            'B15003_024E', // Professional degree
            'B15003_025E', // Doctorate degree
            'zip%20code%20tabulation%20area'
        ];
        
        let url = `${this.baseURL}/${this.year}/${this.survey}?get=${fields.join(',')}`;
        
        // Add ZIP code filter if provided
        if (zipCodes && Array.isArray(zipCodes) && zipCodes.length > 0) {
            // Limit to first 50 ZIPs for performance
            const limitedZips = zipCodes.slice(0, 50);
            const zipParam = limitedZips.join(',');
            url += `&for=zip%20code%20tabulation%20area:${zipParam}`;
        } else {
            url += '&for=zip%20code%20tabulation%20area:*';
        }
        
        console.log('Fetching education data from:', url.substring(0, 100) + '...');
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Education API failed: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return this.parseEducationData(data);
    }

    /**
     * Fetch income data (B19001 fields 016-017)
     */
    async fetchIncomeData(zipCodes = null) {
        const fields = [
            'NAME',
            'B19001_016E', // $100,000 to $124,999
            'B19001_017E', // $125,000 to $149,999
            'B19001_018E', // $150,000 to $199,999
            'B19001_019E', // $200,000 or more
            'zip%20code%20tabulation%20area'
        ];
        
        let url = `${this.baseURL}/${this.year}/${this.survey}?get=${fields.join(',')}`;
        
        if (zipCodes && Array.isArray(zipCodes) && zipCodes.length > 0) {
            const limitedZips = zipCodes.slice(0, 50);
            const zipParam = limitedZips.join(',');
            url += `&for=zip%20code%20tabulation%20area:${zipParam}`;
        } else {
            url += '&for=zip%20code%20tabulation%20area:*';
        }
        
        console.log('Fetching income data from:', url.substring(0, 100) + '...');
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Income API failed: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return this.parseIncomeData(data);
    }

    /**
     * Parse education API response
     */
    parseEducationData(apiData) {
        if (!apiData || !Array.isArray(apiData) || apiData.length < 2) {
            return {};
        }

        const headers = apiData[0];
        const rows = apiData.slice(1);
        const educationData = {};

        rows.forEach(row => {
            const zip = row[5]; // ZCTA is last column
            if (!zip) return;

            const values = [
                parseInt(row[1]) || 0, // Bachelor's
                parseInt(row[2]) || 0, // Master's
                parseInt(row[3]) || 0, // Professional
                parseInt(row[4]) || 0  // Doctorate
            ];

            const total = values.reduce((sum, val) => sum + val, 0);
            
            // Only include ZIPs with data
            if (total > 0) {
                educationData[zip] = {
                    name: row[0] || `ZIP ${zip}`,
                    values: values,
                    total: total,
                    breakdown: {
                        bachelors: values[0],
                        masters: values[1],
                        professional: values[2],
                        doctorate: values[3]
                    },
                    rawData: row
                };
            }
        });

        console.log(`Parsed education data for ${Object.keys(educationData).length} ZIP codes`);
        return educationData;
    }

    /**
     * Parse income API response
     */
    parseIncomeData(apiData) {
        if (!apiData || !Array.isArray(apiData) || apiData.length < 2) {
            return {};
        }

        const headers = apiData[0];
        const rows = apiData.slice(1);
        const incomeData = {};

        rows.forEach(row => {
            const zip = row[5]; // ZCTA is last column
            if (!zip) return;

            const values = [
                parseInt(row[1]) || 0, // $100k-125k
                parseInt(row[2]) || 0, // $125k-150k
                parseInt(row[3]) || 0, // $150k-200k
                parseInt(row[4]) || 0  // $200k+
            ];

            const total = values.reduce((sum, val) => sum + val, 0);
            
            if (total > 0) {
                incomeData[zip] = {
                    name: row[0] || `ZIP ${zip}`,
                    values: values,
                    total: total,
                    breakdown: {
                        '100k_125k': values[0],
                        '125k_150k': values[1],
                        '150k_200k': values[2],
                        '200k_plus': values[3]
                    },
                    rawData: row
                };
            }
        });

        console.log(`Parsed income data for ${Object.keys(incomeData).length} ZIP codes`);
        return incomeData;
    }

    /**
     * Combine education and income datasets
     */
    combineDatasets(educationData, incomeData) {
        const combined = {};
        const allZips = new Set([
            ...Object.keys(educationData || {}),
            ...Object.keys(incomeData || {})
        ]);

        allZips.forEach(zip => {
            combined[zip] = {
                zip: zip,
                education: educationData?.[zip] || null,
                income: incomeData?.[zip] || null,
                hasData: !!(educationData?.[zip] || incomeData?.[zip])
            };
        });

        return combined;
    }

    /**
     * Retry mechanism for API calls
     */
    async fetchWithRetry(fetchFunction, dataType, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                this.updateLoadingStatus(`Fetching ${dataType} data (attempt ${attempt}/${maxRetries})...`, 20 + (attempt * 10));
                return await fetchFunction();
            } catch (error) {
                console.warn(`Attempt ${attempt} failed for ${dataType}:`, error);
                
                if (attempt === maxRetries) {
                    throw error;
                }
                
                // Exponential backoff
                const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    /**
     * Cache management
     */
    cacheData(type, data) {
        this.cachedData[type] = data;
        
        try {
            const cacheKey = `census_${type}_${this.year}`;
            const cacheData = {
                data: data,
                timestamp: Date.now(),
                expires: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
            };
            localStorage.setItem(cacheKey, JSON.stringify(cacheData));
            console.log(`Cached ${type} data for 24 hours`);
        } catch (e) {
            console.warn('Local storage caching failed:', e);
        }
    }

    getCachedData() {
        // Try memory cache first
        if (this.cachedData.education && this.cachedData.income) {
            return this.combineDatasets(this.cachedData.education, this.cachedData.income);
        }

        // Try local storage
        try {
            const educationCache = JSON.parse(localStorage.getItem(`census_education_${this.year}`));
            const incomeCache = JSON.parse(localStorage.getItem(`census_income_${this.year}`));
            
            // Check if cache is valid and not expired
            const isCacheValid = (cache) => {
                return cache && 
                       cache.data && 
                       cache.timestamp && 
                       cache.expires > Date.now();
            };
            
            if (isCacheValid(educationCache) && isCacheValid(incomeCache)) {
                this.cachedData.education = educationCache.data;
                this.cachedData.income = incomeCache.data;
                console.log('Loaded data from local storage cache');
                return this.combineDatasets(educationCache.data, incomeCache.data);
            } else {
                console.log('Cache expired or invalid, fetching fresh data');
                // Clear expired cache
                localStorage.removeItem(`census_education_${this.year}`);
                localStorage.removeItem(`census_income_${this.year}`);
            }
        } catch (e) {
            console.warn('Failed to load from cache:', e);
        }

        return null;
    }

    /**
     * Clear all cached data
     */
    clearCache() {
        this.cachedData = { education: null, income: null };
        
        try {
            localStorage.removeItem(`census_education_${this.year}`);
            localStorage.removeItem(`census_income_${this.year}`);
            console.log('Cleared all cached data');
        } catch (e) {
            console.warn('Failed to clear cache:', e);
        }
    }

    /**
     * Update loading status in UI
     */
    updateLoadingStatus(message, progress) {
        const loadingText = document.getElementById('loading-text');
        const progressBar = document.getElementById('loading-progress');
        
        if (loadingText) {
            loadingText.textContent = message;
        }
        
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }
    }

    /**
     * For static hosting: load data from pre-fetched JSON files
     */
    async loadFromStaticFiles() {
        try {
            this.updateLoadingStatus('Loading data from static files...', 30);
            
            const [eduResponse, incResponse] = await Promise.all([
                fetch('data/education-data.json'),
                fetch('data/income-data.json')
            ]);
            
            if (!eduResponse.ok || !incResponse.ok) {
                throw new Error('Failed to load static data files');
            }
            
            const educationData = await eduResponse.json();
            const incomeData = await incResponse.json();
            
            this.updateLoadingStatus('Processing static data...', 70);
            
            // Cache the loaded data
            this.cacheData('education', educationData);
            this.cacheData('income', incomeData);
            
            const combinedData = this.combineDatasets(educationData, incomeData);
            
            this.updateLoadingStatus('Static data loaded!', 100);
            
            return combinedData;
            
        } catch (error) {
            console.error('Failed to load static files:', error);
            throw error;
        }
    }
}

// Export for Node.js or browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CensusDataFetcher;
}