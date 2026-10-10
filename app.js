// ===== Configuração: vem do arquivo config.js =====
// (se o config.js estiver vazio, usa por segurança o que a versão antiga salvou no aparelho)
const legacy = (() => { try { return JSON.parse(localStorage.getItem("catalogo-cfg") || "{}"); } catch { return {}; } })();
const fromFile = Object.fromEntries(Object.entries(window.CATALOGO_CONFIG || {}).filter(([, v]) => String(v || "").trim()));
const cfg = { ...legacy, ...fromFile };

const $ = s => document.querySelector(s);
let products = [], posts = [], view = "products";

const DEMO = [
  ["Produto","Fornecedor","Cor","Tamanho","A Vista","Parcelas","Valor Parcela"],
  ["Camiseta Básica","Fornecedor A","Preto","P","59,90","3","21,90"],
  ["Camiseta Básica","Fornecedor A","Branco","M","59,90","3","21,90"],
  ["Tênis Runner","Fornecedor B","Laranja","40","299,00","10","32,90"],
  ["Mochila Urbana","Fornecedor C","Cinza","Único","189,90","6","34,90"],
];

const idFrom = v => { if (!v) return ""; const m = v.match(/\/d\/([\w-]+)|folders\/([\w-]+)|id=([\w-]+)/); return m ? (m[1]||m[2]||m[3]) : v.trim(); };
const norm = s => (s||"").toString().normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/\.[a-z0-9]+$/,"").trim();
const money = v => { const n = parseFloat(String(v).replace(/[^\d,.-]/g,"").replace(/\.(?=\d{3})/g,"").replace(",", ".")); return isNaN(n) ? (v||"") : n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); };
const pretty = n => (n||"").replace(/\.[a-z0-9]+$/i,"").replace(/[_-]+/g," ").trim();
const slug = s => norm(s).replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || "imagem";
const esc = s => String(s??"").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ic = n => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const toast = t => { const el = $("#toast"); el.textContent = t; el.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(()=>el.classList.remove("show"), 2600); };
const thumb = (id, w=800) => `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;

function parseCSV(text){
  const rows=[]; let row=[], cell="", q=false;
  for (let i=0;i<text.length;i++){ const c=text[i];
    if (q){ if (c==='"'&&text[i+1]==='"'){cell+='"';i++;} else if (c==='"') q=false; else cell+=c; }
    else if (c==='"') q=true; else if (c===','){row.push(cell);cell="";}
    else if (c==='\n'){row.push(cell);rows.push(row);row=[];cell="";} else if (c!=='\r') cell+=c; }
  if (cell||row.length){row.push(cell);rows.push(row);}
  return rows.filter(r=>r.some(x=>x.trim()));
}

async function loadSheet(){
  const id = idFrom(cfg.sheet);
  if (!id) return DEMO;
  const r = await fetch(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`);
  if (!r.ok) throw new Error("Não foi possível ler a planilha. Verifique o compartilhamento.");
  return parseCSV(await r.text());
}

// Lista as imagens de uma pasta do Drive
async function loadFolder(folder){
  const id = idFrom(folder);
  if (!id || !cfg.key) return [];
  const out = []; let token = "";
  do {
    const u = `https://www.googleapis.com/drive/v3/files?q='${id}'+in+parents+and+trashed=false&fields=nextPageToken,files(id,name,mimeType,modifiedTime)&pageSize=1000&key=${cfg.key}${token?`&pageToken=${token}`:""}`;
    const r = await fetch(u); const j = await r.json();
    if (!r.ok) throw new Error("Erro ao ler a pasta de imagens: " + (j.error?.message||r.status));
    out.push(...j.files.filter(f=>f.mimeType.startsWith("image/")));
    token = j.nextPageToken;
  } while (token);
  return out;
}

