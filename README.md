# US Census ACS Data Explorer

An interactive web map visualizing US Census data on education and income by ZIP Code Tabulation Areas (ZCTAs).

## Features

- 🗺️ **Interactive Google Maps** with marker clustering
- 🎓 **Education Layer**: Residents 25+ with Bachelor's degree or higher
- 💰 **Income Layer**: Households with income ≥ $100,000/year
- 📍 **Pin Visualization**: One pin per ≈1,000 residents/households
- 🔄 **Layer Toggling**: Turn education/income layers on/off independently
- 📊 **Detailed Info**: Click pins for ZIP code details and raw counts
- 🚀 **Fast Performance**: Client-side caching and optimized rendering

## Data Sources

- **US Census ACS 2022** 5-Year Estimates
- **Table B15003** (Fields 022-025): Education attainment
- **Table B19001** (Fields 016-019): Household income
- **ZIP Code Centroids**: Geographic coordinates for ZCTA centers

## Quick Start

1. **Get a Google Maps API Key**
   - Visit [Google Cloud Console](https://console.cloud.google.com/)
   - Create a project and enable "Maps JavaScript API"
   - Create an API key and restrict it to `https://*.github.io/*`

2. **Configure the Application**
   ```bash
   # Clone or download this repository
   git clone <repository-url>
   cd us-census-map
   
   # Edit the configuration file
   # Add your Google Maps API key to js/config.js