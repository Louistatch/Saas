import { CooperativeProvider } from '@/app/context/cooperative-context'

export default function WidgetLayout({ children }: { children: React.ReactNode }) {
  return <CooperativeProvider>{children}</CooperativeProvider>
}
