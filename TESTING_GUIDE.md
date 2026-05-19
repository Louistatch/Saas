# Testing Guide - Agricultural Cooperative SaaS

Complete guide to testing all features with Supabase integration.

## 🎯 What's Being Tested

✅ **Supabase Authentication** - Email/password login and signup  
✅ **Multi-Tenant Data Isolation** - RLS policies working correctly  
✅ **Role-Based Access** - Different features for different roles  
✅ **Database Integration** - Profile and cooperative data storage  
✅ **User Interface** - All pages responsive and functional  

## 📋 Pre-Testing Checklist

- [ ] Supabase is connected and configured
- [ ] Database schema is created (run migration)
- [ ] Environment variables are set
- [ ] Dev server is running (`pnpm dev`)
- [ ] Browser is modern and supports ES6

## 🚀 Quick Start Testing (5 minutes)

### Step 1: Visit Demo Page
```
1. Go to http://localhost:3000/demo
2. See all demo credentials listed
3. Copy email and password for super admin
```

### Step 2: Login
```
1. Click "Login as Super Admin" button
2. Or go to http://localhost:3000/auth/login
3. Paste credentials (admin@demo.local / Demo123!SuperAdmin)
4. Click Sign In
```

### Step 3: Explore Dashboard
```
1. You should be redirected to /dashboard
2. If super admin: go to /admin instead
3. Explore the admin dashboard
4. Notice: Can see all cooperatives
```

### Step 4: Test Logout
```
1. Click logout button
2. Should redirect to home page
3. Session should be cleared
```

## 🧪 Detailed Testing Scenarios

### Scenario 1: Super Admin Features

**Objective**: Verify super admin has full platform access

**Steps**:
1. Login as `admin@demo.local` / `Demo123!SuperAdmin`
2. Navigate to `/admin` dashboard
3. Check admin features:
   - [ ] Can see all cooperatives (3 demo cooperatives)
   - [ ] Can see all users across all cooperatives
   - [ ] Can access cooperative management
   - [ ] Can access user management
   - [ ] Can access platform analytics
   - [ ] Can access platform settings

**Expected Result**: Full access to all admin features

**Verification**:
- Admin dashboard loads without errors
- All navigation items visible
- Can view cooperative list
- Can view user list
- No permission errors

---

### Scenario 2: Cooperative Admin Access

**Objective**: Verify cooperative admin only sees own cooperative data

**Steps**:
1. Login as `coop-admin@demo.local` / `Demo123!CoopAdmin`
2. Check dashboard:
   - [ ] See only Coopérative du Nord
   - [ ] See only members from Nord
   - [ ] Can manage marketplace for Nord
   - [ ] Cannot see Fermes Unies data
   - [ ] Cannot access admin panel

**Expected Result**: Complete data isolation from other cooperatives

**Verification**:
```
User Data Check:
- user.role = "cooperative_admin" ✓
- user.cooperativeId = "Nord's ID" ✓
- Members list shows only 1-2 members from Nord ✓
- No members from other cooperatives ✓
```

---

### Scenario 3: Multi-Tenant Isolation Test

**Objective**: Verify RLS policies enforce strict data isolation

**Steps**:
1. **First Browser**: Login as `coop-admin@demo.local` (Nord admin)
   - Note the members list (e.g., member1@demo.local from Nord)
   - Remember the cooperative ID shown

2. **Logout** and clear cookies

3. **Second Login**: Login as `fermes-admin@demo.local` (Fermes admin)
   - See completely different member list
   - See member2@demo.local from Fermes
   - No overlap with Nord members

**Expected Result**: Different data for different cooperatives

**Verification**:
```
Nord Admin sees:
- Cooperative: Coopérative du Nord
- Members: member1@demo.local (and others from Nord)
- Products: Only Nord products

Fermes Admin sees:
- Cooperative: Fermes Unies
- Members: member2@demo.local (and others from Fermes)
- Products: Only Fermes products

No overlapping data between cooperative admins
```

---

### Scenario 4: Member Experience

**Objective**: Verify member role has limited access

**Steps**:
1. Login as `member1@demo.local` / `Demo123!Member1`
2. Check dashboard:
   - [ ] Can see marketplace
   - [ ] Can see member profile
   - [ ] Cannot access admin features
   - [ ] Cannot manage users
   - [ ] Cannot generate cards

**Expected Result**: Limited feature access

**Verification**:
- Dashboard shows member-only sections
- Admin panel link not visible
- User management pages inaccessible
- No admin settings available

---

### Scenario 5: New Account Creation

**Objective**: Verify signup creates new user with member role

**Steps**:
1. Go to `/auth/signup`
2. Fill in form:
   - Email: `testuser@demo.local` (or any email)
   - Password: `TestPass123!`
   - First Name: Test
   - Last Name: User
3. Click Sign Up
4. Verify email (in demo, auto-confirmed)
5. Should redirect to `/dashboard`

**Expected Result**: New account created as member

**Verification**:
```
Check in Supabase:
- New user in auth.users ✓
- New profile in profiles table ✓
- Role = "member" ✓
- Can login with new credentials ✓
```

---

### Scenario 6: Guest Access

**Objective**: Verify guest role has public-only access

