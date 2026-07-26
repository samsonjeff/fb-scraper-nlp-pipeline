# FB-page Messenger bot

FB-page Messenger bot is an intelligent Facebook Messenger chatbot built with Node.js and Express. It connects to the Meta Messenger Platform API to receive messages and uses AI (Groq/Gemini) to automatically generate and send contextual replies. It also features a real-time MongoDB database to log all conversations, making it an excellent data-collection tool for NLP projects.

## What it does

When a customer sends a message to the connected Facebook Page, FB-page Messenger bot:
1. Receives the message via a webhook.
2. Queries an AI model (Groq's Llama 3 by default) to generate a helpful response based on a customizable system prompt.
3. Automatically falls back to Google Gemini if the primary AI provider fails.
4. Saves the entire conversation history to a MongoDB database.
5. Sends the AI's reply back to the user on Messenger.

## Key Features

- **Multi-AI Support:** Uses Groq (Llama) as the primary engine and Google Gemini as a reliable fallback.
- **Data Collection:** Logs all `senderPSID`, `userMessage`, `aiReply`, and timestamps to a MongoDB database for future NLP training or analysis.
- **Built-in Dashboard:** Features a live, auto-refreshing dashboard to monitor incoming messages and AI replies.
- **Localtunnel Integration:** Easily expose your local environment to the internet using `localtunnel` without worrying about executable blocks.

## Tech Stack

- **Node.js & Express** (Backend framework)
- **Groq SDK** (Primary AI Generation)
- **Google Generative AI** (Fallback AI Generation)
- **Mongoose & MongoDB Atlas** (Database and Schemas)
- **Axios** (Meta Graph API requests)
- **Localtunnel** (Expose local server to the web)

## Prerequisites

- A Facebook account, a Facebook Page, and a Meta Developer account.
- Free API keys from [Groq](https://console.groq.com) and [Google AI Studio (Gemini)](https://aistudio.google.com).
- A free MongoDB Atlas cluster.
- Node.js installed.

## Setup

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/samsonjeff/tested-messenger-bot.git
   **cd file name**
   npm install
   ```

2. Create a `.env` file in the root directory. You can use the provided template or ensure it has the following keys:
   ```env
   # Server config
   PORT=3000
   
   # Meta Platform
   PAGE_ACCESS_TOKEN=your_permanent_page_access_token
   APP_SECRET=your_app_secret
   VERIFY_TOKEN=your_custom_verify_token
   GRAPH_API_VERSION=v25.0
   
   # AI Providers
   GROQ_API_KEY=your_groq_key
   GROQ_MODEL=llama-3.3-70b-versatile
   GEMINI_API_KEY=your_gemini_key
   GEMINI_MODEL=gemini-2.5-flash
   BOT_SYSTEM_PROMPT="You are a helpful, concise assistant replying to customers over Facebook Messenger."
   
   # Database
   MONGODB_URI=your_mongodb_connection_string
   ```

3. Start the server (runs the webhook and the dashboard):
   ```bash
   npm start
   ```

4. In a second terminal, expose your local server to the web using the built-in tunnel script:
   ```bash
   npm run tunnel
   ```
   *(Note: When you open the localtunnel URL for the first time, you must click the "Click to Continue" button in your browser to bypass the anti-abuse screen).*

5. In the Meta App dashboard, set the webhook **Callback URL** to your localtunnel link plus `/webhook` (e.g., `https://your-url.loca.lt/webhook`), enter your `VERIFY_TOKEN`, and subscribe to the `messages` field.

6. (Optional) Run the subscribe script once to link the Page to the app if you haven't done it via the Meta UI:
   ```bash
   node subscribe.js
   ```

## Monitoring & NLP Data Collection

- **Dashboard:** Visit `http://localhost:3000/dashboard` while your server is running to view a live feed of all conversations and AI fallback statistics.
- **Database:** All conversations are saved in the `bot_conversations` collection in your MongoDB cluster. This raw text data can easily be exported later as JSONL or CSV for intent classification, sentiment analysis, or fine-tuning custom NLP models.

## Deployment

This app is production-ready. To deploy it to a free host like **Render**:
1. Push your code to GitHub (ensure `.env` is ignored!).
2. Connect the repository to Render as a "Web Service".
3. Use the start command `npm start`.
4. Add all your variables from `.env` directly into the Render dashboard Environment Variables section.
5. Update your Meta Webhook URL to the permanent Render URL.

## Author & License

Built by **Samsonjeff** as a learning project on the Meta Messenger Platform API. Expanded to support multi-AI routing and NLP data collection.

This project is shared for educational purposes. Please give credit if you use any part of it.
