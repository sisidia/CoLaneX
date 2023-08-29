mapboxgl.accessToken = "pk.eyJ1Ijoia2FyaW5sZWUiLCJhIjoiY2xlY2k3MmhrMHp4aDNudDl3N3U2NzR5MyJ9.SeuDJKWvsCKsKOkZutIYLw";
const styleUrl = 'mapbox://styles/karinlee/cldtw24nn000k01mxdqwb5tpq';

const MAP_LNG = 127.11058607387321;
const MAP_LAT = 37.39984828837143;
const MAP_LNG2 = 127.11067253000084;
const MAP_LAT2 = 37.39980936847563;


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
    vehicle2: {
        // origin: [MAP_LNG, MAP_LAT, 0],
        origin: [MAP_LNG2, MAP_LAT2, 0],
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

let vehicle,vehicle2;

let vehicleArr = [];

let modeId = 'hlvMode';

const selectMode = function(e) {
    const id = e.id;
    modeId = id;
    if(id == 'hlvMode') {
        e.className = 'title-select select';
        getID('tlvMode').className = 'title-select';
        getID('tlvBody').style.display = 'none';
        getID('hlvBody').style.display = 'block';
    }
    else if(id =='tlvMode') {
        e.className = 'title-select select';
        getID('hlvMode').className = 'title-select';
        getID('hlvBody').style.display = 'none';
        getID('tlvBody').style.display = 'block';
    }


}


function createCustomLayer(layerName) {
    //create the layer
    initLine();
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
            let options2 = {
                type: mapConfig.vehicle2.type, //model type
                obj: mapConfig.vehicle2.model + '.obj', //model .obj url
                mtl: mapConfig.vehicle2.model + '.mtl', //model .mtl url
                units: 'meters', // in meters
                scale: mapConfig.vehicle2.scale, //x3 times is real size for this model
                rotation: mapConfig.vehicle2.rotation, //default rotation
                anchor: 'auto'
            }
            tb.loadObj(options, function(model) {
                vehicleArr['vehicle'] = model.setCoords(mapConfig.vehicle.origin);
                vehicleArr['vehicle'].setRotation(mapConfig.vehicle.startRotation);
                tb.add(vehicleArr['vehicle']);
            });
            tb.loadObj(options2, function(model) {
                vehicleArr['vehicle2'] = model.setCoords(mapConfig.vehicle2.origin);
                vehicleArr['vehicle2'].setRotation(mapConfig.vehicle2.startRotation);
                tb.add(vehicleArr['vehicle2']);
            });
        },
        render: function(gl, matrix) {
            tb.update();
        }
    };
    return customLayer3D;

};

