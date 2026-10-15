// ===== Configuração: vem do arquivo config.js =====
// (se o config.js estiver vazio, usa por segurança o que a versão antiga salvou no aparelho)
const legacy = (() => { try { return JSON.parse(localStorage.getItem("catalogo-cfg") || "{}"); } catch { return {}; } })();
const fromFile = Object.fromEntries(Object.entries(window.CATALOGO_CONFIG || {}).filter(([, v]) => String(v || "").trim()));
const cfg = { ...legacy, ...fromFile };

const $ = s => document.querySelector(s);
let products = [], posts = [], videos = [], view = "products";

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
const driveView = id => `https://drive.google.com/file/d/${id}/view`;
const driveDownload = id => `https://drive.google.com/uc?export=download&id=${id}`;
const openUrl = u => { const w = window.open(u, "_blank"); if (!w) location.href = u; };
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
  if (!id || !cfg.proxyUrl) return [];

  const cacheKey = `folder_${id}`;
  const ttl = 3 * 60 * 1000; // 10 minutos

  // Tenta usar o cache
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { ts, files } = JSON.parse(cached);
      if (Date.now() - ts < ttl) return files;
    }
  } catch (e) { /* cache corrompido, ignora */ }

  // Cache expirado ou inexistente: chama o proxy
  const u = `${cfg.proxyUrl}?folderId=${id}`;
  const r = await fetch(u);
  const j = await r.json();
  if (!r.ok || j.error) throw new Error("Erro ao ler a pasta de imagens: " + (j.error || r.status));

  // Guarda no cache
  try {
    localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), files: j.files }));
  } catch (e) { /* localStorage cheio, ignora */ }

  return j.files;
}

function build(rows, images){
  const imgMap = {};
  images.forEach(f => imgMap[norm(f.name)] = { id:f.id, url:thumb(f.id) });
  const head = rows[0].map(norm);
  const col = (...names) => head.findIndex(h => names.some(n => h.includes(n)));
  const c = { p:col("produto","nome"), f:col("fornecedor"), cod:col("codigo","código","sku","referencia","referência"), cor:col("cor"), t:col("tamanho"), v:col("vista"), n:col("parcelas","qtd"), vp:col("valor parcela","parcela") };
  if (c.vp === c.n) c.vp = head.findIndex((h,i)=>i!==c.n && h.includes("parcela"));
  const g = {};
  rows.slice(1).forEach(r=>{
    const name=(r[c.p]||"").trim(); if(!name) return;
    const key = name+"|"+(r[c.f]||"");
    const im = imgMap[norm(name)];
    g[key] ??= { name, supplier:(r[c.f]||"").trim(), code:(r[c.cod]||"").trim(), vars:[], img: im?.url, imgId: im?.id };
    g[key].vars.push({ cor:r[c.cor]||"", tam:r[c.t]||"", vista:r[c.v]||"", n:r[c.n]||"", vp:r[c.vp]||"" });
  });
  return Object.values(g);
}

// Texto da mensagem (sem link de imagem: a foto vai como arquivo)
// const getSup = () => { try { return localStorage.getItem("catalogo-sup") === "1"; } catch { return false; } };
// const header = (p, sup) => `*${p.name}${sup && p.supplier ? " - " + p.supplier : ""}*`;
// function message(p, v, sup){
//   const varTxt = [v.cor && `Cor: ${v.cor}`, v.tam && `Tamanho: ${v.tam}`].filter(Boolean).join(" | ");
//   return `${header(p, sup)}\n${varTxt ? varTxt+"\n" : ""}💰 À vista: *${money(v.vista)}*${v.n ? `\n💳 Ou ${v.n}x de ${money(v.vp)}` : ""}${cfg.rodape ? `\n\n${cfg.rodape}` : ""}`;
// } - antigo
const getSup = () => { try { return localStorage.getItem("catalogo-sup") === "1"; } catch { return false; } };
const getCod = () => { try { return localStorage.getItem("catalogo-cod") === "1"; } catch { return false; } };
const header = (p, sup, cod) => {
  const parts = [p.name];
  if (cod && p.code) parts.push(`Cód: ${p.code}`);
  if (sup && p.supplier) parts.push(p.supplier);
  return `*${parts.join(" - ")}*`;
};
function message(p, v, sup, cod){
  const varTxt = [v.cor && `Cor: ${v.cor}`, v.tam && `Tamanho: ${v.tam}`].filter(Boolean).join(" | ");
  return `${header(p, sup, cod)}\n${varTxt ? varTxt+"\n" : ""}💰 À vista: *${money(v.vista)}*${v.n ? `\n💳 Ou ${v.n}x de ${money(v.vp)}` : ""}${cfg.rodape ? `\n\n${cfg.rodape}` : ""}`;
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
// Vídeo: o proxy entrega o arquivo em base64 (até o limite definido no proxy.gs); sem isso, cai no plano B (baixar + legenda)
const VEXT = { "video/mp4":"mp4", "video/quicktime":"mov", "video/webm":"webm", "video/x-matroska":"mkv", "video/3gpp":"3gp" };
async function fetchVideoFile(id, name){
  if (!cfg.proxyUrl) return null;
  try {
    const r = await fetch(`${cfg.proxyUrl}?fileId=${encodeURIComponent(id)}`); const j = await r.json();
    if (!r.ok || j.error || !j.data) return null;
    const bin = atob(j.data), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const mime = j.mimeType || "video/mp4";
    return new File([arr], `${slug(name)}.${VEXT[mime] || mime.split("/")[1] || "mp4"}`, { type:mime });
  } catch { return null; }
}
const canShareFile = f => !!(f && navigator.canShare && navigator.canShare({ files:[f] }));
const copyText = async t => { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } };
function downloadFile(f){ const a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 4000); }

