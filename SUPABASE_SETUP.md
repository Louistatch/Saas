# Supabase Setup Guide - Agricultural Cooperative SaaS

This document provides complete setup instructions for the agricultural cooperative SaaS platform with Supabase.

## ✅ What's Already Configured

### Database Schema
- **User Roles**: super_admin, cooperative_admin, member, guest
- **Tables**: 
  - `profiles` - User information and role assignments
  - `cooperatives` - Cooperative details and settings
- **RLS Policies**: Row-level security for multi-tenant data isolation
- **Auto-trigger**: Profiles are automatically created when users sign up

### Demo Data
- 3 pre-configured cooperatives ready for testing
- Demo accounts for all user roles

## 🚀 Quick Start

### 1. View Demo Credentials
Visit `/demo` page to see all available demo accounts and their credentials.

### 2. Login with Demo Account
Use any demo account to test the platform:
- **Super Admin**: admin@demo.local (access all cooperatives)
- **Cooperative Admin**: coop-admin@demo.local (manage one cooperative)
- **Member**: member1@demo.local (member features only)

### 3. Create Your Own Account
Go to `/auth/signup` to create a new account. You'll be created as a 'member' by default.

## 🏗️ Architecture

### User Roles & Permissions

| Role | Dashboard | Admin Panel | Marketplace | Members | Cards |
|------|-----------|------------|-------------|---------|-------|
| super_admin | ✓ | ✓ (all) | ✓ | ✓ (all) | ✓ (all) |
| cooperative_admin | ✓ | ✓ (own) | ✓ | ✓ (own) | ✓ (own) |
| member | ✓ | ✗ | ✓ | ✓ | ✓ |
| guest | Limited | ✗ | ✓ (view) | ✗ | ✗ |

### Multi-Tenancy
- Each cooperative is completely isolated by RLS policies
- Cooperative admins only see their cooperative's data
- Members only see their cooperative's data
- Data is automatically filtered based on logged-in user's role and cooperative assignment

## 📁 File Structure

```
lib/supabase/
├── client.ts          # Browser client setup
└── server.ts          # Server client setup

app/
├── auth/
│   ├── login/         # Login page
│   ├── signup/        # Signup page
│   └── callback/      # OAuth/email callback
├── dashboard/         # Protected dashboard routes
├── admin/             # Super admin routes
├── demo/              # Demo credentials page
├── setup/             # Setup guide page
└── context/
    └── auth-context.tsx  # Authentication context with Supabase
```

## 🔑 Environment Variables

Your Supabase integration provides these environment variables automatically:
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Anon key for client-side operations

## 🔐 Authentication Flow

1. User signs up with email and password
2. Supabase creates auth user and sends verification email (production)
3. Trigger automatically creates profile in `profiles` table
4. User metadata sets role and cooperative assignment
5. RLS policies control what data user can access
6. Auth context loads user profile and provides to app

## 🗂️ Database Tables

### profiles
```sql
- id (UUID, primary key, refs auth.users)
- email (TEXT, unique)
- first_name (TEXT)
- last_name (TEXT)
- role (user_role enum)
- cooperative_id (UUID, nullable)
- created_at (timestamp)
- updated_at (timestamp)
```

### cooperatives
```sql
- id (UUID, primary key)
- name (TEXT, unique)
- description (TEXT)
- logo_url (TEXT)
- primary_color (TEXT)
- created_at (timestamp)
- updated_at (timestamp)
```

## 🧪 Testing User Roles

### Testing Super Admin
1. Login as admin@demo.local
2. Access `/admin` dashboard
3. View all cooperatives and users
4. Manage platform-wide settings

### Testing Cooperative Admin
1. Login as coop-admin@demo.local
2. Access `/dashboard` for your cooperative
3. Manage members and marketplace
4. Generate member cards
5. View only your cooperative's data

### Testing Member
1. Login as member1@demo.local
2. Access marketplace
3. View available products
4. Limited admin features

### Testing Multi-Tenancy
1. Login as cooperative admin for "Coopérative du Nord"
2. See only members from that cooperative
3. Logout and login as cooperative admin for "Fermes Unies"
4. See completely different set of members
5. Data is isolated by RLS policies

## 🔄 Authentication State Management

The `AuthContext` handles:
- User authentication with Supabase
- Profile data fetching from `profiles` table
- Real-time auth state updates
- Role-based access control
- Logout and session management

```tsx
// Use in components
const { user, isAuthenticated, login, signup, logout } = useAuth()

// user object includes:
// - id: string
// - email: string
// - firstName: string
// - lastName: string
// - role: UserRole
// - cooperativeId?: string
```

## 🚀 Deployment

When deploying to production:

1. Set Supabase environment variables in your hosting platform
2. Enable email verification in Supabase (Settings > Auth)
3. Configure OAuth providers if needed (Google, GitHub, etc.)
4. Set up email templates for verification links
5. Update `emailRedirectTo` in signup to match production domain

## 📚 Additional Resources

- **Demo Page**: `/demo` - View all demo credentials
- **Setup Guide**: `/setup` - Complete setup walkthrough
- **Login**: `/auth/login` - Authenticate users
- **Signup**: `/auth/signup` - Create new accounts

## ❓ Troubleshooting

### Users can't login
- Check credentials in `/demo` page
- Verify Supabase URL and keys are set in environment
- Check browser console for auth errors

### Multi-tenant data leaking
- RLS policies are automatically applied by Supabase
- Check policies in Supabase dashboard under SQL Editor
- Verify cooperative_id is set for all users

### New signups not working
- Email confirmation may be required - check email
- In production, verify email service is configured
- Demo accounts don't require email verification

## 🎯 Next Steps

1. Explore the platform with demo accounts
2. Test different user roles
3. Create custom accounts via signup
4. Integrate with KoboToolbox for member scoring
5. Add more cooperatives as needed
6. Customize branding for each cooperative
7. Generate member cards for access control
8. Launch marketplace with products

---

For questions or issues, refer to the Supabase documentation or check the `/setup` page for detailed walkthroughs.
