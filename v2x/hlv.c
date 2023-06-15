
/* include */
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#include <errno.h>
#include <fcntl.h>
#include <time.h>
#include <pthread.h>

/* include for v2x */
#include "v2x_defs.h"
#include "v2x_ext_type.h"
#include "db_v2x.h"
#include "math.h"

#include <ros/ros.h>
#include "std_msgs/Float32MultiArray.h"
#include "novatel_oem7_msgs/INSPVA.h"
#include "std_msgs/Float32.h"
#include "std_msgs/Int8.h"

#define SAMPLE_V2X_API_VER 0x0001
#define SAMPLE_V2X_IP_ADDR "192.168.1.11"
#define SAMPLE_V2X_PORT_ADDR 47347

#define SAMPLE_V2X_MSG_LEN 2000


/* Global Variable Value */
V2xAction_t e_action_g = eV2xAction_ADD;
V2xPayloadType_t e_payload_type_g = eRaw;
V2xPsid_t psid_g = 5271;
V2XCommType_t e_comm_type_g = eV2XCommType_5GNRV2X;
V2xPowerDbm_t tx_power_g = 20;
V2xSignerId_t e_signer_id_g = eV2xSignerId_UNSECURED;
V2xMsgPriority_t e_priority_g = eV2xPriority_CV2X_PPPP_0;
uint32_t tx_cnt_g = 1000000;
uint32_t tx_delay_g = 100;
V2xFrequency_t freq_g = 5900;
V2xDataRate_t e_data_rate_g = eV2xDataRate_6MBPS;
V2xTimeSlot_t e_time_slot_g = eV2xTimeSlot_Continuous;
uint8_t peer_mac_addr_g[MAC_EUI48_LEN] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
uint32_t transmitter_profile_id_g = 100;
uint32_t peer_l2id_g = 0;

uint32_t delay_time_sec_g = 100000;

int sock_g = -1;

std_msgs::Float32MultiArray hlv_system;
ros::Publisher pub_hlv_system;

unsigned long state;
unsigned long _signal;
unsigned long latitude;
unsigned long longitude;
unsigned long heading;
unsigned long velocity; //mps


int connect_v2x_socket(void)
{
	int res = -1; // failure

	// Create the socket
	int sock = socket(AF_INET, SOCK_STREAM, 0);
	if (sock < 0)
	{
		perror("socket() failed");
		res = sock;
		return res;
	}

	// Connect to the server
	struct sockaddr_in server_addr;
	memset(&server_addr, 0, sizeof(server_addr));
	server_addr.sin_family = AF_INET;
	server_addr.sin_addr.s_addr = inet_addr(SAMPLE_V2X_IP_ADDR);
	server_addr.sin_port = htons(SAMPLE_V2X_PORT_ADDR);
	
	if (connect(sock, (struct sockaddr *)&server_addr, sizeof(server_addr)) < 0)
	{
		perror("connect() failed");
		return res;
	}
#if 1
	// Change to NON-BLOCK socket
	int flags = fcntl(sock, F_GETFL, 0);
	if (flags == -1)
	{
		perror("fcntl F_GETFL failed");
		return res;
	}

	flags |= O_NONBLOCK;
	if (fcntl(sock, F_SETFL, flags) == -1)
	{
		perror("fcntl F_SETFL failed");
		return res;
	}
#endif
	printf("connect socket success\n");

	sock_g = sock;

	res = 0;
	return res;
}

void close_v2x_socket(void)
{
	if (sock_g >= 0)
	{
		close(sock_g);
	}
}

