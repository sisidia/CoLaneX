import rospy
import sys
import time
import signal
import json
import pymap3d as pm
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

class SafeDistance:
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
        self.tlv_path = None
        self.tlv_geojson = None
        self.hlv_path = None
        self.hlv_v = None

        self.path_make_cnt = 0
        self.calc_safe_cnt = 0
        self.ego_v = 12 #m/s -> callback velocity
        self.x_p = 1.5
        self.x_c = 60
        self.intersection_radius = 1.0
        self.d_c = 15 # If at noraml road || on high way == 0

        #TODO: below INS, PATH, Velocity have to get from V2X  
        rospy.Subscriber('/car/tlv_pose', Pose, self.tlv_pose_cb)
        rospy.Subscriber('/v2x/hlv_pose', Pose, self.hlv_pose_cb)
        rospy.Subscriber('/v2x/hlv_path', Marker, self.hlv_path_cb)
        ####################

        self.pub_lanelet_map = rospy.Publisher('/planning/lanelet_map', MarkerArray, queue_size = 1, latch=True)
        self.pub_tlv_path = rospy.Publisher('/planning/tlv_path', Marker, queue_size=1)
        self.pub_intersection = rospy.Publisher('/planning/intersection', Marker, queue_size=1)
        self.pub_move = rospy.Publisher('/planning/move', Marker, queue_size=1)
        self.pub_tlv_geojson = rospy.Publisher('/planning/tlv_geojson', String, queue_size=1)
        self.pub_hlv_geojson = rospy.Publisher('/planning/hlv_geojson', String, queue_size=1)
        
        lanelet_map_viz = LaneletMapViz(self.lmap.lanelets, self.lmap.for_viz)
        self.pub_lanelet_map.publish(lanelet_map_viz)

    def tlv_pose_cb(self, msg):
        self.ego_pos = convert2enu(self.base_lla, msg.position.x, msg.position.y)
        self.ego_v = msg.orientation.x
    
    def hlv_pose_cb(self, msg):
        self.hlv_v = msg.orientation.x

    def hlv_path_cb(self, msg):
        self.hlv_path = [(pt.x, pt.y) for pt in msg.points]
        latlng_waypoints = []
        for wp in msg.points:
            lat, lng, _ = pm.enu2geodetic(wp.x, wp.y, 0, self.base_lla[0], self.base_lla[1], self.base_lla[2])
            latlng_waypoints.append((lng, lat))

        feature = {
            "type":"Feature",
            "geometry":{
                "type":"MultiLineString",
                "coordinates":[latlng_waypoints]
            },
            "properties":{}
        }
        hlv_geojson = json.dumps(feature)
        self.pub_hlv_geojson(hlv_geojson)
        

    def get_node_path(self):
        if self.ego_pos == None:
            return
        st = time.time()
        ego_lanelets = lanelet_matching(self.tmap.tiles, self.tmap.tile_size, self.ego_pos)

        ego_node = node_matching(self.lmap.lanelets, ego_lanelets[0], ego_lanelets[1])
        ego_waypoints = self.lmap.lanelets[ego_lanelets[0]]['waypoints']
        ego_lanelets_len = len(ego_waypoints)
        x1 = self.ego_v * MPS_TO_KPH + self.ego_v * self.x_p + self.x_c #m
        x1_idx = ego_lanelets[1]+int(x1 * self.M_TO_IDX)
        
        x1_ego_not_same = False
        if x1_idx >= ego_lanelets_len:
            x1_ego_not_same = True
            x1_s_node = self.lmap.lanelets[ego_lanelets[0]]['successor'][0]
            x1_idx = (x1_idx-ego_lanelets_len)+1
        else:
            x1_s_node = ego_lanelets[0]
        n1 = node_matching(self.lmap.lanelets, x1_s_node, x1_idx)
        n1_waypoints = self.lmap.lanelets[x1_s_node]['waypoints']
        if x1_ego_not_same:
            r1 = ego_waypoints[ego_lanelets[1]:]+n1_waypoints[:x1_idx+1]
        else:
            r1 = n1_waypoints[ego_lanelets[1]:x1_idx+1]
        
        compress_path = [r1[0], r1[-1]]
        self.tlv_path = ref_interpolate(r1, self.precision)[0]
        tlv_path_viz = TLVPathViz(self.tlv_path)
        self.pub_tlv_path.publish(tlv_path_viz)
        
        mt = format((time.time()-st)*1000, ".3f")
        print(f"Ego Node Matching : {mt}ms , Nodes [{ego_node}]-[{n1}]]")
        if self.path_make_cnt > 20:
            self.state = 'Path'
            
            latlng_waypoints = []
            for wp in compress_path:
                lat, lng, _ = pm.enu2geodetic(wp[0], wp[1], 0, self.base_lla[0], self.base_lla[1], self.base_lla[2])
                latlng_waypoints.append((lng, lat))

            feature = {
                "type":"Feature",
                "geometry":{
                    "type":"MultiLineString",
                    "coordinates":[latlng_waypoints]
                },
                "properties":{}
            }
            self.tlv_geojson = json.dumps(feature)
            with open('./path/tlv.json', 'w') as file:
                json.dump(feature, file)
            
        else:
            self.path_make_cnt += 1
    
    def is_insied_circle(self, pt1, pt2, radius):
        distance = math.sqrt((pt1[0]-pt2[0])**2+(pt1[1]-pt2[1])**2)
        if distance <=  radius:
            return True
        else:
            return False

    def calc_safe_distance(self):
        if self.hlv_path == None and self.hlv_v == None and self.tlv_path == None:
            return
        
        st = time.time()
        find = False
        inter_pt = None
        inter_idx = 0
        hlv_idx = 0
        for hi, hwp in enumerate(self.hlv_path):
            if find:
                break
            for ti, twp in enumerate(self.tlv_path):
                if self.is_insied_circle(twp, hwp, self.intersection_radius):
                    inter_pt = twp
                    inter_idx = ti
                    hlv_idx = hi
                    find = True
                    break
        self.pub_intersection.publish(Sphere('intersection', 0, inter_pt, 5.0, (33/255, 255/255, 144/255, 0.7)))
        
        d1 = inter_idx*self.IDX_TO_M
        d2 = self.ego_v * ((hlv_idx*self.IDX_TO_M)/self.hlv_v)
        d2_idx = int(d2*self.M_TO_IDX)
        dg = d1-d2
        ds = self.ego_v*3.6-self.d_c #m
        safety = 'Safe' if dg > ds else 'Dangerous'

        self.pub_move.publish(Sphere('move', 0, self.tlv_path[d2_idx], 3.0, (91/255, 113/255, 255/255, 0.7)))

        mt = format((time.time()-st)*1000, ".3f")
        print(f"Calc Safety : {mt}ms, {safety}")

        if self.calc_safe_cnt > 20:
            self.state = 'Decision'
        else:
            self.calc_safe_cnt += 1

    def run(self):
        self.state = 'RUN'
        rate = rospy.Rate(10)
        
        while not rospy.is_shutdown():
            if self.state != 'Path' and self.state != 'Decision':
                self.get_node_path()

            if self.state == 'Path' and self.state != 'Decision':
                self.pub_tlv_geojson.publish(self.tlv_geojson)
                #self.calc_safe_distance()
            
            rate.sleep()

def main():
    signal.signal(signal.SIGINT, signal_handler)
    rospy.init_node('SafeDistance', anonymous=False)
    sd = SafeDistance()
    sd.run()

if __name__ == "__main__":
    main()