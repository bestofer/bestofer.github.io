#!/usr/bin/env node
/* ilovemitochondria.com — zero-dependency static site generator.
   Single source of truth = /content. Everything else is derived:
   per-entry pages, tag taxonomy, related links, listings, sitemap, RSS. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONTENT = path.join(ROOT, "content");
const ASSETS = path.join(ROOT, "assets");
const OUT = path.join(ROOT, "dist");

/* ---------------- helpers ---------------- */
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const escAttr = s => esc(s).replace(/"/g,"&quot;");
const slugify = s => String(s).toLowerCase().trim()
  .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
const fmtDate = iso => { const d=new Date(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const rfc822 = iso => new Date(iso).toUTCString();

function readFrontMatter(raw){
  // JSON front matter fenced by --- ... ---
  const m = raw.replace(/\r\n/g,"\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if(!m) return { data:{}, body: raw };
  return { data: JSON.parse(m[1]), body: m[2] || "" };
}

/* ---------------- mini markdown ---------------- */
const VIEWER_MARKUP = `
<div class="viewer-wrap">
  <div class="viewer-bar"><span>&gt; rcsb://2JK4 — human VDAC1</span><span id="vstatus">loading…</span></div>
  <div id="vdac-3d"><div class="viewer-fallback">Loading the 3D viewer… nothing showing up? You're likely offline — the structure streams from the RCSB Protein Data Bank.</div></div>
</div>`;

function inline(t){
  t = esc(t);
  t = t.replace(/`([^`]+)`/g,(m,c)=>`<code>${c}</code>`);
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,(m,txt,url)=>{
    const ext = /^https?:/.test(url);
    return `<a href="${url}"${ext?' target="_blank" rel="noopener"':''}>${txt}</a>`;
  });
  t = t.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>");
  t = t.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g,"$1<em>$2</em>");
  t = t.replace(/(^|[^\w])_([^_]+)_(?!\w)/g,"$1<em>$2</em>");
  return t;
}

function renderMarkdown(src){
  const lines = String(src).replace(/\r\n/g,"\n").split("\n");
  let html = "", i = 0;
  const stop = /^(#{2,4}\s|>|[-*]\s|\d+\.\s|:::|!\[|\{\{viewer3d\}\})/;
  while(i < lines.length){
    const line = lines[i];
    if(line.trim()===""){ i++; continue; }
    if(line.trim().startsWith(":::")){
      const cls = line.trim().slice(3).trim() || "callout";
      i++; const buf=[];
      while(i<lines.length && !lines[i].trim().startsWith(":::")){ buf.push(lines[i]); i++; }
      i++;
      html += `<div class="${cls}">${renderMarkdown(buf.join("\n"))}</div>`; continue;
    }
    if(line.trim()==="{{viewer3d}}"){ html += VIEWER_MARKUP; i++; continue; }
    const h = line.match(/^(#{2,4})\s+(.*)$/);
    if(h){ const l=h[1].length; html += `<h${l}>${inline(h[2])}</h${l}>`; i++; continue; }
    const img = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/);
    if(img){ html += `<figure><img src="${img[2]}" alt="${escAttr(img[1])}" loading="lazy">${img[3]?`<figcaption>${inline(img[3])}</figcaption>`:""}</figure>`; i++; continue; }
    if(line.startsWith(">")){ const buf=[]; while(i<lines.length && lines[i].startsWith(">")){ buf.push(lines[i].replace(/^>\s?/,"")); i++; } html+=`<blockquote>${inline(buf.join(" "))}</blockquote>`; continue; }
    if(/^[-*]\s+/.test(line)){ const buf=[]; while(i<lines.length && /^[-*]\s+/.test(lines[i])){ buf.push(lines[i].replace(/^[-*]\s+/,"")); i++; } html+=`<ul>${buf.map(x=>`<li>${inline(x)}</li>`).join("")}</ul>`; continue; }
    if(/^\d+\.\s+/.test(line)){ const buf=[]; while(i<lines.length && /^\d+\.\s+/.test(lines[i])){ buf.push(lines[i].replace(/^\d+\.\s+/,"")); i++; } html+=`<ol>${buf.map(x=>`<li>${inline(x)}</li>`).join("")}</ol>`; continue; }
    const buf=[line]; i++;
    while(i<lines.length && lines[i].trim()!=="" && !stop.test(lines[i])){ buf.push(lines[i]); i++; }
    html += `<p>${inline(buf.join(" "))}</p>`;
  }
  return html;
}

/* ---------------- load content ---------------- */
const cfg = JSON.parse(fs.readFileSync(path.join(CONTENT,"config.json"),"utf8"));
const resources = JSON.parse(fs.readFileSync(path.join(CONTENT,"resources.json"),"utf8"));
const genetics = JSON.parse(fs.readFileSync(path.join(CONTENT,"genetics.json"),"utf8"));
const diseases = JSON.parse(fs.readFileSync(path.join(CONTENT,"diseases.json"),"utf8"));
const companies = JSON.parse(fs.readFileSync(path.join(CONTENT,"companies.json"),"utf8"));
const trials = JSON.parse(fs.readFileSync(path.join(CONTENT,"trials.json"),"utf8"));
const mitohealth = JSON.parse(fs.readFileSync(path.join(CONTENT,"mitohealth.json"),"utf8"));

function loadCollection(dir, type){
  const d = path.join(CONTENT, dir);
  if(!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(f=>f.endsWith(".md")).map(f=>{
    const { data, body } = readFrontMatter(fs.readFileSync(path.join(d,f),"utf8"));
    const slug = f.replace(/\.md$/,"");
    // derive word count + reading time from the body (front matter can override)
    const words = (body.replace(/[#>*_`\[\]()!-]/g," ").trim().match(/\S+/g)||[]).length;
    const readMins = Math.max(1, Math.round(words/200));
    return {
      type, slug,
      url: `/${dir}/${slug}/`,
      title: data.title, date: data.date,
      tags: data.tags || [],
      summary: data.summary || "",
      image: data.image || (type==="news" ? "vdac1-barrel.svg" : "mito.svg"),
      bodyHtml: renderMarkdown(body),
      wordCount: words,
      source: data.source || null,
      kind: data.kind || null,
      readingTime: data.readingTime || `${readMins} min read`,
      viewer3d: !!data.viewer3d,
      format: data.format || "brief",
      contentTypeOverride: data.contentType || null,
      sticker: data.sticker || null,
      accent: data.accent || "teal",
      quickGroup: data.quickGroup || null,
      asideLabel: data.asideLabel || null
    };
  });
}

const news  = loadCollection("news","news").sort((a,b)=>b.date.localeCompare(a.date));
const posts = loadCollection("posts","post").sort((a,b)=>b.date.localeCompare(a.date));
const entries = [...news, ...posts];

// derived taxonomy: domain (VDAC1 vs Mitochondria), category (type), year
const VDAC_TAGS = new Set(["vdac1","vbit"]);
for(const e of entries){
  e.domain = (e.tags.some(t=>VDAC_TAGS.has(slugify(t))) || /vdac/i.test(e.title)) ? "VDAC1" : "Mitochondria";
  e.category = e.type==="news" ? "news" : (e.kind||"post");
  e.year = e.date.slice(0,4);
  // content-type tag: blog vs new research vs other (front-matter can override)
  e.contentType = e.contentTypeOverride || (e.type==="news" ? "new research"
    : (["explainer","personal","drug-watch"].includes(e.kind) ? "blog" : "other"));
}

// tag registry
const tagMap = new Map(); // slug -> {name, entries[]}
for(const e of entries){
  for(const t of e.tags){
    const s = slugify(t);
    if(!tagMap.has(s)) tagMap.set(s,{ name:t, slug:s, entries:[] });
    tagMap.get(s).entries.push(e);
  }
}
for(const t of tagMap.values()) t.entries.sort((a,b)=>b.date.localeCompare(a.date));

function related(entry, n=4){
  return entries
    .filter(e=>e.url!==entry.url)
    .map(e=>({ e, score: e.tags.filter(t=>entry.tags.includes(t)).length }))
    .filter(x=>x.score>0)
    .sort((a,b)=> b.score-a.score || b.e.date.localeCompare(a.e.date))
    .slice(0,n).map(x=>x.e);
}

