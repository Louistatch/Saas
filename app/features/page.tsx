'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Users, 
  ShoppingCart, 
  BarChart3, 
  Leaf,
  QrCode,
  Database,
  Lock,
  Zap,
  Globe,
  ArrowRight
} from 'lucide-react'
import { useAuth } from '@/app/context/auth-context'

const features = [
  {
    icon: Users,
    title: 'Member Management',
    description: 'Comprehensive member database with profiles, contact information, and activity tracking. Import members via CSV or add them manually.'
  },
  {
    icon: ShoppingCart,
    title: 'Marketplace',
    description: 'Create a cooperative marketplace where members can browse and purchase from listed exploitations with seamless transactions.'
  },
  {
    icon: QrCode,
    title: 'Digital Member Cards',
    description: 'Generate PDF member cards with unique QR codes for access control and benefit verification at member exploitations.'
  },
  {
    icon: BarChart3,
    title: 'Analytics & Insights',
    description: 'Track member engagement, sales trends, and cooperative growth with powerful analytics and reporting tools.'
  },
  {
    icon: Database,
    title: 'KoboToolbox Integration',
    description: 'Automatically sync member data and survey responses from KoboToolbox for member scoring and segmentation.'
  },
  {
    icon: Lock,
    title: 'Access Control',
    description: 'Use member cards and QR codes to control access to member-only benefits and verify eligibility at point of sale.'
  },
  {
    icon: Zap,
    title: 'Integrations',
    description: 'Connect with popular tools like Google Sheets, email services, and payment providers for seamless workflow.'
  },
  {
    icon: Globe,
    title: 'Embeddable Widget',
    description: 'Embed the cooperative marketplace on your website with a customizable widget that matches your brand.'
  },
]

export default function FeaturesPage() {
  const { isAuthenticated } = useAuth()

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <Leaf className="h-7 w-7 text-primary" />
            <span className="text-xl font-bold text-foreground">FaîtiereHub</span>
          </Link>
          
          <div className="hidden md:flex items-center gap-8">
            <Link href="/features" className="text-sm font-medium text-primary">
              Features
            </Link>
            <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Link href="/dashboard">
                <Button size="sm" className="bg-primary hover:bg-primary/90">
                  Dashboard
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/auth/login">
                  <Button variant="outline" size="sm">
                    Sign In
                  </Button>
                </Link>
                <Link href="/auth/signup">
                  <Button size="sm" className="bg-primary hover:bg-primary/90">
                    Get Started
                  </Button>
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center space-y-4 mb-16">
          <h1 className="text-4xl font-bold text-foreground sm:text-5xl">
            Powerful Features for Agricultural Cooperatives
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Everything you need to manage members, operate a marketplace, and grow your cooperative in one platform.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => {
            const Icon = feature.icon
            return (
              <Card key={i} className="border-border hover:shadow-lg transition-shadow">
                <CardHeader>
                  <Icon className="h-8 w-8 text-primary mb-3" />
                  <CardTitle className="text-foreground">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-muted-foreground">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      {/* Use Cases */}
      <section className="bg-card/50 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-foreground mb-12 text-center">
            How Cooperatives Use FaîtiereHub
          </h2>

          <div className="grid gap-8 md:grid-cols-2">
            {[
              {
                title: 'Farming Cooperative',
                description: 'A cooperative of vegetable farmers uses FaîtiereHub to sell directly to member retailers. Members receive digital cards for verified bulk purchasing discounts.',
              },
              {
                title: 'Dairy Cooperative',
                description: 'Members manage milk collection points and track member contributions. The marketplace connects member dairy producers with wholesale buyers.',
              },
              {
                title: 'Agricultural Input Cooperative',
                description: 'Coordinates seed and fertilizer distribution to member farms. Members use their cards at local pickup points for member-exclusive pricing.',
              },
              {
                title: 'Cooperative Network',
                description: 'A network of regional cooperatives uses FaîtiereHub to coordinate member information across locations while maintaining independent branding.',
              },
            ].map((useCase, i) => (
              <Card key={i} className="border-border">
                <CardHeader>
                  <CardTitle className="text-foreground">{useCase.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-muted-foreground">
                    {useCase.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-foreground mb-4">
            Start Empowering Your Cooperative Today
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Experience how FaîtiereHub can transform how your cooperative operates.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth/signup">
              <Button size="lg" className="gap-2 bg-primary hover:bg-primary/90">
                Start Free Trial <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline" className="border-border">
                View Pricing
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
