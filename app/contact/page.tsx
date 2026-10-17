import { MarketingLayout } from '@/components/shared/marketing-layout'
import { publicPageMetadata } from '@/lib/seo'
import { ContactForm } from './contact-form'

export const metadata = publicPageMetadata('/contact')

export default function ContactPage() {
  return (
    <MarketingLayout>
      <ContactForm />
    </MarketingLayout>
  )
}