/* ---------------- shared chrome ---------------- */
function header(active){
  const isOn = (url)=> url===active || (url!=="/" && active.startsWith(url));
  const links = cfg.nav.map(n=>{
    if(n.children){
      const anyOn = isOn(n.url) || n.children.some(c=>isOn(c.url));
      const menu = n.children.map(c=>`<a role="menuitem" href="${c.url}"${isOn(c.url)?' class="active"':""}>${c.label}</a>`).join("");
      return `<div class="hasmenu${anyOn?" active":""}"><a href="${n.url}" aria-haspopup="true">${n.label} <span class="caret">▾</span></a><div class="submenu" role="menu">${menu}</div></div>`;
    }
    const cls = [isOn(n.url)?"active":"", n.feature?"nav-feature":""].filter(Boolean).join(" ");
    return `<a href="${n.url}"${cls?` class="${cls}"`:""}>${n.label}</a>`;
  }).join("");
  return `<header class="site-header"><div class="wrap">
    <a class="brand" href="/">${cfg.brandHtml}</a>
    <button class="nav-toggle" id="nav-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="nav-main"><span></span><span></span><span></span></button>
    <nav class="main" id="nav-main">${links}
      <button class="nav-search" id="ss-open" aria-label="Search the site" title="Search (press /)">🔍 <span class="kbd">/</span></button>
    </nav>
  </div></header>`;
}
function footer(){
  const f = cfg.nav.map(n=>`<a href="${n.url}">${n.label}</a>`).join("");
  return `<footer class="site-footer"><div class="wrap">
    <div class="fnav">${f}</div>
    <div>by ${cfg.author} · <a href="mailto:${cfg.email}">${cfg.email}</a>${cfg.linkedin?` · <a href="${cfg.linkedin}" target="_blank" rel="noopener">LinkedIn</a>`:""} · co-founder @ <a href="${cfg.company.url}" target="_blank" rel="noopener">${cfg.company.name}</a></div>
    <div class="small">${cfg.siteName} is a personal project — an evidence-graded guide to mitochondrial health, written in the open. Nothing here is medical advice. News and rating summaries are my own paraphrases of the cited research; each item links to its source.</div>
  </div></footer>`;
}
function viewerScript(){
  return `<script src="https://3Dmol.org/build/3Dmol-min.js"></script>
<script>(function(){var s=document.getElementById('vstatus');function fail(m){if(s)s.textContent=m||'offline';}
if(typeof $3Dmol==='undefined'){fail('viewer unavailable');return;}
try{var el=document.getElementById('vdac-3d');el.innerHTML='';var v=$3Dmol.createViewer(el,{backgroundColor:'0xfaf6ee'});
$3Dmol.download('pdb:2JK4',v,{},function(){v.setStyle({},{cartoon:{colorscheme:'spectrum'}});v.addStyle({resi:'1-25'},{cartoon:{color:'0xf5a524'}});v.zoomTo();v.spin('y',0.4);v.render();if(s)s.textContent='drag to rotate · scroll to zoom';});
}catch(e){fail('offline');}})();</script>`;
}
function buildSearchIndex(){
  const rec = [];
  for(const e of entries) rec.push({ t:e.title, u:e.url, k:e.type==="news"?"news":"post",
    kw:(e.title+" "+e.summary+" "+e.tags.join(" ")).toLowerCase() });
  for(const t of tagMap.values()) rec.push({ t:"#"+t.name, u:`/tags/${t.slug}/`, k:"tag", kw:t.name.toLowerCase() });
  rec.push({ t:"Mitochondrial health ratings", u:"/mitohealth/", k:"database",
    kw:("mitochondrial health ratings foods drugs supplements lifestyle "+mitohealth.items.map(i=>i.name).join(" ")+" "+mitohealth.categories.join(" ")).toLowerCase() });
  rec.push({ t:"Companies to follow", u:"/companies/", k:"database",
    kw:("companies watchlist "+companies.companies.map(c=>c.name+" "+c.moa.join(" ")+" "+c.indications.join(" ")).join(" ")).toLowerCase() });
  rec.push({ t:"Clinical trials", u:"/trials/", k:"database",
    kw:("clinical trials clinicaltrials "+trials.trials.map(t=>t.drug+" "+t.sponsor+" "+t.nct+" "+t.indication).join(" ")).toLowerCase() });
  rec.push({ t:"VDAC1 gene, sequence & expression", u:"/gene/", k:"science", kw:"vdac1 gene sequence expression gtex uniprot tissue chromosome" });
  rec.push({ t:"Disease body map", u:"/diseases/", k:"science", kw:("disease body map organs "+diseases.regions.map(d=>d.disease+" "+d.label).join(" ")).toLowerCase() });
  rec.push({ t:"Resource shelf", u:"/resources/", k:"science", kw:"resources reviews databases papers labs uniprot pdb alphafold" });
  rec.push({ t:"About — Offer Shina", u:"/about/", k:"page", kw:"about offer shina psen1 carrier x-tosis co-founder" });
  return rec;
}
const SEARCH_INDEX = buildSearchIndex();

function siteScript(){
  return `<div class="ssearch" id="site-search" hidden>
  <div class="ssearch-box" role="dialog" aria-label="Site search">
    <input id="ss-input" type="search" autocomplete="off" aria-label="Search the site" placeholder="Search interventions, companies, trials, posts, tags…">
    <div class="ss-results" id="ss-results"></div>
    <div class="ss-hint"><span class="kbd">↑↓</span> move · <span class="kbd">↵</span> open · <span class="kbd">esc</span> close</div>
  </div></div>
<script>window.__SEARCH__=${JSON.stringify(SEARCH_INDEX)};
(function(){var IDX=window.__SEARCH__,box=document.getElementById('site-search'),inp=document.getElementById('ss-input'),
res=document.getElementById('ss-results'),open=document.getElementById('ss-open'),sel=0,cur=[];
var LBL={news:'news',post:'post',tag:'tag',database:'database',science:'science',page:'page'};
function show(){box.hidden=false;inp.value='';res.innerHTML='';sel=0;setTimeout(function(){inp.focus();},20);}
function hide(){box.hidden=true;}
function run(q){q=q.toLowerCase().trim();if(!q){cur=[];res.innerHTML='<div class="ss-empty">Type to search across the whole site…</div>';return;}
cur=IDX.filter(function(r){return r.kw.indexOf(q)>=0||r.t.toLowerCase().indexOf(q)>=0;})
.sort(function(a,b){var at=a.t.toLowerCase().indexOf(q),bt=b.t.toLowerCase().indexOf(q);var ar=at<0?9:at,br=bt<0?9:bt;return ar-br;}).slice(0,12);
sel=0;draw();}
function draw(){if(!cur.length){res.innerHTML='<div class="ss-empty">No matches.</div>';return;}
res.innerHTML=cur.map(function(r,i){return '<a class="ss-item'+(i===sel?' on':'')+'" href="'+r.u+'"><span class="ss-k">'+(LBL[r.k]||r.k)+'</span>'+r.t+'</a>';}).join('');}
if(open)open.addEventListener('click',show);
document.addEventListener('keydown',function(e){
 if((e.key==='/'||((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'))&&box.hidden){var tag=(e.target.tagName||'').toLowerCase();if(tag==='input'||tag==='textarea'||tag==='select')return;e.preventDefault();show();return;}
 if(box.hidden)return;
 if(e.key==='Escape')hide();
 else if(e.key==='ArrowDown'){e.preventDefault();sel=Math.min(sel+1,cur.length-1);draw();}
 else if(e.key==='ArrowUp'){e.preventDefault();sel=Math.max(sel-1,0);draw();}
 else if(e.key==='Enter'&&cur[sel]){window.location.href=cur[sel].u;}});
inp&&inp.addEventListener('input',function(e){run(e.target.value);});
box.addEventListener('click',function(e){if(e.target===box)hide();});
})();
(function(){var t=document.querySelector('.filter-toggle');if(t)t.addEventListener('click',function(){var s=document.getElementById('side-filters');if(s)s.classList.toggle('open');t.classList.toggle('open');});})();
(function(){var b=document.getElementById('nav-toggle'),n=document.getElementById('nav-main');if(!b||!n)return;
b.addEventListener('click',function(){var open=n.classList.toggle('open');b.setAttribute('aria-expanded',open?'true':'false');});})();</script>`;
}

function layout({title, desc, canonical, content, active, hasViewer=false, jsonld=null, image, ogType="website", published=null, bodyClass=""}){
  const ogImg = `${cfg.baseUrl}/assets/images/${image||"mito.svg"}`;
  const ld = (Array.isArray(jsonld) ? jsonld : (jsonld?[jsonld]:[]))
    .map(o=>`<script type="application/ld+json">${JSON.stringify(o)}</script>`).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escAttr(title)}</title>
<meta name="description" content="${escAttr(desc)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="author" content="${escAttr(cfg.author)}">
<meta name="theme-color" content="#0e9488">
<link rel="canonical" href="${cfg.baseUrl}${canonical}">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${escAttr(cfg.siteName)}">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="${escAttr(title)}">
<meta property="og:description" content="${escAttr(desc)}">
<meta property="og:url" content="${cfg.baseUrl}${canonical}">
<meta property="og:image" content="${ogImg}">
<meta property="og:image:alt" content="${escAttr(title)}">
${published?`<meta property="article:published_time" content="${published}">\n<meta property="article:author" content="${escAttr(cfg.author)}">`:""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escAttr(title)}">
<meta name="twitter:description" content="${escAttr(desc)}">
<meta name="twitter:image" content="${ogImg}">
<meta name="twitter:image:alt" content="${escAttr(title)}">
${cfg.twitter?`<meta name="twitter:site" content="${escAttr(cfg.twitter)}">`:""}
<link rel="alternate" type="application/rss+xml" title="${escAttr(cfg.siteName)}" href="/feed.xml">
<link rel="sitemap" type="application/xml" href="/sitemap.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/style.css">
${ld}
</head>
<body${bodyClass?` class="${bodyClass}"`:""}>
${header(active)}
${content}
${footer()}
${siteScript()}
${hasViewer?viewerScript():""}
</body>
</html>`;
}

/* ---------------- components ---------------- */
const tagChips = tags => `<div class="chips">${tags.map(t=>`<a class="chip" href="/tags/${slugify(t)}/">${esc(t)}</a>`).join("")}</div>`;

function sourceBox(src){
  if(!src) return "";
  const doi = src.doi ? `https://doi.org/${src.doi}` : (src.url||"#");
  return `<div class="sourcebox">📄 <b>Source:</b> ${esc(src.authors||"")}, <em>${esc(src.journal||"")}</em> ${src.year||""} · <a href="${doi}" target="_blank" rel="noopener">${src.doi?`doi.org/${esc(src.doi)}`:"link"}</a><br><span style="color:var(--ink-soft)">Details via PubMed. Summary above is my own paraphrase.</span></div>`;
}

function moreAbout(entry){
  const rel = related(entry);
  const relHtml = rel.length ? `<div class="related-grid">${rel.map(r=>`
    <div class="related-item"><span class="k">${r.type==="news"?"news":(r.kind||"post")}</span>
    <a href="${r.url}">${esc(r.title)}</a></div>`).join("")}</div>` :
    `<p class="section-sub">No related posts yet — this one's a bit of a lone wolf.</p>`;
  return `<section class="moreabout">
    <h2>More about this</h2>
    <p class="section-sub">Topics in this piece — follow a tag to see everything filed under it:</p>
    ${tagChips(entry.tags)}
    <h2 style="font-size:1.1rem;margin-top:26px;">Related reading</h2>
    ${relHtml}
  </section>`;
}

