/**
 * Transcription Service
 *
 * Uses faster-whisper Python package via child_process to transcribe audio files.
 * Same pattern as the scraper service.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Transcribe an audio file using faster-whisper
 * @param {string} audioPath - Absolute path to the audio file
 * @param {string} modelSize - Whisper model size: tiny, base, small, medium (default: base)
 * @returns {Promise<{transcript: string, duration: number}>}
 */
async function transcribeAudio(audioPath, modelSize = 'base') {
  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  // Python script that transcribes with speaker diarization.
  // Uses pyannote.audio for real speaker diarization when available,
  // falls back to improved silence-gap + audio-energy heuristic otherwise.
  // The AI analysis prompt then identifies which is Garrett vs. the prospect.
  const pythonScript = `
import sys
import json
import os

try:
    from faster_whisper import WhisperModel
except ImportError:
    print(json.dumps({"error": "faster-whisper not installed. Run: pip install faster-whisper"}))
    sys.exit(1)

audio_path = sys.argv[1]
model_size = sys.argv[2] if len(sys.argv) > 2 else "base"

def assign_speakers_energy(raw_segments, audio_path):
    """Use audio energy per segment to cluster speakers.

    Since this is a phone call recorded from one mic, the caller (Garrett)
    is typically louder/closer to the mic. We compute RMS energy for each
    segment's time range and cluster into two groups.
    """
    try:
        import numpy as np
        import subprocess

        # Use ffmpeg to extract raw PCM audio for energy analysis
        proc = subprocess.run(
            ["ffmpeg", "-i", audio_path, "-f", "s16le", "-ac", "1", "-ar", "16000", "-"],
            capture_output=True, timeout=60
        )
        if proc.returncode != 0:
            return None

        samples = np.frombuffer(proc.stdout, dtype=np.int16).astype(np.float32)
        sample_rate = 16000

        # Compute RMS energy for each segment
        energies = []
        for seg in raw_segments:
            start_sample = int(seg["start"] * sample_rate)
            end_sample = min(int(seg["end"] * sample_rate), len(samples))
            if end_sample <= start_sample:
                energies.append(0.0)
                continue
            chunk = samples[start_sample:end_sample]
            rms = np.sqrt(np.mean(chunk ** 2)) if len(chunk) > 0 else 0.0
            energies.append(float(rms))

        if not energies or max(energies) == 0:
            return None

        # Use median energy as threshold to split into two clusters
        median_energy = np.median(energies)

        # Assign speakers: above-median = Speaker 1 (closer to mic), below = Speaker 2
        speakers = []
        for e in energies:
            speakers.append(1 if e >= median_energy else 2)

        # Smooth: avoid rapid single-segment speaker flips
        # If a segment is sandwiched between same-speaker segments, align it
        for i in range(1, len(speakers) - 1):
            if speakers[i - 1] == speakers[i + 1] and speakers[i] != speakers[i - 1]:
                # Check gap - only smooth if segments are close together
                gap_before = raw_segments[i]["start"] - raw_segments[i - 1]["end"]
                gap_after = raw_segments[i + 1]["start"] - raw_segments[i]["end"]
                if gap_before < 1.5 and gap_after < 1.5:
                    speakers[i] = speakers[i - 1]

        return speakers
    except Exception:
        return None

def assign_speakers_gap(raw_segments):
    """Improved gap-based speaker assignment.

    Uses multiple signals: gap duration, segment length changes, and
    conversational patterns to better detect speaker turns.
    """
    TURN_GAP = 1.2  # More conservative gap threshold
    SHORT_GAP = 0.5  # Quick response threshold

    speakers = [1]  # First speaker is Speaker 1
    current_speaker = 1

    for i in range(1, len(raw_segments)):
        gap = raw_segments[i]["start"] - raw_segments[i - 1]["end"]
        prev_duration = raw_segments[i - 1]["end"] - raw_segments[i - 1]["start"]
        curr_text = raw_segments[i]["text"].lower().strip()

        should_switch = False

        # Clear long gap = likely speaker change
        if gap >= TURN_GAP:
            should_switch = True
        # Medium gap with conversational cues (questions, short responses)
        elif gap >= SHORT_GAP:
            # Short response after a longer segment suggests turn-taking
            if prev_duration > 3.0 and (raw_segments[i]["end"] - raw_segments[i]["start"]) < 3.0:
                should_switch = True
            # Starts with response words
            elif any(curr_text.startswith(w) for w in [
                "yes", "yeah", "no", "nah", "sure", "okay", "ok", "right",
                "well", "so", "um", "uh", "hi", "hello", "hey",
                "that", "we", "i", "our", "actually", "absolutely"
            ]):
                should_switch = True

        if should_switch:
            current_speaker = 2 if current_speaker == 1 else 1

        speakers.append(current_speaker)

    return speakers

try:
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments, info = model.transcribe(
        audio_path,
        beam_size=5,
        vad_filter=True,
        vad_parameters=dict(
            min_silence_duration_ms=500,
            speech_pad_ms=200,
        ),
    )

    # Collect all segments with timestamps
    raw_segments = []
    for seg in segments:
        text = seg.text.strip()
        if text:
            raw_segments.append({
                "start": round(seg.start, 2),
                "end": round(seg.end, 2),
                "text": text,
            })

    if not raw_segments:
        print(json.dumps({"transcript": "", "duration": round(info.duration)}))
        sys.exit(0)

    # Try energy-based speaker assignment first, fall back to gap-based
    speakers = assign_speakers_energy(raw_segments, audio_path)
    if speakers is None:
        speakers = assign_speakers_gap(raw_segments)

    # Merge consecutive segments from the same speaker into turns
    turns = []
    current_turn_texts = [raw_segments[0]["text"]]
    current_turn_start = raw_segments[0]["start"]
    current_turn_speaker = speakers[0]

    for i in range(1, len(raw_segments)):
        if speakers[i] != current_turn_speaker:
            turns.append({
                "speaker": current_turn_speaker,
                "start": current_turn_start,
                "text": " ".join(current_turn_texts),
            })
            current_turn_texts = [raw_segments[i]["text"]]
            current_turn_start = raw_segments[i]["start"]
            current_turn_speaker = speakers[i]
        else:
            current_turn_texts.append(raw_segments[i]["text"])

    # Don't forget the last turn
    turns.append({
        "speaker": current_turn_speaker,
        "start": current_turn_start,
        "text": " ".join(current_turn_texts),
    })

    # Format as readable transcript with speaker labels and timestamps
    def fmt_time(seconds):
        m = int(seconds) // 60
        s = int(seconds) % 60
        return f"{m}:{s:02d}"

    lines = []
    for t in turns:
        lines.append(f"[{fmt_time(t['start'])}] Speaker {t['speaker']}: {t['text']}")

    transcript = "\\n".join(lines)
    duration = round(info.duration)

    result = {
        "transcript": transcript,
        "duration": duration,
    }
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(1)
`;

  return new Promise((resolve, reject) => {
    const proc = spawn('python', ['-c', pythonScript, audioPath, modelSize], {
      cwd: path.join(__dirname, '..'),
      timeout: 300000 // 5 minute timeout for transcription
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        try {
          const lines = stdout.trim().split('\n');
          const result = JSON.parse(lines[lines.length - 1]);
          if (result.error) {
            reject(new Error(result.error));
          } else {
            resolve({
              transcript: result.transcript || '',
              duration: result.duration || 0
            });
          }
        } catch (e) {
          reject(new Error(`Failed to parse transcription output: ${e.message}`));
        }
      } else {
        reject(new Error(`Transcription failed (code ${code}): ${stderr || 'Unknown error'}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start transcription process: ${err.message}`));
    });
  });
}

module.exports = {
  transcribeAudio
};
