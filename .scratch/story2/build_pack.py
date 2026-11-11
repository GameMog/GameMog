#!/usr/bin/env python3
"""SF 2040's pack, built from the story2 design (.scratch/story2/DESIGN.md).
Writes tools/storyrun/test-packs/sf2040.json, keeping the cast block (models are the CAST lane's) and the opening's
shots as they are in the file. Run from the worktree root: python3 .scratch/story2/build_pack.py"""
import json, os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PACK = os.path.join(ROOT, 'tools/storyrun/test-packs/sf2040.json')
old = json.load(open(PACK))

# ------------------------------------------------------------------ helpers
def close(who, text, right=0.5, dur=None, fov=33, **kw):
    """a close-up on `who` (rel cast) saying `text`"""
    d = dur or max(2.6, min(5.5, len(text) / 15 + 0.8))
    s = {"cam": {"rel": who, "fwd": 2.0, "right": right, "up": 0.0}, "look": {"rel": who, "up": -0.05}, "dur": round(d, 1), "fov": fov, "sub": [who, text]}
    s.update(kw); return s

def hero(text, right=-0.5, dur=None, **kw):
    d = dur or max(2.6, min(5.5, len(text) / 15 + 0.8))
    s = {"cam": {"rel": "player", "fwd": 2.0, "right": right, "up": 0.05}, "look": {"rel": "player", "up": -0.05}, "dur": round(d, 1), "fov": 34, "sub": ["Cal", text]}
    s.update(kw); return s

def say(who, text, secs=None, **kw):
    s = {"type": "say", "who": who, "text": text}
    if secs: s["secs"] = secs
    s.update(kw); return s

def radio(lines, at=0.5, role="Radio", who=None):
    """a call over the band while he rides (the car phone's: answers itself in the saddle)"""
    return {"type": "call", "at": at, "who": who or lines[0][0], "auto": True, "inCar": True, "role": role, "lines": [list(l) for l in lines]}

def radio_step(lines, role="Radio", who=None):
    """a call as its own step: auto-answered, on foot or in the saddle"""
    return {"type": "call", "who": who or lines[0][0], "auto": True, "role": role, "lines": [list(l) for l in lines]}

# ------------------------------------------------------------------ the world
places = dict(old["places"])
places.update({
    # (the opening and the camp's beats: on the east edge of Sue Bierman Park's tents (apocalypse camps.js CAMPS[0],
    # 600,-668), facing east, so a close-up from in front has the tents and the barrel fires behind him on the lawn; the
    # people he talks to stand behind him, among the tents. Facing west he had the plaza in front of the Ferry Building
    # behind him, which reads as water (the voice lane's capture, 11 Nov))
    "camp": {"at": [611, -667, 90], "name": "the Embarcadero camp"},
    "marketmain": {"at": [490, -486, -135], "name": "Market & Main"},
    "broodnest": {"at": [-2335, 2318, -135], "name": "the pharmacy's corner"},
    "corral": {"at": [-1222, 1003, 90], "name": "the corral on Fulton St"},
    "vanness": {"at": [-1514, 1507, -135], "name": "Market & Van Ness"},
    "parkfoot": {"at": [-2091, -239, -90], "name": "Sacramento & Gough"},
    "fleeend": {"at": [-1978, -457, 90], "name": "Washington & Franklin"},
    "wavenorth": {"at": [590, -760, 180], "name": "the Embarcadero, north"},
    "wavesouth": {"at": [700, -600, -90], "name": "the piers, south"},
    "wavewest": {"at": [571, -559, -45], "name": "Market & Spear"},
})

cast = dict(old["cast"])
cast.setdefault("Vale", {"color": "#C9C2B4", "role": "Deacon Vale, who leads the Iron Saints", "voiceOnly": True})
cast.setdefault("Pike", {"color": "#A3D977", "role": "a young Iron Saint", "voiceOnly": True})
cast.setdefault("Warden", {"color": "#FF6A5C", "role": "WARDEN-7, the Preserve's security unit", "voiceOnly": True})

