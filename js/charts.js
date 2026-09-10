// ============================================================================
// Petits graphiques SVG "faits main" (aucune dépendance externe)
// ============================================================================

const PALETTE = ["#2678c4", "#2e9e4f", "#f5c518", "#d1263a", "#8a4fc7", "#e0752f", "#1aa6a0", "#c74f8a"];

function couleur(i) {
  return PALETTE[i % PALETTE.length];
}

export function svgEl(tag, attrs = {}, children = []) {
  const ns = "http://www.w3.org/2000/svg";
  const el = document.createElementNS(ns, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  children.forEach((c) => el.appendChild(c));
  return el;
}

/**
 * Diagramme en barres verticales simple. data = [{label, value, key?}]
 * onClick(d, i) : rend les barres cliquables. selectedKey : clé (ou label)
 * de la barre actuellement sélectionnée, mise en évidence (les autres sont
 * atténuées) — pour les tableaux de bord avec filtre croisé.
 */
export function barChart(data, { width = 320, height = 180, unit = "", onClick = null, selectedKey = null, onReset = null } = {}) {
  const padLeft = 34;
  const padBottom = 28;
  const padTop = 12;
  const w = width - padLeft - 8;
  const h = height - padTop - padBottom;
  const max = Math.max(1, ...data.map((d) => d.value));
  const barW = data.length ? w / data.length : w;

  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, class: "chart" });

  // fond cliquable (derrière les barres) : cliquer une zone vide du graphe
  // réinitialise le filtre — les barres, dessinées par-dessus, interceptent
  // leurs propres clics avant d'atteindre ce fond.
  if (onReset) {
    const fond = svgEl("rect", { x: 0, y: 0, width, height, fill: "transparent" });
    fond.style.cursor = "pointer";
    const titre = svgEl("title");
    titre.textContent = "Réinitialiser le filtre";
    fond.appendChild(titre);
    fond.addEventListener("click", onReset);
    svg.appendChild(fond);
  }

  // lignes de repère horizontales
  for (let i = 0; i <= 2; i++) {
    const y = padTop + (h * i) / 2;
    svg.appendChild(
      svgEl("line", {
        x1: padLeft,
        x2: width - 8,
        y1: y,
        y2: y,
        class: "chart-gridline",
      })
    );
  }

  const aSelection = selectedKey != null;

  data.forEach((d, i) => {
    const cle = d.key ?? d.label;
    const estSelectionne = aSelection && cle === selectedKey;
    const barH = max ? (d.value / max) * h : 0;
    const x = padLeft + i * barW + barW * 0.15;
    const y = padTop + h - barH;
    const groupe = svgEl("g", { class: onClick ? "chart-bar-clickable" : "" });
    groupe.style.opacity = aSelection && !estSelectionne ? "0.35" : "1";
    if (onClick) {
      groupe.style.cursor = "pointer";
      groupe.addEventListener("click", () => onClick(d, i));
    }
    // rectangle invisible plus large pour une zone cliquable confortable
    groupe.appendChild(svgEl("rect", { x, y: padTop, width: barW * 0.7, height: h, fill: "transparent" }));
    groupe.appendChild(
      svgEl("rect", {
        x,
        y,
        width: barW * 0.7,
        height: Math.max(barH, 1),
        rx: 4,
        fill: couleur(i),
        stroke: estSelectionne ? "var(--text)" : "none",
        "stroke-width": estSelectionne ? 2 : 0,
      })
    );
    groupe.appendChild(
      svgEl("text", { x: x + barW * 0.35, y: padTop + h + 16, class: "chart-label", "text-anchor": "middle" })
    ).textContent = d.label;
    if (d.value > 0) {
      const t = svgEl("text", {
        x: x + barW * 0.35,
        y: y - 4,
        class: "chart-value",
        "text-anchor": "middle",
      });
      t.textContent = `${d.value}${unit}`;
      groupe.appendChild(t);
    }
    svg.appendChild(groupe);
  });

  return svg;
}

/**
 * Diagramme en anneau (donut). data = [{label, value, key?}]. Voir barChart
 * pour onClick/selectedKey. onReset (optionnel) : appelé quand on clique le
 * centre du donut (zone vide) — pratique pour réinitialiser le filtre.
 */
