// The public render views, shared by the API (`publication.ts` re-exports
// them) and the plain-Node backup scripts (Q09 #194), so the two cannot
// drift. Plain JavaScript because the scripts run without a TypeScript
// step; types are in render-kinds.d.mts.

/**
 * Every view a new publication uploads, in capture order. The sleeves are
 * named like the render panels: `view_left` is seen from −x, so it shows
 * the wearer's right sleeve (#179).
 */
export const PUBLIC_RENDER_KINDS = ['view_front', 'view_three_quarter', 'view_back', 'view_left', 'view_right']

/**
 * The views every live publication has. Versions published before the
 * sleeve views (#179) have only these, and stay public.
 */
export const BASE_PUBLIC_RENDER_KINDS = ['view_front', 'view_three_quarter', 'view_back']
