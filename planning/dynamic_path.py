import rospy
import sys
import time
import signal
import pymap3d
import json
from scipy.spatial import KDTree
from std_msgs.msg import Int8, Float32, String
from geometry_msgs.msg import PoseStamped, PoseArray, Pose, Point
from visualization_msgs.msg import Marker
from novatel_oem7_msgs.msg import INSPVA

from libs.map import LaneletMap, TileMap
from libs.micro_lanelet_graph import MicroLaneletGraph
from libs.planner_utils import *
from libs.rviz_utils import *

KPH_TO_MPS = 1 / 3.6
MPS_TO_KPH = 3.6

def signal_handler(sig, frame):
    sys.exit(0)

class DynamicPath:
    def __init__(self):
        self.state = 'WAIT'
        self.base_lla = [35.64588122580907,128.40214778762413, 46.746]
        self.tile_size = 5.0
        self.cut_dist = 15.0
        self.precision = 0.5

        self.lmap = LaneletMap("KIAPI.json")
        self.tmap = TileMap(self.lmap.lanelets, self.tile_size)
        self.graph = MicroLaneletGraph(self.lmap, self.cut_dist).graph
        self.M_TO_IDX = 1/self.precision
        self.IDX_TO_M = self.precision
        self.ego_pos = None

        self.path_make_cnt = 0
        self.ego_v = 12 #m/s -> callback velocity
        self.signal = 0 # 0 : default, 1 : left, 2 : right
        self.temp_signal = self.signal
        self.x_p = 1.5
        self.x2_i = 10
        self.x3_c = 7
        self.final_path = None


        rospy.Subscriber('/car/hlv_pose', Pose, self.hlv_pose_cb)
        rospy.Subscriber('/v2x/tlv_path', Marker, self.tlv_path_cb)
        rospy.Subscriber('/hlv_signal', Int8, self.hlv_signal_cb)
        self.pub_lanelet_map = rospy.Publisher('/planning/lanelet_map', MarkerArray, queue_size = 1, latch=True)
        self.pub_hlv_path = rospy.Publisher('/planning/hlv_path', Marker, queue_size=1)
        self.pub_hlv_geojson = rospy.Publisher('/planning/hlv_geojson', String, queue_size=1)
        self.pub_tlv_geojson = rospy.Publisher('/planning/tlv_geojson', String, queue_size=1)
        
        lanelet_map_viz = LaneletMapViz(self.lmap.lanelets, self.lmap.for_viz)
        self.pub_lanelet_map.publish(lanelet_map_viz)


    def hlv_pose_cb(self, msg):
        self.ego_pos = convert2enu(self.base_lla, msg.position.x, msg.position.y)
        self.ego_v = msg.orientation.x

    def tlv_path_cb(self,msg):
        tlv_path = [(pt.x, pt.y) for pt in msg.points]
        compress_path = do_compressing(tlv_path, 10)
        tlv_geojson = to_geojson(compress_path, self.base_lla)
        self.pub_tlv_geojson.publish(tlv_geojson)

    def hlv_signal_cb(self, msg):
        self.signal = msg.data

    def need_update(self):
        if self.final_path == None:
            return 0
        if self.temp_signal != self.signal and self.signal != 0:
            return 2
        threshold = (self.ego_v * MPS_TO_KPH)*self.M_TO_IDX
        idx = find_nearest_idx(self.final_path, self.ego_pos)
        if len(self.final_path) - idx <= threshold:
            return 1
        else:
            return -1


    
    def get_change_path(self, s_n, s_i,  path_len, to=1):
        wps, u_n, u_i = get_straight_path(self.lmap.lanelets, s_n, s_i, path_len)
        c_pt = wps[-1]
        l_id, r_id = get_neighbor(self.lmap.lanelets, u_n)
        n_id = l_id if to==1 else r_id

        if n_id != None:
            r = self.lmap.lanelets[n_id]['waypoints']
            u_n = n_id
            u_i = find_nearest_idx(r, c_pt)
        else:
            r = wps

        return r, u_n, u_i
    

    def make_path(self, update_type):
        r0 = []
        if update_type == 0 or update_type == 2:
            start_pose = self.ego_pos
        else:
            start_pose = self.final_path[-1]
            idx = find_nearest_idx(self.final_path, self.ego_pos)
            r0 = self.final_path[idx:]

        ego_lanelets = lanelet_matching(self.tmap.tiles, self.tmap.tile_size, start_pose)
        x1 = self.ego_v * MPS_TO_KPH + self.ego_v * self.x_p if self.ego_v != 0 else 100
        #x1 += self.ego_v * MPS_TO_KPH if self.signal == 0 else 0
        r1, n1, i1 = get_straight_path(self.lmap.lanelets, ego_lanelets[0], ego_lanelets[1], x1)

        if self.signal == 0 or self.signal == 3:
            final_path = r0+r1

        else:
            x2 = self.x2_i + self.ego_v * self.x_p
            _, n2, i2 = self.get_change_path(n1, i1, x2, self.signal)
            x3 = self.x3_c + self.ego_v * self.x_p
            r3, _, _ = get_straight_path(self.lmap.lanelets, n2, i2, x3)
            r1 += r0
            final_path = r1+r3

        compress_path = do_compressing(final_path, 10)
        return final_path, compress_path

    def get_node_path(self):
        if self.ego_pos == None:
            return
        
        final_path = []
        compress_path = []
        need_update = self.need_update()
        if need_update != -1:    
            final_path, compress_path = self.make_path(need_update)
            self.final_path = final_path
            self.hlv_path = ref_interpolate(final_path, self.precision)[0]
            self.hlv_geojson = to_geojson(compress_path,self.base_lla)
            

            hlv_path_viz = HLVPathViz(self.hlv_path)
            self.pub_hlv_path.publish(hlv_path_viz)
            self.pub_hlv_geojson.publish(self.hlv_geojson)

        

    def run(self):
        self.state = 'RUN'
        rate = rospy.Rate(10)
        
        while not rospy.is_shutdown():
            if self.state != 'Path':
                self.get_node_path()

            rate.sleep()

def main():
    signal.signal(signal.SIGINT, signal_handler)
    rospy.init_node('DynamicPath', anonymous=False)
    dp = DynamicPath()
    dp.run()

if __name__ == "__main__":
    main()
