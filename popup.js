let lastAnalysisData = null; // store results so we can reuse without reloading

// event listener for analyze button
document.getElementById("analyzeBtn").addEventListener("click", analyzeIngredients);

// main analysis func
async function analyzeIngredients() {
  const statusEl = document.getElementById("status");
  statusEl.textContent = "Scraping ingredients...";

  // get current active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // inject scraping function into page
  chrome.scripting.executeScript(
    { target: { tabId: tab.id }, function: scrapeIngredientsFromPage },
    async (results) => {
      const rawIngredients = results?.[0]?.result;
      if (!rawIngredients) return statusEl.textContent = "No ingredients found.";

      // preprocess ingredients
      const ingredients = modifyInput(rawIngredients);
      statusEl.textContent = "Analyzing...";

      try {
        // send ingredients to API
        const response = await fetch("https://api.cosmily.com/api/v1/analyze/ingredient_list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ingredients })
        });
        const data = await response.json();

        if (data.errors) {
          console.error("API returned errors:", data.errors);
          return statusEl.textContent = "Error analyzing ingredients.";
        }

        lastAnalysisData = data; // store globally

        // hide analyze page, show results page
        document.getElementById("analyzePage").style.display = "none";
        document.getElementById("resultsPage").style.display = "block";

        showResults(data);

      } catch (err) {
        console.error(err);
        statusEl.textContent = "Error analyzing ingredients.";
      }
    }
  );
}

// show results
function showResults(data) {
  const resultsDiv = document.getElementById("results");
  const statusEl = document.getElementById("status");

  const positive = data.analysis?.positive;
  const harmful = data.analysis?.harmful;
  const ingredientsTable = data.analysis?.ingredients_table;

  const hasPositive = positive && Object.values(positive).some(cat => cat.count > 0);

  if (!hasPositive) {
    document.getElementById("resultsPage").style.display = "none";
    document.getElementById("analyzePage").style.display = "block";

    resultsDiv.innerHTML = "";
    statusEl.textContent = "No analysis available for this ingredient list.";
    return;
  }

  statusEl.textContent = "";
  resultsDiv.innerHTML = "";

  const attributeAnalysis = gatherAttributes(data.analysis);

  // skin type sentence
  showSkinTypeSentence(attributeAnalysis.skinTypes);

  // render Highlights
  renderHighlights(positive, ingredientsTable, resultsDiv, harmful);

  // render Free From
  renderFreeFrom(harmful, ingredientsTable, resultsDiv);
}

// free from view
function renderFreeFrom(harmful, ingredientsTable, resultsDiv) {
  if (!harmful || !resultsDiv) return;

  const section = document.createElement("div");
  section.className = "freefrom-section";

  const title = document.createElement("h3");
  title.textContent = "Free From";
  title.className = "freefrom-title";
  section.appendChild(title);

  // mark safe vs contains, then sort
  const sortedEntries = Object.entries(harmful).sort((a, b) => {
    const aSafe = (a[1].count || 0) === 0 ? 0 : 1;
    const bSafe = (b[1].count || 0) === 0 ? 0 : 1;
    return aSafe - bSafe; // safe (0) before contains (1)
  });

  sortedEntries.forEach(([attributeName, attrData]) => {
    const count = attrData.count || 0;

    // format attribute name
    let formatted = attributeName.split("_")[0];
    formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    if (attributeName === "peg") formatted = "PEG";
    if (attributeName === "fungal_acne_feeding") formatted = "Fungal Acne Feeding";

    const pill = document.createElement("button");
    pill.className = "freefrom-pill";
    pill.textContent = count === 0 ? formatted : `${formatted} (${count})`;

    if (count === 0) {
      // safe: green
      pill.style.backgroundColor = "#e6f2d9";
      pill.style.border = "2px solid rgb(170, 194, 151)";
    } else {
      // contains: red
      pill.style.backgroundColor = "#ff96a4ff";
      pill.style.border = "2px solid #f96d7fff";
    }

    pill.addEventListener("click", () =>
      renderFreeFromDetail(
        attributeName,
        attrData,
        ingredientsTable,
        resultsDiv,
        harmful,
        lastAnalysisData.analysis.positive
      )
    );

    section.appendChild(pill);
  });

  resultsDiv.appendChild(section);
}

