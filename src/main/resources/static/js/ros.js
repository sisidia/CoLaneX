

const ros = new ROSLIB.Ros();


const hlvSystemTopic = new ROSLIB.Topic({
    ros: ros,
    name: '/hlv_system',
    messageType: "std_msgs/Float32MultiArray",
});


const tlvSystemTopic = new ROSLIB.Topic({
    ros: ros,
    name: '/tlv_system',
    messageType: "std_msgs/Float32MultiArray",
});

const hlvGeojsonTopic = new ROSLIB.Topic({
    ros: ros,
    name: '/planning/hlv_geojson',
});

const tlvGeojsonTopic = new ROSLIB.Topic({
    ros: ros,
    name: '/planning/tlv_geojson',
});

const hlvPoseTopic = new ROSLIB.Topic({
    ros: ros,
    name: "/car/hlv_pose",
});


const tlvPoseTopic = new ROSLIB.Topic({
    ros: ros,
    name: "/car/tlv_pose",
});


const hlvSignalTopic = new ROSLIB.Topic({
    ros: ros,
    name: "/hlv_signal",
    messageType: "std_msgs/Int8"
});

const tlvSignalTopic = new ROSLIB.Topic({
    ros: ros,
    name: "/tlv_signal",
    messageType: "std_msgs/Int8"
});



window.addEventListener('DOMContentLoaded', function() {
    initRos();
});


const initRos = function() {
    ros.connect('ws://10.28.2.120:9090');


    hlvPoseTopic.subscribe(function (message) {
        updataVehicle('vehicle' , message.position);
    });

    tlvPoseTopic.subscribe(function (message) {
        updataVehicle('vehicle2' , message.position);
    });


    hlvGeojsonTopic.subscribe(function (message) {
        const lineObj = JSON.parse(message.data);
        updateLine('route2',lineObj);
    });

    tlvGeojsonTopic.subscribe(function (message) {
        const lineObj = JSON.parse(message.data);
        updateLine('route',lineObj);
    });


    hlvSystemTopic.subscribe(function (message) {
        updateSystem('hlvMode' , message.data);
    });

    tlvSystemTopic.subscribe(function (message) {
        updateSystem('hlvMode' , message.data);
    });




    // tlvSignalTopic.publish({ data: signalData });
}



ros.on('error', function (error) {
    console.log(error);
});

// 정상 연결
ros.on('connection', function () {
    console.log('Connection made!');
});

// 연결 닫힘
ros.on('close', function () {
    console.log('Connection closed.');
});

// 수신
const rosSub = function(data) {
    console.log(data);
}