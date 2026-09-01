import type { Metadata } from 'next'
import { MarketingLayout } from '@/components/shared/marketing-layout'
import { ContactForm } from './contact-form'

export const metadata: Metadata = {
  title: 'Contact — FaîtiereHub | Contactez notre équipe',
  description:
    "Contactez l'équipe FaîtiereHub pour toute question, demande de démonstration ou support technique. Basés à Lomé, Togo.",
}

export default function ContactPage() {
  return (
    <MarketingLayout>
      <ContactForm />
    </MarketingLayout>
  )
}
