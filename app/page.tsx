import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight, Leaf, Users, TrendingUp, BarChart3 } from 'lucide-react'
import { HomeClient } from '@/app/components/home-client'

export default function Home() {
  return (
    <HomeClient>
      <div className="min-h-screen bg-gradient-to-b from-background via-background to-secondary/10">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <Leaf className="h-7 w-7 text-primary" />
            <span className="text-xl font-bold text-foreground">FaîtiereHub</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <Link href="/features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Features
            </Link>
            <Link href="/#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              How it works
            </Link>
            <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </Link>
            <Link href="/setup" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Setup
            </Link>
            <Link href="/demo" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Demo
            </Link>
          </div>

          <div className="flex items-center gap-3">
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
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-8 items-center">
          <div className="space-y-6">
            <div>
              <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                Empower Your Agricultural Cooperative
              </h1>
              <p className="mt-4 text-lg text-muted-foreground max-w-lg">
                Connect members, manage exploitations, and grow together with our all-in-one digital platform built for faîtières agricoles.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
              <Link href="/auth/signup">
                <Button size="lg" className="gap-2 bg-primary hover:bg-primary/90 w-full sm:w-auto">
                  Start Free Trial <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/demo">
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  View Demo Credentials
                </Button>
              </Link>
            </div>

            <div className="flex gap-6 pt-4">
              <div className="flex items-center gap-2">
                <div className="flex h-2 w-2 rounded-full bg-primary"></div>
                <span className="text-sm text-muted-foreground">30-day free trial</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex h-2 w-2 rounded-full bg-accent"></div>
                <span className="text-sm text-muted-foreground">No credit card</span>
              </div>
            </div>
          </div>

          <div className="relative h-96 sm:h-[500px] bg-gradient-to-br from-primary/10 to-accent/10 rounded-2xl border border-border flex items-center justify-center">
            <div className="text-center space-y-4 px-8">
              <BarChart3 className="h-20 w-20 text-primary mx-auto opacity-20" />
              <p className="text-muted-foreground">Dashboard Preview</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="bg-card/50 py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
              Built for Agricultural Cooperatives
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Everything you need to manage members, exploitations, and growth in one place
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Users,
                title: "Member Management",
                description: "Track and engage cooperative members with digital member cards and access control"
              },
              {
                icon: TrendingUp,
                title: "Marketplace",
                description: "Connect members with exploitations and enable direct transactions within the cooperative"
              },
              {
                icon: BarChart3,
                title: "Analytics",
                description: "Get insights into member activity, sales, and growth metrics in real-time"
              },
              {
                icon: Leaf,
                title: "Data Integration",
                description: "Sync member data from KoboToolbox and other sources automatically"
              }
            ].map((feature, i) => (
              <div key={i} className="rounded-lg border border-border bg-background p-6 space-y-3">
                <feature.icon className="h-8 w-8 text-primary" />
                <h3 className="font-semibold text-foreground">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-foreground text-center sm:text-4xl mb-16">
            How FaîtiereHub Works
          </h2>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                step: "1",
                title: "Setup Your Cooperative",
                description: "Create your cooperative account and configure your marketplace with branding and settings"
              },
              {
                step: "2",
                title: "Add Members & Data",
                description: "Import member lists and exploitation data, then issue digital member cards with QR codes"
              },
              {
                step: "3",
                title: "Enable Transactions",
                description: "Members browse the marketplace, make purchases, and access benefits with their cards"
              }
            ].map((item, i) => (
              <div key={i} className="relative space-y-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                  {item.step}
                </div>
                <h3 className="font-semibold text-lg text-foreground">{item.title}</h3>
                <p className="text-muted-foreground">{item.description}</p>
                {i < 2 && (
                  <div className="hidden md:block absolute top-6 -right-4 h-0.5 w-8 bg-border"></div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-border bg-card/50 py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
            Ready to Transform Your Cooperative?
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Join agricultural cooperatives across the region using FaîtiereHub to connect members and grow together.
          </p>
          <Link href="/auth/signup" className="mt-8 inline-block">
            <Button size="lg" className="gap-2 bg-primary hover:bg-primary/90">
              Start Your Free Trial <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Leaf className="h-6 w-6 text-primary" />
                <span className="font-bold text-foreground">FaîtiereHub</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Empowering agricultural cooperatives with digital tools.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-4">Product</h4>
              <ul className="space-y-2">
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</Link></li>
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</Link></li>
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Security</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-4">Company</h4>
              <ul className="space-y-2">
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">About</Link></li>
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Blog</Link></li>
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Contact</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-foreground mb-4">Legal</h4>
              <ul className="space-y-2">
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy</Link></li>
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Terms</Link></li>
                <li><Link href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Cookies</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border mt-8 pt-8 flex flex-col sm:flex-row justify-between items-center">
            <p className="text-sm text-muted-foreground">
              © 2026 FaîtiereHub. All rights reserved.
            </p>
            <p className="text-sm text-muted-foreground">
              Made with <span className="text-primary">♦</span> for agricultural cooperatives
            </p>
          </div>
        </div>
      </footer>
      </div>
    </HomeClient>
  )
}