// // helper: show skin type sentence with letter-by-letter fade-in
function showSkinTypeSentence(skinTypes) {
  const sentenceEl = document.getElementById("skinTypeSentence");
  if (!sentenceEl) return;

  sentenceEl.innerHTML = ""; // clear previous

  let textBefore = "This product is for ";
  let textAfter = " skin.";

  // decide which skin types apply
  const types = [];
  if (skinTypes.dry) types.push("dry");
  if (skinTypes.oily) types.push("oily");
  if (skinTypes.sensitive) types.push("sensitive");

  let skinTextSpans = [];
  if (types.length === 0) {
    skinTextSpans.push({ text: "all skin types", color: "#000" });
  } else if (types.includes("dry") && types.includes("oily")) {
    // dry + oily case
    skinTextSpans.push({ text: "combination", color: "#6a0dad" });

    if (types.includes("sensitive")) {
      skinTextSpans.push({ text: "sensitive", color: "#ff69b4" });
    }
  } else {
    types.forEach(type => {
      let color = "#000";
      if (type === "dry") color = "#d2691e";
      else if (type === "oily") color = "#1e90ff";
      else if (type === "sensitive") color = "#ff69b4";
      skinTextSpans.push({ text: type, color });
    });
  }

  // add text before
  for (let char of textBefore) {
    const span = document.createElement("span");
    span.textContent = char;
    span.className = "fade-letter";
    sentenceEl.appendChild(span);
  }

  skinTextSpans.forEach((obj, idx) => {
    for (let char of obj.text) {
      const span = document.createElement("span");
      span.textContent = char;
      span.className = "fade-letter";
      span.style.color = obj.color;
      sentenceEl.appendChild(span);
    }
    if (idx < skinTextSpans.length - 1) {
      // add " and " between types
      const span = document.createElement("span");
      span.textContent = " and ";
      span.className = "fade-letter";
      sentenceEl.appendChild(span);
    }
  });

  // add text after
  for (let char of textAfter) {
    const span = document.createElement("span");
    span.textContent = char;
    span.className = "fade-letter";
    sentenceEl.appendChild(span);
  }

  // fade-in animation
  const letters = sentenceEl.querySelectorAll(".fade-letter");
  letters.forEach((letter, i) => {
    setTimeout(() => {
      letter.style.opacity = 1;
    }, i * 50); // 50ms per letter
  });
}


// helper: format category names
function formatCategoryName(name) {
  return name
    .split("_")
    .map((word, i) => i === 0 ? word[0].toUpperCase() + word.slice(1) : word.toLowerCase())
    .join(" ")
    .replace(/\bUv protecting\b/i, "UV Protecting")
    .replace(/\bAnti aging\b/i, "Anti-aging")
    .replace(/\bHealing\b/i, "Barrier Healing")
    .replace(/\bWhitening\b/i, "Brightening")
    .replace(/\bAcne fighting\b/i, "Acne-fighting");
}

// highlights view
function renderHighlights(positive, ingredientsTable, resultsDiv, harmful) {
  resultsDiv.innerHTML = "";

  const title = document.createElement("h3");
  title.textContent = "Highlights";
  title.className = "highlights-title";
  resultsDiv.appendChild(title);

  // create a button for each category with count
  Object.entries(positive).forEach(([categoryName, categoryData]) => {
    if (categoryData.count <= 0) return;

    const formattedName = formatCategoryName(categoryName);
    const button = document.createElement("button");
    button.className = "category-button";
    button.textContent = `${formattedName} (${categoryData.count})`;

    button.addEventListener("click", () => renderCategoryDetail(formattedName, categoryData, ingredientsTable, resultsDiv, positive, harmful));

    resultsDiv.appendChild(button);
  });
}

// category detail view w color coding
function renderCategoryDetail(categoryName, categoryData, ingredientsTable, resultsDiv, positive, harmful) {
  resultsDiv.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "detail-view";

  wrapper.appendChild(
    createBackButton(() => {
      renderHighlights(positive, ingredientsTable, resultsDiv, harmful);
      renderFreeFrom(harmful, ingredientsTable, resultsDiv);
    })
  );

  const title = document.createElement("h3");
  title.textContent = categoryName;
  wrapper.appendChild(title);

  const subtitle = document.createElement("p");
  subtitle.textContent = `${categoryData.count} ingredient(s) found`;
  wrapper.appendChild(subtitle);

  const buttonContainer = document.createElement("div");
  buttonContainer.className = "ingredient-buttons-container";
  wrapper.appendChild(buttonContainer);

  categoryData.list.forEach(ing => {
    const ingData = ingredientsTable.find(obj => obj.title === ing.title);

    const btn = document.createElement("button");
    btn.className = "ingredient-button";
    btn.textContent = ingData?.title || ing.title;

    const rawDecision = ingData?.ewg?.decision?.toLowerCase() || "unknown";
    // shorten long decision strings
    let decision = rawDecision;
    if (decision === "moderate hazard - high hazard") {
      decision = "moderate - high hazard";
    } else if (decision === "safe - moderate hazard") {
      decision = "safe - moderate hazard";
    }

    if (decision === "safe"){
      btn.style.borderColor = "rgb(170, 194, 151)";
      btn.style.backgroundColor = "#e6f2d9";
    }
    else if (decision === "safe - moderate hazard"){
      btn.style.borderColor = "#fea4b6ff";
      btn.style.backgroundColor = "#fdccd5ff";
    }
    else if (decision === "moderate - high hazard"){
      btn.style.borderColor = "#f96d7fff";
      btn.style.backgroundColor = "#ff96a4ff";
    }
    else btn.style.backgroundColor = "#ccc"; // for unknown

    const tooltip = document.createElement("span");
    tooltip.className = "tooltip";
    tooltip.textContent = `EWG: ${decision}`;
    btn.appendChild(tooltip);

    buttonContainer.appendChild(btn);
  });

  resultsDiv.appendChild(wrapper);
}