function build(rows, images){
  const imgMap = {};
  images.forEach(f => imgMap[norm(f.name)] = { id:f.id, url:thumb(f.id) });
  const head = rows[0].map(norm);
  const col = (...names) => head.findIndex(h => names.some(n => h.includes(n)));
  const c = { p:col("produto","nome"), f:col("fornecedor"), cor:col("cor"), t:col("tamanho"), v:col("vista"), n:col("parcelas","qtd"), vp:col("valor parcela","parcela") };
  if (c.vp === c.n) c.vp = head.findIndex((h,i)=>i!==c.n && h.includes("parcela"));
  const g = {};
  rows.slice(1).forEach(r=>{
    const name=(r[c.p]||"").trim(); if(!name) return;
    const key = name+"|"+(r[c.f]||"");
    const im = imgMap[norm(name)];
    g[key] ??= { name, supplier:(r[c.f]||"").trim(), vars:[], img: im?.url, imgId: im?.id };
    g[key].vars.push({ cor:r[c.cor]||"", tam:r[c.t]||"", vista:r[c.v]||"", n:r[c.n]||"", vp:r[c.vp]||"" });
  });
  return Object.values(g);
}

// Texto da mensagem (sem link de imagem: a foto vai como arquivo)
function message(p, v){
  const varTxt = [v.cor && `Cor: ${v.cor}`, v.tam && `Tamanho: ${v.tam}`].filter(Boolean).join(" | ");
  return `*${p.name}*\n${varTxt ? varTxt+"\n" : ""}💰 À vista: *${money(v.vista)}*${v.n ? `\n💳 Ou ${v.n}x de ${money(v.vp)}` : ""}${cfg.rodape ? `\n\n${cfg.rodape}` : ""}`;
}

// ===== Imagem como arquivo (para anexar de verdade) =====
async function fetchImageFile(id, name){
  const urls = [];
  if (cfg.key) urls.push(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${cfg.key}`); // original, aceita CORS
  urls.push(thumb(id, 1600), `https://lh3.googleusercontent.com/d/${id}=w1600`);
  for (const u of urls){
    try {
      const r = await fetch(u); if (!r.ok) continue;
      const b = await r.blob(); if (!b.type.startsWith("image/")) continue;
      const ext = (b.type.split("/")[1]||"jpg").replace("jpeg","jpg").replace("+xml","");
      return new File([b], `${slug(name)}.${ext}`, { type:b.type });
    } catch {}
  }
  return null;
}
const canShareFile = f => !!(f && navigator.canShare && navigator.canShare({ files:[f] }));
const copyText = async t => { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } };
function downloadFile(f){ const a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 4000); }

// ===== Prévia / edição antes de enviar =====
const dlg = $("#composer");
const KIND = {
  wa:   { icon:"wa",    label:"Enviar no WhatsApp",  title:"WhatsApp" },
  fb:   { icon:"fb",    label:"Enviar no Facebook",  title:"Facebook" },
  ig:   { icon:"ig",    label:"Enviar no Instagram", title:"Instagram" },
  more: { icon:"share", label:"Compartilhar",        title:"Compartilhar" },
};
let cur = null;

function openComposer(kind, item){
  cur = { kind, name:item.name, file:null, filePromise:null };
  const k = KIND[kind];
  $("#cTitle").textContent = `${k.title} · ${item.name}`;
  $("#cText").value = item.text;
  $("#cMain").innerHTML = ic(k.icon) + k.label;
  $("#cWa").hidden = kind === "wa";               // no WhatsApp o principal já cobre
  $("#cWa").innerHTML = ic("wa") + (kind==="wa" ? "" : "WhatsApp só texto");
  $("#cSave").hidden = !item.imgId;
  const box = $("#cImg");
  box.hidden = !item.url;
  box.innerHTML = item.url ? `<img src="${esc(item.url)}" alt="">` : "";
  $("#cHint").textContent = "Carregando foto…";
  if (item.imgId){
    cur.filePromise = fetchImageFile(item.imgId, item.name).then(f => {
      if (!cur) return null; cur.file = f;
      $("#cHint").textContent = hint(kind, f);
      return f;
    });
  } else $("#cHint").textContent = hint(kind, null);
  dlg.showModal();
}

