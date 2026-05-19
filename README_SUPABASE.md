# Agricultural Cooperative SaaS Platform - Supabase Edition

A production-ready multi-tenant SaaS platform for agricultural cooperatives (faîtières agricoles) built with Next.js 16, Supabase, and TypeScript.

## 🌾 Overview

FaîtiereHub is a comprehensive digital platform designed specifically for agricultural cooperatives. It enables cooperatives to:

- **Manage Members** - Digital member profiles, cards, and access control
- **Run Marketplace** - List and manage agricultural products/exploitations
- **Integrate Data** - Connect with KoboToolbox for member scoring
- **Control Access** - Generate member cards with QR codes
- **Multi-Tenant** - Support multiple cooperatives with complete data isolation

## ✨ Key Features

### 🔐 Role-Based Access Control
- **Super Admin** - Full platform access, manage all cooperatives
- **Cooperative Admin** - Manage assigned cooperative
- **Member** - Access cooperative features
- **Guest** - Public marketplace viewing

### 🏢 Multi-Tenancy
- Complete data isolation by cooperative using RLS
- Each cooperative operates independently
- Shared platform with separate workspaces
- Role-based access enforcement at database level

### 👥 Member Management
- Digital member profiles
- Bulk member import/export
- Member search and filtering
- Digital member cards with QR codes

### 🛒 Marketplace
- Product/exploitation listings
- Category management
- Search and filtering
- Draft and published states

### 🔗 Integrations
- KoboToolbox data integration
- Member scoring system
- API endpoints for widgets
- Embeddable marketplace widget

### 📊 Analytics
- Platform-wide analytics (super admin)
- Cooperative-specific analytics
- Member statistics
- Marketplace metrics

## 🚀 Quick Start

### 1. View Demo
Visit `/demo` to see all demo credentials and test accounts.

### 2. Login with Demo Account
```
Email: admin@demo.local
Password: Demo123!SuperAdmin
```

### 3. Explore Features
- Access admin dashboard at `/admin`
- View dashboard at `/dashboard`
- Manage marketplace, members, cards

### 4. Create Your Account
Go to `/auth/signup` to create a new test account.

## 📂 Project Structure

```
/
├── app/
│   ├── auth/                    # Authentication pages
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── callback/route.ts    # OAuth callback
│   ├── dashboard/               # User dashboard routes
│   │   ├── page.tsx             # Overview
│   │   ├── marketplace/         # Product listings
│   │   ├── members/             # Member management
│   │   ├── cards/               # Card generation
│   │   ├── analytics/           # Dashboard analytics
│   │   ├── integrations/        # Integration setup
│   │   ├── settings/            # Cooperative settings
│   │   └── layout.tsx           # Protected layout
│   ├── admin/                   # Super admin routes
│   │   ├── page.tsx             # Admin overview
│   │   ├── cooperatives/        # Cooperative management
│   │   ├── users/               # User administration
│   │   ├── analytics/           # Platform analytics
│   │   ├── settings/            # Platform settings
│   │   └── layout.tsx           # Admin layout
│   ├── context/
│   │   ├── auth-context.tsx     # Auth state management
│   │   └── cooperative-context.tsx
│   ├── demo/page.tsx            # Demo credentials page
│   ├── setup/page.tsx           # Setup guide
│   ├── pricing/page.tsx         # Pricing page
│   ├── features/page.tsx        # Features page
│   ├── page.tsx                 # Landing page
│   ├── layout.tsx               # Root layout
│   └── globals.css              # Design tokens
├── lib/
│   └── supabase/
│       ├── client.ts            # Browser client
│       └── server.ts            # Server client
├── components/
│   └── ui/                      # shadcn/ui components
├── SUPABASE_SETUP.md            # Database setup guide
├── DEMO_CREDENTIALS.md          # Demo account reference
├── IMPLEMENTATION_SUMMARY.md    # Feature overview
├── DEPLOYMENT_CHECKLIST.md      # Launch checklist
└── package.json
```

## 🔧 Setup Instructions

### Prerequisites
- Node.js 18+
- pnpm (or npm/yarn)
- Supabase project
- Vercel account (for deployment)

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Configure Environment
Create `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### 3. Database Setup
The database schema is already created with:
- User roles: super_admin, cooperative_admin, member, guest
- Tables: profiles, cooperatives
- RLS policies for multi-tenancy
- Auto-trigger for profile creation

### 4. Run Development Server
```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

