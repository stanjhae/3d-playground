import { type FlpResult, call, publicRead } from './client.ts'
import type { FeedbackAnswer, FeedbackView } from './feedback.ts'

/**
 * Browser calls for feedback. Kept apart from `feedback.ts`, which the API
 * server loads: `client.ts` reads the browser's Supabase settings on import.
 */
const feedbackPath = ({ slug }: { slug: string }) => `public/${encodeURIComponent(slug)}/feedback`

export function getFeedback({ slug, fetchImpl }: { slug: string; fetchImpl?: typeof fetch }): Promise<FlpResult<FeedbackView>> {
  return publicRead<FeedbackView>({
    path: feedbackPath({ slug }),
    fetchImpl,
    notFound: 'This design is not available',
    failed: 'Feedback could not load',
  })
}

export function putFeedback({
  slug,
  answer,
  fetchImpl,
}: {
  slug: string
  answer: FeedbackAnswer
  fetchImpl?: typeof fetch
}) {
  return call<FeedbackView>({ path: feedbackPath({ slug }), method: 'POST', body: answer, fetchImpl })
}