/* ---------------- pages ---------------- */
function articlePage(e){
  const isNews = e.type==="news";
  const section = isNews ? "News" : "Posts";
  const sectionUrl = isNews ? "/news/" : "/posts/";
  const kicker = isNews
    ? `news · ${e.source?`${esc(e.source.journal)} ${e.source.year}`:""} · ${fmtDate(e.date)}`
    : `${e.kind||"post"} · ${fmtDate(e.date)}${e.readingTime?` · ${e.readingTime}`:""}`;
  const mins = Math.max(1, Math.round((e.wordCount||0)/200));
  const jsonld = [{
    "@context":"https://schema.org","@type":"BlogPosting",
    "headline":e.title,"datePublished":e.date,"dateModified":e.date,
    "author":{"@type":"Person","name":cfg.author,"url":`${cfg.baseUrl}/about/`},
    "publisher":{"@type":"Organization","name":cfg.siteName,"url":cfg.baseUrl},
    "mainEntityOfPage":`${cfg.baseUrl}${e.url}`,
    "keywords":e.tags.join(", "),
    "articleSection":e.type==="news"?"Research news":(e.kind||"Post"),
    "wordCount":e.wordCount, "timeRequired":`PT${mins}M`, "inLanguage":"en",
    "description":e.summary,
    "image":`${cfg.baseUrl}/assets/images/${e.image}`
  },{
    "@context":"https://schema.org","@type":"BreadcrumbList",
    "itemListElement":[
      {"@type":"ListItem","position":1,"name":"Home","item":`${cfg.baseUrl}/`},
      {"@type":"ListItem","position":2,"name":section,"item":`${cfg.baseUrl}${sectionUrl}`},
      {"@type":"ListItem","position":3,"name":e.title,"item":`${cfg.baseUrl}${e.url}`}
    ]
  }];
  const content = `<main><div class="wrap"><article class="full">
    <nav class="breadcrumb"><a href="/">home</a> / <a href="${sectionUrl}">${section.toLowerCase()}</a> / ${esc(e.title)}</nav>
    <p class="kicker">${kicker}</p>
    <h1>${esc(e.title)}</h1>
    ${tagChips(e.tags)}
    <div class="bodycopy">${e.bodyHtml}</div>
    ${sourceBox(e.source)}
    ${moreAbout(e)}
    <a class="backlink" href="${sectionUrl}">← back to ${section.toLowerCase()}</a>
  </article></div></main>`;
  return layout({ title:`${e.title} — ${cfg.siteName}`, desc:e.summary, canonical:e.url,
    content, active:sectionUrl, hasViewer:e.viewer3d, jsonld, image:e.image,
    ogType:"article", published:e.date });
}

function newsListItem(e){
  const doi = e.source && e.source.doi ? `https://doi.org/${e.source.doi}` : (e.source&&e.source.url)||"#";
  const srcLine = e.source ? `<p class="src">→ ${esc(e.source.authors)}, <em>${esc(e.source.journal)}</em> ${e.source.year} · <a href="${doi}" target="_blank" rel="noopener">${e.source.doi?`doi.org/${esc(e.source.doi)}`:"link"}</a></p>` : "";
  if(e.format==="feature"){
    return `<div class="n-feature"><div class="body">
      ${e.sticker?`<span class="sticker teal">${esc(e.sticker)}</span>`:""}
      <div class="meta"><span>${fmtDate(e.date)}</span>${e.source?`<span>${esc(e.source.journal)}</span>`:""}</div>
      <h3><a href="${e.url}">${esc(e.title)}</a></h3>
      <p>${esc(e.summary)}</p>
      <a class="readmore" href="${e.url}">the full story →</a>${srcLine}
    </div><div class="art"><img src="/assets/images/${e.image}" alt="" loading="lazy"></div></div>`;
  }
  if(e.format==="brief"){
    const acc = e.accent==="pink"?" pink":e.accent==="violet"?" violet":"";
    return `<div class="n-brief${acc}">
      ${e.sticker?`<span class="sticker ${e.accent==="pink"?"pink":"teal"} rot">${esc(e.sticker)}</span>`:""}
      <div class="meta"><span>${fmtDate(e.date)}</span>${e.source?`<span>${esc(e.source.journal)}</span>`:""}</div>
      <h3><a href="${e.url}">${esc(e.title)}</a></h3>
      <p>${esc(e.summary)}</p>
      <a class="readmore" href="${e.url}">read the write-up →</a>${srcLine}
    </div>`;
  }
  if(e.format==="oneliner"){
    const d=new Date(e.date);
    return `<div class="n-oneliner"><span class="tick">${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].toUpperCase()}</span>
      <span>${esc(e.summary)} <a href="${e.url}">read →</a></span></div>`;
  }
  if(e.format==="aside"){
    return `<div class="n-aside"><span class="lbl">${esc(e.asideLabel||"aside")}</span>
      <p style="margin:8px 0 0;">${esc(e.summary)} <a href="${e.url}">more →</a></p>${srcLine}</div>`;
  }
  return "";
}

