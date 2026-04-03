import { useEffect, useRef } from 'react'
import styles from './NetworkConstellation.module.css'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  baseRadius: number
  pulseOffset: number
  opacity: number
  age: number
  lifeSpan: number
}

export function NetworkConstellation() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationId: number
    let particles: Particle[] = []

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      initParticles(rect.width, rect.height)
    }

    const initParticles = (width: number, height: number) => {
      const area = width * height
      const count = Math.min(Math.max(Math.floor(area / 12000), 35), 70)
      particles = []
      for (let i = 0; i < count; i++) {
        particles.push(createParticle(width, height))
      }
    }

    const createParticle = (width: number, height: number): Particle => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      baseRadius: 1.5 + Math.random() * 2,
      pulseOffset: Math.random() * Math.PI * 2,
      opacity: 0.4 + Math.random() * 0.6,
      age: Math.random() * 1000,
      lifeSpan: 600 + Math.random() * 1200,
    })

    const draw = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight

      ctx.clearRect(0, 0, width, height)

      const maxDist = 110
      const time = Date.now() * 0.001

      // 连线
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const p1 = particles[i]
          const p2 = particles[j]
          const dx = p1.x - p2.x
          const dy = p1.y - p2.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < maxDist) {
            const alpha = (1 - dist / maxDist) * 0.45
            ctx.beginPath()
            ctx.strokeStyle = `rgba(106, 214, 229, ${alpha})`
            ctx.lineWidth = 1.2
            ctx.moveTo(p1.x, p1.y)
            ctx.lineTo(p2.x, p2.y)
            ctx.stroke()
          }
        }
      }

      // 粒子
      particles.forEach((p) => {
        p.x += p.vx
        p.y += p.vy
        p.age++

        // 边界环绕
        if (p.x < -10) p.x = width + 10
        if (p.x > width + 10) p.x = -10
        if (p.y < -10) p.y = height + 10
        if (p.y > height + 10) p.y = -10

        // 进化：生命周期结束后重生
        if (p.age > p.lifeSpan) {
          Object.assign(p, createParticle(width, height))
        }

        // 脉冲呼吸效果
        const pulse = Math.sin(time * 2 + p.pulseOffset)
        const radius = p.baseRadius + pulse * 0.6
        const alpha = p.opacity * (0.7 + pulse * 0.3)

        ctx.beginPath()
        ctx.arc(p.x, p.y, Math.max(0.5, radius), 0, Math.PI * 2)
        ctx.fillStyle = `rgba(143, 231, 242, ${Math.max(0.2, alpha)})`
        ctx.shadowColor = 'rgba(143, 231, 242, 0.5)'
        ctx.shadowBlur = 10 + pulse * 4
        ctx.fill()
        ctx.shadowBlur = 0
      })

      animationId = requestAnimationFrame(draw)
    }

    resize()
    draw()

    window.addEventListener('resize', resize)

    return () => {
      cancelAnimationFrame(animationId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <div className={styles.frame} aria-hidden="true">
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  )
}