/* function : WSR Send/Response processing */
int v2x_wsr_cmd_process(void)
{
	int res = -1; // failure

	// Prepare the Ext_WSReq_t structure
	Ext_WSReq_t ws_req;
	memset(&ws_req, 0, sizeof(ws_req));
	ws_req.magic_num = htons(MAGIC_WSREQ);
	ws_req.ver = htons(SAMPLE_V2X_API_VER);
	ws_req.e_action = eV2xAction_ADD;
	ws_req.e_payload_type = e_payload_type_g;
	ws_req.psid = htonl(psid_g);

	// Send the request
	ssize_t n = send(sock_g, &ws_req, sizeof(ws_req), 0);
	if (n < 0)
	{
		perror("send() failed");
		return res;
	}
	else if (n != sizeof(ws_req))
	{
		fprintf(stderr, "send() sent a different number of bytes than expected\n");
		return res;
	}else{
		printf("WSR Send Sucess");
	}

	// Wait for the response
	Ext_WSResp_t ws_resp;
	memset(&ws_resp, 0, sizeof(ws_resp));
	n = -1;
	while (n <= 0)
	{
		n = recv(sock_g, &ws_resp, sizeof(ws_resp), 0);
		if (n < 0)
		{
			if (errno != EAGAIN && errno != EWOULDBLOCK)
			{
				perror("recv() failed");
				break;
			}
		}
		else if (n == 0)
		{
			fprintf(stderr, "recv() connection closed by peer\n");
		}
		else if (n != sizeof(ws_resp))
		{
			fprintf(stderr, "recv() received a different number of bytes than expected\n");
		}

		usleep(1000);
	}
	printf("WSR RECV Sucess");
	res = 0;
	hlv_system.data[2] = 1;
	return res;
}

/* function : V2X TX processing */
void *v2x_tx_cmd_process(void *arg)
{
	(void)arg;

	// Prepare the Ext_WSReq_t structure
	int db_v2x_tmp_size = sizeof(DB_V2X_T) + sizeof(MessageFrame_t);//SAMPLE_V2X_MSG_LEN;
	int v2x_tx_pdu_size = sizeof(Ext_V2X_TxPDU_t) + db_v2x_tmp_size;

	Ext_V2X_TxPDU_t *v2x_tx_pdu_p = NULL;
	DB_V2X_T *db_v2x_tmp_p = NULL;

	v2x_tx_pdu_p = (Ext_V2X_TxPDU_t *)malloc(v2x_tx_pdu_size);
	memset(v2x_tx_pdu_p, 0, sizeof(Ext_V2X_TxPDU_t));

	v2x_tx_pdu_p->ver = htons(SAMPLE_V2X_API_VER);
	v2x_tx_pdu_p->e_payload_type = e_payload_type_g;
	v2x_tx_pdu_p->psid = htonl(psid_g);
	v2x_tx_pdu_p->tx_power = tx_power_g;
	v2x_tx_pdu_p->e_signer_id = e_signer_id_g;
	v2x_tx_pdu_p->e_priority = e_priority_g;

	if (e_comm_type_g == eV2XCommType_LTEV2X || e_comm_type_g == eV2XCommType_5GNRV2X)
	{
		v2x_tx_pdu_p->magic_num = htons(MAGIC_CV2X_TX_PDU);
		v2x_tx_pdu_p->u.config_cv2x.transmitter_profile_id = htonl(transmitter_profile_id_g);
		v2x_tx_pdu_p->u.config_cv2x.peer_l2id = htonl(peer_l2id_g);
	}
	else if (e_comm_type_g == eV2XCommType_DSRC)
	{
		v2x_tx_pdu_p->magic_num = htons(MAGIC_DSRC_TX_PDU);
		v2x_tx_pdu_p->u.config_wave.freq = htons(freq_g);
		v2x_tx_pdu_p->u.config_wave.e_data_rate = htons(e_data_rate_g);
		v2x_tx_pdu_p->u.config_wave.e_time_slot = e_time_slot_g;
		memcpy(v2x_tx_pdu_p->u.config_wave.peer_mac_addr, peer_mac_addr_g, MAC_EUI48_LEN);
	}

	// Payload = KETI Format
	v2x_tx_pdu_p->v2x_msg.length = htons(db_v2x_tmp_size);
	db_v2x_tmp_p = (DB_V2X_T *)malloc(db_v2x_tmp_size); //DB_V2X_T
	memset(db_v2x_tmp_p, 0, db_v2x_tmp_size);

	db_v2x_tmp_p->eDeviceType = DB_V2X_DEVICE_TYPE_OBU;
	db_v2x_tmp_p->eTeleCommType = DB_V2X_TELECOMM_TYPE_5G_PC5;
	db_v2x_tmp_p->unDeviceId =htonl(71);
	db_v2x_tmp_p->ulTimeStamp = 0ULL;
	db_v2x_tmp_p->eServiceId = DB_V2X_SERVICE_ID_PLATOONING;
	db_v2x_tmp_p->eActionType = DB_V2X_ACTION_TYPE_REQUEST;
	db_v2x_tmp_p->eRegionId = DB_V2X_REGION_ID_SEOUL;
	db_v2x_tmp_p->ePayloadType = DB_V2X_PAYLOAD_TYPE_SAE_J2735_BSM;
	db_v2x_tmp_p->eCommId = DB_V2X_COMM_ID_V2V;
	db_v2x_tmp_p->usDbVer = 0;
	db_v2x_tmp_p->usHwVer = 0;
	db_v2x_tmp_p->usSwVer = 0;
	db_v2x_tmp_p->ulPayloadLength = htonl(sizeof(MessageFrame_t));

	//Subscribe
	
	unsigned long cnt = 0;

	MessageFrame_t msg;
	msg.messageId = 20;
	msg.value.present = MessageFrame__value_PR_BasicSafetyMessage;

	ssize_t n;
	time_t start_time = time(NULL);
	int period = 1000000 / 10;
	while (1)
	{
		hlv_system.data[0] = state;
		pub_hlv_system.publish(hlv_system);

		BasicSafetyMessage_t *ptrBSM = &msg.value.choice.BasicSafetyMessage;

		ptrBSM->coreData.id.buf = (uint8_t *)malloc(1);
		ptrBSM->coreData.id.size = 1;
		ptrBSM->coreData.id.buf[0] = 0x71;
		ptrBSM->coreData.msgCnt = cnt;
		ptrBSM->coreData.lat = latitude;
		ptrBSM->coreData.Long = longitude;
		ptrBSM->coreData.heading = heading;
		ptrBSM->coreData.speed = velocity;
		db_v2x_tmp_p->data = msg;
		memcpy(v2x_tx_pdu_p->v2x_msg.data, db_v2x_tmp_p, db_v2x_tmp_size); //(dst, src, length)
		
		n = send(sock_g, v2x_tx_pdu_p, v2x_tx_pdu_size, 0);

		if (n < 0)
		{
			perror("send() failed");
			break;
		}
		else if (n != v2x_tx_pdu_size)
		{
			fprintf(stderr, "send() sent a different number of bytes than expected\n");
			break;
		}
		else
		{
			printf(" \n\ntx send success(%ld bytes)\n", n);
			time_t current_time = time(NULL);
			double send_time_s = (difftime(current_time, start_time));
			double mbps = ( n / send_time_s )/1000000.0;
			if(isinf(mbps)){
				mbps = 0.0;
			}
			hlv_system.data[4] = mbps;
			start_time = current_time;
			cnt += 1;
		}
		usleep(period);
	}

	free(v2x_tx_pdu_p);
	free(db_v2x_tmp_p);
	
	return NULL;
}