function newsListing(){
  // combined "news + explore": a featured strip, then the full filterable grid.
  const quick = news.filter(e=>e.format==="quick");
  let quickEmitted=false, featured="";
  for(const e of news.filter(e=>["feature","brief","oneliner","quick","aside"].includes(e.format)).slice(0,6)){
    if(e.format==="quick"){
      if(quickEmitted) continue; quickEmitted=true;
      const groupTitle = quick[0].quickGroup || "quick hits";
      featured += `<div class="n-quickbox"><span class="sticker violet">${esc(groupTitle)}</span>
        <h3>Mitochondria news, rapid-fire</h3>
        <ol>${quick.map(q=>{const doi=q.source&&q.source.doi?`https://doi.org/${q.source.doi}`:"#";
          return `<li><strong><a href="${q.url}">${esc(q.title)}</a>.</strong> ${esc(q.summary)} ${q.source?`<a href="${doi}" target="_blank" rel="noopener">${esc(q.source.journal)} →</a>`:""}</li>`;}).join("")}</ol></div>`;
    } else featured += newsListItem(e);
  }

  // filterable grid over EVERYTHING (news + posts)
  const all = entries.slice().sort((a,b)=>b.date.localeCompare(a.date));
  const domains = ["VDAC1","Mitochondria"];
  const types = ["new research","blog","other"].filter(t=>all.some(e=>e.contentType===t));
  const cats = [...new Set(all.map(e=>e.category))];
  const years = [...new Set(all.map(e=>e.year))].sort().reverse();
  const tags = [...tagMap.values()].sort((a,b)=>b.entries.length-a.entries.length);
  const items = all.map(e=>`<article class="exp-card" data-domain="${e.domain}" data-type="${escAttr(e.contentType)}" data-cat="${e.category}" data-year="${e.year}" data-tags="${e.tags.map(slugify).join(" ")}" data-date="${e.date}">
    <div class="exp-meta"><span class="exp-domain ${e.domain==="VDAC1"?"d1":"d2"}">${e.domain}</span><span class="exp-type">${esc(e.contentType)}</span><span>${fmtDate(e.date)}</span></div>
    <h3><a href="${e.url}">${esc(e.title)}</a></h3>
    <p>${esc(e.summary)}</p>
    ${tagChips(e.tags)}
  </article>`).join("");
  const btn = (grp,val,label)=>`<button class="fbtn" data-group="${grp}" data-val="${escAttr(val)}">${esc(label)}</button>`;

  const content = `<div class="hero"><div class="wrap"><div>
      <p class="eyebrow">what I've been reading</p>
      <h1>Research news</h1>
      <p class="lead">I read a lot of mitochondria and VDAC1 papers so you don't have to. The ones worth knowing about — summarised in my own words, always linked to the source. Below the highlights, filter the whole archive by topic, category, year or tag.</p>
    </div><div class="hero-art"><img src="/assets/images/vdac1-barrel.svg" alt="VDAC1 channel"></div></div></div>
    <main><div class="wrap">
      <section>${featured}</section>
      <hr class="rule">
      <h2><span class="num">·</span>The full archive</h2>
      <p class="section-sub">Every post and news piece — split by domain (VDAC1 vs mitochondria), category, year and tag.</p>
      <button class="filter-toggle" aria-label="Toggle filters">⚙ Filters</button>
      <div class="sidebar-wrap">
        <aside class="sidebar" id="side-filters"><div class="filters">
          <div class="fgroup"><span class="flabel">type</span><div class="fchips">${types.map(t=>btn("type",t,t)).join("")}</div></div>
          <div class="fgroup"><span class="flabel">domain</span><div class="fchips">${domains.map(d=>btn("domain",d,d)).join("")}</div></div>
          <div class="fgroup"><span class="flabel">category</span><div class="fchips">${cats.map(c=>btn("cat",c,c)).join("")}</div></div>
          <div class="fgroup"><span class="flabel">year</span><div class="fchips">${years.map(y=>btn("year",y,y)).join("")}</div></div>
          <div class="fgroup"><span class="flabel">tag</span>
            <select id="ftag"><option value="">all tags</option>${tags.map(t=>`<option value="${t.slug}">${esc(t.name)} (${t.entries.length})</option>`).join("")}</select></div>
          <div class="fgroup"><span class="flabel">sort</span><div class="fchips">
            <button class="fbtn sortbtn on" data-sort="new">newest</button><button class="fbtn sortbtn" data-sort="old">oldest</button></div></div>
          <div class="fgroup"><button class="fbtn clear" id="fclear">✕ clear</button> <span id="fcount" class="fcount"></span></div>
        </div></aside>
        <div class="content">
          <div class="exp-grid" id="expgrid">${items}</div>
          <p id="fempty" class="section-sub" style="display:none;">Nothing matches those filters — loosen one.</p>
        </div>
      </div>
    </div></main>
    <script>(function(){
      var grid=document.getElementById('expgrid');var cards=[].slice.call(grid.children);
      var state={type:null,domain:null,cat:null,year:null,tag:'',sort:'new'};
      function apply(){var n=0;
        cards.forEach(function(c){var ok=true;
          if(state.type&&c.dataset.type!==state.type)ok=false;
          if(state.domain&&c.dataset.domain!==state.domain)ok=false;
          if(state.cat&&c.dataset.cat!==state.cat)ok=false;
          if(state.year&&c.dataset.year!==state.year)ok=false;
          if(state.tag&&(' '+c.dataset.tags+' ').indexOf(' '+state.tag+' ')<0)ok=false;
          c.style.display=ok?'':'none';if(ok)n++;});
        document.getElementById('fcount').textContent=n+' / '+cards.length;
        document.getElementById('fempty').style.display=n?'none':'';
        var vis=cards.filter(function(c){return c.style.display!=='none';});
        vis.sort(function(a,b){return state.sort==='new'?b.dataset.date.localeCompare(a.dataset.date):a.dataset.date.localeCompare(b.dataset.date);});
        vis.forEach(function(c){grid.appendChild(c);});}
      document.querySelectorAll('.fbtn[data-group]').forEach(function(b){b.addEventListener('click',function(){
        var g=b.dataset.group,v=b.dataset.val,key=g==='cat'?'cat':g;
        if(state[key]===v){state[key]=null;b.classList.remove('on');}
        else{state[key]=v;document.querySelectorAll('.fbtn[data-group="'+g+'"]').forEach(function(x){x.classList.toggle('on',x===b);});}
        apply();});});
      document.querySelectorAll('.sortbtn').forEach(function(b){b.addEventListener('click',function(){state.sort=b.dataset.sort;document.querySelectorAll('.sortbtn').forEach(function(x){x.classList.toggle('on',x===b);});apply();});});
      document.getElementById('ftag').addEventListener('change',function(e){state.tag=e.target.value;apply();});
      document.getElementById('fclear').addEventListener('click',function(){state={type:null,domain:null,cat:null,year:null,tag:'',sort:'new'};
        document.querySelectorAll('.fbtn.on').forEach(function(x){if(!x.classList.contains('sortbtn'))x.classList.remove('on');});
        document.querySelectorAll('.sortbtn').forEach(function(x){x.classList.toggle('on',x.dataset.sort==='new');});
        document.getElementById('ftag').value='';apply();});
      apply();
    })();</script>`;
  const newsLd = { "@context":"https://schema.org","@type":"CollectionPage","name":"Research news","url":`${cfg.baseUrl}/news/`,
    "description":"Recent mitochondria and VDAC1 research, summarised and linked to the source.",
    "isPartOf":{"@type":"WebSite","name":cfg.siteName,"url":`${cfg.baseUrl}/`},
    "mainEntity":{"@type":"ItemList","numberOfItems":entries.length,"itemListElement":entries.map((e,ix)=>({"@type":"ListItem","position":ix+1,"url":`${cfg.baseUrl}${e.url}`,"name":e.title}))} };
  return layout({ title:`Research news — ${cfg.siteName}`, desc:"Recent mitochondria and VDAC1 research summarized in plain language and linked to the source — filterable by domain, category, year and tag.", canonical:"/news/", content, active:"/news/", bodyClass:"wide", image:"vdac1-barrel.svg", jsonld:newsLd });
}

function postsListing(){
  const cards = posts.map(p=>`<div class="card">
    <div class="meta"><span>${p.kind||"post"}</span><span>${fmtDate(p.date)}</span>${p.readingTime?`<span>${esc(p.readingTime)}</span>`:""}</div>
    <h3><a href="${p.url}">${esc(p.title)}</a></h3>
    <p>${esc(p.summary)}</p>
    ${tagChips(p.tags)}
    <a class="readmore" href="${p.url}">read →</a>
  </div>`).join("");
  const content = `<div class="hero"><div class="wrap"><div>
      <p class="eyebrow">the longer reads</p>
      <h1>Posts &amp; explainers</h1>
      <p class="lead">The pieces I sit down and actually write — primers, drug watches, and the occasional personal note. For the paper-by-paper feed, see <a href="/news/">news</a>.</p>
    </div><div class="hero-art"><img src="/assets/images/mito.svg" alt="Mitochondrion"></div></div></div>
    <main><div class="wrap"><section>${cards}</section></div></main>`;
  return layout({ title:`Posts — ${cfg.siteName}`, desc:"Long-form explainers and notes on mitochondria and VDAC1.", canonical:"/posts/", content, active:"/posts/", image:"mito.svg" });
}

function homePage(){
  const feature = news.find(e=>e.format==="feature") || news[0];
  const briefs = news.filter(e=>e!==feature).slice(0,2);
  const primer = posts.find(p=>p.kind==="explainer") || posts[0];
  const teasers = [
    { t:"Research News", u:"/news/", m:`${news.length} write-ups`, i:"✱", d:"Recent mitochondria & VDAC1 research in plain words, always linked to the source." },
    { t:"Mito-Medicine Companies", u:"/companies/", m:`${companies.companies.length} companies`, i:"◈", d:"A filterable watchlist of who's actually building mitochondrial medicine." },
    { t:"Clinical Trials", u:"/trials/", m:`${trials.trials.length} trials`, i:"⚕", d:"Mito-drug trials linked straight to their ClinicalTrials.gov records." },
    { t:"The VDAC1 Gene & Expression", u:"/gene/", m:"sequence + GTEx", i:"⌗", d:"The gene, its 283-amino-acid protein, and where in the body it's switched on." },
    { t:"VDAC1 Disease Body Map", u:"/diseases/", m:`${diseases.regions.length} organs`, i:"◉", d:"Where VDAC1 goes wrong across the body — each organ linked to a key paper." },
    { t:"VDAC1 & Mitochondria Resources", u:"/resources/", m:"curated links", i:"❑", d:"The reviews, databases and labs I keep coming back to." },
    { t:"About — the mission", u:"/about/", m:"who & why", i:"✎", d:"PSEN1 carrier, x-tosis co-founder, full-time mitochondria nerd." }
  ];
  const content = `<div class="hero"><div class="wrap">
      <div>
        <p class="eyebrow">${cfg.hero.eyebrow}</p>
        <h1>${cfg.hero.titleHtml}</h1>
        <p class="lead">${cfg.hero.lead}</p>
        <div class="hero-cta">
          <a class="btn-primary" href="/mitohealth/">★ Browse the Health Ratings</a>
          <a class="btn-ghost" href="/about/">Why I'm building this →</a>
        </div>
        <div class="tagpills">
          <span class="pill t1">health ratings</span><span class="pill t2">exercise · sleep · fasting</span>
          <span class="pill t3">supplements</span><span class="pill t4">VDAC1</span><span class="pill t1">mitophagy</span>
        </div>
      </div>
      <div class="hero-art"><img src="/assets/images/mito.svg" alt="Cross-section of a mitochondrion with VDAC1 pores"></div>
    </div></div>
    <main><div class="wrap">
      <section class="flagship">
        <a class="flag-card" href="/mitohealth/">
          <div class="flag-body">
            <span class="flag-tag">★ the heart of the site</span>
            <h2>Mitochondrial Health Ratings</h2>
            <p>${mitohealth.items.length} interventions — foods, drugs, supplements and lifestyle pillars like sleep, exercise, fasting, sauna and light — each graded for <b>evidence</b>, <b>benefit</b> and <b>safety</b>, and linked to the research. The honest, filterable database I wish existed. This is the one to start with.</p>
            <span class="flag-cta">Explore the ratings →</span>
          </div>
          <div class="flag-stat"><b>${mitohealth.items.length}</b><span>interventions<br>graded</span></div>
        </a>
      </section>
      <section>
        <h2><span class="num">01</span>Everything else, at a glance</h2>
        <p class="section-sub">Everything here in one glance — pick a door. New? The <a href="${primer.url}">5-minute VDAC1 primer</a> is the gentlest start.</p>
        <div class="sitemap-grid">
          ${teasers.map(x=>`<a class="teaser" href="${x.u}">
            <span class="teaser-ico">${x.i}</span>
            <span class="teaser-meta">${esc(x.m)}</span>
            <h3>${esc(x.t)}</h3>
            <p>${esc(x.d)}</p>
            <span class="teaser-go">explore →</span>
          </a>`).join("")}
        </div>
      </section>
      <section>
        <h2><span class="num">02</span>Fresh off the notebook</h2>
        <p class="section-sub">The latest bits. Full archive lives in <a href="/news/">news</a>.</p>
        ${newsListItem(feature)}
        ${briefs.map(b=>`<div class="n-brief${b.accent==="pink"?" pink":""}">
          <div class="meta"><span>${fmtDate(b.date)}</span>${b.source?`<span>${esc(b.source.journal)}</span>`:""}</div>
          <h3><a href="${b.url}">${esc(b.title)}</a></h3>
          <p>${esc(b.summary)}</p><a class="readmore" href="${b.url}">read →</a>
        </div>`).join("")}
      </section>
      <section id="vdac1-3d">
        <h2><span class="num">03</span>VDAC1 in 3D</h2>
        <p class="section-sub">The actual crystal structure of human VDAC1 (PDB <b>2JK4</b>) — grab it and spin. Nineteen β-strands rolled into a barrel, N-terminal helix tucked inside. <em>(Needs internet to load the atoms.)</em></p>
        ${VIEWER_MARKUP}
      </section>
    </div></main>`;
  const homeLd = [
    { "@context":"https://schema.org","@type":"WebSite","name":cfg.siteName,"url":`${cfg.baseUrl}/`,
      "description":cfg.description,
      "potentialAction":{"@type":"SearchAction","target":`${cfg.baseUrl}/news/?tag={search_term_string}`,"query-input":"required name=search_term_string"} },
    { "@context":"https://schema.org","@type":"Person","name":cfg.author,"email":`mailto:${cfg.email}`,
      "affiliation":{"@type":"Organization","name":cfg.company.name,"url":cfg.company.url},
      "url":`${cfg.baseUrl}/about/`,
      "sameAs":[cfg.linkedin, cfg.company.url].filter(Boolean) },
    { "@context":"https://schema.org","@type":"Blog","name":cfg.siteName,"url":`${cfg.baseUrl}/`,
      "blogPost": entries.slice(0,10).map(e=>({"@type":"BlogPosting","headline":e.title,"url":`${cfg.baseUrl}${e.url}`,"datePublished":e.date})) }
  ];
  return layout({ title:`${cfg.siteName} — Offer Shina on VDAC1 & mitochondria`, desc:cfg.description, canonical:"/", content, active:"/", hasViewer:true, image:"mito.svg", jsonld:homeLd });
}

function resourcesPage(){
  const groups = resources.groups.map(g=>`<div class="res-group">
    <div class="rlabel">// ${esc(g.label)}</div>
    <h3>${esc(g.title)}</h3>
    <ul class="res-list">${g.links.map(l=>`<li class="res-item"><a href="${l.url}" target="_blank" rel="noopener">${esc(l.title)}</a><div class="desc">${esc(l.desc)}</div></li>`).join("")}</ul>
  </div>`).join("");
  const content = `<div class="hero"><div class="wrap"><div>
      <p class="eyebrow">the good stuff, in one place</p>
      <h1>The resource shelf</h1>
      <p class="lead">If I could hand a newcomer one page to get oriented on mitochondria and VDAC1, this is it. Living list — I add keepers as I find them.</p>
    </div><div class="hero-art"><img src="/assets/images/mito.svg" alt="Mitochondrion"></div></div></div>
    <main><div class="wrap">
      <section>
        <div class="rlabel" style="font-family:var(--mono);font-size:0.72rem;text-transform:uppercase;letter-spacing:1px;color:var(--coral);">// watch it work</div>
        <h2 style="margin:2px 0 4px;">VDAC1, animated</h2>
        <p class="section-sub">The whole villain arc in one loop: a single channel gating, then VDAC1 oligomerizing into a big pore, leaking mitochondrial DNA, and tripping the cGAS–STING inflammation alarm.</p>
        <div class="mediaframe"><img src="/assets/images/vdac1-anim.svg" alt="Animation of VDAC1 oligomerizing and releasing mtDNA"></div>
        <div class="media-links">
          <a href="/mitohealth/">→ mitochondrial health ratings</a>
          <a href="/companies/">→ companies to follow</a>
          <a href="/trials/">→ clinical trials</a>
          <a href="/gene/">→ VDAC1 gene, sequence &amp; expression</a>
          <a href="/diseases/">→ disease body map</a>
          <a href="/#vdac1-3d">→ spin the 3D structure</a>
        </div>
      </section>
      ${groups}
      <p class="section-sub" style="margin-top:30px;">Got a resource I'm missing? I'd love it — <a href="mailto:${cfg.email}">${cfg.email}</a>.</p>
    </div></main>`;
  return layout({ title:`Resources — ${cfg.siteName}`, desc:"A curated shelf of the best mitochondria and VDAC1 resources: reviews, databases, structures, animations and labs.", canonical:"/resources/", content, active:"/resources/", image:"mito.svg" });
}

function aboutPage(){
  const { data, body } = readFrontMatter(fs.readFileSync(path.join(CONTENT,"about.md"),"utf8"));
  const content = `<div class="hero"><div class="wrap"><div>
      <p class="eyebrow">${esc(data.eyebrow)}</p>
      <h1>${esc(data.title)}</h1>
      <p class="lead">${data.lead}</p>
    </div><div class="hero-art"><img src="/assets/images/mito.svg" alt="Mitochondrion"></div></div></div>
    <main><div class="wrap"><div class="about-grid">
      <div class="about-body">${renderMarkdown(body)}</div>
      <aside class="about-card">
        <img src="/assets/images/portrait.svg" alt="${escAttr(cfg.author)}">
        <div class="info"><b>${cfg.author}</b><br>mitochondria obsessive<br><br>
        ◇ PSEN1 carrier<br>◇ co-founder, <a href="${cfg.company.url}" target="_blank" rel="noopener">${cfg.company.name}</a><br>
        ◇ writes <a href="/">${cfg.siteName}</a><br><br>
        <a href="mailto:${cfg.email}">${cfg.email}</a>${cfg.linkedin?`<br><a href="${cfg.linkedin}" target="_blank" rel="noopener">LinkedIn ↗</a>`:""}</div>
      </aside>
    </div></div></main>`;
  return layout({ title:`About — ${cfg.siteName}`, desc:`${cfg.author} — PSEN1 carrier, co-founder at ${cfg.company.name}, and the person behind ${cfg.siteName}.`, canonical:"/about/", content, active:"/about/", image:"mito.svg" });
}

function tagIndexPage(){
  const cloud = [...tagMap.values()].sort((a,b)=>b.entries.length-a.entries.length || a.name.localeCompare(b.name))
    .map(t=>`<a href="/tags/${t.slug}/">${esc(t.name)} <span class="c">${t.entries.length}</span></a>`).join("");
  const content = `<div class="hero"><div class="wrap"><div>
      <p class="eyebrow">everything, filed</p><h1>Tags</h1>
      <p class="lead">Every post and news piece is tagged. Pick a thread and pull.</p>
    </div><div class="hero-art"><img src="/assets/images/vdac1-barrel.svg" alt="VDAC1"></div></div></div>
    <main><div class="wrap"><div class="tagcloud">${cloud}</div></div></main>`;
  return layout({ title:`Tags — ${cfg.siteName}`, desc:"Browse every topic covered on the blog.", canonical:"/tags/", content, active:"/tags/", image:"vdac1-barrel.svg" });
}

function tagPage(t){
  const items = t.entries.map(e=>`<li>
    <span class="k">${e.type==="news"?"news":(e.kind||"post")} · ${fmtDate(e.date)}</span>
    <a class="title" href="${e.url}">${esc(e.title)}</a>
    <div class="d">${esc(e.summary)}</div></li>`).join("");
  const content = `<div class="hero"><div class="wrap"><div>
      <p class="eyebrow"><a href="/tags/">tags</a> / ${esc(t.slug)}</p>
      <h1>#${esc(t.name)}</h1>
      <p class="lead">${t.entries.length} piece${t.entries.length>1?"s":""} tagged <strong>${esc(t.name)}</strong>.</p>
    </div><div class="hero-art"><img src="/assets/images/mito.svg" alt=""></div></div></div>
    <main><div class="wrap"><ul class="taglist">${items}</ul>
      <p style="margin-top:26px;"><a class="backlink" href="/tags/">← all tags</a></p>
    </div></main>`;
  return layout({ title:`#${t.name} — ${cfg.siteName}`, desc:`Everything on the blog tagged ${t.name}.`, canonical:`/tags/${t.slug}/`, content, active:"/tags/", image:"mito.svg" });
}

