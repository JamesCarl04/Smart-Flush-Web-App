# An IoT-Based Toilet Sanitation, Analytics, and Predictive Maintenance Management System

## Project Overview

Welcome to An IoT-Based Toilet Sanitation, Analytics, and Predictive Maintenance Management System. This capstone prototype serves as the frontend management and analytics platform for the sanitation monitoring ecosystem. It provides real-time monitoring of sensor readings, flush events, lid status, UV sterilization cycles, and system alerts.

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Frontend**: React 18, TypeScript 5 (Strict Mode)
- **Styling**: Tailwind CSS 3, DaisyUI 4
- **Charts**: Recharts
- **Forms**: React Hook Form, Zod
- **Icons**: Lucide React
- **Authentication**: Firebase Client-Side Auth
- **Package Manager**: npm

## Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Variables**
   Copy `.env.example` to `.env.local` and fill in your Firebase credentials.
   ```bash
   cp .env.example .env.local
   ```

3. **Run Development Server**
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:3000`.

## Folder Structure

- `/app`: Next.js App Router pages and layouts.
  - `/(dashboard)`: Authenticated dashboard routes `/dashboard`, `/analytics`, `/configuration`, `/alerts`, `/reports`
  - `/auth`: Public authentication routes `/login`, `/register`, `/forgot-password`
- `/components`: Reusable UI elements (`/ui`, `/dashboard`, `/charts`)
- `/hooks`: Custom React hooks
- `/contexts`: React context providers
- `/types`: TypeScript interfaces for the IoT domain
- `/lib`: Global configuration and utility files (e.g. `firebase.ts`)
- `/styles`: Global styles

## Env Vars

Ensure the following variables are set for Firebase Auth and Firestore to operate correctly. Check `.env.example` for the required keys:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
