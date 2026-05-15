# sample-ecom-api

A NestJS e-commerce API. 103 endpoints, 28 models, 378 tests.

## Stack
- NestJS 10 + Prisma 6 + PostgreSQL 16
- BullMQ for background jobs
- Razorpay payments + MSG91 OTP + Shiprocket delivery

## Setup
```bash
npm install
cp .env.example .env
npx prisma migrate dev
npm run start:dev
```

## Key modules
auth · users · products · categories · cart · orders · payments · delivery · invoices · coupons · reviews · wishlist · notifications · search · tax · upload
