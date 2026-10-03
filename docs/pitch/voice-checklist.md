# Voice for the coach: manual checklist

The voice features use the browser's own speech tools (the Web Speech API). They need no key and
no server, but what they can do depends on the browser and the device, and a computer cannot
check that from the outside. This is the checklist to run on the real demo devices, and the honest
record of what has and has not been checked.

## What the app does

- **Listen** under each coach answer reads it aloud with an installed voice for the answer's
  language (the language is taken from the answer's script; the app language breaks a tie). The
  button is **hidden** when no voice for that language is installed, so there is never a dead button.
- **Microphone** in the text box turns speech into text in the app's language (`bn-BD` or `en-US`).
  The words land in the box for you to read and send; nothing is sent automatically. The button is
  hidden when the browser has no speech recognition.
- A line under the box says voice input uses the browser's speech service, which may send the voice
  to its maker (Chrome and Edge do this). Answers are read aloud on the device.

## Checked by a computer (automatic)

- 14 unit tests: voice choice (exact locale first, then the same language, device voice over online,
  none found), turning an answer into speakable text (taka amounts said as words, markdown removed,
  sentence-sized pieces never above 180 characters), and recognition error messages.
- A browser run with **fake** speech APIs injected (16 checks): Listen offered only where a voice for
  the answer's language exists, the right voice and language used, amounts spoken as "taka", list marks
  not read out, the spoken question filling the box without being sent, the privacy note shown, no
  buttons at all when nothing is supported, and a blocked microphone explained in plain words.
  This tests the app's logic, not the real engines.

## Checked on a real browser so far

| Device and browser | Finding |
|---|---|
| Windows 11, Chrome 154 (the development machine) | Speech synthesis and speech recognition exist. **Installed voices: three English (US) voices, no Bangla voice.** So Listen appears for English answers and not for Bangla ones on this machine. Audio output and real recognition were not exercised. |

## To run before the pitch

Tick each box on the device you will demo on, with a Bangla and an English answer in the chat.

**Android phone, Chrome** (the most likely demo device)
- [ ] Open the coach, ask a question in English. Listen appears under the answer; tap it; you hear it; tap Stop; it stops.
- [ ] Same with a Bangla answer. Does Listen appear (is a Bangla voice installed)? Is the speech understandable? ("Google Speech Services" must be up to date.)
- [ ] Tap the microphone, allow the permission, say "can I afford five thousand taka for a phone". The words appear in the box.
- [ ] Switch the app to Bangla, tap the microphone, say a short Bangla question. Record how well it was understood: ______
- [ ] Deny the microphone permission: the message about the blocked microphone appears.
- [ ] Airplane mode: the microphone says it needs an internet connection.

**Desktop Chrome** (the laptop you present from)
- [ ] Listen on an English answer works with sound through the speakers you will use.
- [ ] The microphone works with the room microphone, in English.
- [ ] Note which Bangla voices are installed (open `chrome://settings/accessibility` or the system language settings): ______

**Optional**
- [ ] iPhone Safari: Listen works for English; note whether the microphone appears.
- [ ] Desktop Edge.

## Known limits

- **Bangla recognition quality varies a lot** by browser and device and may be poor or absent. English recognition is the reliable demo path. Do not stake the demo on Bangla voice input.
- **Bangla voices are not on every device.** Android with Google's speech engine usually has one; a Windows desktop often does not. When there is none, Listen is hidden for Bangla answers.
- **Voice input is not private in the way typing is:** Chrome and Edge send the audio to their speech service. The app says so under the text box.
- **No cloud voice service is used** (such as ElevenLabs or Google Cloud text-to-speech). A cloud voice would sound better and cover Bangla everywhere, but it needs a key kept on a server, costs money per character, sends every answer to a third party, and does not work offline. It is a sensible later upgrade for Bangla only.

## Phase 10: server voice and voice commands

The header **Voice commands** button (any screen) and the coach microphone and Listen now also work
where the browser has no speech tools, by sending a short recording or the answer text to OpenAI
(after a one-time consent). Checked by a computer on a production build with synthesized English and
Bangla audio: transcription, every command type, the server Listen path, consent, audit entries
(no spoken words), and accessibility. **Not checked: a real human voice, and real devices.** Run
these on the demo devices:

- [ ] Brave desktop: coach microphone records and transcribes (no "network" error); Bangla and English.
- [ ] Firefox: microphone button present, records, transcribes.
- [ ] Android Chrome: say "add 500 taka for tea"; the card shows 500, Food, today; Confirm saves; Undo removes.
- [ ] Say the same in Bangla ("আজ চায়ে ৫০ টাকা খরচ করেছি"); the amount on the card is 50.
- [ ] "Remove my last payment" lists candidates; nothing is deleted until one is picked and confirmed.
- [ ] "Set a food budget of 4000", "save 30000 for a car", "add 500 to my laptop goal".
- [ ] "Can I afford a 5000 taka phone" opens the coach with the question answered.
- [ ] On a device with no Bangla voice, Listen on a Bangla answer asks for consent, then plays.
- [ ] Say a wrong or noisy number: the card must never show an amount you did not say.