// free from detail view for harmful ingredients
function renderFreeFromDetail(attributeName, attrData, ingredientsTable, resultsDiv, harmful, positive) {
  resultsDiv.innerHTML = "";

  const wrapper = document.createElement("div");
  wrapper.className = "detail-view";

  // back button -> back to Free From + Highlights
  wrapper.appendChild(
    createBackButton(() => {
      renderHighlights(positive, ingredientsTable, resultsDiv, harmful);
      renderFreeFrom(harmful, ingredientsTable, resultsDiv);
    })
  );

  // format attribute name
  let formatted = attributeName.split("_")[0];
  formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  if (attributeName === "peg") formatted = "PEG";
  if (attributeName === "fungal_acne_feeding") formatted = "Fungal Acne Feeding";

  const title = document.createElement("h3");
  title.textContent = formatted;
  wrapper.appendChild(title);

  const subtitle = document.createElement("p");
  subtitle.textContent = `${attrData.count} ingredient(s) found`;
  wrapper.appendChild(subtitle);

  const buttonContainer = document.createElement("div");
  buttonContainer.className = "ingredient-buttons-container";
  wrapper.appendChild(buttonContainer);

  attrData.list.forEach(ing => {
    const ingData = ingredientsTable.find(obj => obj.title === ing.title);

    const btn = document.createElement("button");
    btn.className = "ingredient-button";
    btn.textContent = ingData?.title || ing.title;

    const rawDecision = ingData?.ewg?.decision?.toLowerCase() || "unknown";
    let decision = rawDecision;
    if (decision === "moderate hazard - high hazard") {
      decision = "moderate - high hazard";
    } else if (decision === "safe - moderate hazard") {
      decision = "safe - moderate hazard";
    }

    if (decision === "safe"){
      btn.style.borderColor = "rgb(170, 194, 151)";
      btn.style.backgroundColor = "#e6f2d9";
    }
    else if (decision === "safe - moderate hazard"){
      btn.style.borderColor = "#fea4b6ff";
      btn.style.backgroundColor = "#fdccd5ff";
    }
    else if (decision === "moderate - high hazard"){
      btn.style.borderColor = "#f96d7fff";
      btn.style.backgroundColor = "#ff96a4ff";
    }
    else btn.style.backgroundColor = "#ccc"; // unknown

    const tooltip = document.createElement("span");
    tooltip.className = "tooltip";
    tooltip.textContent = `EWG: ${decision}`;
    btn.appendChild(tooltip);

    buttonContainer.appendChild(btn);
  });

  resultsDiv.appendChild(wrapper);
}


// helper: create back button
function createBackButton(onClick) {
  const backBtn = document.createElement("button");
  backBtn.textContent = "← Back";
  backBtn.className = "back-button";
  backBtn.addEventListener("click", onClick);
  return backBtn;
}

// helper: preprocess ingredients
function modifyInput(text) {
  return text
    .replace(/^[\s\S]*?\n/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/•/g, ",")
    .replace(/\d+%/g, "")
    .replace(/,(\s*,)*|\s+,/g, ",")
    .replace(/;/g, "");
}

// scraping function injected into page 
function scrapeIngredientsFromPage() {
  const selectors = [
    "div[data-comp='ProductDetailIngredients']",
    ".product-ingredients",
    "#ingredients",
    ".ProductDetail__ingredients"
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el.innerText.trim();
  }

  const allDivs = Array.from(document.querySelectorAll("div, p, span"));
  for (const div of allDivs) {
    if (div.innerText?.match(/ingredients/i)) return div.innerText.trim();
  }

  return null;
}

// gather attributes including skin type
function gatherAttributes(ingredientsList) {
  const ingredientsTable = ingredientsList.ingredients_table;
  // const positive = ingredientsList.positive;
  // const harmful = ingredientsList.harmful;

  let skinTypes = { dry: 0, oily: 0, sensitive: 0 };
  ingredientsTable.forEach(obj => {
    const props = obj.boolean_properties;
    if (!props) return;
    if (props.good_for_dry_skin) skinTypes.dry++;
    if (props.bad_for_dry_skin) skinTypes.dry--;
    if (props.good_for_oily_skin) skinTypes.oily++;
    if (props.bad_for_oily_skin) skinTypes.oily--;
    if (props.good_for_sensitive_skin) skinTypes.sensitive++;
    if (props.bad_for_sensitive_skin) skinTypes.sensitive--;
  });

  // convert counts to boolean
  for (let type in skinTypes) skinTypes[type] = skinTypes[type] >= 0;

  return { skinTypes };
}

