

const ros = new ROSLIB.Ros();

const topic = new ROSLIB.Topic({
    ros: ros,
    name: '/topic',
    messageType: 'std_msgs/String'
});


const tlvSystemTopic = new ROSLIB.Topic({
    ros: ros,
    name: "/tlv_system",
    messageType: "std_msgs/Float32MultiArray",
});
const tlvSignalTopic = new ROSLIB.Topic({
    ros: ros,
    name: "/tlv_signal",
    messageType: "std_msgs/Int8"
});

const hlvSystemTopic = new ROSLIB.Topic({
    ros: ros,
    name: "/hlv_system",
    messageType: "std_msgs/Float32MultiArray",
});

const hlvPostionTopic = new ROSLIB.Topic({
    ros: ros,
    name: "/hlv_position",
    // messageType: "std_msgs/Float32MultiArray",
});

const hlvSignalTopic = new ROSLIB.Topic({
    ros: ros,
    name: "/hlv_signal",
    messageType: "std_msgs/Int8"
});

window.addEventListener('DOMContentLoaded', function() {
    initRos();
});




const initRos = function() {
    ros.connect('ws://10.28.2.120:9090');

    hlvSystemTopic.subscribe(function (message) {
        // console.log('hlvSystemTopic',message);
        // setMessageIdx(message.data[0]);
        // setSystem([message.data[1], message.data[2], message.data[3], message.data[4]]);
        // if (message.data[0] === 3) {
        //     hlvSignalTopic.publish({ data: 0 });
        //     setSignalClasses([classes.basic50, classes.basic50]);
        // }
    });

    tlvSystemTopic.subscribe(function (message) {
        // console.log('tlvSystemTopic',message);
        // setMessageIdx(message.data[0]);
        // setSystem([message.data[1], message.data[2], message.data[3], message.data[4]]);
        // if (message.data[0] === 3) {
        //     tlvSignalTopic.publish({ data: 0 });
        //     setSignalClasses([classes.basic50, classes.basic50]);
        // }
    });

    hlvPostionTopic.subscribe(function (message) {
        // console.log('hlvPostionTopic', message);
        // testFun();
        // reviceData();
        // setMessageIdx(message.data[0]);
        // setSystem([message.data[1], message.data[2], message.data[3], message.data[4]]);
        // if (message.data[0] === 3) {
        //     tlvSignalTopic.publish({ data: 0 });
        //     setSignalClasses([classes.basic50, classes.basic50]);
        // }
    });


    // hlvSignalTopic.publish({ data: signalData });
    // tlvSignalTopic.publish({ data: signalData });

    topic.subscribe((res) => {
        rosSub(res.data);
    })
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