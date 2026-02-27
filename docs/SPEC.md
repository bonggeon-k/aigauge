# AIGauge Full Specification

## Part 1: Product Vision
FinOps dashboard for AI coding tools. Track usage, cost, ROI across 9+ providers.

## Part 2: Security Architecture
See AGENTS.md Security Rules. Threat model: T1-T6.

## Part 3: Design System
shadcn/ui + Radix + Tailwind v4 + Framer Motion. Dark/Light. Platform-aware titlebar.

## Part 4: Core Screens
1. Tray flyout  2. Detail view  3. Cost analysis

## Part 5: Provider Priority
1. Codex  2. Claude  3. Gemini  4. Kiro  5. GitHub Copilot  6. Cursor

## Part 6: Tech Architecture
Tauri 2.x, Provider trait (Rust), CredentialManager, IPC commands, React hooks.

## Part 7: Roadmap
Phase 0: Bootstrap → Phase 1: Core providers + UI → Phase 2: Cost dashboard → Phase 3: Release