export function donutChart(data, { size = 160, thickness = 26, onClick = null, selectedKey = null, onReset = null } = {}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = size / 2 - thickness / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const svg = svgEl("svg", { viewBox: `0 0 ${size} ${size}`, class: "chart" });

  function ajouterCentreCliquable() {
    if (!onReset) return;
    const centre = svgEl("circle", { cx, cy, r: Math.max(r - thickness / 2 - 2, 4), fill: "transparent" });
    centre.style.cursor = "pointer";
    centre.addEventListener("click", onReset);
    const titre = svgEl("title");
    titre.textContent = "Réinitialiser le filtre";
    centre.appendChild(titre);
    svg.appendChild(centre);
    const t = svg.querySelector(".chart-donut-total");
    if (t) t.style.pointerEvents = "none"; // laisse le clic passer au cercle
  }

  if (total === 0) {
    svg.appendChild(svgEl("circle", { cx, cy, r, fill: "none", stroke: "var(--border)", "stroke-width": thickness }));
    const label = svgEl("text", { x: cx, y: cy, "text-anchor": "middle", class: "chart-donut-total" });
    label.textContent = "0";
    svg.appendChild(label);
    return svg;
  }

  const aSelection = selectedKey != null;
  let angleStart = -Math.PI / 2;
  data.forEach((d, i) => {
    const cle = d.key ?? d.label;
    const estSelectionne = aSelection && cle === selectedKey;
    const frac = d.value / total;
    const angleEnd = angleStart + frac * Math.PI * 2;
    const largeArc = frac > 0.5 ? 1 : 0;
    const x1 = cx + r * Math.cos(angleStart);
    const y1 = cy + r * Math.sin(angleStart);
    const x2 = cx + r * Math.cos(angleEnd);
    const y2 = cy + r * Math.sin(angleEnd);
    const path = svgEl("path", {
      d: `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
      fill: "none",
      stroke: couleur(i),
      "stroke-width": estSelectionne ? thickness + 4 : thickness,
      "stroke-linecap": data.length > 1 ? "butt" : "round",
      opacity: aSelection && !estSelectionne ? "0.35" : "1",
    });
    if (onClick) {
      path.style.cursor = "pointer";
      path.addEventListener("click", () => onClick(d, i));
    }
    svg.appendChild(path);

    // Nom directement dans la part du donut (si elle est assez grande pour
    // l'accueillir) — évite d'avoir à faire l'aller-retour avec la légende.
    if (frac > 0.05) {
      const midAngle = (angleStart + angleEnd) / 2;
      const texte = svgEl("text", {
        x: cx + r * Math.cos(midAngle),
        y: cy + r * Math.sin(midAngle),
        "text-anchor": "middle",
        "dominant-baseline": "central",
        class: "chart-donut-label",
      });
      texte.style.opacity = aSelection && !estSelectionne ? "0.35" : "1";
      texte.textContent = d.label;
      svg.appendChild(texte);
    }
    angleStart = angleEnd;
  });

  const label = svgEl("text", { x: cx, y: cy, "text-anchor": "middle", class: "chart-donut-total" });
  label.textContent = total;
  svg.appendChild(label);
  ajouterCentreCliquable();
  return svg;
}

/** Petite légende associée à un graphique. items = [{label, value, key?}]. onClick/selectedKey : voir barChart. */
export function legende(items, { onClick = null, selectedKey = null } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "chart-legend";
  const aSelection = selectedKey != null;
  items.forEach((it, i) => {
    const cle = it.key ?? it.label;
    const estSelectionne = aSelection && cle === selectedKey;
    const row = document.createElement("div");
    row.className = "chart-legend-item" + (onClick ? " chart-legend-item-clickable" : "") + (estSelectionne ? " chart-legend-item-active" : "");
    row.style.opacity = aSelection && !estSelectionne ? "0.5" : "1";
    row.innerHTML = `<span class="chart-legend-dot" style="background:${couleur(i)}"></span>${it.label} <b>${it.value}</b>`;
    if (onClick) row.addEventListener("click", () => onClick(it, i));
    wrap.appendChild(row);
  });
  return wrap;
}

/** Barre de progression horizontale simple. */
export function barreProgression(pourcentage, { color = "var(--accent)" } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "progress-bar";
  const fill = document.createElement("div");
  fill.className = "progress-bar-fill";
  fill.style.width = `${Math.max(0, Math.min(100, pourcentage))}%`;
  fill.style.background = color;
  wrap.appendChild(fill);
  return wrap;
}
