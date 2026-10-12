type Tone = 'white' | 'navy'

export function BrandMark({ tone = 'white', size = 32, className }: { tone?: Tone; size?: number; className?: string }) {
  return (
    <img
      src={`/brand/mark-${tone}.png`}
      alt="RecordBridge"
      height={size}
      style={{ height: size, width: 'auto', display: 'block' }}
      className={className}
      draggable={false}
    />
  )
}

export function BrandWordmark({ tone = 'white', height = 24, className }: { tone?: Tone; height?: number; className?: string }) {
  return (
    <img
      src={`/brand/wordmark-${tone}.png`}
      alt="RecordBridge"
      height={height}
      style={{ height, width: 'auto', display: 'block' }}
      className={className}
      draggable={false}
    />
  )
}
