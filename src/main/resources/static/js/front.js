mapboxgl.accessToken = "pk.eyJ1Ijoia2FyaW5sZWUiLCJhIjoiY2xlY2k3MmhrMHp4aDNudDl3N3U2NzR5MyJ9.SeuDJKWvsCKsKOkZutIYLw";
const styleUrl = 'mapbox://styles/karinlee/cldtw24nn000k01mxdqwb5tpq';

const MAP_LNG = 127.11058607387321;
const MAP_LAT = 37.39984828837143;


let api = {
    buildings: true
};

let minZoom = 17;
let mapConfig = {
    map: {
        center: [MAP_LNG, MAP_LAT],
        zoom: 20,
        pitch: 60,
        bearing: 90
    },
    vehicle: {
        origin: [MAP_LNG, MAP_LAT, 0],
        type: 'mtl',
        model: '/3d/3d-model',
        rotation: {
            x: 90,
            y: 0,
            z: 0
        },
        scale: 0.05,
        startRotation: {
            x: 0,
            y: 0,
            z: 270
        },
    },
    names: {
        compositeSource: "composite",
        compositeSourceLayer: "building",
        compositeLayer: "3d-buildings"
    }
}

let map = new mapboxgl.Map({
    container: 'map',
    style: styleUrl,
    zoom: mapConfig.map.zoom,
    center: mapConfig.map.center,
    pitch: mapConfig.map.pitch,
    bearing: mapConfig.map.bearing,
    antialias: true // create the gl context with MSAA antialiasing, so custom layers are antialiased
});

window.tb = new Threebox(
    map,
    map.getCanvas().getContext('webgl'), {
        realSunlight: true,
        enableSelectingObjects: true,
        enableDraggingObjects: true,
        enableRotatingObjects: true,
        enableTooltips: true
    }
);

tb.setSunlight(new Date(), map.getCenter());

let vehicle;

function createCustomLayer(layerName) {
    //create the layer
    let customLayer3D = {
        id: layerName,
        type: 'custom',
        renderingMode: '3d',
        onAdd: function(map, gl) {
            let options = {
                type: mapConfig.vehicle.type, //model type
                obj: mapConfig.vehicle.model + '.obj', //model .obj url
                mtl: mapConfig.vehicle.model + '.mtl', //model .mtl url
                units: 'meters', // in meters
                scale: mapConfig.vehicle.scale, //x3 times is real size for this model
                rotation: mapConfig.vehicle.rotation, //default rotation
                anchor: 'auto'
            }
            tb.loadObj(options, function(model) {
                vehicle = model.setCoords(mapConfig.vehicle.origin);
                vehicle.setRotation(mapConfig.vehicle.startRotation); //turn it to the initial street way
                tb.add(vehicle);
            });
        },
        render: function(gl, matrix) {
            tb.update();
        }
    };
    return customLayer3D;

};

function easing(t) {
    return t * (2 - t);
}


map.on('style.load', function() {
    let l = mapConfig.names.compositeLayer;
    if (api.buildings) {
        if (!map.getLayer(l)) {
            map.addLayer(createCompositeLayer(l));
        }
    }
    map.addLayer(createCustomLayer('3d-model'), 'waterway-label');
    map.getCanvas().focus();
});

function createCompositeLayer(layerId) {
    let layer = {
        'id': layerId,
        'source': mapConfig.names.compositeSource,
        'source-layer': mapConfig.names.compositeSourceLayer,
        'filter': ['==', 'extrude', 'true'],
        'type': 'fill-extrusion',
        'minzoom': minZoom,
        'paint': {
            'fill-extrusion-color': [
                'case',
                ['boolean', ['feature-state', 'select'], false],
                "red",
                ['boolean', ['feature-state', 'hover'], false],
                "lightblue",
                '#aaa'
            ],
            'fill-extrusion-height': [
                'interpolate',
                ['linear'],
                ['zoom'],
                minZoom,
                0,
                minZoom + 0.05,
                ['get', 'height']
            ],
            'fill-extrusion-base': [
                'interpolate',
                ['linear'],
                ['zoom'],
                minZoom,
                0,
                minZoom + 0.05,
                ['get', 'min_height']
            ],
            'fill-extrusion-opacity': 0.5
        }
    };
    return layer;
}


const getBearing = function(currentLng, currentLat, destinationLng, destinationLat) {
    const x = Math.cos(destinationLat) * Math.sin(destinationLng - currentLng);
    const y = Math.cos(currentLat) * Math.sin(destinationLat) - Math.sin(currentLat) * Math.cos(destinationLat) * Math.cos(destinationLng - currentLng);
    const bearing = Math.atan2(x, y);
    return (bearing * 180 / Math.PI + 360) % 360;
}

//차량 이동 구현은 여기서
// data -> {'lat',35.xxxx , 'lng':127.xxxx}
const moveEvent = function(data) {

    if(typeof data == "undefined") return;
    const lat = vehicle.coordinates[1];
    const lng = vehicle.coordinates[0];
    const arrLat = data.lat;
    const arrLng = data.lng;
    let deg = getBearing(lng,lat,arrLng,arrLat);
    let delay = 16.6;
    let result = [];
    vehicle.setRotation(-deg);
    const distance = turf.distance([lng,lat], [arrLng, arrLat], { units: 'meters' });
    let steps = Math.round(distance / 10 );
    for (let j = 1; j <= steps; j++) {
        const interpolatedPoint = turf.along(turf.lineString([[lng,lat],[arrLng, arrLat]]), distance /  steps * j, { units: 'meters' });
        result.push(interpolatedPoint.geometry.coordinates)
    }
    for(let i=0; i < result.length; i++){
        delay += 16.6;
        setTimeout(async () => {
            vehicle.setCoords(result[i])
            let options = {
                center: vehicle.coordinates,
                bearing: deg,
                easing: easing
            };
            map.jumpTo(options);
        }, delay);
    }
}





//test
let idx = 0;
let codeArr = [
    [ 127.11058607387321, 37.39984828837143],
    [127.10237920911715, 37.39987196235322]
];


const test = function() {
    let data = {};
    if(idx == 1) {
        data['lng'] = codeArr[0][0];
        data['lat'] = codeArr[0][1];
        idx = 0;
    }
    else if(idx == 0) {
        data['lng'] = codeArr[1][0];
        data['lat'] = codeArr[1][1];
        idx = 1;
    }
    moveEvent(data);
}



