// treemap.js — self-contained treemap only

(function(){

  document.addEventListener('DOMContentLoaded', () => {

    // ================== LOAD DATA ==================
    Promise.all([
      d3.json("treemap_jsons/treemap_data.json"),
      d3.json("treemap_jsons/object_details.json")
    ]).then(([treemapdata, detailsdata]) => {

      const rawdata = treemapdata;  // hierarchical data for treemap (families → types → counts)
      const details = detailsdata;  // flat rows for details panel (fields include EDANurl, title, unitCode, etc.)

      // ----------------- helpers -----------------
      // normalizing names (lowercasing, collapsing whitespace)
      const norm = s => (s || "").toLowerCase().replace(/[\s\u00A0]+/g, " ").trim();

      // defining the special “other actions” bucket logic used after regrouping
      const other_combined_key = "other actions";
      const other_color = "#6f6f6f";
      const is_other_combined = node => norm(node?.data?.name) === other_combined_key;

      // listing families that will be grouped under “other actions” (editorial choice)
      const outside_actions = ["work & build","measure & navigate","play","worship"];

      // mapping museum unit codes to display names for the details panel
      const display_unitcodes = {
        "AAA":"Archives of American Art","ACM":"Anacostia Community Museum",
        "CFCHFOLKLIFE":"Ralph Rinzler Folklife Archives and Collections",
        "CHNDM":"Cooper Hewitt, Smithsonian Design Museum","EEPA":"Eliot Elisofon Photographic Archives",
        "FBR":"Smithsonian Field Book Project","FSG":"Freer Gallery of Art and Arthur M. Sackler Gallery",
        "HAC":"Smithsonian Gardens","HMSG":"Hirshhorn Museum and Sculpture Garden","HSFA":"Human Studies Film Archives",
        "NAA":"National Anthropological Archives","NASM":"National Air and Space Museum",
        "NMAAHC":"National Museum of African American History and Culture","NMAH":"National Museum of American History",
        "NMAI":"National Museum of the American Indian","NMAfA":"National Museum of African Art",
        "NMNH":"National Museum of Natural History","NMNHANTHRO":"NMNH - Anthropology Dept.",
        "NMNHBIRDS":"NMNH - Vertebrate Zoology - Birds Division","NMNHBOTANY":"NMNH - Botany Dept.",
        "NMNHEDUCATION":"NMNH - Education & Outreach","NMNHENTO":"NMNH - Entomology Dept.",
        "NMNHFISHES":"NMNH - Vertebrate Zoology - Fishes Division","NMNHHERPS":"NMNH - Vertebrate Zoology - Herpetology Division",
        "NMNHINV":"NMNH - Invertebrate Zoology Dept.","NMNHMAMMALS":"NMNH - Vertebrate Zoology - Mammals Division",
        "NMNHMINSCI":"NMNH - Mineral Sciences Dept.","NMNHPALEO":"NMNH - Paleobiology Dept.",
        "NPG":"National Portrait Gallery","NPM":"National Postal Museum",
        "NZP":"Smithsonian's National Zoo & Conservation Biology Institute","SAAM":"Smithsonian American Art Museum",
        "SIA":"Smithsonian Institution Archives","SIL":"Smithsonian Libraries"
      };
      const display_museum_names = unit => display_unitcodes[unit] || "";

      // normalizing family display strings for the ui (title-casing, more human-friendly names)
      const display_family = {
        "eat, cook & drink":"Eating, Cooking & Drinking",
        "read, write & record":"Reading, Writing & Recording",
        "dress & accessorize":"Dressing & Accessorizing",
        "heal & care":"Healing & Caring",
        "work & build":"Working & Building",
        "commemorate & symbolize":"Commemorating & Symbolizing",
        "decorate & furnish":"Decorating & Furnishing",
        "fight":"Fighting & Hunting",
        "ignite & manage fire":"Lighting & Firekeeping",
        "measure & navigate":"Measuring & Navigating",
        "perform music":"Performing Music",
        "play":"Playing",
        "smoke":"Smoking",
        "textile making":"Making Textiles",
        "worship":"Worshipping",
        "other":"Other",
        "other actions":"Other Actions"
      };
      const display_family_name = name => display_family[norm(name)] || name;

      // ----------------- D3 + DOM refs -----------------
      // selecting svg and appending a group for the treemap cells
      const svg = d3.select("#treemap-svg.treemap");
      const width = 1000, height = 520;       // matching css aspect-ratio/base size
      const g = svg.append("g");

      // grabbing ui elements for zoom state, tooltip, and details panel
      const back_button   = d3.select(".back-to-all");
      const zoom_card     = d3.select(".zoom-card");
      const tooltip       = d3.select(".treemap-tooltip");
      const detailsPanel  = d3.select("#details");
      const detailsTitle  = d3.select("#details-title");
      const detailsList   = d3.select("#details-list");
      const detailsSubtitle = d3.select(".details-subtitle");

      // initializing zoom chip and back button visibility
      zoom_card.classed("is-ghost", false).select(".zoom-title").text("All Actions");
      back_button.classed("is-ghost", true);

      // ----------------- editorial filter & regroup -----------------
      // dropping families that are deemed out-of-scope for this particular view
      const drop_actions = ["portray, display & decorate","pay & exchange","commemorate & symbolize","other"];
      const filtered_data = {
        name: rawdata.name,
        children: (rawdata?.children || []).filter(f => !drop_actions.includes(norm(f.name)))
      };

      // regrouping some families into a single "Other Actions" bucket to reduce clutter
      function regroup_by_category(data, cats){
        const families = Array.isArray(data?.children) ? data.children : [];
        const main = [], grouped = [];
        for (const fam of families) (cats.includes(norm(fam.name)) ? grouped : main).push(fam);
        const children = grouped.length ? [...main, { name: "Other Actions", children: grouped }] : main;
        return { name: data.name, children };
      }

      const viz_data = regroup_by_category(filtered_data, outside_actions);

      // moving “Other Actions” to the end for a more natural reading order
      const oi = viz_data.children.findIndex(c => c.name === "Other Actions");
      if (oi > -1) viz_data.children.push(...viz_data.children.splice(oi, 1));

      // ----------------- Smithsonian thumbs cache -----------------
      // caching primary thumbnails from the open access api to avoid repeated network fetches
      const apiKey = "wbx4TjCnMRmZCBPVwinDqyouiwiV2bWLfzaN53AV";
      const objectBaseURL = "https://api.si.edu/openaccess/api/v1.0/content/";
      const imgCache = new Map();
      const getPrimaryImageUrl = r => r?.content?.descriptiveNonRepeating?.online_media?.media?.[0]?.content || null;

      async function fetchFirstImageById(id){
        if (imgCache.has(id)) return imgCache.get(id);
        try{
          const res = await fetch(`${objectBaseURL}${id}?api_key=${apiKey}`);
          if(!res.ok){ imgCache.set(id,null); return null; }
          const data = await res.json();
          const url = getPrimaryImageUrl(data.response) || null;
          imgCache.set(id, url);
          return url;
        }catch(e){ imgCache.set(id,null); return null; }
      }

      // ----------------- color -----------------
      // mapping families to palette; falling back to neutral gray when unmapped
      const familyColors = {
        "eat, cook & drink":"#868D7A","heal & care":"#9C9C80","ignite & manage fire":"#8D927C",
        "textile making":"#8F8C81","dress & accessorize":"#8F8C81","decorate & furnish":"#7A7875",
        "read, write & record":"#8B928A","perform music":"#8A726B","smoke":"#8A726B",
        "fight":"#8F837A","other actions":"#A5A5A2"
      };
      const color = fam => familyColors[norm(fam)] || "#999";

      // ----------------- hierarchy + layout -----------------
      // building a d3 hierarchy, summing values for leaf area, and sorting descending
      const root = d3.hierarchy(viz_data)
        .sum(d => d.value || 0)
        .sort((a,b) => (b.value || 0) - (a.value || 0));

      // laying out the treemap in pixel space once (root coordinates x0..x1, y0..y1)
      d3.treemap().size([width,height]).paddingInner(1)(root);

      // creating “camera” scales that will be re-domained during zooms
      const sx = d3.scaleLinear().domain([root.x0, root.x1]).range([0, width]);
      const sy = d3.scaleLinear().domain([root.y0, root.y1]).range([0, height]);

      let current = root; // tracking current zoom focus (root or a family node)

      // ----------------- family “chips” at root -----------------
      // drawing lightweight labels at the root view (hidden when zoomed)
      const g_labels = svg.append("g").attr("class","family-labels");
      function draw_family_labels_all(){
        const families = root.children || [];
        g_labels.selectAll("g.family-chip")
          .data(families, d => d.data.name)
          .join(enter => {
            const g = enter.append("g").attr("class","family-chip").attr("pointer-events","none");
            g.append("foreignObject").attr("class","chip-fo")
              .append("xhtml:div").attr("class","family-labels-html");
            return g;
          });

        // sizing chips to fit each family’s rectangle with small insets
        g_labels.selectAll("foreignObject.chip-fo")
          .attr("x", d => sx(d.x0) + 8)
          .attr("y", d => sy(d.y0) + 10)
          .attr("width",  d => sx(d.x1) - sx(d.x0) - 16)
          .attr("height", d => sy(d.y1) - sy(d.y0) - 16);

        // writing human-friendly family names
        g_labels.selectAll("div.family-labels-html")
          .text(d => display_family_name(d.data.name));

        // enabling click on chips to zoom into a family
        g_labels.selectAll("g.family-chip")
          .on("click", (_, d) => zoom_to(d));
      }
      draw_family_labels_all();

      // ----------------- details panel -----------------
      // populating the side/list panel with rows for a specific object type within a family
      async function showDetails(objectTypeName, familyKey){
        const all = details[objectTypeName] || details[norm(objectTypeName)] || [];
        const rows = all.filter(r => norm(r.action_family) === norm(familyKey));

        // updating header, subtitle count, and making panel visible
        detailsTitle.text(objectTypeName);
        detailsSubtitle.text(`${rows.length} object${rows.length === 1 ? "" : "s"}`);
        detailsPanel.attr("hidden", null);
        const nPanel = detailsPanel.node(); if (nPanel) nPanel.scrollTop = 0;

        // (re)binding rows to <li> entries
        const items = detailsList.selectAll("li").data(rows, d => d.EDANurl);
        items.exit().remove();
        items.enter().append("li")
          .merge(items)
          .attr("class","details-item")
          .html(r => `
            <a href="${r.collectionsURL}" target="_blank" rel="noopener" class="details-placeholder">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
              </svg>
            </a>
            <div class="details-text">
              <strong>${r.title || "(Untitled)"}</strong>
              ${(() => {
                const unit = (r.unitCode || "").trim();
                const full = display_museum_names(unit);
                return unit ? ` — <em>${full ? `${full} <span class="unitcode">(${unit})</span>` : unit}</em>` : "";
              })()}
            </div>
          `);

        // fetching up to 50 thumbnails in sequence and replacing placeholders when successful
        const cap = 50;
        const first = rows.slice(0, cap);
        for (let i=0; i<first.length; i++){
          const row = first[i];
          const imgUrl = await fetchFirstImageById(row.EDANurl);
          if (!imgUrl) continue;
          const liSel = detailsList.selectAll("li").filter(d => d === row);
          if (!liSel.empty()){
            liSel.select('.details-placeholder').remove();
            liSel.insert("a", ":first-child")
              .attr("href", row.collectionsURL).attr("target","_blank").attr("rel","noopener")
              .append("img").attr("class","details-thumb").attr("src", imgUrl).style("opacity, 1");
            liSel.classed("has-thumb", true);
          }
        }

        // reordering list items to prioritize those with images (visual polish)
        const ul = detailsList.node();
        if (ul){
          const liArray = Array.from(ul.children);
          liArray.sort((a,b) => (b.classList.contains('has-thumb')?1:0) - (a.classList.contains('has-thumb')?1:0));
          liArray.forEach(li => ul.appendChild(li));
        }
      }

      // hiding and clearing the details panel
      function hideDetails(){
        detailsPanel.attr("hidden", true);
        const n = detailsPanel.node(); if (n) n.scrollTop = 0;
        detailsList.selectAll("li").remove();
        detailsSubtitle.text("");
      }
      d3.select(".details-close").on("click", hideDetails);

      // ----------------- draw + interactions -----------------
      // drawing cells for the current focus node; root uses leaves, family focus may use leaves or children
      function draw(node){
        // defining which nodes to display at this zoom level
        const nodes = (node === root)
          ? root.leaves()
          : (is_other_combined(node) ? (node.children || []) : (node.leaves() || []));

        // binding nodes to <g.cell>; creating rect + foreignObject for text on enter
        const cells = g.selectAll("g.cell")
          .data(nodes, d => d.ancestors().map(a => a.data.name).join("/"))
          .join(enter => {
            const cell = enter.append("g").attr("class","cell");
            cell.append("rect").attr("class","tile-rect");
            cell.append("foreignObject").attr("class","leaf-fo").style("pointer-events","none")
              .append("xhtml:div").attr("class","leaf-html");
            return cell;
          });

        // helper for tooltip positioning with viewport-aware flipping
        function showTooltip(ev, html){
          const pad = 12;
          tooltip.style("display","block").html(html);
          const r = tooltip.node().getBoundingClientRect();
          const W = innerWidth, H = innerHeight;
          let left = ev.clientX + pad, top = ev.clientY + pad;
          if (left + r.width + 2 > W) left = ev.clientX - r.width - pad;
          if (top  + r.height + 2 > H) top  = ev.clientY - r.height - pad;
          left = Math.max(4, Math.min(W - r.width - 4, left));
          top  = Math.max(4, Math.min(H - r.height - 4, top));
          tooltip.style("left", left + "px").style("top", top + "px");
        }
        const hideTooltip = () => tooltip.style("display","none");

        // sizing/filling rectangles, wiring tooltip content and click behavior by zoom state
        cells.select("rect")
          .attr("x", d => sx(d.x0)).attr("y", d => sy(d.y0))
          .attr("width", d => Math.max(0, sx(d.x1)-sx(d.x0)))
          .attr("height",d => Math.max(0, sy(d.y1)-sy(d.y0)))
          .attr("fill", d => {
            // applying special gray for the “other actions” aggregate and its descendants
            if (is_other_combined(node)) return other_color;
            const inOther = d.ancestors().slice(1).some(a => norm(a.data?.name) === other_combined_key);
            if (inOther) return other_color;
            // otherwise coloring by the parent family’s category
            return color(norm(d.parent?.data?.name || ""));
          })
          .on("mousemove", (ev,d) => {
            // building context-aware tooltip text
            if (node === root){
              const oc = d.ancestors().find(a => norm(a.data?.name) === other_combined_key);
              const fam_raw = oc ? oc.data.name : (d.parent?.data?.name ?? "—");
              const fam_name = display_family_name(fam_raw);
              const fam_total = oc ? (oc.value ?? 0) : (d.parent?.value ?? d.value ?? 0);
              showTooltip(ev, `<div class="tip-text"><strong>${fam_name}</strong><br><br>Total objects: ${fam_total}</div>`);
            } else if (is_other_combined(node)){
              showTooltip(ev, `<div class="tip-text"><strong>${display_family_name(d.data.name)}</strong><br>Total: ${d.value || 0}</div>`);
            } else {
              showTooltip(ev, `<div class="tip-text"><strong>${d.data.name}</strong><br>Family: ${display_family_name(d.parent?.data?.name ?? "—")}<br>Count: ${d.value || 0}</div>`);
            }
          })
          .on("mouseleave", hideTooltip)
          .on("click", (ev,d) => {
            // defining click behavior per zoom state:
            // - root: zooming into the family (or to “other actions” container if child belongs there)
            // - “other actions” focus: zooming into the selected subfamily
            // - any other family focus: opening the details panel for the object type
            if (current === root){
              const oc = d.ancestors().find(a => norm(a.data?.name) === other_combined_key);
              zoom_to(oc ? oc : d.parent);
            } else if (is_other_combined(node)){
              zoom_to(d);
            } else {
              const name = d?.data?.name || "";
              const famKey = d?.parent?.data?.name || "";
              if (name) showDetails(name, famKey);
              ev.stopPropagation?.();
            }
          });

        // positioning foreignObject labels and toggling visibility (off at root for clarity)
        cells.select("foreignObject.leaf-fo")
          .attr("x", d => sx(d.x0)+6).attr("y", d => sy(d.y0)+6)
          .attr("width", d => Math.max(0, sx(d.x1)-sx(d.x0)-12))
          .attr("height",d => Math.max(0, sy(d.y1)-sy(d.y0)-12))
          .style("display", (node === root) ? "none" : "block");

        // writing text labels only when there’s sufficient room; showing counts in family focus
        cells.select("div.leaf-html").each(function(d){
          if (node === root){ this.textContent = ""; return; }
          const w = sx(d.x1)-sx(d.x0), h = sy(d.y1)-sy(d.y0);
          if (w < 70 || h < 30){ this.textContent = ""; return; }
          const base = is_other_combined(node) ? display_family_name(d.data.name) : d.data.name;
          this.textContent = `${base} (${d.value || 0})`;
        });
      } // draw

      // wiring the back button to return to the root view
      back_button.on("click", () => zoom_to(root));

      // zooming the “camera” scales to the selected node and redrawing after transition
      function zoom_to(node){
        if (!node || node === current) return;
        current = node;
        const at_root = (node === root);
        if (at_root) hideDetails();

        // updating header chip + back button visibility per zoom state
        if (at_root){
          back_button.classed("is-ghost", true);
          zoom_card.classed("is-ghost", false).select(".zoom-title").text("All Actions");
        } else {
          back_button.classed("is-ghost", false);
          const famRaw = node?.data?.name || "";
          zoom_card.classed("is-ghost", false).select(".zoom-title").text(display_family_name(famRaw) || famRaw);
        }

        // changing the scale domains to the node’s bounding box (camera zoom)
        sx.domain([node.x0, node.x1]);
        sy.domain([node.y0, node.y1]);

        // animating rectangles to new positions/sizes, then calling draw() to refresh labels/handlers
        const t = svg.transition().duration(550);
        g.selectAll("g.cell").transition(t).select("rect")
          .attr("x", d => sx(d.x0)).attr("y", d => sy(d.y0))
          .attr("width", d => Math.max(0, sx(d.x1)-sx(d.x0)))
          .attr("height",d => Math.max(0, sy(d.y1)-sy(d.y0)));

        // toggling root-level family chips
        if (at_root){ g_labels.attr("display", null).style("opacity",1); }
        else { g_labels.attr("display","none").style("opacity",0); }

        t.on("end", () => draw(node));
      }

      // enabling click-to-zoom pointer affordance and drawing initial root view
      svg.style("cursor","pointer");
      draw(root);

    }); // end Promise.all
  });

})();