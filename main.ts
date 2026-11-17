const port = Number(Deno.env.get("PORT")) || 8080;

Deno.serve({ port }, (req) => {
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    return new Response("OK", { status: 200 });
  }

  const url = new URL(req.url);
  const dc = url.searchParams.get("dc") || "2";
  const targetUrl = `wss://kws${dc}.web.telegram.org/apiws`;

  const { socket: clientWs, response } = Deno.upgradeWebSocket(req, {
    protocol: "binary",
  });

  const upstreamWs = new WebSocket(targetUrl, "binary");
  upstreamWs.binaryType = "arraybuffer";

  const queue: ArrayBuffer[] = [];
  let isUpstreamOpen = false;

  upstreamWs.onopen = () => {
    isUpstreamOpen = true;
    while (queue.length > 0) upstreamWs.send(queue.shift()!);
  };

  clientWs.onmessage = (e) => {
    if (isUpstreamOpen && upstreamWs.readyState === WebSocket.OPEN) {
      upstreamWs.send(e.data);
    } else {
      queue.push(e.data);
    }
  };

  upstreamWs.onmessage = (e) => {
    if (clientWs.readyState === WebSocket.OPEN) clientWs.send(e.data);
  };

  clientWs.onclose = () => { try { upstreamWs.close(); } catch (_) {} };
  upstreamWs.onclose = () => { try { clientWs.close(); } catch (_) {} };
  upstreamWs.onerror = () => { try { clientWs.close(); } catch (_) {} };

  return response;
});