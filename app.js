// ===== Configuração (salva no aparelho pela tela ⚙) =====
const cfg = JSON.parse(localStorage.getItem("catalogo-cfg") || "{}");
const $ = s => document.querySelector(s);
let products = [];

const DEMO = [
  ["Produto","Fornecedor","Cor","Tamanho","A Vista","Parcelas","Valor Parcela"],
  ["Camiseta Básica","Fornecedor A","Preto","P","59,90","3","21,90"],
  ["Camiseta Básica","Fornecedor A","Branco","M","59,90","3","21,90"],
  ["Tênis Runner","Fornecedor B","Laranja","40","299,00","10","32,90"],
  ["Mochila Urbana","Fornecedor C","Cinza","Único","189,90","6","34,90"],
];

const idFrom = v => { if (!v) return ""; const m = v.match(/\/d\/([\w-]+)|folders\/([\w-]+)|id=([\w-]+)/); return m ? (m[1]||m[2]||m[3]) : v.trim(); };
const norm = s => (s||"").toString().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\.[a-z0-9]+$/,"").trim();
const money = v => { const n = parseFloat(String(v).replace(/[^\d,.-]/g,"").replace(/\.(?=\d{3})/g,"").replace(",", ".")); return isNaN(n) ? (v||"") : n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); };
const toast = t => { const el = $("#toast"); el.textContent = t; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"), 2200); };

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

async function loadImages(){
  const id = idFrom(cfg.folder);
  if (!id || !cfg.key) return {};
  const map = {}; let token = "";
  do {
    const u = `https://www.googleapis.com/drive/v3/files?q='${id}'+in+parents+and+trashed=false&fields=nextPageToken,files(id,name,mimeType)&pageSize=1000&key=${cfg.key}${token?`&pageToken=${token}`:""}`;
    const r = await fetch(u); const j = await r.json();
    if (!r.ok) throw new Error("Erro ao ler a pasta de imagens: " + (j.error?.message||r.status));
    j.files.filter(f=>f.mimeType.startsWith("image/")).forEach(f=> map[norm(f.name)] = `https://drive.google.com/thumbnail?id=${f.id}&sz=w800`);
    token = j.nextPageToken;
  } while (token);
  return map;
}

function build(rows, images){
  const head = rows[0].map(norm);
  const col = (...names) => head.findIndex(h => names.some(n => h.includes(n)));
  const c = { p:col("produto","nome"), f:col("fornecedor"), cor:col("cor"), t:col("tamanho"), v:col("vista"), n:col("parcelas","qtd"), vp:col("valor parcela","parcela") };
  if (c.vp === c.n) c.vp = head.findIndex((h,i)=>i!==c.n && h.includes("parcela"));
  const g = {};
  rows.slice(1).forEach(r=>{
    const name=(r[c.p]||"").trim(); if(!name) return;
    const key = name+"|"+(r[c.f]||"");
    g[key] ??= { name, supplier:(r[c.f]||"").trim(), vars:[], img: images[norm(name)] };
    g[key].vars.push({ cor:r[c.cor]||"", tam:r[c.t]||"", vista:r[c.v]||"", n:r[c.n]||"", vp:r[c.vp]||"" });
  });
  return Object.values(g);
}

function message(p, v){
  const varTxt = [v.cor && `Cor: ${v.cor}`, v.tam && `Tamanho: ${v.tam}`].filter(Boolean).join(" | ");
  return `*${p.name}*\n${varTxt ? varTxt+"\n" : ""}💰 À vista: *${money(v.vista)}*${v.n ? `\n💳 Ou ${v.n}x de ${money(v.vp)}` : ""}${p.img ? `\n📷 ${p.img}` : ""}`;
}

async function share(kind, p, v){
  const text = message(p, v);
  if (kind==="wa") return window.open(`https://wa.me/${cfg.phone||""}?text=${encodeURIComponent(text)}`, "_blank");
  if (kind==="fb") { await navigator.clipboard?.writeText(text); toast("Texto copiado! Cole no Messenger."); return window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(p.img||location.href)}`, "_blank"); }
  // Instagram / outros: compartilhamento nativo do celular com a foto
  try {
    const data = { title:p.name, text };
    if (p.img && navigator.canShare){
      const blob = await (await fetch(p.img)).blob();
      const file = new File([blob], p.name+".jpg", { type: blob.type||"image/jpeg" });
      if (navigator.canShare({ files:[file] })) data.files = [file];
    }
    if (navigator.share) return await navigator.share(data);
  } catch(e){ if (e.name==="AbortError") return; }
  await navigator.clipboard?.writeText(text); toast("Texto copiado! Cole no Instagram.");
  if (kind==="ig") window.open("https://www.instagram.com/direct/inbox/", "_blank");
}

function render(){
  const q = norm($("#q").value), s = $("#supplier").value;
  const list = products.filter(p => norm(p.name).includes(q) && (!s || p.supplier===s));
  $("#status").textContent = list.length ? "" : "Nenhum produto encontrado.";
  $("#grid").innerHTML = "";
  list.forEach(p=>{
    let sel = 0;
    const el = document.createElement("article"); el.className="card";
    const draw = () => {
      const v = p.vars[sel];
      el.innerHTML = `
        <div class="img">${p.img ? `<img loading="lazy" src="${p.img}" alt="">` : p.name[0]}</div>
        <div class="body">
          <div><div class="name"></div><div class="sup"></div></div>
          ${p.vars.length>1 || v.cor || v.tam ? `<div class="chips">${p.vars.map((x,i)=>`<button class="chip ${i===sel?"on":""}" data-i="${i}">${[x.cor,x.tam].filter(Boolean).join(" · ")||"Padrão"}</button>`).join("")}</div>` : ""}
          <div><div class="price">${money(v.vista)}</div>${v.n?`<div class="inst">ou ${v.n}x de ${money(v.vp)}</div>`:""}</div>
          <div class="share">
            <button class="wa" data-k="wa">WhatsApp</button>
            <button data-k="fb">Facebook</button>
            <button data-k="ig">Instagram</button>
            <button data-k="more">Mais</button>
          </div>
        </div>`;
      el.querySelector(".name").textContent = p.name;
      el.querySelector(".sup").textContent = p.supplier;
      el.querySelectorAll(".chip").forEach(b=>b.onclick=()=>{ sel=+b.dataset.i; draw(); });
      el.querySelectorAll(".share button").forEach(b=>b.onclick=()=>share(b.dataset.k, p, p.vars[sel]));
    };
    draw(); $("#grid").appendChild(el);
  });
}

async function load(){
  $("#status").textContent = "Carregando…";
  try {
    const [rows, images] = await Promise.all([loadSheet(), loadImages()]);
    products = build(rows, images);
    const sups = [...new Set(products.map(p=>p.supplier).filter(Boolean))].sort();
    $("#supplier").innerHTML = `<option value="">Todos os fornecedores</option>` + sups.map(s=>`<option>${s}</option>`).join("");
    render();
    if (!cfg.sheet) $("#status").textContent = "Exemplo de demonstração — toque em ⚙ para conectar sua planilha.";
  } catch(e){ $("#status").textContent = e.message; }
}

// ===== Configurações =====
const dlg = $("#settings"), form = dlg.querySelector("form");
$("#settingsBtn").onclick = () => { ["sheet","folder","key","phone"].forEach(k=>form[k].value=cfg[k]||""); dlg.showModal(); };
dlg.addEventListener("close", ()=>{ if (dlg.returnValue!=="save") return;
  ["sheet","folder","key","phone"].forEach(k=>cfg[k]=form[k].value.trim());
  localStorage.setItem("catalogo-cfg", JSON.stringify(cfg)); load(); });
$("#refreshBtn").onclick = load;
$("#q").oninput = render; $("#supplier").onchange = render;

// ===== PWA =====
let deferred;
addEventListener("beforeinstallprompt", e=>{ e.preventDefault(); deferred=e; $("#installBtn").hidden=false; });
$("#installBtn").onclick = async ()=>{ deferred?.prompt(); deferred=null; $("#installBtn").hidden=true; };
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");

load();