# ------------------------------------------------------------------ M1 Market Street: learn and scavenge
M1 = {
    "id": "M1", "title": "Market Street", "vehicle": "horse",
    "start": {"@": "camp", "mode": "walk"},
    "stakes": "Forty families. Two days of food left on Market St, if the Iron Saints haven't found it.",
    "passLine": "The camp eats tonight.",
    "steps": [
        {"type": "npc", "id": "hollis0", "who": "Hollis", "at": {"rel": "player", "fwd": -3.0, "right": 1.6}},
        say("Hollis", "Crates fell off the relief trucks all down Market. Bring back five.", 3),
        say("Hollis", "And take the bat. The Saints don't ask twice.", 2.6),
        {"type": "mount", "id": "saddle", "arm": "bat", "objective": "Mount **Ranger**."},
        say("Cal", "Come on, Ranger.", 1.6),
        {"type": "drive", "id": "tutorial", "to": "@marketmain", "radius": 22, "card": False, "checkpoint": True,
         "objective": "Ride up **Market St**.",
         "help": [[0.3, "[W] trots. Hold [Shift] to gallop, and [Q] slows him to a walk."], [8, "[Space] jumps Ranger over what's in the way. The yellow line is the way."]]},
        {"type": "collect", "id": "food", "kind": "food", "label": "Food", "look": "crate", "color": "#E8B04A",
         "items": [[531, -519], [348, -352], [179, -170], [-4, -2], [-173, 179], [-356, 347]], "need": 5, "checkpoint": True,
         "objective": "Scavenge **food** along Market St.",
         "help": [[1, "Ride over a crate to take it. You don't need to get down."]],
         "barks": {"1": ["Cal", "Beans. Good."], "3": ["Cal", "Halfway there."]},
         "during": [radio([
             ["Hollis", "Cal, you hear me? Keep off the side streets. Hybrids nest in the old garages."],
             ["Cal", "Copy."],
             ["Hollis", "And Cal. If Nina's out there, she's smart. She'll leave word."],
             ["Cal", "She always does."],
         ], at=14, role="Radio · the camp")]},
        say("Cal", "Armour on the corner. Iron Saints. They want the crates.", 2.6),
        {"type": "fight", "id": "saints", "arena": "@saints", "checkpoint": True,
         "foes": [{"id": "creature-knight", "count": 3, "name": "Iron Saint"}],
         "objective": "Fight off the **Iron Saints**.", "counter": "SAINTS",
         "help": [[0.5, "In the saddle, [J] swings the bat at whoever is beside you. [K] and Ranger kicks out behind."], [9, "Or get down with [F] and fight on foot: [J] hits, [Q] counters."]],
         "barks": {"1": ["Cal", "Stay down."], "2": ["Cal", "One more."]}},
        say("Pike", "Don't! Please. They make us wear it.", 2.6),
        say("Cal", "Then take it off and go home, kid.", 2.4),
        say("Pike", "It's Pike. My name's Pike. I won't forget this.", 2.8),
        radio_step([
            ["Vale", "Rider on Market. That's Saint property on your saddle."],
            ["Cal", "It's food. For kids."],
            ["Vale", "Everything in this city belongs to someone now. Tithe night is Sunday. Tell your camp."],
        ], role="Open band"),
        {"type": "drive", "id": "home", "to": "@campgate", "radius": 18, "card": False, "checkpoint": True,
         "objective": "Ride the food back to **the Embarcadero camp**.",
         "during": [radio([
             ["Hollis", "That was Deacon Vale. He runs the Saints out of the old Preserve trucks."],
             ["Cal", "What's tithe night?"],
             ["Hollis", "The night they come for what you owe. Camps that don't pay get visitors. The big kind."],
             ["Cal", "Animals don't take orders, Hollis."],
             ["Hollis", "Just get home, Cal."],
         ], at=5, role="Radio · the camp")]},
        {"type": "dismount", "id": "m1off"},
        {"type": "npc", "id": "hollis", "who": "Hollis", "at": {"rel": "player", "fwd": 2.3, "right": 0.8}},
        {"type": "cutscene", "id": "m1camp", "shots": [
            close("Hollis", "Five crates. The kids are already fighting over the peaches.", dur=3),
            hero("Market and Church. That's where she called from.", right=-0.6, dur=3),
            close("Hollis", "Then bring her medicine too. And watch Octavia. Something big nests under the ramps.", right=-0.5, dur=3.6),
            hero("Water first. Then we ride. Right, Ranger?", right=-0.6, dur=2.8),
        ]},
    ],
}

