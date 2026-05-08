import { useState, useRef, useEffect, useCallback } from 'react'
import { uploadRecording } from '../../api'

const STATES = {
  IDLE: 'idle',
  RECORDING: 'recording',
  UPLOADING: 'uploading',
  PROCESSING: 'processing',
  DONE: 'done',
  ERROR: 'error',
}

export default function RecordingWidget({ leadId, onRecordingComplete }) {
  const [state, setState] = useState(STATES.IDLE)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState(null)
  const [volumeLevel, setVolumeLevel] = useState(0)

  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const streamRef = useRef(null)
  const timerRef = useRef(null)
  const analyserRef = useRef(null)
  const animFrameRef = useRef(null)
  const audioCtxRef = useRef(null)
  const fileInputRef = useRef(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllMedia()
    }
  }, [])

  const stopAllMedia = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
  }, [])

  const startRecording = async () => {
    setError(null)
    chunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 48000
        }
      })
      streamRef.current = stream

      // Set up audio analysis for volume meter
      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      // Start volume monitoring
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const updateVolume = () => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray)
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
          setVolumeLevel(avg / 255)
          animFrameRef.current = requestAnimationFrame(updateVolume)
        }
      }
      updateVolume()

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      })
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = async () => {
        // Create audio blob from chunks
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        await handleUpload(blob)
      }

      mediaRecorder.start(1000) // Collect data every second
      setState(STATES.RECORDING)
      setElapsed(0)

      // Start elapsed timer
      timerRef.current = setInterval(() => {
        setElapsed(prev => prev + 1)
      }, 1000)

    } catch (err) {
      console.error('Failed to start recording:', err)
      setError(err.message === 'Permission denied' || err.name === 'NotAllowedError'
        ? 'Microphone permission denied. Please allow microphone access.'
        : `Failed to start recording: ${err.message}`)
      setState(STATES.ERROR)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    if (timerRef.current) clearInterval(timerRef.current)
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
    }
    setState(STATES.UPLOADING)
  }

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.onstop = null // Prevent upload
      mediaRecorderRef.current.stop()
    }
    stopAllMedia()
    chunksRef.current = []
    setState(STATES.IDLE)
    setElapsed(0)
    setVolumeLevel(0)
  }

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so same file can be re-selected
    e.target.value = ''
    setError(null)
    setState(STATES.UPLOADING)
    try {
      const result = await uploadRecording(leadId, file, file.name)
      setState(STATES.PROCESSING)
      pollForCompletion(result.data.id)
    } catch (err) {
      console.error('Upload failed:', err)
      setError(`Upload failed: ${err.message}`)
      setState(STATES.ERROR)
    }
  }

  const handleUpload = async (blob) => {
    setState(STATES.UPLOADING)
    try {
      const result = await uploadRecording(leadId, blob)
      setState(STATES.PROCESSING)

      // Poll for completion
      pollForCompletion(result.data.id)
    } catch (err) {
      console.error('Upload failed:', err)
      setError(`Upload failed: ${err.message}`)
      setState(STATES.ERROR)
    }
  }

  const pollForCompletion = async (recordingId) => {
    const API_BASE = import.meta.env.PROD ? '/api' : 'http://localhost:3001/api'
    let attempts = 0
    const maxAttempts = 120 // 2 minutes at 1s intervals

    const check = async () => {
      attempts++
      try {
        const response = await fetch(`${API_BASE}/recordings/${recordingId}`)
        const data = await response.json()
        const recording = data.data

        if (recording.status === 'complete') {
          setState(STATES.DONE)
          if (onRecordingComplete) onRecordingComplete(recording)
          return
        }

        if (recording.status === 'error') {
          setError(recording.error_message || 'Processing failed')
          setState(STATES.ERROR)
          return
        }

        if (attempts < maxAttempts) {
          setTimeout(check, 1000)
        } else {
          setError('Processing timed out. The recording may still be processing in the background.')
          setState(STATES.ERROR)
        }
      } catch (err) {
        if (attempts < maxAttempts) {
          setTimeout(check, 2000)
        } else {
          setError('Failed to check processing status')
          setState(STATES.ERROR)
        }
      }
    }

    check()
  }

  const resetWidget = () => {
    stopAllMedia()
    setState(STATES.IDLE)
    setElapsed(0)
    setError(null)
    setVolumeLevel(0)
    chunksRef.current = []
  }

  const formatTime = (seconds) => {
    const min = Math.floor(seconds / 60)
    const sec = seconds % 60
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div style={{
      background: 'var(--bg-tertiary)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-lg)',
      marginBottom: 'var(--space-lg)'
    }}>
      <h4 style={{
        fontSize: '13px',
        fontWeight: 600,
        color: 'var(--text-secondary)',
        textTransform: 'uppercase',
        marginBottom: 'var(--space-md)'
      }}>
        Call Recording
      </h4>

      {/* IDLE STATE */}
      {state === STATES.IDLE && (
        <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
          <button
            className="btn"
            onClick={startRecording}
            style={{
              background: 'var(--color-error)',
              color: 'white',
              flex: 1,
              justifyContent: 'center',
              padding: 'var(--space-md) var(--space-lg)',
              fontSize: '15px',
              fontWeight: 600
            }}
          >
            Start Recording
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            style={{
              justifyContent: 'center',
              padding: 'var(--space-md) var(--space-lg)',
              fontSize: '13px',
              fontWeight: 500
            }}
          >
            Upload File
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".m4a,.webm,.wav,.mp3,.ogg,audio/*"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {/* RECORDING STATE */}
      {state === STATES.RECORDING && (
        <div>
          {/* Recording indicator */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-md)',
            marginBottom: 'var(--space-md)'
          }}>
            {/* Pulsing red dot */}
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: 'var(--color-error)',
              animation: 'pulse 1.5s infinite'
            }} />
            <span style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              {formatTime(elapsed)}
            </span>
            <span style={{ color: 'var(--color-error)', fontWeight: 500, fontSize: '13px' }}>
              Recording...
            </span>
          </div>

          {/* Volume meter */}
          <div style={{
            height: '8px',
            background: 'var(--bg-primary)',
            borderRadius: 'var(--radius-full)',
            marginBottom: 'var(--space-lg)',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${Math.min(volumeLevel * 100 * 2, 100)}%`,
              background: volumeLevel > 0.5 ? 'var(--color-error)' : volumeLevel > 0.2 ? 'var(--color-warning)' : 'var(--color-success)',
              borderRadius: 'var(--radius-full)',
              transition: 'width 0.1s ease'
            }} />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <button
              className="btn"
              onClick={stopRecording}
              style={{
                background: 'var(--color-error)',
                color: 'white',
                flex: 1,
                justifyContent: 'center',
                fontWeight: 600
              }}
            >
              Stop Recording
            </button>
            <button
              className="btn btn-secondary"
              onClick={cancelRecording}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* UPLOADING STATE */}
      {state === STATES.UPLOADING && (
        <div style={{ textAlign: 'center', padding: 'var(--space-lg)' }}>
          <div style={{ color: 'var(--color-info)', marginBottom: 'var(--space-sm)', fontWeight: 500 }}>
            Uploading recording...
          </div>
          <div style={{
            height: '4px',
            background: 'var(--bg-primary)',
            borderRadius: 'var(--radius-full)',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: '60%',
              background: 'var(--color-info)',
              borderRadius: 'var(--radius-full)',
              animation: 'progress-indeterminate 1.5s infinite'
            }} />
          </div>
        </div>
      )}

      {/* PROCESSING STATE */}
      {state === STATES.PROCESSING && (
        <div style={{ textAlign: 'center', padding: 'var(--space-lg)' }}>
          <div style={{ color: 'var(--accent-primary)', marginBottom: 'var(--space-sm)', fontWeight: 500 }}>
            Processing... Transcribing & analyzing
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            This may take 30-60 seconds depending on call length
          </div>
          <div style={{
            height: '4px',
            background: 'var(--bg-primary)',
            borderRadius: 'var(--radius-full)',
            overflow: 'hidden',
            marginTop: 'var(--space-md)'
          }}>
            <div style={{
              height: '100%',
              width: '80%',
              background: 'var(--accent-primary)',
              borderRadius: 'var(--radius-full)',
              animation: 'progress-indeterminate 2s infinite'
            }} />
          </div>
        </div>
      )}

      {/* DONE STATE */}
      {state === STATES.DONE && (
        <div style={{ textAlign: 'center', padding: 'var(--space-lg)' }}>
          <div style={{ color: 'var(--color-success)', marginBottom: 'var(--space-md)', fontWeight: 600 }}>
            Recording complete! Transcript & analysis ready.
          </div>
          <button className="btn btn-secondary" onClick={resetWidget}>
            Record Another Call
          </button>
        </div>
      )}

      {/* ERROR STATE */}
      {state === STATES.ERROR && (
        <div>
          <div style={{
            color: 'var(--color-error)',
            background: 'rgba(239, 68, 68, 0.1)',
            padding: 'var(--space-md)',
            borderRadius: 'var(--radius-md)',
            fontSize: '13px',
            marginBottom: 'var(--space-md)'
          }}>
            {error}
          </div>
          <button className="btn btn-secondary" onClick={resetWidget}>
            Try Again
          </button>
        </div>
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes progress-indeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  )
}