function genePage(){
  const g = genetics.gene;
  const maxTpm = Math.max(...genetics.expression.map(x=>x.tpm));
  const bars = genetics.expression.map(x=>{
    const pct = (x.tpm/maxTpm*100).toFixed(1);
    return `<div class="exprrow"><span class="exprlabel">${esc(x.tissue)}</span>
      <span class="exprtrack"><span class="exprfill" style="width:${pct}%"></span></span>
      <span class="exprval">${x.tpm.toFixed(0)}</span></div>`;
  }).join("");
  // sequence in blocks of 10, lines of 60, with position numbers
  const seq = genetics.sequence;
  let seqHtml="";
  for(let i=0;i<seq.length;i+=60){
    const chunk = seq.slice(i,i+60).replace(/(.{10})/g,"$1 ").trim();
    seqHtml += `<div class="seqline"><span class="seqpos">${String(i+1).padStart(3," ")}</span> ${chunk}</div>`;
  }
  const facts = [
    ["Gene symbol", g.symbol],
    ["Full name", g.name],
    ["Location", `chromosome ${g.chromosome} (${g.locus})`],
    ["Coordinates", g.coordinates],
    ["Type", g.type],
    ["Protein length", `${g.proteinLength} amino acids`],
    ["Structure", `PDB ${g.structurePdb}`],
    ["IDs", `Ensembl ${g.ensemblId} · Entrez ${g.entrezId} · UniProt ${g.uniprotId}`]
  ].map(([k,v])=>`<div class="factrow"><span class="factk">${esc(k)}</span><span class="factv">${esc(v)}</span></div>`).join("");
  const src = genetics.sources.map(s=>`<li class="res-item"><a href="${s.url}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`).join("");
  const content = `<div class="hero"><div class="wrap"><div>
      <p class="eyebrow">the gene itself · sequenced &amp; mapped</p>
      <h1>VDAC1: the gene, the sequence, where it's switched on</h1>
      <p class="lead">Pulled from public sources — the human <strong>VDAC1</strong> gene, its 283-amino-acid protein sequence, and where in the body it's most active. Notice the pattern: it's everywhere, but loudest in the tissues that burn the most energy.</p>
    </div><div class="hero-art"><img src="/assets/images/vdac1-barrel.svg" alt="VDAC1 channel"></div></div></div>
    <main><div class="wrap">
      <section><h2><span class="num">01</span>The gene, in numbers</h2>
        <div class="genefacts">${facts}</div>
      </section>
      <section><h2><span class="num">02</span>Where it's activated</h2>
        <p class="section-sub">${esc(genetics.expressionNote)} <span style="white-space:nowrap;">Bars = median RNA expression (TPM), GTEx v8.</span></p>
        <div class="exprchart">${bars}</div>
      </section>
      <section><h2><span class="num">03</span>The protein sequence</h2>
        <p class="section-sub">Human VDAC1, ${g.proteinLength} residues (UniProt ${g.uniprotId}). The first ~25 form the N-terminal helix that sits inside the pore.</p>
        <div class="seqblock">${seqHtml}</div>
      </section>
      <section><h2><span class="num">04</span>Sources</h2>
        <p class="section-sub">Fetched ${esc(genetics.fetched)} from public databases — go live for the latest:</p>
        <ul class="res-list">${src}</ul>
      </section>
    </div></main>`;
  const geneLd = { "@context":"https://schema.org","@type":"Dataset","name":"VDAC1 gene & tissue expression","url":`${cfg.baseUrl}/gene/`,
    "description":`Human VDAC1 (${g.symbol}) gene: chromosome ${g.chromosome} locus ${g.locus}, ${g.proteinLength}-aa protein (UniProt ${g.uniprotId}), and median tissue expression from GTEx v8.`,
    "keywords":"VDAC1, gene expression, GTEx, UniProt, mitochondria","inLanguage":"en","isAccessibleForFree":true,
    "creator":{"@type":"Person","name":cfg.author},
    "citation":genetics.sources.map(s=>s.url) };
  return layout({ title:`VDAC1 gene, sequence & expression — ${cfg.siteName}`, desc:"The human VDAC1 gene: genomic location, 283-aa protein sequence, and tissue expression (GTEx v8) — where the channel is switched on.", canonical:"/gene/", content, active:"/gene/", image:"vdac1-barrel.svg", jsonld:geneLd });
}

