
// js/config.example.js - FOR LOCAL DEVELOPMENT ONLY
// Copy this to js/config.js and add your API key

const IS_LOCAL = window.location.hostname === 'localhost' || 
                 window.location.hostname === '127.0.0.1';
const IS_GITHUB = window.location.hostname.includes('github.io');

const CONFIG = {
    // ⚠️⚠️⚠️ REPLACE WITH YOUR ACTUAL GOOGLE MAPS API KEY ⚠️⚠️⚠️
    // Get it from: https://console.cloud.google.com/google/maps-apis
    // For local testing, you can use an unrestricted key
    GOOGLE_MAPS_API_KEY: 'YOUR_LOCAL_DEVELOPMENT_API_KEY_HERE',
    
    // Environment info
    ENVIRONMENT: 'development',
    IS_LOCAL: true,
    IS_GITHUB: false,
    
    // Census API settings
    CENSUS_API_BASE: 'https://api.census.gov/data',
    CENSUS_YEAR: '2022',
    CENSUS_SURVEY: 'acs/acs5',
    
    // Application settings
    MAX_ZIP_CODES: 500,
    PIN_THRESHOLD: 1000,
    DEBUG_MODE: true
};

window.CONFIG = CONFIG;
console.log('🔧 Development config loaded');