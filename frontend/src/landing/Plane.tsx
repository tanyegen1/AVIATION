// Top-down airliner silhouette, nose pointing +x, centred on the origin.
export const PLANE_PATH =
  'M46,0 C46,-3.2 42,-5 36,-5 L13,-5 L-10,-34 L-19,-34 L-5,-5 L-29,-5 L-38,-15 L-45,-15 L-39,-3.5 ' +
  'L-44,-2 L-44,2 L-39,3.5 L-45,15 L-38,15 L-29,5 L-5,5 L-19,34 L-10,34 L13,5 L36,5 C42,5 46,3.2 46,0 Z'

export function PlaneShape() {
  return (
    <>
      <path d={PLANE_PATH} />
      <rect x="-4" y="-22.5" width="11" height="5" rx="2.5" />
      <rect x="-4" y="17.5" width="11" height="5" rx="2.5" />
    </>
  )
}

export function PlaneSvg({ size = 48, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="-50 -40 100 80" width={size} height={size * 0.8} className={className} aria-hidden="true" fill="currentColor">
      <PlaneShape />
    </svg>
  )
}
