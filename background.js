chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req && req.type === "fetch") {
    fetch(req.url, { method: req.method || "GET", headers: req.headers || {}, body: req.body || null, credentials: "include" })
      .then(r => Promise.all([r.text(), r.status, Array.from(r.headers.entries())]))
      .then(([text, status, headers]) => sendResponse({ text, status, headers }))
      .catch(e => sendResponse({ error: String(e) }));
    return true;
  }
});