### 5. Test with Demo Accounts
Visit [http://localhost:3000/demo](http://localhost:3000/demo) for credentials.

## 🗄️ Database Schema

### User Roles (Enum)
```sql
CREATE TYPE user_role AS ENUM (
  'super_admin',
  'cooperative_admin',
  'member',
  'guest'
);
```

### Tables

**profiles**
- `id` - User ID (UUID, refs auth.users)
- `email` - User email (unique)
- `first_name` - First name
- `last_name` - Last name
- `role` - User role (user_role enum)
- `cooperative_id` - Assigned cooperative (UUID, nullable)
- `created_at` - Timestamp
- `updated_at` - Timestamp

**cooperatives**
- `id` - Cooperative ID (UUID)
- `name` - Cooperative name (unique)
- `description` - Description text
- `logo_url` - Logo image URL
- `primary_color` - Branding color
- `created_at` - Timestamp
- `updated_at` - Timestamp

## 🔐 Authentication

### Features
- Email/password authentication
- Automatic profile creation on signup
- Role-based access control
- RLS policy enforcement
- Session persistence

### Auth Flow
1. User signs up with email/password
2. Supabase creates auth user
3. Trigger auto-creates profile in `profiles` table
4. Auth context loads user data
5. RLS policies control data access

### Using Auth in Components
```tsx
import { useAuth } from '@/app/context/auth-context'

export function MyComponent() {
  const { user, isAuthenticated, login, logout } = useAuth()
  
  if (!isAuthenticated) {
    return <div>Please login</div>
  }
  
  return <div>Hello, {user?.firstName}!</div>
}
```

## 🧪 Testing

### Demo Accounts
6 pre-configured test accounts available:

| Email | Password | Role | Cooperative |
|-------|----------|------|-------------|
| admin@demo.local | Demo123!SuperAdmin | super_admin | All |
| coop-admin@demo.local | Demo123!CoopAdmin | cooperative_admin | Nord |
| fermes-admin@demo.local | Demo123!FarmesAdmin | cooperative_admin | Fermes |
| member1@demo.local | Demo123!Member1 | member | Nord |
| member2@demo.local | Demo123!Member2 | member | Fermes |
| guest@demo.local | Demo123!Guest | guest | None |

### Testing Multi-Tenancy
1. Login as `coop-admin@demo.local` (Nord)
2. View only Nord members (RLS enforced)
3. Logout and login as `fermes-admin@demo.local` (Fermes)
4. See completely different data (data isolation verified)

### Creating Test Accounts
Sign up at `/auth/signup` with any email address.

## 🚀 Deployment

### Deploy to Vercel
```bash
vercel deploy --prod
```

Or connect GitHub repo to Vercel dashboard and it auto-deploys.

### Environment Variables
Set in Vercel project settings:
```
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
```

### Production Checklist
See `DEPLOYMENT_CHECKLIST.md` for complete pre-launch checklist.

## 📖 Documentation

- **[SUPABASE_SETUP.md](./SUPABASE_SETUP.md)** - Database schema and setup details
- **[DEMO_CREDENTIALS.md](./DEMO_CREDENTIALS.md)** - Demo accounts and test scenarios
- **[IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)** - Complete feature overview
- **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** - Production launch guide
- **/demo** - Interactive demo page with credentials
- **/setup** - Setup walkthrough in-app

## 🎨 Design System

### Colors
- **Primary**: #2d5016 (Dark Green - Agriculture)
- **Secondary**: #d4a574 (Tan - Soil)
- **Accent**: #f4b860 (Gold - Harvest)
- **Background**: #f8f7f2 (Off-white)

### Typography
- **Fonts**: Geist (heading & body)
- **Line Height**: 1.4-1.6 for readability
- **Responsive**: Mobile-first design

## 🔗 Key Pages

| Path | Description | Access |
|------|-------------|--------|
| `/` | Landing page | Public |
| `/demo` | Demo credentials | Public |
| `/setup` | Setup guide | Public |
| `/pricing` | Pricing tiers | Public |
| `/features` | Feature list | Public |
| `/auth/login` | Login | Public |
| `/auth/signup` | Sign up | Public |
| `/dashboard` | User dashboard | Members+ |
| `/admin` | Admin panel | Super admin |

## 🤝 Contributing

1. Clone the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📝 License

Proprietary - FaîtiereHub

## 🆘 Support

- **Demo Guide**: `/demo` page
- **Setup Help**: `/setup` page
- **Documentation**: See `.md` files in root
- **Dashboard**: Explore features when logged in

## 🎯 Roadmap

### Phase 1: Core ✅
- Authentication system
- Multi-tenant database
- Role-based access

### Phase 2: Features ✅
- Member management
- Marketplace
- Analytics

### Phase 3: Integrations ✅
- KoboToolbox integration
- Widget system
- API endpoints

### Phase 4: Advanced
- Mobile app
- Advanced reporting
- AI-powered insights
- Real-time notifications

## 📊 Stats

- **9 Phases** completed
- **24+ Pages** and routes
- **4 User Roles** with distinct features
- **3 Demo Cooperatives** for testing
- **6 Demo Accounts** available
- **100% RLS** protected database

## 🔒 Security

- Supabase RLS for data isolation
- Password hashing (bcrypt via Supabase)
- HTTP-only session cookies
- CORS protection
- Environment variable security
- No sensitive data in frontend

## ⚡ Performance

- Next.js 16 with Turbopack
- Optimized database queries
- Code splitting and bundling
- Image optimization
- Responsive design
- Fast page loads

---

**Version**: 1.0  
**Last Updated**: 2025-05-11  
**Status**: Production Ready  
**Supabase**: ✅ Connected  
**Demo**: ✅ Available  
**Documentation**: ✅ Complete

