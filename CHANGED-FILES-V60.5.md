# Changed Files - V60.5

1. `backend/src/routes/academyAdminRoutes.js`
   - Added `/academy-admin/purchases` endpoint for individual course-purchase invoice visibility in Client Admin.

2. `backend/src/services/certificatePdf.js`
   - Redesigned certificate PDF layout to better match approved Singh Academy visual theme.

3. `frontend/components/business/BusinessPortal.tsx`
   - Added **Course purchases** navigation item and screen in Client Admin.
   - Updated footer version label to V60.5.

4. `frontend/components/business/AdminCoursePurchases.tsx`
   - New read-only Client Admin table for individual course invoices / purchase records.

5. `frontend/app/home/page.tsx`
   - Added membership-aware course card labels so active members see **Membership Access** instead of a visible price for covered courses.

6. `frontend/app/courses/page.tsx`
   - Added membership-aware course card labels on the full Courses page.

7. `V60.5-FIX-NOTES.md`
   - Summary of fixes in this package.