function diseasesPage(){
  const R = diseases.regions;
  const hotspots = R.map(d=>`<a class="hot" href="#dx-${d.id}" data-id="${d.id}" aria-label="${escAttr(d.disease)}">
    <circle cx="${d.x}" cy="${d.y}" r="${d.r}"></circle>
    <circle cx="${d.x}" cy="${d.y}" r="4" class="hotdot"></circle></a>`).join("");
  const cards = R.map(d=>{
    const internal = d.internal ? `<a href="${d.internal}">read my write-up →</a>` : "";
    return `<li class="dxcard" id="dx-${d.id}">
      <span class="dxorgan">${esc(d.label)}</span>
      <h3>${esc(d.disease)}</h3>
      <p>${esc(d.blurb)}</p>
      <div class="dxlinks"><a href="${d.paperUrl}" target="_blank" rel="noopener">${esc(d.paperLabel)}</a> ${internal}</div>
      ${tagChips(d.tags)}
    </li>`;
  }).join("");
  const data = JSON.stringify(R.reduce((o,d)=>{o[d.id]={label:d.label,disease:d.disease,blurb:d.blurb,paperUrl:d.paperUrl,paperLabel:d.paperLabel,internal:d.internal||null};return o;},{}));
  const content = `<div class="hero"><div class="wrap"><div>
      <p class="eyebrow">one protein, damage everywhere</p>
      <h1>The VDAC1 disease body map</h1>
      <p class="lead">${esc(diseases.intro)}</p>
    </div><div class="hero-art"><img src="/assets/images/vdac1-anim.svg" alt="VDAC1 animation"></div></div></div>
    <main><div class="wrap">
      <div class="bodywrap">
        <div class="bodymap">
          <svg viewBox="0 0 300 640" role="img" aria-label="Human body map of VDAC1-related diseases">
            <g class="silhouette">
              <circle cx="150" cy="52" r="32"/>
              <rect x="140" y="80" width="20" height="18"/>
              <rect x="108" y="92" width="84" height="210" rx="30"/>
              <rect x="116" y="296" width="68" height="50" rx="18"/>
              <rect x="78" y="102" width="22" height="172" rx="11"/>
              <rect x="200" y="102" width="22" height="172" rx="11"/>
              <rect x="120" y="340" width="28" height="272" rx="14"/>
              <rect x="152" y="340" width="28" height="272" rx="14"/>
            </g>
            ${hotspots}
          </svg>
        </div>
        <aside class="dxpanel" id="dxpanel">
          <div class="dxpanel-inner">
            <span class="dxpanel-hint">${esc(diseases.panelHint||"Tap a glowing spot")} →</span>
            <h3 id="dxp-title">${esc(diseases.panelTitle||"Pick an organ")}</h3>
            <p id="dxp-blurb" class="section-sub">${esc(diseases.panelBlurb||"")}</p>
            <div id="dxp-links" class="dxlinks"></div>
          </div>
        </aside>
      </div>
      <section style="margin-top:40px;">
        <h2><span class="num">·</span>${esc(diseases.listTitle||"Every link, spelled out")}</h2>
        <p class="section-sub">${esc(diseases.listSub||"")}</p>
        <ul class="dxlist">${cards}</ul>
      </section>
      <p class="section-sub" style="margin-top:20px;">Body map built from the papers I've been reading — if you sent a specific 3D anatomical asset you want used here, drop it in and I'll wire it up.</p>
    </div></main>
    <script>window.__DX__=${data};(function(){var d=window.__DX__;var panel=document.getElementById('dxpanel');
    function show(id){var x=d[id];if(!x)return;document.getElementById('dxp-title').textContent=x.disease;
    document.getElementById('dxp-blurb').textContent=x.blurb;
    var L='<a href="'+x.paperUrl+'" target="_blank" rel="noopener">'+x.paperLabel+'</a>';
    if(x.internal)L+=' <a href="'+x.internal+'">read my write-up →</a>';
    document.getElementById('dxp-links').innerHTML=L;
    var h=document.querySelector('.dxpanel-hint');if(h)h.style.display='none';
    document.querySelectorAll('.hot').forEach(function(el){el.classList.toggle('on',el.dataset.id===id));}
    panel.classList.add('active');}
    document.querySelectorAll('.hot').forEach(function(el){
      el.addEventListener('mouseenter',function(){show(el.dataset.id);});
      el.addEventListener('click',function(e){show(el.dataset.id);});
      el.addEventListener('focus',function(){show(el.dataset.id);});
    });})();</script>`;
  return layout({ title:`VDAC1 disease body map — ${cfg.siteName}`, desc:"An interactive body map of the diseases VDAC1 is implicated in, each linked to the most relevant paper.", canonical:"/diseases/", content, active:"/diseases/", image:"vdac1-anim.svg" });
}

function companiesPage(){
  const C = companies.companies;
  const stages = [...new Set(C.map(c=>c.stage))];
  const moas = [...new Set(C.flatMap(c=>c.moa))].sort();
  const inds = [...new Set(C.flatMap(c=>c.indications))].sort();
  const btn = (grp,val,label)=>`<button class="fbtn" data-group="${grp}" data-val="${escAttr(val)}">${esc(label)}</button>`;
  const card = c=>`<article class="co-card${c.highlight?" co-highlight":""}" data-stage="${escAttr(c.stage)}" data-moa="${c.moa.map(slugify).join(" ")}" data-ind="${c.indications.map(slugify).join(" ")}">
    ${c.highlight?`<span class="co-flag">my company — see disclaimer</span>`:""}
    <div class="co-head"><h3><a href="${c.url}" target="_blank" rel="noopener">${esc(c.name)} ↗</a></h3><span class="co-stage">${esc(c.stage)}</span></div>
    ${c.rating?`<div class="co-rating">${"⭐".repeat(c.rating)}${c.ratingNote?` <span class="co-ratingnote">${esc(c.ratingNote)}</span>`:""}</div>`:""}
    <p>${esc(c.blurb)}</p>
    ${c.coi?`<p class="co-coi">⚠ ${esc(c.coi)}</p>`:""}
    <div class="co-tax"><span class="co-lbl">MoA</span>${c.moa.map(m=>`<span class="chip2">${esc(m)}</span>`).join("")}</div>
    <div class="co-tax"><span class="co-lbl">Focus</span>${c.indications.map(i=>`<span class="chip2 alt">${esc(i)}</span>`).join("")}</div>
  </article>`;
  const content = `<div class="hero"><div class="wrap"><div>
      <p class="eyebrow">the players · a watchlist</p>
      <h1>Companies to follow</h1>
      <p class="lead">${esc(companies.intro)}</p>
    </div><div class="hero-art"><img src="/assets/images/mito.svg" alt="Mitochondrion"></div></div></div>
    <main><div class="wrap">
      <div class="disclaimer">${esc(companies.disclaimer)}</div>
      <button class="filter-toggle" aria-label="Toggle filters">⚙ Filters</button>
      <div class="sidebar-wrap">
        <aside class="sidebar" id="side-filters"><div class="filters" id="cofilters">
          <div class="fgroup"><span class="flabel">stage</span><div class="fchips">${stages.map(s=>btn("stage",s,s)).join("")}</div></div>
          <div class="fgroup"><span class="flabel">mechanism</span><div class="fchips">${moas.map(m=>`<button class="fbtn" data-group="moa" data-val="${slugify(m)}">${esc(m)}</button>`).join("")}</div></div>
          <div class="fgroup"><span class="flabel">indication</span><div class="fchips">${inds.map(i=>`<button class="fbtn" data-group="ind" data-val="${slugify(i)}">${esc(i)}</button>`).join("")}</div></div>
          <div class="fgroup"><button class="fbtn clear" id="coclear">✕ clear</button> <span id="cocount" class="fcount"></span></div>
        </div></aside>
        <div class="content">
          <div class="co-grid" id="cogrid">${C.map(card).join("")}</div>
          <p id="coempty" class="section-sub" style="display:none;">Nothing matches — loosen a filter.</p>
        </div>
      </div>
    </div></main>
    <script>(function(){var grid=document.getElementById('cogrid');var cards=[].slice.call(grid.children);
      var state={stage:null,moa:null,ind:null};var multi={moa:1,ind:1};
      function apply(){var n=0;cards.forEach(function(c){var ok=true;
        for(var k in state){if(!state[k])continue;
          if(multi[k]){if((' '+c.dataset[k]+' ').indexOf(' '+state[k]+' ')<0)ok=false;}
          else{if(c.dataset[k]!==state[k])ok=false;}}
        c.style.display=ok?'':'none';if(ok)n++;});
        document.getElementById('cocount').textContent=n+' / '+cards.length;
        document.getElementById('coempty').style.display=n?'none':'';}
      document.querySelectorAll('#cofilters .fbtn[data-group]').forEach(function(b){b.addEventListener('click',function(){
        var g=b.dataset.group,v=b.dataset.val;
        if(state[g]===v){state[g]=null;b.classList.remove('on');}
        else{state[g]=v;document.querySelectorAll('#cofilters .fbtn[data-group="'+g+'"]').forEach(function(x){x.classList.toggle('on',x===b);});}
        apply();});});
      document.getElementById('coclear').addEventListener('click',function(){state={stage:null,moa:null,ind:null};
        document.querySelectorAll('#cofilters .fbtn.on').forEach(function(x){x.classList.remove('on');});apply();});
      apply();})();</script>`;
  const coLd = { "@context":"https://schema.org","@type":"ItemList","name":"Mitochondrial-medicine companies","numberOfItems":C.length,
    "itemListElement":C.map((c,ix)=>({"@type":"ListItem","position":ix+1,"item":{"@type":"Organization","name":c.name,"url":c.url}})) };
  return layout({ title:`Mito-medicine companies to follow — ${cfg.siteName}`, desc:"A filterable watchlist of mitochondrial-medicine companies — by stage, mechanism of action and indication.", canonical:"/companies/", content, active:"/companies/", bodyClass:"wide", image:"mito.svg", jsonld:coLd });
}

