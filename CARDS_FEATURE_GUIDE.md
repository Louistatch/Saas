# Member Cards Feature - Complete Guide

## 🎉 What's New

The Member Cards feature has been completely enhanced with the following improvements:

### ✨ New Features

1. **Bulk Card Generation**
   - Generate cards for multiple members at once
   - Select all or individual members
   - Shows count of selected members
   - Efficient batch processing

2. **Card Download as Image**
   - Download individual cards as PNG images
   - High-quality credit card-sized format (1012x638px)
   - Includes all card details and QR code placeholder
   - Custom branding with cooperative colors

3. **Save Template Functionality**
   - Customize card title and subtitle
   - Choose custom background and text colors
   - Live preview of card design
   - Persistent storage in database

4. **Save Settings Functionality**
   - Configure default validity period
   - Customize QR code data inclusion
   - Choose what information to embed in QR codes
   - Settings persist across sessions

5. **Toast Notifications**
   - Success messages for all operations
   - Error handling with user-friendly messages
   - Loading states for better UX

6. **Enhanced Error Handling**
   - Comprehensive try-catch blocks
   - Validation before operations
   - User-friendly error messages
   - Graceful failure handling

7. **Improved UI/UX**
   - Loading indicators on all buttons
   - Disabled states during operations
   - Better visual feedback
   - Responsive dialogs
   - Improved accessibility

## 🗄️ Database Setup

### Required Migration

Run the SQL migration to create the `cooperative_settings` table:

```bash
# Copy the contents of supabase_migrations.sql and run in Supabase SQL Editor
```

The migration creates:
- `cooperative_settings` table with JSONB columns for templates and settings
- RLS policies for multi-tenant security
- Indexes for performance
- Triggers for automatic timestamp updates
- Default settings for existing cooperatives

### Table Schema

