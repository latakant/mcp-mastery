# Changelog

## [v2.3.1] - 2026-05-10
- fix: payment webhook retry loop on 503 response
- fix: order status not updating after COD confirmation
- fix: duplicate invoice generation on rapid resubmit

## [v2.3.0] - 2026-04-28
- feat: add coupon stacking support (max 2 per order)
- feat: new admin dashboard — revenue breakdown by category
- feat: SMS notification on order status change (MSG91)
- fix: cart total incorrect when variant price differs from base

## [v2.2.2] - 2026-04-15
- fix: GST calculation wrong for inter-state orders above ₹50k
- fix: search returning deleted products
- patch: increase Razorpay webhook timeout to 30s

## [v2.2.1] - 2026-04-02
- hotfix: orders stuck in PENDING after Razorpay success webhook
- fix: missing CORS header on /api/delivery/webhook

## [v2.2.0] - 2026-03-20
- feat: Shiprocket integration — auto-create shipment on CONFIRMED
- feat: delivery tracking page for customers
- feat: admin bulk-cancel orders
- BREAKING: order.deliveryStatus field renamed to order.shipmentStatus
- fix: review moderation not saving admin decision

## [v2.1.0] - 2026-03-05
- feat: wishlist API (add, remove, list)
- feat: product recommendations on cart page
- fix: user profile update wiping phone number
- fix: category tree depth limit causing 500 on deeply nested categories

## [v2.0.0] - 2026-02-18
- BREAKING: auth tokens now expire in 7 days (was 30)
- BREAKING: /api/v1/* endpoints removed — use /api/*
- feat: complete RBAC rewrite — 4 roles: CUSTOMER, VENDOR, ADMIN, SUPERADMIN
- feat: phone OTP auth via MSG91
- feat: JWT refresh token rotation
