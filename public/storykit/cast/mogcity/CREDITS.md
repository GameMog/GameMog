# Mog City's shipped cast: credits

These files are GameMog's Mog City's own people, copied unchanged (the Suits' file renamed `suits.glb`, its clip pack
`suits-clips.glb`) for the Story Kit's cast registry (`../registry.json`, `storykit/cast/README.md`): the creator's browser makes their headshots from them. Mog City plays them from its own files. All of them are
invented people: nobody in them is based on a real person, and no real person's face or voice was used.

| file | what | credit and licence |
|---|---|---|
| `dan.glb`, `jane.glb`, `mrbig.glb`, `gears.glb`, `fiona.glb` | Dan, Jane, Mr. Big, Gears, Fiona | Original characters made for Mog City from [MakeHuman](http://www.makehuman.org)'s base body, clothes and hair (CC0 1.0; Jane and Mr. Big from GameMog's CC0 MakeHuman people pack). Their everyday clips are from the [CMU Graphics Lab Motion Capture Database](http://mocap.cs.cmu.edu) (free for all uses; the data itself may not be resold; created with funding from NSF EIA-0196217). Dan's freeflow fight clips (`ff*`) are Spiderbench's (below). Mr. Big's glasses, Fiona's shades and Gears' heather tee are made in code, in Mog City. |
| `fiona-moves.glb`, `gears-moves.glb` | Fiona's and Gears' standing idles, Fiona's run | Motion data: [Bandai Namco Research Motion Dataset](https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset), (c) 2022 Bandai Namco Research Inc., [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/): non-commercial use only, with this credit. Retargeted to their bodies in Mog City, trimmed to loops, played in place. |
| `suits.glb` | the Suits (Knox, Hooks, Tank, Brick, Dash, Mack, Rook) | The rig and its brawler clips are **Spiderbench**'s by Shikhar, (c) 2026, used with the author's permission and **not** under the MIT License; the men on it are built from MakeHuman's base body, suit, shoes and hair (CC0 1.0). Their glasses and earpieces are made in code and their hands are set in Mog City. |
| `suits-clips.glb` | the Suits' standing, walking and gesture clips | Dan's own clips (above), retargeted onto the Suits' rig in Mog City. |
| `voice/manifest.json` | the list of 462 recorded lines (the recordings are Mog City's and are not served here) (Dan, Jane, Mr. Big, Gears, Fiona, Knox, Mack, Brick, Dash, Ms. Bea, the Camp) | Synthesised with [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) by the Qwen team, Alibaba Cloud (Apache-2.0), each voice designed once from a written description and every line cloned from it, run with [mlx-audio](https://github.com/Blaizzy/mlx-audio) (MIT); Mr. Big's with [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) by hexgrad (Apache-2.0), its stock voice bm_lewis; the Camp's crowd is eight Kokoro-82M stock voices together. The voices are invented and synthetic. |

Moon, the dog (`mogcity/moon`), is built in code in Mog City (`moon.js`, Mog City's own, MIT). The Bandai Namco clips and Spiderbench's parts keep the Story Kit free on gamemog.com: never sold.