# ------------------------------------------------------------------ M2 Quiet Hooves: stealth on horseback
M2 = {
    "id": "M2", "title": "Quiet Hooves", "vehicle": "horse", "start": "@campgate",
    "stakes": "Nina's last call came from the pharmacy at Market & Church. Something sleeps on the street in front of it.",
    "passLine": "Medicine for the camp. And Nina's handwriting.",
    "between": {"radio": [["Hollis", "Octavia's west, up Market. Slow out there, Cal. Slow is alive."]]},
    "steps": [
        {"type": "herd", "id": "wild", "creature": "creature-horse", "at": [-1530, 1480], "count": 3, "radius": 10},
        {"type": "drive", "id": "toOctavia", "to": "@octavia", "radius": 30, "checkpoint": True,
         "objective": "Ride up Market toward **Octavia**.",
         "trigger": {"area": {"@": "vanness", "r": 70}, "say": ["Cal", "Wild ones. Easy, Ranger. They're not ours."]},
         "during": [radio([
             ["Hollis", "Cal. The pharmacy's a block past the Octavia ramps. Something's been nesting there since the impact."],
             ["Cal", "Something."],
             ["Hollis", "Scorpions, big as dogs. And their mother. Bigger."],
             ["Cal", "They sleep?"],
             ["Hollis", "At dusk, like the dead. But don't run him in there. A trot sounds like a drum to them."],
         ], at=8, role="Radio · the camp")]},
        {"type": "herd", "remove": "wild"},
        say("Cal", "Egg sacs on the ramp. Easy, Ranger. Easy.", 2.4),
        {"type": "sneak", "id": "nest", "to": "@pharmacy", "radius": 12, "checkpoint": True,
         "objective": "Walk **Ranger** past the nest to **the pharmacy**.",
         "sleepers": [
             {"id": "creature-scorpion", "at": [-2059, 2056], "height": 0.9, "name": "Brood", "yaw": 40},
             {"id": "creature-scorpion", "at": [-2165, 2137], "height": 0.9, "name": "Brood", "yaw": 200},
             {"id": "creature-scorpion", "at": [-2260, 2257], "height": 2.4, "name": "The Brood Mother", "ears": 1.3, "yaw": 135},
             {"id": "creature-scorpion", "at": [-2328, 2302], "height": 0.9, "name": "Brood", "yaw": 300},
         ],
         "warn": ["Cal", "Shh. Shh. Easy, boy."],
         "why": "The brood woke. They heard Ranger coming."},
        {"type": "dismount", "id": "m2off", "objective": "Get down. **Quietly**."},
        {"type": "collect", "id": "meds", "kind": "medicine", "label": "Medicine", "look": "case", "color": "#E04848", "radius": 2.2,
         "items": [[-2374, 2361], [-2360, 2348], [-2380, 2345]], "checkpoint": True,
         "objective": "Search the pharmacy for **medicine**.",
         "barks": {"1": ["Cal", "Antibiotics. She'd want these."], "2": ["Cal", "Inhalers. June's kind."]}},
        {"type": "cutscene", "id": "note1", "shots": [
            {"cam": {"rel": "player", "fwd": 1.9, "right": 0.5, "up": 0.05}, "look": {"rel": "player", "up": -0.1}, "dur": 3, "fov": 32, "sub": ["Cal", "A note, taped to the register. Her writing."]},
            {"cam": {"rel": "player", "fwd": 2.6, "right": 1.3, "up": 0.35}, "look": {"rel": "player", "up": -0.35}, "dur": 6.5, "fov": 36, "caption": "Nina's note",
             "text": "\"Moving the patients to the hospital on Hyde St, the Civic Center way. June is with me. The animals' collars are still transmitting, Cal. Something is calling them. If you find this: we're alive. N.\""},
            {"cam": {"rel": "player", "fwd": 2.0, "right": -0.6, "up": 0.1}, "look": {"rel": "player", "up": -0.05}, "dur": 3, "fov": 34, "sub": ["Cal", "Alive. Both of them."]},
            {"cam": {"rel": "player", "fwd": -2.4, "right": 1.2, "up": 0.5}, "look": {"rel": "player", "fwd": 4, "up": 0.3}, "dur": 2.6, "fov": 40, "sub": ["Cal", "And that's the shop bell. Oh, no."]},
        ]},
        {"type": "fight", "id": "brood", "arena": "@broodnest", "checkpoint": True,
         "foes": [{"id": "creature-scorpion", "count": 2, "height": 0.9, "name": "Brood"}],
         "boss": {"id": "creature-scorpion", "name": "The Brood Mother", "height": 2.4, "phases": [0.5], "at": "@broodnest"},
         "objective": "Kill **The Brood Mother** and her brood.", "counter": "BROOD",
         "wake": ["Cal", "There she is."],
         "barks": {"2": ["Cal", "Her turn."]}},
        {"type": "mount", "id": "m2on", "objective": "Back on **Ranger**."},
        say("Cal", "Hyde St, the Civic Center way. Hang on, Nina.", 2.6),
    ],
}

