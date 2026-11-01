# Fluffy Question Buddy

A kid-friendly question-and-answer web app. Children ask anything, in text or by voice, and Fluffy, a cuddly animated mascot, answers in simple, safe language using an AI model on Ollama Cloud.

## Features

- **Kid-safe answers** with a kid mode enabled by default
- **Voice in and out**: speech recognition for asking, speech synthesis for reading answers aloud
- **Multiple kid profiles**, each with its own history, level and memories
- **Levels and badges**: a new level every 15 questions, with sticker badges as rewards
- **Themes** to customise the look of the app and of Fluffy
- **Settings page** for the model, temperature, answer length, voice and a connection test
- No build step: plain HTML, CSS and JavaScript

## Requirements

- Python 3 (for the local server) or Netlify (for hosting)
- An [Ollama Cloud](https://ollama.com) API key

## Running locally

```bash
./fluffy.sh start      # http://127.0.0.1:8000
./fluffy.sh status
./fluffy.sh restart
./fluffy.sh stop
```

Without the helper script:

```bash
python server.py 8000
```

`server.py` serves the static files and proxies `POST /api/chat` to Ollama Cloud. The proxy is needed because ollama.com doesn't send CORS headers, so the browser can't call it directly.

Set the API key as an environment variable so it stays on the server:

```bash
export OLLAMA_API_KEY=your-key
./fluffy.sh start
```

Without it, you can paste the key into the **Settings** page and it is forwarded with each request.

`PORT` and `HOST` can also be overridden, for example `PORT=9000 ./fluffy.sh start`. Server output goes to `.fluffy-server.log`.

## Deploying to Netlify

`netlify.toml` publishes the repository root and routes `/api/chat` to the serverless function in `netlify/functions/chat.js`, which does the same proxying as `server.py`. Add `OLLAMA_API_KEY` under **Site settings → Environment variables**. The config also sets security headers (no framing, `nosniff`, no referrer) and allows microphone access for voice input.

## Configuration

Defaults live in `shared.js` and can be changed on the Settings page:

| Setting | Default |
| --- | --- |
| Model | `gemma4:31b` |
| Temperature | `0.6` |
| Max tokens | `256` |
| Kid mode | on |
| Speak answers | on |
| Voice input | on |

## Project layout

```text
index.html, app.js      main chat screen
settings.html, .js      settings and connection test
shared.js               settings, profiles, levels, badges, themes
styles.css              styling
stickers/               SVG badge artwork
server.py               local static server and chat proxy
netlify/functions/      hosted chat proxy
fluffy.sh               start, stop, restart and status helper
```

## Notes

Voice features rely on the browser's Web Speech API. Support varies, and Chrome and Edge work best.

