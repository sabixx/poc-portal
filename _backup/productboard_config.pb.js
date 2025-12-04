// pb_hooks/productboard_config.pb.js
// ProductBoard Configuration - loads first

console.log("[ProductBoard] Loading config...");

const PRODUCTBOARD_TOKEN = "eyJ0eXAiOiJKV1QiLCJraWQiOiI2ZDI0MmY3ZDgzZWNlYTNhYWJiZmVkYWE0YjE2YzFiYTZjZWIzMzMyYjhiN2MwYWVhYzM4Y2U0YTc2NTFhZTdhIiwiYWxnIjoiUlM1MTIifQ.eyJpYXQiOjE3NjQ0MTAyOTEsImlzcyI6ImNlZWQ5OTU2LTI1NWUtNGU4YS1hYWI5LWYyYWI0ZWJhZGM4MiIsInN1YiI6IjE1NjEwMjYiLCJyb2xlIjoiYWRtaW4iLCJhdWQiOiJodHRwczovL2FwaS5wcm9kdWN0Ym9hcmQuY29tIiwidXNlcl9pZCI6MTU2MTAyNiwic3BhY2VfaWQiOiIzNjA0MDQiLCJyZWdpb24iOiJ1cyJ9.jWskwnlsXCd2mKh3fifspsyAtWhUZDxARO2VKBCbyKGGtPnZKEB5vfZ65RPuUZki-qDtF2wD1F_Qs2HCeFSdyRpyhaA4M5V78uMY3qT-_nKrxsByi75NAPx3wczKP1w-aiUQMfrvMDnuFfYVOB83h0WRqsvYM3zmefINGrGR0bWqawGsduJ9JZZ6PcigAMwgc2e88b7T94ZGSJYlValg_d_GoIuho7gzp4sfseXkTGZA_7_FyIIiCiJo8nFbVY4_fML1V_WaCs7Aj3jpkCMIa3aOrO3R8i7-gSP-5gXarUGgklX5Is8-On_dPFhnzvUwxf4y75yzTUodr4bkm82o7Q";
const PRODUCTBOARD_API = "https://api.productboard.com";

// Make globally available for other hooks
global.ProductBoard = {
    token: PRODUCTBOARD_TOKEN,
    apiUrl: PRODUCTBOARD_API,
    
    // Helper to call ProductBoard API
    call: function(endpoint, method, body) {
        const options = {
            url: this.apiUrl + endpoint,
            method: method || "GET",
            headers: {
                "Authorization": "Bearer " + this.token,
                "X-Version": "1",
                "Content-Type": "application/json"
            },
            timeout: 15
        };
        
        if (body) {
            options.body = JSON.stringify(body);
        }
        
        return $http.send(options);
    },
    
    // Map importance levels
    mapImportance: function(importance) {
        const map = {
            'critical': 'critical',
            'important': 'important',
            'nice_to_have': 'nice-to-have',
            'not_important': 'not-important',
            'unknown': 'unknown'
        };
        return map[importance] || 'unknown';
    }
};

console.log("[ProductBoard] Config loaded");