# ------------------------------------------------------------------ M3 Wild Horses: boss + herding
M3 = {
    "id": "M3", "title": "Wild Horses", "vehicle": "horse", "start": "@pharmacy",
    "stakes": "Tithe night is Sunday. The camp needs horses to move, and a wild herd grazes on Civic Center Plaza under a silverback's eye.",
    "passLine": "Horses for the camp. And a name: WARDEN-7.",
    "between": {"radio": [["Hollis", "Medicine's in the clinic tent. Cal, if we're moving people before Sunday, we need horses."]]},
    "steps": [
        {"type": "herd", "id": "horses", "creature": "creature-horse", "at": [-1400, 985], "count": 4, "radius": 12},
        {"type": "drive", "id": "toCivic", "to": "@civic", "radius": 30, "checkpoint": True,
         "objective": "Ride to **Civic Center Plaza**.",
         "during": [radio([
             ["Vale", "Rider. You took my crates and you woke my Brood Mother. That's a debt."],
             ["Cal", "Your Brood Mother?"],
             ["Vale", "Everything with a collar on it answers to someone. Sunday, rider."],
             ["Hollis", "Cal, don't answer him. Just don't."],
             ["Cal", "What did he mean, answers to someone?"],
             ["Hollis", "Civic Center's coming up on your right."],
         ], at=8, role="Open band", who="Vale")]},
        say("Cal", "Wild horses on the plaza. And something sitting on the steps, watching them.", 3),
        {"type": "fight", "id": "silver", "arena": "@civic", "checkpoint": True,
         "boss": {"id": "creature-ape", "name": "Old Silver", "height": 3.6, "phases": [0.6, 0.3], "hold": {"wake": 18, "leash": 45}, "at": "@cityhall"},
         "objective": "Bring down **Old Silver**.", "wake": ["Cal", "Okay, big fella. Okay."]},
        say("Cal", "A collar on him. Preserve tags. Still blinking.", 2.6),
        {"type": "collect", "id": "pack", "kind": "clue", "label": "Backpack", "look": "bag", "color": "#FFB86B",
         "items": [[-1458, 1030]], "objective": "Check **the backpack** on City Hall's steps."},
        {"type": "dismount", "id": "m3off"},
        {"type": "cutscene", "id": "pack1", "shots": [
            {"cam": {"rel": "player", "fwd": 1.9, "right": 0.5, "up": 0.05}, "look": {"rel": "player", "up": -0.1}, "dur": 3.4, "fov": 32, "sub": ["Cal", "June's backpack. The patch her grandma sewed on."]},
            {"cam": {"rel": "player", "fwd": 2.0, "right": -0.6, "up": 0.1}, "look": {"rel": "player", "up": -0.05}, "dur": 3.4, "fov": 34, "sub": ["Cal", "Her inhaler's still in it. She's got the spare. Hyde St, then."]},
            {"cam": {"rel": "player", "fwd": 2.6, "right": 1.3, "up": 0.35}, "look": {"rel": "player", "up": -0.35}, "dur": 6.5, "fov": 36, "caption": "A page of Nina's notebook",
             "text": "\"Every collar answers one tone. WARDEN-7, the Preserve's security unit, sends it. Somebody turned it back on. The signal comes from Hyde St.\""},
            {"cam": {"rel": "player", "fwd": 2.0, "right": -0.6, "up": 0.1}, "look": {"rel": "player", "up": -0.05}, "dur": 2.8, "fov": 34, "sub": ["Cal", "Somebody's herding them."]},
        ]},
        {"type": "mount", "id": "m3on", "objective": "Mount **Ranger**: the camp needs those horses."},
        {"type": "drove", "id": "herd", "herd": "horses", "to": "@corral", "radius": 16, "need": 3, "label": "Horses", "checkpoint": True,
         "objective": "Drive the **wild horses** into **the corral on Fulton St**",
         "barks": {"1": ["Cal", "That's it. Go on."], "3": ["Cal", "Three. Hollis gets his horses."]}},
        radio_step([
            ["Hollis", "I see them on the rope line! Three horses, Cal. You beautiful man."],
            ["Cal", "Hollis. What's WARDEN-7?"],
            ["Hollis", "Where did you hear that name?"],
            ["Cal", "Nina's notebook."],
            ["Hollis", "Go to Hyde St. I'll tell you when you're back. I promise."],
        ], role="Radio · the camp"),
    ],
}

