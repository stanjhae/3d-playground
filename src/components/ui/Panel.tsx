import type { HTMLAttributes } from 'react'

import { cn } from '../../lib/cn'

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn('flv-panel p-4', className)} />
}