// ===== Player de vídeo dentro do app (player do Drive embutido) =====
const playerDlg = $("#player");
function playVideo(id, name){
  $("#pTitle").textContent = name;
  $("#pOpen").href = driveView(id);
  $("#pFrame").src = `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;
  playerDlg.showModal();
}
function stopVideo(){ $("#pFrame").src = "about:blank"; }
$("#pClose").onclick = () => playerDlg.close();
playerDlg.addEventListener("click", e => { if (e.target === playerDlg) playerDlg.close(); });
playerDlg.addEventListener("close", stopVideo);

// ===== Prévia / edição antes de enviar =====
const dlg = $("#composer");
const KIND = {
  wa:   { icon:"wa",    label:"Enviar no WhatsApp",  title:"WhatsApp" },
  fb:   { icon:"fb",    label:"Enviar no Facebook",  title:"Facebook" },
  ig:   { icon:"ig",    label:"Enviar no Instagram", title:"Instagram" },
  more: { icon:"share", label:"Compartilhar",        title:"Compartilhar" },
};
const VKIND = {   // vídeo: o mesmo botão das fotos; se o arquivo não carregar, entra o plano B (veja videoHint)
  wa:   { label:"Enviar vídeo no WhatsApp" },
  fb:   { label:"Enviar vídeo no Facebook" },
  ig:   { label:"Enviar vídeo no Instagram" },
  more: { label:"Compartilhar vídeo" },
};
const videoHint = kind => ({    // plano B: o vídeo não pôde ser carregado (muito grande ou proxy sem a nova versão)
  wa:   "Não foi possível anexar o vídeo (arquivo grande demais). O WhatsApp abre e vai o texto com o link do vídeo.",
  more: "Não foi possível anexar o vídeo (arquivo grande demais). Vai o texto com o link do vídeo.",
  fb:   "Não foi possível anexar o vídeo (arquivo grande demais). Ele será baixado e a legenda copiada: escolha o vídeo na galeria ao postar.",
  ig:   "Não foi possível anexar o vídeo (arquivo grande demais). Ele será baixado e a legenda copiada: escolha o vídeo na galeria ao postar.",
}[kind]);
let cur = null;

function openComposer(kind, item){
  cur = { kind, name:item.name, item, file:null, filePromise:null };
  const k = item.video ? { ...KIND[kind], ...VKIND[kind] } : KIND[kind];
  $("#cTitle").textContent = `${k.title} · ${item.name}`;
  const sup = getSup(), cod = getCod();
  $("#cText").value = item.build ? item.build(sup, cod) : item.text;
  $("#cSup").hidden = !item.build || !item.supplier;
  $("#cSup").setAttribute("aria-pressed", sup);
  $("#cCod").hidden = !item.build || !item.code;
  $("#cCod").setAttribute("aria-pressed", cod);
  $("#cMain").innerHTML = ic(k.icon) + k.label;
  $("#cWa").hidden = kind === "wa";               // no WhatsApp o principal já cobre
  $("#cWa").innerHTML = ic("wa") + (kind==="wa" ? "" : "WhatsApp só texto");
  $("#cSave").hidden = !item.imgId;
  $("#cSave").innerHTML = ic("download") + (item.video ? "Baixar vídeo" : "Salvar foto");
  const box = $("#cImg");
  box.hidden = !item.url;
  box.innerHTML = !item.url ? "" : item.video
    ? `<button type="button" class="vprev" title="Assistir"><img src="${esc(item.url)}" alt="" onerror="this.remove()"><span class="play"><i>${ic("play")}</i></span></button>`
    : `<img src="${esc(item.url)}" alt="">`;
  const vp = box.querySelector(".vprev"); if (vp) vp.onclick = () => playVideo(item.imgId, item.name);
  $("#cHint").textContent = "Carregando foto…";
  $("#cMain").disabled = false;
  if (item.video){
    $("#cMain").disabled = true;                                   // só libera quando o vídeo estiver pronto (ou falhar)
    $("#cHint").textContent = "Preparando o vídeo para envio… pode levar alguns segundos.";
    cur.filePromise = fetchVideoFile(item.imgId, item.name).then(f => {
      if (!cur || cur.item !== item) return f;
      cur.file = f; $("#cMain").disabled = false;
      $("#cHint").textContent = f ? hint(kind, f, true) : videoHint(kind);
      return f;
    });
  }
  else if (item.imgId){
    cur.filePromise = fetchImageFile(item.imgId, item.name).then(f => {
      if (!cur) return null; cur.file = f;
      $("#cHint").textContent = hint(kind, f);
      return f;
    });
  } else $("#cHint").textContent = hint(kind, null);
  dlg.showModal();
}

function hint(kind, file, video){
  const obj = video ? "vídeo" : "foto";
  if (!file) return kind==="wa" ? "Ao enviar, o WhatsApp abre e você escolhe o contato." : "Sem foto: será enviado só o texto.";
  if (canShareFile(file)) return `Vai abrir o menu do celular: escolha o app e o contato. O ${obj} vai junto.` + (kind==="ig"||kind==="fb" ? " O texto é copiado para você colar na legenda." : "");
  return `Este navegador não anexa ${obj === "vídeo" ? "vídeos" : "fotos"} direto: o texto é copiado e o ${obj} é baixado para você anexar.`;
}

// Vídeo: WhatsApp = texto com link; Instagram/Facebook = baixa o vídeo + copia a legenda
async function videoAction(){
  const { kind, item } = cur, link = driveView(item.imgId);
  let text = $("#cText").value;
  if ((kind === "wa" || kind === "more") && !text.includes(link)) text += `\n\nAssista ao vídeo:\n${link}`;   // sem o arquivo, vai o link (sem emoji: no endereço wa.me ele pode chegar quebrado)
  if (kind === "wa") return void openUrl(`https://wa.me/?text=${encodeURIComponent(text)}`);
  if (kind === "more" && navigator.share){
    try { await navigator.share({ title:item.name, text }); } catch (e) {}
    return;
  }
  await copyText(text);
  openUrl(driveDownload(item.imgId));
  toast("Legenda copiada. Salve o vídeo e escolha-o na galeria ao postar.");
}

