(async () => {
  const GM_addStyle = css => { const s = document.createElement("style"); s.textContent = css; document.documentElement.appendChild(s); };
  const GM_setValue = async (k, v) => { await chrome.storage.local.set({ [k]: v }); };
  const GM_getValue = async (k, d = null) => { const r = await chrome.storage.local.get(k); return r[k] ?? d; };
  const GM_xmlhttpRequest = opts => new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "fetch", url: opts.url, method: opts.method, headers: opts.headers, body: opts.data }, res => {
      if (!res || res.error) return reject(res?.error || "unknown");
      const text = res.text || "";
      const doc = new DOMParser().parseFromString(text, "text/html");
      resolve({ responseText: text, doc, response: { status: res.status || 200, headers: new Map(res.headers || []) } });
    });
  });
  const modUrl = chrome.runtime.getURL("modules/app.js");
  const AppMod = await import(modUrl);
  await AppMod.start({ GM_addStyle, GM_setValue, GM_getValue, GM_xmlhttpRequest });
})();
