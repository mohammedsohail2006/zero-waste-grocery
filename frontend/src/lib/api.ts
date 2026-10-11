const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function getHealth() {
  const response = await fetch(`${API_BASE}/health`);
  if (!response.ok) throw new Error(`API health check failed (${response.status})`);
  return response.json() as Promise<{ status: string; service: string }>;
}

export async function postCopilotQuestion(question: string) {
  const response = await fetch(`${API_BASE}/api/v1/copilot/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!response.ok) {
    let detail = `Copilot request failed (${response.status})`;
    try {
      const body = await response.json() as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      // The API may return a non-JSON proxy error.
    }
    throw new Error(detail);
  }
  return response.json() as Promise<{ answer: string; grounded: boolean }>;
}
