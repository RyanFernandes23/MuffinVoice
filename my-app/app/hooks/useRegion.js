"use client";

import { useState, useEffect } from 'react';

export const useRegion = () => {
    const [region, setRegion] = useState({
        country: 'India',
        currency: 'INR',
        symbol: '₹',
        loading: true
    });

    useEffect(() => {
        const detectRegion = async () => {
            try {
                // First try IP-based geolocation (using a free service like ipapi.co)
                const response = await fetch('https://ipapi.co/json/');
                if (response.ok) {
                    const data = await response.json();
                    const isIndia = data.country_code === 'IN';

                    setRegion({
                        country: data.country_name || (isIndia ? 'India' : 'International'),
                        currency: isIndia ? 'INR' : 'USD',
                        symbol: isIndia ? '₹' : '$',
                        loading: false
                    });
                    return;
                }
            } catch (error) {
                console.warn('IP-based geolocation failed, falling back to browser locale:', error);
            }

            // Fallback: Browser Locale / Timezone
            try {
                const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                const isIndiaTimezone = timeZone && timeZone.startsWith('Asia/Kolkata');

                setRegion({
                    country: isIndiaTimezone ? 'India' : 'International',
                    currency: isIndiaTimezone ? 'INR' : 'USD',
                    symbol: isIndiaTimezone ? '₹' : '$',
                    loading: false
                });
            } catch (fallbackError) {
                setRegion({
                    country: 'International',
                    currency: 'USD',
                    symbol: '$',
                    loading: false
                });
            }
        };

        detectRegion();
    }, []);

    return region;
};