async function mainAction(){
  if (cur.item.video && !(cur.file || await cur.filePromise)) return videoAction();   // vídeo não carregou: plano B
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
  toast(file ? `Texto copiado e ${file.type.startsWith("video/") ? "vídeo" : "foto"} baixado. Anexe na conversa.` : "Texto copiado!");
  const url = { wa:`https://wa.me/?text=${encodeURIComponent(text)}`, fb:"https://www.facebook.com/", ig:"https://www.instagram.com/direct/inbox/" }[kind];
  if (url) window.open(url, "_blank");
}

// "Incluir fornecedor": troca só a primeira linha (produto → produto - fornecedor), preservando o que foi editado
// $("#cSup").onclick = () => {
//   const on = $("#cSup").getAttribute("aria-pressed") !== "true", it = cur.item, ta = $("#cText");
//   const oldH = header({ name:it.name, supplier:it.supplier }, !on), newH = header({ name:it.name, supplier:it.supplier }, on);
//   if (ta.value.includes(oldH)) ta.value = ta.value.replace(oldH, () => newH);
//   else if (!ta.value.includes(newH)) return toast("A primeira linha foi editada: ajuste o nome manualmente.");
//   $("#cSup").setAttribute("aria-pressed", on);
//   try { localStorage.setItem("catalogo-sup", on ? "1" : "0"); } catch {}
// };
function toggleHeader(which){
  const it = cur.item, ta = $("#cText");
  const supNow = getSup(), codNow = getCod();
  const sup = which === "sup" ? !supNow : supNow;
  const cod = which === "cod" ? !codNow : codNow;
  const oldH = header({ name:it.name, supplier:it.supplier, code:it.code }, supNow, codNow);
  const newH = header({ name:it.name, supplier:it.supplier, code:it.code }, sup, cod);
  if (ta.value.includes(oldH)) ta.value = ta.value.replace(oldH, () => newH);
  else if (!ta.value.includes(newH)) return toast("A primeira linha foi editada: ajuste o nome manualmente.");
  try {
    localStorage.setItem("catalogo-sup", sup ? "1" : "0");
    localStorage.setItem("catalogo-cod", cod ? "1" : "0");
  } catch {}
  $("#cSup").setAttribute("aria-pressed", String(sup));
  $("#cCod").setAttribute("aria-pressed", String(cod));
}
$("#cSup").onclick = () => toggleHeader("sup");
$("#cCod").onclick = () => toggleHeader("cod");
$("#cMain").onclick = mainAction;
$("#cWa").onclick = () => window.open(`https://wa.me/?text=${encodeURIComponent($("#cText").value)}`, "_blank");   // sem número: o WhatsApp pede o contato
$("#cCopy").onclick = async () => toast(await copyText($("#cText").value) ? "Texto copiado!" : "Não foi possível copiar.");
$("#cSave").onclick = async () => { const f0 = cur.file || await cur.filePromise; if (cur.item.video && !f0) return openUrl(driveDownload(cur.item.imgId)); const f = f0; f ? downloadFile(f) : toast("Não foi possível baixar a foto."); };
$("#cClose").onclick = () => dlg.close();
dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
dlg.addEventListener("close", () => { cur = null; });