**Steps**:
1. Login as `guest@demo.local` / `Demo123!Guest`
2. Check features:
   - [ ] Can view public marketplace
   - [ ] Cannot access member features
   - [ ] Cannot manage anything
   - [ ] Limited navigation

**Expected Result**: Public content only

**Verification**:
- Only public pages accessible
- No admin features visible
- No member-specific features
- Appropriate for public users

---

## 🔍 Technical Verification Tests

### Database Connection Test

**Purpose**: Verify Supabase database is working

**Steps**:
1. Login with any demo account
2. Open browser DevTools (F12)
3. Go to Network tab
4. Check for successful API calls
5. Look for profile data being fetched

**Expected**: 
- No 401 errors
- Profile data loads successfully
- No SQL errors

---

### RLS Policy Test

**Purpose**: Verify Row-Level Security is enforced

**Steps**:
1. Login as `coop-admin@demo.local` (Nord)
2. Open DevTools Console
3. Try to manually fetch all profiles (would break RLS):
   ```javascript
   // This should fail or return only accessible data
   fetch('/api/profiles')
   ```

**Expected**:
- RLS policies prevent unauthorized access
- Only cooperative's own data returned
- No data leakage from other cooperatives

---

### Auth State Persistence Test

**Purpose**: Verify session persists across page reloads

**Steps**:
1. Login with any demo account
2. Note you're logged in
3. Refresh page (F5)
4. Should still be logged in
5. Navigate to different page
6. Should still maintain auth state

**Expected**:
- Session persists across page reloads
- Auth context updates correctly
- No re-login required

---

## 📊 Performance Testing

### Page Load Times
- Landing page: < 2 seconds
- Dashboard: < 3 seconds
- Admin: < 3 seconds

### Database Queries
- Login: < 500ms
- Fetch members: < 1 second
- Fetch products: < 1 second

### UI Responsiveness
- Buttons respond immediately
- No laggy interactions
- Smooth page transitions

---

## 🐛 Debugging Tips

### Check Auth State
```javascript
// In browser console after login
// Check localStorage/cookies for session
console.log(document.cookie)
```

### Test API Calls
```javascript
// Test if Supabase client works
import { createClient } from '@/lib/supabase/client'
const supabase = createClient()
const { data } = await supabase.from('profiles').select()
console.log(data)
```

### Check Database
1. Go to Supabase dashboard
2. Navigate to SQL Editor
3. Run query to check data:
```sql
SELECT * FROM profiles LIMIT 10;
SELECT * FROM cooperatives;
```

---

## ✅ Test Checklist

### Authentication
- [ ] Can login with super admin
- [ ] Can login with cooperative admin
- [ ] Can login with member
- [ ] Can login with guest
- [ ] Can signup new account
- [ ] Can logout successfully
- [ ] Session persists on refresh
- [ ] Cannot access protected routes without auth

### Multi-Tenancy
- [ ] Coop admin 1 cannot see coop admin 2 data
- [ ] Members see only own cooperative data
- [ ] RLS policies enforced (database level)
- [ ] Data isolation verified across roles

### UI/Navigation
- [ ] All pages load without errors
- [ ] Navigation links work
- [ ] Responsive on mobile
- [ ] Responsive on tablet
- [ ] Responsive on desktop
- [ ] Forms submit successfully
- [ ] Error messages display correctly

### Features
- [ ] Dashboard displays correctly
- [ ] Admin panel shows all data
- [ ] Member management works
- [ ] Marketplace displays products
- [ ] Cards/analytics sections load
- [ ] Settings page accessible
- [ ] Integrations page shows correctly

### Security
- [ ] Passwords not visible in URLs
- [ ] Session tokens secured
- [ ] CORS properly configured
- [ ] No XSS vulnerabilities
- [ ] No data leakage between users
- [ ] Auth tokens not exposed

---

## 🎯 Test Results Template

```
Testing Session: [Date/Time]
Tester: [Name]
Version: [Build/Commit]

Feature: [Feature Being Tested]
Test Case: [Specific Test]
Expected Result: [What should happen]
Actual Result: [What actually happened]
Status: ✅ PASS / ❌ FAIL
Notes: [Any observations]

---

Overall Status: [✅ PASS / ⚠️ PARTIAL / ❌ FAIL]
Critical Issues: [List any blocking issues]
Minor Issues: [List non-blocking issues]
Recommendations: [Suggestions for improvement]
```

---

## 🚀 Final Sign-Off

- [ ] All demo accounts tested
- [ ] Multi-tenancy verified
- [ ] Security checks passed
- [ ] UI/UX verified
- [ ] Performance acceptable
- [ ] No critical bugs found
- [ ] Ready for production deployment

---

## 📞 When Tests Fail

### Login Fails
1. Check Supabase URL and keys
2. Verify demo accounts exist in Supabase
3. Check browser console for errors
4. Try incognito mode
5. Clear cache and cookies

### Data Not Loading
1. Check database connection
2. Run migrations if needed
3. Verify RLS policies in Supabase
4. Check API response in Network tab
5. Look at server logs

### UI Issues
1. Clear cache (Ctrl+Shift+Delete)
2. Hard refresh (Ctrl+F5)
3. Check browser console
4. Try different browser
5. Check responsive design

---

**Last Updated**: 2025-05-11  
**Status**: Ready for Testing  
**Version**: 1.0

