import type { SupabaseClient } from '@supabase/supabase-js'

export type ServiceEnv = { url: string; secretKey: string }

export type Caller = { id: string; email: string | null }

export function serviceEnv(source?: Record<string, string | undefined>): ServiceEnv | null

export function serviceClient(env: ServiceEnv): SupabaseClient

export function bearerToken(request: Request): string | null

export function userFromRequest(options: { client: SupabaseClient; request: Request }): Promise<Caller | null>

export function isAdmin(options: { client: SupabaseClient; userId: string }): Promise<boolean>
