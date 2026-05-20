'use client'

/**
 * A polished, animated dashboard mockup for the landing page hero section.
 * Pure CSS/SVG — no external images needed.
 */
export function DashboardPreview() {
  return (
    <div className="relative w-full max-w-5xl mx-auto">
      {/* Browser chrome */}
      <div className="rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-yellow-400" />
            <div className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 flex justify-center">
            <div className="px-4 py-1 rounded-md bg-background border border-border text-xs text-muted-foreground font-mono">
              saas-one-teal-62.vercel.app/dashboard
            </div>
          </div>
        </div>

        {/* Dashboard content */}
        <div className="flex min-h-[400px] md:min-h-[480px]">
          {/* Sidebar */}
          <div className="hidden md:flex flex-col w-56 border-r border-border bg-card p-4 gap-2">
            <div className="flex items-center gap-2 mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" className="h-6 w-6 rounded" />
              <span className="text-sm font-bold text-foreground">FaîtiereHub</span>
            </div>
            {['Vue d\'ensemble', 'Exploitations', 'Membres', 'Cartes', 'Statistiques'].map((item, i) => (
              <div
                key={item}
                className={`px-3 py-2 rounded-md text-sm ${
                  i === 0
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'text-muted-foreground'
                }`}
              >
                {item}
              </div>
            ))}
          </div>

          {/* Main area */}
          <div className="flex-1 p-6 space-y-6 bg-background">
            {/* Header */}
            <div>
              <div className="h-6 w-48 bg-foreground/10 rounded-md animate-pulse" />
              <div className="h-4 w-72 bg-muted rounded-md mt-2" />
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Members', value: '127', color: 'bg-blue-500' },
                { label: 'Active Cards', value: '98', color: 'bg-green-500' },
                { label: 'Exploitations', value: '34', color: 'bg-purple-500' },
                { label: 'Revenue', value: '€12.4k', color: 'bg-orange-500' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="p-4 rounded-lg border border-border bg-card space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{stat.label}</span>
                    <div className={`w-2 h-2 rounded-full ${stat.color}`} />
                  </div>
                  <p className="text-xl font-bold text-foreground">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Chart area */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border border-border bg-card">
                <p className="text-sm font-medium text-foreground mb-3">Member Growth</p>
                <div className="flex items-end gap-1 h-24">
                  {[40, 55, 45, 60, 75, 65, 80, 90, 85, 95, 88, 100].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-primary/20 rounded-t-sm relative overflow-hidden"
                      style={{ height: `${h}%` }}
                    >
                      <div
                        className="absolute bottom-0 left-0 right-0 bg-primary rounded-t-sm"
                        style={{ height: `${h * 0.7}%` }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-[10px] text-muted-foreground">Jan</span>
                  <span className="text-[10px] text-muted-foreground">Dec</span>
                </div>
              </div>

              <div className="p-4 rounded-lg border border-border bg-card">
                <p className="text-sm font-medium text-foreground mb-3">Recent Activity</p>
                <div className="space-y-3">
                  {[
                    { dot: 'bg-blue-500', text: 'Pierre Martin added', time: '2m ago' },
                    { dot: 'bg-green-500', text: 'Card NOR-45821 generated', time: '15m ago' },
                    { dot: 'bg-purple-500', text: 'Tomates Bio published', time: '1h ago' },
                    { dot: 'bg-orange-500', text: 'KoboToolbox synced', time: '3h ago' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${item.dot}`} />
                        <span className="text-xs text-foreground">{item.text}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{item.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Glow effect behind */}
      <div className="absolute -inset-4 -z-10 bg-gradient-to-r from-primary/20 via-accent/10 to-primary/20 rounded-2xl blur-3xl opacity-50" />
    </div>
  )
}
