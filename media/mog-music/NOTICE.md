# Mog Music

**All rights reserved by the owner — not covered by this repository's LICENSE.**

The songs in this folder (`*.mp3`) and their titles in `manifest.json` are the owner's own music, included in the game
with the owner's permission so players can turn on the car radio's Mog Music station. They are NOT open source: the
MIT License in `LICENSE` and the other open terms in `NOTICE` do not apply to them. You may not copy, modify,
redistribute, sample or reuse them outside this game without the owner's written permission. A fork of this
repository must remove this folder (the radio then has no songs to play and stays off).

How they get here: `node tools/mog-music/build.mjs "<folder of mp3s>"` copies each song byte for byte under a safe
name and writes `manifest.json` (file, display title, duration, bitrate, size). The game streams one song at a time
and only after the player turns Mog Music on (`wagmi/radio/radio.js`).
