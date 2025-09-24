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
  resultsDiv.innerHTML = "";

  if (!data.analysis?.positive) {
    resultsDiv.textContent = "No analysis available.";
    return;
  }

  // render the highlights view (w buttons)
  renderHighlights(data.analysis.positive, data.analysis.ingredients_table, resultsDiv);
}

// helper: format category names
function formatCategoryName(name) {
  // capitalize first word, lowercase others, fix special cases
  return name
    .split("_")
    .map((word, i) => i === 0 ? word[0].toUpperCase() + word.slice(1) : word.toLowerCase())
    .join(" ")
    .replace(/\bUv protecting\b/i, "UV Protecting")
    .replace(/\bAnti aging\b/i, "Anti-aging")
    .replace(/\bWhitening\b/i, "Brightening")
    .replace(/\bAcne fighting\b/i, "Acne-fighting");
}

// highlights view
function renderHighlights(positive, ingredientsTable, resultsDiv) {
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

    // click → show category detail
    button.addEventListener("click", () => renderCategoryDetail(formattedName, categoryData, ingredientsTable, resultsDiv, positive));

    resultsDiv.appendChild(button);
  });
}

// category detail view
function renderCategoryDetail(categoryName, categoryData, ingredientsTable, resultsDiv, positive) {
  resultsDiv.innerHTML = "";

  // wrapper that the CSS targets
  const wrapper = document.createElement("div");
  wrapper.className = "detail-view";

  // back button → re-render highlights
  wrapper.appendChild(createBackButton(() => renderHighlights(positive, ingredientsTable, resultsDiv)));

  const title = document.createElement("h3");
  title.textContent = categoryName;
  wrapper.appendChild(title);

  const subtitle = document.createElement("p");
  subtitle.textContent = `${categoryData.count} ingredient(s) found`;
  wrapper.appendChild(subtitle);

  // render ingredient list
  wrapper.appendChild(createIngredientList(categoryData.list, ingredientsTable));

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

// helper: create ingred. list
function createIngredientList(list, ingredientsTable) {
  const ul = document.createElement("ul");
  list.forEach(ing => {
    const ingData = ingredientsTable.find(obj => obj.title === ing.title);
    const li = document.createElement("li");
    li.innerHTML = `${ingData?.title || ing.title} ${ingData?.ewg ? `(EWG: ${ingData.ewg.decision})` : ""}`;
    ul.appendChild(li);
  });
  return ul;
}

// preprocess ingredients using regex
function modifyInput(text) {
  return text
    .replace(/^[\s\S]*?\n/g, "")    // remove any leading lines
    .replace(/\([^)]*\)/g, "")      // remove text in parentheses
    .replace(/•/g, ",")             // replace bullets with commas
    .replace(/\d+%/g, "")           // remove percentages
    .replace(/,(\s*,)*|\s+,/g, ",") // fix extra commas
    .replace(/;/g, "");             // remove semicolons
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

  // fallback: search all divs, p, span containing "ingredients"
  const allDivs = Array.from(document.querySelectorAll("div, p, span"));
  for (const div of allDivs) {
    if (div.innerText?.match(/ingredients/i)) return div.innerText.trim();
  }

  return null;
}