// ===== Lista =====
const shareBtns = `
  <button class="wa" data-k="wa" title="WhatsApp" aria-label="Enviar no WhatsApp">${ic("wa")}</button>
  <button data-k="fb" title="Facebook" aria-label="Enviar no Facebook">${ic("fb")}</button>
  <button data-k="ig" title="Instagram" aria-label="Enviar no Instagram">${ic("ig")}</button>
  <button data-k="more" title="Mais opções" aria-label="Mais opções de envio">${ic("share")}</button>`;

// ===== Selo "Novo" (guarda no aparelho o que você já viu; sem servidor, sem custo) =====
const SEEN_KEY = "catalogo-visto";
const fresh = { products:new Set(), posts:new Set(), videos:new Set() }, visited = { products:false, posts:false, videos:false };
const keysNow = () => ({ products: products.map(p => p.name+"|"+p.supplier), posts: posts.map(f => f.id), videos: videos.map(f => f.id) });
const readSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY)); } catch { return null; } };
const writeSeen = o => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(o)); } catch {} };

function detectFresh(ok){            // ok = { products:bool, posts:bool } -> só compara o que carregou sem erro
  const now = keysNow(), seen = readSeen();
  if (!seen) { writeSeen(now); return; }                       // primeiro uso: nada é "novo"
  for (const k of ["products","posts","videos"]){
    if (!ok[k]) continue;
    if (!seen[k]) { seen[k] = now[k]; writeSeen(seen); continue; }
    now[k].filter(x => !seen[k].includes(x)).forEach(x => fresh[k].add(x));
  }
}
function visit(kind){                // abriu a aba: marca como visto (os "Novo" continuam até recarregar)
  const cur = keysNow()[kind]; if (visited[kind] || !cur.length) return;   // lista vazia = erro de carga: não sobrescreve o histórico
  visited[kind] = true;
  const seen = readSeen() || {}; seen[kind] = cur; writeSeen({ ...keysNow(), ...seen });
  updatePills();
}
function updatePills(){
  document.querySelectorAll("#tabs button").forEach(b => {
    const k = b.dataset.v, n = visited[k] ? 0 : fresh[k].size, pill = b.querySelector(".pill");
    pill.hidden = !n; pill.textContent = n > 9 ? "9+" : n;
    pill.title = n ? `${n} ${n === 1 ? "novo" : "novos"}` : "";
  });
}