```sql
cooperative_settings (
  id UUID PRIMARY KEY,
  cooperative_id UUID UNIQUE REFERENCES cooperatives(id),
  card_template JSONB,
  card_settings JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

## 🎨 Card Template Structure

```typescript
{
  title: string,        // e.g., "Member Card"
  subtitle: string,     // e.g., "Digital Access Pass"
  bgColor: string,      // Hex color, e.g., "#16a34a"
  textColor: string     // Hex color, e.g., "#ffffff"
}
```

## ⚙️ Card Settings Structure

```typescript
{
  defaultValidityDays: number,  // e.g., 365
  qrCodeIncludes: {
    cardNumber: boolean,        // Include card number in QR
    memberId: boolean,          // Include member ID in QR
    cooperativeId: boolean      // Include cooperative ID in QR
  }
}
```

## 📋 Features Breakdown

### 1. Single Card Generation

**Location**: Cards tab → "Generate Card" button

**Features**:
- Select member from dropdown
- Set custom validity period
- Automatically revokes existing active cards
- Generates unique card number with cooperative prefix
- Creates QR code data based on settings

**Validation**:
- Requires member selection
- Shows error if no member selected
- Disables button during generation

### 2. Bulk Card Generation

**Location**: Cards tab → "Bulk Generate" button

**Features**:
- Select multiple members with checkboxes
- "Select All" and "Clear" buttons
- Shows count of selected members
- Set validity period for all cards
- Batch processing with single database transaction
- Revokes existing active cards for all selected members

**Validation**:
- Requires at least one member selected
- Shows error if no members selected
- Disables button during generation
- Shows count in button text

### 3. Card Download

**Location**: Cards table → Download button (per card)

**Features**:
- Generates high-quality PNG image
- Credit card dimensions (3.375" x 2.125" at 300 DPI)
- Includes:
  - Custom background color
  - Decorative design elements
  - Card title and subtitle
  - Member name
  - Card number
  - QR code placeholder
- Downloads with filename: `member-card-{CARD_NUMBER}.png`

**Technical Details**:
- Uses HTML5 Canvas API
- Client-side rendering (no server required)
- Immediate download
- No external dependencies

### 4. Template Customization

**Location**: Template tab

**Features**:
- Live preview of card design
- Customize title and subtitle
- Color pickers for background and text
- Visual color preview boxes
- Save to database
- Loads saved template on page load

**Default Template**:
```json
{
  "title": "Member Card",
  "subtitle": "Digital Access Pass",
  "bgColor": "#16a34a",
  "textColor": "#ffffff"
}
```

### 5. Settings Configuration

**Location**: Settings tab

**Features**:
- Set default validity period (days)
- Configure QR code data inclusion:
  - Card Number
  - Member ID
  - Cooperative ID
- Save to database
- Loads saved settings on page load

**Default Settings**:
```json
{
  "defaultValidityDays": 365,
  "qrCodeIncludes": {
    "cardNumber": true,
    "memberId": true,
    "cooperativeId": true
  }
}
```

### 6. Card Revocation

**Location**: Cards table → Revoke button (per active card)

**Features**:
- Confirmation dialog before revocation
- Updates card status to 'revoked'
- Removes marketplace access
- Shows success/error toast
- Refreshes card list

## 🔐 Security & Permissions

### Row Level Security (RLS)

All operations respect RLS policies:
- Super admins can manage all cooperatives
- Cooperative admins can only manage their cooperative
- Members can view but not modify settings
- Complete data isolation between cooperatives

### Validation

- Member selection required for generation
- Numeric validation for validity days
- Color format validation for templates
- Cooperative context required for all operations

## 🎯 User Experience Improvements

### Loading States
- Spinner icons during operations
- Disabled buttons to prevent double-clicks
- Loading text feedback

### Error Handling
- Try-catch blocks on all async operations
- User-friendly error messages
- Toast notifications for all outcomes
- Graceful degradation

### Visual Feedback
- Toast notifications for success/error
- Button state changes
- Loading indicators
- Confirmation dialogs for destructive actions

## 🚀 Usage Examples

### Generate Single Card

1. Navigate to Dashboard → Cards
2. Click "Generate Card"
3. Select a member from dropdown
4. Optionally adjust validity period
5. Click "Generate Card"
6. Card appears in table with "active" status

### Generate Multiple Cards

1. Navigate to Dashboard → Cards
2. Click "Bulk Generate"
3. Select members using checkboxes (or "Select All")
4. Optionally adjust validity period
5. Click "Generate X Cards"
6. All cards appear in table

### Download Card

1. Find card in table
2. Click download icon button
3. Card downloads as PNG image
4. Open image to view/print

### Customize Template

1. Navigate to Template tab
2. Edit title and subtitle
3. Choose colors using color inputs
4. Preview updates in real-time
5. Click "Save Template"
6. Template persists for future cards

### Configure Settings

1. Navigate to Settings tab
2. Set default validity period
3. Check/uncheck QR code data options
4. Click "Save Settings"
5. Settings apply to new cards

## 🧪 Testing Checklist

- [ ] Generate single card
- [ ] Generate bulk cards (select all)
- [ ] Generate bulk cards (select some)
- [ ] Download card as image
- [ ] Revoke active card
- [ ] Customize template and save
- [ ] Configure settings and save
- [ ] Verify settings persist after page reload
- [ ] Test with different cooperatives (multi-tenancy)
- [ ] Test error handling (no member selected)
- [ ] Test loading states
- [ ] Test toast notifications

## 📱 Responsive Design

All features work on:
- Desktop (optimal experience)
- Tablet (good experience)
- Mobile (functional, may require scrolling)

## 🔄 Future Enhancements

Potential improvements:
- Real QR code generation (using qrcode library)
- PDF export for printing
- Email cards to members
- Card templates library
- Batch download all cards
- Card usage analytics
- Expiry notifications
- Auto-renewal options

## 🐛 Troubleshooting

### Cards not saving
- Check Supabase connection
- Verify RLS policies are set
- Check browser console for errors
- Ensure cooperative_settings table exists

### Template not loading
- Run database migration
- Check cooperative_id is set
- Verify user has proper role

### Download not working
- Check browser allows downloads
- Verify Canvas API support
- Check console for errors

### Toast not showing
- Verify Toaster component in layout
- Check useToast hook import
- Verify toast component exists

## 📚 Technical Stack

- **Frontend**: React, Next.js 14, TypeScript
- **UI Components**: Radix UI, Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **State Management**: React Hooks
- **Notifications**: Custom toast system
- **Image Generation**: HTML5 Canvas API

## 🎓 Code Structure

```
app/dashboard/cards/page.tsx
├── State Management (useState hooks)
├── Data Fetching (useCallback hooks)
├── Settings Loading (loadSettings, loadTemplate)
├── Card Generation (handleGenerate, handleBulkGenerate)
├── Card Operations (handleRevoke, downloadCardAsImage)
├── Settings Operations (handleSaveTemplate, handleSaveSettings)
├── UI Rendering (tabs, dialogs, tables)
└── Helper Functions (generateCardNumber, generateQRData, statusBadge)
```

## 💡 Best Practices

1. Always save template before generating cards
2. Configure settings before bulk generation
3. Test card download before distributing
4. Revoke old cards when issuing new ones
5. Use meaningful card titles for different member types
6. Keep validity periods reasonable (365 days default)
7. Include all necessary data in QR codes

---

**Version**: 2.0.0  
**Last Updated**: 2026-05-16  
**Status**: Production Ready ✅
