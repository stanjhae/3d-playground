import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/soon')({
  beforeLoad: () => {
    throw redirect({
      to: '/',
      search: {},
      hash: 'waitlist',
    })
  },
  component: SoonRedirect,
})

function SoonRedirect() {
  return null
}