function trialsPage(){
  const T = trials.trials;
  const moas = [...new Set(T.flatMap(t=>t.moa))].sort();
  const inds = [...new Set(T.map(t=>t.indication))].sort();
  const statusClass = s=>/recruit/i.test(s)?"ok":/terminat|withdraw|suspend/i.test(s)?"bad":"neu";
  const card = t=>`<article class="tr-card" data-moa="${t.moa.map(slugify).join(" ")}" data-ind="${slugify(t.indication)}">
    <div class="tr-head"><a class="tr-nct" href="https://clinicaltrials.gov/study/${t.nct}" target="_blank" rel="noopener">${t.nct} ↗</a>
      <span class="tr-phase">${esc(t.phase)}</span><span class="tr-status ${statusClass(t.status)}">${esc(t.status)}</span></div>
    <h3><a href="https://clinicaltrials.gov/study/${t.nct}" target="_blank" rel="noopener">${esc(t.title)}</a></h3>
    <div class="tr-meta">${esc(t.drug)} · ${esc(t.sponsor)}</div>
    <div class="co-tax"><span class="co-lbl">MoA</span>${t.moa.map(m=>`<span class="chip2">${esc(m)}</span>`).join("")}<span class="chip2 alt">${esc(t.indication)}</span></div>
  </article>`;
  const content = `<div class="hero"><div class="wrap"><div>
      <p class="eyebrow">from the clinic · live links</p>
      <h1>Clinical trials</h1>
      <p class="lead">${esc(trials.intro)}</p>
    </div><div class="hero-art"><img src="/assets/images/vdac1-barrel.svg" alt="VDAC1"></div></div></div>
    <main><div class="wrap">
      <div class="disclaimer">${esc(trials.disclaimer)}</div>
      <button class="filter-toggle" aria-label="Toggle filters">⚙ Filters</button>
      <div class="sidebar-wrap">
        <aside class="sidebar" id="side-filters"><div class="filters" id="trfilters">
          <div class="fgroup"><span class="flabel">mechanism</span><div class="fchips">${moas.map(m=>`<button class="fbtn" data-group="moa" data-val="${slugify(m)}">${esc(m)}</button>`).join("")}</div></div>
          <div class="fgroup"><span class="flabel">indication</span><div class="fchips">${inds.map(i=>`<button class="fbtn" data-group="ind" data-val="${slugify(i)}">${esc(i)}</button>`).join("")}</div></div>
          <div class="fgroup"><button class="fbtn clear" id="trclear">✕ clear</button> <span id="trcount" class="fcount"></span></div>
        </div></aside>
        <div class="content">
          <div class="co-grid" id="trgrid">${T.map(card).join("")}</div>
          <p id="trempty" class="section-sub" style="display:none;">Nothing matches — loosen a filter.</p>
        </div>
      </div>
    </div></main>
    <script>(function(){var grid=document.getElementById('trgrid');var cards=[].slice.call(grid.children);
      var state={moa:null,ind:null};var multi={moa:1};
      function apply(){var n=0;cards.forEach(function(c){var ok=true;
        for(var k in state){if(!state[k])continue;
          if(multi[k]){if((' '+c.dataset[k]+' ').indexOf(' '+state[k]+' ')<0)ok=false;}
          else{if(c.dataset[k]!==state[k])ok=false;}}
        c.style.display=ok?'':'none';if(ok)n++;});
        document.getElementById('trcount').textContent=n+' / '+cards.length;
        document.getElementById('trempty').style.display=n?'none':'';}
      document.querySelectorAll('#trfilters .fbtn[data-group]').forEach(function(b){b.addEventListener('click',function(){
        var g=b.dataset.group,v=b.dataset.val;
        if(state[g]===v){state[g]=null;b.classList.remove('on');}
        else{state[g]=v;document.querySelectorAll('#trfilters .fbtn[data-group="'+g+'"]').forEach(function(x){x.classList.toggle('on',x===b);});}
        apply();});});
      document.getElementById('trclear').addEventListener('click',function(){state={moa:null,ind:null};
        document.querySelectorAll('#trfilters .fbtn.on').forEach(function(x){x.classList.remove('on');});apply();});
      apply();})();</script>`;
  const trLd = { "@context":"https://schema.org","@type":"ItemList","name":"Mitochondrial-medicine clinical trials","numberOfItems":T.length,
    "itemListElement":T.map((t,ix)=>({"@type":"ListItem","position":ix+1,"url":`https://clinicaltrials.gov/study/${t.nct}`,"name":t.title})) };
  return layout({ title:`Mitochondrial clinical trials — ${cfg.siteName}`, desc:"Mitochondrial-medicine clinical trials linked straight to ClinicalTrials.gov — filter by mechanism and indication.", canonical:"/trials/", content, active:"/trials/", bodyClass:"wide", image:"vdac1-barrel.svg", jsonld:trLd });
}

