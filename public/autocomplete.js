// autocomplete.js (Fixed for SPA and Business Address)

function initAutocomplete() {
    // 1. Find the input box from your HTML
    var addressInput = document.getElementById('business_address');
    
    // Stop if the input box doesn't exist or is not visible yet
    if (!addressInput || addressInput.offsetWidth === 0) return; 

    // Don't bind twice
    if (addressInput.getAttribute('data-google-bound') === 'true') return;

    console.log("Found Business Address input! Binding Autocomplete...");

    // 2. Attach Google Autocomplete to that box
    var autocomplete = new google.maps.places.Autocomplete(addressInput, {
        types: ['geocode', 'establishment'],
        componentRestrictions: { country: 'IN' } // Restricts to India
    });

    // We need 'geometry' to get the Latitude and Longitude
    autocomplete.setFields(['geometry', 'address_components', 'name']);

    // 3. Listen for when the user clicks an address from the dropdown
    autocomplete.addListener('place_changed', function() {
        var place = autocomplete.getPlace();

        // If Google couldn't find the GPS data, reset to 0
        if (!place.geometry || !place.geometry.location) {
            document.getElementById('lati').value = '0.0000';
            document.getElementById('longi').value = '0.0000';
            alert("No GPS data found for this location. Please try another address.");
            return;
        }

        // 4. Extract the exact GPS coordinates!
        var lat = place.geometry.location.lat().toFixed(8);
        var lng = place.geometry.location.lng().toFixed(8);

        // 5. Save them to the hidden inputs
        document.getElementById('lati').value = lat;
        document.getElementById('longi').value = lng;
        
        console.log("SUCCESS! Coordinates captured -> Lat: " + lat + ", Lng: " + lng);
    });
    
    addressInput.setAttribute('data-google-bound', 'true');
}

// 6. Ultra-robust SPA loop: 
// Continuously check if Google Maps is loaded and the element exists
var autocompleteLoop = setInterval(function() {
    if (typeof google === 'object' && typeof google.maps === 'object' && typeof google.maps.places === 'object') {
        var input = document.getElementById('business_address');
        if (input && input.getAttribute('data-google-bound') === 'true') {
            clearInterval(autocompleteLoop); // Stop the loop once bound!
        } else {
            initAutocomplete();
        }
    }
}, 500);