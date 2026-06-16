// autocomplete.js (Geocoding and Autocomplete based on address fields)

var geocoderTimeout;

window.clearAddress = function() {
    var addr1 = document.getElementById('business_address_1');
    if (addr1) {
        addr1.value = '';
        addr1.focus();
    }
    
    var city = document.getElementById('business_city');
    if (city) {
        city.value = '';
        if (city.closest('.material-outline')) city.closest('.material-outline').classList.remove('has-value');
    }
    
    var pin = document.getElementById('business_pincode');
    if (pin) {
        pin.value = '';
        if (pin.closest('.material-outline')) pin.closest('.material-outline').classList.remove('has-value');
    }

    var stateSelect = document.getElementById('state');
    if (stateSelect) {
        stateSelect.selectedIndex = 0;
        if (stateSelect.closest('.material-outline')) stateSelect.closest('.material-outline').classList.remove('has-value');
        if (typeof $ !== 'undefined') $(stateSelect).trigger('change.select2');
    }
    
    document.getElementById('lati').value = '0.0000';
    document.getElementById('longi').value = '0.0000';
    
    if (typeof map !== 'undefined') {
        map.setCenter({lat: 20.5937, lng: 78.9629}); // Center of India
        map.setZoom(5);
        if (typeof marker !== 'undefined') {
            marker.setPosition({lat: 20.5937, lng: 78.9629});
        }
    }
};

function initAutocomplete() {
    var addressInput = document.getElementById('business_address_1');
    if (!addressInput) return;

    if (addressInput.getAttribute('data-google-bound') === 'true') return;

    // Attach Google Autocomplete
    var autocomplete = new google.maps.places.Autocomplete(addressInput, {
        types: ['geocode', 'establishment'],
        componentRestrictions: { country: 'IN' } // Restricts to India
    });

    autocomplete.setFields(['geometry', 'address_components', 'name']);

    autocomplete.addListener('place_changed', function() {
        var place = autocomplete.getPlace();

        if (!place.geometry || !place.geometry.location) {
            return; // let the geocoder fallback handle it
        }

        var lat = place.geometry.location.lat().toFixed(8);
        var lng = place.geometry.location.lng().toFixed(8);

        document.getElementById('lati').value = lat;
        document.getElementById('longi').value = lng;
        
        if (typeof map !== 'undefined' && typeof marker !== 'undefined') {
            google.maps.event.trigger(map, 'resize');
            map.setCenter(place.geometry.location);
            map.setZoom(15);
            marker.setPosition(place.geometry.location);
        }

        // Auto-fill pin code, city, and state if possible
        var pincode = '';
        var city = '';
        var state = '';
        if (place.address_components) {
            for (var i = 0; i < place.address_components.length; i++) {
                var types = place.address_components[i].types;
                if (types.indexOf('postal_code') !== -1) pincode = place.address_components[i].long_name;
                if (types.indexOf('locality') !== -1) city = place.address_components[i].long_name;
                if (types.indexOf('administrative_area_level_1') !== -1) state = place.address_components[i].long_name;
            }
        }
        
        if (pincode && document.getElementById('business_pincode')) {
            document.getElementById('business_pincode').value = pincode;
            if (document.getElementById('business_pincode').closest('.material-outline')) {
                document.getElementById('business_pincode').closest('.material-outline').classList.add('has-value');
            }
        }
        if (city && document.getElementById('business_city')) {
            document.getElementById('business_city').value = city;
            if (document.getElementById('business_city').closest('.material-outline')) {
                document.getElementById('business_city').closest('.material-outline').classList.add('has-value');
            }
        }
        if (state && document.getElementById('state')) {
            var stateSelect = document.getElementById('state');
            for(var j=0; j<stateSelect.options.length; j++) {
                if(stateSelect.options[j].text.toLowerCase() === state.toLowerCase() || stateSelect.options[j].value.toLowerCase() === state.toLowerCase()) {
                    stateSelect.selectedIndex = j;
                    if (stateSelect.closest('.material-outline')) {
                        stateSelect.closest('.material-outline').classList.add('has-value');
                    }
                    if (typeof $ !== 'undefined') $(stateSelect).trigger('change.select2');
                    break;
                }
            }
        }

        console.log("Autocomplete location: Lat: " + lat + ", Lng: " + lng);
    });

    addressInput.setAttribute('data-google-bound', 'true');
}

function updateMapFromAddress() {
    var addr1 = document.getElementById('business_address_1') ? document.getElementById('business_address_1').value : '';
    var pin = document.getElementById('business_pincode') ? document.getElementById('business_pincode').value : '';
    
    var stateSelect = document.getElementById('state');
    var state = '';
    if (stateSelect && stateSelect.options && stateSelect.options.length > 0 && stateSelect.selectedIndex > 0) {
        state = stateSelect.options[stateSelect.selectedIndex].text;
    }

    var fullAddress = [addr1, pin, state, 'India'].filter(Boolean).join(', ');

    if (!fullAddress || fullAddress.length < 5) return;

    if (typeof google === 'object' && typeof google.maps === 'object' && typeof google.maps.Geocoder === 'function') {
        var geocoder = new google.maps.Geocoder();
        geocoder.geocode({ 'address': fullAddress }, function(results, status) {
            if (status === 'OK' && results[0]) {
                var loc = results[0].geometry.location;
                
                var lat = loc.lat().toFixed(8);
                var lng = loc.lng().toFixed(8);

                document.getElementById('lati').value = lat;
                document.getElementById('longi').value = lng;

                if (typeof map !== 'undefined' && typeof marker !== 'undefined') {
                    google.maps.event.trigger(map, 'resize');
                    map.setCenter(loc);
                    map.setZoom(15);
                    marker.setPosition(loc);
                }
            }
        });
    }
}

function bindAddressListeners() {
    var addr1 = document.getElementById('business_address_1');
    var pin = document.getElementById('business_pincode');
    var state = document.getElementById('state');
    
    var handler = function() {
        clearTimeout(geocoderTimeout);
        geocoderTimeout = setTimeout(updateMapFromAddress, 1500); // 1.5s debounce to let Autocomplete take precedence
    };

    if (addr1) addr1.addEventListener('input', handler);
    if (pin) pin.addEventListener('input', handler);
    if (state) state.addEventListener('change', handler);
}

// Bind listeners on load
var autocompleteLoop = setInterval(function() {
    if (typeof google === 'object' && typeof google.maps === 'object' && typeof google.maps.places === 'object') {
        if (document.getElementById('business_address_1')) {
            initAutocomplete();
            bindAddressListeners();
            clearInterval(autocompleteLoop);
        }
    }
}, 500);

// Add fallback binding for clearAddress button just in case
if (typeof $ !== 'undefined') {
    $(document).on('click', '#clearAddressBtn', function(e) {
        e.preventDefault();
        if (typeof window.clearAddress === 'function') {
            window.clearAddress();
        }
    });
}