function mitoHealthPage(){
  const M = mitohealth;
  const evRank = { "Strong":5, "Moderate":4, "Preliminary":3, "Mixed":2, "Weak":1 };
  const cats = M.categories;
  const evLevels = M.ratingScale.evidence;
  const mechs = [...new Set(M.items.flatMap(i=>i.tags||[]))].sort();
  const cls = (kind,val)=> `${kind}-${slugify(val)}`;
  const dial = (label,val,kind)=> `<span class="dial ${cls(kind,val)}"><b>${label}</b>${esc(val)}</span>`;
  const card = i=>`<article class="mh-card dir-${i.direction}" data-cat="${escAttr(i.category)}" data-ev="${escAttr(i.evidence)}" data-dir="${i.direction}" data-mech="${(i.tags||[]).map(slugify).join(" ")}" data-name="${escAttr(i.name.toLowerCase())}" data-evrank="${evRank[i.evidence]||0}">
    <div class="mh-top"><span class="mh-cat">${esc(i.category)}</span>${i.direction==="harm"?`<span class="mh-harm">harms mito</span>`:i.direction==="mixed"?`<span class="mh-mixed">double-edged</span>`:""}</div>
    <h3>${esc(i.name)}</h3>
    <div class="mh-mech">${esc(i.mech)}</div>
    <div class="dials">${dial("Evidence",i.evidence,"ev")}${dial("Benefit",i.benefit,"ben")}${dial("Safety",i.safety,"saf")}</div>
    <p>${esc(i.summary)}</p>
    <div class="mh-links">${(i.links||[]).map(l=>`<a href="${l.url}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join("")}</div>
  </article>`;
  const chip = (grp,val)=>`<button class="fbtn" data-group="${grp}" data-val="${escAttr(val)}">${esc(val)}</button>`;
  const content = `<div class="hero mh-hero"><div class="wrap"><div>
      <p class="eyebrow">★ the heart of the site · evidence-graded</p>
      <h1>Mitochondrial health ratings</h1>
      <p class="lead">${esc(M.intro)}</p>
      <p class="mh-herostat"><b>${M.items.length}</b> interventions · <b>${M.categories.length}</b> categories · rated for evidence, benefit &amp; safety</p>
    </div><div class="hero-art"><img src="/assets/images/ratings.svg" alt="Sample rating bars: exercise and creatine rated strong, sauna moderate, cold preliminary, smoking harmful"></div></div></div>
    <main><div class="wrap">
      <details class="mh-method"><summary>How to read these ratings (and the honest caveats)</summary>
        <p>${esc(M.methodology)}</p>
        <div class="mh-legend">
          <div><span class="lgd">Evidence</span> <span class="dial ev-strong"><b>=</b>Strong</span><span class="dial ev-moderate"><b>=</b>Moderate</span><span class="dial ev-preliminary"><b>=</b>Preliminary</span><span class="dial ev-weak"><b>=</b>Weak</span><span class="dial ev-mixed"><b>=</b>Mixed</span></div>
          <div><span class="lgd">Benefit</span> <span class="dial ben-high"><b>=</b>High</span><span class="dial ben-moderate"><b>=</b>Moderate</span><span class="dial ben-low"><b>=</b>Low</span><span class="dial ben-harmful"><b>=</b>Harmful</span></div>
          <div><span class="lgd">Safety</span> <span class="dial saf-high"><b>=</b>High</span><span class="dial saf-moderate"><b>=</b>Moderate</span><span class="dial saf-caution"><b>=</b>Caution</span><span class="dial saf-low"><b>=</b>Low</span></div>
        </div>
      </details>
      <button class="filter-toggle" aria-label="Toggle filters">⚙ Filters</button>
      <div class="sidebar-wrap">
        <aside class="sidebar" id="side-filters"><div class="filters mh-filters" id="mhf">
        <div class="fgroup fgrow"><input type="search" id="mhsearch" placeholder="search interventions… (e.g. sauna, NAD, omega-3)"></div>
        <div class="fgroup"><span class="flabel">category</span>${cats.map(c=>chip("cat",c)).join("")}</div>
        <div class="fgroup"><span class="flabel">evidence</span>${evLevels.map(e=>chip("ev",e)).join("")}</div>
        <div class="fgroup"><span class="flabel">direction</span>${chip("dir","help")}${chip("dir","mixed")}${chip("dir","harm")}</div>
        <div class="fgroup"><span class="flabel">mechanism</span><select id="mhmech"><option value="">any</option>${mechs.map(m=>`<option value="${slugify(m)}">${esc(m)}</option>`).join("")}</select></div>
        <div class="fgroup"><span class="flabel">sort</span><button class="fbtn sortbtn on" data-sort="ev">strongest evidence</button><button class="fbtn sortbtn" data-sort="az">A–Z</button></div>
        <div class="fgroup"><button class="fbtn clear" id="mhclear">✕ clear</button><span id="mhcount" class="fcount"></span></div>
      </div></aside>
        <div class="content">
          <div class="mh-grid" id="mhgrid">${M.items.map(card).join("")}</div>
          <p id="mhempty" class="section-sub" style="display:none;">Nothing matches — loosen a filter.</p>
        </div>
      </div>
      <p class="mh-foot">This is a synthesis for orientation, not medical advice. Evidence for many mitochondrial-specific effects is indirect; ratings reflect the best available human data plus mechanism. Found a strong study I'm missing? <a href="mailto:${cfg.email}">tell me</a>.</p>
    </div></main>
    <script>(function(){var grid=document.getElementById('mhgrid');var cards=[].slice.call(grid.children);
      var st={cat:null,ev:null,dir:null,mech:'',q:'',sort:'ev'};
      function apply(){var n=0;cards.forEach(function(c){var ok=true;
        if(st.cat&&c.dataset.cat!==st.cat)ok=false;
        if(st.ev&&c.dataset.ev!==st.ev)ok=false;
        if(st.dir&&c.dataset.dir!==st.dir)ok=false;
        if(st.mech&&(' '+c.dataset.mech+' ').indexOf(' '+st.mech+' ')<0)ok=false;
        if(st.q&&c.dataset.name.indexOf(st.q)<0)ok=false;
        c.style.display=ok?'':'none';if(ok)n++;});
        document.getElementById('mhcount').textContent=n+' / '+cards.length;
        document.getElementById('mhempty').style.display=n?'none':'';
        var vis=cards.filter(function(c){return c.style.display!=='none';});
        vis.sort(function(a,b){return st.sort==='az'?a.dataset.name.localeCompare(b.dataset.name):(b.dataset.evrank-a.dataset.evrank)||a.dataset.name.localeCompare(b.dataset.name);});
        vis.forEach(function(c){grid.appendChild(c);});}
      document.querySelectorAll('#mhf .fbtn[data-group]').forEach(function(b){b.addEventListener('click',function(){
        var g=b.dataset.group,v=b.dataset.val;
        if(st[g]===v){st[g]=null;b.classList.remove('on');}
        else{st[g]=v;document.querySelectorAll('#mhf .fbtn[data-group="'+g+'"]').forEach(function(x){x.classList.toggle('on',x===b);});}
        apply();});});
      document.querySelectorAll('#mhf .sortbtn').forEach(function(b){b.addEventListener('click',function(){st.sort=b.dataset.sort;document.querySelectorAll('#mhf .sortbtn').forEach(function(x){x.classList.toggle('on',x===b);});apply();});});
      document.getElementById('mhmech').addEventListener('change',function(e){st.mech=e.target.value;apply();});
      document.getElementById('mhsearch').addEventListener('input',function(e){st.q=e.target.value.toLowerCase().trim();apply();});
      document.getElementById('mhclear').addEventListener('click',function(){st={cat:null,ev:null,dir:null,mech:'',q:'',sort:'ev'};
        document.querySelectorAll('#mhf .fbtn.on').forEach(function(x){if(!x.classList.contains('sortbtn'))x.classList.remove('on');});
        document.querySelectorAll('#mhf .sortbtn').forEach(function(x){x.classList.toggle('on',x.dataset.sort==='ev');});
        document.getElementById('mhmech').value='';document.getElementById('mhsearch').value='';apply();});
      apply();})();</script>`;
  const mhLd = [
    { "@context":"https://schema.org","@type":"Dataset","name":"Mitochondrial Health Ratings","url":`${cfg.baseUrl}/mitohealth/`,
      "description":M.intro.slice(0,320),"keywords":M.categories.join(", "),"inLanguage":"en",
      "creator":{"@type":"Person","name":cfg.author,"url":`${cfg.baseUrl}/about/`},
      "variableMeasured":["evidence quality","benefit to mitochondria","safety"],"isAccessibleForFree":true },
    { "@context":"https://schema.org","@type":"ItemList","name":"Mitochondrial health interventions","numberOfItems":M.items.length,
      "itemListElement":M.items.map((i,ix)=>({"@type":"ListItem","position":ix+1,"name":i.name})) }
  ];
  return layout({ title:`Mitochondrial Health Ratings — ${M.items.length} interventions, graded — ${cfg.siteName}`, desc:"An evidence-graded database of foods, drugs, supplements and lifestyle habits (sleep, exercise, fasting, sauna and more) that affect mitochondrial health — each rated for evidence, benefit and safety.", canonical:"/mitohealth/", content, active:"/mitohealth/", bodyClass:"wide", image:"ratings.svg", jsonld:mhLd });
}

/* ---------------- feeds ---------------- */
function sitemap(){
  const latest = entries.reduce((a,e)=>e.date>a?e.date:a, "2024-01-01");
  const rows = [
    { loc:"/", lastmod:latest, pri:"1.0", cf:"daily" },
    { loc:"/news/", lastmod:latest, pri:"0.9", cf:"daily" },
    { loc:"/posts/", lastmod:latest, pri:"0.7", cf:"weekly" },
    { loc:"/diseases/", lastmod:latest, pri:"0.8", cf:"monthly" },
    { loc:"/gene/", lastmod:genetics.fetched, pri:"0.8", cf:"monthly" },
    { loc:"/mitohealth/", lastmod:latest, pri:"0.8", cf:"weekly" },
    { loc:"/companies/", lastmod:latest, pri:"0.8", cf:"weekly" },
    { loc:"/trials/", lastmod:latest, pri:"0.8", cf:"weekly" },
    { loc:"/resources/", lastmod:latest, pri:"0.7", cf:"weekly" },
    { loc:"/about/", lastmod:latest, pri:"0.5", cf:"yearly" },
    { loc:"/tags/", lastmod:latest, pri:"0.5", cf:"weekly" },
    ...entries.map(e=>({ loc:e.url, lastmod:e.date, pri:"0.8", cf:"monthly" })),
    ...[...tagMap.values()].map(t=>({ loc:`/tags/${t.slug}/`, lastmod:latest, pri:"0.4", cf:"weekly" }))
  ];
  const body = rows.map(r=>`  <url><loc>${cfg.baseUrl}${r.loc}</loc><lastmod>${r.lastmod}</lastmod><changefreq>${r.cf}</changefreq><priority>${r.pri}</priority></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
function notFoundPage(){
  const content = `<main><div class="wrap" style="padding:60px 22px;text-align:center;">
    <p class="eyebrow" style="color:var(--coral);">error 404</p>
    <h1 style="font-family:var(--disp);font-size:2.4rem;letter-spacing:-1px;">This page leaked out of the pore.</h1>
    <p class="section-sub">That URL doesn't exist (or moved). Let's get you back to something real.</p>
    <p><a class="readmore" href="/">← home</a> &nbsp; <a class="readmore" href="/news/">news</a> &nbsp; <a class="readmore" href="/diseases/">body map</a> &nbsp; <a class="readmore" href="/gene/">gene</a></p>
    <div style="max-width:280px;margin:30px auto 0;"><img src="/assets/images/vdac1-anim.svg" alt="" style="width:100%;"></div>
  </div></main>`;
  return layout({ title:`Not found — ${cfg.siteName}`, desc:"Page not found.", canonical:"/404.html", content, active:"/" });
}
function rss(){
  const items = entries.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(e=>`  <item>
    <title>${esc(e.title)}</title>
    <link>${cfg.baseUrl}${e.url}</link>
    <guid>${cfg.baseUrl}${e.url}</guid>
    <pubDate>${rfc822(e.date)}</pubDate>
    <description>${esc(e.summary)}</description>
    ${e.tags.map(t=>`<category>${esc(t)}</category>`).join("")}
  </item>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${esc(cfg.siteName)}</title>
  <link>${cfg.baseUrl}/</link>
  <description>${esc(cfg.description)}</description>
  <language>en</language>
${items}
</channel></rss>\n`;
}
const robots = `User-agent: *\nAllow: /\nSitemap: ${cfg.baseUrl}/sitemap.xml\n`;

/* ---------------- write ---------------- */
function writePage(url, html){
  const dir = path.join(OUT, url.replace(/^\//,""));
  fs.mkdirSync(dir, { recursive:true });
  fs.writeFileSync(path.join(dir,"index.html"), html);
}
function writeFile(name, content){ fs.writeFileSync(path.join(OUT,name), content); }

// Clean dist. On Windows a preview/AV handle can briefly lock it — degrade
// gracefully (empty what we can, then overwrite) instead of hard-failing.
try {
  fs.rmSync(OUT, { recursive:true, force:true, maxRetries:8, retryDelay:150 });
} catch {
  try { for(const f of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT,f), { recursive:true, force:true, maxRetries:4, retryDelay:150 }); }
  catch { console.warn("! could not fully clean dist/ (locked?) — overwriting in place"); }
}
fs.mkdirSync(OUT, { recursive:true });
fs.cpSync(ASSETS, path.join(OUT,"assets"), { recursive:true });

writeFile("index.html", homePage());          // "/" — writeFile at root not writePage
writePage("/news/", newsListing());
writePage("/posts/", postsListing());
writePage("/diseases/", diseasesPage());
writePage("/gene/", genePage());
writePage("/mitohealth/", mitoHealthPage());
writePage("/companies/", companiesPage());
writePage("/trials/", trialsPage());
writePage("/resources/", resourcesPage());
writePage("/about/", aboutPage());
writePage("/tags/", tagIndexPage());
for(const e of entries) writePage(e.url, articlePage(e));
for(const t of tagMap.values()) writePage(`/tags/${t.slug}/`, tagPage(t));
writeFile("sitemap.xml", sitemap());
writeFile("feed.xml", rss());
writeFile("robots.txt", robots);
writeFile(".nojekyll", "");   // tell GitHub Pages not to run Jekyll
writeFile("404.html", notFoundPage());

const pages = 11 + entries.length + tagMap.size;
console.log(`✓ built ${pages} pages → dist/`);
console.log(`  news: ${news.length} · posts: ${posts.length} · tags: ${tagMap.size}`);