# ------------------------------------------------------------------ M4 The Shepherd: boss, sabotage under a timer, the choice, the reveal
M4 = {
    "id": "M4", "title": "The Shepherd", "vehicle": "horse", "start": "@civic",
    "stakes": "The hospital on Hyde St. The Preserve's security mech walks its forecourt, and every collar in the city answers its call.",
    "passLine": "The shepherd is silent. Hollis's secret isn't.",
    "between": {"radio": [
        ["Pike", "Rider? It's Pike. From Market. Vale parked the big machine at the hospital. It calls the animals."],
        ["Pike", "Three relay boxes on the street keep it loud. Break those and it goes quiet."],
        ["Cal", "Why tell me?"],
        ["Pike", "You let me walk away."],
    ]},
    "steps": [
        {"type": "drive", "id": "toHyde", "to": "@hyde", "radius": 25, "checkpoint": True,
         "objective": "Ride up **Hyde St** to the hospital.",
         "trigger": {"area": {"@": "hyde", "r": 120}, "say": ["Warden", "CONTAINMENT BREACH. ALL SPECIMENS RETURN TO ENCLOSURE."]}},
        say("Cal", "Hybrids. Preserve tags still on them.", 2.4),
        {"type": "fight", "id": "warden", "arena": "@hospital", "checkpoint": True,
         "foes": [{"id": "creature-centaur", "count": 2, "name": "Hybrid"}],
         "boss": {"id": "creature-mech", "name": "WARDEN-7", "height": 4.0, "phases": [0.5], "hold": {"wake": 20, "leash": 40}},
         "objective": "Get past the **hybrids** and **WARDEN-7**.", "counter": "DOWN",
         "wake": ["Cal", "Target me, then. Come on."],
         "barks": {"1": ["Warden", "SPECIMEN DOWN. DISPATCHING."], "2": ["Warden", "UNAUTHORIZED PERSON. RESTRAIN."]}},
        say("Warden", "BROADCAST CONTINUING. ALL SPECIMENS: COME HOME.", 3),
        say("Cal", "It's still calling them. Pike said three relays.", 2.6),
        {"type": "timer", "name": "call", "seconds": 100, "label": "THE CALL", "fail": "hard", "why": "The tone drew every creature for a mile onto the block."},
        {"type": "collect", "id": "relays", "kind": "relay", "label": "Relays", "look": "case", "color": "#6CB8FF", "radius": 2.6,
         "items": [[-1322, -60], [-1330, -130], [-1360, -37]], "checkpoint": True,
         "objective": "Smash the **relays** before the herds arrive.",
         "help": [[0.5, "Ride over each relay box to smash it. They're on the radar."]],
         "barks": {"1": ["Cal", "One down."], "2": ["Pike", "That's two! The last one's on Bush St!"]}},
        {"type": "timer", "name": "call", "stop": True},
        say("Warden", "BROADCAST INTERRUPTED. AWAITING OPERATOR.", 2.6),
        {"type": "choice", "id": "core", "flag": "shepherd", "who": "Cal",
         "prompt": "WARDEN-7's core is open. One command left in it.",
         "options": [
             {"text": "Smash it. Nobody calls them again.", "value": "smashed", "reply": ["Cal", "No more shepherds."]},
             {"text": "Send one last tone: home, to the Preserve.", "value": "home", "reply": ["Cal", "Go home. All of you."]},
         ]},
        {"type": "search", "id": "doors", "at": "@hospdoor", "label": "Search the doors", "noun": "the doors", "secs": 1.2,
         "objective": "Search **the hospital doors**."},
        {"type": "cutscene", "id": "chalk", "shots": [
            {"cam": {"rel": "player", "fwd": 1.9, "right": 0.5, "up": 0.05}, "look": {"rel": "player", "up": -0.1}, "dur": 3, "fov": 32, "sub": ["Cal", "Empty. Every bed."]},
            {"cam": {"rel": "player", "fwd": -2.6, "right": 1.4, "up": 0.4}, "look": {"rel": "player", "fwd": 3, "up": 0.1}, "dur": 4.6, "fov": 40, "caption": "Chalk on the doors",
             "text": "\"Generator died. Took everyone up to the big grey house on Washington St, by Lafayette Park. High ground. Hurry. N.\""},
            {"cam": {"rel": "player", "fwd": 2.0, "right": -0.6, "up": 0.1}, "look": {"rel": "player", "up": -0.05}, "dur": 3, "fov": 34, "sub": ["Cal", "Lafayette Park. I'm coming."]},
        ]},
        radio_step([
            ["Vale", "Rider. You broke my shepherd."],
            ["Cal", "You were using it on people."],
            ["Vale", "I was keeping order. Ask your radio man who let them out."],
            ["Cal", "What?"],
            ["Vale", "Ask Hollis who opened the Preserve gates the night Erebus fell."],
        ], role="Open band"),
        say("Cal", "Hollis.", 1.6),
        radio_step([
            ["Hollis", "I was the night keeper. The fires were coming over the wall, Cal. They'd have burned in their pens."],
            ["Hollis", "So I opened every gate. I thought they'd run for the hills."],
            ["Cal", "They ran for us."],
            ["Hollis", "I know. I've sat at this radio forty-one days trying to make it right."],
            ["Cal", "We'll talk when I've got my family."],
        ], role="Radio · the camp"),
    ],
}