/* function : V2X RX processing */
void *v2x_rx_cmd_process(void *arg)
{
	(void)arg;
	uint8_t buf[4096] = {0};
	int n = -1;
	time_t start_time = time(NULL);

	DB_V2X_T *db_v2x_tmp_p = NULL;
	MessageFrame_t *msgFrame = NULL;
	Ext_V2X_RxPDU_t *v2x_rx_pdu_p = NULL;
	int period = 1000000 / 10;
	while (1)
	{
		n = recv(sock_g, buf, sizeof(buf), 0);
		
		if (n < 0)
		{
			if (errno != EAGAIN && errno != EWOULDBLOCK)
			{
				perror("recv() failed");
				break;
			}
			else
			{
				printf("wait. . . \n");
				usleep(10000);
			}
		}
		else if (n == 0)
		{
			fprintf(stderr, "recv() connection closed by peer\n");
			break;
		}
		else
		{
			printf("\n\nrecv() success : len[%u]\n", n);
			time_t current_time = time(NULL);
			double delay_time_ms = round((difftime(current_time, start_time))*1000);
			hlv_system.data[3] = delay_time_ms;
			start_time = current_time;
			
			v2x_rx_pdu_p = (Ext_V2X_RxPDU_t *)malloc(n);
			memcpy(v2x_rx_pdu_p, buf, n);
			printf("\nV2X RX PDU>>\n"
				   "  magic_num        : 0x%04X\n"
				   "  ver              : 0x%04X\n"
				   "  e_payload_type   : 0x%04X\n"
				   "  psid             : %u\n"
				   "  v2x length       : %d\n",
				   ntohs(v2x_rx_pdu_p->magic_num),
				   ntohs(v2x_rx_pdu_p->ver),
				   v2x_rx_pdu_p->e_payload_type,
				   ntohl(v2x_rx_pdu_p->psid),
				   ntohs(v2x_rx_pdu_p->v2x_msg.length));

			int v2x_msg_length = ntohs(v2x_rx_pdu_p->v2x_msg.length);
			db_v2x_tmp_p = (DB_V2X_T *)malloc(v2x_msg_length);
			memcpy(db_v2x_tmp_p, v2x_rx_pdu_p->v2x_msg.data, v2x_msg_length);

			printf("\nV2X RX Data>>\n"
				   "  deivce ID    :  %u\n"
				   "  Payload Type :  0x%04X\n"
				   "  Payload Length :  %u\n"
				   "  Region ID    :  0x%04x\n"
				   "  data Size    :  %ld\n",
				   ntohl(db_v2x_tmp_p->unDeviceId),
				   db_v2x_tmp_p->ePayloadType,
				   ntohl(db_v2x_tmp_p->ulPayloadLength),
				   ntohs(db_v2x_tmp_p->eRegionId),
				   sizeof(db_v2x_tmp_p->data));

			int payload_length = sizeof(db_v2x_tmp_p->data);
			msgFrame = (MessageFrame_t *)malloc(payload_length);
			memcpy(msgFrame, &db_v2x_tmp_p->data, payload_length);

			BasicSafetyMessage_t *ptrBSM = &msgFrame->value.choice.BasicSafetyMessage;

			printf("\nV2X RX Test Msg>>\n"
				   "  CNT        :  %ld\n"
				   "  latitude   :  %ld\n"
				   "  longitude  :  %ld\n"
				   "  heading    :  %ld\n"
				   "  velocity   :  %ld\n",
				   ptrBSM->coreData.msgCnt,
				   ptrBSM->coreData.lat,
				   ptrBSM->coreData.Long,
				   ptrBSM->coreData.heading, 
				   ptrBSM->coreData.speed);
		}
		usleep(period);	
	}
	free(v2x_rx_pdu_p);
	free(db_v2x_tmp_p);
	free(msgFrame);

	return NULL;
}