function hint(kind, file){
  if (!file) return kind==="wa" ? "Ao enviar, o WhatsApp abre e você escolhe o contato." : "Sem foto: será enviado só o texto.";
  if (canShareFile(file)) return "Vai abrir o menu do celular: escolha o app e o contato. A foto vai junto." + (kind==="ig"||kind==="fb" ? " O texto é copiado para você colar na legenda." : "");
  return "Este navegador não anexa fotos direto: o texto é copiado e a foto é baixada para você anexar.";
}

async function mainAction(){
  const { kind } = cur, text = $("#cText").value;
  if (kind !== "wa") await copyText(text);                 // Instagram/Facebook ignoram o texto do compartilhamento
  const file = cur.file || await cur.filePromise;
  if (navigator.share){
    const data = { text };
    if (canShareFile(file)) data.files = [file]; else if (kind !== "wa") data.title = cur.name;
    if (data.files || (!file && kind !== "wa")){
      try { await navigator.share(data); if (kind!=="wa") toast("Legenda copiada — cole na postagem."); return; }
      catch(e){ if (e.name==="AbortError") return; }
    }
  }
  // Alternativa (computador / navegador sem compartilhamento)
  if (kind === "wa" && !file) return void window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  await copyText(text); if (file) downloadFile(file);
  toast(file ? "Texto copiado e foto baixada. Anexe na conversa." : "Texto copiado!");
  const url = { wa:`https://wa.me/?text=${encodeURIComponent(text)}`, fb:"https://www.facebook.com/", ig:"https://www.instagram.com/direct/inbox/" }[kind];
  if (url) window.open(url, "_blank");
}

$("#cMain").onclick = mainAction;
$("#cWa").onclick = () => window.open(`https://wa.me/?text=${encodeURIComponent($("#cText").value)}`, "_blank");   // sem número: o WhatsApp pede o contato
$("#cCopy").onclick = async () => toast(await copyText($("#cText").value) ? "Texto copiado!" : "Não foi possível copiar.");
$("#cSave").onclick = async () => { const f = cur.file || await cur.filePromise; f ? downloadFile(f) : toast("Não foi possível baixar a foto."); };
$("#cClose").onclick = () => dlg.close();
dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
dlg.addEventListener("close", () => { cur = null; });

// ===== Lista =====
const shareBtns = `
  <button class="wa" data-k="wa" title="WhatsApp" aria-label="Enviar no WhatsApp">${ic("wa")}</button>
  <button data-k="fb" title="Facebook" aria-label="Enviar no Facebook">${ic("fb")}</button>
  <button data-k="ig" title="Instagram" aria-label="Enviar no Instagram">${ic("ig")}</button>
  <button data-k="more" title="Mais opções" aria-label="Mais opções de envio">${ic("share")}</button>`;

function render(){
  const q = norm($("#q").value), s = $("#supplier").value;
  $("#supplier").hidden = view !== "products";
  $("#q").placeholder = view === "posts" ? "Buscar post…" : "Buscar produto…";
  $("#grid").innerHTML = "";
  if (view === "posts") return renderPosts(q);
  const list = products.filter(p => norm(p.name).includes(q) && (!s || p.supplier===s));
  $("#status").textContent = list.length ? "" : "Nenhum produto encontrado.";
  list.forEach(p=>{
    let sel = 0;
    const el = document.createElement("article"); el.className="card";
    const draw = () => {
      const v = p.vars[sel];
      el.innerHTML = `
        <div class="img">${p.img ? `<img loading="lazy" src="${esc(p.img)}" alt="">` : esc(p.name[0])}</div>
        <div class="body">
          <div><div class="name"></div><div class="sup"></div></div>
          ${p.vars.length>1 || v.cor || v.tam ? `<div class="chips">${p.vars.map((x,i)=>`<button class="chip ${i===sel?"on":""}" data-i="${i}">${esc([x.cor,x.tam].filter(Boolean).join(" · ")||"Padrão")}</button>`).join("")}</div>` : ""}
          <div><div class="price">${money(v.vista)}</div>${v.n?`<div class="inst">ou ${esc(v.n)}x de ${money(v.vp)}</div>`:""}</div>
          <div class="share">${shareBtns}</div>
        </div>`;
      el.querySelector(".name").textContent = p.name;
      el.querySelector(".sup").textContent = p.supplier;
      el.querySelectorAll(".chip").forEach(b=>b.onclick=()=>{ sel=+b.dataset.i; draw(); });
      el.querySelectorAll(".share button").forEach(b=>b.onclick=()=>openComposer(b.dataset.k, { name:p.name, text:message(p, p.vars[sel]), url:p.img, imgId:p.imgId }));
    };
    draw(); $("#grid").appendChild(el);
  });
}