# ------------------------------------------------------------------ M5 Lafayette Park: track by sound, the gallop chase, the reunion
reunion = [s for s in [m for m in old["missions"] if m["id"] == "M5"][0]["steps"] if s.get("id") == "reunion"][0]
M5 = {
    "id": "M5", "title": "Lafayette Park", "vehicle": "horse", "start": "@hospital",
    "stakes": "The grey house on Washington St. Between it and Cal: the top of Lafayette Park, and something that nests there.",
    "passLine": "Home is three people and a horse.",
    "between": {"dm": False, "radio": [
        ["Hollis", "Cal. Does June still have her whistle? The ranger one?"],
        ["Cal", "Three short. I'm here. I taught her when she was six."],
        ["Hollis", "Then use yours. Sound carries up there."],
    ]},
    "steps": [
        {"type": "drive", "id": "toPark", "to": "@parkfoot", "radius": 25, "checkpoint": True,
         "objective": "Ride to the foot of **Lafayette Park**.",
         "during": [radio([
             ["Cal", "Hollis. Why didn't you tell me?"],
             ["Hollis", "Because you'd have stopped listening to the radio. And then you'd never have heard her."],
         ], at=20, role="Radio · the camp")]},
        say("Cal", "She's up there somewhere. Come on, Junebug. Answer me.", 3),
        {"type": "track", "id": "whistle", "at": "@summit", "radius": 22, "label": "Whistle", "cue": "whistle", "every": 6, "checkpoint": True,
         "objective": "Follow **June's whistle** up the hill.",
         "help": "Three short blasts, and an answer. No route for this one: listen, and watch the WHISTLE bar fill as you get closer."},
        say("June", "Dad? Dad, is that you?", 2.2),
        say("Cal", "June! Stay inside! Stay in the house!", 2.4),
        say("Cal", "That's no hill. Ranger. GO!", 2.0),
        {"type": "flee", "id": "run", "to": "@fleeend", "radius": 18, "keep": True, "checkpoint": True,
         "creature": {"id": "creature-trex", "name": "The Matriarch", "height": 5.8, "boss": True, "phases": [0.66, 0.33]},
         "from": [-2232, -372], "speed": 10.5,
         "objective": "Lead **The Matriarch** away from the house. Ride east for **Franklin St**!", "alert": "Away from the house!",
         "barks": {"5": ["Cal", "Away from the house. Away from the house!"], "14": ["Cal", "Come on, you big lizard. This way!"]}},
        {"type": "fight", "id": "matriarch", "arena": "@fleeend", "checkpoint": True,
         "boss": {"id": "creature-trex", "name": "The Matriarch", "height": 5.8, "phases": [0.66, 0.33], "from": "run"},
         "objective": "Bring down **The Matriarch**.", "counter": "DOWN",
         "help": [[1, "Keep moving. Strike when she's done snapping, then get clear."]]},
        say("Cal", "Stay down. Please. Just stay down.", 2.4),
        {"type": "drive", "id": "toHouse", "to": "@mansion", "radius": 10, "card": False, "checkpoint": True,
         "objective": "Ride back up to **the house on Washington St**."},
        {"type": "dismount", "id": "m5off"},
        {"type": "walk", "id": "door", "to": "@mansion", "radius": 4, "beam": True, "objective": "Go to **the house on Washington St**."},
        {"type": "place", "id": "yard", "at": {"@": "mansion", "mode": "walk"}},
        {"type": "npc", "id": "nina", "who": "Nina", "at": "@door2"},
        {"type": "npc", "id": "june", "who": "June", "at": "@door"},
        reunion,
    ],
}

