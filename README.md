# IA Microservice

A simple but useful Node.js microservice that receives a `GET` request, sends the prompt to OpenRouter, and returns the model response in a few seconds as JSON.

## What This Project Does

This service acts as a lightweight proxy between your client and the OpenRouter chat completions API, and now also includes a browser-based CV markdown studio.

It accepts:

- an OpenRouter token through the query string
- an optional model name
- an optional prompt

Then it:

1. validates the request
2. sends a `POST` request to OpenRouter
3. waits for the AI response
4. returns a JSON payload with the answer and the raw provider response

The project is intentionally small:

- no framework required
- one lightweight runtime dependency for PDF generation
- only Node.js built-in modules

## Requirements

- Node.js 18 or newer

## Project Files

- `server.js`: HTTP server and OpenRouter integration
- `package.json`: project metadata and run script
- `.gitignore`: ignores local generated files like `node_modules`

## How It Works

The microservice exposes a small browser UI plus API routes:

### `GET /`

Loads the CV Studio interface:

- left side: editable `cv.md` markdown
- right side: live CV preview
- import `.md`, load example, download `.md`, download PDF
- local autosave in `localStorage`

### `GET /ask`

This is the main route.

Accepted query parameters:

- `token` required, your OpenRouter API key
- `model` optional, defaults to `qwen/qwen3.6-plus:free`
- `prompt` optional, defaults to `Say hello in one short sentence.`

When `/ask` receives a valid request, the service sends this payload to OpenRouter:

```json
{
  "model": "qwen/qwen3.6-plus:free",
  "messages": [
    {
      "role": "user",
      "content": "Your prompt here"
    }
  ]
}
```

The request is sent to:

```text
https://openrouter.ai/api/v1/chat/completions
```

If OpenRouter replies successfully, the service returns:

- `ok: true`
- the model used
- the prompt sent
- the extracted text response
- the raw OpenRouter response

If something fails, the service returns a JSON error with a suitable HTTP status code.

### `GET /cv.pdf`

Generates a PDF version of the markdown CV using a classic Harvard-style layout.

Accepted query parameters:

- `file` optional, `cv.md` by default, or `cv-example.md`

Examples:

```text
http://localhost:3002/cv.pdf
http://localhost:3002/cv.pdf?file=cv-example.md
```

The response is streamed directly as a PDF and can be opened in the browser or downloaded by the client.

### `GET /api/cv?file=cv.md`

Returns the raw markdown source for `cv.md` or `cv-example.md`.

### `POST /api/preview.pdf`

Generates a downloadable PDF from markdown sent in the request body.

Example body:

```json
{
  "markdown": "# CV -- Jane Doe\n\n## Skills\n- Node.js"
}
```

## How To Run

Install Node.js, open this folder, and start the service:

```bash
npm start
```

By default the server runs on:

```text
http://localhost:3002
```

You can change the port with an environment variable:

```bash
PORT=8080 npm start
```

On PowerShell:

```powershell
$env:PORT=8080
npm start
```

## Docker

Build and start the service with Docker Compose:

```bash
docker compose up --build -d
```

Open the app at:

```text
http://localhost:3002/
```

Useful commands:

```bash
docker compose ps
docker compose logs -f
docker compose down
```

This Docker stack now includes:

- the Node.js app on `http://localhost:3002`
- a PostgreSQL database persisted in a Docker volume
- an Adminer web UI on `http://localhost:8081`
- email/password authentication for PDF downloads
- background sync of the app local state while the user is logged in

Adminer is preconfigured to point at `postgres`, so log in with the PostgreSQL values from your `.env`:

- System: `PostgreSQL`
- Server: `postgres`
- Username: `POSTGRES_USER`
- Password: `POSTGRES_PASSWORD`
- Database: `POSTGRES_DB`

To connect to the database, create a new server with:

- Host name/address: `postgres`
- Port: `5432`
- Maintenance database: `POSTGRES_DB`
- Username: `POSTGRES_USER`
- Password: `POSTGRES_PASSWORD`

## Stripe CLI (Para Webhooks Locales)

Para procesar los pagos y suscripciones de prueba en local, necesitas redirigir los webhooks de Stripe hacia tu contenedor de desarrollo.

Pasa la clave `STRIPE_SECRET_KEY` que se encuentra en tu archivo `.env` directamente al contenedor de Stripe CLI:

```bash
docker run --rm stripe/stripe-cli:latest listen --api-key TU_STRIPE_SECRET_KEY --forward-to host.docker.internal:3002/api/stripe/webhook
```

Al iniciar, te mostrará un mensaje como:
`Ready! ... Your webhook signing secret is whsec_...`

Copia ese valor `whsec_...` y pégalo en la variable `STRIPE_WEBHOOK_SECRET` de tu archivo `.env`. Reinicia el contenedor de la aplicación para aplicar los cambios:

```bash
docker compose restart ia-microservice
```

## How To Use It

### 1. Check the service

Open this URL in your browser:

```text
http://localhost:3002/
```

You should see the markdown editor and the live CV preview.

### 2. Send a prompt to OpenRouter

Example:

```text
http://localhost:3002/ask?token=YOUR_OPENROUTER_TOKEN&prompt=Explain%20AI%20in%20one%20sentence
```

Example with a custom model:

```text
http://localhost:3002/ask?token=YOUR_OPENROUTER_TOKEN&model=openai/gpt-4o-mini&prompt=Write%20a%20short%20welcome%20message
```

### 3. Read the response

Typical successful response:

```json
{
  "ok": true,
  "model": "qwen/qwen3.6-plus:free",
  "prompt": "Explain AI in one sentence",
  "response": "AI is the ability of software to perform tasks that normally require human intelligence.",
  "raw": {}
}
```

### 4. Generate the CV PDF

Open:

```text
http://localhost:3002/cv.pdf
```

Or render the example markdown:

```text
http://localhost:3002/cv.pdf?file=cv-example.md
```

## Error Cases

### Missing token

If `token` is not provided, the service returns:

```json
{
  "ok": false,
  "error": "Missing required query parameter: token"
}
```

### Timeout or upstream error

If OpenRouter takes too long or returns an error, the service forwards that failure as JSON so your client can handle it easily.

## Notes

- The OpenRouter token is currently passed through the URL because that is what this microservice was designed to accept.
- In production, sending tokens in query parameters is less secure than sending them in headers or environment variables.
- This project uses the OpenRouter chat completions endpoint described in the Quickstart documentation.