function easing(t) {
    return t * (20 - t);
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

    printLocation();
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

const initLine = function() {
    map.addSource('route', {
        'type': 'geojson',
        'data': {
            'type': 'Feature',
            'properties': {},
            'geometry': {
                'type': 'LineString',
                'coordinates': [
                    [127.10237920911715, 37.39987196235322],
                    [127.11058607387321, 37.39984828837143]
                ]
            }
        }
    });
    map.addLayer({
        'id': 'route',
        'type': 'line',
        'source': 'route',
        'layout': {
            'line-join': 'round',
            'line-cap': 'round'
        },
        'paint': {
            'line-color': 'blue',
            'line-width': 8
        }
    });
    map.addSource('route2', {
        'type': 'geojson',
        'data': {
            'type': 'Feature',
            'properties': {},
            'geometry': {
                'type': 'LineString',
                'coordinates': [
                    [127.11067253000084, 37.39980936847563],
                    [127.10235520557052 , 37.39984557140154]
                ]
            }
        }
    });

    map.addLayer({
        'id': 'route2',
        'type': 'line',
        'source': 'route2',
        'layout': {
            'line-join': 'round',
            'line-cap': 'round'
        },
        'paint': {
            'line-color': 'red',
            'line-width': 8
        }
    });

}

const updataVehicle = function(id, data) {

    let vehicleObj = vehicleArr[id];
    if(typeof(vehicleObj) == "undefined") return;
    const arrLat = data.x;
    const arrLng =data.y;
    const lat = vehicleObj.coordinates[1];
    const lng = vehicleObj.coordinates[0];
    let deg = getBearing(lng,lat,arrLng,arrLat);
    vehicleObj.setRotation(data.z-90);

    vehicleObj.setCoords([arrLng, arrLat]);
    if(modeId== 'hlvMode' && id == 'vehicle') {
        let options = {
            center: vehicleObj.coordinates,
            bearing: data.z,
            easing: easing
        };
        map.jumpTo(options);
    }
    if(modeId== 'tlvMode' && id == 'vehicle2') {
        let options = {
            center: vehicleObj.coordinates,
            bearing: deg-90,
            easing: easing
        };
        map.jumpTo(options);
    }
}

const updateLine = function(id, data) {
    map.getSource(id).setData(data);
}

const getMessage = function(id, status) {

    let hlvMessage = [];
    hlvMessage[0]= 'Wait';
    hlvMessage[1]= 'Attempt to Merge into the Left Lane';
    hlvMessage[2]= 'Attempt to Merge into the Right Lane';
    hlvMessage[3]= 'TLV Accepts Request to Join Lane';
    hlvMessage[4]= 'TLV Rejects Request to Join Lane';
    hlvMessage[5]= 'Over';

    let tlvMessage = [];
    tlvMessage[0]= 'Wait';
    tlvMessage[1]= 'Lane Merge Request from Left HLV';
    tlvMessage[2]= 'Lane Merge Request from Right HLV';
    tlvMessage[3]= 'Safe for opposing HLV to merge into lane';
    tlvMessage[4]= 'Dangerous for opposing HLV to merge into lane';
    tlvMessage[5]= 'Over';

    if(modeId == id) {
        return hlvMessage[status];
    }
    else {
        return tlvMessage[status]
    }

}

const updateSystem = function(id,data) {
    const state = data[0];
    const gps = data[1];
    const v2x = data[2];
    const latency = data[3];
    const speed = data[4];
    if(modeId == id) {
        getID('latency').innerText = latency.toFixed(2);
        getID('speed').innerText = speed.toFixed(3);
        updateIcon('gpsStatus', gps, 'gps');
        updateIcon('v2xStatus', v2x, 'v2x');
        getID('hlvMessageTxt').innerText = getMessage(id, state);
    }
    else {
        getID('latency').innerText = latency.toFixed(2);
        getID('speed').innerText = speed.toFixed(3);
        updateIcon('gpsStatus', gps, 'gps');
        updateIcon('v2xStatus', v2x, 'v2x');
        getID('tlvMessageTxt').innerText = getMessage(id, state);
    }
}

const updateIcon = function(id, status, icon) {

    const prefix = '/images/';
    if(status == 1) {
        getID(id).src = prefix+icon+'.png';
    }
    else {
        getID(id).src = prefix+icon+'_off.png';
    }
}


//차량 이동 구현은 여기서
// data -> {'lat',35.xxxx , 'lng':127.xxxx}
const moveEvent = function(id,data) {
    let vehicleObj = vehicleArr[id];

    if(typeof(vehicleObj) == "undefined" || typeof data == "undefined") return;
    const lat = vehicleObj.coordinates[1];
    const lng = vehicleObj.coordinates[0];
    const arrLat = data.lat;
    const arrLng = data.lng;
    let deg = getBearing(lng,lat,arrLng,arrLat);
    let delay = 16.6;
    let result = [];
    vehicleObj.setRotation(-deg);
    const distance = turf.distance([lng,lat], [arrLng, arrLat], { units: 'meters' });
    let steps = Math.round(distance / 10 );
    for (let j = 1; j <= steps; j++) {
        const interpolatedPoint = turf.along(turf.lineString([[lng,lat],[arrLng, arrLat]]), distance /  steps * j, { units: 'meters' });
        result.push(interpolatedPoint.geometry.coordinates)
    }
    for(let i=0; i < result.length; i++){
        delay += 16.6;
        setTimeout(async () => {
            vehicleObj.setCoords(result[i]);
            let options = {
                center: vehicleObj.coordinates,
                bearing: deg,
                easing: easing
            };
            if(id =='vehicle') {
                // if(idx2 == 1) {
                //     map.setPaintProperty('route', 'line-color', 'red');
                //     idx2 = 0;
                // }
                // else if(idx2 == 0){
                //     map.setPaintProperty('route', 'line-color', 'blue');
                //     idx2 = 1;
                // }

                map.jumpTo(options);
            }
        }, delay);
    }
}



const setHlvClick = function(signalData) {

    hlvSignalTopic.publish({ data: signalData });
    console.log('setHlvClick : ', signalData);
}

const setTlvClick = function(signalData) {
    tlvSignalTopic.publish({ data: signalData });
    console.log('setTlvClick : ', signalData);
}



//test
let idx = 0;
let idx2 = 0;
let codeArr = [
    [ 127.11058607387321, 37.39984828837143],
    [127.10237920911715, 37.39987196235322]
];

let codeArr2 = [
    [127.11067253000084, 37.39980936847563],
    [127.10235520557052 , 37.39984557140154]
]



const test = function() {
    let data = {};
    let data2 = {};
    if(idx == 1) {
        data['lng'] = codeArr[0][0];
        data['lat'] = codeArr[0][1];

        data2['lng'] = codeArr2[0][0];
        data2['lat'] = codeArr2[0][1];
        idx = 0;
    }
    else if(idx == 0) {
        data['lng'] = codeArr[1][0];
        data['lat'] = codeArr[1][1];

        data2['lng'] = codeArr2[1][0];
        data2['lat'] = codeArr2[1][1];
        idx = 1;
    }

    moveEvent('vehicle', data);
    moveEvent('vehicle2', data2);
}



function printLocation() {
    map.on('contextmenu', (e) => {
        console.log('Clicked location:', e.lngLat.lng ,',',e.lngLat.lat);
    });
}


