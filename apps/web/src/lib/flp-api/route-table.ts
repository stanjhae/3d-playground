/**
 * Every `/api/flp` route and what a stranger may see (Q03 #188). Shared by
 * `routes.integration.test.ts` (in process, local Supabase) and
 * `scripts/hosted-check.mjs` (over HTTP, a deployed environment), so a new
 * route is checked in both places once it is added here.
 */

import { TERMS_VERSION } from '../terms.ts'

export type RouteMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export type RouteFixture = { designId: string; assetId: string; slug: string }

export type FlpRoute = {
  method: RouteMethod
  path: (fixture: RouteFixture) => string
  body?: () => unknown
  /**
   * owner: names one owner's design or asset; anyone else gets 404.
   * account: acts on the caller's own account; needs a session.
   * public: readable signed out.
   */
  scope: 'owner' | 'account' | 'public'
}

const key = () => crypto.randomUUID()

/** `document` and `renders` fill the bodies of the routes that write. */
export function flpRoutes({ document, renders }: { document: unknown; renders: unknown }): FlpRoute[] {
  return [
    { method: 'GET', path: () => 'designs', scope: 'account' },
    {
      method: 'POST',
      path: () => 'designs',
      body: () => ({ mutationKey: key(), title: 'Stranger', content: document }),
      scope: 'account',
    },
    { method: 'GET', path: ({ designId }) => `designs/${designId}`, scope: 'owner' },
    { method: 'PATCH', path: ({ designId }) => `designs/${designId}`, body: () => ({ title: 'Taken' }), scope: 'owner' },
    { method: 'DELETE', path: ({ designId }) => `designs/${designId}`, scope: 'owner' },
    { method: 'GET', path: ({ designId }) => `designs/${designId}/versions`, scope: 'owner' },
    {
      method: 'POST',
      path: ({ designId }) => `designs/${designId}/versions`,
      body: () => ({ baseSeq: 1, mutationKey: key(), kind: 'autosave', content: document }),
      scope: 'owner',
    },
    { method: 'GET', path: ({ designId }) => `designs/${designId}/versions/1`, scope: 'owner' },
    {
      method: 'POST',
      path: ({ designId }) => `designs/${designId}/restore`,
      body: () => ({ baseSeq: 1, mutationKey: key(), fromSeq: 1 }),
      scope: 'owner',
    },
    {
      method: 'POST',
      path: ({ designId }) => `designs/${designId}/renders`,
      body: () => ({ seq: 1, renders }),
      scope: 'owner',
    },
    { method: 'GET', path: ({ designId }) => `designs/${designId}/publication`, scope: 'owner' },
    { method: 'POST', path: ({ designId }) => `designs/${designId}/publication`, body: () => ({ seq: 1 }), scope: 'owner' },
    { method: 'DELETE', path: ({ designId }) => `designs/${designId}/publication`, scope: 'owner' },
    { method: 'POST', path: () => 'assets', scope: 'account' },
    { method: 'GET', path: ({ assetId }) => `assets/${assetId}`, scope: 'owner' },
    { method: 'POST', path: ({ assetId }) => `assets/${assetId}/finalize`, scope: 'owner' },
    { method: 'GET', path: () => `pattern-meshes?hash=sha256:${'0'.repeat(64)}&solver=1`, scope: 'account' },
    { method: 'POST', path: () => 'pattern-meshes', body: () => ({ patternHash: `sha256:${'0'.repeat(64)}`, solverVersion: 1 }), scope: 'account' },
    {
      method: 'POST',
      path: () => 'pattern-meshes/finalize',
      body: () => ({ patternHash: `sha256:${'0'.repeat(64)}`, solverVersion: 1 }),
      scope: 'account',
    },
    { method: 'GET', path: () => 'profile', scope: 'account' },
    { method: 'POST', path: () => 'profile', body: () => ({ displayName: 'Stranger' }), scope: 'account' },
    { method: 'POST', path: () => 'terms', body: () => ({ version: TERMS_VERSION }), scope: 'account' },
    // Only ever sent signed out by the stranger checks: with a session it deletes that account.
    { method: 'DELETE', path: () => 'account', body: () => ({ confirmEmail: 'stranger@example.test' }), scope: 'account' },
    { method: 'GET', path: ({ slug }) => `public/${slug}`, scope: 'public' },
    { method: 'GET', path: ({ slug }) => `public/${slug}/image?kind=view_front`, scope: 'public' },
    { method: 'GET', path: ({ slug }) => `public/${slug}/scene`, scope: 'public' },
    { method: 'GET', path: ({ slug, assetId }) => `public/${slug}/asset/${assetId}`, scope: 'public' },
    { method: 'GET', path: ({ slug }) => `public/${slug}/vote`, scope: 'public' },
    { method: 'POST', path: ({ slug }) => `public/${slug}/vote`, scope: 'account' },
    { method: 'DELETE', path: ({ slug }) => `public/${slug}/vote`, scope: 'account' },
    { method: 'POST', path: ({ slug }) => `public/${slug}/report`, body: () => ({ reason: 'other' }), scope: 'account' },
    { method: 'GET', path: () => 'public', scope: 'public' },
    { method: 'GET', path: () => 'public?window=week&garment=tee', scope: 'public' },
    { method: 'GET', path: () => 'public/feed', scope: 'public' },
    { method: 'GET', path: () => 'public/feed?garment=tee', scope: 'public' },
  ]
}

export const routeLabel = (route: FlpRoute) =>
  `${route.method} /${route.path({ designId: ':id', assetId: ':asset', slug: ':slug' })}`
