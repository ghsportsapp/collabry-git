# Workspace

## Overview

This project is a pnpm workspace monorepo utilizing TypeScript, designed to be an influencer marketplace platform named Collabry, targeting the Indian market. It facilitates connections between brands and influencers for various collaboration types, including paid campaigns, barter campaigns, and a sophisticated matchmaking system. The platform aims to streamline the process of discovering, engaging, and managing influencer partnerships.

## User Preferences

I prefer concise and clear explanations. Focus on the core functionality and architectural decisions rather than getting bogged down in minute details. When making changes, prioritize scalability and maintainability. I value iterative development and would like to be consulted before any major architectural changes or feature implementations. I prefer detailed explanations for significant decisions. Do not make changes to files in the `artifacts/collabry` directory without explicit approval, especially those related to UI components or authentication flows.

## System Architecture

The project is structured as a pnpm monorepo, with separate packages for different functionalities. The core technologies include Node.js 24, TypeScript 5.9, Express 5 for the API, and PostgreSQL for databases, managed by Drizzle ORM (for shared API services) and Prisma (for Collabry-specific data). Zod is used for validation.

### UI/UX Decisions

The Collabry frontend, built with React and Vite, follows an App Router-style structure. It uses Tailwind CSS for styling.
- **Color Scheme**: Primary brand color is `#F0187A` (pink), with a dark background (`#0A0A0F`) and white/gray text.
- **Typography**: Macondo Swash Caps for the logo, Merriweather for headings, and Poppins for body text.
- **Design Elements**: Features fade-in-on-scroll animations, custom dropdowns with auto-positioning, and visually distinct cards for different content sections.

### Technical Implementations

- **Authentication**: JWT-based authentication is implemented for creators, brands, and admins. Access tokens are short-lived (15 min), and refresh tokens (30 days) are managed via httpOnly cookies with rotation and reuse detection. Admin sessions include inactivity tracking.
- **API Codegen**: Orval generates API hooks and Zod schemas from OpenAPI specifications.
- **Build System**: esbuild is used for CJS bundling.
- **Landing Page CMS**: A full CRUD system allows admins to edit all aspects of the marketing landing page content, including text, images, and colors, with a preview mode. Content is stored in a `LandingPageContent` table.
- **Campaign Management**:
    - **Paid Campaigns**: 5-step creation form → PENDING_APPROVAL → admin approve/reject/hold → credits deducted on approval → LIVE. Creator eligibility requires ALL 3 to match: category + follower slab + gender. Brand selects creator → 48h confirmation window → creator confirms → deal PAYMENT_PENDING → brand pays → IN_ESCROW. New statuses: PENDING_APPROVAL, LIVE, HIDDEN (full), REJECTED, CREDIT_HOLD, EXPIRED. New fields: keyMessage, targetAudienceType, deliveryWindowDays, creditsCharged, adminRejectionReason, adminReviewedBy, heldAt, adminNotes. Application fields: confirmedAt, declinedAt, expiredAt, confirmationDeadline.
    - **Barter Campaigns**: 5-step creation form → PENDING_APPROVAL → admin approve/reject/hold → credits deducted on approval → LIVE. Same 48h creator-confirm flow as paid (no payment step — deal goes straight to IN_ESCROW on confirm). New fields: keyMessage, deliveryWindowDays, targetAudienceType, durationDays, adminRejectionReason. Application fields: confirmationDeadline, confirmedAt, declinedAt, expiredAt. Contact-info scan on brief. Product photos mandatory (min 1, max 5). Admin settings: barter_credits_cost, min_barter_days, max_barter_days, max_barter_slots, min_barter_product_value. Barter dispute outcomes: account actions only, no monetary levers. Campaign statuses: PENDING_APPROVAL, LIVE, HIDDEN (all slots active), REJECTED, CREDIT_HOLD, EXPIRED. `creditsCharged` defaults to 0 at submission, updated on approval.
    - **Eligibility Engine**: Filters creators based on exact category + follower slab + gender (all 3 must match, not a 2-of-3 score).
- **Matchmaking System**:
    - A sophisticated 8-parameter scoring engine (category, goal, gender, age, customer type, location, price fit, purchase type) with configurable weights and tie-breakers.
    - Admin panel for configuring scoring weights, field options, result filters, and adjacency rules (category, goal, location, customer type).
    - Brand-facing brief form uses admin-configured options and persists data in session storage.
- **KYC Flow**: Admin-configurable KYC fields for creators, supporting multiple field types (text, number, textarea) and status tracking (NOT\_SUBMITTED, SUBMITTED, VERIFIED, REJECTED).

### Feature Specifications

- **Creator Profiles**: Detailed profiles with pricing slab selectors, editable by creators. Pricing slabs are locked for a period after signup or change.
- **Admin Panels**: Comprehensive admin interfaces for managing:
    - Landing page content
    - Brand onboarding (custom signup fields, brand suspension, credit adjustments)
    - Creator onboarding (applications, signup configuration, info cards, messages)
    - Matchmaking configuration
    - Pricing slabs
    - Campaign and barter moderation
- **Credit System**: Brands can purchase credits via Razorpay, manage balances, and view transaction history. Credits are used to unlock creator profiles.

## External Dependencies

- **Database**: PostgreSQL (via Neon.tech for Collabry)
- **ORMs**: Drizzle ORM, Prisma
- **Cloud Storage**: Cloudinary (for file uploads)
- **Payment Gateway**: Razorpay (for INR payments and escrow)
- **Messaging**:
    - Firebase Cloud Messaging (for push notifications)
    - Brevo / Nodemailer (for email notifications, e.g., admin OTPs)
- **Other**:
    - Zod (`zod/v4`, `drizzle-zod`) for validation
    - Orval for API client generation
    - esbuild for bundling