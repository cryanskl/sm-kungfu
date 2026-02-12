/**
 * DashScope (阿里云通义) 客户端 — 用于生成武侠背景故事等中文创作
 * 使用 OpenAI 兼容接口，模型 qwen-max
 */

const DASHSCOPE_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

export async function dashscopeChat(
  prompt: string,
  opts?: { maxTokens?: number; temperature?: number },
): Promise<string | null> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    console.warn('[DashScope] DASHSCOPE_API_KEY not set, skipping');
    return null;
  }

  try {
    const res = await fetch(`${DASHSCOPE_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'qwen-max',
        messages: [
          { role: 'system', content: '你是一位武侠小说大师，擅长用简练的文笔描绘江湖人物。' },
          { role: 'user', content: prompt },
        ],
        max_tokens: opts?.maxTokens ?? 200,
        temperature: opts?.temperature ?? 0.9,
      }),
      signal: AbortSignal.timeout(8000), // 8s 超时
    });

    if (!res.ok) {
      console.error('[DashScope] API error:', res.status, await res.text().catch(() => ''));
      return null;
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch (err: any) {
    console.error('[DashScope] Request failed:', err.message);
    return null;
  }
}
