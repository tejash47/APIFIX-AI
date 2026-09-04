/**
 * APIFIX AI — Phase 23 Docker & Containerization Test Suite
 * 
 * Validates multi-stage Docker builds, non-root user execution,
 * absence of secrets in build contexts, and healthcheck configurations.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test, describe } = require('node:test');

describe('Phase 23 — Production Docker Configuration Suite', () => {

  test('1.1 Backend Dockerfile exists and uses multi-stage build', () => {
    const dockerfilePath = path.join(__dirname, '../Dockerfile');
    assert.ok(fs.existsSync(dockerfilePath), 'backend/Dockerfile must exist');
    const content = fs.readFileSync(dockerfilePath, 'utf8');
    assert.ok(content.includes('FROM node:20-alpine AS deps'));
    assert.ok(content.includes('FROM node:20-alpine AS runner'));
  });

  test('1.2 Backend Dockerfile enforces non-root user execution', () => {
    const dockerfilePath = path.join(__dirname, '../Dockerfile');
    const content = fs.readFileSync(dockerfilePath, 'utf8');
    assert.ok(content.includes('USER apifix') || content.includes('USER node'));
    assert.ok(content.includes('addgroup') && content.includes('adduser'));
  });

  test('1.3 Backend Dockerfile does not copy .env files into image', () => {
    const dockerfilePath = path.join(__dirname, '../Dockerfile');
    const content = fs.readFileSync(dockerfilePath, 'utf8');
    assert.ok(!content.includes('COPY .env'), 'Dockerfile must never copy .env files');
  });

  test('1.4 Backend Dockerfile defines production HEALTHCHECK probe', () => {
    const dockerfilePath = path.join(__dirname, '../Dockerfile');
    const content = fs.readFileSync(dockerfilePath, 'utf8');
    assert.ok(content.includes('HEALTHCHECK'));
    assert.ok(content.includes('/health'));
  });

  test('1.5 Frontend Dockerfile exists and uses multi-stage Next.js build', () => {
    const dockerfilePath = path.join(__dirname, '../../frontend/Dockerfile');
    assert.ok(fs.existsSync(dockerfilePath), 'frontend/Dockerfile must exist');
    const content = fs.readFileSync(dockerfilePath, 'utf8');
    assert.ok(content.includes('FROM node:20-alpine AS deps'));
    assert.ok(content.includes('FROM node:20-alpine AS builder'));
    assert.ok(content.includes('FROM node:20-alpine AS runner'));
  });

  test('1.6 Frontend Dockerfile enforces non-root nextjs user', () => {
    const dockerfilePath = path.join(__dirname, '../../frontend/Dockerfile');
    const content = fs.readFileSync(dockerfilePath, 'utf8');
    assert.ok(content.includes('USER nextjs'));
  });

  test('1.7 Frontend Dockerfile restricts build arguments to public NEXT_PUBLIC_* variables', () => {
    const dockerfilePath = path.join(__dirname, '../../frontend/Dockerfile');
    const content = fs.readFileSync(dockerfilePath, 'utf8');
    assert.ok(content.includes('ARG NEXT_PUBLIC_BACKEND_URL'));
    assert.ok(!content.includes('ARG JWT_SECRET'));
    assert.ok(!content.includes('ARG STRIPE_SECRET_KEY'));
  });

  test('1.8 Production Docker Compose defines resource limits and dependency health checks', () => {
    const composePath = path.join(__dirname, '../../docker-compose.production.yml');
    assert.ok(fs.existsSync(composePath), 'docker-compose.production.yml must exist');
    const content = fs.readFileSync(composePath, 'utf8');
    assert.ok(content.includes('limits:'));
    assert.ok(content.includes('condition: service_healthy'));
    assert.ok(content.includes('restart: unless-stopped'));
  });
});
