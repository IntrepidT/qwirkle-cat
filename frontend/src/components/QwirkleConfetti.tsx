import { useEffect, useRef } from 'react'

interface Props {
  qwirkles: number  // how many qwirkles just fired (1+ triggers the effect)
  onDone: () => void
}

const COLORS = ['#f59e0b', '#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#fb923c', '#facc15', '#ffffff']
const PARTICLE_COUNT = 120
const DURATION_MS = 2200

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  r: number          // radius
  color: string
  rotation: number
  rotationSpeed: number
  opacity: number
  shape: 'rect' | 'circle' | 'diamond'
}

function makeParticles(w: number, h: number, count: number): Particle[] {
  const cx = w / 2
  const cy = h / 2
  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2
    const speed = 4 + Math.random() * 10
    const shape = (['rect', 'circle', 'diamond'] as const)[Math.floor(Math.random() * 3)]
    return {
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 6,  // bias upward
      r: 5 + Math.random() * 7,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.3,
      opacity: 1,
      shape,
    }
  })
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle) {
  ctx.save()
  ctx.globalAlpha = p.opacity
  ctx.fillStyle = p.color
  ctx.translate(p.x, p.y)
  ctx.rotate(p.rotation)

  if (p.shape === 'circle') {
    ctx.beginPath()
    ctx.arc(0, 0, p.r, 0, Math.PI * 2)
    ctx.fill()
  } else if (p.shape === 'rect') {
    ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r)
  } else {
    // diamond
    ctx.beginPath()
    ctx.moveTo(0, -p.r)
    ctx.lineTo(p.r, 0)
    ctx.lineTo(0, p.r)
    ctx.lineTo(-p.r, 0)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

export default function QwirkleConfetti({ qwirkles, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (qwirkles === 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width = canvas.offsetWidth
    const h = canvas.height = canvas.offsetHeight

    // fire multiple bursts for multiple qwirkles, staggered slightly
    const allParticles: Particle[] = []
    for (let q = 0; q < qwirkles; q++) {
      // offset burst origin slightly per qwirkle
      const extra = makeParticles(w, h, PARTICLE_COUNT)
      extra.forEach(p => {
        p.x += (Math.random() - 0.5) * 120 * q
        p.y += (Math.random() - 0.5) * 80 * q
      })
      allParticles.push(...extra)
    }

    const start = performance.now()

    const tick = (now: number) => {
      const elapsed = now - start
      const progress = elapsed / DURATION_MS

      ctx.clearRect(0, 0, w, h)

      let anyAlive = false
      for (const p of allParticles) {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.35          // gravity
        p.vx *= 0.98          // air resistance
        p.rotation += p.rotationSpeed
        p.opacity = Math.max(0, 1 - progress * 1.4)
        if (p.opacity > 0) {
          anyAlive = true
          drawParticle(ctx, p)
        }
      }

      if (anyAlive && elapsed < DURATION_MS + 400) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        ctx.clearRect(0, 0, w, h)
        onDone()
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [qwirkles]) // re-fires each time qwirkles changes to a non-zero value

  // The "QWIRKLE!" text banner
  const showBanner = qwirkles > 0

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      {showBanner && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ animation: 'qwirkle-banner 2.2s ease-out forwards' }}
        >
          <div
            className="text-6xl font-black tracking-widest select-none"
            style={{
              background: 'linear-gradient(135deg, #f59e0b, #ef4444, #a855f7, #3b82f6)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: 'none',
              filter: 'drop-shadow(0 0 24px rgba(245,158,11,0.8))',
              animation: 'qwirkle-text 2.2s cubic-bezier(0.34,1.56,0.64,1) forwards',
            }}
          >
            {qwirkles > 1 ? `${qwirkles}× QWIRKLE!` : 'QWIRKLE!'}
          </div>
        </div>
      )}
      <style>{`
        @keyframes qwirkle-text {
          0%   { opacity: 0; transform: scale(0.3) rotate(-8deg); }
          15%  { opacity: 1; transform: scale(1.15) rotate(2deg); }
          30%  { transform: scale(0.95) rotate(-1deg); }
          45%  { transform: scale(1.05) rotate(0deg); }
          70%  { opacity: 1; transform: scale(1) rotate(0deg); }
          100% { opacity: 0; transform: scale(0.8) translateY(-40px); }
        }
        @keyframes qwirkle-banner {
          0%   { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
