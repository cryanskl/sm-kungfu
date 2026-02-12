import { Decision, SecondMeUserInfo, SecondMeShade } from '../types';

// 官方 API Base URL
const SM_BASE = 'https://app.mindos.com/gate/lab';

// ============================================================
// SecondMe API 客户端
// 参考：https://develop-docs.second.me/zh/docs/api-reference/secondme
// 所有路径前缀: {SM_BASE}/api/secondme/...
// ============================================================

export class SecondMeClient {
  private token: string;

  constructor(accessToken: string) {
    this.token = accessToken;
  }

  // --- Token 刷新（静态方法）---
  // POST {base_url}/api/oauth/token/refresh
  // Content-Type: application/x-www-form-urlencoded
  static async refreshToken(refreshTokenStr: string): Promise<{
    accessToken: string; refreshToken: string; expiresIn: number;
  } | null> {
    try {
      const res = await fetch(`${SM_BASE}/api/oauth/token/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshTokenStr,
          client_id: process.env.SECONDME_CLIENT_ID || '',
          client_secret: process.env.SECONDME_CLIENT_SECRET || '',
        }),
      });
      if (!res.ok) {
        console.error('[SM] refreshToken HTTP failed:', res.status);
        return null;
      }
      const result = await res.json();
      if (result.code !== 0 || !result.data) {
        console.error('[SM] refreshToken API failed:', result);
        return null;
      }
      return {
        accessToken: result.data.accessToken,
        refreshToken: result.data.refreshToken,
        expiresIn: result.data.expiresIn || 7200,
      };
    } catch (err) {
      console.error('[SM] refreshToken error:', err);
      return null;
    }
  }

  private headers() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  // --- 用户信息 ---
  // GET /api/secondme/user/info → { code: 0, data: { userId, name, avatar, ... } }
  async getUserInfo(): Promise<SecondMeUserInfo | null> {
    try {
      const res = await fetch(`${SM_BASE}/api/secondme/user/info`, { headers: this.headers() });
      if (!res.ok) {
        console.error('[SM] getUserInfo failed:', res.status);
        return null;
      }
      const result = await res.json();
      if (result.code !== 0 || !result.data) return null;
      return result.data;
    } catch (err) {
      console.error('[SM] getUserInfo error:', err);
      return null;
    }
  }

  // --- 性格标签 ---
  // GET /api/secondme/user/shades → { code: 0, data: { shades: [...] } }
  // 注意：路径是 shades（复数），数据在 result.data.shades
  async getShades(): Promise<SecondMeShade[]> {
    try {
      const res = await fetch(`${SM_BASE}/api/secondme/user/shades`, { headers: this.headers() });
      if (!res.ok) {
        console.error('[SM] getShades failed:', res.status);
        return [];
      }
      const result = await res.json();
      if (result.code !== 0 || !result.data) return [];
      return result.data.shades || [];
    } catch (err) {
      console.error('[SM] getShades error:', err);
      return [];
    }
  }

  // --- Act API（结构化动作判断，SSE 流式）---
  // POST /api/secondme/act/stream
  // SSE 格式: data: {"choices":[{"delta":{"content":"..."}}]}
  async act(message: string, actionControl?: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s 超时

    try {
      const body: Record<string, string> = { message };
      if (actionControl) {
        body.actionControl = actionControl;
      } else {
        // 默认 actionControl：要求只返回 JSON
        body.actionControl = '仅输出合法 JSON 对象，不要解释。';
      }

      const res = await fetch(`${SM_BASE}/api/secondme/act/stream`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        console.error('[SM] act failed:', res.status);
        return '';
      }

      // 处理 SSE 流：拼接 choices[0].delta.content
      const text = await res.text();
      const lines = text.split('\n');
      let result = '';
      for (const line of lines) {
        if (line.startsWith('data:')) {
          const chunk = line.slice(5).trim();
          if (chunk === '[DONE]') break;
          try {
            const parsed = JSON.parse(chunk);
            // 官方 SSE 格式：{"choices":[{"delta":{"content":"..."}}]}
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              result += delta;
            } else if (parsed.content || parsed.text) {
              // 兼容旧格式 fallback
              result += parsed.content || parsed.text || '';
            }
          } catch {
            // 非 JSON 行，可能是 session 事件等，跳过
          }
        }
      }
      return result || '';
    } catch (err) {
      console.error('[SM] act error:', err);
      return '';
    } finally {
      clearTimeout(timeout);
    }
  }

  // --- 获取 AI 决策 ---
  async getDecision(prompt: string): Promise<Decision> {
    // Act API 的 actionControl 定义返回 JSON 结构和判断规则
    const actionControl = `仅输出合法 JSON 对象，不要解释，不要 markdown 包裹。
输出结构：{"action": "fight|train|explore|ally|betray|rest", "target": "目标英雄名或null", "taunt": "对外宣言15字内", "reason": "内心独白15字内", "sign_death_pact": true或false或不填}。
根据消息中描述的局势和你的性格做出判断。`;

    const raw = await this.act(prompt, actionControl);
    return parseAiResponse(raw);
  }

  // --- 获取一句话宣言 ---
  async getSpeech(prompt: string): Promise<string> {
    const raw = await this.act(prompt);
    // 去掉引号和多余空白
    return raw.replace(/["""'']/g, '').trim().slice(0, 50) || '……';
  }
}

// ============================================================
// JSON 三层解析
// ============================================================

export function parseAiResponse(raw: string): Decision {
  const defaultDecision: Decision = { action: 'train', target: null, taunt: '……', reason: '……' };

  if (!raw || raw.trim().length === 0) return defaultDecision;

  // 第1层：直接解析
  try {
    const parsed = JSON.parse(raw);
    return validateDecision(parsed);
  } catch { /* continue */ }

  // 第2层：提取 {...} 部分
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return validateDecision(parsed);
    }
  } catch { /* continue */ }

  // 第3层：正则提取关键字段
  try {
    const action = raw.match(/"action"\s*:\s*"(\w+)"/)?.[1] || 'train';
    const target = raw.match(/"target"\s*:\s*"([^"]+)"/)?.[1] || null;
    const taunt = raw.match(/"taunt"\s*:\s*"([^"]+)"/)?.[1] || '……';
    const reason = raw.match(/"reason"\s*:\s*"([^"]+)"/)?.[1] || '……';
    const signMatch = raw.match(/"sign_death_pact"\s*:\s*(true|false)/);
    return {
      action: action as Decision['action'],
      target,
      taunt: taunt.slice(0, 50),
      reason: reason.slice(0, 50),
      signDeathPact: signMatch ? signMatch[1] === 'true' : undefined,
    };
  } catch { /* continue */ }

  return defaultDecision;
}

function validateDecision(obj: any): Decision {
  const validActions = ['fight', 'train', 'explore', 'ally', 'betray', 'rest'];
  const action = validActions.includes(obj?.action) ? obj.action : 'train';
  return {
    action,
    target: typeof obj?.target === 'string' ? obj.target.slice(0, 50) : null,
    taunt: typeof obj?.taunt === 'string' ? obj.taunt.slice(0, 50) : '……',
    reason: typeof obj?.reason === 'string' ? obj.reason.slice(0, 50) : '……',
    signDeathPact: typeof obj?.sign_death_pact === 'boolean' ? obj.sign_death_pact : undefined,
  };
}

// ============================================================
// 性格 → 属性映射
// ============================================================

// confidenceLevel 字符串 → 数值映射
function confidenceToNumber(level: string): number {
  const map: Record<string, number> = {
    'VERY_HIGH': 1.0,
    'HIGH': 0.8,
    'MEDIUM': 0.6,
    'LOW': 0.4,
    'VERY_LOW': 0.2,
  };
  return map[level] || 0.5;
}

export function shadesToAttributes(shades: SecondMeShade[]): {
  strength: number; innerForce: number; agility: number;
  wisdom: number; constitution: number; charisma: number;
  faction: string; personalityType: string;
} {
  // 基础属性 10
  let str = 10, int = 10, agi = 10, wis = 10, con = 10, cha = 10;

  // 根据 shade 标签映射（使用 shadeName 和 confidenceLevel）
  for (const shade of shades) {
    const conf = confidenceToNumber(shade.confidenceLevel);
    const bonus = Math.round(conf * 10);
    // 同时用 shadeName 和 shadeDescription / shadeContent 做关键词匹配
    const text = [
      shade.shadeName || '',
      shade.shadeDescription || '',
      shade.shadeContent || '',
      shade.shadeNamePublic || '',
    ].join(' ').toLowerCase();

    if (['bold', 'assertive', 'competitive', 'aggressive', 'decisive', '果断', '外向', '运动', '冒险'].some(k => text.includes(k))) {
      str += bonus;
    }
    if (['creative', 'thoughtful', 'deep', 'intellectual', '创造', '思考', '哲学', '文学'].some(k => text.includes(k))) {
      int += bonus;
    }
    if (['flexible', 'humorous', 'witty', 'adaptable', '灵活', '幽默', '机智', '反应'].some(k => text.includes(k))) {
      agi += bonus;
    }
    if (['analytical', 'logical', 'strategic', 'rational', '分析', '逻辑', '理性', '科技'].some(k => text.includes(k))) {
      wis += bonus;
    }
    if (['steady', 'resilient', 'patient', 'reliable', '稳重', '坚韧', '耐心', '可靠'].some(k => text.includes(k))) {
      con += bonus;
    }
    if (['friendly', 'empathetic', 'leader', 'social', '亲和', '领导', '社交', '沟通'].some(k => text.includes(k))) {
      cha += bonus;
    }
  }

  // 限制每项最大 30
  str = Math.min(str, 30);
  int = Math.min(int, 30);
  agi = Math.min(agi, 30);
  wis = Math.min(wis, 30);
  con = Math.min(con, 30);
  cha = Math.min(cha, 30);

  // 根据最高属性分配门派
  const attrs = { strength: str, innerForce: int, agility: agi, wisdom: wis, constitution: con, charisma: cha };
  const sorted = Object.entries(attrs).sort((a, b) => b[1] - a[1]);
  const [top1, top2] = sorted;

  let faction = '少林';
  if (top1[0] === 'strength' && top2[0] === 'constitution') faction = '少林';
  else if (top1[0] === 'innerForce' || top2[0] === 'wisdom') faction = '武当';
  else if (top1[0] === 'agility') faction = '峨眉';
  else if (top1[0] === 'strength' && top2[0] === 'agility') faction = '华山';
  else if (top1[0] === 'wisdom' || top1[0] === 'charisma') faction = '逍遥';
  else if (top1[0] === 'constitution' && top2[0] === 'charisma') faction = '丐帮';
  else if (top1[0] === 'strength' && top2[0] === 'innerForce') faction = '魔教';

  // 性格类型
  let personalityType = 'random';
  if (str >= 20) personalityType = 'aggressive';
  else if (con >= 20 || wis >= 20) personalityType = 'cautious';
  else if (cha >= 20 || wis >= 18) personalityType = 'cunning';

  return { strength: str, innerForce: int, agility: agi, wisdom: wis, constitution: con, charisma: cha, faction, personalityType };
}