function renderPosts(q){
  const list = posts.filter(f => norm(f.name).includes(q));
  $("#status").textContent = list.length ? "" : (posts.length ? "Nenhum post encontrado." : (cfg.key ? "Nenhum post na pasta." : "Preencha o config.js para ver os posts."));
  list.forEach(f=>{
    const name = pretty(f.name), el = document.createElement("article"); el.className="card post";
    el.innerHTML = `
      <div class="img"><img loading="lazy" src="${esc(thumb(f.id))}" alt=""></div>
      <div class="body"><div class="name"></div><div class="share">${shareBtns}</div></div>`;
    el.querySelector(".name").textContent = name;
    el.querySelectorAll(".share button").forEach(b=>b.onclick=()=>openComposer(b.dataset.k, { name, text:cfg.rodape||"", url:thumb(f.id), imgId:f.id }));
    $("#grid").appendChild(el);
  });
}

async function load(){
  $("#status").textContent = "Carregando…";
  let postsErr = "";
  try {
    const [rows, imgs, pst] = await Promise.all([
      loadSheet(), loadFolder(cfg.folder),
      loadFolder(cfg.postsFolder).catch(e => { postsErr = e.message; return []; })
    ]);
    products = build(rows, imgs);
    posts = pst.sort((a,b) => (b.modifiedTime||"").localeCompare(a.modifiedTime||""));
    const sups = [...new Set(products.map(p=>p.supplier).filter(Boolean))].sort();
    $("#supplier").innerHTML = `<option value="">Todos os fornecedores</option>` + sups.map(s=>`<option>${esc(s)}</option>`).join("");
    $("#tabs").hidden = !idFrom(cfg.postsFolder);
    render();
    if (!cfg.sheet) $("#status").textContent = "Exemplo de demonstração — preencha o arquivo config.js para conectar sua planilha.";
    if (postsErr) $("#status").textContent = postsErr;
  } catch(e){ $("#status").textContent = e.message; }
  finally { hideSplash(); }
}

// ===== Abas =====
document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => {
  view = b.dataset.v;
  document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("on", x === b));
  render();
});
$("#refreshBtn").onclick = load;
$("#q").oninput = render; $("#supplier").onchange = render;

// ===== Tema claro/escuro =====
function applyTheme(t){
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]').content = t === "dark" ? "#18181b" : "#fc5f2c";
}
$("#themeBtn").onclick = () => {
  const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(t); try { localStorage.setItem("catalogo-theme", t); } catch {}
};
applyTheme(document.documentElement.dataset.theme || "light");

// ===== Splash =====
const t0 = performance.now();
function hideSplash(){
  const s = $("#splash"); if (!s || s.dataset.done) return; s.dataset.done = 1;
  setTimeout(() => { s.classList.add("hide"); setTimeout(() => s.remove(), 500); }, Math.max(0, 900 - (performance.now() - t0)));
}
setTimeout(hideSplash, 8000);

// ===== PWA =====
let deferred;
addEventListener("beforeinstallprompt", e=>{ e.preventDefault(); deferred=e; $("#installBtn").hidden=false; });
$("#installBtn").onclick = async ()=>{ deferred?.prompt(); deferred=null; $("#installBtn").hidden=true; };
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");

load();
