import React, { useState } from "react";
import { Grid, Button, Card, CardContent } from "@material-ui/core";
import ROSLIB from "roslib";
import TLVStyles from "./TLVStyles"
import DeckMap from "../../components/DeckMap/DeckMap";
import Sensor from "../../components/Layout/Sensor";

const ros = new ROSLIB.Ros({ url: "ws://localhost:9090" });
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

const TLV = () => {
  const classes = TLVStyles();
  const [signalClasses, setSignalClasses] = useState([classes.basic50, classes.basic50]);
  const [system, setSystem] = useState([0, 0, 0, 0]);
  const [messages, setMessages] = useState([
    "Wait",
    "Safe",
    "Dangerous",
    "Over",
  ]);
  const [messageIdx, setMessageIdx] = useState(1);
  tlvSystemTopic.subscribe(function (message) {
    setMessageIdx(message.data[0]);
    setSystem([message.data[1], message.data[2], message.data[3], message.data[4]]);
    if (message.data[0] === 3) {
      tlvSignalTopic.publish({ data: 0 });
      setSignalClasses([classes.basic50, classes.basic50]);
    }
  });

  const handleClick = (signalData) => {
    setSignalClasses(signalData === 1 ? [classes.purple50, classes.basic50] : [classes.basic50, classes.purple50]);
  
    const interval = setInterval(() => {
      tlvSignalTopic.publish({ data: signalData });
    }, 200);
  
    setTimeout(() => {
      clearInterval(interval);
    }, 10000);
  };

  const okClick = () => {
    handleClick(1);
  };
  const noClick = () => {
    handleClick(2);
  };
  return (
    <div>
      <Grid container  className={classes.map}>
      <Grid item xs={6}  >
        <DeckMap />
      </Grid>
      <Grid item xs={6}>
        <Grid container >
            <Grid item xs={6} >
            <Button
                className={signalClasses[0]}
                onClick={okClick}
              >○</Button>
          </Grid>
            <Grid item xs={6}>
              <Button
                className={signalClasses[1]}
                onClick={noClick}
              >×</Button>
          </Grid>
            <Grid item xs={12}>
              <Card className={classes.basic_card}>
                <CardContent>
                  {messages[messageIdx]}
                </CardContent>
              </Card>
            </Grid>
            <Sensor system={system} />
        </Grid>
      </Grid>
    </Grid>
    </div>
    
  );
};

export default TLV;