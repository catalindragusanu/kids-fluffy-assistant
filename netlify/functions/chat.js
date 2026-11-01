// Same-origin proxy for Ollama Cloud (which sends no CORS headers).
// Set OLLAMA_API_KEY in Netlify to keep the key server-side; otherwise the
// request's Authorization header is forwarded.
const UPSTREAM = "https://ollama.com/v1/chat/completions";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: { message: "Method Not Allowed" } }) };
  }

  const envKey = (process.env.OLLAMA_API_KEY || "").trim();
  const auth = envKey ? `Bearer ${envKey}` : event.headers.authorization || "";
  const headers = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = auth;

  try {
    const response = await fetch(UPSTREAM, { method: "POST", headers, body: event.body });
    return {
      statusCode: response.status,
      headers: { "Content-Type": "application/json" },
      body: await response.text(),
    };
  } catch (error) {
    return { statusCode: 502, body: JSON.stringify({ error: { message: `Proxy error: ${error.message}` } }) };
  }
};
