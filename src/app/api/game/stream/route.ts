import { supabaseAdmin } from '@/lib/supabase';
import { mapGameStateRow, computeDynamicFields } from '@/lib/game/state-mapper';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // 1. 立即推送当前 game_state 快照
      const { data: initial } = await supabaseAdmin
        .from('game_state')
        .select('*')
        .eq('id', 'current')
        .single();

      if (initial) {
        const mapped = mapGameStateRow(initial);
        const withDynamic = computeDynamicFields(mapped, initial);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(withDynamic)}\n\n`));
      }

      // 2. 订阅 Supabase Realtime
      let closed = false;

      const channel = supabaseAdmin.channel('game-state-sse')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'game_state' },
          (payload) => {
            if (closed) return;
            try {
              const mapped = mapGameStateRow(payload.new);
              const withDynamic = computeDynamicFields(mapped, payload.new);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(withDynamic)}\n\n`));
            } catch {
              // ignore serialization errors
            }
          },
        )
        .subscribe();

      // 3. 心跳：每 15s 发送 keepalive
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`:keepalive\n\n`));
        } catch {
          // stream may be closed
          clearInterval(heartbeat);
        }
      }, 15000);

      // 4. 清理函数（当客户端断开时）
      const cleanup = () => {
        closed = true;
        clearInterval(heartbeat);
        try {
          supabaseAdmin.removeChannel(channel);
        } catch {
          // ignore
        }
      };

      // AbortSignal not directly available in ReadableStream start(),
      // but the controller.close/error will fire when client disconnects.
      // We use the cancel callback below.

      // Store cleanup for cancel
      (controller as any)._cleanup = cleanup;
    },

    cancel(controller) {
      // Called when the client disconnects
      const cleanup = (controller as any)?._cleanup;
      if (typeof cleanup === 'function') cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx
    },
  });
}