# ------------------------------------------------------------------ M6 Homecoming: defend the camp
M6 = {
    "id": "M6", "title": "Homecoming", "vehicle": "horse", "start": {"@": "camp", "mode": "walk"},
    "stakes": "Dawn. The Mercers ride into the Embarcadero camp, and Deacon Vale comes to collect.",
    "passLine": "Nobody here owes anybody.",
    "between": {"dm": False, "radio": [["Hollis", "Camp's awake, Cal. Everybody wants to see the doctor."]]},
    "steps": [
        {"type": "transition", "id": "dawn", "kicker": "SUNDAY", "text": "Dawn", "sub": "The Embarcadero camp"},
        {"type": "npc", "id": "hollis6", "who": "Hollis", "at": {"rel": "player", "fwd": -2.4, "right": 0.9}},
        {"type": "npc", "id": "nina6", "who": "Nina", "at": {"rel": "player", "fwd": -1.2, "right": -1.6}},
        {"type": "npc", "id": "june6", "who": "June", "at": {"rel": "player", "fwd": -0.8, "right": 2.0}},
        {"type": "cutscene", "id": "arrive", "shots": [
            close("Hollis", "Cal.", dur=1.8),
            hero("Hollis.", right=-0.6, dur=1.8),
            close("Hollis", "Doctor Mercer. June. I'm glad. I'm so glad.", dur=3.2),
            close("June", "You're the radio man. You said Dad's name every night.", right=-0.5, dur=3.4),
            close("Hollis", "Somebody had to keep saying it.", dur=2.8),
            close("Pike", "Rider! Vale's coming down the Embarcadero. All of them. He's got brutes on chains.", dur=4.2,
                  cam={"rel": "player", "fwd": -3.2, "right": 1.6, "up": 0.9}, look={"rel": "player", "fwd": 6, "up": 0.6}, fov=42),
            hero("Nina, get the kids behind the trucks. June...", right=-0.6, dur=3),
            close("June", "I know. The radio tower. I'll call them out.", right=-0.5, dur=3),
            hero("That's my girl.", right=-0.6, dur=2.2),
        ]},
        {"type": "mount", "id": "m6on", "objective": "Mount **Ranger**."},
        {"type": "fight", "id": "defend", "arena": "@camp", "checkpoint": True, "counter": "WAVE",
         "objective": "Hold **the camp**.",
         "waves": [
             {"foes": [{"id": "creature-knight", "count": 3, "name": "Iron Saint"}], "from": "@wavenorth", "alert": "From the north"},
             {"foes": [{"id": "creature-centaur", "count": 2, "name": "Hybrid"}, {"id": "creature-knight", "count": 1, "name": "Iron Saint"}],
              "from": "@wavesouth", "pause": 6, "say": ["June", "Dad! Two hybrids from the south, by the piers!"], "alert": "From the piers"},
             {"boss": {"id": "creature-knight", "name": "Deacon Vale", "height": 2.3, "phases": [0.5], "stats": {"hp": 260}},
              "foes": [{"id": "creature-ogre", "count": 2, "name": "Brute"}],
              "from": "@wavewest", "pause": 7, "say": ["June", "It's him! Big armour, coming up Market!"], "alert": "Deacon Vale",
              "wake": ["Vale", "Rider. You owe me a city."]},
         ]},
        say("Vale", "Enough. Enough.", 2),
        say("Cal", "Stay down, Vale. Nobody here owes you anything.", 3),
        {"type": "dismount", "id": "m6off"},
        {"type": "cutscene", "id": "keeper", "shots": [
            close("Hollis", "Cal. About the gates.", dur=2.4),
            hero("You opened them so they wouldn't burn.", right=-0.6, dur=3),
            hero("That's what a keeper does. So keep something. You're on Ranger duty.", right=-0.6, dur=4),
            close("Hollis", "Yes, sir.", dur=2),
            close("June", "Can I ride him tomorrow?", right=-0.5, dur=2.4),
            hero("He kept me alive forty-one days. You'll have to ask him.", right=-0.6, dur=3.4),
            close("Nina", "Cal. Look. They're coming out of the tents.", right=0.6, dur=3.2, warm=True),
        ]},
        {"type": "cutscene", "id": "endSmashed", "if": "shepherd == smashed", "shots": [
            {"cam": {"rel": "player", "fwd": 14, "up": 4, "right": 9}, "to": {"rel": "player", "fwd": 22, "up": 8, "right": 4}, "look": {"rel": "player", "fwd": -20, "up": 3}, "dur": 6, "fov": 44,
             "text": "No more shepherds. What came out of the Bio-Preserve runs wild in the city now, and it runs from people."},
        ]},
        {"type": "cutscene", "id": "endHome", "if": "shepherd != smashed", "shots": [
            {"cam": {"rel": "player", "fwd": 14, "up": 4, "right": 9}, "to": {"rel": "player", "fwd": 22, "up": 8, "right": 4}, "look": {"rel": "player", "fwd": -20, "up": 3}, "dur": 6, "fov": 44,
             "text": "One last tone went out from Hyde St. By morning the herds were walking west, home to the Presidio."},
        ]},
    ],
}