/* function : Process Commands */
int process_commands(void)
{
	pthread_t tx_thread;
	pthread_t rx_thread;
	void *tx_thread_ret;
	void *rx_thread_ret;

	pthread_create(&tx_thread, NULL, v2x_tx_cmd_process, NULL);
	pthread_create(&rx_thread, NULL, v2x_rx_cmd_process, NULL);
	pthread_join(tx_thread, &tx_thread_ret);
	pthread_join(rx_thread, &rx_thread_ret);

	return -1;
}

void insCallback(const novatel_oem7_msgs::INSPVA::ConstPtr &msg){
	latitude = msg->latitude * pow(10, 7);
	longitude = msg->latitude * pow(10, 7);
	heading = 89.5-msg->azimuth;
}

void velocityCallback(const std_msgs::Float32::ConstPtr &msg){
	velocity = msg->data;
}

void stateCallback(const std_msgs::Int8::ConstPtr &msg){
	state = msg->data;
}

void signalCallback(const std_msgs::Int8::ConstPtr &msg){
	_signal = msg->data;
}

/* function : Main(Entry point of this program) */
int main(int argc, char *argv[])
{
	int res;
	ros::init(argc,argv, "v2x");
	ros::NodeHandle n;
	ros::AsyncSpinner spinner(1);

	ros::Subscriber sub_ins = n.subscribe("/novatel/oem7/inspva", 100, insCallback);
	ros::Subscriber sub_velocity = n.subscribe("/mobinha/car/velocity", 100, velocityCallback);
	ros::Subscriber sub_state = n.subscribe("/hlv_state", 100, stateCallback);
	ros::Subscriber sub_signal = n.subscribe("/hlv_signal", 100, signalCallback);
	// Tx Publish
	pub_hlv_system =  n.advertise<std_msgs::Float32MultiArray>("/hlv_system", 100);
	hlv_system.data.resize(5);
	hlv_system.data = {{0.0, 0.0, 0.0, 0.0, 0.0}};

	do
	{
		if ((res = connect_v2x_socket()) < 0)
		{
			break;
		}
		v2x_wsr_cmd_process();
		if ((res = process_commands()) < 0)
		{
			break;
		}
	} while (0);

	close_v2x_socket();
	return res;
}

/////////////////////////////////////////////////////////////////////////////////////////
