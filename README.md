# FamilyBudget

מערכת Production-ready לניהול תקציב והוצאות משפחתיות, עם Next.js App Router, TypeScript, Tailwind CSS, Prisma ו-Neon PostgreSQL.

## מה כלול

- ממשק עברי מלא עם RTL.
- הרשמה/כניסה עם bcrypt ו-JWT Session ב-cookie HttpOnly.
- כל ה-API דורש משתמש מחובר.
- בידוד נתונים לפי `userId`.
- CRUD לתנועות.
- קטגוריות הכנסה/הוצאה.
- אמצעי תשלום עם שמירה מוגבלת ל-`last4`, כינוי ומוסד בלבד.
- תקציבים חודשיים לפי קטגוריה.
- Dashboard חודשי.
- Render Blueprint.
- Prisma migrations.
- אין secrets בקוד.

## התקנה מקומית

1. צור Neon database.
2. העתק `.env.example` ל-`.env`.
3. מלא `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`.
4. הרץ:

```bash
npm install
npx prisma migrate dev --name init
npm run dev
```

פתח `http://localhost:3000`.

## Deploy ל-Render + Neon

1. צור פרויקט PostgreSQL ב-Neon.
2. העתק את connection string של ה-pooled endpoint אל `DATABASE_URL`.
3. העלה את הפרויקט ל-GitHub.
4. ב-Render בחר New > Blueprint וחבר את הריפו.
5. הגדר `DATABASE_URL` ואת `NEXT_PUBLIC_APP_URL` אם Render לא הגדיר אותם.
6. `AUTH_SECRET` נוצר אוטומטית ב-Blueprint.
7. ה-build מריץ `npm run build`, שבתוכו Prisma Client נוצר, המיגרציות נפרסות, ולאחר מכן Next.js נבנה.

> חשוב: `DATABASE_URL` הוא משתנה חובה ב-Render. אין ליצור או להוסיף ערך דמה. יש להגדיר את ה-connection string האמיתי של בסיס הנתונים שבו המערכת אמורה להשתמש.

## אבטחה

אין במודל נתונים שדות עבור מספר כרטיס מלא, CVV, תוקף או מספרי זיהוי. גם אם לקוח שולח שדה לא צפוי, ה-Zod schemas מגדירים את הקלט המותר.

ה-JWT נמצא ב-HttpOnly cookie ואינו חשוף ל-JavaScript בדפדפן.

ב-production מומלץ בנוסף:
- להפעיל MFA ברמת ספק זהות אם בעתיד מוסיפים SSO.
- להגדיר rate limiting ל-login דרך edge/WAF או ספק חיצוני.
- להגדיר ניטור שגיאות והתראות.
- לגבות Neon ולבדוק restore תקופתי.
- להוסיף CSRF defense אם עוברים ל-cross-site mutation patterns או domain split.
