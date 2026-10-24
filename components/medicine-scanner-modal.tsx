'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Camera, Check, Edit2, ImagePlus, LoaderCircle, ScanLine, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const PACKAGING_NOISE = [
  'schedule',
  'prescription',
  'caution',
  'warning',
  'storage',
  'store in a cool',
  'keep out of reach',
  'manufactured by',
  'marketed by',
  'mfg lic',
  'batch no',
  'b.no',
  'exp date',
  'm.r.p',
  'inclusive of all taxes',
  'dosage',
  'as directed by',
  'physician',
  'registered trademark',
  'pvt ltd',
  'laboratories',
  'pharma',
]

const MEDICINE_MARKERS = /\b(?:tablets?|capsules?|syrup|injection|gel|cream|mg|mcg|ml|sr|pr|forte|plus|cv|dsr)\b/i
const PACKAGING_NOISE_PATTERN = new RegExp(
  PACKAGING_NOISE.map((noise) => noise.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'ig',
)

export function extractMedicineCandidates(rawText: string): string[] {
  const candidates = new Map<string, { text: string; score: number }>()
  const phrases = rawText
    .replace(/\r/g, '\n')
    .split(/[\n,;|]+/)
    .map((phrase) => phrase
      .replace(/[^\p{L}\p{N}.+()/-]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter((phrase) => phrase.length >= 4 && phrase.length <= 90)

  for (const phrase of phrases) {
    const normalized = phrase.toLowerCase()
    const hasPackagingNoise = PACKAGING_NOISE.some((noise) => normalized.includes(noise))
    if (hasPackagingNoise && !MEDICINE_MARKERS.test(phrase)) continue
    const cleanedPhrase = phrase.replace(PACKAGING_NOISE_PATTERN, ' ').replace(/\s+/g, ' ').trim()
    const words = cleanedPhrase.match(/[\p{L}\p{N}]+(?:[.+/-][\p{L}\p{N}]+)*/gu) ?? []
    if (words.length === 0) continue
    const looksLikeMedicine = MEDICINE_MARKERS.test(cleanedPhrase)
    const cleanBrand = words.some((word) => /^[A-Z][a-zA-Z]{3,}$/.test(word))
    if (!looksLikeMedicine && !cleanBrand) continue

    const text = cleanedPhrase.slice(0, 64)
    const key = text.toLowerCase()
    const score = (looksLikeMedicine ? 10 : 0)
      + (words.length >= 2 ? 3 : 0)
      + Math.min(words.length, 6)
      - Math.max(0, words.length - 9)
    const current = candidates.get(key)
    if (!current || score > current.score) candidates.set(key, { text, score })
  }

  return [...candidates.values()]
    .sort((a, b) => b.score - a.score || a.text.length - b.text.length)
    .slice(0, 6)
    .map(({ text }) => text)
}

type BarcodeDetectorLike = {
  detect: (source: HTMLCanvasElement) => Promise<Array<{ rawValue: string; format: string }>>
}

type BarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): BarcodeDetectorLike
  getSupportedFormats?: () => Promise<string[]>
}

type BarcodeWindow = Window & {
  BarcodeDetector?: BarcodeDetectorConstructor
}

type MedicineScannerModalProps = {
  onClose: () => void
  onSelect: (candidate: string) => void
}

function preprocessImage(source: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement('canvas')
  const scale = Math.min(1, 1200 / width)
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Your browser could not prepare the image for scanning.')

  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = image.data
  for (let index = 0; index < pixels.length; index += 4) {
    const gray = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114
    const contrast = Math.max(0, Math.min(255, (gray - 128) * 1.16 + 128))
    pixels[index] = contrast
    pixels[index + 1] = contrast
    pixels[index + 2] = contrast
  }
  context.putImageData(image, 0, 0)
  return canvas
}

export function MedicineScannerModal({ onClose, onSelect }: MedicineScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const isMountedRef = useRef(false)
  const [isCameraActive, setIsCameraActive] = useState(false)
  const [isCameraStarting, setIsCameraStarting] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [candidates, setCandidates] = useState<string[]>([])
  const [barcode, setBarcode] = useState<string | null>(null)
  const [editingCandidate, setEditingCandidate] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setIsCameraActive(false)
  }

  function openNativeCamera() {
    stopCamera()
    cameraInputRef.current?.click()
  }

  useEffect(() => {
    const video = videoRef.current
    const stream = streamRef.current
    if (isCameraActive && video && stream) {
      video.srcObject = stream
      void video.play().catch((cameraFailure: unknown) => {
        console.error('Unable to start the medicine scanner preview:', cameraFailure)
        openNativeCamera()
      })
    }
  }, [isCameraActive])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      openNativeCamera()
      return
    }

    setIsCameraStarting(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      if (!isMountedRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      setIsCameraActive(true)
    } catch (cameraFailure) {
      console.error('Unable to open medicine scanner camera:', cameraFailure)
      openNativeCamera()
    } finally {
      setIsCameraStarting(false)
    }
  }

  async function scanImage(source: CanvasImageSource, width: number, height: number) {
    setIsScanning(true)
    setProgress(0)
    setError(null)
    setCandidates([])
    setBarcode(null)

    try {
      const canvas = preprocessImage(source, width, height)
      const barcodeApi = window as BarcodeWindow
      const BarcodeDetector = barcodeApi.BarcodeDetector
      const barcodeTask = BarcodeDetector
        ? (async () => {
          try {
            const wantedFormats = ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e']
            const supportedFormats = BarcodeDetector.getSupportedFormats
              ? await BarcodeDetector.getSupportedFormats()
              : wantedFormats.slice(0, 3)
            const formats = wantedFormats.filter((format) => supportedFormats.includes(format))
            if (formats.length === 0) return
            const detector = new BarcodeDetector({ formats })
            const matches = await detector.detect(canvas)
            if (matches[0]?.rawValue) setBarcode(`${matches[0].format.toUpperCase()}: ${matches[0].rawValue}`)
          } catch (barcodeFailure) {
            console.warn('Native barcode scan was unavailable for this image:', barcodeFailure)
          }
        })()
        : Promise.resolve()

      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng', 1, {
        logger: ({ progress: workerProgress }) => setProgress(Math.round(workerProgress * 100)),
      })
      let recognizedText = ''
      try {
        const [result] = await Promise.all([worker.recognize(canvas), barcodeTask])
        recognizedText = result.data.text
      } finally {
        await worker.terminate()
      }
      const found = extractMedicineCandidates(recognizedText)
      setCandidates(found)
      if (found.length === 1) chooseCandidate(found[0])
      if (found.length === 0) setError('No medicine name was clear enough to read. Try another photo or edit the text and search.')
    } catch (scanFailure) {
      console.error('Unable to scan medicine image:', scanFailure)
      setError('We could not read this image. Please try a clearer photo or use search.')
    } finally {
      setIsScanning(false)
    }
  }

  async function captureStrip() {
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError('Wait for the camera preview before capturing the strip.')
      return
    }
    await scanImage(video, video.videoWidth, video.videoHeight)
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    stopCamera()
    setIsScanning(true)
    const image = new Image()
    const imageUrl = URL.createObjectURL(file)
    image.onload = async () => {
      try {
        await scanImage(image, image.naturalWidth, image.naturalHeight)
      } finally {
        URL.revokeObjectURL(imageUrl)
      }
    }
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl)
      setIsScanning(false)
      setError('This image could not be opened. Please choose another photo.')
    }
    image.src = imageUrl
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    void uploadImage(event)
  }

  function chooseCandidate(candidate: string) {
    stopCamera()
    onSelect(candidate)
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isScanning && !isCameraStarting) onClose()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !isScanning && !isCameraStarting) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="medicine-scanner-title"
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-950 p-4 text-white shadow-2xl sm:rounded-3xl sm:p-5"
      >
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="medicine-scanner-title" className="text-lg font-bold">Scan a medicine strip</h2>
            <p className="mt-1 text-xs text-slate-400">On-device scan. Your photo stays on this device.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isScanning || isCameraStarting}
            aria-label="Close medicine scanner"
            className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-50"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>

        <div className="relative overflow-hidden rounded-2xl border border-emerald-400/50 bg-slate-900">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={cn('aspect-[4/3] w-full object-cover', isCameraActive ? 'block' : 'hidden')}
          />
          {isCameraActive ? (
            <div className="pointer-events-none absolute inset-5 rounded-2xl border-2 border-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.35)]">
              <span className="absolute -left-0.5 -top-0.5 size-5 rounded-tl-xl border-l-4 border-t-4 border-emerald-300" />
              <span className="absolute -right-0.5 -top-0.5 size-5 rounded-tr-xl border-r-4 border-t-4 border-emerald-300" />
              <span className="absolute -bottom-0.5 -left-0.5 size-5 rounded-bl-xl border-b-4 border-l-4 border-emerald-300" />
              <span className="absolute -bottom-0.5 -right-0.5 size-5 rounded-br-xl border-b-4 border-r-4 border-emerald-300" />
            </div>
          ) : (
            <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 px-6 text-center">
              <ScanLine className="size-10 text-emerald-400" aria-hidden="true" />
              <p className="text-sm text-slate-300">Center the medicine name inside the viewfinder</p>
            </div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {!isCameraActive ? (
            <button
              type="button"
              onClick={() => void startCamera()}
              disabled={isCameraStarting || isScanning}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-3 text-sm font-bold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
            >
              {isCameraStarting ? <LoaderCircle className="size-4 animate-spin" /> : <Camera className="size-4" aria-hidden="true" />}
              {isCameraStarting ? 'Opening camera…' : 'Open camera'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void captureStrip()}
              disabled={isScanning}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-3 text-sm font-bold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
            >
              {isScanning ? <LoaderCircle className="size-4 animate-spin" /> : <ScanLine className="size-4" aria-hidden="true" />}
              Capture Strip
            </button>
          )}
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={isScanning || isCameraStarting}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-60"
          >
            <ImagePlus className="size-4 text-emerald-300" aria-hidden="true" />
            Upload from Gallery
          </button>
        </div>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
        />

        {isScanning && (
          <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-950/30 p-3" role="status" aria-live="polite">
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-emerald-200">
              <span>Reading medicine strip...</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-emerald-400 transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {barcode && <p className="mt-3 break-all rounded-xl bg-slate-900 px-3 py-2 text-xs text-slate-300">Barcode detected: {barcode}</p>}
        {error && <p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-950/20 px-3 py-2 text-xs text-amber-200" role="alert">{error}</p>}

        {candidates.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-200">Medicine names found</h3>
            <ul className="space-y-2">
              {candidates.map((candidate, index) => (
                <li key={`${candidate}-${index}`} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 p-2">
                  {editingCandidate === index ? (
                    <input
                      autoFocus
                      value={candidate}
                      onChange={(event) => setCandidates((current) => current.map((value, candidateIndex) => (
                        candidateIndex === index ? event.target.value : value
                      )))}
                      aria-label={`Edit detected medicine name ${index + 1}`}
                      className="h-9 min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 text-sm outline-none focus:border-emerald-400"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => chooseCandidate(candidate)}
                      className="min-h-9 min-w-0 flex-1 truncate px-1 text-left text-sm font-medium text-white hover:text-emerald-300"
                    >
                      {candidate}
                    </button>
                  )}
                  {editingCandidate === index ? (
                    <button
                      type="button"
                      onClick={() => chooseCandidate(candidate)}
                      disabled={!candidate.trim()}
                      aria-label={`Search for ${candidate}`}
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400 text-slate-950 hover:bg-emerald-300 disabled:opacity-50"
                    >
                      <Search className="size-4" aria-hidden="true" />
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditingCandidate(index)}
                        aria-label={`Edit ${candidate}`}
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-emerald-300"
                      >
                        <Edit2 className="size-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => chooseCandidate(candidate)}
                        aria-label={`Search for ${candidate}`}
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                      >
                        <Check className="size-4" aria-hidden="true" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-slate-500">Tap a medicine name to search, or edit it first with the pencil.</p>
          </div>
        )}
      </section>
    </div>
  )
}