function render(){
  visit(view);
  const q = norm($("#q").value), s = $("#supplier").value;
  $("#supplier").hidden = view !== "products";
  $("#q").placeholder = { products:"Buscar produto…", posts:"Buscar post…", videos:"Buscar vídeo…" }[view];
  $("#grid").innerHTML = "";
  if (view === "posts") return renderPosts(q);
  if (view === "videos") return renderVideos(q);
  const list = products.filter(p => norm(p.name).includes(q) && (!s || p.supplier===s));
  $("#status").textContent = list.length ? "" : "Nenhum produto encontrado.";
  list.forEach(p=>{
    let sel = 0;
    const el = document.createElement("article"); el.className="card";
    const draw = () => {
      const v = p.vars[sel];
      el.innerHTML = `
        <div class="img">${p.img ? `<img loading="lazy" src="${esc(p.img)}" alt="">` : esc(p.name[0])}${fresh.products.has(p.name+"|"+p.supplier) ? '<span class="new">Novo</span>' : ""}</div>
        <div class="body">
          <div><div class="name"></div><div class="sup"></div></div>
          ${p.vars.length>1 || v.cor || v.tam ? `<div class="chips">${p.vars.map((x,i)=>`<button class="chip ${i===sel?"on":""}" data-i="${i}">${esc([x.cor,x.tam].filter(Boolean).join(" · ")||"Padrão")}</button>`).join("")}</div>` : ""}
          <div><div class="price">${money(v.vista)}</div>${v.n?`<div class="inst">ou ${esc(v.n)}x de ${money(v.vp)}</div>`:""}</div>
          <div class="share">${shareBtns}</div>
        </div>`;
      el.querySelector(".name").textContent = p.name;
      el.querySelector(".sup").textContent = p.supplier;
      el.querySelectorAll(".chip").forEach(b=>b.onclick=()=>{ sel=+b.dataset.i; draw(); });
      el.querySelectorAll(".share button").forEach(b=>b.onclick=()=>openComposer(b.dataset.k, { name:p.name, supplier:p.supplier, code:p.code, build:(s, c) => message(p, p.vars[sel], s, c), url:p.img, imgId:p.imgId }));
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
      <div class="img"><img loading="lazy" src="${esc(thumb(f.id))}" alt="">${fresh.posts.has(f.id) ? '<span class="new">Novo</span>' : ""}</div>
      <div class="body"><div class="name"></div><div class="share">${shareBtns}</div></div>`;
    el.querySelector(".name").textContent = name;
    el.querySelectorAll(".share button").forEach(b=>b.onclick=()=>openComposer(b.dataset.k, { name, text:cfg.rodape||"", url:thumb(f.id), imgId:f.id }));
    $("#grid").appendChild(el);
  });
}

function videoText(f, name){
  return `*${name}*${cfg.rodape ? `\n\n${cfg.rodape}` : ""}`;
}

function renderVideos(q){
  const list = videos.filter(f => norm(f.name).includes(q));
  $("#status").textContent = list.length ? "" : (videos.length ? "Nenhum vídeo encontrado." : "Nenhum vídeo na pasta. (Se já há vídeos nela, o proxy do Apps Script precisa listar arquivos de vídeo.)");
  list.forEach(f=>{
    const name = pretty(f.name), el = document.createElement("article"); el.className="card video";
    el.innerHTML = `
      <div class="img"><img loading="lazy" src="${esc(thumb(f.id))}" alt="" onerror="this.remove()"><span class="play"><i>${ic("play")}</i></span>${fresh.videos.has(f.id) ? '<span class="new">Novo</span>' : ""}</div>
      <div class="body"><div class="name"></div><div class="share">${shareBtns}</div></div>`;
    el.querySelector(".name").textContent = name;
    el.querySelector(".img").onclick = () => playVideo(f.id, name);
    el.querySelectorAll(".share button").forEach(b=>b.onclick=()=>openComposer(b.dataset.k, { name, video:true, text:videoText(f, name), url:thumb(f.id), imgId:f.id }));
    $("#grid").appendChild(el);
  });
}

async function load(){
  $("#status").textContent = "Carregando…";
  let postsErr = "", videosErr = "";
  try {
    const [rows, imgs, pst, vid] = await Promise.all([
      loadSheet(), loadFolder(cfg.folder),
      loadFolder(cfg.postsFolder).catch(e => { postsErr = e.message; return []; }),
      loadFolder(cfg.videosFolder).catch(e => { videosErr = e.message; return []; })
    ]);
    products = build(rows, imgs);
    posts = pst.sort((a,b) => (b.modifiedTime||"").localeCompare(a.modifiedTime||""));
    videos = vid.filter(f => !f.mimeType || String(f.mimeType).startsWith("video/")).sort((a,b) => (b.modifiedTime||"").localeCompare(a.modifiedTime||""));
		const sups = [...new Set(products.map(p=>p.supplier).filter(Boolean))].sort();
		$("#supplier").innerHTML = `<option value="">Todos os fornecedores</option>` + sups.map(s=>`<option>${esc(s)}</option>`).join("");
		syncSupplierOptions();   // ← adicione esta linha
		const hasPosts = !!idFrom(cfg.postsFolder), hasVideos = !!idFrom(cfg.videosFolder);
		$("#tabs").hidden = !(hasPosts || hasVideos);
		$('#tabs button[data-v="posts"]').hidden = !hasPosts;
		$('#tabs button[data-v="videos"]').hidden = !hasVideos;
		if (cfg.sheet) detectFresh({ products: products.length > 0, posts: !postsErr && hasPosts, videos: !videosErr && hasVideos });
		updatePills();
		render();
    if (!cfg.sheet) $("#status").textContent = "Exemplo de demonstração — preencha o arquivo config.js para conectar sua planilha.";
    if (postsErr && view === "posts") $("#status").textContent = postsErr;
    if (videosErr && view === "videos") $("#status").textContent = videosErr;
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

// ===== Rodapé e "Sobre" =====
const APP_VERSION = "2.1";   // altere aqui quando publicar uma nova versão
document.querySelectorAll("#year, .yr").forEach(el => el.textContent = new Date().getFullYear());   // sempre o ano atual
$("#appVersion").textContent = APP_VERSION;
const aboutDlg = $("#about");
$("#aboutBtn").onclick = () => {
  $("#aboutCount").textContent = cfg.sheet ? `${products.length} produtos · ${posts.length} posts · ${videos.length} vídeos` : "Modo demonstração";
  aboutDlg.showModal();
};
$("#aboutClose").onclick = () => aboutDlg.close();
aboutDlg.addEventListener("click", e => { if (e.target === aboutDlg) aboutDlg.close(); });

// ===== Modal de busca =====
const searchDlg = $("#searchDialog");
const searchQ = $("#searchQ");
const searchSupplier = $("#searchSupplier");

// Copia os fornecedores do select da página para o select do modal
function syncSupplierOptions() {
  const original = $("#supplier");
  if (!original) return;
  searchSupplier.innerHTML = original.innerHTML;
  searchSupplier.value = original.value;
}

// Abre o modal com os valores atuais
$("#searchBtn").onclick = () => {
  const isProducts = view === "products", noun = { products:"produto", posts:"post", videos:"vídeo" }[view];
  searchQ.value = $("#q").value;
  searchQ.placeholder = `Buscar ${noun}…`;
  $("#searchTitle").textContent = `Buscar ${noun}`;
  // Esconde o select de fornecedor fora da aba Produtos
  searchSupplier.hidden = !isProducts;
  if (isProducts) syncSupplierOptions();
  searchDlg.showModal();
  setTimeout(() => searchQ.focus(), 100);
};

// Aplica a busca (chamado pelo botão Buscar ou pelo Enter)
function applySearch() {
  $("#q").value = searchQ.value;
  if (!searchSupplier.hidden) $("#supplier").value = searchSupplier.value;
  render();
  searchDlg.close();
}

// Botão Buscar
$("#searchSubmit").onclick = applySearch;

// Enter no campo de texto também busca
searchQ.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); applySearch(); }
});

// Fechar botão X
$("#searchClose").onclick = () => searchDlg.close();

// Fechar ao clicar fora
searchDlg.addEventListener("click", (e) => {
  if (e.target === searchDlg) searchDlg.close();
});

// ===== Botão de voltar ao topo =====
const backToTop = $("#backToTop");
window.addEventListener("scroll", () => {
  backToTop.classList.toggle("show", window.scrollY > 300);
}, { passive: true });
backToTop.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });

// ===== PWA =====
let deferred;
addEventListener("beforeinstallprompt", e=>{ e.preventDefault(); deferred=e; $("#installBtn").hidden=false; });
$("#installBtn").onclick = async ()=>{ deferred?.prompt(); deferred=null; $("#installBtn").hidden=true; };
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");

load();