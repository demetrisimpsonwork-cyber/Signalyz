# Signalyz

AI-powered career signal intelligence platform built to help job seekers understand how employers interpret experience, skills, and positioning against real job requirements.

## Overview

Signalyz analyzes resumes and job descriptions using Claude AI and proprietary scoring logic to generate actionable recommendations without fabricating experience.

The platform was built to help users improve how they communicate existing qualifications rather than rewriting their background.

## Core Features

- Resume-to-job alignment analysis
- Signal strength scoring
- Resume calibration
- Interview intelligence generation
- LinkedIn positioning recommendations
- Cover letter generation
- Subscription billing
- User authentication

## Technology Stack

Frontend
- React
- TypeScript
- Tailwind CSS

Backend
- Supabase
- PostgreSQL
- Edge Functions

AI
- Anthropic Claude API

Infrastructure
- Stripe
- Google OAuth
- Serverless Architecture

## Production Systems

The application includes multiple production edge functions responsible for:

- Resume analysis
- Content generation
- Resume summary generation
- Bullet optimization
- Payment processing
- Email workflows
- User authentication
- Document assembly

## Repository Structure

src/
Frontend application

supabase/functions/
Serverless AI services and workflow automation

supabase/migrations/
Database schema and platform infrastructure

## Live Platform

https://signalyz.ai

## Author

Demetri Simpson
