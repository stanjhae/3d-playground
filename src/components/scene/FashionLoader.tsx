import { Html } from '@react-three/drei'

import { HOUSE_COPY } from '../../lib/house-copy'

export function FashionLoader() {
  return (
    <Html center>
      <p className="font-display text-xs tracking-[0.28em] text-ivory-muted uppercase">
        {HOUSE_COPY.lookLoading}
      </p>
    </Html>
  )
}
