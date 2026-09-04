# Getting Started with APIFIX AI

Welcome to APIFIX AI, the autonomous API reliability and self-repair platform.

## Overview

APIFIX AI connects directly to your Node.js/Express and REST API codebases, monitors endpoint health, detects runtime exceptions (e.g. HTTP 500 errors), performs autonomous AI root-cause analysis, and validates AST-generated code fixes inside isolated ephemeral sandboxes.

## System Prerequisites

- **Node.js**: v18.0.0 or higher
- **Package Manager**: npm or yarn
- **Supported Frameworks**: Express, Next.js API Routes, Fastify, NestJS

## Quick Installation

```bash
# 1. Clone repository
git clone https://github.com/apifix-ai/apifix.git
cd apifix

# 2. Install backend dependencies
cd backend && npm install

# 3. Install frontend dependencies
cd ../frontend && npm install

# 4. Start local development cluster
cd .. && npm run dev
```

## First Repair Cycle in 3 Steps

1. **Open Dashboard**: Navigate to `http://localhost:3000`.
2. **Launch Demo API**: Click "⚡ Pre-Warmed Demo API" to load a reproducible HTTP 500 runtime error.
3. **Execute Self-Repair**: Click "Start Autonomous Repair" to see AI investigation, AST patch proposal, and sandbox verification in under 60 seconds.
