[out:json][timeout:180];
area["wikidata"="Q11299"]["boundary"="administrative"]->.m;
(
  node["highway"~"^(traffic_signals|stop|give_way|crossing|street_lamp)$"](area.m)(40.698,-74.03,40.818,-73.92);
  node["crossing"](area.m)(40.698,-74.03,40.818,-73.92);
  node["emergency"="fire_hydrant"](area.m)(40.698,-74.03,40.818,-73.92);
  node["amenity"="bench"](area.m)(40.698,-74.03,40.818,-73.92);
  node["natural"="tree"](area.m)(40.698,-74.03,40.818,-73.92);
);
out body qt;
way["natural"="tree_row"](area.m)(40.698,-74.03,40.818,-73.92);
out geom qt;
