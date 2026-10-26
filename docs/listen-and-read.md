# Listen and read

`#/read` lists the narrated chapters and `#/ch/N/read` opens one. The reader plays the chapter's narration and highlights each word as it's spoken, modeled on Microsoft Immersive Reader:

- **Text preferences:** text size, increased spacing, font (sans, serif, rounded) and eight page colors.
- **Grammar options:** syllables, with nouns, verbs, adjectives and adverbs colored, plus optional labels.
- **Reading preferences:**
  - Line focus (1, 3 or 5 lines).
  - Dictionary: select a word to see its chapter flashcard or a dictionary definition, hear it, or read from there.
  - Translate, by word or for the whole document.
  - Reading practice: read a line aloud and get accuracy, words a minute and the missed words.
  - Follow along.
- **Player:** back and forward 10 seconds, a seek bar, speeds from 0.5× to 2×, lock-screen controls, and the place in each chapter saved between visits. On the keyboard, Space plays or pauses, and the arrow keys skip 10 seconds.

Preferences are saved in `scor.reader` and stay on each device, since a phone and a computer suit different sizes. Positions are saved in `scor.reader.pos.N` and go into backups like other progress.

## What depends on the browser

- Translation uses the browser's built-in on-device `Translator`, which Chrome 138 or later on a computer has. Other browsers show a note instead.
- Reading practice uses speech recognition, which works in Safari and Chrome.
- Dictionary definitions for general words come from `api.dictionaryapi.dev`, so they need a connection. Chapter flashcards work offline.
- Audio is streamed and isn't stored for offline use. The text is stored with the rest of the study data.

## Adding a chapter

Export the chapter's Google Doc lines as `STYLE|nest|text`, one per line. For a new narration, `tools/reader/narrate.py` writes the audio and the exact line timing in one pass, using Kokoro with voice `am_michael`, the same pauses, and `prep.py` pronunciation fixes:

```
python3 tools/reader/narrate.py chNN_doc.txt "CCNP SCOR study notes." chNN.wav tools/reader/chNN_timing.json
ffmpeg -i chNN.wav -af "highpass=f=60,loudnorm=I=-16:TP=-1.5:LRA=11" -ar 44100 -ac 1 -b:a 128k -id3v2_version 3 CCNP_SCOR_Chapter_N_Audio_HQ.mp3
```

Then continue from step 2 below. For an existing MP3, such as chapters 1 and 2, start at step 1:

1. `python3 tools/reader/timing.py chNN_doc.txt tools/reader/chNN_timing.json`
   - Re-synthesizes every line with the same voice and pauses, which gives exact line times.
   - Needs `kokoro-onnx` and the `kokoro-v1.0.onnx` / `voices-v1.0.bin` model files in the working directory.
2. `ffmpeg -i CCNP_SCOR_Chapter_N_Audio_HQ.mp3 -ac 1 -ar 44100 -b:a 64k -map_metadata -1 audio/chNN.mp3`
   - Makes the web copy.
3. `python3 tools/reader/build_reader.py N audio/chNN.mp3`
   - Writes `data/reader/chNN.json`: words, word times, syllables and parts of speech.
   - Needs `pyphen`, `nltk` and NLTK's `averaged_perceptron_tagger_eng`.
4. `python3 tools/build_site_data.py`
   - Refreshes `data/reader/index.json` and the offline version.

The time before the first line is the spoken title. `build_reader.py` gets its length from the gap between the MP3's duration and the script's total. Word times inside a line are spread by each word's spoken length.