coda = {
    "place": {"@": "summit", "mode": "walk"},
    "shots": [
        {"cam": [-2258, 106.9, -411], "to": [-2254, 108.5, -410], "look": [-2573, 106, -430], "lookTo": [-2573, 104, -432], "dur": 5, "fov": 36,
         "where": {"name": "The Presidio", "sub": "Day 49 after Erebus"}},
        {"cam": [-2258, 108, -411], "look": [-2573, 104, -432], "dur": 5.5, "fov": 30, "sub": ["Warden", "Enclosure B. Seal failure. Enclosure B. Seal failure."]},
        {"cam": [-2256, 109, -410], "to": [-2250, 112, -409], "look": [-2573, 108, -432], "dur": 5, "fov": 26, "text": "Something in the crater is waking up."},
    ],
}

world = dict(old)
world["tagline"] = "Forty-one days after Erebus. One rider, one horse, a city gone wild. Find them."
world["cast"] = cast
world["places"] = places
world["acts"] = [
    {"id": "act1", "name": "ACT I · THE CALL", "order": ["M1", "M2"],
     "end": {"title": "END OF ACT I", "heading": "The Call", "quote": {"text": "Alive. Both of them.", "by": "Cal Mercer"}, "next": {"kicker": "ACT II", "text": "The Shepherd"}}},
    {"id": "act2", "name": "ACT II · THE SHEPHERD", "order": ["M3", "M4"],
     "end": {"title": "END OF ACT II", "heading": "The Shepherd", "quote": {"text": "I opened every gate.", "by": "Hollis"}, "next": {"kicker": "ACT III", "text": "Home"}}},
    {"id": "act3", "name": "ACT III · HOME", "order": ["M5", "M6"],
     "end": {"title": "THE END", "heading": "SF 2040", "quote": {"text": "Ranger knew the way home before I did.", "by": "Cal Mercer"}}},
]
world["missions"] = [M1, M2, M3, M4, M5, M6]
world["coda"] = coda
# (the opening's Hollis behind him among the tents, so his close-ups have the camp behind him too)
world["opening"] = dict(old["opening"]); world["opening"]["stage"] = [{"who": "Hollis", "at": {"rel": "player", "right": 1.2, "fwd": -2.4}}]
# (the opening: the same shots, Hollis's last word and the title kept; the bat is handed over in Mission 1)
out = json.dumps(world, indent=1, ensure_ascii=False)
open(PACK, 'w').write(out + "\n")
print('wrote', PACK, len(out), 'bytes', sum(len(m['steps']) for m in world['missions']), 'steps')
