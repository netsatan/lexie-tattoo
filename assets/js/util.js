export async function fetchJSON(url, options = {}) {
  const { cache = "default" } = options;
  const res = await fetch(url, { cache });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const data = await res.json();
  return { data, url: res.url || url };
}

export function resolveUrl(path, baseUrl) {
  try {
    return new URL(path, baseUrl).toString();
  } catch {
    return path;
  }
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    if (k === "class") node.className = v;
    else if (k === "dataset") {
      for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
    } else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === "html") {
      node.innerHTML = v;
    } else {
      node.setAttribute(k, v);
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined) continue;
    node.append(
      child.nodeType ? child : document.createTextNode(String(child)),
    );
  }
  return node;
}

export function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function qs(sel, root = document) {
  return root.querySelector(sel);
}
export function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}
