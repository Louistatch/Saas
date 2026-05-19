# Demo Credentials & Test Accounts

## Quick Access

All demo accounts are configured in your Supabase project. Use these credentials to test different user roles and features.

## 📋 Demo Accounts

### Super Admin
- **Email**: `admin@demo.local`
- **Password**: `Demo123!SuperAdmin`
- **Role**: super_admin
- **Access**: Full platform access, manage all cooperatives
- **Features**: Admin dashboard, user management, analytics, settings

### Cooperative Admin - Nord
- **Email**: `coop-admin@demo.local`
- **Password**: `Demo123!CoopAdmin`
- **Role**: cooperative_admin
- **Cooperative**: Coopérative du Nord
- **Access**: Full access to Coopérative du Nord
- **Features**: Member management, marketplace, cards, integrations

### Cooperative Admin - Fermes
- **Email**: `fermes-admin@demo.local`
- **Password**: `Demo123!FarmesAdmin`
- **Role**: cooperative_admin
- **Cooperative**: Fermes Unies
- **Access**: Full access to Fermes Unies
- **Features**: Member management, marketplace, cards, integrations

### Member - Nord
- **Email**: `member1@demo.local`
- **Password**: `Demo123!Member1`
- **Role**: member
- **Cooperative**: Coopérative du Nord
- **Access**: Member features, marketplace, cards
- **Features**: Browse products, view member info, access controls

### Member - Fermes
- **Email**: `member2@demo.local`
- **Password**: `Demo123!Member2`
- **Role**: member
- **Cooperative**: Fermes Unies
- **Access**: Member features, marketplace, cards
- **Features**: Browse products, view member info, access controls

### Guest
- **Email**: `guest@demo.local`
- **Password**: `Demo123!Guest`
- **Role**: guest
- **Cooperative**: None
- **Access**: Public marketplace only
- **Features**: Limited product viewing, no account features

## 🏢 Demo Cooperatives

| Name | Description | Primary Color | Admin |
|------|-------------|---------------|-------|
| Coopérative du Nord | Leading agricultural cooperative in Northern France | #2d5016 | coop-admin@demo.local |
| Fermes Unies | United farms cooperative for sustainable agriculture | #1a4d2e | fermes-admin@demo.local |
| Alliance Agricole | Premier cooperative for organic products | #3d6b4a | N/A (managed by super admin) |

## 🎯 Testing Scenarios

### Scenario 1: Super Admin Access
1. Login as `admin@demo.local`
2. Access `/admin` dashboard
3. View all cooperatives in the system
4. See all users across all cooperatives
5. Manage platform-wide settings

**Expected**: Full access to everything

### Scenario 2: Cooperative Admin Access
1. Login as `coop-admin@demo.local`
2. Access `/dashboard`
3. View only members from Coopérative du Nord
4. Manage marketplace for Nord only
5. Cannot see Fermes Unies members or data

**Expected**: Complete isolation from other cooperatives

### Scenario 3: Multi-Tenant Data Isolation
1. Login as `coop-admin@demo.local` (Nord admin)
2. Note: Can see only Nord members
3. Logout and login as `fermes-admin@demo.local` (Fermes admin)
4. Notice: Completely different set of members

**Expected**: RLS policies enforce strict data isolation

### Scenario 4: Member Experience
1. Login as `member1@demo.local`
2. Access marketplace
3. View member profile
4. Notice admin features are not visible

**Expected**: Limited to member features only

### Scenario 5: Guest Access
1. Login as `guest@demo.local` (or don't login)
2. View public marketplace
3. Notice member features are locked
4. Admin panel is not accessible

**Expected**: Very limited feature set

## 🔐 Password Requirements

All demo passwords follow this pattern:
- Contains uppercase, lowercase, and numbers
- 12+ characters for security
- Format: `Demo123!{RoleDescription}`

Examples:
- `Demo123!SuperAdmin` (12 chars)
- `Demo123!CoopAdmin` (12 chars)
- `Demo123!Member1` (14 chars)

## 📝 Creating Additional Test Accounts

You can create new test accounts by:

### Method 1: Via Signup Form
1. Go to `/auth/signup`
2. Enter any email address (doesn't need to be real for demo)
3. Create a password
4. Enter first and last name
5. You'll be created as a "member" by default

### Method 2: Via Supabase Dashboard
1. Go to Supabase dashboard
2. Navigate to Authentication > Users
3. Click "Add user"
4. Set email and password
5. Add user metadata with role and cooperative_id

## 🔄 Demo Data Structure

### User Roles
```
super_admin
├── Access: Everything
├── Dashboard: /admin
└── Features: Manage all cooperatives, users, settings

cooperative_admin
├── Access: One cooperative only
├── Dashboard: /dashboard
└── Features: Member management, marketplace, cards

member
├── Access: Own cooperative features
├── Dashboard: /dashboard (limited)
└── Features: Marketplace, member profile, cards

guest
├── Access: Public only
├── Dashboard: None (public view)
└── Features: View marketplace only
```

### Cooperative Structure
```
Coopérative du Nord
├── Admin: coop-admin@demo.local
├── Members:
│   ├── member1@demo.local
│   └── (create more via signup)
└── Features: Marketplace, Cards, Members, Analytics

Fermes Unies
├── Admin: fermes-admin@demo.local
├── Members:
│   ├── member2@demo.local
│   └── (create more via signup)
└── Features: Marketplace, Cards, Members, Analytics

Alliance Agricole
├── Admin: (super admin only)
├── Members: (none yet)
└── Features: Available for demo
```

## 🚀 Testing Tips

### Performance Testing
1. Create multiple test accounts
2. Generate member cards in bulk
3. Test marketplace with many products
4. Monitor response times

### Security Testing
1. Try accessing other cooperative's data while logged in
2. Attempt to modify other users' profiles
3. Try direct URL manipulation to access restricted areas
4. Test role-based button visibility

### UI/UX Testing
1. Test on mobile, tablet, and desktop
2. Test all forms and validation
3. Test navigation between sections
4. Test responsive layouts

### Multi-Tenant Testing
1. Open two browsers (different cooperatives)
2. Compare data visibility
3. Verify data isolation
4. Test switching between cooperatives

## 📞 Support

If demo accounts aren't working:
1. Check Supabase URL and keys are set
2. Verify internet connection
3. Clear browser cache and cookies
4. Try incognito/private mode
5. Check browser console for errors

## 🔗 Quick Links

- **Landing Page**: `/`
- **Demo Credentials**: `/demo` (interactive list)
- **Setup Guide**: `/setup`
- **Login**: `/auth/login`
- **Signup**: `/auth/signup`
- **Dashboard**: `/dashboard` (after login)
- **Admin**: `/admin` (super admin only)

## ✅ Verification Checklist

After deploying, verify:
- [ ] Can login with demo credentials
- [ ] Super admin sees all cooperatives
- [ ] Cooperative admin sees only own cooperative
- [ ] Member sees limited features
- [ ] Guest sees public marketplace
- [ ] RLS policies enforce data isolation
- [ ] Can create new accounts via signup
- [ ] New accounts default to "member" role
- [ ] All navigation works
- [ ] Responsive on mobile

---

**Last Updated**: 2025-05-11  
**Status**: Ready for Testing  
**Total Accounts**: 6 demo + unlimited custom accounts
