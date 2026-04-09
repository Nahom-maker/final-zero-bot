# Zero AI Telegram Bot

A production-grade Telegram AI chatbot powered by NVIDIA NIM (LLaMA 3.1 & DeepSeek) and Supabase, designed for zero-downtime deployment on Leapcell via webhooks.

## Features

- **Dual Model System**: Switch between Fast (LLaMA 3.1 253B) and Thinker (DeepSeek R1) models instantly via inline buttons.
- **Persistent Memory**: Uses Supabase to store conversation history and user preferences.
- **Smart Formatting**: Cleans up AI output, handles math/LaTeX, repairs broken markdown, and correctly escapes Telegram MarkdownV2 characters.
- **Semantic Pagination**: Automatically splits long responses by paragraphs/sentences (not arbitrary character limits) with interactive Previous/Next buttons.
- **Document Support**: Upload PDF or text files to chat and ask questions about their content.
- **Robust Reliability**: Exponential retry logic, timeout handling, error reporting, and duplicate update prevention.
- **Deployment Ready**: Fully configured for Leapcell with Dockerfile and `leapcell.yaml`.

## Prerequisites

- [Node.js](https://nodejs.org) >= 18.0.0
- A [Supabase](https://supabase.com) project
- An [NVIDIA NIM](https://build.nvidia.com) account for API keys
- A [Telegram Bot](https://t.me/BotFather) token

## Setup Instructions

1. **Clone & Install**:
   ```bash
   npm install
   ```

2. **Database Setup**:
   Execute the contents of `supabase_schema.sql` in your Supabase SQL Editor.

3. **Configure Environment**:
   Copy `.env.example` to `.env` and fill in your keys:
   ```bash
   cp .env.example .env
   ```

4. **Local Development**:
   To receive Telegram webhooks locally, you must expose your local server to the internet using a tool like `ngrok`:
   ```bash
   ngrok http 3000
   ```
   Update `WEBHOOK_URL` in your `.env` with the ngrok HTTPS URL, then start the server:
   ```bash
   npm run dev
   ```

## Deployment (Leapcell)

This project is tailored to deploy seamlessly on Leapcell.

1. Create a new service on Leapcell connected to your repository.
2. In the deployment settings, input the environment variables from your `.env` file.
3. Node environment expects `NODE_ENV=production`.
4. Deploy! The application will automatically register its webhook URL with Telegram upon startup.
